package org.openelisglobal.result.controller.rest;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.analysis.service.AnalysisService;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.paging.PagingProperties;
import org.openelisglobal.common.services.IStatusService;
import org.openelisglobal.common.services.StatusService;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.config.AppConfig;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.patient.service.PatientService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.referral.service.ReferralTypeService;
import org.openelisglobal.result.action.util.ResultsLoadUtility;
import org.openelisglobal.result.action.util.ResultsPaging;
import org.openelisglobal.result.form.LogbookResultsForm;
import org.openelisglobal.sample.service.SampleService;
import org.openelisglobal.sampleitem.service.SampleItemService;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.openelisglobal.test.service.TestSectionService;
import org.openelisglobal.test.valueholder.TestSection;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.servlet.HandlerInterceptor;

public class LogbookResultsEmptyQueryMvcTest {
    private MockMvc mvc;
    private LogbookResultsRestController controller;
    private AutowireCapableBeanFactory factory;
    private ResultsLoadUtility loader;
    private UserService users;
    private MockHttpSession session;
    private Object previousContext;
    private Object previousFactory;

    @Before
    public void setup() {
        previousContext = ReflectionTestUtils.getField(SpringContext.class, "context");
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        factory = mock(AutowireCapableBeanFactory.class);
        var settings = mock(DefaultConfigurationProperties.class);
        when(settings.getPropertyValue(Property.DEFAULT_DATE_LOCALE)).thenReturn("zh-CN");
        when(settings.getPropertyValueUpperCase(Property.StatusRules)).thenReturn("HAITI");
        when(factory.getBean(DefaultConfigurationProperties.class)).thenReturn(settings);
        var pagingProperties = new PagingProperties();
        pagingProperties.setResultsPageSize(99);
        when(factory.getBean(PagingProperties.class)).thenReturn(pagingProperties);
        ReflectionTestUtils.setField(SpringContext.class, "factory", factory);
        loader = mock(ResultsLoadUtility.class);
        when(factory.getBean(ResultsLoadUtility.class)).thenReturn(loader);
        when(loader.getUnfinishedTestResultItemsByAccession("UNMATCHED-ACCESSION")).thenReturn(List.of());
        controller = new LogbookResultsRestController(mock(ReferralTypeService.class));
        users = mock(UserService.class);
        ReflectionTestUtils.setField(controller, "userService", users);
        mvc = MockMvcBuilders.standaloneSetup(controller)
                .setMessageConverters(new AppConfig().jacksonMessageConverter())
                .addInterceptors(new HandlerInterceptor() {
                    @Override
                    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
                        ReflectionTestUtils.setField(controller, "request", request);
                        return true;
                    }
                }).build();
        session = new MockHttpSession();
        var actor = new UserSessionData();
        actor.setSytemUserId(2);
        session.setAttribute(IActionConstants.USER_SESSION_DATA, actor);
    }

    @After
    public void restoreSpringContext() {
        ReflectionTestUtils.setField(SpringContext.class, "context", previousContext);
        ReflectionTestUtils.setField(SpringContext.class, "factory", previousFactory);
    }

    @Test
    public void unmatchedAccessionReturnsAnExplicitEmptyResultArrayAndFinishedSearch() throws Exception {
        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "UNMATCHED-ACCESSION")
                .param("doRange", "false")).andExpect(status().isOk()).andExpect(jsonPath("$.testResult").isArray())
                .andExpect(jsonPath("$.testResult").isEmpty()).andExpect(jsonPath("$.searchFinished").value(true));
        verify(loader).setSysUser("2");
        verify(loader).getUnfinishedTestResultItemsByAccession("UNMATCHED-ACCESSION");
    }

    @Test
    public void unmatchedAccessionReplacesThePreviousPageAndItsSearchMapping() throws Exception {
        var previous = new TestResultItem();
        previous.setAnalysisId("101");
        previous.setAccessionNumber("PREVIOUS-ACCESSION");
        var seedRequest = new MockHttpServletRequest();
        seedRequest.setSession(session);
        var previousForm = new LogbookResultsForm();
        new ResultsPaging().setDatabaseResults(seedRequest, previousForm, List.of(previous));
        assertEquals(1, previousForm.getTestResult().size());
        assertEquals("PREVIOUS-ACCESSION", previousForm.getPaging().getSearchTermToPage().get(0).getId());

        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "UNMATCHED-ACCESSION")
                .param("doRange", "false")).andExpect(status().isOk());
        mvc.perform(get("/rest/LogbookResults").session(session).param("page", "1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.testResult").isArray()).andExpect(jsonPath("$.testResult").isEmpty())
                .andExpect(jsonPath("$.paging.searchTermToPage").isEmpty())
                .andExpect(jsonPath("$.paging.currentPage").value("1"));
    }

    @Test
    public void rangeWithoutMatchesHasTheSameCompletedEmptyContract() throws Exception {
        when(loader.getUnfinishedTestResultItemsByAccession("LOWER-ACCESSION", "UPPER-ACCESSION", true, true))
            .thenReturn(List.of());
        mvc.perform(get("/rest/LogbookResults").session(session)
                .param("labNumber", "LOWER-ACCESSION").param("upperRangeAccessionNumber", "UPPER-ACCESSION")
                .param("doRange", "true").param("finished", "true"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.testResult").isEmpty())
            .andExpect(jsonPath("$.searchFinished").value(true));
        verify(loader).setSysUser("2");
        verify(loader).getUnfinishedTestResultItemsByAccession("LOWER-ACCESSION", "UPPER-ACCESSION", true, true);
    }

    @Test
    public void aFoundResultStillPassesThroughTheSameActorAndLabUnitRoleFilter() throws Exception {
        var restricted = new TestResultItem();
        restricted.setAnalysisId("102");
        restricted.setAccessionNumber("MATCHED-ACCESSION");
        var found = List.of(restricted);
        when(loader.getUnfinishedTestResultItemsByAccession("MATCHED-ACCESSION")).thenReturn(found);
        when(users.filterResultsByLabUnitRoles("2", found, Constants.ROLE_RESULTS)).thenReturn(List.of());
        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "MATCHED-ACCESSION")
                .param("doRange", "false")).andExpect(status().isOk()).andExpect(jsonPath("$.testResult").isEmpty())
                .andExpect(jsonPath("$.searchFinished").value(true));
        verify(loader).setSysUser("2");
        verify(users).filterResultsByLabUnitRoles("2", found, Constants.ROLE_RESULTS);
    }

    private TestResultItem item(String id, String accession, String testId, String sampleItemId) {
        var item = new TestResultItem();
        item.setAnalysisId(id);
        item.setAccessionNumber(accession);
        item.setTestId(testId);
        item.setSampleItemId(sampleItemId);
        item.setTestName("Known test " + testId);
        item.setAnalysisLastupdated("1792003905245");
        return item;
    }

    private List<TestResultItem> configureCombinedQueryRows() {
        var status = mock(IStatusService.class);
        when(factory.getBean(IStatusService.class)).thenReturn(status);
        when(status.getStatusID(any(StatusService.AnalysisStatus.class)))
                .thenAnswer(invocation -> invocation.getArgument(0).toString());
        var analysis = mock(AnalysisService.class);
        ReflectionTestUtils.setField(controller, "analysisService", analysis);
        ReflectionTestUtils.setField(controller, "sampleService", mock(SampleService.class));
        ReflectionTestUtils.setField(controller, "sampleItemService", mock(SampleItemService.class));
        var sections = mock(TestSectionService.class);
        var section117 = mock(TestSection.class);
        when(section117.getId()).thenReturn("117");
        when(section117.getLocalizedName()).thenReturn("Unit 117");
        var section36 = mock(TestSection.class);
        when(section36.getId()).thenReturn("36");
        when(sections.get("117")).thenReturn(section117);
        ReflectionTestUtils.setField(controller, "testSectionService", sections);
        var target = mock(Analysis.class);
        when(target.getId()).thenReturn("101");
        when(target.getTestSection()).thenReturn(section117);
        var anotherAccession = mock(Analysis.class);
        when(anotherAccession.getId()).thenReturn("102");
        when(anotherAccession.getTestSection()).thenReturn(section117);
        var anotherSection = mock(Analysis.class);
        when(anotherSection.getId()).thenReturn("103");
        when(anotherSection.getTestSection()).thenReturn(section36);
        when(analysis.getAnalysisCollectedOnExcludedByStatusId(any(java.sql.Date.class), anySet()))
                .thenReturn(new ArrayList<>(List.of(target, anotherAccession, anotherSection)));
        when(analysis.getAnalysesForStatusId("4")).thenReturn(List.of(target, anotherAccession));
        var targetRow = item("101", "MATCHED-ACCESSION", "31", "2");
        var otherAccessionRow = item("102", "OTHER-ACCESSION", "39", "6");
        var otherSectionRow = item("103", "MATCHED-ACCESSION", "13", "3");
        var byId = Map.of("101", targetRow, "102", otherAccessionRow, "103", otherSectionRow);
        when(loader.getGroupedTestsForAnalysisList(anyList(), eq(false))).thenAnswer(invocation -> {
            List<Analysis> selected = invocation.getArgument(0);
            var rows = new ArrayList<TestResultItem>();
            for (var entry : selected)
                rows.add(byId.get(entry.getId()));
            return rows;
        });
        when(loader.getUnfinishedTestResultItemsInTestSection("117")).thenReturn(List.of(targetRow, otherAccessionRow));
        when(loader.getUnfinishedTestResultItemsByAccession("MATCHED-ACCESSION"))
                .thenReturn(List.of(targetRow, otherSectionRow));
        when(users.filterResultsByLabUnitRoles(eq("2"), anyList(), eq(Constants.ROLE_RESULTS)))
                .thenAnswer(invocation -> new ArrayList<TestResultItem>(invocation.getArgument(1)));
        return List.of(targetRow, otherAccessionRow, otherSectionRow);
    }

    @Test
    public void accessionAndUnitIntersectInsteadOfReturningAnotherAccession() throws Exception {
        configureCombinedQueryRows();
        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "MATCHED-ACCESSION")
                .param("testSectionId", "117").param("doRange", "false")).andExpect(status().isOk())
                .andExpect(jsonPath("$.testResult.length()").value(1))
                .andExpect(jsonPath("$.testResult[0].analysisId").value("101"))
                .andExpect(jsonPath("$.testResult[0].accessionNumber").value("MATCHED-ACCESSION"));
    }

    @Test
    public void accessionAndCollectionDateKeepEveryMatchingSectionAndExcludeOtherAccessions() throws Exception {
        configureCombinedQueryRows();
        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "MATCHED-ACCESSION")
                .param("collectionDate", "2026/10/14").param("doRange", "false")).andExpect(status().isOk())
                .andExpect(jsonPath("$.testResult.length()").value(2))
                .andExpect(jsonPath("$.testResult[0].analysisId").value("101"))
                .andExpect(jsonPath("$.testResult[1].analysisId").value("103"));
    }

    @Test
    public void accessionUnitAndDateReturnOnlyTheOriginalAnalysisAndVersion() throws Exception {
        configureCombinedQueryRows();
        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "MATCHED-ACCESSION")
                .param("testSectionId", "117").param("collectionDate", "2026/10/14").param("doRange", "false"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.testResult.length()").value(1))
                .andExpect(jsonPath("$.testResult[0].analysisId").value("101"))
                .andExpect(jsonPath("$.testResult[0].testId").value("31"))
                .andExpect(jsonPath("$.testResult[0].sampleItemId").value("2"))
                .andExpect(jsonPath("$.testResult[0].analysisLastupdated").value("1792003905245"));
    }

    @Test
    public void combinedQueryRetainsTheExistingStatusIntersection() throws Exception {
        configureCombinedQueryRows();
        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "MATCHED-ACCESSION")
                .param("collectionDate", "2026/10/14").param("selectedAnalysisStatus", "4").param("doRange", "false"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.testResult.length()").value(1))
                .andExpect(jsonPath("$.testResult[0].analysisId").value("101"));
    }

    @Test
    public void unitAndDateWithoutAccessionRetainBothExistingMatches() throws Exception {
        configureCombinedQueryRows();
        mvc.perform(get("/rest/LogbookResults").session(session).param("testSectionId", "117")
                .param("collectionDate", "2026/10/14").param("doRange", "false")).andExpect(status().isOk())
                .andExpect(jsonPath("$.testResult.length()").value(2))
                .andExpect(jsonPath("$.testResult[0].analysisId").value("101"))
                .andExpect(jsonPath("$.testResult[1].analysisId").value("102"));
    }

    @Test
    public void roleExcludedTargetCannotReturnAfterAccessionIntersection() throws Exception {
        var rows = configureCombinedQueryRows();
        when(users.filterResultsByLabUnitRoles(eq("2"), anyList(), eq(Constants.ROLE_RESULTS)))
                .thenReturn(List.of(rows.get(1)));
        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "MATCHED-ACCESSION")
                .param("testSectionId", "117").param("collectionDate", "2026/10/14").param("doRange", "false"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.testResult").isEmpty());
        verify(users).filterResultsByLabUnitRoles("2", List.of(rows.get(0), rows.get(1)), Constants.ROLE_RESULTS);
    }

    @Test
    public void emptyIntersectionReplacesThePreviousSameSessionPageAndSearchMap() throws Exception {
        configureCombinedQueryRows();
        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "MATCHED-ACCESSION")
                .param("doRange", "false")).andExpect(status().isOk())
                .andExpect(jsonPath("$.testResult.length()").value(2));
        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "UNMATCHED-ACCESSION")
                .param("testSectionId", "117").param("collectionDate", "2026/10/14").param("doRange", "false"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.testResult").isArray())
                .andExpect(jsonPath("$.testResult").isEmpty());
        mvc.perform(get("/rest/LogbookResults").session(session).param("page", "1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.testResult").isEmpty())
                .andExpect(jsonPath("$.paging.searchTermToPage").isEmpty());
    }

    @Test
    public void legacyRangeKeepsBothBoundsInsteadOfApplyingExactLowerAccession() throws Exception {
        configureCombinedQueryRows();
        var lower = item("201", "LOWER-ACCESSION", "31", "20");
        var upper = item("202", "UPPER-ACCESSION", "31", "21");
        when(loader.getUnfinishedTestResultItemsByAccession("LOWER-ACCESSION", "UPPER-ACCESSION", true, true))
                .thenReturn(List.of(lower, upper));
        mvc.perform(get("/rest/LogbookResults").session(session).param("labNumber", "LOWER-ACCESSION")
                .param("upperRangeAccessionNumber", "UPPER-ACCESSION").param("doRange", "true")
                .param("finished", "true")).andExpect(status().isOk())
                .andExpect(jsonPath("$.testResult.length()").value(2))
                .andExpect(jsonPath("$.testResult[0].accessionNumber").value("LOWER-ACCESSION"))
                .andExpect(jsonPath("$.testResult[1].accessionNumber").value("UPPER-ACCESSION"));
        verify(loader).getUnfinishedTestResultItemsByAccession("LOWER-ACCESSION", "UPPER-ACCESSION", true, true);
    }

    @Test
    public void patientOnlyQueryKeepsAllOfThatPatientsAuthorizedAccessionRows() throws Exception {
        var rows = configureCombinedQueryRows();
        var patients = mock(PatientService.class);
        var patient = mock(Patient.class);
        when(patient.getId()).thenReturn("901");
        when(patient.getNationalId()).thenReturn("QA-PATIENT-901");
        when(patient.getGender()).thenReturn("M");
        when(patient.getBirthDateForDisplay()).thenReturn("2001/05/12");
        when(patients.get("901")).thenReturn(patient);
        when(patients.getLastFirstName(patient)).thenReturn("QA Patient");
        ReflectionTestUtils.setField(controller, "patientService", patients);
        when(loader.getUnfinishedTestResultItemsByAccession(null)).thenReturn(List.of());
        when(loader.getGroupedTestsForPatient(patient)).thenReturn(List.of(rows.get(0), rows.get(1)));
        mvc.perform(get("/rest/LogbookResults").session(session).param("patientPK", "901").param("doRange", "false"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.testResult.length()").value(2))
                .andExpect(jsonPath("$.testResult[0].analysisId").value("101"))
                .andExpect(jsonPath("$.testResult[1].analysisId").value("102"));
        verify(loader).getGroupedTestsForPatient(patient);
    }

}
