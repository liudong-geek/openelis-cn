package org.openelisglobal.analyzer.service;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.qc.dao.QCControlLotDAO;
import org.openelisglobal.qc.service.QCResultService;
import org.openelisglobal.qc.valueholder.QCControlLot;
import org.openelisglobal.qc.valueholder.QCResult;

/**
 * Lot-resolution behavior tests for processQCResult.
 *
 * Explicit lot identifiers and levels must resolve without substituting another
 * lot. Legacy accession and sole-usable-lot matching remain available when no
 * conflicting identity is supplied.
 */
@RunWith(MockitoJUnitRunner.class)
public class QCResultProcessingServiceImplTest {

    @Mock
    private QCControlLotDAO controlLotDAO;

    @Mock
    private QCResultService qcResultService;

    @InjectMocks
    private QCResultProcessingServiceImpl service;

    private static final String ANALYZER_ID = "42";
    private static final String TEST_ID = "7";
    private static final String TEST_ID_INT = "7";
    private static final String INSTRUMENT_ID = "42";
    private static final String ACCESSION = "QC-20260505-001";
    private static final BigDecimal RESULT = new BigDecimal("12.5");
    private static final String UNIT = "mg/dL";
    private static final LocalDateTime TS = LocalDateTime.of(2026, 5, 5, 9, 0);

    private QCControlLot lpcLot;
    private QCControlLot hpcLot;
    private QCControlLot duplicateLpcLot;

    @Before
    public void setUp() {
        lpcLot = new QCControlLot();
        lpcLot.setId("100");
        lpcLot.setLotNumber("LOT-LPC-001");
        lpcLot.setControlLevel("LPC");
        lpcLot.setStatus("ACTIVE");

        hpcLot = new QCControlLot();
        hpcLot.setId("101");
        hpcLot.setLotNumber("LOT-HPC-001");
        hpcLot.setControlLevel("HPC");
        hpcLot.setStatus("ACTIVE");

        duplicateLpcLot = new QCControlLot();
        duplicateLpcLot.setId("102");
        duplicateLpcLot.setLotNumber("LOT-LPC-002");
        duplicateLpcLot.setControlLevel("LPC");
        duplicateLpcLot.setStatus("ACTIVE");
    }

    @Test
    public void tier2_singleControlLevelMatch_resolvesAndPersists() {
        stubCreatedResult();
        when(controlLotDAO.getByTestAndInstrument(TEST_ID_INT, INSTRUMENT_ID))
                .thenReturn(Arrays.asList(lpcLot, hpcLot));

        QCProcessingResult outcome = service.processQCResult(ANALYZER_ID, TEST_ID, ACCESSION, null, "LPC", RESULT, UNIT,
                TS);
        assertEquals(QCProcessingResult.Status.CREATED, outcome.status());
        assertEquals("qc-created", outcome.qcResultId());

        verify(qcResultService).createQCResult(eq(ANALYZER_ID), eq(TEST_ID), eq("100"), eq("LPC"), eq(RESULT), eq(UNIT),
                eq(TS));
    }

    @Test
    public void tier2_ambiguousControlLevel_reportsNotProcessedAndDoesNotPersist() {
        // Two ACTIVE lots share controlLevel="LPC" — schema allows this; resolver
        // must refuse rather than pick one by DAO order.
        when(controlLotDAO.getByTestAndInstrument(TEST_ID_INT, INSTRUMENT_ID))
                .thenReturn(Arrays.asList(lpcLot, duplicateLpcLot, hpcLot));

        QCProcessingResult outcome = service.processQCResult(ANALYZER_ID, TEST_ID, ACCESSION, null, "LPC", RESULT, UNIT, TS);
        assertEquals(QCProcessingResult.Status.NOT_PROCESSED, outcome.status());
        assertEquals("QC_CONTROL_LOT_NOT_RESOLVED", outcome.reasonCode());

        verify(qcResultService, never()).createQCResult(anyString(), anyString(), anyString(), anyString(),
                any(BigDecimal.class), anyString(), any(LocalDateTime.class));
    }

    @Test
    public void unmatchedControlLevelDoesNotUseTheOnlyActiveLot() {
        // An explicit level cannot be replaced by a different level.
        QCControlLot soloActive = new QCControlLot();
        soloActive.setId("200");
        soloActive.setLotNumber("LOT-SOLO");
        soloActive.setControlLevel("MID");
        soloActive.setStatus("ACTIVE");

        assertUnresolved(ACCESSION, null, "LPC", List.of(soloActive));
    }

