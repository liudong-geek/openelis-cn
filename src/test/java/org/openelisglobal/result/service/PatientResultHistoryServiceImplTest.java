package org.openelisglobal.result.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.rest.provider.bean.patientHistory.PanelDisplay;
import org.openelisglobal.common.rest.provider.bean.patientHistory.ResultDisplay;
import org.openelisglobal.common.rest.provider.bean.patientHistory.ResultTree;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.result.dao.ResultDAO;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.TestSection;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;
import org.openelisglobal.typeofsample.valueholder.TypeOfSample;
import org.openelisglobal.unitofmeasure.service.UnitOfMeasureService;
import org.openelisglobal.unitofmeasure.valueholder.UnitOfMeasure;
import org.springframework.test.util.ReflectionTestUtils;

@RunWith(MockitoJUnitRunner.class)
public class PatientResultHistoryServiceImplTest {

    @Mock
    private ResultDAO resultDAO;

    @Mock
    private IStatusService statusService;

    @Mock
    private DictionaryService dictionaryService;

    @Mock
    private TestService testService;

    @Mock
    private TestResultComponentService componentService;

    @Mock
    private UnitOfMeasureService unitOfMeasureService;

    @Mock
    private org.openelisglobal.test.valueholder.Test test;

    @Mock
    private TestSection testSection;

    @Mock
    private TestSection actualTestSection;

    @Mock
    private TypeOfSample sampleType;

    @Mock
    private UnitOfMeasure testUnit;

    private PatientResultHistoryServiceImpl service;

    @Before
    public void setUp() {
        service = new PatientResultHistoryServiceImpl(resultDAO, statusService, dictionaryService, testService,
                componentService, unitOfMeasureService);
        when(statusService.getStatusID(AnalysisStatus.Finalized)).thenReturn("8");
        when(statusService.getStatusNameFromId("8")).thenReturn("已终审");
        when(test.getId()).thenReturn("379");
        when(test.getLocalizedName()).thenReturn("白细胞计数");
        when(test.getTestSection()).thenReturn(testSection);
        when(testSection.getId()).thenReturn("2");
        when(testSection.getLocalizedName()).thenReturn("血液学");
        when(sampleType.getId()).thenReturn("1");
        when(sampleType.getLocalizedName()).thenReturn("全血");
        when(test.getUnitOfMeasure()).thenReturn(testUnit);
        when(testUnit.getUnitOfMeasureName()).thenReturn("10^9/L");
    }

    @Test
    public void resultTree_excludesAnythingNotFinalizedAndReportableEvenIfDaoReturnsIt() {
        Result safe = result("11", "8", "Y", "Y", "7.2", "N");
        Result draft = result("12", "3", "Y", "Y", "8.1", "N");
        Result hiddenResult = result("13", "8", "Y", "N", "9.1", "N");
        Result hiddenAnalysis = result("14", "8", "N", "Y", "10.1", "N");
        when(resultDAO.getFinalizedReportableResultsForPatient("4", "8", null))
                .thenReturn(List.of(safe, draft, hiddenResult, hiddenAnalysis));

        List<ResultTree> trees = service.getResultTree("4");

        List<ResultDisplay> observations = trees.get(0).getSubSets().get(0).getSubSets().get(0).getObs();
        assertEquals(1, observations.size());
        assertEquals("11", observations.get(0).getResultId());
        verify(resultDAO).getFinalizedReportableResultsForPatient("4", "8", null);
    }

    @Test
    public void resultTree_groupsByActualAnalysisSectionInsteadOfTestDefaultSection() {
        Result result = result("11", "8", "Y", "Y", "7.2", "N");
        result.getAnalysis().setTestSection(actualTestSection);
        when(actualTestSection.getId()).thenReturn("9");
        when(actualTestSection.getLocalizedName()).thenReturn("临床生化");
        when(resultDAO.getFinalizedReportableResultsForPatient("4", "8", null)).thenReturn(List.of(result));

        List<ResultTree> trees = service.getResultTree("4");

        assertEquals(1, trees.size());
        assertEquals("临床生化", trees.get(0).getDisplay());
    }

