package org.openelisglobal.report.service.impl;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.apache.commons.codec.digest.DigestUtils;
import org.hl7.fhir.r4.model.DiagnosticReport;
import org.hl7.fhir.r4.model.DiagnosticReport.DiagnosticReportStatus;
import org.hl7.fhir.r4.model.IntegerType;
import org.hl7.fhir.r4.model.Reference;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.report.ReportColumn;
import org.openelisglobal.report.ReportRow;
import org.openelisglobal.report.ReportingData;
import org.openelisglobal.report.form.ReportFrozenSnapshot;
import org.openelisglobal.report.form.ReportFrozenTemplate;
import org.openelisglobal.report.form.ReportReleaseScope;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;

public class IssuedReportFhirProjectionTest {
    private static final String SYSTEM = "https://lis.example.test";
    private final ObjectMapper mapper = new ObjectMapper();
    private FhirConfig configuration;
    private IssuedReportFhirProjection projection;
    private PatientReportRelease release;
    private ReportFrozenSnapshot snapshot;

    @Before
    public void setup() throws Exception {
        configuration = mock(FhirConfig.class);
        when(configuration.getOeFhirSystem()).thenReturn(SYSTEM);
        projection = new IssuedReportFhirProjection(configuration);
        release = new PatientReportRelease();
        release.setId(10L);
        release.setReportDocumentId("201");
        release.setPatientId("101");
        release.setReportNumber("BG-SIM");
        release.setReportVersion(1);
        release.setStatus(PatientReportReleaseStatus.ISSUED);
        release.setIssuedSignatureId(90L);
        release.setIssuedBy("7");
        release.setIssuerNamePrinted("模拟签发人");
        release.setFrozenAt(timestamp("2026-10-18T00:00:00Z"));
        release.setIssuedAt(timestamp("2026-10-18T01:00:00Z"));
        release.setPdfContent("%PDF-SIM-ORIGINAL-张三-5.5".getBytes(StandardCharsets.UTF_8));
        release.setPdfSha256(DigestUtils.sha256Hex(release.getPdfContent()));
        snapshot = snapshot(1, null);
        storeSnapshot();
    }

    @Test
    public void projectsExactOriginalAndBusinessIdentityWithoutLiveResultResources() {
        DiagnosticReport report = projection.project(release, snapshot);
        assertEquals("cn-report-10", report.getIdElement().getIdPart());
        assertEquals(DiagnosticReportStatus.FINAL, report.getStatus());
        assertEquals(release.getIssuedAt().toInstant(), report.getIssued().toInstant());
        assertEquals("201", identifier(report, "/report-document"));
        assertEquals("BG-SIM", identifier(report, "/report-number"));
        assertEquals("BG-SIM:V1", identifier(report, "/report-version"));
        assertEquals("10", identifier(report, "/report-release"));
        assertEquals(release.getFrozenContentSha256(), identifier(report, "/report-frozen-sha256"));
        assertEquals(release.getPdfSha256(), identifier(report, "/report-pdf-sha256"));
        assertEquals(SYSTEM + "/patient-local-id", report.getSubject().getIdentifier().getSystem());
        assertEquals("101", report.getSubject().getIdentifier().getValue());
        assertFalse(report.getSubject().hasReference());
        assertEquals("application/pdf", report.getPresentedFormFirstRep().getContentType());
        assertArrayEquals(release.getPdfContent(), report.getPresentedFormFirstRep().getData());
        assertFalse(report.getPresentedFormFirstRep().hasHash());
        assertFalse(report.getPresentedFormFirstRep().hasUrl());
        assertFalse(report.hasResult());
        assertFalse(report.hasContained());
        assertFalse(report.hasBasedOn());
        assertFalse(report.getMeta().hasVersionId());
        assertEquals("模拟签发人", report.getResultsInterpreterFirstRep().getDisplay());
        assertEquals(1,
                ((IntegerType) report.getExtensionByUrl(SYSTEM + "/StructureDefinition/report-version").getValue())
                        .getValue().intValue());
        verify(configuration).getOeFhirSystem();
        verifyNoMoreInteractions(configuration);
    }

