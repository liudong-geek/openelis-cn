package org.openelisglobal.report.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Consumer;
import org.apache.commons.codec.digest.DigestUtils;
import org.hl7.fhir.r4.model.DiagnosticReport;
import org.openelisglobal.esig.service.ElectronicSignatureService;
import org.openelisglobal.esig.valueholder.SignatureMeaning;
import org.openelisglobal.integration.outbox.HisResultEventType;
import org.openelisglobal.integration.outbox.HisResultOutbox;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.dao.ReportDocumentDAO;
import org.openelisglobal.report.form.ReportFrozenSnapshot;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The only outgoing clinical projection. Scheduled transport is trusted
 * internal work; interactive reads additionally require the existing complete
 * report scope authorization. Neither path reconstructs results from live
 * entities.
 */
@Service
public class ReportPublicationService {
    private final PatientReportReleaseDAO releases;
    private final ReportDocumentDAO documents;
    private final ReportDocumentService authorization;
    private final ReportFrozenContentService frozen;
    private final IssuedReportFhirProjection projection;
    private final ElectronicSignatureService signatures;
    private final ObjectMapper mapper = new ObjectMapper();

    public ReportPublicationService(PatientReportReleaseDAO releases, ReportDocumentDAO documents,
            ReportDocumentService authorization, ReportFrozenContentService frozen,
            IssuedReportFhirProjection projection, ElectronicSignatureService signatures) {
        this.releases = releases;
        this.documents = documents;
        this.authorization = authorization;
        this.frozen = frozen;
        this.projection = projection;
        this.signatures = signatures;
    }

    /**
     * IDs only: candidate pages never load original bytes or grant send
     * authorization.
     */
    @Transactional(readOnly = true)
    public List<String> publicationIds(Instant through, Long afterId, int limit) {
        if (through == null || afterId == null || afterId < 0 || limit < 1)
            throw new IllegalArgumentException("Invalid publication page");
        return releases.getPublicationIds(through, afterId, Math.min(limit, 100)).stream().map(id -> "cn-report-" + id)
                .toList();
    }

    /**
     * Keep the same document -> release lock order as issuance/voiding. The sender
     * consumes a freshly verified immutable projection while those locks remain
     * held. A failed network operation propagates; no delivery is inferred.
     */
    @Transactional
    public boolean withCurrentPublication(String resourceId, Consumer<DiagnosticReport> sender) {
        Long id = releaseId(resourceId);
        PatientReportRelease observed = releases.get(id).orElse(null);
        if (observed == null || observed.getReportDocumentId() == null)
            return false;
        PatientReportRelease locked = lockPublication(observed);
        if (!isPublishable(locked))
            return false;
        sender.accept(projectVerified(locked));
        return true;
    }

    @Transactional
    public DiagnosticReport read(String resourceId, String actor) {
        PatientReportRelease release;
        if (resourceId != null && resourceId.startsWith("cn-report-")) {
            release = releases.get(releaseId(resourceId)).orElse(null);
        } else {
            UUID uuid = UUID.fromString(resourceId);
            var matches = releases.getPublishedByAnalysisUuid(uuid);
            if (matches.size() > 1)
                throw new IllegalStateException("Ambiguous published report identity");
            release = matches.isEmpty() ? null : matches.get(0);
        }
        if (release == null || !isPublishable(release))
            return null;
        var snapshot = frozen.require(release);
        authorization.authorizePersistedScope(release.getReportDocumentId(), snapshot.scope().authorizationScope(),
                actor, false);
        PatientReportRelease locked = lockPublication(release);
        if (!isPublishable(locked))
            return null;
        var current = frozen.require(locked);
        authorization.authorizePersistedScope(locked.getReportDocumentId(), current.scope().authorizationScope(), actor,
                false);
        return projectVerified(locked);
    }

