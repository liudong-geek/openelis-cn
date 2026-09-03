package org.openelisglobal.report.service.impl;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.esig.service.ElectronicSignatureService;
import org.openelisglobal.esig.valueholder.ElectronicSignature;
import org.openelisglobal.esig.valueholder.SignatureMeaning;
import org.openelisglobal.report.PatientReportPdfMetadata;
import org.openelisglobal.report.PatientReportReleaseSummary;
import org.openelisglobal.report.ReportRow;
import org.openelisglobal.report.ReportingData;
import org.openelisglobal.report.dao.PatientReportReleaseDAO;
import org.openelisglobal.report.service.PatientReportService;
import org.openelisglobal.report.valueholder.PatientReportRelease;
import org.openelisglobal.report.valueholder.PatientReportReleaseStatus;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;

@RunWith(MockitoJUnitRunner.class)
public class PatientReportReleaseServiceImplTest {

    private static final String PATIENT_ID = "101";
    private static final String USER_ID = "7";

    @Mock
    private PatientReportReleaseDAO patientReportReleaseDAO;
    @Mock
    private PatientReportService patientReportService;
    @Mock
    private ChinesePatientReportPdfRenderer pdfRenderer;
    @Mock
    private ElectronicSignatureService electronicSignatureService;
    @Mock
    private SystemUserService systemUserService;

    @InjectMocks
    private PatientReportReleaseServiceImpl service;

    private ReportingData report;