    @Test
    public void rejectsEveryNonIssuedStateForNormalPublication() {
        for (PatientReportReleaseStatus state : PatientReportReleaseStatus.values()) {
            if (state != PatientReportReleaseStatus.ISSUED) {
                release.setStatus(state);
                assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
            }
        }
    }

    @Test
    public void rejectsMissingIssuanceSignatureBeforeProjecting() {
        release.setIssuedSignatureId(null);
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
    }

    @Test
    public void rejectsMissingSignerIdentityOrTime() {
        release.setIssuerNamePrinted(" ");
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
        release.setIssuerNamePrinted("模拟签发人");
        release.setIssuedBy(null);
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
        release.setIssuedBy("7");
        release.setIssuedAt(null);
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
    }

    @Test
    public void rejectsEmptyOrTamperedPdfRatherThanRebuildingIt() {
        release.setPdfContent("other PDF".getBytes(StandardCharsets.UTF_8));
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
        release.setPdfContent(new byte[0]);
        release.setPdfSha256(DigestUtils.sha256Hex(new byte[0]));
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
    }

    @Test
    public void rejectsTamperedPersistedFrozenContent() {
        release.setFrozenContentJson(release.getFrozenContentJson().replace("5.5", "7.7"));
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
    }

    @Test
    public void rejectsSameIdentitySnapshotWithChangedClinicalContent() {
        snapshot.report().getRows().get(0).getDataMap().put("resultValue", "9.9");
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
    }

    @Test
    public void rejectsMembershipOrOwnershipMismatch() throws Exception {
        release.setMemberScopeSha256("0".repeat(64));
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
        storeSnapshot();
        release.setPatientId("999");
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
        release.setPatientId("101");
        release.setReportVersion(2);
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
    }

    @Test
    public void repeatedProjectionHasStableIdentityAndCopiesOriginalBytes() {
        DiagnosticReport first = projection.project(release, snapshot);
        DiagnosticReport repeated = projection.project(release, snapshot);
        assertTrue(first.equalsDeep(repeated));
        first.getPresentedFormFirstRep().getData()[0] = 0;
        assertEquals('%', release.getPdfContent()[0]);
        assertEquals('%', repeated.getPresentedFormFirstRep().getData()[0]);
        release.setPdfContent("replaced live bytes".getBytes(StandardCharsets.UTF_8));
        assertEquals('%', repeated.getPresentedFormFirstRep().getData()[0]);
    }

    @Test
    public void amendmentCarriesNewVersionAndExplicitPredecessorWithoutChangingResourceVersion() throws Exception {
        release.setId(11L);
        release.setReportVersion(2);
        release.setSupersedesReleaseId(10L);
        release.setAmendmentReason("更正原结果");
        snapshot = snapshot(2, "更正原结果");
        storeSnapshot();
        DiagnosticReport amended = projection.project(release, snapshot);
        assertEquals("cn-report-11", amended.getIdElement().getIdPart());
        assertEquals(DiagnosticReportStatus.AMENDED, amended.getStatus());
        assertEquals("BG-SIM:V2", identifier(amended, "/report-version"));
        assertEquals("DiagnosticReport/cn-report-10",
                ((Reference) amended.getExtensionByUrl(SYSTEM + "/StructureDefinition/report-supersedes").getValue())
                        .getReference());
        assertFalse(amended.getMeta().hasVersionId());
    }

    @Test
    public void rejectsInvalidAmendmentEvidence() {
        release.setSupersedesReleaseId(10L);
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
        release.setSupersedesReleaseId(9L);
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
    }

