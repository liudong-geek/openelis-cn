package org.openelisglobal.resultvalidation.util;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.paging.PagingProperties;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.ITestIdentityService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.TestIdentityService;
import org.openelisglobal.common.services.beanAdapters.ResultSaveBeanAdapter;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.dictionary.service.DictionaryService;
import org.openelisglobal.dictionary.valueholder.Dictionary;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.referencetables.service.ReferenceTablesService;
import org.openelisglobal.referencetables.valueholder.ReferenceTables;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultvalidation.action.util.ResultValidationItem;
import org.openelisglobal.resultvalidation.action.util.ResultValidationPaging;
import org.openelisglobal.resultvalidation.bean.AnalysisItem;
import org.openelisglobal.resultvalidation.controller.rest.AccessionValidationRestController;
import org.openelisglobal.resultvalidation.form.ResultValidationForm;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.testresult.service.TestResultService;
import org.openelisglobal.testresult.valueholder.TestResult;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.openelisglobal.testresultcomponent.valueholder.TestResultComponent;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;

/** Actual review projection and legacy JSON/cache contracts, with SIM resources only. */
public class AccessionValidationProjectionTest {
    private Object oldFactory, oldForms, oldIdentity, oldMessages;
    private final Map<Class<?>, Object> beans = new HashMap<>();
    private ResultsValidationUtility utility;
    private AnalysisService analyses;
    private ResultService results;
    private TestResultService definitions;
    private TestResultComponentService components;
    private DefaultConfigurationProperties config;
    private Sample sample;
    private org.openelisglobal.test.valueholder.Test test;
    private final ObjectMapper mapper = new ObjectMapper();

    @Before public void setup() {
        oldFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        oldForms = ReflectionTestUtils.getField(FormFields.class, "instance");
        oldIdentity = ReflectionTestUtils.getField(TestIdentityService.class, "instance");
        oldMessages = ReflectionTestUtils.getField(MessageUtil.class, "instance");
        ReflectionTestUtils.setField(FormFields.class, "instance", mock(FormFields.class));
        ReflectionTestUtils.setField(TestIdentityService.class, "instance", mock(ITestIdentityService.class));
        StaticMessageSource source = new StaticMessageSource();
        source.addMessage("time.format.formatKey", Locale.ENGLISH, "HH:mm");
        source.setUseCodeAsDefaultMessage(true);
        MessageUtil.setMessageSource(source);
        config = mock(DefaultConfigurationProperties.class);
        when(config.getPropertyValue(Property.DEFAULT_LANG_LOCALE)).thenReturn("en");
        when(config.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("en");
        when(config.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        when(config.getPropertyValueUpperCase(Property.StatusRules)).thenReturn("DEFAULT");
        beans.put(DefaultConfigurationProperties.class, config);
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class, call -> {
            if ("getBean".equals(call.getMethod().getName()) && call.getArguments().length == 1
                    && call.getArgument(0) instanceof Class<?> type)
                return beans.computeIfAbsent(type, key -> mock(key));
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);
        });
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        ReferenceTables reference = new ReferenceTables();
        reference.setId("901");
        when(factory.getBean(ReferenceTablesService.class).getReferenceTableByName(any(ReferenceTables.class))).thenReturn(reference);
        when(factory.getBean(PagingProperties.class).getValidationPageSize()).thenReturn(20);
        IStatusService statuses = factory.getBean(IStatusService.class);
        when(statuses.getStatusID(AnalysisStatus.TechnicalAcceptance)).thenReturn("4");
        when(statuses.getStatusID(AnalysisStatus.TechnicalRejected)).thenReturn("5");
        utility = new ResultsValidationUtility();
        for (var field : ResultsValidationUtility.class.getDeclaredFields()) {
            if (field.isAnnotationPresent(Autowired.class))
                ReflectionTestUtils.setField(utility, field.getName(), factory.getBean(field.getType()));
        }
        analyses = factory.getBean(AnalysisService.class);
        results = factory.getBean(ResultService.class);
        definitions = factory.getBean(TestResultService.class);
        components = factory.getBean(TestResultComponentService.class);
        sample = mock(Sample.class);
        when(sample.getId()).thenReturn("301");
        when(sample.getStatusId()).thenReturn("10");
        when(sample.getAccessionNumber()).thenReturn("SIM-REVIEW-301");
        test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        test.setDescription("SIM-组合项目");
        test.setSortOrder("1");
        when(factory.getBean(TestService.class).getTestById(any(org.openelisglobal.test.valueholder.Test.class)))
                .thenReturn(test);
        when(results.getResultValue(any(Result.class), eq(false))).thenAnswer(call -> "DISPLAY:" + ((Result) call.getArgument(0)).getValue());
        DictionaryService dictionaries = factory.getBean(DictionaryService.class);
        when(dictionaries.getDataForId(anyString())).thenAnswer(call -> {
            Dictionary dictionary = mock(Dictionary.class);
            when(dictionary.getLocalizedName()).thenReturn("SIM-选项-" + call.getArgument(0));
            return dictionary;
        });
    }

