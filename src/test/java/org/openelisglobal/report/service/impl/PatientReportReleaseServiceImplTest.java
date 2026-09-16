package org.openelisglobal.report.service.impl;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.form.ReportDocumentSummary;
import org.openelisglobal.report.service.ReportDocumentService;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.springframework.security.access.AccessDeniedException;

@RunWith(MockitoJUnitRunner.Silent.class)
public class PatientReportReleaseServiceImplTest {
    @Mock
    private PatientReportReleaseDAO patientReportReleaseDAO;
    @Mock
    private ReportDocumentService documents;
    @Mock
    private SystemUserService systemUserService;
    @InjectMocks
    private PatientReportReleaseServiceImpl service;
    private final ReportDocumentSummary document = new ReportDocumentSummary("201", "101", "301", "SIM-CHEM", "SIM-1",
            "BG-SIM-201", null, List.of("401", "402"));

    @Before public void setup() {
        when(documents.lockCurrent("201", "7")).thenReturn(document);
        when(documents.get("201", "7")).thenReturn(document);
        when(documents.authorizePersistedScope(eq("201"), any(), eq("7"), anyBoolean())).thenReturn(document);
        when(patientReportReleaseDAO.lockRelease(any())).thenAnswer(invocation -> patientReportReleaseDAO.get(invocation.<Long>getArgument(0)).orElse(null));
        when(patientReportReleaseDAO.getNextVersion("201")).thenReturn(1);
        when(patientReportReleaseDAO.insert(any())).thenAnswer(invocation -> {
            PatientReportRelease value = invocation.getArgument(0); value.setId(10L); return 10L;
        });
        when(patientReportReleaseDAO.update(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    public void draftUsesStableDocumentIdentityAndLocksBeforeVersionAllocation() {
        var summary = service.createDocumentDraft("201", null, "7");
        assertEquals("201", summary.documentId());
        assertEquals("101", summary.patientId());
        assertEquals("BG-SIM-201", summary.reportNumber());
        assertEquals(Integer.valueOf(1), summary.reportVersion());
        var order = inOrder(documents, patientReportReleaseDAO);
        order.verify(documents).lockCurrent("201", "7");
        order.verify(patientReportReleaseDAO).getDraft("201");
        order.verify(patientReportReleaseDAO).getLatestReleased("201");
        order.verify(patientReportReleaseDAO).getNextVersion("201");
    }

    @Test
    public void samePatientIndependentDocumentStartsAtItsOwnVersion() {
        var other = new ReportDocumentSummary("202", "101", "302", "SIM-CHEM", "SIM-1", "BG-SIM-202", null,
                List.of("405"));
        when(documents.lockCurrent("202", "7")).thenReturn(other);
        when(patientReportReleaseDAO.getNextVersion("202")).thenReturn(1);
        assertEquals("BG-SIM-201", service.createDocumentDraft("201", null, "7").reportNumber());
        var result = service.createDocumentDraft("202", null, "7");
        assertEquals(Integer.valueOf(1), result.reportVersion());
        assertEquals("BG-SIM-202", result.reportNumber());
    }

    @Test
    public void repeatedPreparationReusesTheSameDraft() {
        var draft = release(PatientReportReleaseStatus.DRAFT);
        when(patientReportReleaseDAO.getDraft("201")).thenReturn(draft);
        assertEquals(Long.valueOf(10L), service.createDocumentDraft("201", null, "7").id());
        verify(patientReportReleaseDAO, never()).insert(any());
    }

    @Test
    public void existingDraftCannotSilentlyReplaceCorrectionReason() {
        var draft = release(PatientReportReleaseStatus.DRAFT);
        draft.setAmendmentReason("first reason");
        when(patientReportReleaseDAO.getDraft("201")).thenReturn(draft);
        assertThrows(IllegalStateException.class, () -> service.createDocumentDraft("201", "another reason", "7"));
        verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test
    public void amendmentRequiresReasonAndPointsToSameDocumentPriorRelease() {
        var prior = release(PatientReportReleaseStatus.ISSUED);
        when(patientReportReleaseDAO.getLatestReleased("201")).thenReturn(prior);
        assertThrows(IllegalArgumentException.class, () -> service.createDocumentDraft("201", " ", "7"));
        when(patientReportReleaseDAO.getNextVersion("201")).thenReturn(2);
        var correction = service.createDocumentDraft("201", " corrected range ", "7");
        assertEquals(Integer.valueOf(2), correction.reportVersion());
        assertEquals(Long.valueOf(10L), correction.supersedesReleaseId());
        assertEquals("corrected range", correction.amendmentReason());
        assertEquals(PatientReportReleaseStatus.ISSUED, prior.getStatus());
    }

    @Test
    public void anotherDocumentCannotSupplyPriorReleaseEvenForSamePatient() {
        var prior = release(PatientReportReleaseStatus.ISSUED);
        prior.setReportDocumentId("202");
        when(patientReportReleaseDAO.getLatestReleased("201")).thenReturn(prior);
        assertThrows(IllegalStateException.class, () -> service.createDocumentDraft("201", "correction", "7"));
        verify(patientReportReleaseDAO, never()).insert(any());
    }

    @Test public void permissionsAreCheckedBeforeReleaseHistoryQuery() {
        when(documents.get("201", "7")).thenThrow(new AccessDeniedException("denied"));
        assertThrows(AccessDeniedException.class, () -> service.getByDocument("201", "7"));
        verify(patientReportReleaseDAO, never()).getByDocument(any());
    }

    @Test
    public void legacyUnassignedPdfCannotBypassDocumentAuthorization() {
        var legacy = release(PatientReportReleaseStatus.ISSUED);
        legacy.setReportDocumentId(null);
        when(patientReportReleaseDAO.get(10L)).thenReturn(Optional.of(legacy));
        assertThrows(IllegalStateException.class, () -> service.getOriginalPdf(null, 10L, "7").content());
        assertThrows(IllegalStateException.class, () -> service.issue(10L, 44L, "7"));
        assertThrows(IllegalStateException.class, () -> service.voidRelease(10L, 44L, "7"));
        assertThrows(IllegalStateException.class, () -> service.recordPrint(null, 10L, "7").content());
        verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test
    public void issuanceAndVoidCannotUseHistoricalLivePatientRenderer() {
        var draft = release(PatientReportReleaseStatus.DRAFT);
        when(patientReportReleaseDAO.get(10L)).thenReturn(Optional.of(draft));
        assertEquals("REPORT_FROZEN_SIGNATURE_REQUIRED",
                assertThrows(IllegalStateException.class, () -> service.issue(10L, 44L, "7")).getMessage());
        assertThrows(IllegalStateException.class, () -> service.voidRelease(10L, 44L, "7"));
        assertEquals(PatientReportReleaseStatus.DRAFT, draft.getStatus());
        verify(patientReportReleaseDAO, never()).update(any());
    }

    @Test
    public void storedPdfIsDefensivelyCopiedAndPrintCountsOnlyAfterAuthorization() {
        var issued = release(PatientReportReleaseStatus.ISSUED);
        when(patientReportReleaseDAO.get(10L)).thenReturn(Optional.of(issued));
        when(patientReportReleaseDAO.getLatestIssued("201")).thenReturn(issued);
        byte[] downloaded = service.getOriginalPdf(null, 10L, "7").content();
        downloaded[0] = 9;
        assertArrayEquals(new byte[] { 1, 2 }, issued.getPdfContent());
        assertArrayEquals(new byte[] { 1, 2 }, service.recordPrint(null, 10L, "7").content());
        assertEquals(Integer.valueOf(1), issued.getPrintCount());
        verify(documents, times(4)).authorizePersistedScope(eq("201"), any(), eq("7"), anyBoolean());
        verify(patientReportReleaseDAO).update(issued);
    }

    private PatientReportRelease release(PatientReportReleaseStatus status) {
        var release = new PatientReportRelease();
        release.setId(10L);
        release.setPatientId("101");
        release.setReportDocumentId("201");
        release.setReportNumber("BG-SIM-201");
        release.setReportVersion(1);
        release.setStatus(status);
        release.setPdfContent(new byte[] { 1, 2 });
        release.setPdfSha256(org.apache.commons.codec.digest.DigestUtils.sha256Hex(release.getPdfContent()));
        try {
            release.setMemberScopeJson(new com.fasterxml.jackson.databind.ObjectMapper()
                    .writeValueAsString(org.openelisglobal.report.form.ReportReleaseScope.from(document)));
        } catch (Exception e) {
            throw new AssertionError(e);
        }
        release.setMemberScopeSha256(
                org.apache.commons.codec.digest.DigestUtils.sha256Hex(release.getMemberScopeJson()));
        return release;
    }
}
