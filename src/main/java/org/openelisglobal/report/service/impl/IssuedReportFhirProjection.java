package org.openelisglobal.report.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.util.Date;
import java.util.Objects;
import org.apache.commons.codec.digest.DigestUtils;
import org.hl7.fhir.r4.model.Attachment;
import org.hl7.fhir.r4.model.CodeableConcept;
import org.hl7.fhir.r4.model.DateTimeType;
import org.hl7.fhir.r4.model.DiagnosticReport;
import org.hl7.fhir.r4.model.DiagnosticReport.DiagnosticReportStatus;
import org.hl7.fhir.r4.model.Identifier;
import org.hl7.fhir.r4.model.IntegerType;
import org.hl7.fhir.r4.model.Reference;
import org.hl7.fhir.r4.model.StringType;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.report.form.ReportFrozenSnapshot;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.springframework.stereotype.Service;

/**
 * Pure projection of an authorized formal release. Never reads current clinical
 * entities or dictionaries. The caller must authorize the complete report
 * scope, verify the persisted signature and current release, and control
 * delivery. Schema 1 has no result-to-display-row or terminology binding, so
 * this projection publishes the signed PDF original rather than reconstructing
 * Observations.
 */
@Service
public class IssuedReportFhirProjection {
    private final FhirConfig configuration;
    private final ObjectMapper mapper = new ObjectMapper();

    public IssuedReportFhirProjection(FhirConfig configuration) {
        this.configuration = Objects.requireNonNull(configuration);
    }

    public DiagnosticReport project(PatientReportRelease release, ReportFrozenSnapshot snapshot) {
        requireEvidence(release, snapshot, PatientReportReleaseStatus.ISSUED);
        String system = namespace();
        DiagnosticReport report = identity(release, snapshot, system);
        report.setStatus(release.getSupersedesReleaseId() == null ? DiagnosticReportStatus.FINAL
                : DiagnosticReportStatus.AMENDED);
        report.addPresentedForm(new Attachment().setContentType("application/pdf")
                .setTitle(release.getReportNumber() + " V" + release.getReportVersion())
                .setCreation(new Date(release.getIssuedAt().getTime())).setData(release.getPdfContent().clone()));
        // Attachment.hash has a different digest contract. The persisted SHA-256
        // evidence is carried under explicit source-system identifier namespaces.
        return report;
    }

    public DiagnosticReport withdrawal(PatientReportRelease release, ReportFrozenSnapshot snapshot) {
        requireEvidence(release, snapshot, PatientReportReleaseStatus.VOIDED);
        if (!positive(release.getVoidSignatureId()) || !canonicalId(release.getVoidedBy())
                || release.getVoidedAt() == null || blank(release.getVoidReason()))
            throw new IllegalStateException("REPORT_WITHDRAWAL_EVIDENCE_REQUIRED");
        String system = namespace();
        DiagnosticReport report = identity(release, snapshot, system);
        report.setStatus(DiagnosticReportStatus.ENTEREDINERROR);
        report.setConclusion("报告已作废：" + release.getVoidReason());
        report.addExtension(system + "/StructureDefinition/report-void-signature-id",
                new StringType(release.getVoidSignatureId().toString()));
        report.addExtension(system + "/StructureDefinition/report-voided-at",
                new DateTimeType(new Date(release.getVoidedAt().getTime())));
        report.addExtension(system + "/StructureDefinition/report-voided-by",
                new Reference().setIdentifier(identifier(system + "/system-user-local-id", release.getVoidedBy())));
        // Same release resource identity invalidates its prior representation. The
        // withdrawal carries neither original PDF bytes nor result resources.
        return report;
    }

    private DiagnosticReport identity(PatientReportRelease release, ReportFrozenSnapshot snapshot, String system) {
        DiagnosticReport report = new DiagnosticReport();
        report.setId("cn-report-" + release.getId());
        report.addIdentifier(identifier(system + "/report-document", release.getReportDocumentId()));
        report.addIdentifier(identifier(system + "/report-number", release.getReportNumber()));
        report.addIdentifier(
                identifier(system + "/report-version", release.getReportNumber() + ":V" + release.getReportVersion()));
        report.addIdentifier(identifier(system + "/report-release", release.getId().toString()));
        report.addIdentifier(identifier(system + "/report-frozen-sha256", release.getFrozenContentSha256()));
        report.addIdentifier(identifier(system + "/report-pdf-sha256", release.getPdfSha256()));
        report.setCode(new CodeableConcept().setText(snapshot.template().title()));
        report.setSubject(
                new Reference().setIdentifier(identifier(system + "/patient-local-id", release.getPatientId())));
        report.setIssued(new Date(release.getIssuedAt().getTime()));
        report.addResultsInterpreter(
                new Reference().setIdentifier(identifier(system + "/system-user-local-id", release.getIssuedBy()))
                        .setDisplay(release.getIssuerNamePrinted()));
        report.addExtension(system + "/StructureDefinition/report-version",
                new IntegerType(release.getReportVersion()));
        report.addExtension(system + "/StructureDefinition/report-issued-signature-id",
                new StringType(release.getIssuedSignatureId().toString()));
        if (release.getSupersedesReleaseId() != null) {
            report.addExtension(system + "/StructureDefinition/report-supersedes",
                    new Reference("DiagnosticReport/cn-report-" + release.getSupersedesReleaseId()));
            report.addExtension(system + "/StructureDefinition/report-amendment-reason",
                    new StringType(release.getAmendmentReason()));
        }
        return report;
    }

