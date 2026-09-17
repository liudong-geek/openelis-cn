package org.openelisglobal.report.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import org.apache.commons.codec.digest.DigestUtils;
import org.openelisglobal.common.service.AuditableBaseObjectServiceImpl;
import org.openelisglobal.report.PatientReportReleaseSummary;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.form.ReportDocumentSummary;
import org.openelisglobal.report.form.ReportPdfContent;
import org.openelisglobal.report.form.ReportReleaseDetail;
import org.openelisglobal.report.form.ReportReleaseScope;
import org.openelisglobal.report.service.PatientReportReleaseService;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Document-scoped release preparation. Issuance is enabled only after
 * frozen-content signing is implemented.
 */
@Service
public class PatientReportReleaseServiceImpl extends AuditableBaseObjectServiceImpl<PatientReportRelease, Long>
        implements PatientReportReleaseService {
    private final ObjectMapper mapper = new ObjectMapper();

    @Autowired
    private PatientReportReleaseDAO patientReportReleaseDAO;
    @Autowired
    private ReportDocumentService documents;
    @Autowired
    private SystemUserService systemUserService;
    @Autowired
    private ReportFrozenContentService frozenContent;
    @Autowired
    private ChinesePatientReportPdfRenderer renderer;
    @Autowired
    private org.openelisglobal.esig.service.ElectronicSignatureService signatures;

    public PatientReportReleaseServiceImpl() {
        super(PatientReportRelease.class);
    }

    @Override
    protected PatientReportReleaseDAO getBaseObjectDAO() {
        return patientReportReleaseDAO;
    }

    @Override
    @Transactional
    public PatientReportReleaseSummary createDocumentDraft(String documentId, String amendmentReason, String actor) {
        ReportDocumentSummary document = documents.lockCurrent(documentId, actor);
        PatientReportRelease existing = patientReportReleaseDAO.getDraft(documentId);
        if (existing != null) {
            requireOwnership(existing, document);
            documents.authorizePersistedScope(documentId, requireScope(existing).authorizationScope(), actor, false);
            if (!Objects.equals(normalize(existing.getAmendmentReason()), normalize(amendmentReason))) {
                throw new IllegalStateException("Existing draft has another amendment reason");
            }
            return toSummary(existing);
        }
        PatientReportRelease prior = patientReportReleaseDAO.getLatestReleased(documentId);
        if (prior != null) {
            requireOwnership(prior, document);
            documents.authorizePersistedScope(documentId, requireScope(prior).authorizationScope(), actor, false);
            if (normalize(amendmentReason) == null)
                throw new IllegalArgumentException("Amendment reason is required");
        }
        PatientReportRelease release = new PatientReportRelease();
        release.setPatientId(document.patientId());
        release.setReportDocumentId(document.id());
        release.setReportNumber(document.reportNumber());
        persistScope(release, ReportReleaseScope.from(document));
        release.setReportVersion(patientReportReleaseDAO.getNextVersion(documentId));
        release.setStatus(PatientReportReleaseStatus.DRAFT);
        release.setCreatedBy(actor);
        release.setCreatedAt(Timestamp.from(Instant.now()));
        release.setSupersedesReleaseId(prior == null ? null : prior.getId());
        release.setAmendmentReason(normalize(amendmentReason));
        release.setPrintCount(0);
        release.setSysUserId(actor);
        insert(release);
        return toSummary(release);
    }

    @Override
    @Transactional
    public org.openelisglobal.report.form.ReportFrozenResponse freeze(String documentId, Long releaseId, String actor) {
        AuthorizedRelease authorized = authorizeRelease(documentId, releaseId, actor, true);
        PatientReportRelease release = authorized.release();
        requireDraft(release);
        var snapshot = frozenContent.capture(release, authorized.scope(), actor);
        String json = frozenContent.encode(snapshot);
        release.setFrozenContentJson(json);
        release.setFrozenContentSha256(DigestUtils.sha256Hex(json));
        release.setFrozenAt(Timestamp.from(Instant.now()));
        release.setSysUserId(actor);
        update(release);
        return frozenResponse(release, snapshot);
    }

    @Override
    @Transactional(readOnly = true)
    public org.openelisglobal.report.form.ReportFrozenResponse getSnapshot(String documentId, Long releaseId,
            String actor) {
        AuthorizedRelease authorized = authorizeRelease(documentId, releaseId, actor, false);
        return frozenResponse(authorized.release(), requireFrozen(authorized));
    }

    @Override
    @Transactional(readOnly = true)
    public byte[] previewFrozen(String documentId, Long releaseId, String actor) {
        AuthorizedRelease authorized = authorizeRelease(documentId, releaseId, actor, false);
        requireDraft(authorized.release());
        var snapshot = requireFrozen(authorized);
        return renderer.renderFrozenPreview(snapshot.report(), snapshot.template(), snapshot.reportNumber(),
                snapshot.reportVersion(), snapshot.amendmentReason(),
                authorized.release().getFrozenAt().toLocalDateTime());
    }

    @Override
    @Transactional
    public PatientReportReleaseSummary issueDocument(String documentId, Long releaseId, String expectedHash,
            String password, String actor, String clientIp, String userAgent) {
        AuthorizedRelease authorized = authorizeRelease(documentId, releaseId, actor, true);
        PatientReportRelease release = authorized.release();
        requireDraft(release);
        var snapshot = requireFrozen(authorized);
        if (!hashMatches(expectedHash, release.getFrozenContentSha256()))
            throw new IllegalStateException("Report preview changed; reopen the frozen snapshot before signing");
        String current = frozenContent.encode(frozenContent.capture(release, authorized.scope(), actor));
        if (!hashMatches(release.getFrozenContentSha256(), DigestUtils.sha256Hex(current)))
            throw new IllegalStateException("Report source changed after preview; freeze and review again");
        PatientReportRelease prior = patientReportReleaseDAO.getLatestReleased(documentId);
        if (!Objects.equals(release.getSupersedesReleaseId(), prior == null ? null : prior.getId()))
            throw new IllegalStateException("Report predecessor changed after draft creation");
        if (prior != null) {
            requireScope(prior);
            if (!Objects.equals(prior.getReportDocumentId(), documentId))
                throw new IllegalStateException("Report predecessor ownership mismatch");
        }
        var signature = sign(release, actor, password,
                org.openelisglobal.esig.valueholder.SignatureMeaning.VALIDATED_AND_RELEASED, null, clientIp, userAgent,
                release.getFrozenContentJson());
        // Content-bound signing and PDF persistence share this transaction. Any later
        // rendering/storage/state failure rolls back the signature as well.
        byte[] pdf = renderer.renderFrozenOfficial(snapshot.report(),
                new org.openelisglobal.report.PatientReportPdfMetadata(snapshot.reportNumber(),
                        snapshot.reportVersion(), signature.getSignerNamePrinted(),
                        signature.getSignedAt().toLocalDateTime(), snapshot.amendmentReason()),
                snapshot.template());
        if (pdf == null || pdf.length == 0)
            throw new IllegalStateException("Report original generation failed");
        documents.authorizePersistedScope(documentId, authorized.scope().authorizationScope(), actor, false);
        if (prior != null && prior.getStatus() == PatientReportReleaseStatus.ISSUED) {
            prior.setStatus(PatientReportReleaseStatus.SUPERSEDED);
            prior.setSysUserId(actor);
            update(prior);
            // The database permits only one ISSUED row per document. Force the
            // predecessor transition before the new release can acquire that slot.
            patientReportReleaseDAO.flush();
        }
        release.setStatus(PatientReportReleaseStatus.ISSUED);
        release.setIssuedBy(actor);
        release.setIssuerNamePrinted(signature.getSignerNamePrinted());
        release.setIssuedAt(signature.getSignedAt());
        release.setIssuedSignatureId(signature.getId());
        release.setPdfContent(pdf);
        release.setPdfSha256(DigestUtils.sha256Hex(pdf));
        release.setAccessionNumbers(snapshot.report().getRows().stream()
                .map(row -> row.getDataMap().get("accessionNumber")).filter(Objects::nonNull).map(Object::toString)
                .distinct().collect(java.util.stream.Collectors.joining(",")));
        release.setSysUserId(actor);
        update(release);
        return toSummary(release);
    }

    @Override
    @Transactional
    public PatientReportReleaseSummary voidDocument(String documentId, Long releaseId, String expectedPdfSha256,
            String password, String reason, String actor, String clientIp, String userAgent) {
        AuthorizedRelease authorized = authorizeRelease(documentId, releaseId, actor, true);
        PatientReportRelease release = authorized.release();
        requireFrozen(authorized);
        requireOriginal(release);
        if (!isCurrent(release) || !hashMatches(expectedPdfSha256, release.getPdfSha256()))
            throw new IllegalStateException("Only the unchanged current report can be voided");
        String normalizedReason = normalize(reason);
        if (normalizedReason == null)
            throw new IllegalArgumentException("Void reason is required");
        String content;
        try {
            content = mapper.writeValueAsString(
                    new VoidContent("VOID_REPORT", documentId, releaseId, release.getReportVersion(),
                            release.getFrozenContentSha256(), release.getPdfSha256(), normalizedReason));
        } catch (com.fasterxml.jackson.core.JsonProcessingException error) {
            throw new IllegalStateException("Cannot create report void signature content", error);
        }
        var signature = sign(release, actor, password, org.openelisglobal.esig.valueholder.SignatureMeaning.REJECTED,
                normalizedReason, clientIp, userAgent, content);
        documents.authorizePersistedScope(documentId, authorized.scope().authorizationScope(), actor, false);
        release.setStatus(PatientReportReleaseStatus.VOIDED);
        release.setVoidedBy(actor);
        release.setVoidedAt(signature.getSignedAt());
        release.setVoidSignatureId(signature.getId());
        release.setVoidReason(normalizedReason);
        release.setSysUserId(actor);
        update(release);
        return toSummary(release);
    }

    private record VoidContent(String action, String documentId, Long releaseId, int reportVersion,
            String snapshotSha256, String pdfSha256, String reason) {
    }

    private org.openelisglobal.esig.valueholder.ElectronicSignature sign(PatientReportRelease release, String actor,
            String password, org.openelisglobal.esig.valueholder.SignatureMeaning meaning, String reason,
            String clientIp, String userAgent, String content) {
        if (password == null || password.isBlank())
            throw new IllegalArgumentException("Signing password is required");
        var user = systemUserService.getUserById(actor);
        if (user == null || !Objects.equals(actor, user.getId()) || !"Y".equals(user.getIsActive())
                || user.getLoginName() == null || user.getLoginName().isBlank())
            throw new org.springframework.security.access.AccessDeniedException("Report signer is unavailable");
        var signature = signatures.executeSignatureForSnapshot(user.getLoginName(), password, meaning, "REPORT",
                release.getId(), reason, clientIp, userAgent, content);
        if (signature == null || signature.getId() == null || signature.getSignerId() == null
                || !actor.equals(signature.getSignerId().toString()) || !"REPORT".equals(signature.getRecordType())
                || !Objects.equals(release.getId(), signature.getRecordId())
                || signature.getSignatureMeaning() != meaning || !Objects.equals(content, signature.getSignedContent())
                || !hashMatches(signature.getContentSha256(), DigestUtils.sha256Hex(content))
                || signature.getSignedAt() == null || signature.getSignerNamePrinted() == null
                || signature.getSignerNamePrinted().isBlank())
            throw new IllegalStateException("Report content signature binding failed");
        return signature;
    }

    private org.openelisglobal.report.form.ReportFrozenSnapshot requireFrozen(AuthorizedRelease authorized) {
        var snapshot = frozenContent.require(authorized.release());
        if (!snapshot.scope().equals(authorized.scope()))
            throw new IllegalStateException("Frozen report membership mismatch");
        return snapshot;
    }

    private void requireDraft(PatientReportRelease release) {
        if (release.getStatus() != PatientReportReleaseStatus.DRAFT)
            throw new IllegalStateException("Only a draft report can be frozen or signed");
    }

    private org.openelisglobal.report.form.ReportFrozenResponse frozenResponse(PatientReportRelease release,
            org.openelisglobal.report.form.ReportFrozenSnapshot snapshot) {
        return new org.openelisglobal.report.form.ReportFrozenResponse(release.getId(), release.getReportDocumentId(),
                release.getFrozenContentSha256(), release.getFrozenAt(), snapshot);
    }

    @Override
    @Transactional
    public PatientReportReleaseSummary issue(Long releaseId, Long signatureId, String actor) {
        // Never fall back to the historical patient-wide live query or accept an
        // unbound legacy signature.
        authorizeRelease(null, releaseId, actor, false);
        throw new IllegalStateException("REPORT_FROZEN_SIGNATURE_REQUIRED");
    }

    @Override
    @Transactional
    public PatientReportReleaseSummary voidRelease(Long releaseId, Long signatureId, String actor) {
        authorizeRelease(null, releaseId, actor, false);
        throw new IllegalStateException("REPORT_FROZEN_SIGNATURE_REQUIRED");
    }

    @Override
    @Transactional(readOnly = true)
    public List<PatientReportReleaseSummary> getByDocument(String documentId, String actor) {
        documents.get(documentId, actor);
        List<PatientReportRelease> releases = patientReportReleaseDAO.getByDocument(documentId);
        for (PatientReportRelease release : releases) {
            ReportReleaseScope scope = requireScope(release);
            if (!Objects.equals(documentId, scope.documentId()))
                throw new IllegalStateException("Report history ownership mismatch");
            ReportDocumentSummary document = documents.authorizePersistedScope(documentId, scope.authorizationScope(),
                    actor, false);
            requireOwnership(release, document);
        }
        return releases.stream().map(this::toSummary).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ReportReleaseDetail getDetail(String documentId, Long releaseId, String actor) {
        AuthorizedRelease authorized = authorizeRelease(documentId, releaseId, actor, false);
        boolean available = originalAvailable(authorized.release());
        return new ReportReleaseDetail(toSummary(authorized.release()), authorized.scope(), available,
                available && isCurrent(authorized.release()));
    }

    @Override
    @Transactional(readOnly = true)
    public ReportPdfContent getOriginalPdf(String documentId, Long releaseId, String actor) {
        AuthorizedRelease authorized = authorizeRelease(documentId, releaseId, actor, false);
        requireOriginal(authorized.release());
        return original(authorized.release(), isCurrent(authorized.release()));
    }

    @Override
    @Transactional
    public ReportPdfContent recordPrint(String documentId, Long releaseId, String actor) {
        AuthorizedRelease authorized = authorizeRelease(documentId, releaseId, actor, true);
        PatientReportRelease release = authorized.release();
        requireOriginal(release);
        if (!isCurrent(release))
            throw new IllegalStateException("Only the current issued report can be printed");
        int count = release.getPrintCount() == null ? 0 : release.getPrintCount();
        if (count < 0 || count == Integer.MAX_VALUE)
            throw new IllegalStateException("Invalid report print audit counter");
        release.setPrintCount(count + 1);
        release.setLastPrintedBy(actor);
        release.setLastPrintedAt(Timestamp.from(Instant.now()));
        release.setSysUserId(actor);
        ReportPdfContent original = original(release, true);
        update(release);
        return original;
    }

    private AuthorizedRelease authorizeRelease(String expectedDocumentId, Long releaseId, String actor, boolean lock) {
        if (releaseId == null || releaseId <= 0)
            throw new IllegalArgumentException("Invalid report release identifier");
        PatientReportRelease release = get(releaseId);
        ReportReleaseScope scope = requireScope(release);
        requireExpectedDocument(expectedDocumentId, scope);
        ReportDocumentSummary document = documents.authorizePersistedScope(scope.documentId(),
                scope.authorizationScope(), actor, false);
        requireOwnership(release, document);
        if (lock) {
            // Reject unauthorized requests before taking a write lock; recheck after any
            // wait.
            document = documents.authorizePersistedScope(scope.documentId(), scope.authorizationScope(), actor, true);
            requireOwnership(release, document);
            // Every mutating release path uses parent-document then release lock order.
            release = patientReportReleaseDAO.lockRelease(releaseId);
            if (release == null)
                throw new IllegalStateException("Report release no longer exists");
            ReportReleaseScope refreshed = requireScope(release);
            if (!scope.equals(refreshed))
                throw new IllegalStateException("Report membership changed while acquiring the lock");
            document = documents.authorizePersistedScope(refreshed.documentId(), refreshed.authorizationScope(), actor,
                    false);
            requireOwnership(release, document);
            scope = refreshed;
        }
        return new AuthorizedRelease(release, scope);
    }

    private void requireExpectedDocument(String documentId, ReportReleaseScope scope) {
        if (documentId != null && !Objects.equals(documentId, scope.documentId())) {
            throw new IllegalArgumentException("Report release does not belong to the requested document");
        }
    }

    private void persistScope(PatientReportRelease release, ReportReleaseScope scope) {
        try {
            String json = mapper.writeValueAsString(scope);
            release.setMemberScopeJson(json);
            release.setMemberScopeSha256(DigestUtils.sha256Hex(json));
        } catch (Exception e) {
            throw new IllegalStateException("Cannot freeze report membership", e);
        }
    }

    private ReportReleaseScope requireScope(PatientReportRelease release) {
        if (release.getReportDocumentId() == null || release.getMemberScopeJson() == null
                || release.getMemberScopeSha256() == null) {
            throw new IllegalStateException("LEGACY_REPORT_MEMBERSHIP_UNVERIFIED");
        }
        if (!hashMatches(release.getMemberScopeSha256(), DigestUtils.sha256Hex(release.getMemberScopeJson()))) {
            throw new IllegalStateException("Report membership integrity check failed");
        }
        ReportReleaseScope scope;
        try {
            scope = mapper.readValue(release.getMemberScopeJson(), ReportReleaseScope.class);
        } catch (Exception e) {
            throw new IllegalStateException("Invalid persisted report membership", e);
        }
        if (!Objects.equals(scope.documentId(), release.getReportDocumentId())
                || !Objects.equals(scope.patientId(), release.getPatientId())) {
            throw new IllegalStateException("Report membership ownership mismatch");
        }
        return scope;
    }

    private boolean originalAvailable(PatientReportRelease release) {
        return (release.getStatus() == PatientReportReleaseStatus.ISSUED
                || release.getStatus() == PatientReportReleaseStatus.SUPERSEDED
                || release.getStatus() == PatientReportReleaseStatus.VOIDED) && release.getPdfContent() != null
                && release.getPdfContent().length > 0
                && hashMatches(release.getPdfSha256(), DigestUtils.sha256Hex(release.getPdfContent()));
    }

    private void requireOriginal(PatientReportRelease release) {
        if (!originalAvailable(release))
            throw new IllegalStateException("Report original is unavailable or failed integrity verification");
    }

    private boolean isCurrent(PatientReportRelease release) {
        if (release.getStatus() != PatientReportReleaseStatus.ISSUED)
            return false;
        PatientReportRelease current = patientReportReleaseDAO.getLatestIssued(release.getReportDocumentId());
        return current != null && Objects.equals(current.getId(), release.getId())
                && Objects.equals(current.getReportDocumentId(), release.getReportDocumentId())
                && current.getStatus() == PatientReportReleaseStatus.ISSUED;
    }

    private boolean hashMatches(String persisted, String calculated) {
        return persisted != null && persisted.matches("[a-f0-9]{64}") && MessageDigest
                .isEqual(persisted.getBytes(StandardCharsets.US_ASCII), calculated.getBytes(StandardCharsets.US_ASCII));
    }

    private ReportPdfContent original(PatientReportRelease release, boolean current) {
        return new ReportPdfContent(release.getId(), release.getReportDocumentId(), release.getStatus(),
                release.getPdfSha256(), current, release.getPdfContent());
    }

    private record AuthorizedRelease(PatientReportRelease release, ReportReleaseScope scope) {
    }

    private void requireOwnership(PatientReportRelease release, ReportDocumentSummary document) {
        if (!Objects.equals(release.getReportDocumentId(), document.id())
                || !Objects.equals(release.getPatientId(), document.patientId())
                || !Objects.equals(release.getReportNumber(), document.reportNumber())) {
            throw new IllegalStateException("Report release ownership does not match its document");
        }
    }

    private PatientReportReleaseSummary toSummary(PatientReportRelease release) {
        String name = release.getIssuerNamePrinted() == null ? "" : release.getIssuerNamePrinted();
        if (name.isBlank() && release.getIssuedBy() != null) {
            var user = systemUserService.getUserById(release.getIssuedBy());
            if (user != null)
                name = java.util.stream.Stream.of(user.getLastName(), user.getFirstName()).filter(Objects::nonNull)
                        .map(String::trim).filter(value -> !value.isEmpty())
                        .collect(java.util.stream.Collectors.joining(" "));
        }
        return new PatientReportReleaseSummary(release.getId(), release.getPatientId(), release.getReportDocumentId(),
                release.getReportNumber(), release.getReportVersion(), release.getStatus(), release.getCreatedAt(),
                name, release.getIssuedAt(), release.getSupersedesReleaseId(), release.getAmendmentReason(),
                release.getVoidedAt(), release.getVoidReason(), release.getPdfSha256(), release.getAccessionNumbers(),
                release.getPrintCount(), release.getLastPrintedAt());
    }

    private String normalize(String text) {
        if (text == null || text.isBlank())
            return null;
        if (text.length() > 2000)
            throw new IllegalArgumentException("Amendment reason is too long");
        return text.strip();
    }
}
