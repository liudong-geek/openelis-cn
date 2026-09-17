package org.openelisglobal.report.service.impl;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.apache.commons.codec.digest.DigestUtils;
import org.junit.*;
import org.junit.runner.RunWith;
import org.mockito.*;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.esig.service.ElectronicSignatureService;
import org.openelisglobal.esig.valueholder.*;
import org.openelisglobal.report.*;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.form.*;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.valueholder.*;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;

@RunWith(MockitoJUnitRunner.Silent.class)
public class ReportFrozenReleaseServiceTest {
    @Mock
    private PatientReportReleaseDAO patientReportReleaseDAO;
    @Mock
    private ReportDocumentService documents;
    @Mock
    private SystemUserService systemUserService;
    @Mock
    private ChinesePatientReportPdfRenderer renderer;
    @Mock
    private ElectronicSignatureService signatures;
    @Spy
    private ReportFrozenContentService frozenContent = new ReportFrozenContentService();
    @InjectMocks
    private PatientReportReleaseServiceImpl service;
    private PatientReportRelease release;
    private ReportFrozenSnapshot snapshot;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ReportDocumentSummary document = new ReportDocumentSummary("201", "101", "301", "SIM-CHEM", "SIM-1",
            "BG-SIM", null, List.of("401"));
    private ElectronicSignature signature;

