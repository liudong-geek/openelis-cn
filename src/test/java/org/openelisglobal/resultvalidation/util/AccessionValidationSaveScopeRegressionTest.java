package org.openelisglobal.resultvalidation.util;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.ITestIdentityService;
import org.openelisglobal.common.services.ResultSaveService;
import org.openelisglobal.common.services.TestIdentityService;
import org.openelisglobal.common.services.beanAdapters.ResultSaveBeanAdapter;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultvalidation.action.util.ResultValidationItem;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.testresult.service.TestResultService;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Real review projection, adapter and save construction; simulated records, no
 * persistence.
 */
public class AccessionValidationSaveScopeRegressionTest {
    private Object oldFactory, oldForms, oldIdentity;
    private final Map<Class<?>, Object> beans = new HashMap<>();
    private final Map<String, Result> storedById = new HashMap<>();
    private final List<Result> stored = new ArrayList<>();
    private ResultService resultService;
    private TestResultService definitions;
    private TestResultComponentService components;
    private ResultsValidationUtility utility;
    private Analysis analysis;

    @Before
    public void setup() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldForms = ReflectionTestUtils.getField(FormFields.class, "instance");
        oldIdentity = ReflectionTestUtils.getField(TestIdentityService.class, "instance");
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        ReflectionTestUtils.setField(TestIdentityService.class, "instance", mock(ITestIdentityService.class));
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class, call -> {
            if ("getBean".equals(call.getMethod().getName()) && call.getArguments().length == 1
                    && call.getArgument(0) instanceof Class<?> type) {
                return beans.computeIfAbsent(type, key -> mock(key));
            }
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);
        });
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        resultService = factory.getBean(ResultService.class);
        definitions = factory.getBean(TestResultService.class);
        components = factory.getBean(TestResultComponentService.class);
        utility = new ResultsValidationUtility();
        for (var field : ResultsValidationUtility.class.getDeclaredFields()) {
            if (field.isAnnotationPresent(Autowired.class)) {
                ReflectionTestUtils.setField(utility, field.getName(), factory.getBean(field.getType()));
            }
        }
        Sample sample = new Sample();
        sample.setId("301");
        sample.setAccessionNumber("SIM-REVIEW-SCOPE-301");
        SampleItem tube = new SampleItem();
        tube.setId("201");
        tube.setSample(sample);
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        analysis = new Analysis();
        analysis.setId("101");
        analysis.setSampleItem(tube);
        analysis.setTest(test);
        when(factory.getBean(TestService.class).getTestById(any(org.openelisglobal.test.valueholder.Test.class)))
                .thenReturn(test);
        when(resultService.getResultsByAnalysis(analysis)).thenReturn(stored);
        doAnswer(call -> {
            Result target = call.getArgument(0);
            Result original = storedById.get(target.getId());
            if (original != null) {
                BeanUtils.copyProperties(original, target);
            }
            return null;
        }).when(resultService).getData(any(Result.class));
    }

    @After
    public void restore() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldForms);
        ReflectionTestUtils.setField(TestIdentityService.class, "instance", oldIdentity);
    }

    @Test
    public void mixedLegacyAndExplicitPrimaryChoicesSurviveReviewAndOnlyTheirOwnRemovedMembersAreDeleted() {
        for (String type : List.of("M", "C")) {
            for (boolean withSecondary : List.of(false, true)) {
                stored.clear();
                storedById.clear();
                when(components.getActiveComponentsByTestId("401"))
                        .thenReturn(withSecondary ? List.of(component("701", true), component("702", false))
                                : List.of(component("701", true)));
                TestResult legacyOption = option("501", null, type, "11");
                TestResult explicitOption = option("502", "701", type, "12");
                TestResult replacementOption = option("503", "701", type, "13");
                TestResult otherOption = option("504", "702", type, "12");
                when(definitions.getActiveTestResultsByTest("401"))
                        .thenReturn(List.of(legacyOption, explicitOption, replacementOption, otherOption));
                Result legacy = storedResult("601", legacyOption);
                Result explicit = storedResult("602", explicitOption);
                Result secondary = withSecondary ? storedResult("603", otherOption) : null;

                List<AnalysisItem> projected = utility
                        .testResultListToAnalysisItemList(stored.stream().map(this::reviewItem).toList());
                assertEquals(type + ": one row per actual component", withSecondary ? 2 : 1, projected.size());
                AnalysisItem primary = projected.stream().filter(row -> "701".equals(row.getTestResultComponentId()))
                        .findFirst().orElseThrow();
                assertEquals(List.of("601", "602"),
                        primary.getResultMembers().stream().map(AnalysisItem.ResultMember::resultId).toList());

                List<Result> deletable = new ArrayList<>();
                List<Result> constructed = save(primary, deletable);
                assertTrue(type + ": reviewing both stored choices must not recreate either", constructed.isEmpty());
                assertTrue(type + ": reviewing both stored choices must not delete either", deletable.isEmpty());
                assertEquals("11", legacy.getValue());
                assertEquals("12", explicit.getValue());

                primary.setMultiSelectResultValues("{\"1\":\"12\"}");
                deletable.clear();
                assertTrue(save(primary, deletable).isEmpty());
                assertEquals(type + ": remove only the omitted legacy selection", List.of(legacy), deletable);
                assertEquals("12", explicit.getValue());

                primary.setMultiSelectResultValues("{\"1\":\"12,13\"}");
                deletable.clear();
                constructed = save(primary, deletable);
                assertEquals(List.of(legacy), deletable);
                assertEquals(1, constructed.size());
                assertEquals("13", constructed.get(0).getValue());
                assertEquals("503", constructed.get(0).getTestResult().getId());
                assertEquals("701", constructed.get(0).getTestResult().getComponentId());
                assertEquals(type, constructed.get(0).getResultType());
                assertEquals(1, constructed.get(0).getGrouping());
                assertSame(analysis, constructed.get(0).getAnalysis());

                primary.setMultiSelectResultValues("{}");
                deletable.clear();
                assertTrue(save(primary, deletable).isEmpty());
                assertEquals(List.of(legacy, explicit), deletable);
                if (secondary != null) {
                    assertFalse(deletable.contains(secondary));
                    assertEquals("12", secondary.getValue());
                    assertEquals("702", secondary.getTestResult().getComponentId());
                }
            }
        }
    }

    private List<Result> save(AnalysisItem item, List<Result> deletable) {
        return new ResultSaveService(analysis, "7")
                .createResultsFromTestResultItem(ResultSaveBeanAdapter.fromAnalysisItem(item), deletable);
    }

    private TestResultComponent component(String id, boolean primary) {
        TestResultComponent component = new TestResultComponent();
        component.setId(id);
        component.setTestId("401");
        component.setIsPrimary(primary);
        component.setIsActive("Y");
        return component;
    }

    private TestResult option(String id, String componentId, String type, String value) {
        TestResult option = new TestResult();
        option.setId(id);
        option.setTest(analysis.getTest());
        option.setComponentId(componentId);
        option.setTestResultType(type);
        option.setValue(value);
        return option;
    }

    private Result storedResult(String id, TestResult option) {
        Result result = new Result();
        result.setId(id);
        result.setAnalysis(analysis);
        result.setTestResult(option);
        result.setResultType(option.getTestResultType());
        result.setValue(option.getValue());
        result.setGrouping(1);
        stored.add(result);
        storedById.put(id, result);
        return result;
    }

    private ResultValidationItem reviewItem(Result result) {
        ResultValidationItem item = new ResultValidationItem();
        item.setAnalysis(analysis);
        item.setAccessionNumber(analysis.getSampleItem().getSample().getAccessionNumber());
        item.setTestId("401");
        item.setTestName("SIM-Review (Serum)");
        item.setTestSortNumber("1");
        item.setResult(result);
        item.setResultId(result.getId());
        item.setResultType(result.getResultType());
        return item;
    }
}
