package org.openelisglobal.report.service.impl;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.provider.service.ProviderService;
import org.openelisglobal.report.ReportingData;
import org.openelisglobal.reportdefinition.service.ReportDefinitionService;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.sampleorganization.service.SampleOrganizationService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.service.TestService;

@RunWith(MockitoJUnitRunner.class)
public class PatientReportServiceImplTest {

    @Mock
    private PatientService patientService;
    @Mock
    private SampleService sampleService;
    @Mock
    private SampleHumanService sampleHumanService;
    @Mock
    private SampleOrganizationService sampleOrganizationService;
    @Mock
    private ProviderService providerService;
    @Mock
    private ReportDefinitionService reportDefinitionService;
    @Mock
    private TestService testService;
    @Mock
    private IStatusService statusService;

    @InjectMocks
    private PatientReportServiceImpl service;

    private Patient patient;

    @Before
    public void setUp() {
        patient = org.mockito.Mockito.mock(Patient.class);
        when(patient.getGender()).thenReturn("M");
        when(reportDefinitionService.getActiveByReportType("PATIENT")).thenReturn(null);
        when(statusService.matches(anyString(), eq(AnalysisStatus.Finalized)))
                .thenAnswer(invocation -> "finalized".equals(invocation.getArgument(0)));
    }

    @Test
    public void buildPatientResultsReport_onlyReturnsFinalizedReportableResultsWithChineseClinicalColumns() {
        TestResultItem finalized = result("finalized", true, "12.0");
        finalized.setPatientName("张三");
        finalized.setHigherCritical(10.0);
        finalized.setNormal(false);

        TestResultItem pending = result("pending", true, "99.9");
        TestResultItem internalOnly = result("finalized", false, "88.8");
        ReportingData report = service.buildReportFromResults(List.of(finalized, pending, internalOnly), patient);

        assertEquals(20, report.getColumns().size());
        assertEquals("实验室编号", report.getColumns().get(0).getHeader());
        assertEquals(1, report.getRows().size());
        assertEquals("张三", report.getRows().get(0).getDataMap().get("patientName"));
        assertEquals("男", report.getRows().get(0).getDataMap().get("patientGender"));
        assertEquals("危急", report.getRows().get(0).getDataMap().get("resultFlag"));
        assertEquals("已审核", report.getRows().get(0).getDataMap().get("analysisStatus"));
    }

    private TestResultItem result(String status, boolean reportable, String value) {
        TestResultItem item = new TestResultItem();
        item.setAnalysisStatusId(status);
        item.setReportable(reportable);
        item.setResultValue(value);
        item.setValid(true);
        item.setNormal(true);
        return item;
    }
}
