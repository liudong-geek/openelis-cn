package org.openelisglobal.report.service.impl;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import org.apache.commons.codec.digest.DigestUtils;
import org.hl7.fhir.r4.model.DiagnosticReport;
import org.hl7.fhir.r4.model.DiagnosticReport.DiagnosticReportStatus;
import org.junit.Before;
import org.junit.Test;
import org.mockito.InOrder;
import org.openelisglobal.dataexchange.fhir.FhirConfig;
import org.openelisglobal.esig.service.ElectronicSignatureService;
import org.openelisglobal.esig.valueholder.ElectronicSignature;
import org.openelisglobal.esig.valueholder.SignatureMeaning;
import org.openelisglobal.integration.outbox.HisResultEventType;
import org.openelisglobal.integration.outbox.HisResultOutbox;
import org.openelisglobal.report.ReportColumn;
import org.openelisglobal.report.ReportRow;
import org.openelisglobal.report.ReportingData;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.dao.ReportDocumentDAO;
import org.openelisglobal.report.form.ReportFrozenSnapshot;
import org.openelisglobal.report.form.ReportFrozenTemplate;
import org.openelisglobal.report.form.ReportReleaseScope;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.openelisglobal.report.valueholder.ReportDocument;
import org.springframework.security.access.AccessDeniedException;