    @Test
    public void resultTree_compilesPerObservationRangeUnitAbnormalStatusAndClinicalTime() {
        Result result = result("11", "8", "Y", "Y", "12.0", "N");
        result.setMinNormal(4.0);
        result.setMaxNormal(10.0);
        ReflectionTestUtils.setField(result.getAnalysis(), "completedDate",
                Timestamp.valueOf("2026-08-22 06:58:00"));
        result.setLastupdated(Timestamp.valueOf("2026-08-23 23:59:59"));
        when(resultDAO.getFinalizedReportableResultsForPatient("4", "8", null)).thenReturn(List.of(result));

        ResultDisplay display = service.getResultTree("4").get(0).getSubSets().get(0).getSubSets().get(0).getObs()
                .get(0);

        assertEquals("2026-08-22 06:58:00.0", display.getObsDatetime());
        assertFalse(display.getObsDatetime().startsWith("2026-08-23"));
        assertEquals("10^9/L", display.getUnits());
        assertEquals(Double.valueOf(4.0), display.getLowNormal());
        assertEquals(Double.valueOf(10.0), display.getHiNormal());
        assertEquals(Boolean.TRUE, display.getAbnormal());
        assertEquals("HIGH", display.getInterpretation());
        assertEquals("8", display.getStatusId());
        assertEquals("已终审", display.getStatus());
        assertEquals(Boolean.TRUE, display.getReportable());
    }

    @Test
    public void resultTree_componentUnitOverridesLegacyTestUnitForThatObservation() {
        Result result = result("11", "8", "Y", "Y", "7.2", "N");
        TestResult configuredResult = new TestResult();
        configuredResult.setComponentId("component-1");
        result.setTestResult(configuredResult);
        TestResultComponent component = new TestResultComponent();
        component.setId("component-1");
        component.setUomId("uom-9");
        UnitOfMeasure componentUnit = new UnitOfMeasure();
        componentUnit.setUnitOfMeasureName("mmol/L");
        when(componentService.getMatch("id", "component-1")).thenReturn(Optional.of(component));
        when(unitOfMeasureService.getUnitOfMeasureById("uom-9")).thenReturn(componentUnit);
        when(resultDAO.getFinalizedReportableResultsForPatient("4", "8", null)).thenReturn(List.of(result));

        ResultDisplay display = service.getResultTree("4").get(0).getSubSets().get(0).getSubSets().get(0).getObs()
                .get(0);

        assertEquals("mmol/L", display.getUnits());
    }

    @Test
    public void resultTree_dictionaryObservationUsesStoredOptionNormalityAndKeepsRawValue() {
        Result result = result("11", "8", "Y", "Y", "42", "D");
        TestResult selectedOption = new TestResult();
        selectedOption.setIsNormal(false);
        result.setTestResult(selectedOption);
        Dictionary dictionary = new Dictionary();
        dictionary.setDictEntry("阳性");
        when(dictionaryService.get("42")).thenReturn(dictionary);
        when(resultDAO.getFinalizedReportableResultsForPatient("4", "8", null)).thenReturn(List.of(result));

        ResultDisplay display = service.getResultTree("4").get(0).getSubSets().get(0).getSubSets().get(0).getObs()
                .get(0);

        assertEquals("42", display.getRawValue());
        assertEquals("阳性", display.getValue());
        assertEquals(Boolean.TRUE, display.getAbnormal());
        assertEquals("ABNORMAL", display.getInterpretation());
    }

    @Test
    public void resultTree_missingClinicalCompletionDateDoesNotFallBackToLastUpdated() {
        Result result = result("11", "8", "Y", "Y", "7.2", "N");
        result.setLastupdated(Timestamp.valueOf("2026-08-23 23:59:59"));
        when(resultDAO.getFinalizedReportableResultsForPatient("4", "8", null)).thenReturn(List.of(result));

        ResultDisplay display = service.getResultTree("4").get(0).getSubSets().get(0).getSubSets().get(0).getObs()
                .get(0);

        assertNull(display.getObsDatetime());
    }

    @Test
    public void resultTree_ambiguousQualifiedNumericDoesNotInventAbnormalStatus() {
        Result result = result("11", "8", "Y", "Y", "<5", "N");
        result.setMinNormal(4.0);
        result.setMaxNormal(10.0);
        when(resultDAO.getFinalizedReportableResultsForPatient("4", "8", null)).thenReturn(List.of(result));

        ResultDisplay display = service.getResultTree("4").get(0).getSubSets().get(0).getSubSets().get(0).getObs()
                .get(0);

        assertNull(display.getAbnormal());
        assertNull(display.getInterpretation());
    }

