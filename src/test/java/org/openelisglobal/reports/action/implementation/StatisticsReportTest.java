package org.openelisglobal.reports.action.implementation;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Date;
import java.util.Arrays;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.services.DisplayListService.ListType;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.image.service.ImageService;
import org.openelisglobal.internationalization.MessageUtil;
import org.openelisglobal.organization.service.OrganizationService;
import org.openelisglobal.reports.form.ReportForm;
import org.openelisglobal.reports.form.ReportForm.ReceptionTime;
import org.openelisglobal.sample.valueholder.OrderPriority;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.context.MessageSource;
import org.springframework.test.util.ReflectionTestUtils;

public class StatisticsReportTest {

    private AutowireCapableBeanFactory previousFactory;
    private AutowireCapableBeanFactory beanFactory;
    private AnalysisService analysisService;
    private TestService testService;
    private TestSectionService testSectionService;
    private DisplayListService previousDisplayListService;
    private Object previousMessageUtilInstance;

    @Before
    public void setUp() {
        previousFactory = (AutowireCapableBeanFactory) ReflectionTestUtils.getField(SpringContext.class, "factory");
        beanFactory = mock(AutowireCapableBeanFactory.class);
        analysisService = mock(AnalysisService.class);
        testService = mock(TestService.class);
        testSectionService = mock(TestSectionService.class);
        ImageService imageService = mock(ImageService.class);
        DefaultConfigurationProperties configurationProperties = mock(DefaultConfigurationProperties.class);
        MessageSource messageSource = mock(MessageSource.class);
        DisplayListService displayListService = mock(DisplayListService.class);

        when(beanFactory.getBean(ImageService.class)).thenReturn(imageService);
        when(beanFactory.getBean(OrganizationService.class)).thenReturn(mock(OrganizationService.class));
        when(beanFactory.getBean(AnalysisService.class)).thenReturn(analysisService);
        when(beanFactory.getBean(TestService.class)).thenReturn(testService);
        when(beanFactory.getBean(TestSectionService.class)).thenReturn(testSectionService);
        when(beanFactory.getBean(DefaultConfigurationProperties.class)).thenReturn(configurationProperties);
        when(configurationProperties.getPropertyValue(any(Property.class)))
                .thenAnswer(invocation -> invocation.getArgument(0) == Property.DEFAULT_DATE_LOCALE ? "en-US"
                        : "test-value");
        when(imageService.getImageBySiteInfoName(anyString())).thenReturn(Optional.empty());
        when(messageSource.getMessage(anyString(), any(), anyString(), any(Locale.class)))
                .thenAnswer(invocation -> "date.format.formatKey".equals(invocation.getArgument(0)) ? "MM/dd/yyyy"
                        : invocation.getArgument(2));
        when(displayListService.getList(ListType.ORDER_PRIORITY))
                .thenReturn(Arrays.stream(OrderPriority.values())
                        .map(value -> new IdValuePair(value.name(), value.name())).toList());

        previousDisplayListService = (DisplayListService) ReflectionTestUtils.getField(DisplayListService.class,
                "instance");
        previousMessageUtilInstance = ReflectionTestUtils.getField(MessageUtil.class, "instance");
        ReflectionTestUtils.setField(DisplayListService.class, "instance", displayListService);
        MessageUtil.setMessageSource(messageSource);
        ReflectionTestUtils.setField(SpringContext.class, "factory", beanFactory);
    }

