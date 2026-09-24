package org.openelisglobal.program.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.ResultSaveService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.services.StatusService.OrderStatus;
import org.openelisglobal.common.services.serviceBeans.ResultSaveBean;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.program.controller.immunohistochemistry.ImmunohistochemistrySampleForm;
import org.openelisglobal.program.controller.pathology.PathologySampleForm;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Authorization;
import org.openelisglobal.program.valueholder.immunohistochemistry.ImmunohistochemistrySample;
import org.openelisglobal.program.valueholder.pathology.PathologySample;
import org.openelisglobal.result.action.util.ResultsLoadUtility;
import org.openelisglobal.result.action.util.ResultsUpdateDataSet;
import org.openelisglobal.result.service.LogbookResultsPersistService;
import org.openelisglobal.result.service.SpecialtyResultRelease;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sample.valueholder.Sample;
import org.openelisglobal.sampleitem.valueholder.SampleItem;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.test.util.ReflectionTestUtils;

public class SpecialtyResultReleaseServiceTest {

    private Object previousFactory;
    private ResultsLoadUtility resultsLoad;
    private IStatusService statuses;
    private AnalysisService analyses;
    private Sample sample;
    private Analysis analysis;
    private SampleService samples;
    private Patient patient;
    private TestResultItem item;
    private SpecialtyCaseWriteGuard writeGuard;

    @Before
    public void setup() {
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        statuses = mock(IStatusService.class);
        DefaultConfigurationProperties properties = mock(DefaultConfigurationProperties.class);
        when(properties.getPropertyValueUpperCase(Property.StatusRules)).thenReturn("DEFAULT");
        when(statuses.getStatusID(AnalysisStatus.Finalized)).thenReturn("90");
        when(statuses.getStatusID(AnalysisStatus.Canceled)).thenReturn("99");
        when(statuses.getStatusID(AnalysisStatus.NonConforming_depricated)).thenReturn("98");
        when(statuses.getStatusID(OrderStatus.Finished)).thenReturn("20");
        AtomicReference<ResultsLoadUtility> resultsLoadReference = new AtomicReference<>();
        AutowireCapableBeanFactory factory = mock(AutowireCapableBeanFactory.class, invocation -> {
            if (invocation.getMethod().getName().equals("getBean") && invocation.getArguments().length == 1) {
                Object requested = invocation.getArgument(0);
                if (requested == ResultsLoadUtility.class)
                    return resultsLoadReference.get();
                if (requested == IStatusService.class)
                    return statuses;
                if (requested == DefaultConfigurationProperties.class)
                    return properties;
            }
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation);
        });
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        // ResultsLoadUtility has static configuration lookups. Install the minimal
        // Spring test context before Mockito initializes that class.
        resultsLoad = mock(ResultsLoadUtility.class);
        resultsLoadReference.set(resultsLoad);

