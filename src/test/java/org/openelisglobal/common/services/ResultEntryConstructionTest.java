package org.openelisglobal.common.services;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.serviceBeans.ResultSaveBean;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.testanalyte.service.TestAnalyteService;
import org.openelisglobal.testresult.service.TestResultService;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Synthetic identity-boundary tests: no Spring application, database or
 * network.
 */
public class ResultEntryConstructionTest {
    @Test
    public void malformedMultiselectFailsBeforePreparationOrReconciliation() {
        for (String type : List.of("M", "C")) {
            definitions.clear();
            var choice = option("801", null, "10");
            choice.setTestResultType(type);
            definitions.add(choice);
            for (String invalid : List.of("not-json", "[]", "null", "{\"x\":\"10\"}", "{\"2147483648\":\"10\"}",
                    "{\"-1\":\"10\"}", "{\"0\":[\"10\"]}", "{\"0\":null}", "{\"0\":\"10,\"}", "{\"0\":\"10,,10\"}",
                    "{\"0\":\"999\"}")) {
                ResultSaveBean bean = bean(null, null);
                bean.setResultType(type);
                bean.setMultiSelectResultValues(invalid);
                ResultSaveService service = new ResultSaveService(analysis, "1");
                assertThrows(IllegalArgumentException.class, () -> service.validateResultEntry(bean));
                assertThrows(IllegalArgumentException.class, () -> save(bean));
            }
        }
        verify(resultService, never()).getResultsByAnalysis(any());
    }

    @Test
    public void validMultiselectAndCascadingValuesBindToTheirOwnDefinition() {
        for (String type : List.of("M", "C")) {
            definitions.clear();
            var choice = option("801", null, "10");
            choice.setTestResultType(type);
            definitions.add(choice);
            ResultSaveBean bean = bean(null, null);
            bean.setResultType(type);
            bean.setMultiSelectResultValues("{\"0\":\"10\"}");
            var saved = save(bean);
            assertEquals(1, saved.size());
            assertEquals("10", saved.get(0).getValue());
            assertEquals("801", saved.get(0).getTestResult().getId());
            assertEquals(type, saved.get(0).getResultType());
        }
    }

    @Test
    public void sameTubeDoesNotPermitWritingAnotherAnalysisResult() {
        Result foreign = result("501", analysis("102", "201", "301", "401"));
        assertThrows(IllegalArgumentException.class, () -> save(bean("501", null)));
        assertEquals("original", foreign.getValue());
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void existingResultTypeCannotSilentlyChangeThroughTheDefinition() {
        Result original = result("501", analysis);
        original.setResultType("M");
        assertThrows(IllegalArgumentException.class, () -> save(bean("501", null)));
        assertEquals("original", original.getValue());
    }

    private Object oldFactory;
    private final Map<String, Object> oldServices = new HashMap<>();
    private final Map<String, Result> persisted = new HashMap<>();
    private ResultService resultService;
    private TestResultService testResultService;
    private Analysis analysis;
    private AutowireCapableBeanFactory factory;
    private TestResultComponentService componentService;
    private final List<org.openelisglobal.testresult.valueholder.TestResult> definitions = new ArrayList<>();

    @Before
    public void setup() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        factory = mock(AutowireCapableBeanFactory.class);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        resultService = mock(ResultService.class);
        testResultService = mock(TestResultService.class);
        when(factory.getBean(ResultService.class)).thenReturn(resultService);
        when(factory.getBean(TestResultService.class)).thenReturn(testResultService);
        componentService = mock(TestResultComponentService.class);
        when(factory.getBean(TestResultComponentService.class)).thenReturn(componentService);
        when(factory.getBean(TestAnalyteService.class)).thenReturn(mock(TestAnalyteService.class));
        for (String name : List.of("resultService", "testResultService")) {
            oldServices.put(name, ReflectionTestUtils.getField(ResultSaveService.class, name));
        }
        ReflectionTestUtils.setField(ResultSaveService.class, "resultService", resultService);
        ReflectionTestUtils.setField(ResultSaveService.class, "testResultService", testResultService);
        when(resultService.get(any())).thenAnswer(call -> persisted.get(call.getArgument(0)));
        doAnswer(call -> {
            Result target = call.getArgument(0);
            Result stored = persisted.get(target.getId());
            if (stored != null) {
                BeanUtils.copyProperties(stored, target);
            }
            return null;
        }).when(resultService).getData(any(Result.class));
        analysis = analysis("101", "201", "301", "401");
        org.openelisglobal.testresult.valueholder.TestResult numeric = option("800", null, null);
        numeric.setTestResultType("N");
        definitions.add(numeric);
        when(testResultService.getActiveTestResultsByTest("401")).thenAnswer(call -> definitions);
    }