    @Before
    public void setUp() {
        report = reportData();
        when(patientReportService.buildPatientResultsReport(PATIENT_ID, USER_ID)).thenReturn(report);
        when(patientReportReleaseDAO.insert(any(PatientReportRelease.class))).thenAnswer(invocation -> {
            PatientReportRelease release = invocation.getArgument(0);
            release.setId(10L);
            return 10L;
        });
        when(patientReportReleaseDAO.update(any(PatientReportRelease.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    public void createDraft_assignsFirstVersionAndLocksPatientMasterRecord() {
        when(patientReportReleaseDAO.getNextVersion(PATIENT_ID)).thenReturn(1);

        PatientReportReleaseSummary summary = service.createDraft(PATIENT_ID, null, USER_ID);

        assertEquals(Long.valueOf(10L), summary.id());
        assertEquals(Integer.valueOf(1), summary.reportVersion());
        assertEquals(PatientReportReleaseStatus.DRAFT, summary.status());
        assertEquals("L202609020001", summary.accessionNumbers());
        verify(patientReportReleaseDAO).lockPatientVersion(PATIENT_ID);
        verify(patientReportReleaseDAO).insert(any(PatientReportRelease.class));
    }

    @Test
    public void createDraft_reusesExistingDraftAfterPatientLock() {
        PatientReportRelease draft = release(22L, PatientReportReleaseStatus.DRAFT);
        when(patientReportReleaseDAO.getDraft(PATIENT_ID)).thenReturn(draft);

        PatientReportReleaseSummary summary = service.createDraft(PATIENT_ID, null, USER_ID);

        assertEquals(Long.valueOf(22L), summary.id());
        verify(patientReportReleaseDAO).lockPatientVersion(PATIENT_ID);
        verify(patientReportReleaseDAO, never()).insert(any(PatientReportRelease.class));
    }

    @Test
    public void createDraft_requiresAmendmentReasonAfterAnyPreviousFormalRelease() {
        PatientReportRelease voided = release(5L, PatientReportReleaseStatus.VOIDED);
        when(patientReportReleaseDAO.getLatestReleased(PATIENT_ID)).thenReturn(voided);

        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class,
                () -> service.createDraft(PATIENT_ID, "  ", USER_ID));

        assertTrue(exception.getMessage().contains("更正原因"));
        verify(patientReportReleaseDAO, never()).insert(any(PatientReportRelease.class));
    }

    @Test
    public void issue_storesImmutablePdfHashAndSupersedesCurrentVersion() {
        PatientReportRelease draft = release(10L, PatientReportReleaseStatus.DRAFT);
        draft.setReportVersion(2);
        draft.setAmendmentReason("修正参考范围");
        PatientReportRelease current = release(5L, PatientReportReleaseStatus.ISSUED);
        ElectronicSignature signature = signature(31L, 10L, SignatureMeaning.VALIDATED_AND_RELEASED, null);
        byte[] officialPdf = new byte[] { 1, 2, 3, 4 };
        SystemUser issuer = new SystemUser();
        issuer.setLastName("赵");
        issuer.setFirstName("审核");
        when(patientReportReleaseDAO.get(10L)).thenReturn(Optional.of(draft));
        when(patientReportReleaseDAO.getLatestIssued(PATIENT_ID)).thenReturn(current);
        when(electronicSignatureService.get(31L)).thenReturn(signature);
        when(systemUserService.getUserById(USER_ID)).thenReturn(issuer);
        when(pdfRenderer.renderOfficial(eq(report), any(PatientReportPdfMetadata.class))).thenReturn(officialPdf);

        PatientReportReleaseSummary summary = service.issue(10L, 31L, USER_ID);

        assertEquals(PatientReportReleaseStatus.ISSUED, summary.status());
        assertEquals(PatientReportReleaseStatus.SUPERSEDED, current.getStatus());
        assertEquals(Long.valueOf(5L), summary.supersedesReleaseId());
        assertEquals(64, summary.pdfSha256().length());
        assertEquals("赵 审核", summary.issuedByName());
        assertArrayEquals(officialPdf, service.getIssuedPdf(10L));
        verify(patientReportReleaseDAO).update(current);
        verify(patientReportReleaseDAO).update(draft);
    }

    @Test
    public void issue_rejectsSignatureFromAnotherUserOrRecord() {
        PatientReportRelease draft = release(10L, PatientReportReleaseStatus.DRAFT);
        ElectronicSignature signature = signature(31L, 99L, SignatureMeaning.VALIDATED_AND_RELEASED, null);
        when(patientReportReleaseDAO.get(10L)).thenReturn(Optional.of(draft));
        when(electronicSignatureService.get(31L)).thenReturn(signature);

        assertThrows(IllegalArgumentException.class, () -> service.issue(10L, 31L, USER_ID));
        verify(pdfRenderer, never()).renderOfficial(any(), any());
    }

    @Test
    public void voidRelease_requiresRejectedSignatureReasonAndBlocksFurtherPrint() {
        PatientReportRelease issued = release(10L, PatientReportReleaseStatus.ISSUED);
        issued.setPdfContent(new byte[] { 9, 8, 7 });
        ElectronicSignature signature = signature(44L, 10L, SignatureMeaning.REJECTED, "患者信息错误");
        when(patientReportReleaseDAO.get(10L)).thenReturn(Optional.of(issued));
        when(electronicSignatureService.get(44L)).thenReturn(signature);

        PatientReportReleaseSummary summary = service.voidRelease(10L, 44L, USER_ID);

        assertEquals(PatientReportReleaseStatus.VOIDED, summary.status());
        assertEquals("患者信息错误", summary.voidReason());
        assertThrows(IllegalStateException.class, () -> service.recordPrint(10L, USER_ID));
    }

    @Test
    public void recordPrint_incrementsAuditCounterWithoutChangingPdf() {
        PatientReportRelease issued = release(10L, PatientReportReleaseStatus.ISSUED);
        issued.setPdfContent(new byte[] { 9, 8, 7 });
        issued.setPrintCount(2);
        when(patientReportReleaseDAO.get(10L)).thenReturn(Optional.of(issued));

        byte[] printed = service.recordPrint(10L, USER_ID);

        assertArrayEquals(new byte[] { 9, 8, 7 }, printed);
        assertEquals(Integer.valueOf(3), issued.getPrintCount());
        assertEquals(USER_ID, issued.getLastPrintedBy());
        assertNotNull(issued.getLastPrintedAt());
    }

    private PatientReportRelease release(Long id, PatientReportReleaseStatus status) {
        PatientReportRelease release = new PatientReportRelease();
        release.setId(id);
        release.setPatientId(PATIENT_ID);
        release.setReportNumber("BG-20260902-" + id);
        release.setReportVersion(1);
        release.setStatus(status);
        release.setCreatedBy(USER_ID);
        release.setCreatedAt(Timestamp.valueOf(LocalDateTime.of(2026, 9, 2, 9, 0)));
        release.setPrintCount(0);
        return release;
    }

    private ElectronicSignature signature(Long id, Long recordId, SignatureMeaning meaning, String reason) {
        ElectronicSignature signature = new ElectronicSignature();
        signature.setId(id);
        signature.setRecordType("REPORT");
        signature.setRecordId(recordId);
        signature.setSignerId(Long.valueOf(USER_ID));
        signature.setSignatureMeaning(meaning);
        signature.setSignedAt(Timestamp.valueOf(LocalDateTime.of(2026, 9, 2, 10, 30)));
        signature.setRejectionReason(reason);
        return signature;
    }

    private ReportingData reportData() {
        ReportRow row = new ReportRow();
        row.addData("accessionNumber", "L202609020001");
        ReportingData data = new ReportingData();
        data.setRows(List.of(row));
        return data;
    }
}