    /**
     * Explicit identity search, with per-document authorization and a bounded
     * response.
     */
    @Transactional
    public List<DiagnosticReport> search(String reportNumber, String patientId, String actor, int limit) {
        if ((reportNumber == null || reportNumber.isBlank()) && (patientId == null || patientId.isBlank()))
            throw new IllegalArgumentException("Search requires a formal report number or local patient identifier");
        if (actor == null || actor.isBlank())
            throw new AccessDeniedException("Report identity is required");
        List<DiagnosticReport> result = new ArrayList<>();
        for (var release : releases.findPublished(reportNumber, patientId, limit)) {
            if ((reportNumber != null && !reportNumber.equals(release.getReportNumber()))
                    || (patientId != null && !patientId.equals(release.getPatientId())) || !isPublishable(release))
                continue;
            var snapshot = frozen.require(release);
            try {
                authorization.authorizePersistedScope(release.getReportDocumentId(),
                        snapshot.scope().authorizationScope(), actor, false);
            } catch (AccessDeniedException denied) {
                continue;
            }
            PatientReportRelease locked = lockPublication(release);
            if (!isPublishable(locked))
                continue;
            var current = frozen.require(locked);
            authorization.authorizePersistedScope(locked.getReportDocumentId(), current.scope().authorizationScope(),
                    actor, false);
            result.add(projectVerified(locked));
            if (result.size() >= Math.max(1, Math.min(limit, 100)))
                break;
        }
        return List.copyOf(result);
    }

    /**
     * Read-only while the outbox row is locked; never invert the release/outbox
     * lock order.
     */
    @Transactional(readOnly = true)
    public void validateOutboxRetry(HisResultOutbox message) {
        if (message == null || !"LIS-CN".equals(message.getSourceSystem()))
            throw new IllegalStateException("REPORT_PUBLICATION_TASK_REQUIRED");
        Long id;
        try {
            id = Long.valueOf(message.getBusinessId());
        } catch (RuntimeException error) {
            throw new IllegalStateException("REPORT_PUBLICATION_TASK_INVALID", error);
        }
        PatientReportRelease release = releases.get(id).orElse(null);
        if (release == null || !isPublishable(release))
            throw new IllegalStateException("REPORT_NO_LONGER_PUBLISHABLE");
        HisResultEventType expectedEvent = release.getStatus() == PatientReportReleaseStatus.VOIDED
                ? HisResultEventType.WITHDRAWAL
                : release.getSupersedesReleaseId() == null ? HisResultEventType.REPORT : HisResultEventType.AMENDMENT;
        String prefix = expectedEvent == HisResultEventType.WITHDRAWAL ? "WITHDRAWAL" : "REPORT";
        String key = "LIS-CN:" + prefix + ":" + id + ":V" + release.getReportVersion();
        if (!id.toString().equals(message.getBusinessId()) || message.getEventType() != expectedEvent
                || !key.equals(message.getIdempotencyKey()) || message.getPayload() == null
                || !DigestUtils.sha256Hex(message.getPayload()).equals(message.getPayloadHash()))
            throw new IllegalStateException("REPORT_PUBLICATION_TASK_MISMATCH");
        try {
            var expected = mapper.createObjectNode().put("schemaVersion", 1).put("releaseId", id)
                    .put("documentId", release.getReportDocumentId()).put("reportNumber", release.getReportNumber())
                    .put("reportVersion", release.getReportVersion())
                    .put("snapshotSha256", release.getFrozenContentSha256()).put("pdfSha256", release.getPdfSha256());
            if (release.getSupersedesReleaseId() == null)
                expected.putNull("supersedesReleaseId");
            else
                expected.put("supersedesReleaseId", release.getSupersedesReleaseId());
            if (!mapper.readTree(expected.toString()).equals(mapper.readTree(message.getPayload())))
                throw new IllegalStateException("REPORT_PUBLICATION_TASK_MISMATCH");
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("REPORT_PUBLICATION_TASK_INVALID", error);
        }
        projectVerified(release);
    }