    private void requireEvidence(PatientReportRelease release, ReportFrozenSnapshot snapshot,
            PatientReportReleaseStatus expectedStatus) {
        if (release == null || snapshot == null || release.getStatus() != expectedStatus || !positive(release.getId())
                || !canonicalId(release.getReportDocumentId()) || !canonicalId(release.getPatientId())
                || blank(release.getReportNumber()) || release.getReportVersion() == null
                || release.getReportVersion() < 1 || !positive(release.getIssuedSignatureId())
                || !canonicalId(release.getIssuedBy()) || blank(release.getIssuerNamePrinted())
                || release.getIssuedAt() == null || release.getFrozenAt() == null)
            throw new IllegalStateException("REPORT_ISSUED_EVIDENCE_REQUIRED");
        if (!Objects.equals(snapshot.scope().documentId(), release.getReportDocumentId())
                || !Objects.equals(snapshot.scope().patientId(), release.getPatientId())
                || !Objects.equals(snapshot.reportNumber(), release.getReportNumber())
                || snapshot.reportVersion() != release.getReportVersion()
                || !Objects.equals(snapshot.amendmentReason(), release.getAmendmentReason()))
            throw new IllegalStateException("REPORT_FROZEN_OWNERSHIP_MISMATCH");
        if (release.getSupersedesReleaseId() != null && (!positive(release.getSupersedesReleaseId())
                || Objects.equals(release.getSupersedesReleaseId(), release.getId()) || release.getReportVersion() <= 1
                || blank(release.getAmendmentReason())))
            throw new IllegalStateException("REPORT_AMENDMENT_EVIDENCE_REQUIRED");
        if (release.getPdfContent() == null || release.getPdfContent().length == 0
                || !hashMatches(release.getPdfSha256(), DigestUtils.sha256Hex(release.getPdfContent())))
            throw new IllegalStateException("REPORT_ORIGINAL_INTEGRITY_FAILURE");
        requireJson(release.getMemberScopeJson(), release.getMemberScopeSha256(), snapshot.scope());
        requireJson(release.getFrozenContentJson(), release.getFrozenContentSha256(), snapshot);
    }

    private void requireJson(String json, String hash, Object suppliedContent) {
        if (json == null || !hashMatches(hash, DigestUtils.sha256Hex(json)))
            throw new IllegalStateException("REPORT_FROZEN_INTEGRITY_FAILURE");
        try {
            if (!mapper.valueToTree(suppliedContent).equals(mapper.readTree(json)))
                throw new IllegalStateException("REPORT_FROZEN_PROJECTION_MISMATCH");
        } catch (JsonProcessingException | IllegalArgumentException error) {
            throw new IllegalStateException("REPORT_FROZEN_CONTENT_INVALID", error);
        }
    }

    private String namespace() {
        String configured = configuration.getOeFhirSystem();
        try {
            if (blank(configured))
                throw new IllegalArgumentException("Missing source system");
            URI uri = URI.create(configured);
            if (!uri.isAbsolute() || uri.getQuery() != null || uri.getFragment() != null)
                throw new IllegalArgumentException("Source system is not an absolute namespace");
            return configured.replaceAll("/+$", "");
        } catch (IllegalArgumentException error) {
            throw new IllegalStateException("REPORT_FHIR_SOURCE_SYSTEM_REQUIRED", error);
        }
    }

    private Identifier identifier(String system, String value) {
        return new Identifier().setSystem(system).setValue(value);
    }

    private boolean hashMatches(String actual, String expected) {
        return actual != null && actual.matches("[a-f0-9]{64}") && actual.equals(expected);
    }

    private boolean positive(Long value) {
        return value != null && value > 0;
    }

    private boolean canonicalId(String value) {
        return value != null && value.matches("[1-9][0-9]*");
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