    @Test
    public void tier1_explicitLotNumberMatch_winsOverLevelMatch() {
        stubCreatedResult();
        // Tier 1 short-circuits before Tier 2, so even if controlLevel is
        // ambiguous, an explicit lotNumber resolves cleanly.
        when(controlLotDAO.getByTestAndInstrument(TEST_ID_INT, INSTRUMENT_ID))
                .thenReturn(Arrays.asList(lpcLot, duplicateLpcLot, hpcLot));

        service.processQCResult(ANALYZER_ID, TEST_ID, ACCESSION, "LOT-LPC-002", "LPC", RESULT, UNIT, TS);

        verify(qcResultService).createQCResult(eq(ANALYZER_ID), eq(TEST_ID), eq("102"), eq("LPC"), eq(RESULT), eq(UNIT),
                eq(TS));
    }

    @Test
    public void tier2_emptyLotsList_reportsNotProcessedAndDoesNotPersist() {
        when(controlLotDAO.getByTestAndInstrument(TEST_ID_INT, INSTRUMENT_ID)).thenReturn(Collections.emptyList());

        QCProcessingResult outcome = service.processQCResult(ANALYZER_ID, TEST_ID, ACCESSION, null, "LPC", RESULT, UNIT, TS);
        assertEquals(QCProcessingResult.Status.NOT_PROCESSED, outcome.status());
        assertEquals("QC_CONTROL_LOT_NOT_RESOLVED", outcome.reasonCode());

        verify(qcResultService, never()).createQCResult(anyString(), anyString(), anyString(), anyString(),
                any(BigDecimal.class), anyString(), any(LocalDateTime.class));
    }

    @Test
    public void tier2_establishmentLotMatch_resolves() {
        stubCreatedResult();
        // Tier 2 must accept ESTABLISHMENT lots — `isUsable` treats them as
        // eligible, so when the bridge surfaces an explicit controlLevel and
        // the only matching lot is in establishment, it resolves cleanly
        // (consistent with Tier 1's lot-number match across both statuses).
        QCControlLot establishmentLot = new QCControlLot();
        establishmentLot.setId("300");
        establishmentLot.setLotNumber("LOT-EST-001");
        establishmentLot.setControlLevel("LPC");
        establishmentLot.setStatus("ESTABLISHMENT");

        when(controlLotDAO.getByTestAndInstrument(TEST_ID_INT, INSTRUMENT_ID))
                .thenReturn(Collections.singletonList(establishmentLot));

        service.processQCResult(ANALYZER_ID, TEST_ID, ACCESSION, null, "LPC", RESULT, UNIT, TS);

        verify(qcResultService).createQCResult(eq(ANALYZER_ID), eq(TEST_ID), eq("300"), eq("LPC"), eq(RESULT), eq(UNIT),
                eq(TS));
    }

    @Test
    public void tier2_controlLevelWithWhitespace_isTrimmedBeforeMatching() {
        stubCreatedResult();
        when(controlLotDAO.getByTestAndInstrument(TEST_ID_INT, INSTRUMENT_ID))
                .thenReturn(Arrays.asList(lpcLot, hpcLot));

        service.processQCResult(ANALYZER_ID, TEST_ID, ACCESSION, null, "  LPC  ", RESULT, UNIT, TS);

        verify(qcResultService).createQCResult(eq(ANALYZER_ID), eq(TEST_ID), eq("100"), eq("LPC"), eq(RESULT), eq(UNIT),
                eq(TS));
    }

    @Test(expected = IllegalStateException.class)
    public void persistenceFailurePropagatesAcrossTransactionBoundary() {
        when(controlLotDAO.getByTestAndInstrument(TEST_ID, ANALYZER_ID)).thenReturn(List.of(lpcLot));
        when(qcResultService.createQCResult(anyString(), anyString(), anyString(), anyString(), any(), any(), any()))
                .thenThrow(new IllegalStateException("write failed"));
        service.processQCResult(ANALYZER_ID, TEST_ID, ACCESSION, null, "LPC", RESULT, UNIT, TS);
    }

    @Test(expected = IllegalStateException.class)
    public void missingPersistedIdentifierCannotBeReportedAsCreated() {
        when(controlLotDAO.getByTestAndInstrument(TEST_ID, ANALYZER_ID)).thenReturn(List.of(lpcLot));
        service.processQCResult(ANALYZER_ID, TEST_ID, ACCESSION, null, "LPC", RESULT, UNIT, TS);
    }