    @After
    public void tearDown() {
        ReflectionTestUtils.setField(DisplayListService.class, "instance", previousDisplayListService);
        ReflectionTestUtils.setField(MessageUtil.class, "instance", previousMessageUtilInstance);
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    @Test
    public void emptyFiltersResolveToAllAvailableValues() {
        TestSection chemistry = testSection("101");
        TestSection hematology = testSection("102");

        assertEquals(List.of("101", "102"),
                StatisticsReport.resolveLabSectionIds(null, Arrays.asList(chemistry, null, hematology)));
        assertEquals(List.of(OrderPriority.values()), StatisticsReport.resolvePriorities(null));
        assertEquals(List.of(ReceptionTime.values()), StatisticsReport.resolveReceptionTimes(List.of()));
    }

    @Test
    public void explicitFiltersArePreservedAndSanitized() {
        assertEquals(List.of("102"),
                StatisticsReport.resolveLabSectionIds(Arrays.asList(null, " ", "102", "102"), List.of()));
        assertEquals(List.of(OrderPriority.STAT),
                StatisticsReport.resolvePriorities(Arrays.asList(null, OrderPriority.STAT, OrderPriority.STAT)));
        assertEquals(List.of(ReceptionTime.NORMAL_WORK_HOURS), StatisticsReport.resolveReceptionTimes(
                Arrays.asList(null, ReceptionTime.NORMAL_WORK_HOURS, ReceptionTime.NORMAL_WORK_HOURS)));
    }

    @Test
    public void invalidYearFallsBackToCurrentYear() {
        int currentYear = Calendar.getInstance().get(Calendar.YEAR);

        assertEquals(currentYear, StatisticsReport.resolveReportYear(null));
        assertEquals(currentYear, StatisticsReport.resolveReportYear(""));
        assertEquals(currentYear, StatisticsReport.resolveReportYear("not-a-year"));
        assertEquals(currentYear, StatisticsReport.resolveReportYear("2008"));
        assertEquals(2009, StatisticsReport.resolveReportYear("2009"));
        assertEquals(currentYear, StatisticsReport.resolveReportYear(String.valueOf(currentYear + 1)));
        assertEquals(currentYear - 1, StatisticsReport.resolveReportYear(String.valueOf(currentYear - 1)));
    }

    @Test
    public void reportDataDefaultsEmptyRequestToCurrentYearAndAllActiveLabUnits() {
        org.openelisglobal.test.valueholder.Test activeTest = new org.openelisglobal.test.valueholder.Test();
        activeTest.setId("501");
        when(testService.getAllActiveTests(anyBoolean())).thenReturn(List.of(activeTest));
        when(testSectionService.getAllActiveTestSections())
                .thenReturn(List.of(testSection("101"), testSection("102")));
        when(analysisService.getAnalysisByTestIdAndTestSectionIdsAndStartedInDateRange(any(Date.class),
                any(Date.class), anyString(), anyList())).thenReturn(null);

        new StatisticsReport().createReportData(new ReportForm());

        ArgumentCaptor<Date> lowDate = ArgumentCaptor.forClass(Date.class);
        ArgumentCaptor<Date> highDate = ArgumentCaptor.forClass(Date.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> sectionIds = ArgumentCaptor.forClass(List.class);
        verify(analysisService).getAnalysisByTestIdAndTestSectionIdsAndStartedInDateRange(lowDate.capture(),
                highDate.capture(), anyString(), sectionIds.capture());
        assertEquals(List.of("101", "102"), sectionIds.getValue());
        assertEquals(Calendar.getInstance().get(Calendar.YEAR), yearOf(lowDate.getValue()));
        assertEquals(Calendar.getInstance().get(Calendar.YEAR), yearOf(highDate.getValue()));
        assertTrue(lowDate.getValue().before(highDate.getValue()));
    }

    @Test
    public void initializeReportAcceptsNullFilterListsAsAllRanges() {
        TestSection chemistry = testSection("101");
        chemistry.setTestSectionName("Chemistry");
        when(testSectionService.getAllActiveTestSections()).thenReturn(List.of(chemistry));
        when(testSectionService.getTestSectionById("101")).thenReturn(chemistry);
        when(testSectionService.getUserLocalizedTesSectionName(chemistry)).thenReturn("Chemistry");
        when(testService.getAllActiveTests(false)).thenReturn(List.of());

        StatisticsReport report = new StatisticsReport();
        ReportForm form = new ReportForm();

        report.initializeReport(form);

        Map<String, Object> parameters = report.getReportParameters();
        assertTrue(parameters.get("year").toString()
                .contains(String.valueOf(Calendar.getInstance().get(Calendar.YEAR))));
        assertTrue(parameters.get("labUnits").toString().contains("Chemistry"));
        assertTrue(parameters.get("priority").toString().contains(OrderPriority.ROUTINE.name()));
        assertTrue(parameters.get("workHours").toString().contains("report.normalWorkingHours"));
    }

    private static TestSection testSection(String id) {
        TestSection section = new TestSection();
        section.setId(id);
        return section;
    }

    private static int yearOf(Date date) {
        Calendar calendar = Calendar.getInstance();
        calendar.setTime(date);
        return calendar.get(Calendar.YEAR);
    }
}