    @Test
    public void resultTree_malformedNumericDoesNotInventNormalStatusOrReplaceDisplayWithNan() {
        Result result = result("11", "8", "Y", "Y", "not-a-number", "N");
        result.setMinNormal(4.0);
        result.setMaxNormal(10.0);
        when(testService.get("379")).thenReturn(test);
        when(resultDAO.getFinalizedReportableResultsForPatient("4", "8", "379")).thenReturn(List.of(result));

        ResultDisplay display = service.getTestResultTree("4", "379").getSubSets().get(0).getObs().get(0);

        assertEquals("not-a-number", display.getValue());
        assertEquals("not-a-number", display.getRawValue());
        assertEquals(Double.valueOf(4.0), display.getLowNormal());
        assertEquals(Double.valueOf(10.0), display.getHiNormal());
        assertNull(display.getAbnormal());
        assertNull(display.getInterpretation());
    }

    @Test
    public void resultTree_differentHistoricalRangesRemainOnObservationsNotAsMisleadingTestMetadata() {
        Result older = result("10", "8", "Y", "Y", "7.0", "N");
        older.setMinNormal(4.0);
        older.setMaxNormal(10.0);
        Result newer = result("11", "8", "Y", "Y", "7.0", "N");
        newer.setMinNormal(5.0);
        newer.setMaxNormal(11.0);
        when(resultDAO.getFinalizedReportableResultsForPatient("4", "8", null))
                .thenReturn(List.of(newer, older));

        org.openelisglobal.common.rest.provider.bean.patientHistory.TestDisplay display = service.getResultTree("4")
                .get(0).getSubSets().get(0).getSubSets().get(0);

        assertNull(display.getLowNormal());
        assertNull(display.getHiNormal());
        assertEquals(Double.valueOf(5.0), display.getObs().get(0).getLowNormal());
        assertEquals(Double.valueOf(4.0), display.getObs().get(1).getLowNormal());
    }

    @Test
    public void testResultTree_trimsFilterAndNormalizesQualifiedNumericValueWithoutDiscardingRawValue() {
        Result result = result("11", "8", "Y", "Y", "<5", "N");
        when(testService.get("379")).thenReturn(test);
        when(resultDAO.getFinalizedReportableResultsForPatient("4", "8", "379")).thenReturn(List.of(result));

        PanelDisplay panel = service.getTestResultTree("4", " 379 ");

        ResultDisplay display = panel.getSubSets().get(0).getObs().get(0);
        assertEquals("5", display.getValue());
        assertEquals("<5", display.getRawValue());
        verify(resultDAO).getFinalizedReportableResultsForPatient("4", "8", "379");
    }

    @Test
    public void resultTree_blankPatientOrUnresolvedFinalizedStatus_failsClosed() {
        assertTrue(service.getResultTree(" ").isEmpty());
        verifyZeroInteractions(resultDAO);

        when(statusService.getStatusID(AnalysisStatus.Finalized)).thenReturn("-1");
        assertTrue(service.getResultTree("4").isEmpty());
        verifyZeroInteractions(resultDAO);
    }

    @Test
    public void testResultTree_unknownTestReturnsNoDataWithoutHistoryQuery() {
        when(testService.get("999")).thenReturn(null);

        assertNull(service.getTestResultTree("4", "999"));

        verify(resultDAO, never()).getFinalizedReportableResultsForPatient("4", "8", "999");
    }

    private Result result(String id, String statusId, String analysisReportable, String resultReportable, String value,
            String resultType) {
        SampleItem sampleItem = new SampleItem();
        sampleItem.setTypeOfSample(sampleType);
        Analysis analysis = new Analysis();
        analysis.setTest(test);
        analysis.setSampleItem(sampleItem);
        analysis.setStatusId(statusId);
        analysis.setIsReportable(analysisReportable);

        Result result = new Result();
        result.setId(id);
        result.setAnalysis(analysis);
        result.setIsReportable(resultReportable);
        result.setValue(value);
        result.setResultType(resultType);
        return result;
    }
}