    @After
    public void cleanup() {
        oldServices.forEach((name, value) -> ReflectionTestUtils.setField(ResultSaveService.class, name, value));
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
    }

    @Test
    public void targetAnalysisCannotWriteAnotherAnalysisResult() {
        Result foreign = result("501", analysis("102", "202", "302", "401"));
        assertThrows(IllegalArgumentException.class, () -> save(bean("501", null)));
        assertEquals("original", foreign.getValue());
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void targetAnalysisCannotWriteAnotherAnalysisQualifiedResult() {
        Result own = result("501", analysis);
        Result foreign = result("502", analysis("102", "202", "302", "401"));
        foreign.setParentResult(own);
        assertThrows(IllegalArgumentException.class, () -> save(bean("501", "502")));
        assertEquals("original", own.getValue());
        assertEquals("original", foreign.getValue());
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void qualifiedResultMustBelongToSubmittedParentEvenWithinSameAnalysis() {
        Result own = result("501", analysis);
        Result otherParent = result("503", analysis);
        result("502", analysis).setParentResult(otherParent);
        assertThrows(IllegalArgumentException.class, () -> save(bean("501", "502")));
        assertEquals("original", own.getValue());
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void missingResultCannotBeSilentlyRecreatedOrWritten() {
        assertThrows(IllegalArgumentException.class, () -> save(bean("999", null)));
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void existingResultCannotReferenceItselfAsQualifiedResult() {
        result("501", analysis);
        assertThrows(IllegalArgumentException.class, () -> save(bean("501", "501")));
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void clientTestCannotRebindAnAnalysisToDifferentMasterTest() {
        result("501", analysis);
        ResultSaveBean bean = bean("501", null);
        bean.setTestId("999");
        assertThrows(IllegalArgumentException.class, () -> save(bean));
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void sameAnalysisIdCannotHideDifferentSpecimenOrOrderChain() {
        result("501", analysis("101", "299", "399", "401"));
        assertThrows(IllegalArgumentException.class, () -> save(bean("501", null)));
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void invalidQualifiedIdIsRejectedEvenForANewMainResult() {
        result("502", analysis);
        assertThrows(IllegalArgumentException.class, () -> save(bean(null, "502")));
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void existingMainAndQualifiedResultsPreserveValidParentIdentity() {
        Result parent = result("501", analysis);
        Result qualified = result("502", analysis);
        qualified.setParentResult(parent);
        List<Result> results = save(bean("501", "502"));
        assertEquals(2, results.size());
        assertEquals("changed", results.get(0).getValue());
        assertEquals("", results.get(1).getValue());
        assertEquals("501", results.get(1).getParentResult().getId());
    }

    @Test
    public void detachedQualifiedParentNeedsOnlyItsIdentifier() {
        result("501", analysis);
        Result qualified = result("502", analysis);
        Result parentReference = mock(Result.class);
        when(parentReference.getId()).thenReturn("501");
        when(parentReference.getAnalysis()).thenThrow(new org.hibernate.LazyInitializationException("detached"));
        qualified.setParentResult(parentReference);

        assertEquals(2, save(bean("501", "502")).size());

        verify(parentReference, never()).getAnalysis();
    }

    @Test
    public void multiselectPayloadCannotHideForeignResultIdsInIgnoredFields() {
        result("501", analysis("102", "202", "302", "401"));
        ResultSaveBean bean = bean("501", null);
        bean.setResultType("M");
        bean.setMultiSelectResultValues("{\"1\":\"10\"}");
        assertThrows(IllegalArgumentException.class, () -> save(bean));
        verify(resultService, never()).getResultsByAnalysis(any());
    }

    @Test
    public void componentCannotBeChangedByPostingAnotherComponentId() {
        Result result = result("501", analysis);
        org.openelisglobal.testresult.valueholder.TestResult component = new org.openelisglobal.testresult.valueholder.TestResult();
        component.setTest(analysis.getTest());
        component.setComponentId("701");
        result.setTestResult(component);
        ResultSaveBean bean = bean("501", null);
        bean.setTestResultComponentId("702");
        assertThrows(IllegalArgumentException.class, () -> save(bean));
        assertEquals("original", result.getValue());
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void legacyNullComponentCanBeEditedAsItsUniqueServerPrimary() {
        when(componentService.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", true), component("702", false)));
        Result legacy = componentResult("501", null);
        legacy.setResultType("N");
        legacy.getTestResult().setTestResultType("N");
        ResultSaveBean bean = bean("501", null);
        bean.setTestResultComponentId("701");
        assertEquals("changed", save(bean).get(0).getValue());
    }

    @Test
    public void emptyMultiselectComponentOnlyReconcilesServerPrimary() {
        when(componentService.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", true), component("702", false)));
        Result primary = componentResult("501", null);
        Result secondary = componentResult("502", "702");
        when(resultService.getResultsByAnalysis(analysis)).thenReturn(List.of(primary, secondary));
        ResultSaveBean bean = bean(null, null);
        bean.setResultType("M");
        bean.setMultiSelectResultValues("{}");
        List<Result> deletable = new ArrayList<>();

        new ResultSaveService(analysis, "7").createResultsFromTestResultItem(bean, deletable);

        assertEquals(List.of(primary), deletable);
        assertEquals("original", secondary.getValue());
    }

    @Test
    public void explicitSecondaryMultiselectDoesNotDeleteLegacyPrimary() {
        when(componentService.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", true), component("702", false)));
        Result primary = componentResult("501", null);
        Result secondary = componentResult("502", "702");
        when(resultService.getResultsByAnalysis(analysis)).thenReturn(List.of(primary, secondary));
        ResultSaveBean bean = bean(null, null);
        bean.setTestResultComponentId("702");
        bean.setResultType("M");
        bean.setMultiSelectResultValues("{}");
        List<Result> deletable = new ArrayList<>();
        new ResultSaveService(analysis, "7").createResultsFromTestResultItem(bean, deletable);
        assertEquals(List.of(secondary), deletable);
    }

    @Test
    public void sameDictionaryValueInTwoComponentsDoesNotDeleteTheOtherComponentsSelection() {
        when(componentService.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", true), component("702", false)));
        Result primary = componentResult("501", null);
        Result secondary = componentResult("502", "702");
        primary.setValue("10");
        secondary.setValue("10");
        when(resultService.getResultsByAnalysis(analysis)).thenReturn(List.of(primary, secondary));
        ResultSaveBean bean = bean(null, null);
        bean.setResultType("M");
        bean.setMultiSelectResultValues("{\"0\":\"10\"}");
        List<Result> deletable = new ArrayList<>();
        assertTrue(new ResultSaveService(analysis, "7")
                .createResultsFromTestResultItem(bean, deletable).isEmpty());
        assertTrue(deletable.isEmpty());
        assertEquals("10", primary.getValue());
        assertEquals("10", secondary.getValue());
    }

    @Test
    public void ambiguousOrMissingPrimaryCannotBeGuessedFromListOrder() {
        ResultSaveBean bean = bean(null, null);
        for (List<TestResultComponent> components : List.of(List.of(component("701", false), component("702", false)),
                List.of(component("701", true), component("702", true)))) {
            when(componentService.getActiveComponentsByTestId("401")).thenReturn(components);
            assertThrows(IllegalArgumentException.class, () -> save(bean));
        }
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void arbitraryClientComponentIsRejectedEvenWhenResultIdIsEmpty() {
        when(componentService.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", true), component("702", false)));
        ResultSaveBean bean = bean(null, null);
        bean.setTestResultComponentId("999");
        assertThrows(IllegalArgumentException.class, () -> save(bean));
        verifyZeroInteractions(testResultService);
    }

    @Test
    public void identicalDictionaryCodesSelectOnlyTheRequestedComponentOption() {
        when(componentService.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", true), component("702", false)));
        org.openelisglobal.testresult.valueholder.TestResult primary = option("801", "701", "10");
        org.openelisglobal.testresult.valueholder.TestResult secondary = option("802", "702", "10");
        when(testResultService.getActiveTestResultsByTest("401")).thenReturn(List.of(primary, secondary));
        ResultSaveBean bean = bean(null, null);
        bean.setResultType("D");
        bean.setResultValue("10");
        bean.setTestResultComponentId("702");
        assertEquals("802", save(bean).get(0).getTestResult().getId());
    }

    @Test
    public void legacyDictionaryDefinitionSavesThroughAnUnspecifiedPrimaryType() {
        when(componentService.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", true)));
        when(testResultService.getActiveTestResultsByTest("401"))
                .thenReturn(List.of(option("801", null, "10")));
        ResultSaveBean bean = bean(null, null);
        bean.setTestResultComponentId("701");
        bean.setResultType("D");
        bean.setResultValue("10");
        Result saved = save(bean).get(0);
        assertEquals("801", saved.getTestResult().getId());
        assertEquals("D", saved.getResultType());
        assertEquals("10", saved.getValue());
    }

    @Test
    public void newComponentResultCannotFallBackToAnotherComponentsDefinition() {
        when(componentService.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", true), component("702", false)));
        when(testResultService.getActiveTestResultsByTest("401"))
                .thenReturn(List.of(option("801", "701", "10")));
        ResultSaveBean bean = bean(null, null);
        bean.setTestResultComponentId("702");
        assertThrows(IllegalArgumentException.class, () -> save(bean));
    }

    @Test
    public void missingDefinitionUsesTheSpecificConfigurationErrorBeforeAnyWrite() {
        when(componentService.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", true)));
        when(testResultService.getActiveTestResultsByTest("401")).thenReturn(List.of());
        ResultSaveBean bean = bean(null, null);
        bean.setTestResultComponentId("701");
        bean.setResultType("A");
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> save(bean));
        assertEquals("error.results.resultDefinitionMissing", error.getMessage());
        verify(resultService, never()).insert(any(Result.class));
        verify(resultService, never()).update(any(Result.class));
    }

    @Test
    public void missingDefinitionIsRejectedDuringPreflightBeforeAnalysisMutation() {
        when(componentService.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", true)));
        when(testResultService.getActiveTestResultsByTest("401")).thenReturn(List.of());
        ResultSaveBean bean = bean(null, null);
        bean.setTestResultComponentId("701");
        analysis.setStatusId("1");
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> new ResultSaveService(analysis, "7").validateResultEntry(bean));
        assertEquals("error.results.resultDefinitionMissing", error.getMessage());
        assertEquals("1", analysis.getStatusId());
    }

    private org.openelisglobal.testresult.valueholder.TestResult option(String id, String componentId, String value) {
        org.openelisglobal.testresult.valueholder.TestResult option = new org.openelisglobal.testresult.valueholder.TestResult();
        option.setId(id);
        option.setTest(analysis.getTest());
        option.setComponentId(componentId);
        option.setTestResultType("D");
        option.setValue(value);
        return option;
    }

    private TestResultComponent component(String id, boolean primary) {
        TestResultComponent component = new TestResultComponent();
        component.setId(id);
        component.setTestId("401");
        component.setIsPrimary(primary);
        return component;
    }

    private Result componentResult(String id, String componentId) {
        definitions.removeIf(d -> "800".equals(d.getId()));
        Result result = result(id, analysis);
        result.setResultType("M");
        org.openelisglobal.testresult.valueholder.TestResult option = option(componentId == null ? "801" : "802",
                componentId, "10");
        option.setTestResultType("M");
        definitions.add(option);
        result.setTestResult(option);
        return result;
    }

    @Test
    public void malformedResultIdentifiersAreRejectedBeforeLookup() {
        for (String id : List.of("0", "-1", "501.0", " 501", "501x")) {
            assertThrows(IllegalArgumentException.class, () -> save(bean(id, null)));
        }
        verify(resultService, never()).getData(any(Result.class));
    }

    private List<Result> save(ResultSaveBean bean) {
        return new ResultSaveService(analysis, "7").createResultsFromTestResultItem(bean, new ArrayList<>());
    }

    private ResultSaveBean bean(String id, String qualifiedId) {
        ResultSaveBean bean = new ResultSaveBean();
        bean.setResultId(id);
        bean.setQualifiedResultId(qualifiedId);
        bean.setTestId("401");
        bean.setResultType("N");
        bean.setResultValue("changed");
        return bean;
    }

    private Result result(String id, Analysis owner) {
        Result result = new Result();
        result.setId(id);
        result.setAnalysis(owner);
        result.setResultType("N");
        result.setValue("original");
        persisted.put(id, result);
        return result;
    }

    private Analysis analysis(String id, String itemId, String orderId, String testId) {
        Sample sample = new Sample();
        sample.setId(orderId);
        SampleItem item = new SampleItem();
        item.setId(itemId);
        item.setSample(sample);
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId(testId);
        Analysis value = new Analysis();
        value.setId(id);
        value.setSampleItem(item);
        value.setTest(test);
        return value;
    }
}