    @Test
    public void missingRequiredFieldDoesNotAttemptPersistence() {
        QCProcessingResult outcome = service.processQCResult(" ", TEST_ID, ACCESSION, null, "LPC", RESULT, UNIT, TS);
        assertEquals(QCProcessingResult.Status.NOT_PROCESSED, outcome.status());
        assertEquals("QC_REQUIRED_FIELD_MISSING", outcome.reasonCode());
        verify(controlLotDAO, never()).getByTestAndInstrument(anyString(), anyString());
        verify(qcResultService, never()).createQCResult(anyString(), anyString(), anyString(), anyString(), any(),
                any(), any());
    }

    @Test
    public void explicitUnknownLotDoesNotUseTheOnlyActiveLot() {
        assertUnresolved(ACCESSION, "LOT-UNKNOWN", null, List.of(lpcLot));
    }

    @Test
    public void explicitLotWithMultipleLevelsResolvesTheSpecifiedLevelInEitherDaoOrder() {
        hpcLot.setLotNumber(lpcLot.getLotNumber());
        assertCreated(ACCESSION, lpcLot.getLotNumber(), "LPC", List.of(hpcLot, lpcLot), lpcLot);
        assertCreated(ACCESSION, lpcLot.getLotNumber(), "HPC", List.of(lpcLot, hpcLot), hpcLot);
    }

    @Test
    public void explicitLotWithMultipleLevelsIsAmbiguousWithoutALevel() {
        hpcLot.setLotNumber(lpcLot.getLotNumber());
        assertUnresolved(ACCESSION, lpcLot.getLotNumber(), null, List.of(hpcLot, lpcLot));
    }

    @Test
    public void duplicateExplicitLotAndLevelIsNotResolvedByDaoOrder() {
        duplicateLpcLot.setLotNumber(lpcLot.getLotNumber());
        assertUnresolved(ACCESSION, lpcLot.getLotNumber(), "LPC", List.of(duplicateLpcLot, lpcLot));
        assertUnresolved(ACCESSION, lpcLot.getLotNumber(), "LPC", List.of(lpcLot, duplicateLpcLot));
    }

    @Test
    public void accessionLotWithMultipleLevelsResolvesTheSpecifiedLevel() {
        hpcLot.setLotNumber(lpcLot.getLotNumber());
        assertCreated(lpcLot.getLotNumber(), null, "LPC", List.of(hpcLot, lpcLot), lpcLot);
        assertCreated(lpcLot.getLotNumber(), null, "HPC", List.of(lpcLot, hpcLot), hpcLot);
    }

    @Test
    public void explicitLotWithConflictingLevelIsNotProcessed() {
        assertUnresolved(ACCESSION, lpcLot.getLotNumber(), "HPC", List.of(lpcLot, hpcLot));
    }

    @Test
    public void accessionLotWithConflictingLevelIsNotProcessed() {
        assertUnresolved(lpcLot.getLotNumber(), null, "HPC", List.of(lpcLot, hpcLot));
    }

    @Test
    public void duplicateAccessionLotIsNotResolvedByDaoOrder() {
        duplicateLpcLot.setLotNumber(lpcLot.getLotNumber());
        assertUnresolved(lpcLot.getLotNumber(), null, null, List.of(duplicateLpcLot, lpcLot));
    }

    @Test
    public void inactiveAccessionLotDoesNotFallBackToAnotherLevelMatch() {
        lpcLot.setStatus("INACTIVE");
        assertUnresolved(lpcLot.getLotNumber(), null, "LPC", List.of(lpcLot, duplicateLpcLot));
    }

    @Test
    public void absentIdentityDoesNotChooseBetweenActiveAndEstablishmentLots() {
        hpcLot.setStatus("ESTABLISHMENT");
        assertUnresolved(ACCESSION, null, null, List.of(lpcLot, hpcLot));
    }

    @Test
    public void explicitUnknownLotDoesNotUseAnAccessionLotMatch() {
        assertUnresolved(lpcLot.getLotNumber(), "LOT-UNKNOWN", null, List.of(lpcLot, hpcLot));
    }

    @Test
    public void explicitUnknownLotDoesNotUseAUniqueLevelMatch() {
        assertUnresolved(ACCESSION, "LOT-UNKNOWN", "LPC", List.of(lpcLot, hpcLot));
    }

    @Test
    public void explicitInactiveLotDoesNotUseAnotherAvailableLot() {
        lpcLot.setStatus("INACTIVE");
        assertUnresolved(ACCESSION, lpcLot.getLotNumber(), "LPC", List.of(lpcLot, duplicateLpcLot));
    }