    private PatientReportRelease lockPublication(PatientReportRelease observed) {
        var document = documents.getWithMembers(observed.getReportDocumentId(), true);
        PatientReportRelease locked = releases.lockRelease(observed.getId());
        if (document == null || locked == null || !Objects.equals(observed.getId(), locked.getId())
                || !Objects.equals(document.getId(), locked.getReportDocumentId())
                || !Objects.equals(document.getPatientId(), locked.getPatientId()))
            throw new IllegalStateException("REPORT_PUBLICATION_OWNERSHIP_MISMATCH");
        return locked;
    }

    private boolean isPublishable(PatientReportRelease release) {
        if (release.getStatus() == PatientReportReleaseStatus.VOIDED)
            return true;
        if (release.getStatus() != PatientReportReleaseStatus.ISSUED || release.getReportDocumentId() == null)
            return false;
        var latest = releases.getLatestReleased(release.getReportDocumentId());
        return latest != null && Objects.equals(latest.getId(), release.getId())
                && latest.getStatus() == PatientReportReleaseStatus.ISSUED;
    }

    private DiagnosticReport projectVerified(PatientReportRelease release) {
        if (!isPublishable(release))
            throw new IllegalStateException("REPORT_NO_LONGER_PUBLISHABLE");
        ReportFrozenSnapshot snapshot = frozen.require(release);
        verifySignature(release, false);
        if (release.getStatus() == PatientReportReleaseStatus.VOIDED) {
            verifySignature(release, true);
            return projection.withdrawal(release, snapshot);
        }
        return projection.project(release, snapshot);
    }

    private void verifySignature(PatientReportRelease release, boolean withdrawal) {
        Long id = withdrawal ? release.getVoidSignatureId() : release.getIssuedSignatureId();
        if (id == null)
            throw new IllegalStateException("REPORT_PUBLICATION_SIGNATURE_REQUIRED");
        var signature = signatures.get(id);
        String actor = withdrawal ? release.getVoidedBy() : release.getIssuedBy();
        var time = withdrawal ? release.getVoidedAt() : release.getIssuedAt();
        var meaning = withdrawal ? SignatureMeaning.REJECTED : SignatureMeaning.VALIDATED_AND_RELEASED;
        if (signature == null || !Objects.equals(id, signature.getId()) || signature.getSignerId() == null
                || !Objects.equals(actor, signature.getSignerId().toString())
                || !"REPORT".equals(signature.getRecordType())
                || !Objects.equals(release.getId(), signature.getRecordId())
                || signature.getSignatureMeaning() != meaning || !Objects.equals(time, signature.getSignedAt())
                || signature.getSignedContent() == null
                || !DigestUtils.sha256Hex(signature.getSignedContent()).equals(signature.getContentSha256()))
            throw new IllegalStateException("REPORT_PUBLICATION_SIGNATURE_MISMATCH");
        if (!withdrawal) {
            if (!Objects.equals(signature.getSignedContent(), release.getFrozenContentJson())
                    || !Objects.equals(signature.getSignerNamePrinted(), release.getIssuerNamePrinted()))
                throw new IllegalStateException("REPORT_PUBLICATION_SIGNATURE_MISMATCH");
        } else {
            try {
                var content = mapper.createObjectNode().put("action", "VOID_REPORT")
                        .put("documentId", release.getReportDocumentId()).put("releaseId", release.getId())
                        .put("reportVersion", release.getReportVersion())
                        .put("snapshotSha256", release.getFrozenContentSha256())
                        .put("pdfSha256", release.getPdfSha256()).put("reason", release.getVoidReason());
                if (!mapper.readTree(content.toString()).equals(mapper.readTree(signature.getSignedContent())))
                    throw new IllegalStateException("REPORT_PUBLICATION_SIGNATURE_MISMATCH");
            } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
                throw new IllegalStateException("REPORT_PUBLICATION_SIGNATURE_MISMATCH", error);
            }
        }
    }

    private Long releaseId(String resourceId) {
        if (resourceId == null || !resourceId.matches("cn-report-[1-9][0-9]*"))
            throw new IllegalArgumentException("Expected a formal report release identifier");
        return Long.valueOf(resourceId.substring("cn-report-".length()));
    }
}
