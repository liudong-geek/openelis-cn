package org.openelisglobal.result.action.util;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.ITestIdentityService;
import org.openelisglobal.common.services.TestIdentityService;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.eqa.service.SampleEQAService;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.service.ResultServiceImpl;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultlimit.service.ResultLimitService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * SIM-only tests of the real GET row projection; no database or clinical data.
 */
public class ResultsReadbackProjectionTest {
    private Object oldFactory;
    private Object oldForms;
    private Object oldIdentity;
    private Object oldMessages;
    private ResultsLoadUtility loader;
    private AnalysisService analyses;
    private ResultService results;
    private Analysis analysis;
    private TestResultComponentService components;
    private TestService tests;
    private AutowireCapableBeanFactory factory;

    @Before
    public void setup() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldForms = ReflectionTestUtils.getField(FormFields.class, "instance");
        oldIdentity = ReflectionTestUtils.getField(TestIdentityService.class, "instance");
        oldMessages = ReflectionTestUtils.getField(MessageUtil.class, "instance");
        StaticMessageSource messages = new StaticMessageSource();
        messages.addMessage("time.format.formatKey", Locale.ENGLISH, "HH:mm");
        messages.setUseCodeAsDefaultMessage(true);
        MessageUtil.setMessageSource(messages);
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        ReflectionTestUtils.setField(TestIdentityService.class, "instance", mock(ITestIdentityService.class));
        factory = mock(AutowireCapableBeanFactory.class);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        DefaultConfigurationProperties config = mock(DefaultConfigurationProperties.class);
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(config);
        when(config.getPropertyValue(Property.DEFAULT_LANG_LOCALE)).thenReturn("en");
        when(config.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("en");
        when(config.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        tests = mock(TestService.class);
        when(factory.getBean(TestService.class)).thenReturn(tests);
        when(factory.getBean(ResultLimitService.class)).thenReturn(mock(ResultLimitService.class));
        when(factory.getBean(IStatusService.class)).thenReturn(mock(IStatusService.class));
        results = mock(ResultService.class);
        analyses = mock(AnalysisService.class);
        when(factory.getBean(ResultService.class)).thenReturn(results);
        loader = new ResultsLoadUtility();
        ReflectionTestUtils.setField(loader, "analysisService", analyses);
        ReflectionTestUtils.setField(loader, "resultService", results);
        components = mock(TestResultComponentService.class);
        ReflectionTestUtils.setField(loader, "testResultComponentService", components);
        when(components.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("701", "M"), component("702", "M")));
        SampleEQAService eqa = mock(SampleEQAService.class);
        when(eqa.findBySampleId(301L)).thenReturn(Optional.empty());
        ReflectionTestUtils.setField(loader, "sampleEQAService", eqa);
        Sample sample = mock(Sample.class);
        when(sample.getId()).thenReturn("301");
        when(sample.getReceivedDateForDisplay()).thenReturn("09/14/2026");
        ReflectionTestUtils.setField(loader, "currSample", sample);
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        SampleItem specimen = new SampleItem();
        specimen.setId("201");
        specimen.setSample(sample);
        analysis = new Analysis();
        analysis.setId("101");
        analysis.setTest(test);
        analysis.setSampleItem(specimen);
        analysis.setCompletedDate(Timestamp.valueOf("2026-09-14 10:00:00"));
        analysis.setLastupdated(new Timestamp(2000));
        when(analyses.getTest(analysis)).thenReturn(test);
        when(analyses.getStatusId(analysis)).thenReturn("15");
        when(analyses.getCompletedDateForDisplay(analysis)).thenReturn("09/14/2026");
        when(tests.getPossibleTestResults(test)).thenReturn(List.of());
        when(tests.getResultType(test)).thenReturn("N");
    }

