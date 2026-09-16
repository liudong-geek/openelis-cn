package org.openelisglobal.report.service.impl;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Optional;
import org.apache.commons.codec.digest.DigestUtils;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.form.ReportDocumentSummary;
import org.openelisglobal.report.form.ReportReleaseScope;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.openelisglobal.reports.service.ReportScopeDefinition;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.springframework.security.access.AccessDeniedException;

@RunWith(MockitoJUnitRunner.Silent.class)
public class ReportReleaseAccessTest {
    @Mock
    private PatientReportReleaseDAO patientReportReleaseDAO;
    @Mock
    private ReportDocumentService documents;
    @Mock
    private SystemUserService systemUserService;
    @InjectMocks
    private PatientReportReleaseServiceImpl service;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ReportDocumentSummary document = new ReportDocumentSummary("201", "101", "301", "SIM-CHEM", "SIM-1",
            "BG-SIM", null, List.of("401", "402"));
    private PatientReportRelease release;

    @Before
    public void setup() throws Exception {
        release = record(10L, PatientReportReleaseStatus.ISSUED);
        when(patientReportReleaseDAO.get(10L)).thenReturn(Optional.of(release));
        when(patientReportReleaseDAO.lockRelease(10L)).thenReturn(release);
        when(patientReportReleaseDAO.getLatestIssued("201")).thenReturn(release);
        when(patientReportReleaseDAO.update(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(documents.get("201", "7")).thenReturn(document);
        when(documents.lockCurrent("201", "7")).thenReturn(document);
        when(documents.authorizePersistedScope(eq("201"), any(), eq("7"), anyBoolean())).thenReturn(document);
    }

    @Test public void newDraftPersistsFullMembershipAndHashBeforeInsert() throws Exception {
        when(patientReportReleaseDAO.getNextVersion("201")).thenReturn(1);
        service.createDocumentDraft("201", null, "7");
        var captured = org.mockito.ArgumentCaptor.forClass(PatientReportRelease.class);
        verify(patientReportReleaseDAO).insert(captured.capture());
        var draft = captured.getValue();
        assertEquals(ReportReleaseScope.from(document), mapper.readValue(draft.getMemberScopeJson(), ReportReleaseScope.class));
        assertEquals(DigestUtils.sha256Hex(draft.getMemberScopeJson()), draft.getMemberScopeSha256());
    }

    @Test
    public void supersededAndVoidedOriginalsRemainUnchangedAndNeverEnterPrintAudit() {
        for (var state : List.of(PatientReportReleaseStatus.SUPERSEDED, PatientReportReleaseStatus.VOIDED)) {
            release.setStatus(state);
            byte[] before = release.getPdfContent().clone();
            var original = service.getOriginalPdf("201", 10L, "7");
            assertArrayEquals(before, original.content());
            assertEquals(state, original.status());
            assertFalse(original.current());
            var detail = service.getDetail("201", 10L, "7");
            assertTrue(detail.canReviewOriginal());
            assertFalse(detail.canPrintCurrent());
            assertThrows(IllegalStateException.class, () -> service.recordPrint("201", 10L, "7"));
            assertArrayEquals(before, release.getPdfContent());
        }
        verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test public void issuedLabelWithoutCurrentDocumentVersionDoesNotPermitPrint() throws Exception {
        when(patientReportReleaseDAO.getLatestIssued("201")).thenReturn(record(11L, PatientReportReleaseStatus.ISSUED));
        assertFalse(service.getDetail("201", 10L, "7").canPrintCurrent());
        assertFalse(service.getOriginalPdf("201", 10L, "7").current());
        assertThrows(IllegalStateException.class, () -> service.recordPrint("201", 10L, "7"));
        verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test
    public void oldDocumentBoundReleaseWithoutMembershipEvidenceIsNotInferredFromCurrentGroup() {
        release.setMemberScopeJson(null);
        release.setMemberScopeSha256(null);
        assertThrows(IllegalStateException.class, () -> service.getOriginalPdf("201", 10L, "7"));
        assertThrows(IllegalStateException.class, () -> service.getDetail("201", 10L, "7"));
        verify(documents, never()).authorizePersistedScope(any(), any(), any(), anyBoolean());
    }

    @Test
    public void membershipHashMismatchRejectsEveryReadAndWriteBeforeAuthorization() {
        release.setMemberScopeJson(release.getMemberScopeJson().replace("402", "403"));
        assertThrows(IllegalStateException.class, () -> service.getOriginalPdf("201", 10L, "7"));
        assertThrows(IllegalStateException.class, () -> service.recordPrint("201", 10L, "7"));
        verify(documents, never()).authorizePersistedScope(any(), any(), any(), anyBoolean());
        verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test
    public void malformedOrDuplicatedFrozenMembersCannotPassWithARecomputedHash() {
        release.setMemberScopeJson(release.getMemberScopeJson().replace("402", "401"));
        release.setMemberScopeSha256(DigestUtils.sha256Hex(release.getMemberScopeJson()));
        assertThrows(IllegalStateException.class, () -> service.getDetail("201", 10L, "7"));
        verify(documents, never()).authorizePersistedScope(any(), any(), any(), anyBoolean());
    }

    @Test
    public void frozenPatientOrDocumentCannotDisagreeWithReleaseOwnership() {
        release.setMemberScopeJson(release.getMemberScopeJson().replace("101", "102"));
        release.setMemberScopeSha256(DigestUtils.sha256Hex(release.getMemberScopeJson()));
        assertThrows(IllegalStateException.class, () -> service.getOriginalPdf("201", 10L, "7"));
        verify(documents, never()).authorizePersistedScope(any(), any(), any(), anyBoolean());
    }

    @Test
    public void anotherDocumentUrlCannotBorrowAReleaseFromTheSamePatient() {
        assertThrows(IllegalArgumentException.class, () -> service.getDetail("202", 10L, "7"));
        assertThrows(IllegalArgumentException.class, () -> service.getOriginalPdf("202", 10L, "7"));
        verify(documents, never()).authorizePersistedScope(any(), any(), any(), anyBoolean());
    }

    @Test
    public void revokedAccessToAnyFrozenMemberRejectsOriginalInFull() {
        var complete = new ReportScopeDefinition("101", "301", "SIM-CHEM", "SIM-1", List.of("401", "402"));
        when(documents.authorizePersistedScope("201", complete, "7", false))
                .thenThrow(new AccessDeniedException("revoked"));
        assertThrows(AccessDeniedException.class, () -> service.getOriginalPdf("201", 10L, "7"));
        verify(documents).authorizePersistedScope("201", complete, "7", false);
        verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test public void unauthorizedPrintDoesNotTakeAnyWriteLock() {
        when(documents.authorizePersistedScope(eq("201"), any(), eq("7"), eq(false))).thenThrow(new AccessDeniedException("denied"));
        assertThrows(AccessDeniedException.class, () -> service.recordPrint("201", 10L, "7"));
        verify(documents, never()).authorizePersistedScope(any(), any(), any(), eq(true));
        verify(patientReportReleaseDAO, never()).lockRelease(any());
    }

    @Test
    public void corruptOriginalIsUnavailableAndCannotIncrementPrintCount() {
        release.getPdfContent()[0] = 0;
        assertFalse(service.getDetail("201", 10L, "7").canReviewOriginal());
        assertThrows(IllegalStateException.class, () -> service.getOriginalPdf("201", 10L, "7"));
        assertThrows(IllegalStateException.class, () -> service.recordPrint("201", 10L, "7"));
        assertEquals(Integer.valueOf(0), release.getPrintCount());
        verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test
    public void printLocksParentThenReleaseAndRechecksAuthorizationBeforeMutation() {
        service.recordPrint("201", 10L, "7");
        var ordered = inOrder(documents, patientReportReleaseDAO);
        ordered.verify(patientReportReleaseDAO).get(10L);
        ordered.verify(documents).authorizePersistedScope(eq("201"), any(), eq("7"), eq(false));
        ordered.verify(documents).authorizePersistedScope(eq("201"), any(), eq("7"), eq(true));
        ordered.verify(patientReportReleaseDAO).lockRelease(10L);
        ordered.verify(documents).authorizePersistedScope(eq("201"), any(), eq("7"), eq(false));
        ordered.verify(patientReportReleaseDAO).getLatestIssued("201");
        ordered.verify(patientReportReleaseDAO).update(release);
    }

    @Test public void permissionRevokedWhileWaitingForPrintLockPreventsAuditWrite() {
        when(documents.authorizePersistedScope(eq("201"), any(), eq("7"), eq(false))).thenReturn(document).thenThrow(new AccessDeniedException("revoked"));
        assertThrows(AccessDeniedException.class, () -> service.recordPrint("201", 10L, "7"));
        assertEquals(Integer.valueOf(0), release.getPrintCount()); verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test
    public void statusChangedWhileWaitingForPrintLockUsesRefreshedState() throws Exception {
        var refreshed = record(10L, PatientReportReleaseStatus.SUPERSEDED);
        when(patientReportReleaseDAO.lockRelease(10L)).thenReturn(refreshed);
        assertThrows(IllegalStateException.class, () -> service.recordPrint("201", 10L, "7"));
        assertEquals(Integer.valueOf(0), refreshed.getPrintCount());
        verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test
    public void frozenScopeChangedWhileWaitingForLockCannotBeSubstituted() throws Exception {
        var refreshed = record(10L, PatientReportReleaseStatus.ISSUED);
        refreshed.setMemberScopeJson(refreshed.getMemberScopeJson().replace("402", "403"));
        refreshed.setMemberScopeSha256(DigestUtils.sha256Hex(refreshed.getMemberScopeJson()));
        when(patientReportReleaseDAO.lockRelease(10L)).thenReturn(refreshed);
        assertThrows(IllegalStateException.class, () -> service.recordPrint("201", 10L, "7"));
        verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test
    public void historyListRejectsAnUnverifiedReleaseInsteadOfPartiallyReturningClinicalRows() {
        release.setMemberScopeJson(null);
        release.setMemberScopeSha256(null);
        when(patientReportReleaseDAO.getByDocument("201")).thenReturn(List.of(release));
        assertThrows(IllegalStateException.class, () -> service.getByDocument("201", "7"));
        verify(systemUserService, never()).getUserById(any());
    }

    @Test
    public void membershipEvidenceAndPdfBytesAreNotExposedByEntityJson() throws Exception {
        String json = mapper.writeValueAsString(release);
        assertFalse(json.contains("memberScopeJson"));
        assertFalse(json.contains("memberScopeSha256"));
        assertFalse(json.contains("pdfContent"));
        String envelope = mapper.writeValueAsString(service.getOriginalPdf("201", 10L, "7"));
        assertFalse(envelope.contains("content"));
    }

    @Test
    public void frozenMembershipColumnsCannotBeUpdatedAfterCreation() throws Exception {
        for (String field : List.of("memberScopeJson", "memberScopeSha256")) {
            assertFalse(PatientReportRelease.class.getDeclaredField(field)
                    .getAnnotation(jakarta.persistence.Column.class).updatable());
        }
    }

    private PatientReportRelease record(Long id, PatientReportReleaseStatus state) throws Exception {
        var record = new PatientReportRelease();
        record.setId(id);
        record.setReportDocumentId("201");
        record.setPatientId("101");
        record.setReportNumber("BG-SIM");
        record.setReportVersion(id.intValue());
        record.setStatus(state);
        record.setMemberScopeJson(mapper.writeValueAsString(ReportReleaseScope.from(document)));
        record.setMemberScopeSha256(DigestUtils.sha256Hex(record.getMemberScopeJson()));
        record.setPdfContent(new byte[] { 37, 80, 68, 70 });
        record.setPdfSha256(DigestUtils.sha256Hex(record.getPdfContent()));
        return record;
    }
}