    @After public void restore() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldForms);
        ReflectionTestUtils.setField(TestIdentityService.class, "instance", oldIdentity);
        ReflectionTestUtils.setField(MessageUtil.class, "instance", oldMessages);
    }

    private TestResultComponent component(String id, boolean primary) {
        TestResultComponent component = new TestResultComponent();
        component.setId(id); component.setTestId(test.getId()); component.setIsPrimary(primary); component.setLabel("SIM-" + id);
        return component;
    }

    private Analysis analysis(String id, String tube, String status) {
        SampleItem item = new SampleItem();
        item.setId(tube); item.setSample(sample); item.setSortOrder("1");
        Analysis analysis = new Analysis();
        analysis.setId(id); analysis.setTest(test); analysis.setSampleItem(item); analysis.setStatusId(status);
        analysis.setLastupdated(Timestamp.valueOf("2026-09-16 09:10:11.123456"));
        return analysis;
    }

    private TestResult definition(String id, String component, String type, String value, boolean qualified) {
        TestResult definition = new TestResult();
        definition.setId(id); definition.setTest(test); definition.setComponentId(component); definition.setTestResultType(type);
        definition.setValue(value); definition.setIsQuantifiable(qualified); definition.setSignificantDigits("2");
        return definition;
    }

    private Result result(String id, Analysis analysis, TestResult definition, String value) {
        Result result = new Result();
        result.setId(id); result.setAnalysis(analysis); result.setTestResult(definition); result.setResultType(definition.getTestResultType());
        result.setValue(value); result.setGrouping(1); result.setLastupdated(Timestamp.valueOf("2026-09-15 01:00:00"));
        return result;
    }

    private List<AnalysisItem> project(Analysis... inputs) {
        return utility.testResultListToAnalysisItemList(utility.getGroupedTestsForAnalysisList(List.of(inputs), true));
    }

    @Test public void reviewPatientProjectionUsesActualSampleAndDoesNotReuseAnotherSample() {
        org.openelisglobal.sample.service.SampleService samples = (org.openelisglobal.sample.service.SampleService) beans.get(org.openelisglobal.sample.service.SampleService.class);
        org.openelisglobal.samplehuman.service.SampleHumanService humans = (org.openelisglobal.samplehuman.service.SampleHumanService) beans.get(org.openelisglobal.samplehuman.service.SampleHumanService.class);
        org.openelisglobal.patient.valueholder.Patient patient = mock(org.openelisglobal.patient.valueholder.Patient.class);
        org.openelisglobal.person.valueholder.Person person = new org.openelisglobal.person.valueholder.Person();
        person.setLastName("SIM"); person.setFirstName("Patient");
        when(patient.getPerson()).thenReturn(person);
        when(patient.getNationalId()).thenReturn("SIM-ID"); when(patient.getGender()).thenReturn("F");
        when(patient.getBirthDateForDisplay()).thenReturn("2000-01-01");
        when(samples.get("301")).thenReturn(sample); when(humans.getPatientForSample(sample)).thenReturn(patient);
        AnalysisItem first = new AnalysisItem(), repeated = new AnalysisItem(), missing = new AnalysisItem();
        first.setSampleId("301"); repeated.setSampleId("301"); missing.setSampleId("302");
        missing.setPatientName("STALE"); missing.setPatientInfo("STALE");
        utility.populateReviewPatientInfo(List.of(first, repeated, missing), false);
        assertEquals("SIM Patient", first.getPatientName()); assertEquals("SIM-ID, F, 2000-01-01", first.getPatientInfo());
        assertEquals(first.getPatientInfo(), repeated.getPatientInfo());
        assertEquals("", missing.getPatientName()); assertEquals("", missing.getPatientInfo());
        verify(samples, times(1)).get("301"); verify(humans, times(1)).getPatientForSample(sample);
        verify(samples, never()).getSampleByAccessionNumber(anyString());
    }

    @Test public void maskedReviewClearsAllPatientFieldsWithoutLoadingPatientRecords() {
        AnalysisItem item = new AnalysisItem(); item.setSampleId("301");
        item.setPatientName("PRIVATE NAME"); item.setPatientInfo("PRIVATE IDENTIFIER");
        utility.populateReviewPatientInfo(List.of(item), true);
        assertEquals("---", item.getPatientName()); assertEquals("---", item.getPatientInfo());
        verifyZeroInteractions(beans.get(org.openelisglobal.samplehuman.service.SampleHumanService.class));
        verifyZeroInteractions(beans.get(org.openelisglobal.sample.service.SampleService.class));
    }

    @Test public void reviewPatientWithoutPersonDoesNotCrashOrRetainOldName() {
        org.openelisglobal.patient.valueholder.Patient patient = mock(org.openelisglobal.patient.valueholder.Patient.class);
        when(((org.openelisglobal.sample.service.SampleService) beans.get(org.openelisglobal.sample.service.SampleService.class)).get("301")).thenReturn(sample);
        when(((org.openelisglobal.samplehuman.service.SampleHumanService) beans.get(org.openelisglobal.samplehuman.service.SampleHumanService.class)).getPatientForSample(sample)).thenReturn(patient);
        AnalysisItem item = new AnalysisItem(); item.setSampleId("301"); item.setPatientName("STALE");
        utility.populateReviewPatientInfo(List.of(item), false);
        assertEquals("", item.getPatientName()); assertEquals(", , ", item.getPatientInfo());
    }

    @Test public void actualTubeAndAnalysisVersionRemainDistinctFromDisplayValue() {
        TestResult definition = definition("501", "P", "N", "", false);
        when(definitions.getAllActiveTestResultsPerTest(test)).thenReturn(List.of(definition));
        when(components.getActiveComponentsByTestId("401")).thenReturn(List.of(component("P", true)));
        Analysis first = analysis("101", "201", "4"), second = analysis("102", "202", "4");
        when(results.getResultsByAnalysis(first)).thenReturn(List.of(result("601", first, definition, "0")));
        when(results.getResultsByAnalysis(second)).thenReturn(List.of(result("602", second, definition, "5.2700")));
        List<AnalysisItem> rows = project(first, second);
        assertEquals(2, rows.size());
        assertEquals("301", rows.get(0).getSampleId());
        assertEquals("201", rows.get(0).getSampleItemId());
        assertEquals("202", rows.get(1).getSampleItemId());
        assertEquals("4", rows.get(0).getStatusId());
        assertEquals("101", rows.get(0).getAnalysisId());
        assertEquals("401", rows.get(0).getTestId());
        assertEquals("601", rows.get(0).getResultId());
        assertEquals(first.getLastupdated(), rows.get(0).getLastUpdated());
        assertEquals(String.valueOf(first.getLastupdated().getTime()), rows.get(0).getAnalysisLastupdated());
        assertEquals("0", rows.get(0).getRawResultValue());
        assertEquals("DISPLAY:0", rows.get(0).getResult());
        assertEquals("5.2700", rows.get(1).getRawResultValue());
        assertEquals("5.2700", rows.get(1).getResultMembers().get(0).rawResultValue());
    }

    @Test public void selectionSetsOptionsAndQualifiedMembersStayWithinAnalysisAndComponent() throws Exception {
        TestResult p1 = definition("501", "P", "M", "11", false), p2 = definition("502", "P", "M", "12", true);
        TestResult c1 = definition("503", "C", "C", "21", true), n = definition("504", "N", "N", "", false);
        when(definitions.getAllActiveTestResultsPerTest(test)).thenReturn(List.of(p1, p2, c1, n));
        when(components.getActiveComponentsByTestId("401")).thenReturn(List.of(component("P", true), component("C", false), component("N", false)));
        Analysis analysis = analysis("101", "201", "4");
        Result a = result("601", analysis, p1, "11"), b = result("602", analysis, p2, "12"), c = result("603", analysis, c1, "21");
        Result bChild = result("612", analysis, n, "4.2"), cChild = result("613", analysis, n, "9.8");
        bChild.setParentResult(b); cChild.setParentResult(c);
        when(results.getResultsByAnalysis(analysis)).thenReturn(List.of(a, b, bChild, c, cChild, result("604", analysis, n, "0")));
        List<ResultValidationItem> items = utility.getGroupedTestsForAnalysisList(List.of(analysis), true);
        ResultValidationItem qualified = items.stream().filter(item -> "602".equals(item.getResultId())).findFirst().orElseThrow();
        qualified.setNormalRange("SIM-RANGE"); qualified.setPatientName("SIM-PATIENT");
        List<AnalysisItem> rows = utility.testResultListToAnalysisItemList(items);
        assertEquals(3, rows.size());
        AnalysisItem primary = rows.get(0), secondary = rows.get(1);
        assertEquals("P", primary.getTestResultComponentId());
        assertEquals("11,12", mapper.readTree(primary.getMultiSelectResultValues()).get("1").asText());
        assertEquals("21", mapper.readTree(secondary.getMultiSelectResultValues()).get("1").asText());
        assertEquals(List.of("0", "11", "12"), primary.getDictionaryResults().stream().map(v -> v.getId()).toList());
        assertEquals(List.of("0", "21"), secondary.getDictionaryResults().stream().map(v -> v.getId()).toList());
        assertEquals(List.of("601", "602", "612"), primary.getResultMembers().stream().map(AnalysisItem.ResultMember::resultId).toList());
        assertEquals("602", primary.getResultMembers().get(2).parentResultId());
        assertEquals("P", primary.getResultMembers().get(2).testResultComponentId());
        assertEquals("612", primary.getQualifiedResultId()); assertEquals("4.2", primary.getQualifiedResultValue());
        assertEquals("[12]", primary.getQualifiedDictionaryId()); assertTrue(primary.isHasQualifiedResult());
        assertEquals("SIM-RANGE", primary.getNormalRange()); assertEquals("SIM-PATIENT", primary.getPatientName());
        assertEquals("613", secondary.getQualifiedResultId()); assertEquals("9.8", secondary.getQualifiedResultValue());
        assertEquals("[21]", secondary.getQualifiedDictionaryId());
        assertEquals("0", rows.get(2).getRawResultValue());
        verify(analyses, never()).getJSONMultiSelectResults(any());
    }

    @Test public void historicalNullAndExplicitPrimaryAreOneSelectionSetEvenWithOnlyOneActiveComponent() throws Exception {
        TestResult legacy = definition("501", null, "M", "11", false), explicit = definition("502", "P", "M", "12", false);
        when(definitions.getAllActiveTestResultsPerTest(test)).thenReturn(List.of(legacy, explicit));
        when(components.getActiveComponentsByTestId("401")).thenReturn(List.of(component("P", true)));
        Analysis analysis = analysis("101", "201", "4");
        when(results.getResultsByAnalysis(analysis)).thenReturn(List.of(result("601", analysis, legacy, "11"), result("602", analysis, explicit, "12")));
        List<AnalysisItem> rows = project(analysis);
        assertEquals(1, rows.size()); assertEquals("P", rows.get(0).getTestResultComponentId());
        assertEquals("11,12", mapper.readTree(rows.get(0).getMultiSelectResultValues()).get("1").asText());
        assertEquals(List.of("601", "602"), rows.get(0).getResultMembers().stream().map(AnalysisItem.ResultMember::resultId).toList());
        assertEquals(List.of("0", "11", "12"), rows.get(0).getDictionaryResults().stream().map(v -> v.getId()).toList());
    }

    @Test public void repeatedSelectionGroupsAndOtherAnalysesRetainTheirOwnValues() throws Exception {
        TestResult definition = definition("501", "P", "C", "11", false);
        when(definitions.getAllActiveTestResultsPerTest(test)).thenReturn(List.of(definition));
        when(components.getActiveComponentsByTestId("401")).thenReturn(List.of(component("P", true)));
        Analysis first = analysis("101", "201", "4"), second = analysis("102", "202", "4");
        Result a = result("601", first, definition, "11"), b = result("602", first, definition, "12"), c = result("603", first, definition, "13");
        b.setGrouping(2); c.setGrouping(2);
        when(results.getResultsByAnalysis(first)).thenReturn(List.of(a, b, c));
        when(results.getResultsByAnalysis(second)).thenReturn(List.of(result("604", second, definition, "21")));
        List<AnalysisItem> rows = project(first, second);
        assertEquals(2, rows.size());
        JsonNode groups = mapper.readTree(rows.get(0).getMultiSelectResultValues());
        assertEquals(2, groups.size()); assertEquals("11", groups.get("1").asText()); assertEquals("12,13", groups.get("2").asText());
        assertEquals("21", mapper.readTree(rows.get(1).getMultiSelectResultValues()).get("1").asText());
        assertEquals(List.of("601", "602", "603"), rows.get(0).getResultMembers().stream().map(AnalysisItem.ResultMember::resultId).toList());
        assertEquals(List.of("604"), rows.get(1).getResultMembers().stream().map(AnalysisItem.ResultMember::resultId).toList());
        assertEquals(List.of(1, 2, 2), rows.get(0).getResultMembers().stream().map(AnalysisItem.ResultMember::grouping).toList());
    }

    @Test public void exactAndRangeUseTheSameReadyStatusWhitelistAndRejectedSetting() {
        TestResult definition = definition("501", null, "N", "", false);
        when(definitions.getAllActiveTestResultsPerTest(test)).thenReturn(List.of(definition));
        List<Analysis> all = List.of(analysis("101", "201", "1"), analysis("102", "202", "4"), analysis("103", "203", "5"), analysis("104", "204", "6"));
        for (Analysis analysis : all)
            when(results.getResultsByAnalysis(analysis)).thenReturn(List.of(result("6" + analysis.getId(), analysis, definition, "0")));
        when(analyses.getAnalysesBySampleId("301")).thenReturn(all);
        when(analyses.getPageAnalysisAtAccessionNumberAndStatus(eq("SIM-REVIEW-301"), anyList(), eq(false)))
                .thenAnswer(call -> all.stream().filter(a -> ((List<?>) call.getArgument(1)).contains(a.getStatusId())).toList());
        AccessionValidationRestController controller = mock(AccessionValidationRestController.class, CALLS_REAL_METHODS);
        assertEquals(List.of("4"), controller.getValidationStatus());
        assertEquals(List.of("102"), utility.getValidationAnalysisBySample(sample, controller.getValidationStatus()).stream().map(AnalysisItem::getAnalysisId).toList());
        when(config.isPropertyValueEqual(Property.VALIDATE_REJECTED_TESTS, "true")).thenReturn(true);
        List<String> whitelist = controller.getValidationStatus();
        assertEquals(List.of("4", "5"), whitelist);
        List<String> exact = utility.getValidationAnalysisBySample(sample, whitelist).stream().map(AnalysisItem::getAnalysisId).toList();
        List<String> range = utility.getResultValidationList(whitelist, "", "SIM-REVIEW-301", "").stream().map(AnalysisItem::getAnalysisId).toList();
        assertEquals(List.of("102", "103"), exact); assertEquals(exact, range);
        assertTrue(utility.getValidationAnalysisBySample(sample, List.of()).isEmpty());
        verify(analyses, never()).getAnalysesBySampleIdExcludedByStatusId(anyString(), anySet());
    }

    private AnalysisItem evidenceRow() {
        AnalysisItem row = new AnalysisItem();
        row.setAccessionNumber("SIM-REVIEW-301"); row.setAnalysisId("101"); row.setTestId("401"); row.setResultId("601"); row.setTestResultComponentId("P");
        row.setSampleId("301"); row.setSampleItemId("201"); row.setStatusId("4");
        row.setLastUpdated(Timestamp.valueOf("2026-09-16 09:10:11.123")); row.setAnalysisLastupdated("1789521011123");
        row.setResultType("M"); row.setRawResultValue("11"); row.setResult("DISPLAY"); row.setMultiSelectResultValues("{\"1\":\"11,12\"}");
        row.setResultMembers(List.of(new AnalysisItem.ResultMember("601", "11", "M", "P", null, 1), new AnalysisItem.ResultMember("602", "12", "M", "P", null, 1)));
        return row;
    }

    @Test public void newEvidenceIsSerializedButCannotBeForgedByTheExistingPostContract() throws Exception {
        AnalysisItem row = evidenceRow();
        JsonNode json = mapper.readTree(mapper.writeValueAsString(row));
        assertEquals("201", json.get("sampleItemId").asText());
        assertEquals(row.getAnalysisLastupdated(), json.get("analysisLastupdated").asText());
        assertEquals("11", json.get("rawResultValue").asText()); assertEquals(2, json.get("resultMembers").size());
        AnalysisItem posted = mapper.readValue("{\"analysisId\":\"101\",\"testId\":\"401\",\"resultId\":\"601\",\"testResultComponentId\":\"P\",\"resultType\":\"M\",\"result\":\"0\",\"isAccepted\":true,\"multiSelectResultValues\":\"{\\\"1\\\":\\\"12\\\"}\",\"sampleItemId\":\"999\",\"analysisLastupdated\":\"FAKE\",\"rawResultValue\":\"FAKE\",\"resultMembers\":[{\"resultId\":\"999\"}]}", AnalysisItem.class);
        assertNull(posted.getSampleItemId()); assertNull(posted.getAnalysisLastupdated()); assertNull(posted.getRawResultValue()); assertTrue(posted.getResultMembers().isEmpty());
        assertTrue(posted.getIsAccepted());
        var save = ResultSaveBeanAdapter.fromAnalysisItem(posted);
        assertEquals("0", save.getResultValue()); assertEquals("601", save.getResultId()); assertEquals("P", save.getTestResultComponentId());
        assertEquals("{\"1\":\"12\"}", save.getMultiSelectResultValues());
    }

    @Test public void mismatchedPostedIdentityCannotInheritAnotherRowsEvidence() throws Exception {
        for (String field : List.of("analysisId", "testId", "resultId", "testResultComponentId")) {
            AnalysisItem server = evidenceRow();
            MockHttpServletRequest request = new MockHttpServletRequest();
            ResultValidationPaging paging = new ResultValidationPaging();
            ResultValidationForm form = new ResultValidationForm();
            paging.setDatabaseResults(request, form, List.of(server));
            var json = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(mapper.writeValueAsString(server));
            json.put(field, "999");
            AnalysisItem posted = mapper.treeToValue(json, AnalysisItem.class);
            form.setResultList(List.of(posted)); paging.updatePagedResults(request, form);
            AnalysisItem cached = paging.getResults(request).get(0);
            assertNull(field, cached.getSampleItemId()); assertNull(field, cached.getAnalysisLastupdated());
            assertNull(field, cached.getRawResultValue()); assertTrue(field, cached.getResultMembers().isEmpty());
        }
    }

    @Test public void legacyPostCacheReplacementRetainsServerEvidenceAndAppliesEditableFields() throws Exception {
        AnalysisItem server = evidenceRow();
        MockHttpServletRequest request = new MockHttpServletRequest();
        ResultValidationPaging paging = new ResultValidationPaging();
        ResultValidationForm form = new ResultValidationForm();
        paging.setDatabaseResults(request, form, List.of(server));
        AnalysisItem posted = mapper.readValue(mapper.writeValueAsString(server), AnalysisItem.class);
        posted.setIsAccepted(true); posted.setMultiSelectResultValues("{\"1\":\"12\"}");
        assertNull(posted.getSampleItemId());
        form.setResultList(List.of(posted)); paging.updatePagedResults(request, form);
        AnalysisItem cached = paging.getResults(request).get(0);
        assertTrue(cached.getIsAccepted()); assertEquals("{\"1\":\"12\"}", cached.getMultiSelectResultValues());
        assertEquals("201", cached.getSampleItemId()); assertEquals(server.getAnalysisLastupdated(), cached.getAnalysisLastupdated());
        assertEquals(server.getResultMembers(), cached.getResultMembers()); assertEquals("11", cached.getRawResultValue());
    }
}