public class ReportPublicationServiceTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private PatientReportReleaseDAO releases;
    private ReportDocumentDAO documents;
    private ReportDocumentService authorization;
    private ElectronicSignatureService signatures;
    private IssuedReportFhirProjection projection;
    private ReportPublicationService service;
    private PatientReportRelease release;
    private ElectronicSignature issuedSignature;
    private ReportFrozenSnapshot snapshot;
    private ReportDocument document;

    @Before
    public void setup() throws Exception {
        releases = mock(PatientReportReleaseDAO.class);
        documents = mock(ReportDocumentDAO.class);
        authorization = mock(ReportDocumentService.class);
        signatures = mock(ElectronicSignatureService.class);
        var config = mock(FhirConfig.class);
        when(config.getOeFhirSystem()).thenReturn("https://lis.example.test");
        projection = spy(new IssuedReportFhirProjection(config));
        service = new ReportPublicationService(releases, documents, authorization, new ReportFrozenContentService(),
                projection, signatures);
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
        var scope = new ReportReleaseScope(1, "201", "101", "301", "SIM-CHEM", "SIM-1", List.of("401"));
        var data = new ReportingData();
        data.setColumns(List.of(new ReportColumn("resultValue", "结果", "String")));
        var row = new ReportRow();
        row.addData("resultValue", "5.5");
        row.addData("patientName", "张三");
        row.addCell("5.5");
        data.addRow(row);
        snapshot = new ReportFrozenSnapshot(1, scope, "BG-SIM", 1, null, ReportFrozenTemplate.current(), data,
                List.of(new ReportFrozenSnapshot.AnalysisEvidence("401", "2026-10-18T00:00:00Z", "finalized", "11",
                        "501", "50", List.of(new ReportFrozenSnapshot.ResultEvidence("601", "2026-10-18T00:00:00Z",
                                "5.5", "N", "Y", 1.0, 9.0, null, "701", null)))));
        release.setMemberScopeJson(mapper.writeValueAsString(scope));
        release.setMemberScopeSha256(DigestUtils.sha256Hex(release.getMemberScopeJson()));
        release.setFrozenContentJson(new ReportFrozenContentService().encode(snapshot));
        release.setFrozenContentSha256(DigestUtils.sha256Hex(release.getFrozenContentJson()));
        issuedSignature = signature(90L, 7L, SignatureMeaning.VALIDATED_AND_RELEASED, release.getIssuedAt(),
                release.getFrozenContentJson());
        issuedSignature.setSignerNamePrinted(release.getIssuerNamePrinted());
        when(signatures.get(90L)).thenReturn(issuedSignature);
        when(releases.get(10L)).thenReturn(Optional.of(release));
        when(releases.lockRelease(10L)).thenReturn(release);
        when(releases.getLatestReleased("201")).thenReturn(release);
        document = new ReportDocument();
        document.setId("201");
        document.setPatientId("101");
        when(documents.getWithMembers("201", true)).thenReturn(document);
    }

    @Test
    public void readAuthorizesTheEntireFrozenScopeAndReturnsTheStoredOriginal() {
        DiagnosticReport report = service.read("cn-report-10", "8");
        assertArrayEquals(release.getPdfContent(), report.getPresentedFormFirstRep().getData());
        assertFalse(report.hasResult());
        InOrder order = inOrder(authorization, documents, releases, signatures, projection);
        order.verify(authorization).authorizePersistedScope("201", snapshot.scope().authorizationScope(), "8", false);
        order.verify(documents).getWithMembers("201", true);
        order.verify(releases).lockRelease(10L);
        order.verify(authorization).authorizePersistedScope("201", snapshot.scope().authorizationScope(), "8", false);
        order.verify(signatures).get(90L);
        order.verify(projection).project(eq(release), any(ReportFrozenSnapshot.class));
    }

    @Test
    public void onlyReviewedOrDraftAndSupersededReportsCannotBeReadAsPublished() {
        for (var state : List.of(PatientReportReleaseStatus.DRAFT, PatientReportReleaseStatus.SUPERSEDED)) {
            release.setStatus(state);
            assertNull(service.read("cn-report-10", "8"));
        }
        verifyZeroInteractions(projection, signatures, authorization);
    }

    @Test
    public void earlierIssuedVersionCannotPassTheCurrentVersionCheck() {
        PatientReportRelease current = new PatientReportRelease();
        current.setId(11L);
        current.setStatus(PatientReportReleaseStatus.ISSUED);
        when(releases.getLatestReleased("201")).thenReturn(current);
        assertNull(service.read("cn-report-10", "8"));
        verifyZeroInteractions(projection, signatures, authorization);
    }

    @Test
    public void deniedScopeNeverProjectsPdfOrReadsItsSignature() {
        when(authorization.authorizePersistedScope(eq("201"), any(), eq("9"), eq(false)))
                .thenThrow(new AccessDeniedException("different professional group"));
        assertThrows(AccessDeniedException.class, () -> service.read("cn-report-10", "9"));
        verifyZeroInteractions(projection, signatures);
    }

    @Test
    public void signedContentMustExactlyMatchTheFrozenVersionEvenWhenItsOwnHashIsValid() {
        issuedSignature.setSignedContent(release.getFrozenContentJson().replace("5.5", "7.7"));
        issuedSignature.setContentSha256(DigestUtils.sha256Hex(issuedSignature.getSignedContent()));
        assertThrows(IllegalStateException.class, () -> service.read("cn-report-10", "8"));
        verifyZeroInteractions(projection);
    }

    @Test
    public void signatureMustBindIdentityActorTimeMeaningAndPrintedName() throws Exception {
        List<Consumer<ElectronicSignature>> corruptions = List.of(value -> value.setId(91L),
                value -> value.setSignerId(99L), value -> value.setRecordId(11L),
                value -> value.setRecordType("RESULT"), value -> value.setSignatureMeaning(SignatureMeaning.REJECTED),
                value -> value.setSignedAt(timestamp("2026-10-18T03:00:00Z")),
                value -> value.setSignerNamePrinted("其他签发人"), value -> value.setContentSha256("0".repeat(64)));
        for (var corrupt : corruptions) {
            setup();
            corrupt.accept(issuedSignature);
            assertThrows(IllegalStateException.class, () -> service.read("cn-report-10", "8"));
            verifyZeroInteractions(projection);
        }
    }

    @Test
    public void missingSignatureRecordCannotCreatePublishedContent() {
        when(signatures.get(90L)).thenReturn(null);
        assertThrows(IllegalStateException.class, () -> service.read("cn-report-10", "8"));
        verifyZeroInteractions(projection);
    }

    @Test
    public void lookupByAnalysisUuidUsesTheFormalReleaseAndRejectsAmbiguity() {
        UUID uuid = UUID.fromString("f973677c-1aca-43ed-b40c-765b462fca01");
        when(releases.getPublishedByAnalysisUuid(uuid)).thenReturn(List.of(release));
        assertEquals("cn-report-10", service.read(uuid.toString(), "8").getIdElement().getIdPart());
        when(releases.getPublishedByAnalysisUuid(uuid)).thenReturn(List.of(release, release));
        assertThrows(IllegalStateException.class, () -> service.read(uuid.toString(), "8"));
    }

    @Test
    public void readRefreshesVoidedCandidateBeforeReturningAnyPdf() throws Exception {
        doAnswer(invocation -> {
            voidRelease();
            return release;
        }).when(releases).lockRelease(10L);
        var report = service.read("cn-report-10", "8");
        assertEquals(DiagnosticReportStatus.ENTEREDINERROR, report.getStatus());
        assertFalse(report.hasPresentedForm());
        verify(authorization, times(2)).authorizePersistedScope("201", snapshot.scope().authorizationScope(), "8",
                false);
    }

    @Test
    public void searchRefreshesCandidateAndDoesNotReturnSupersededPdf() {
        when(releases.findPublished("BG-SIM", null, 100)).thenReturn(List.of(release));
        doAnswer(invocation -> { release.setStatus(PatientReportReleaseStatus.SUPERSEDED); return release; })
                .when(releases).lockRelease(10L);
        assertTrue(service.search("BG-SIM", null, "8", 100).isEmpty());
        verifyZeroInteractions(signatures, projection);
    }

    @Test
    public void sendingLocksDocumentThenReleaseAndPassesFreshVerifiedOriginal() {
        @SuppressWarnings("unchecked")
        Consumer<DiagnosticReport> sender = mock(Consumer.class);
        assertTrue(service.withCurrentPublication("cn-report-10", sender));
        InOrder order = inOrder(documents, releases, signatures, sender);
        order.verify(releases).get(10L);
        order.verify(documents).getWithMembers("201", true);
        order.verify(releases).lockRelease(10L);
        order.verify(signatures).get(90L);
        order.verify(sender).accept(argThat(report -> report.getIdElement().getIdPart().equals("cn-report-10")
                && java.util.Arrays.equals(release.getPdfContent(), report.getPresentedFormFirstRep().getData())));
    }

    @Test
    public void releaseSupersededWhileWaitingForLockIsNotSent() {
        PatientReportRelease superseded = new PatientReportRelease();
        superseded.setId(10L);
        superseded.setPatientId("101");
        superseded.setReportDocumentId("201");
        superseded.setStatus(PatientReportReleaseStatus.SUPERSEDED);
        when(releases.lockRelease(10L)).thenReturn(superseded);
        @SuppressWarnings("unchecked")
        Consumer<DiagnosticReport> sender = mock(Consumer.class);
        assertFalse(service.withCurrentPublication("cn-report-10", sender));
        verifyZeroInteractions(sender, signatures, projection);
    }

    @Test
    public void lockedOwnershipMismatchIsRejectedBeforeSending() {
        document.setPatientId("999");
        @SuppressWarnings("unchecked")
        Consumer<DiagnosticReport> sender = mock(Consumer.class);
        assertThrows(IllegalStateException.class, () -> service.withCurrentPublication("cn-report-10", sender));
        verifyZeroInteractions(sender, signatures, projection);
    }

    @Test
    public void senderFailurePropagatesAndIsNeverReportedAsSuccessful() {
        RuntimeException unknown = new IllegalStateException("SIM delivery result unknown");
        assertSame(unknown, assertThrows(IllegalStateException.class,
                () -> service.withCurrentPublication("cn-report-10", report -> {
                    throw unknown;
                })));
    }

    @Test
    public void retryAcceptsOnlyTheExactSignedReleasePayloadAndEvent() throws Exception {
        HisResultOutbox message = message(HisResultEventType.REPORT);
        service.validateOutboxRetry(message);
        message.setEventType(HisResultEventType.AMENDMENT);
        assertThrows(IllegalStateException.class, () -> service.validateOutboxRetry(message));
        message.setEventType(HisResultEventType.REPORT);
        message.setPayload(message.getPayload().replace("BG-SIM", "BG-OTHER"));
        assertThrows(IllegalStateException.class, () -> service.validateOutboxRetry(message));
        message.setPayloadHash(DigestUtils.sha256Hex(message.getPayload()));
        assertThrows(IllegalStateException.class, () -> service.validateOutboxRetry(message));
    }

    @Test
    public void retryRejectsOldVersionsAndNonCanonicalBusinessIdentity() throws Exception {
        HisResultOutbox message = message(HisResultEventType.REPORT);
        message.setBusinessId("010");
        when(releases.get(10L)).thenReturn(Optional.of(release));
        assertThrows(IllegalStateException.class, () -> service.validateOutboxRetry(message));
        message.setBusinessId("10");
        release.setStatus(PatientReportReleaseStatus.SUPERSEDED);
        assertThrows(IllegalStateException.class, () -> service.validateOutboxRetry(message));
    }

    @Test
    public void withdrawalRequiresItsOwnBoundSignatureAndNeverResendsTheOriginal() throws Exception {
        voidRelease();
        DiagnosticReport report = service.read("cn-report-10", "8");
        assertEquals(DiagnosticReportStatus.ENTEREDINERROR, report.getStatus());
        assertFalse(report.hasPresentedForm());
        service.validateOutboxRetry(message(HisResultEventType.WITHDRAWAL));
        HisResultOutbox oldReport = message(HisResultEventType.REPORT);
        assertThrows(IllegalStateException.class, () -> service.validateOutboxRetry(oldReport));
        ElectronicSignature wrong = signatures.get(91L);
        wrong.setSignedContent(wrong.getSignedContent().replace("作废原因", "其他理由"));
        wrong.setContentSha256(DigestUtils.sha256Hex(wrong.getSignedContent()));
        assertThrows(IllegalStateException.class, () -> service.read("cn-report-10", "8"));
    }

    @Test
    public void searchFiltersUnauthorizedDocumentsAndRequiresExplicitIdentity() {
        when(releases.findPublished("BG-SIM", "101", 50)).thenReturn(List.of(release));
        when(authorization.authorizePersistedScope(eq("201"), any(), eq("9"), eq(false)))
                .thenThrow(new AccessDeniedException("scope denied"));
        assertTrue(service.search("BG-SIM", "101", "9", 50).isEmpty());
        verifyZeroInteractions(projection, signatures);
        assertThrows(IllegalArgumentException.class, () -> service.search(null, null, "8", 50));
        assertThrows(AccessDeniedException.class, () -> service.search("BG-SIM", null, null, 50));
    }

    @Test
    public void candidatePageContainsOnlyIdsAndDefersFrozenContentValidationUntilLockedSend() {
        Instant through = Instant.parse("2026-10-19T00:00:00Z");
        when(releases.getPublicationIds(through, 0L, 100)).thenReturn(List.of(10L));
        snapshot.report().getRows().get(0).getDataMap().put("resultValue", "999.9");
        var ids = service.publicationIds(through, 0L, 500);
        assertEquals(List.of("cn-report-10"), ids);
        verify(releases).getPublicationIds(through, 0L, 100);
        verifyZeroInteractions(authorization, signatures, projection);
        final DiagnosticReport[] sent = { null };
        assertTrue(service.withCurrentPublication(ids.get(0), report -> sent[0] = report));
        assertArrayEquals(release.getPdfContent(), sent[0].getPresentedFormFirstRep().getData());
        assertFalse(sent[0].hasResult());
        verifyZeroInteractions(authorization);
    }

    private ElectronicSignature signature(Long id, Long actor, SignatureMeaning meaning, Timestamp signedAt,
            String content) {
        var result = new ElectronicSignature();
        result.setId(id);
        result.setSignerId(actor);
        result.setSignerNamePrinted("模拟签发人");
        result.setRecordType("REPORT");
        result.setRecordId(10L);
        result.setSignatureMeaning(meaning);
        result.setSignedAt(signedAt);
        result.setSignedContent(content);
        result.setContentSha256(DigestUtils.sha256Hex(content));
        return result;
    }

    private HisResultOutbox message(HisResultEventType event) throws Exception {
        var payload = mapper.createObjectNode().put("schemaVersion", 1).put("releaseId", 10L).put("documentId", "201")
                .put("reportNumber", "BG-SIM").put("reportVersion", 1).putNull("supersedesReleaseId")
                .put("snapshotSha256", release.getFrozenContentSha256()).put("pdfSha256", release.getPdfSha256());
        var result = new HisResultOutbox();
        result.setSourceSystem("LIS-CN");
        result.setBusinessId("10");
        result.setEventType(event);
        result.setIdempotencyKey(
                "LIS-CN:" + (event == HisResultEventType.WITHDRAWAL ? "WITHDRAWAL" : "REPORT") + ":10:V1");
        result.setPayload(mapper.writeValueAsString(payload));
        result.setPayloadHash(DigestUtils.sha256Hex(result.getPayload()));
        return result;
    }

    private void voidRelease() throws Exception {
        release.setStatus(PatientReportReleaseStatus.VOIDED);
        release.setVoidSignatureId(91L);
        release.setVoidedBy("8");
        release.setVoidedAt(timestamp("2026-10-18T02:00:00Z"));
        release.setVoidReason("模拟作废原因");
        var content = mapper.createObjectNode().put("action", "VOID_REPORT").put("documentId", "201")
                .put("releaseId", 10L).put("reportVersion", 1).put("snapshotSha256", release.getFrozenContentSha256())
                .put("pdfSha256", release.getPdfSha256()).put("reason", release.getVoidReason());
        when(signatures.get(91L)).thenReturn(signature(91L, 8L, SignatureMeaning.REJECTED, release.getVoidedAt(),
                mapper.writeValueAsString(content)));
    }

    private Timestamp timestamp(String instant) {
        return Timestamp.from(Instant.parse(instant));
    }
}
