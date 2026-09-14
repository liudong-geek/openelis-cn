package org.openelisglobal.result.action.util;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

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
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.ITestIdentityService;
import org.openelisglobal.common.services.StatusService.SampleStatus;
import org.openelisglobal.common.services.TestIdentityService;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO.SpecimenState;
import org.openelisglobal.result.dao.OrdinaryResultSaveStateDAO;
import org.openelisglobal.result.service.ResultEntryWorklistLoaderImpl;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.service.ResultSpecimenAvailabilityService;
import org.openelisglobal.result.service.ResultSpecimenWriteGuard;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.testresultcomponent.service.TestResultComponentService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.support.StaticMessageSource;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Actual shared row builder and pending loader, using SIM read-only resources.
 */
public class ResultsLoadSpecimenAvailabilityTest {
    private Object oldFactory, oldForms, oldIdentity, oldMessages;
    private ResultsLoadUtility loader;
    private Analysis analysis;
    private AnalysisService analyses;
    private TestService tests;
    private OrdinaryResultSaveStateDAO dao;
    private org.openelisglobal.test.valueholder.Test test;

    @Before
    public void setup() {
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
        Map<Class<?>, Object> beans = new HashMap<>();
        DefaultConfigurationProperties config = mock(DefaultConfigurationProperties.class);
        when(config.getPropertyValue(Property.DEFAULT_LANG_LOCALE)).thenReturn("en");
        when(config.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("en");
        when(config.getPropertyValue(Property.AmbiguousDateHolder)).thenReturn("X");
        beans.put(DefaultConfigurationProperties.class, config);
        IStatusService statuses = mock(IStatusService.class);
        when(statuses.getStatusID(SampleStatus.Entered)).thenReturn("10");
        beans.put(IStatusService.class, statuses);
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class, call -> {
            if ("getBean".equals(call.getMethod().getName()) && call.getArguments().length == 1
                    && call.getArgument(0) instanceof Class<?> type)
                return beans.computeIfAbsent(type, key -> mock(key));
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);
        });
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        org.openelisglobal.analyte.valueholder.Analyte conclusion = new org.openelisglobal.analyte.valueholder.Analyte();
        conclusion.setId("801");
        when(factory.getBean(org.openelisglobal.analyte.service.AnalyteService.class)
                .getAnalyteByName(any(org.openelisglobal.analyte.valueholder.Analyte.class), eq(false)))
                .thenReturn(conclusion);
        dao = mock(OrdinaryResultSaveStateDAO.class);
        org.openelisglobal.result.service.ResultIntakeAdmissionTest.allow(dao, "201", "101");
        beans.put(ResultSpecimenAvailabilityService.class, new ResultSpecimenAvailabilityService(dao, statuses));
        loader = new ResultsLoadUtility();
        for (var field : ResultsLoadUtility.class.getDeclaredFields()) {
            if (field.isAnnotationPresent(Autowired.class)) {
                ReflectionTestUtils.setField(loader, field.getName(), factory.getBean(field.getType()));
            }
        }
        analyses = factory.getBean(AnalysisService.class);
        tests = factory.getBean(TestService.class);
        ResultService results = factory.getBean(ResultService.class);
        Sample sample = mock(Sample.class);
        when(sample.getId()).thenReturn("301");
        when(sample.getAccessionNumber()).thenReturn("SIM-RESULT-301");
        when(sample.getReceivedDateForDisplay()).thenReturn("09/14/2026");
        test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        SampleItem tube = new SampleItem();
        tube.setId("201");
        tube.setSortOrder("1");
        tube.setSample(sample);
        tube.setStatusId("10");
        analysis = new Analysis();
        analysis.setId("101");
        analysis.setTest(test);
        analysis.setSampleItem(tube);
        analysis.setCompletedDate(Timestamp.valueOf("2026-09-14 09:00:00"));
        when(analyses.getTest(analysis)).thenReturn(test);
        when(analyses.getTestDisplayName(analysis)).thenReturn("SIM-血常规");
        when(analyses.getStatusId(analysis)).thenReturn("4");
        when(analyses.getCompletedDateForDisplay(analysis)).thenReturn("09/14/2026");
        when(tests.getPossibleTestResults(test)).thenReturn(List.of());
        when(tests.getResultType(test)).thenReturn("N");
        when(results.getResultsByAnalysis(analysis)).thenAnswer(call -> new ArrayList<>());
        when(factory.getBean(TestResultComponentService.class).getActiveComponentsByTestId("401"))
                .thenReturn(List.of());
        when(dao.findSpecimenState("101")).thenReturn(new SpecimenState("101", "401", "201", "301", "10", true, false));
    }

    @After
    public void restore() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", oldFactory);
        ReflectionTestUtils.setField(FormFields.class, "instance", oldForms);
        ReflectionTestUtils.setField(TestIdentityService.class, "instance", oldIdentity);
        ReflectionTestUtils.setField(MessageUtil.class, "instance", oldMessages);
    }

    private void assertBlocked(List<TestResultItem> rows, String reason) {
        assertEquals(1, rows.size());
        assertEquals("101", rows.get(0).getAnalysisId());
        assertTrue(rows.get(0).isReadOnly());
        assertEquals(reason, rows.get(0).getResultEntryBlockedReason());
        verify(dao).findSpecimenState("101");
        verify(dao, never()).lockSpecimen(anyString());
    }

    @Test
    public void pendingLoaderKeepsReturnedRejectedTubeVisibleAndReadOnly() {
        ObjectProvider<ResultsLoadUtility> provider = mock(ObjectProvider.class);
        when(provider.getObject()).thenReturn(loader);
        assertBlocked(new ResultEntryWorklistLoaderImpl(provider).load(List.of(analysis), "701"),
                "error.results.specimenRejected");
    }

    @Test public void accessionSearchUsesTheSameProjection() {
        when(analyses.getPageAnalysisByStatusFromAccession(anyList(), anyList(), eq("SIM-RESULT-301"))).thenReturn(List.of(analysis));
        assertBlocked(loader.getUnfinishedTestResultItemsByAccession("SIM-RESULT-301"), "error.results.specimenRejected");
    }

    @Test public void accessionRangeSearchUsesTheSameProjection() {
        when(analyses.getPageAnalysisByStatusFromAccession(anyList(), anyList(), eq("SIM-RESULT-301"), eq("SIM-RESULT-302"), eq(true), eq(false))).thenReturn(List.of(analysis));
        assertBlocked(loader.getUnfinishedTestResultItemsByAccession("SIM-RESULT-301", "SIM-RESULT-302", true, false), "error.results.specimenRejected");
    }

    @Test public void labUnitSearchUsesTheSameProjection() {
        when(analyses.getAllAnalysisByTestSectionAndStatus(eq("501"), anyList(), anyList())).thenReturn(List.of(analysis));
        assertBlocked(loader.getUnfinishedTestResultItemsInTestSection("501"), "error.results.specimenRejected");
    }

    @Test public void missingTestEarlyRowStillReachesTheSharedProjection() {
        when(analyses.getTest(analysis)).thenReturn(null);
        assertBlocked(loader.getGroupedTestsForAnalysisList(List.of(analysis), true), ResultSpecimenWriteGuard.BLOCKED);
    }

    @Test public void normalReturnedTubeIsNotLabelledAcceptedOrReadOnlyByThisRule() {
        when(dao.findSpecimenState("101")).thenReturn(new SpecimenState("101", "401", "201", "301", "10", false, false));
        List<TestResultItem> rows = loader.getGroupedTestsForAnalysisList(List.of(analysis), true);
        assertEquals(1, rows.size());
        assertFalse(rows.get(0).isReadOnly());
        assertNull(rows.get(0).getResultEntryBlockedReason());
    }
}
