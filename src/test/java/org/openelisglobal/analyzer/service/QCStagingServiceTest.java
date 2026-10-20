package org.openelisglobal.analyzer.service;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.analyzerresults.dao.AnalyzerResultsDAO;
import org.openelisglobal.analyzerresults.valueholder.AnalyzerResults;
import org.openelisglobal.audittrail.dao.AuditTrailService;

public class QCStagingServiceTest {
    private AnalyzerResultsDAO dao;
    private QCResultProcessingService processor;
    private QCStagingService service;
    private AuditTrailService audit;

    @Before
    public void setUp() {
        dao = mock(AnalyzerResultsDAO.class);
        processor = mock(QCResultProcessingService.class);
        audit = mock(AuditTrailService.class);
        service = new QCStagingServiceImpl(dao, processor, audit);
        when(dao.insert(any(AnalyzerResults.class))).thenReturn("700");
        when(dao.update(any(AnalyzerResults.class))).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    public void sourceIdentityIgnoresJsonKeyOrderButIncludesResolvedAccession() {
        AnalyzerResults first = original("{\"resourceType\":\"Observation\",\"valueString\":\"7.0\"}");
        service.stage(first, "1");
        AnalyzerResults reordered = original("{ \"valueString\":\"7.0\", \"resourceType\":\"Observation\" }");
        service.stage(reordered, "1");
        assertEquals(first.getQcSourceKey(), reordered.getQcSourceKey());
        assertEquals("{ \"valueString\":\"7.0\", \"resourceType\":\"Observation\" }", reordered.getQcRawObservation());
        AnalyzerResults otherSpecimen = original(first.getQcRawObservation());
        otherSpecimen.setAccessionNumber("QC-OTHER");
        service.stage(otherSpecimen, "1");
        assertNotEquals(first.getQcSourceKey(), otherSpecimen.getQcSourceKey());
    }

    @Test
    public void sameValueOnDifferentRunDateIsANewOriginal() {
        AnalyzerResults first = original(observation("2026-10-19T08:00:00Z", "7"));
        AnalyzerResults second = original(observation("2026-10-20T08:00:00Z", "7"));
        service.stage(first, "1");
        service.stage(second, "1");
        assertNotEquals(first.getQcSourceKey(), second.getQcSourceKey());
        assertNotEquals(first.getQcSourceIdentity(), second.getQcSourceIdentity());
        verify(dao, times(2)).insert(any(AnalyzerResults.class));
        verify(dao, never()).getDuplicateResultByAccessionAndTest(any());
    }

    @Test
    public void exactReimportDoesNotReplaceStoredOriginal() {
        AnalyzerResults row = original(observation("2026-10-19T08:00:00Z", "7"));
        service.stage(row, "1");
        when(dao.findQCBySourceKey("20", row.getQcSourceKey())).thenReturn(row);
        AnalyzerResults retry = original(row.getQcRawObservation());
        assertNull(service.stage(retry, "1"));
        assertNull(retry.getId());
        verify(dao, times(1)).insert(any(AnalyzerResults.class));
        verify(dao, never()).update(any());
    }

    @Test
    public void changedContentWithSameInstrumentEventRequiresReview() {
        when(dao.hasQCSourceIdentity(anyString())).thenReturn(true);
        AnalyzerResults row = original(observation("2026-10-19T08:00:00Z", "8"));
        service.stage(row, "1");
        assertEquals("NOT_PROCESSED", row.getQcProcessingStatus());
        assertEquals("QC_CORRECTION_REQUIRES_REVIEW", row.getQcProcessingReason());
        when(dao.lockQCStaging("700")).thenReturn(row);
        assertEquals("QC_CORRECTION_REQUIRES_REVIEW", service.process("700", "1").reasonCode());
        verifyZeroInteractions(processor);
    }

    @Test
    public void explicitCorrectionCannotCreateAnotherQCResult() {
        AnalyzerResults row = original("{\"resourceType\":\"Observation\",\"status\":\"corrected\"}");
        service.stage(row, "1");
        when(dao.lockQCStaging("700")).thenReturn(row);
        assertEquals("QC_CORRECTION_REQUIRES_REVIEW", service.process("700", "1").reasonCode());
        verifyZeroInteractions(processor);
    }

    @Test
    public void failedConfigurationRemainsVisibleAndManualRetryLinksOneResult() {
        AnalyzerResults row = staged();
        when(processor.processQCResult(any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(
                QCProcessingResult.notProcessed("QC_CONTROL_LOT_NOT_RESOLVED"), QCProcessingResult.created("qc-one"));
        assertEquals(QCProcessingResult.Status.NOT_PROCESSED, service.process("700", "1").status());
        assertEquals("QC_CONTROL_LOT_NOT_RESOLVED", row.getQcProcessingReason());
        assertEquals("qc-one", service.process("700", "2").qcResultId());
        assertEquals("qc-one", service.process("700", "3").qcResultId());
        assertEquals("2", row.getQcProcessedBy());
        assertEquals("CREATED", row.getQcProcessingStatus());
        verify(processor, times(2)).processQCResult(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    public void processingExceptionIsNotConvertedIntoSuccessWithinTransaction() {
        AnalyzerResults row = staged();
        when(processor.processQCResult(any(), any(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new IllegalStateException("database failed"));
        assertThrows(IllegalStateException.class, () -> service.process("700", "1"));
        assertNull(row.getQcResultId());
        assertEquals("PENDING", row.getQcProcessingStatus());
        verify(dao, never()).update(any());
    }

    @Test
    public void unknownRecoveryReturnsCommittedLinkBeforeRecordingUnknown() {
        AnalyzerResults row = staged();
        row.setQcResultId("committed");
        row.setQcProcessingStatus("CREATED");
        assertEquals("committed", service.markUnknown("700", "2").qcResultId());
        assertEquals("committed", service.readOutcome("700").qcResultId());
        verify(dao, never()).update(any());
    }

    @Test
    public void unknownMustBeOpenedBeforeUIOffersManualRetry() {
        AnalyzerResults row = staged();
        service.markUnknown("700", "1");
        when(dao.findQCStaging("OPEN", 100, 0)).thenReturn(List.of(row));
        when(dao.countQCStaging("OPEN")).thenReturn(1L);
        Map<?, ?> listed = (Map<?, ?>) ((List<?>) service.list(null, 500, 0).get("rows")).get(0);
        assertEquals(false, listed.get("canRetry"));
        assertFalse(listed.containsKey("qcRawObservation"));
        assertEquals(true, service.get("700").get("canRetry"));
        assertEquals(row.getQcRawObservation(), service.get("700").get("qcRawObservation"));
    }

    @Test
    public void legacyOriginalIsViewableButCannotBeReplayed() {
        AnalyzerResults row = new AnalyzerResults();
        row.setId("700");
        row.setIsControl(true);
        row.setQcProcessingStatus("LEGACY_REVIEW");
        when(dao.lockQCStaging("700")).thenReturn(row);
        when(dao.get("700")).thenReturn(Optional.of(row));
        assertEquals("QC_LEGACY_REVIEW_REQUIRED", service.process("700", "1").reasonCode());
        assertEquals(false, service.get("700").get("canRetry"));
        verifyZeroInteractions(processor);
    }

    @Test
    public void configurationIssueCannotBeClearedByRetry() {
        AnalyzerResults row = staged();
        row.setImportIssueReason("unmapped_component:ABC");
        assertEquals("QC_CONFIGURATION_REQUIRED", service.process("700", "1").reasonCode());
        assertEquals("unmapped_component:ABC", row.getImportIssueReason());
        verifyZeroInteractions(processor);
    }

    @Test
    public void malformedNumericValueIsHeldAndPatientRowIsRejected() {
        AnalyzerResults row = staged();
        row.setResult("not-a-number");
        assertEquals("QC_NON_NUMERIC_RESULT", service.process("700", "1").reasonCode());
        row.setIsControl(false);
        assertThrows(IllegalArgumentException.class, () -> service.get("700"));
        verifyZeroInteractions(processor);
    }

    @Test
    public void auditCapturesEveryOutcomeWithoutRawObservationOrMeasuredValue() {
        AnalyzerResults row = staged();
        when(processor.processQCResult(any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(QCProcessingResult.notProcessed("QC_CONTROL_LOT_NOT_RESOLVED"));
        service.process("700", "2");
        ArgumentCaptor<Map> changes = ArgumentCaptor.forClass(Map.class);
        verify(audit, times(2)).saveNamedChanges(eq("700"), eq("ANALYZER_RESULTS"), anyString(), changes.capture());
        Map<?, ?> outcome = changes.getAllValues().get(1);
        assertEquals("PENDING", outcome.get("previousStatus"));
        assertEquals("NOT_PROCESSED", outcome.get("currentStatus"));
        assertEquals("QC_CONTROL_LOT_NOT_RESOLVED", outcome.get("currentReason"));
        assertEquals("2", outcome.get("currentProcessedBy"));
        assertFalse(outcome.containsValue(row.getQcRawObservation()));
        assertFalse(outcome.containsKey("result"));
    }

    private AnalyzerResults staged() {
        AnalyzerResults row = original(observation("2026-10-19T08:00:00Z", "7"));
        service.stage(row, "1");
        when(dao.lockQCStaging("700")).thenReturn(row);
        when(dao.get("700")).thenReturn(Optional.of(row));
        return row;
    }

    private AnalyzerResults original(String json) {
        AnalyzerResults row = new AnalyzerResults();
        row.setAnalyzerId("20");
        row.setAccessionNumber("QC-LOT");
        row.setTestId("12");
        row.setTestName("WBC");
        row.setResult(new BigDecimal("7").toPlainString());
        row.setUnits("10^9/L");
        row.setIsControl(true);
        row.setLotNumber("LOT-NEW");
        row.setControlLevel("L1");
        row.setCompleteDate(Timestamp.valueOf("2026-10-19 08:00:00"));
        row.setQcRawObservation(json);
        return row;
    }

    private String observation(String date, String value) {
        return "{\"resourceType\":\"Observation\",\"id\":\"qc-event\",\"effectiveDateTime\":\"" + date
                + "\",\"valueQuantity\":{\"value\":" + value + "}}";
    }
}