    @Test
    public void explicitDuplicateLotRemainsAmbiguousWhenOneRecordIsInactive() {
        duplicateLpcLot.setLotNumber(lpcLot.getLotNumber());
        duplicateLpcLot.setStatus("INACTIVE");
        assertUnresolved(ACCESSION, lpcLot.getLotNumber(), "LPC", List.of(lpcLot, duplicateLpcLot));
    }

    @Test
    public void explicitLotRequiresExactCharacters() {
        assertUnresolved(ACCESSION, "lot-lpc-001", null, List.of(lpcLot));
        assertUnresolved(ACCESSION, " LOT-LPC-001 ", null, List.of(lpcLot));
        assertUnresolved(ACCESSION, " ", null, List.of(lpcLot));
    }

    @Test
    public void explicitLotWithoutStoredLevelCannotSatisfyASuppliedLevel() {
        lpcLot.setControlLevel(null);
        assertUnresolved(ACCESSION, lpcLot.getLotNumber(), "LPC", List.of(lpcLot));
    }

    @Test
    public void explicitEstablishmentLotRemainsAvailable() {
        lpcLot.setStatus("ESTABLISHMENT");
        assertCreated(ACCESSION, lpcLot.getLotNumber(), null, List.of(lpcLot, hpcLot), lpcLot);
    }

    @Test
    public void explicitLotTakesPrecedenceOverLegacyAccessionAndAcceptsNormalizedLevel() {
        assertCreated(hpcLot.getLotNumber(), lpcLot.getLotNumber(), " lpc ", List.of(lpcLot, hpcLot), lpcLot);
    }

    @Test
    public void missingExplicitLotRetainsExactAccessionMatching() {
        assertCreated(lpcLot.getLotNumber(), null, "LPC", List.of(lpcLot, hpcLot), lpcLot);
    }

    @Test
    public void missingLotAndLevelUseTheOnlyActiveLot() {
        hpcLot.setStatus("INACTIVE");
        assertCreated(ACCESSION, null, null, List.of(lpcLot, hpcLot), lpcLot);
    }

    @Test
    public void emptyLotAndLevelUseTheOnlyEstablishmentLot() {
        lpcLot.setStatus("ESTABLISHMENT");
        assertCreated(ACCESSION, "", " ", List.of(lpcLot), lpcLot);
    }

    @Test
    public void missingIdentityDoesNotChooseBetweenActiveLots() {
        assertUnresolved(ACCESSION, null, null, List.of(lpcLot, hpcLot));
    }

    private void assertCreated(String accession, String lotNumber, String level, List<QCControlLot> lots,
            QCControlLot expectedLot) {
        stubCreatedResult();
        when(controlLotDAO.getByTestAndInstrument(TEST_ID, ANALYZER_ID)).thenReturn(lots);

        QCProcessingResult outcome = service.processQCResult(ANALYZER_ID, TEST_ID, accession, lotNumber, level, RESULT,
                UNIT, TS);

        assertEquals(QCProcessingResult.Status.CREATED, outcome.status());
        assertEquals("qc-created", outcome.qcResultId());
        verify(qcResultService).createQCResult(ANALYZER_ID, TEST_ID, expectedLot.getId(), expectedLot.getControlLevel(),
                RESULT, UNIT, TS);
    }

    private void assertUnresolved(String accession, String lotNumber, String level, List<QCControlLot> lots) {
        when(controlLotDAO.getByTestAndInstrument(TEST_ID, ANALYZER_ID)).thenReturn(lots);
        QCResult unexpectedResult = new QCResult();
        unexpectedResult.setId("unexpected-result");
        lenient().when(qcResultService.createQCResult(anyString(), anyString(), anyString(), anyString(), any(), any(),
                any())).thenReturn(unexpectedResult);

        QCProcessingResult outcome = service.processQCResult(ANALYZER_ID, TEST_ID, accession, lotNumber, level, RESULT,
                UNIT, TS);

        assertEquals(QCProcessingResult.Status.NOT_PROCESSED, outcome.status());
        assertEquals("QC_CONTROL_LOT_NOT_RESOLVED", outcome.reasonCode());
        verify(qcResultService, never()).createQCResult(anyString(), anyString(), anyString(), anyString(), any(), any(),
                any());
    }

    private void stubCreatedResult() {
        QCResult result = new QCResult();
        result.setId("qc-created");
        when(qcResultService.createQCResult(anyString(), anyString(), anyString(), anyString(), any(), any(), any()))
                .thenReturn(result);
    }
}
