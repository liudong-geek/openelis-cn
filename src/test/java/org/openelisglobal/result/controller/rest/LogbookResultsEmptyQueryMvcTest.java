package org.openelisglobal.result.controller.rest;

import static org.junit.Assert.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.constants.Constants;
import org.openelisglobal.common.paging.PagingProperties;
import org.openelisglobal.common.util.ConfigurationProperties.Property;
import org.openelisglobal.common.util.DefaultConfigurationProperties;
import org.openelisglobal.config.AppConfig;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.referral.service.ReferralTypeService;
import org.openelisglobal.result.action.util.ResultsLoadUtility;
import org.openelisglobal.result.action.util.ResultsPaging;
import org.openelisglobal.result.form.LogbookResultsForm;
import org.openelisglobal.spring.util.SpringContext;
import org.openelisglobal.systemuser.service.UserService;
import org.openelisglobal.test.beanItems.TestResultItem;
import org.springframework.beans.factory.config.AutowireCapableBeanFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.servlet.HandlerInterceptor;

public class LogbookResultsEmptyQueryMvcTest {
    private MockMvc mvc;
    private ResultsLoadUtility loader;
    private UserService users;
    private MockHttpSession session;
    private Object previousContext;
    private Object previousFactory;

    @Before
    public void setup() {
        previousContext = ReflectionTestUtils.getField(SpringContext.class, "context");
        previousFactory = ReflectionTestUtils.getField(SpringContext.class, "factory");
        var factory = mock(AutowireCapableBeanFactory.class);
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
        var controller = new LogbookResultsRestController(mock(ReferralTypeService.class));
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
}