    @Test
    public void withdrawalUsesSameIdentityAndVoidEvidenceWithoutResendingPdfOrResults() {
        DiagnosticReport issued = projection.project(release, snapshot);
        voidRelease();
        DiagnosticReport withdrawn = projection.withdrawal(release, snapshot);
        assertEquals(issued.getIdElement().getIdPart(), withdrawn.getIdElement().getIdPart());
        assertEquals(DiagnosticReportStatus.ENTEREDINERROR, withdrawn.getStatus());
        assertEquals(release.getIssuedAt().toInstant(), withdrawn.getIssued().toInstant());
        assertFalse(withdrawn.hasPresentedForm());
        assertFalse(withdrawn.hasResult());
        assertFalse(withdrawn.hasContained());
        assertEquals("101", withdrawn.getSubject().getIdentifier().getValue());
        assertEquals("报告已作废：模拟作废原因", withdrawn.getConclusion());
        assertNotNull(withdrawn.getExtensionByUrl(SYSTEM + "/StructureDefinition/report-void-signature-id"));
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
    }

    @Test
    public void withdrawalRequiresVoidedStateReasonAndBoundSignatureMetadata() {
        assertThrows(IllegalStateException.class, () -> projection.withdrawal(release, snapshot));
        voidRelease();
        release.setVoidSignatureId(null);
        assertThrows(IllegalStateException.class, () -> projection.withdrawal(release, snapshot));
        release.setVoidSignatureId(91L);
        release.setVoidReason(" ");
        assertThrows(IllegalStateException.class, () -> projection.withdrawal(release, snapshot));
        release.setVoidReason("原因");
        release.setVoidedAt(null);
        assertThrows(IllegalStateException.class, () -> projection.withdrawal(release, snapshot));
    }

    @Test
    public void rejectsNamespaceThatCannotIdentifyTheSource() {
        when(configuration.getOeFhirSystem()).thenReturn(" ");
        assertThrows(IllegalStateException.class, () -> projection.project(release, snapshot));
    }

    private void voidRelease() {
        release.setStatus(PatientReportReleaseStatus.VOIDED);
        release.setVoidSignatureId(91L);
        release.setVoidedBy("8");
        release.setVoidedAt(timestamp("2026-10-18T02:00:00Z"));
        release.setVoidReason("模拟作废原因");
    }

    private void storeSnapshot() throws Exception {
        release.setMemberScopeJson(mapper.writeValueAsString(snapshot.scope()));
        release.setMemberScopeSha256(DigestUtils.sha256Hex(release.getMemberScopeJson()));
        release.setFrozenContentJson(new ReportFrozenContentService().encode(snapshot));
        release.setFrozenContentSha256(DigestUtils.sha256Hex(release.getFrozenContentJson()));
    }

    private ReportFrozenSnapshot snapshot(int version, String reason) {
        var scope = new ReportReleaseScope(1, "201", "101", "301", "SIM-CHEM", "SIM-1", List.of("401"));
        var data = new ReportingData();
        data.setColumns(List.of(new ReportColumn("resultValue", "结果", "String")));
        var row = new ReportRow();
        row.addData("resultValue", "5.5");
        row.addData("patientName", "张三");
        row.addData("accessionNumber", "SIM-301");
        row.addCell("5.5");
        data.addRow(row);
        return new ReportFrozenSnapshot(1, scope, "BG-SIM", version, reason, ReportFrozenTemplate.current(), data,
                List.of(new ReportFrozenSnapshot.AnalysisEvidence("401", "2026-10-18T00:00:00Z", "finalized", "11",
                        "501", "50", List.of(new ReportFrozenSnapshot.ResultEvidence("601", "2026-10-18T00:00:00Z",
                                "5.5", "N", "Y", 1.0, 9.0, null, "701", null)))));
    }

    private String identifier(DiagnosticReport report, String suffix) {
        return report.getIdentifier().stream().filter(value -> (SYSTEM + suffix).equals(value.getSystem())).findFirst()
                .orElseThrow().getValue();
    }

    private Timestamp timestamp(String instant) {
        return Timestamp.from(Instant.parse(instant));
    }
}
