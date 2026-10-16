package org.openelisglobal.report.service.impl;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.itextpdf.text.pdf.PdfReader;
import com.itextpdf.text.pdf.parser.PdfTextExtractor;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.formfields.FormFields;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService.AnalysisStatus;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.service.PatientServiceImpl;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.service.PersonServiceImpl;
import org.openelisglobal.person.valueholder.Person;
import org.openelisglobal.provider.service.ProviderService;
import org.openelisglobal.report.ReportingData;
import org.openelisglobal.reportdefinition.service.ReportDefinitionService;
import org.openelisglobal.reportdefinition.valueholder.ReportDefinition;
import org.openelisglobal.result.action.util.ResultsLoadUtility;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.sampleorganization.service.SampleOrganizationService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.service.TestService;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

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
    @Mock
    private AnalysisService analysisService;
    @Mock
    private UserService userService;

    @InjectMocks
    private PatientReportServiceImpl service;

    private Patient patient;
    private Object previousFactory;
    private Object previousFormFields;
    private boolean contextInstalled;

    @Before
    public void setUp() {
        patient = new Patient();
        patient.setGender("M");
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

    @Test
    public void patientPreviewPdfUsesPatientNameWhenProjectionContainsOnlyWhitespace() throws Exception {
        assertPatientNameInPdf(" ", "王, 芳");
    }

    @Test
    public void patientPreviewPdfUsesPatientNameWhenProjectionIsNull() throws Exception {
        assertPatientNameInPdf(null, "王, 芳");
    }

    @Test
    public void patientPreviewPdfUsesPatientNameWhenProjectionIsEmpty() throws Exception {
        assertPatientNameInPdf("", "王, 芳");
    }

    @Test
    public void patientPreviewPdfPreservesNonblankProjectedName() throws Exception {
        assertPatientNameInPdf("  已投影姓名  ", "  已投影姓名  ");
    }

    @Test
    public void patientPreviewPdfKeepsMissingPersonNameEmpty() throws Exception {
        assertPatientNameInPdf(null, "", null);
    }

    @Test
    public void patientPreviewPdfKeepsMissingFirstAndLastNamesEmpty() throws Exception {
        assertPatientNameInPdf(null, "", new Person());
    }

    @Test
    public void patientPreviewPdfKeepsOnlyKnownFirstName() throws Exception {
        Person person = new Person();
        person.setFirstName("芳");
        assertPatientNameInPdf(null, "芳", person);
    }

    @Test
    public void patientPreviewPdfKeepsOnlyKnownLastName() throws Exception {
        Person person = new Person();
        person.setLastName("王");
        assertPatientNameInPdf(null, "王", person);
    }

    @After
    public void clearAuthentication() {
        SecurityContextHolder.clearContext();
        if (contextInstalled) {
            ReflectionTestUtils.setField(FormFields.class, "instance", previousFormFields);
            ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
        }
    }

    @Test
    public void patientPdfIncludesClinicalFieldsWhileJsonKeepsCustomColumnsAndBothKeepVisibleFinalRows()
            throws Exception {
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        previousFormFields = ReflectionTestUtils.getField(FormFields.class, "instance");
        var factory = mock(AutowireCapableBeanFactory.class);
        org.mockito.Mockito.lenient().when(factory.getBean(DefaultConfigurationProperties.class))
                .thenReturn(mock(DefaultConfigurationProperties.class));
        contextInstalled = true;
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        String[] keys = { "accessionNumber", "patientName", "patientExternalId", "patientGender", "patientDateOfBirth",
                "organizationName", "sampleCollectionDate", "sampleReceivedDate", "clinicianName", "testName",
                "testDescription", "analysisStatus", "resultValue" };
        ReportDefinition definition = new ReportDefinition();
        definition.setDefinitionJson("{\"columns\":["
                + java.util.Arrays.stream(keys).map(key -> "{\"key\":\"" + key + "\",\"type\":\"String\"}")
                        .collect(java.util.stream.Collectors.joining(","))
                + "]}");
        when(reportDefinitionService.getActiveByReportType("PATIENT")).thenReturn(definition);
        patient.setId("19");
        when(patientService.getData("19")).thenReturn(patient);
        TestResultItem visible = result("finalized", true, "6.20");
        visible.setPatientName("已投影姓名");
        visible.setAnalysisId("401");
        visible.setTestName("白细胞计数");
        visible.setSampleType("全血");
        visible.setUnitsOfMeasure("mille/mm3");
        visible.setNormalRange("4.00-10.00");
        TestResultItem pending = result("pending", true, "91.11");
        pending.setAnalysisId("402");
        TestResultItem nonreportable = result("finalized", false, "92.22");
        nonreportable.setAnalysisId("403");
        TestResultItem unauthorized = result("finalized", true, "93.33");
        unauthorized.setAnalysisId("404");
        List<TestResultItem> projected = List.of(visible, pending, nonreportable, unauthorized);
        ResultsLoadUtility utility = mock(ResultsLoadUtility.class);
        @SuppressWarnings("unchecked")
        ObjectProvider<ResultsLoadUtility> provider = mock(ObjectProvider.class);
        when(provider.getObject()).thenReturn(utility);
        when(utility.getGroupedTestsForPatient(patient)).thenReturn(projected);
        ReflectionTestUtils.setField(service, "resultsLoadUtilityProvider", provider);
        ReflectionTestUtils.setField(service, "patientReportPdfRenderer", new ChinesePatientReportPdfRenderer());
        List<Analysis> actual = projected.stream().map(row -> {
            Analysis analysis = new Analysis();
            analysis.setId(row.getAnalysisId());
            return analysis;
        }).toList();
        when(analysisService.get(List.of("401", "402", "403", "404"))).thenReturn(actual);
        when(userService.filterAnalysesByLabUnitRoles(eq("7"), anyList(), eq(Constants.ROLE_REPORTS)))
                .thenReturn(actual.subList(0, 3));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("7", "unused",
                List.of(new SimpleGrantedAuthority("ROLE_REPORTS"))));

        ReportingData json = service.buildPatientResultsReport("19", "7");
        assertEquals(List.of(keys), json.getColumns().stream().map(column -> column.getKey()).toList());
        assertEquals(1, json.getRows().size());
        assertEquals("6.20", json.getRows().get(0).getDataMap().get("resultValue"));
        assertFalse(json.getRows().get(0).getDataMap().containsKey("unitsOfMeasure"));
        PdfReader reader = new PdfReader(service.buildPatientResultsPdf("19", "7"));
        try {
            String text = PdfTextExtractor.getTextFromPage(reader, 1);
            assertTrue(text.contains("已投影姓名"));
            assertTrue(text.contains("白细胞计数"));
            assertTrue(text.contains("6.20"));
            assertTrue("PDF must include specimen type independently of custom table columns", text.contains("全血"));
            assertTrue(text.contains("mille/mm3"));
            assertTrue(text.contains("4.00-10.00"));
            assertTrue(text.contains("正常"));
            assertFalse(text.contains("91.11"));
            assertFalse(text.contains("92.22"));
            assertFalse(text.contains("93.33"));
        } finally {
            reader.close();
        }
    }

    private void assertPatientNameInPdf(String projectedName, String expectedName) throws Exception {
        Person person = new Person();
        person.setLastName("王");
        person.setFirstName("芳");
        assertPatientNameInPdf(projectedName, expectedName, person);
    }

    private void assertPatientNameInPdf(String projectedName, String expectedName, Person person) throws Exception {
        patient.setPerson(person);
        patient.setExternalId("PDF-NAME-TEST");
        PatientServiceImpl nameService = BeanUtils.instantiateClass(PatientServiceImpl.class);
        ReflectionTestUtils.setField(nameService, "personService", new PersonServiceImpl());
        ReflectionTestUtils.setField(service, "patientService", nameService);

        TestResultItem finalized = result("finalized", true, "6.20");
        finalized.setPatientName(projectedName);
        finalized.setTestName("白细胞计数");
        ReportingData report = service.buildReportFromResults(List.of(finalized), patient);
        byte[] pdf = new ChinesePatientReportPdfRenderer().render(report);
        PdfReader reader = new PdfReader(pdf);
        try {
            String text = PdfTextExtractor.getTextFromPage(reader, 1);
            if (!expectedName.isEmpty()) {
                assertTrue("The generated PDF must contain the patient's name", text.contains(expectedName.trim()));
            }
            assertFalse(text.contains("null"));
            assertTrue(text.contains("PDF-NAME-TEST"));
            assertTrue(text.contains("白细胞计数"));
            assertTrue(text.contains("6.20"));
            assertEquals(expectedName, report.getRows().get(0).getDataMap().get("patientName"));
        } finally {
            reader.close();
        }
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