        sample = new Sample();
        sample.setId("301");
        patient = new Patient();
        patient.setId("701");
        analysis = analysis(sample);
        analysis.setRevision("1");
        item = new TestResultItem();
        item.setAnalysisId("101");
        item.setIsGroupSeparator(false);
        item.setResultType("N");
        item.setResultValue("7.1");
        item.setTestDate("2026-09-25");
        when(resultsLoad.getGroupedTestsForSample(sample)).thenReturn(List.of(item));
    }

    @After
    public void restoreFactory() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    @Test
    public void pathologyReleaseUsesDedicatedGuardedPersistence() {
        PathologySampleServiceImpl service = org.mockito.Mockito.spy(new PathologySampleServiceImpl());
        LogbookResultsPersistService persistence = prepare(service);
        PathologySample owner = new PathologySample();
        owner.setId(51);
        owner.setSample(sample);
        Result result = result(null);
        stubResultBuilder(service, result);
        PathologySampleForm form = new PathologySampleForm();
        form.setSystemUserId("11");

        ReflectionTestUtils.invokeMethod(service, "validatePathologySample", owner, form, authorization());

        verify(analyses).get("101");
        assertDedicatedRelease(persistence, SpecialtyResultRelease.Kind.PATHOLOGY, false);
    }

    @Test
    public void ihcExistingResultIsModifiedInsteadOfSilentlyClassifiedAsNew() {
        ImmunohistochemistrySampleServiceImpl service = org.mockito.Mockito
                .spy(new ImmunohistochemistrySampleServiceImpl());
        LogbookResultsPersistService persistence = prepare(service);
        ImmunohistochemistrySample owner = new ImmunohistochemistrySample();
        owner.setId(52);
        owner.setSample(sample);
        Result result = result("801");
        stubResultBuilder(service, result);
        ImmunohistochemistrySampleForm form = new ImmunohistochemistrySampleForm();
        form.setSystemUserId("11");

        ReflectionTestUtils.invokeMethod(service, "validateImmunohistochemistrySample", owner, form, authorization());

        verify(analyses).get("101");
        assertDedicatedRelease(persistence, SpecialtyResultRelease.Kind.IMMUNOHISTOCHEMISTRY, true);
    }

    @Test
    public void pathologyReleaseExcludesPendingReferredIhcOnTheSameSample() {
        Analysis ihcAnalysis = analysis(sample);
        ihcAnalysis.setId("102");
        ihcAnalysis.setStatusId("1");
        TestResultItem ihcItem = new TestResultItem();
        ihcItem.setAnalysisId("102");
        ihcItem.setIsGroupSeparator(false);
        ihcItem.setResultType("N");
        ihcItem.setResultValue("8.2");
        ihcItem.setTestDate("2026-09-25");
        when(resultsLoad.getGroupedTestsForSample(sample)).thenReturn(List.of(item, ihcItem));

        PathologySampleServiceImpl service = org.mockito.Mockito.spy(new PathologySampleServiceImpl());
        LogbookResultsPersistService persistence = prepare(service);
        when(writeGuard.allAnalysesTerminal(eq(sample), anySet())).thenReturn(false);
        PathologySample owner = new PathologySample();
        owner.setId(51);
        owner.setSample(sample);
        stubResultBuilder(service, result(null));
        PathologySampleForm form = new PathologySampleForm();
        form.setSystemUserId("11");
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(analysis),
                List.of(analysis, ihcAnalysis));

        ReflectionTestUtils.invokeMethod(service, "validatePathologySample", owner, form, authorization);

        verify(analyses).get("101");
        verify(analyses, never()).get("102");
        ArgumentCaptor<ResultsUpdateDataSet> data = ArgumentCaptor.forClass(ResultsUpdateDataSet.class);
        verify(persistence).persistSpecialtyReleaseDataSet(data.capture(), anyList(), eq("11"), any());
        assertEquals(1, data.getValue().getModifiedAnalysis().size());
        assertEquals("101", data.getValue().getModifiedAnalysis().get(0).getId());
        verify(samples, never()).update(any(Sample.class));
    }

    @Test
    public void ihcReleaseExcludesCompletedPathologyAnalysisOnTheSameSample() {
        Analysis pathologyAnalysis = analysis(sample);
        pathologyAnalysis.setId("102");
        pathologyAnalysis.setStatusId("90");
        TestResultItem pathologyItem = new TestResultItem();
        pathologyItem.setAnalysisId("102");
        pathologyItem.setIsGroupSeparator(false);
        pathologyItem.setResultType("N");
        pathologyItem.setResultValue("8.2");
        pathologyItem.setTestDate("2026-09-25");
        when(resultsLoad.getGroupedTestsForSample(sample)).thenReturn(List.of(item, pathologyItem));

        ImmunohistochemistrySampleServiceImpl service = org.mockito.Mockito
                .spy(new ImmunohistochemistrySampleServiceImpl());
        LogbookResultsPersistService persistence = prepare(service);
        ImmunohistochemistrySample owner = new ImmunohistochemistrySample();
        owner.setId(52);
        owner.setSample(sample);
        stubResultBuilder(service, result(null));
        ImmunohistochemistrySampleForm form = new ImmunohistochemistrySampleForm();
        form.setSystemUserId("11");
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(analysis),
                List.of(analysis, pathologyAnalysis));

        ReflectionTestUtils.invokeMethod(service, "validateImmunohistochemistrySample", owner, form, authorization);

        verify(analyses).get("101");
        verify(analyses, never()).get("102");
        ArgumentCaptor<ResultsUpdateDataSet> data = ArgumentCaptor.forClass(ResultsUpdateDataSet.class);
        verify(persistence).persistSpecialtyReleaseDataSet(data.capture(), anyList(), eq("11"), any());
        assertEquals(1, data.getValue().getModifiedAnalysis().size());
        assertEquals("101", data.getValue().getModifiedAnalysis().get(0).getId());
    }

    private LogbookResultsPersistService prepare(Object service) {
        samples = mock(SampleService.class);
        when(samples.getPatient(sample)).thenReturn(patient);
        analyses = mock(AnalysisService.class);
        when(analyses.get(item.getAnalysisId())).thenReturn(analysis);
        LogbookResultsPersistService persistence = mock(LogbookResultsPersistService.class);
        ReflectionTestUtils.setField(service, "sampleService", samples);
        ReflectionTestUtils.setField(service, "analysisService", analyses);
        ReflectionTestUtils.setField(service, "logbookResultsPersistService", persistence);
        writeGuard = mock(SpecialtyCaseWriteGuard.class);
        when(writeGuard.allAnalysesTerminal(eq(sample), anySet())).thenReturn(true);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", writeGuard);
        return persistence;
    }

    private void stubResultBuilder(PathologySampleServiceImpl service, Result result) {
        ResultSaveService builder = mock(ResultSaveService.class);
        when(builder.createResultsFromTestResultItem(any(ResultSaveBean.class), anyList())).thenReturn(List.of(result));
        doReturn(builder).when(service).createResultSaveService(any(Analysis.class), eq("11"));
    }

    private void stubResultBuilder(ImmunohistochemistrySampleServiceImpl service, Result result) {
        ResultSaveService builder = mock(ResultSaveService.class);
        when(builder.createResultsFromTestResultItem(any(ResultSaveBean.class), anyList())).thenReturn(List.of(result));
        doReturn(builder).when(service).createResultSaveService(any(Analysis.class), eq("11"));
    }

    private Result result(String id) {
        Result result = new Result();
        result.setId(id);
        result.setAnalysis(analysis);
        return result;
    }

    private Authorization authorization() {
        return new Authorization("11", Set.of("101"), List.of(analysis), List.of(analysis));
    }

    private Analysis analysis(Sample owner) {
        SampleItem item = new SampleItem();
        item.setId("201");
        item.setSample(owner);
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        Analysis value = new Analysis();
        value.setId("101");
        value.setSampleItem(item);
        value.setTest(test);
        value.setStatusId("1");
        value.setRevision("1");
        return value;
    }

    private void assertDedicatedRelease(LogbookResultsPersistService persistence, SpecialtyResultRelease.Kind kind,
            boolean existing) {
        ArgumentCaptor<ResultsUpdateDataSet> data = ArgumentCaptor.forClass(ResultsUpdateDataSet.class);
        ArgumentCaptor<SpecialtyResultRelease> release = ArgumentCaptor.forClass(SpecialtyResultRelease.class);
        verify(persistence).persistSpecialtyReleaseDataSet(data.capture(), anyList(),
                org.mockito.ArgumentMatchers.eq("11"), release.capture());
        assertEquals(kind, release.getValue().kind());
        assertEquals(existing ? 1 : 0, data.getValue().getModifiedResults().size());
        assertEquals(existing ? 0 : 1, data.getValue().getNewResults().size());
        assertEquals(1, data.getValue().getModifiedAnalysis().size());
        Analysis audited = data.getValue().getModifiedAnalysis().get(0);
        assertTrue("release must use a detached Analysis so the audited update can compare old state",
                audited != analysis);
        assertEquals("11", audited.getSysUserId());
        assertEquals("90", audited.getStatusId());
        assertTrue(audited.getReleasedDate() != null);
        Result releaseResult = existing ? data.getValue().getModifiedResults().get(0).result
                : data.getValue().getNewResults().get(0).result;
        assertTrue("every result must use the same detached Analysis release target",
                releaseResult.getAnalysis() == audited);
        ArgumentCaptor<Sample> finishedSample = ArgumentCaptor.forClass(Sample.class);
        verify(samples).update(finishedSample.capture());
        assertTrue("sample status audit must receive a detached Sample", finishedSample.getValue() != sample);
        assertEquals("11", finishedSample.getValue().getSysUserId());
        assertEquals("20", finishedSample.getValue().getStatusId());
    }
}
