package org.openelisglobal.program.service.cytology;

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
import org.openelisglobal.program.controller.cytology.CytologySampleForm;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard;
import org.openelisglobal.program.service.SpecialtyCaseWriteGuard.Authorization;
import org.openelisglobal.program.valueholder.cytology.CytologySample;
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

public class CytologyResultReleaseServiceTest {

    private Object previousFactory;

    @Before
    public void rememberFactory() {
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
    }

    @After
    public void restoreFactory() {
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    @Test
    public void cytologyReleaseUsesDedicatedGuardedPersistence() {
        IStatusService statuses = mock(IStatusService.class);
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
        ResultsLoadUtility resultsLoad = mock(ResultsLoadUtility.class);
        resultsLoadReference.set(resultsLoad);

        Sample sample = new Sample();
        sample.setId("301");
        Patient patient = new Patient();
        patient.setId("701");
        SampleItem sampleItem = new SampleItem();
        sampleItem.setId("201");
        sampleItem.setSample(sample);
        org.openelisglobal.test.valueholder.Test test = new org.openelisglobal.test.valueholder.Test();
        test.setId("401");
        Analysis analysis = new Analysis();
        analysis.setId("101");
        analysis.setSampleItem(sampleItem);
        analysis.setTest(test);
        analysis.setStatusId("1");
        analysis.setRevision("1");
        TestResultItem item = new TestResultItem();
        item.setAnalysisId("101");
        item.setIsGroupSeparator(false);
        item.setResultType("N");
        item.setResultValue("7.1");
        item.setTestDate("2026-09-25");
        Analysis foreignAnalysis = new Analysis();
        foreignAnalysis.setId("102");
        foreignAnalysis.setSampleItem(sampleItem);
        foreignAnalysis.setTest(test);
        foreignAnalysis.setStatusId("90");
        foreignAnalysis.setRevision("1");
        TestResultItem foreignItem = new TestResultItem();
        foreignItem.setAnalysisId("102");
        foreignItem.setIsGroupSeparator(false);
        foreignItem.setResultType("N");
        foreignItem.setResultValue("8.2");
        foreignItem.setTestDate("2026-09-25");
        when(resultsLoad.getGroupedTestsForSample(sample)).thenReturn(List.of(item, foreignItem));

        CytologySampleServiceImpl service = org.mockito.Mockito.spy(new CytologySampleServiceImpl());
        SampleService samples = mock(SampleService.class);
        when(samples.getPatient(sample)).thenReturn(patient);
        AnalysisService analyses = mock(AnalysisService.class);
        when(analyses.get(item.getAnalysisId())).thenReturn(analysis);
        LogbookResultsPersistService persistence = mock(LogbookResultsPersistService.class);
        ReflectionTestUtils.setField(service, "sampleService", samples);
        ReflectionTestUtils.setField(service, "analysisService", analyses);
        ReflectionTestUtils.setField(service, "logbookResultsPersistService", persistence);
        SpecialtyCaseWriteGuard writeGuard = mock(SpecialtyCaseWriteGuard.class);
        when(writeGuard.allAnalysesTerminal(eq(sample), anySet())).thenReturn(true);
        ReflectionTestUtils.setField(service, "specialtyCaseWriteGuard", writeGuard);
        Result result = new Result();
        result.setAnalysis(analysis);
        ResultSaveService builder = mock(ResultSaveService.class);
        when(builder.createResultsFromTestResultItem(any(ResultSaveBean.class), anyList())).thenReturn(List.of(result));
        doReturn(builder).when(service).createResultSaveService(any(Analysis.class), eq("11"));

        CytologySample owner = new CytologySample();
        owner.setId(53);
        owner.setSample(sample);
        CytologySampleForm form = new CytologySampleForm();
        form.setSystemUserId("11");
        Authorization authorization = new Authorization("11", Set.of("101"), List.of(analysis),
                List.of(analysis, foreignAnalysis));
        ReflectionTestUtils.invokeMethod(service, "validateCytologySample", owner, form, authorization);

        verify(analyses).get("101");
        verify(analyses, never()).get("102");
        ArgumentCaptor<ResultsUpdateDataSet> data = ArgumentCaptor.forClass(ResultsUpdateDataSet.class);
        ArgumentCaptor<SpecialtyResultRelease> release = ArgumentCaptor.forClass(SpecialtyResultRelease.class);
        verify(persistence).persistSpecialtyReleaseDataSet(data.capture(), anyList(),
                org.mockito.ArgumentMatchers.eq("11"), release.capture());
        assertEquals(SpecialtyResultRelease.Kind.CYTOLOGY, release.getValue().kind());
        assertEquals(1, data.getValue().getNewResults().size());
        assertTrue(data.getValue().getModifiedResults().isEmpty());
        assertEquals(1, data.getValue().getModifiedAnalysis().size());
        Analysis audited = data.getValue().getModifiedAnalysis().get(0);
        assertTrue(audited != analysis);
        assertEquals("11", audited.getSysUserId());
        assertEquals("90", audited.getStatusId());
        assertTrue(audited.getReleasedDate() != null);
        assertTrue(data.getValue().getNewResults().get(0).result.getAnalysis() == audited);
        ArgumentCaptor<Sample> finishedSample = ArgumentCaptor.forClass(Sample.class);
        verify(samples).update(finishedSample.capture());
        assertTrue(finishedSample.getValue() != sample);
        assertEquals("11", finishedSample.getValue().getSysUserId());
        assertEquals("20", finishedSample.getValue().getStatusId());
    }
}