    @Before
    public void setup() throws Exception {
        release = new PatientReportRelease();
        release.setId(10L);
        release.setReportDocumentId("201");
        release.setPatientId("101");
        release.setReportNumber("BG-SIM");
        release.setReportVersion(1);
        release.setStatus(PatientReportReleaseStatus.DRAFT);
        release.setCreatedBy("7");
        release.setCreatedAt(Timestamp.from(Instant.parse("2026-09-16T00:00:00Z")));
        var scope = ReportReleaseScope.from(document);
        release.setMemberScopeJson(mapper.writeValueAsString(scope));
        release.setMemberScopeSha256(DigestUtils.sha256Hex(release.getMemberScopeJson()));
        ReportingData data = new ReportingData();
        data.setColumns(List.of(new ReportColumn("resultValue", "结果", "String")));
        ReportRow row = new ReportRow();
        row.addData("resultValue", "5.5");
        row.addData("accessionNumber", "SIM-301");
        row.addCell("5.5");
        data.addRow(row);
        snapshot = new ReportFrozenSnapshot(1, scope, "BG-SIM", 1, null, ReportFrozenTemplate.current(), data,
                List.of(new ReportFrozenSnapshot.AnalysisEvidence("401", "2026-09-16T00:00:00Z", "finalized", "11",
                        "501", "50", List.of(new ReportFrozenSnapshot.ResultEvidence("601", "2026-09-16T00:00:00Z",
                                "5.5", "N", "Y", 1.0, 9.0, null, "701", null)))));
        store(snapshot);
        when(patientReportReleaseDAO.get(10L)).thenReturn(Optional.of(release));
        when(patientReportReleaseDAO.lockRelease(10L)).thenReturn(release);
        when(patientReportReleaseDAO.update(any())).thenAnswer(call -> call.getArgument(0));
        when(patientReportReleaseDAO.getLatestIssued("201")).thenReturn(release);
        when(documents.authorizePersistedScope(eq("201"), any(), eq("7"), anyBoolean())).thenReturn(document);
        doReturn(snapshot).when(frozenContent).capture(any(), any(), eq("7"));
        var user = new SystemUser();
        user.setId("7");
        user.setIsActive("Y");
        user.setLoginName("sim-signer");
        when(systemUserService.getUserById("7")).thenReturn(user);
        when(signatures.executeSignatureForSnapshot(anyString(), anyString(), any(), eq("REPORT"), eq(10L), any(),
                any(), any(), anyString())).thenAnswer(call -> {
                    signature = new ElectronicSignature();
                    signature.setId(90L);
                    signature.setSignerId(7L);
                    signature.setSignerNamePrinted("SIM签发人");
                    signature.setSignatureMeaning(call.getArgument(2));
                    signature.setRecordType("REPORT");
                    signature.setRecordId(10L);
                    signature.setSignedAt(Timestamp.from(Instant.parse("2026-09-16T01:00:00Z")));
                    signature.setSignedContent(call.getArgument(8));
                    signature.setContentSha256(DigestUtils.sha256Hex(signature.getSignedContent()));
                    return signature;
                });
        when(renderer.renderFrozenOfficial(any(), any(), any()))
                .thenReturn("SIM-PDF-ORIGINAL".getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    @Test
    public void freezePersistsServerSnapshotHashBeforeReturningIt() {
        release.setFrozenContentJson(null);
        release.setFrozenContentSha256(null);
        var result = service.freeze("201", 10L, "7");
        assertEquals(DigestUtils.sha256Hex(release.getFrozenContentJson()), result.snapshotSha256());
        assertEquals(snapshot, result.snapshot());
        verify(patientReportReleaseDAO).update(release);
        verifyZeroInteractions(signatures);
    }

    @Test
    public void snapshotReadsStoredContentWithoutQueryingTodaysClinicalData() {
        assertEquals("5.5",
                service.getSnapshot("201", 10L, "7").snapshot().report().getRows().get(0).getCells().get(0));
        verify(frozenContent, never()).capture(any(), any(), any());
    }

    @Test
    public void previewUsesFrozenReportIdentityAndNeverRecordsPrinting() {
        service.previewFrozen("201", 10L, "7");
        verify(renderer).renderFrozenPreview(any(), eq(snapshot.template()), eq("BG-SIM"), eq(1), isNull(), any());
        verify(patientReportReleaseDAO, never()).update(any());
        verifyZeroInteractions(signatures);
    }

    @Test
    public void issueBindsExactContentToCurrentActorAndStoresSameSnapshotPdf() {
        String content = release.getFrozenContentJson();
        String hash = release.getFrozenContentSha256();
        var summary = issue(hash);
        assertEquals(PatientReportReleaseStatus.ISSUED, summary.status());
        assertEquals(90L, release.getIssuedSignatureId().longValue());
        assertEquals("SIM签发人", release.getIssuerNamePrinted());
        assertEquals(signature.getSignedAt(), release.getIssuedAt());
        assertEquals(content, signature.getSignedContent());
        assertEquals(hash, signature.getContentSha256());
        assertEquals(content, release.getFrozenContentJson());
        assertEquals(DigestUtils.sha256Hex(release.getPdfContent()), release.getPdfSha256());
        verify(signatures).executeSignatureForSnapshot(eq("sim-signer"), eq("SIM-SECRET"),
                eq(SignatureMeaning.VALIDATED_AND_RELEASED), eq("REPORT"), eq(10L), isNull(), eq("127.0.0.1"),
                eq("SIM-UA"), eq(content));
        verify(signatures, never()).executeSignature(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    public void stalePreviewHashFailsBeforeSigningOrRecapturing() {
        assertThrows(IllegalStateException.class, () -> issue("0".repeat(64)));
        verify(frozenContent, never()).capture(any(), any(), any());
        verifyZeroInteractions(signatures);
    }

    @Test
    public void changedClinicalResultOrSourceVersionRequiresRefreeze() {
        snapshot.report().getRows().get(0).getCells().set(0, "6.6");
        assertThrows(IllegalStateException.class, () -> issue(release.getFrozenContentSha256()));
        verifyZeroInteractions(signatures);
    }

    @Test
    public void tamperedSnapshotCannotBeReadOrIssuedEvenWithCorrectMembership() {
        release.setFrozenContentJson(release.getFrozenContentJson().replace("5.5", "6.6"));
        assertThrows(IllegalStateException.class, () -> service.getSnapshot("201", 10L, "7"));
        assertThrows(IllegalStateException.class, () -> issue(release.getFrozenContentSha256()));
        verifyZeroInteractions(signatures);
    }

    @Test
    public void wrongDocumentCannotSignEvenSamePatient() {
        assertThrows(IllegalArgumentException.class, () -> service.issueDocument("202", 10L,
                release.getFrozenContentSha256(), "SIM-SECRET", "7", "ip", "ua"));
        verifyZeroInteractions(signatures);
    }

    @Test
    public void missingPasswordDoesNotCreateSignature() {
        assertThrows(IllegalArgumentException.class,
                () -> service.issueDocument("201", 10L, release.getFrozenContentSha256(), " ", "7", "ip", "ua"));
        verifyZeroInteractions(signatures);
    }

    @Test public void returnedUnboundSignatureIsRejectedBeforePdf() {
        when(signatures.executeSignatureForSnapshot(any(), any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(new ElectronicSignature());
        assertThrows(IllegalStateException.class, () -> issue(release.getFrozenContentSha256())); verifyZeroInteractions(renderer);
    }

    @Test public void credentialFailureDoesNotChangeRelease() {
        when(signatures.executeSignatureForSnapshot(any(), any(), any(), any(), any(), any(), any(), any(), any())).thenThrow(new IllegalArgumentException("SIM credential rejected"));
        assertThrows(IllegalArgumentException.class, () -> issue(release.getFrozenContentSha256()));
        assertEquals(PatientReportReleaseStatus.DRAFT, release.getStatus()); verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test public void renderingFailureLeavesDraftAndUsesTransactionalBoundaryForSignatureRollback() throws Exception {
        when(renderer.renderFrozenOfficial(any(), any(), any())).thenThrow(new IllegalStateException("SIM renderer failed"));
        assertThrows(IllegalStateException.class, () -> issue(release.getFrozenContentSha256()));
        assertEquals(PatientReportReleaseStatus.DRAFT, release.getStatus()); verify(patientReportReleaseDAO, never()).update(any());
        var method = PatientReportReleaseServiceImpl.class.getMethod("issueDocument", String.class, Long.class, String.class, String.class, String.class, String.class, String.class);
        assertEquals(org.springframework.transaction.annotation.Propagation.REQUIRED,
                method.getAnnotation(org.springframework.transaction.annotation.Transactional.class).propagation());
    }

    @Test
    public void aSecondIssueCannotCreateAnotherSignature() {
        issue(release.getFrozenContentSha256());
        assertThrows(IllegalStateException.class, () -> issue(release.getFrozenContentSha256()));
        verify(signatures, times(1)).executeSignatureForSnapshot(any(), any(), any(), any(), any(), any(), any(), any(),
                any());
    }

    @Test
    public void correctionFlushesSupersededPredecessorBeforePersistingNewIssuedVersion() throws Exception {
        PatientReportRelease prior = new PatientReportRelease();
        prior.setId(9L);
        prior.setReportDocumentId("201");
        prior.setPatientId("101");
        prior.setReportNumber("BG-SIM");
        prior.setReportVersion(1);
        prior.setStatus(PatientReportReleaseStatus.ISSUED);
        prior.setMemberScopeJson(release.getMemberScopeJson());
        prior.setMemberScopeSha256(release.getMemberScopeSha256());
        release.setReportVersion(2);
        release.setSupersedesReleaseId(9L);
        snapshot = new ReportFrozenSnapshot(snapshot.schemaVersion(), snapshot.scope(), snapshot.reportNumber(), 2,
                snapshot.amendmentReason(), snapshot.template(), snapshot.report(), snapshot.analyses());
        store(snapshot);
        doReturn(snapshot).when(frozenContent).capture(any(), any(), eq("7"));
        when(patientReportReleaseDAO.getLatestReleased("201")).thenReturn(prior);

        issue(release.getFrozenContentSha256());

        InOrder writes = inOrder(patientReportReleaseDAO);
        writes.verify(patientReportReleaseDAO).update(prior);
        writes.verify(patientReportReleaseDAO).flush();
        writes.verify(patientReportReleaseDAO).update(release);
        assertEquals(PatientReportReleaseStatus.SUPERSEDED, prior.getStatus());
        assertEquals(PatientReportReleaseStatus.ISSUED, release.getStatus());
    }

    @Test
    public void voidSignsReasonAndOriginalHashWithoutMutatingOriginalBytes() throws Exception {
        issue(release.getFrozenContentSha256());
        byte[] pdf = release.getPdfContent().clone();
        String content = release.getFrozenContentJson();
        service.voidDocument("201", 10L, release.getPdfSha256(), "SIM-SECRET", "SIM 修正申请", "7", "ip", "ua");
        assertEquals(PatientReportReleaseStatus.VOIDED, release.getStatus());
        assertArrayEquals(pdf, release.getPdfContent());
        assertEquals(content, release.getFrozenContentJson());
        var signed = mapper.readTree(signature.getSignedContent());
        assertEquals("VOID_REPORT", signed.get("action").asText());
        assertEquals(release.getPdfSha256(), signed.get("pdfSha256").asText());
        assertEquals("SIM 修正申请", signed.get("reason").asText());
    }

    @Test
    public void staleVoidHashCannotInvalidateAnotherVersion() {
        issue(release.getFrozenContentSha256());
        clearInvocations(signatures);
        assertThrows(IllegalStateException.class,
                () -> service.voidDocument("201", 10L, "0".repeat(64), "SIM-SECRET", "reason", "7", "ip", "ua"));
        verifyZeroInteractions(signatures);
        assertEquals(PatientReportReleaseStatus.ISSUED, release.getStatus());
    }

    @Test
    public void voidRequiresReasonAndCurrentIssuedState() {
        issue(release.getFrozenContentSha256());
        clearInvocations(signatures);
        assertThrows(IllegalArgumentException.class,
                () -> service.voidDocument("201", 10L, release.getPdfSha256(), "SIM-SECRET", " ", "7", "ip", "ua"));
        release.setStatus(PatientReportReleaseStatus.SUPERSEDED);
        assertThrows(IllegalStateException.class, () -> service.voidDocument("201", 10L, release.getPdfSha256(),
                "SIM-SECRET", "reason", "7", "ip", "ua"));
        verifyZeroInteractions(signatures);
    }

    @Test
    public void legacyTwoStepSignatureIdEntryPointsRemainClosed() {
        assertThrows(IllegalStateException.class, () -> service.issue(10L, 90L, "7"));
        assertThrows(IllegalStateException.class, () -> service.voidRelease(10L, 90L, "7"));
        verifyZeroInteractions(signatures);
    }

    @Test
    public void passwordDtosNeverSerializeOrPrintSecrets() throws Exception {
        var request = new org.openelisglobal.report.controller.ReportDocumentRestController.IssueRequest("hash",
                "SIM-SECRET");
        assertFalse(request.toString().contains("SIM-SECRET"));
        assertFalse(mapper.writeValueAsString(request).contains("SIM-SECRET"));
    }

    @Test
    public void springTransactionRollsBackContentSignatureWhenPdfRenderingFails() throws Exception {
        var rolledBack = new java.util.concurrent.atomic.AtomicBoolean();
        var committed = new java.util.concurrent.atomic.AtomicBoolean();
        var tx = new org.springframework.transaction.support.AbstractPlatformTransactionManager() {
            protected Object doGetTransaction() {
                return new Object();
            }

            protected void doBegin(Object transaction,
                    org.springframework.transaction.TransactionDefinition definition) {
            }

            protected void doCommit(org.springframework.transaction.support.DefaultTransactionStatus status) {
                committed.set(true);
            }

            protected void doRollback(org.springframework.transaction.support.DefaultTransactionStatus status) {
                rolledBack.set(true);
            }
        };
        var proxy = new org.springframework.aop.framework.ProxyFactory(service);
        proxy.addAdvice(new org.springframework.transaction.interceptor.TransactionInterceptor(tx,
                new org.springframework.transaction.annotation.AnnotationTransactionAttributeSource()));
        var transactional = (org.openelisglobal.report.service.PatientReportReleaseService) proxy.getProxy();
        when(renderer.renderFrozenOfficial(any(), any(), any())).thenAnswer(call -> {
            assertTrue(org.springframework.transaction.support.TransactionSynchronizationManager
                    .isActualTransactionActive());
            assertNotNull(signature);
            throw new IllegalStateException("SIM renderer rollback");
        });
        assertThrows(IllegalStateException.class, () -> transactional.issueDocument("201", 10L,
                release.getFrozenContentSha256(), "SIM-SECRET", "7", "ip", "ua"));
        assertTrue(rolledBack.get());
        assertFalse(committed.get());
        var signingMethod = org.openelisglobal.esig.service.ElectronicSignatureServiceImpl.class.getMethod(
                "executeSignatureForSnapshot", String.class, String.class, SignatureMeaning.class, String.class,
                Long.class, String.class, String.class, String.class, String.class);
        assertEquals(org.springframework.transaction.annotation.Propagation.REQUIRED, signingMethod
                .getAnnotation(org.springframework.transaction.annotation.Transactional.class).propagation());
    }

    private PatientReportReleaseSummary issue(String hash) {
        return service.issueDocument("201", 10L, hash, "SIM-SECRET", "7", "127.0.0.1", "SIM-UA");
    }

    private void store(ReportFrozenSnapshot content) {
        release.setFrozenContentJson(frozenContent.encode(content));
        release.setFrozenContentSha256(DigestUtils.sha256Hex(release.getFrozenContentJson()));
        release.setFrozenAt(Timestamp.from(Instant.parse("2026-09-16T00:30:00Z")));
    }
}