    @After
    public void cleanup() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldForms);
        ReflectionTestUtils.setField(TestIdentityService.class, "instance", oldIdentity);
        ReflectionTestUtils.setField(MessageUtil.class, "instance", oldMessages);
    }

    @Test
    public void rawNumericValueSurvivesTheRealDisplayFormatter() throws Exception {
        ResultServiceImpl formatter = formatter();
        when(factory.getBean(ResultService.class)).thenReturn(formatter);
        Result stored = parent("501");
        stored.setValue("5");
        stored.setSignificantDigits(2);
        TestResultItem row = row(stored, component("701", "N"));
        assertEquals("5.00", row.getResultValue());
        assertEquals("5", row.getRawResultValue());
        assertEquals("501", row.getResultId());
        assertEquals("2000", row.getAnalysisLastupdated());
        assertEquals("15", row.getAnalysisStatusId());
        assertEquals("SIM-READBACK-301", row.getAccessionNumber());
    }

    @Test
    public void rawAlphaValueRetainsParenthesesRemovedByTheDisplayFormatter() throws Exception {
        ResultServiceImpl formatter = formatter();
        when(factory.getBean(ResultService.class)).thenReturn(formatter);
        Result stored = parent("501");
        stored.setResultType("A");
        stored.setValue("SIM text (details)");
        TestResultItem row = row(stored, component("701", "A"));
        assertEquals("SIM text", row.getResultValue());
        assertEquals("SIM text (details)", row.getRawResultValue());
    }

    @Test
    public void rawValueIsReadOnlyInTheJsonContract() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        TestResultItem output = new TestResultItem();
        output.setRawResultValue("5");
        assertEquals("5", mapper.readTree(mapper.writeValueAsString(output)).path("rawResultValue").asText());
        TestResultItem submitted = mapper.readValue("{\"resultValue\":\"7\",\"rawResultValue\":\"forged\"}",
                TestResultItem.class);
        assertEquals("7", submitted.getResultValue());
        assertNull(submitted.getRawResultValue());
        mapper.readerForUpdating(output).readValue("{\"rawResultValue\":\"forged\"}");
        assertEquals("5", output.getRawResultValue());
    }

    @Test
    public void absentResultHasNoInventedRawValueOrQualifiedChild() {
        when(analyses.getQuantifiedResult(analysis)).thenReturn(child("602", parent("502")));
        TestResultItem row = row(null, component("701", "N"));
        assertNull(row.getRawResultValue());
        assertNull(row.getQualifiedResultId());
        assertFalse(row.isHasQualifiedResult());
        verify(results, never()).getChildResults(anyString());
    }

    @Test
    public void qualifiedChildMustBelongToThisExactParentAndAnalysis() {
        Result stored = parent("501");
        Result otherParent = child("602", parent("502"));
        Result otherAnalysis = child("603", stored);
        Analysis foreign = new Analysis();
        foreign.setId("102");
        otherAnalysis.setAnalysis(foreign);
        Result own = child("601", stored);
        when(results.getChildResults("501")).thenReturn(List.of(otherParent, otherAnalysis, own));
        when(analyses.getQuantifiedResult(analysis)).thenReturn(otherParent);
        TestResultItem row = row(stored, component("701", "N"));
        assertEquals("601", row.getQualifiedResultId());
        assertEquals("SIM qualified", row.getQualifiedResultValue());
        assertTrue(row.isHasQualifiedResult());
    }

    @Test
    public void foreignQualifiedChildCannotContaminateRow() {
        Result stored = parent("501");
        Result other = child("602", parent("502"));
        when(results.getChildResults("501")).thenReturn(List.of(other));
        when(analyses.getQuantifiedResult(analysis)).thenReturn(other);
        TestResultItem row = row(stored, component("701", "N"));
        assertNull(row.getQualifiedResultId());
        assertNull(row.getQualifiedResultValue());
        assertFalse(row.isHasQualifiedResult());
    }

    @Test
    public void multiselectAndCascadingValuesAreScopedToTheirOwnComponent() {
        for (String type : List.of("M", "C")) {
            Result first = selection("501", "701", "10", type);
            Result second = selection("502", "702", "20", type);
            when(results.getResultsByAnalysis(analysis)).thenReturn(List.of(first, second));
            when(analyses.getJSONMultiSelectResults(analysis)).thenReturn("{\"0\":\"10,20\"}");
            assertEquals("{\"0\":\"10\"}", row(first, component("701", type)).getMultiSelectResultValues());
            assertEquals("{\"0\":\"20\"}", row(second, component("702", type)).getMultiSelectResultValues());
        }
        verify(analyses, never()).getJSONMultiSelectResults(any(Analysis.class));
    }

    @Test
    public void legacyNullSelectionsBelongOnlyToTheServerPrimary() {
        Result legacy = selection("501", null, "10", "M");
        Result second = selection("502", "702", "20", "M");
        when(results.getResultsByAnalysis(analysis)).thenReturn(List.of(legacy, second));
        assertEquals("{\"0\":\"10\"}", row(legacy, component("701", "M")).getMultiSelectResultValues());
        assertEquals("{\"0\":\"20\"}", row(second, component("702", "M")).getMultiSelectResultValues());
    }

    @Test
    public void qualifiedSelectionMayBelongToAnotherSelectedParentOfTheSameComponent() {
        Result first = selection("501", "701", "10", "M");
        Result same = selection("503", "701", "11", "M");
        Result other = selection("502", "702", "20", "M");
        Result ownChild = child("603", same);
        Result otherChild = child("602", other);
        when(results.getResultsByAnalysis(analysis)).thenReturn(List.of(otherChild, first, same, other, ownChild));
        when(analyses.getQuantifiedResult(analysis)).thenReturn(otherChild);
        TestResultItem row = row(first, component("701", "M"));
        assertEquals("603", row.getQualifiedResultId());
        assertEquals("SIM qualified", row.getQualifiedResultValue());
        assertTrue(row.isHasQualifiedResult());
    }

    @Test
    public void sameDictionaryValueDoesNotJoinAnotherComponentsQualifiedChild() {
        Result first = selection("501", "701", "10", "M");
        Result second = selection("502", "702", "10", "M");
        when(results.getResultsByAnalysis(analysis)).thenReturn(List.of(first, second, child("602", second)));
        TestResultItem row = row(first, component("701", "M"));
        assertEquals("{\"0\":\"10\"}", row.getMultiSelectResultValues());
        assertNull(row.getQualifiedResultId());
    }

    @Test
    public void anotherAnalysisOrMissingParentCannotSupplyAQualifiedSelection() {
        Result first = selection("501", "701", "10", "M");
        Result foreignChild = child("601", first);
        Analysis foreign = new Analysis();
        foreign.setId("102");
        foreignChild.setAnalysis(foreign);
        Result foreignParent = selection("599", "701", "99", "M");
        foreignParent.setAnalysis(foreign);
        Result orphan = child("603", selection("503", "701", "11", "M"));
        when(results.getResultsByAnalysis(analysis)).thenReturn(List.of(first, foreignParent, foreignChild, orphan));
        TestResultItem row = row(first, component("701", "M"));
        assertEquals("{\"0\":\"10\"}", row.getMultiSelectResultValues());
        assertNull(row.getQualifiedResultId());
    }

    @Test
    public void invalidComponentOwnershipFailsClosedInsteadOfMixingResults() {
        when(components.getActiveComponentsByTestId("401"))
                .thenReturn(List.of(component("702", "M")));
        TestResultItem row = row(null, component("702", "M"));
        assertTrue(row.isReadOnly());
        assertEquals("error.results.componentMismatch", row.getResultEntryBlockedReason());
        assertNull(row.getQualifiedResultId());
        assertFalse(row.isHasQualifiedResult());
    }

    @Test
    public void scalarResultFromAnotherComponentIsReadOnlyWithoutQualifiedData() {
        for (String type : List.of("N", "A")) {
            Result stored = selection("501", "702", "SIM original", type);
            assertBlockedScalar(stored, component("701", type));
        }
    }

    @Test
    public void scalarResultFromAnInactiveComponentIsReadOnlyWithoutQualifiedData() {
        for (String type : List.of("N", "A")) {
            TestResultComponent inactive = component("702", type);
            inactive.setIsActive("N");
            when(components.getActiveComponentsByTestId("401")).thenReturn(List.of(component("701", type)));
            Result stored = selection("501", "702", "SIM original", type);
            assertBlockedScalar(stored, inactive);
        }
    }

    @Test
    public void scalarResultUsingAnotherTestsDefinitionIsReadOnlyWithoutQualifiedData() {
        for (String type : List.of("N", "A")) {
            Result stored = selection("501", "701", "SIM original", type);
            org.openelisglobal.test.valueholder.Test foreign = new org.openelisglobal.test.valueholder.Test();
            foreign.setId("402");
            stored.getTestResult().setTest(foreign);
            assertBlockedScalar(stored, component("701", type));
        }
    }

    @Test
    public void scalarResultFromAnotherAnalysisIsReadOnlyWithoutQualifiedData() {
        for (String type : List.of("N", "A")) {
            Result stored = selection("501", "701", "SIM original", type);
            Analysis foreign = new Analysis();
            foreign.setId("102");
            stored.setAnalysis(foreign);
            assertBlockedScalar(stored, component("701", type));
        }
    }

    @Test
    public void scalarResultWithItsOwnDefinitionPreservesOnlyItsQualifiedChild() {
        for (String type : List.of("N", "A")) {
            Result stored = selection("501", "701", "SIM original", type);
            when(results.getChildResults("501")).thenReturn(List.of(child("601", stored)));
            TestResultItem row = row(stored, component("701", type));
            assertFalse(row.isReadOnly());
            assertNull(row.getResultEntryBlockedReason());
            assertEquals("601", row.getQualifiedResultId());
            assertEquals("SIM qualified", row.getQualifiedResultValue());
            assertEquals("SIM original", row.getRawResultValue());
            assertTrue(row.isHasQualifiedResult());
        }
    }

    private void assertBlockedScalar(Result stored, TestResultComponent component) {
        when(results.getChildResults("501")).thenReturn(List.of(child("601", stored)));
        TestResultItem row = row(stored, component);
        assertTrue(row.isReadOnly());
        assertEquals("error.results.componentMismatch", row.getResultEntryBlockedReason());
        assertNull(row.getQualifiedResultId());
        assertNull(row.getQualifiedResultValue());
        assertFalse(row.isHasQualifiedResult());
        assertEquals("SIM original", row.getRawResultValue());
    }

    private Result selection(String id, String componentId, String value, String type) {
        Result result = parent(id);
        result.setResultType(type);
        result.setValue(value);
        TestResult option = new TestResult();
        option.setComponentId(componentId);
        option.setTest(analysis.getTest());
        result.setTestResult(option);
        return result;
    }

    private ResultServiceImpl formatter() throws Exception {
        java.lang.reflect.Constructor<ResultServiceImpl> constructor = ResultServiceImpl.class.getDeclaredConstructor();
        constructor.setAccessible(true);
        return constructor.newInstance();
    }

    private Result parent(String id) {
        Result result = new Result();
        result.setId(id);
        result.setAnalysis(analysis);
        result.setResultType("N");
        return result;
    }

    private Result child(String id, Result parent) {
        Result result = parent(id);
        result.setParentResult(parent);
        result.setResultType("A");
        result.setValue("SIM qualified");
        return result;
    }

    private TestResultComponent component(String id, String type) {
        TestResultComponent component = new TestResultComponent();
        component.setId(id);
        component.setTestId("401");
        component.setResultType(type);
        component.setIsPrimary("701".equals(id));
        component.setIsActive("Y");
        return component;
    }

    private TestResultItem row(Result result, TestResultComponent component) {
        return ReflectionTestUtils.invokeMethod(loader, "createTestResultItem", analysis, null, "", "1", result,
                "SIM-READBACK-301", "", "", "", "", "", "", component);
    }
}
