package org.openelisglobal.referral.controller.rest;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.common.services.DisplayListService;
import org.openelisglobal.common.util.IdValuePair;
import org.openelisglobal.config.ControllerSetup;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.referral.form.ReferredOutTestsForm;
import org.openelisglobal.referral.form.ReferredOutTestsForm.SearchType;
import org.openelisglobal.referral.service.ReferralService;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

public class ReferredOutTestsRestControllerQueryContractTest {
    private Object previousDisplayLists;
    private ReferralService referrals;
    private MockHttpSession session;
    private MockMvc mvc;

    @Before
    public void setup() {
        previousDisplayLists = ReflectionTestUtils.getField(DisplayListService.class, "instance");
        var lists = mock(DisplayListService.class);
        when(lists.getList(DisplayListService.ListType.ALL_TESTS)).thenReturn(List.of(new IdValuePair("11", "Test")));
        when(lists.getList(DisplayListService.ListType.TEST_SECTION_BY_NAME))
                .thenReturn(List.of(new IdValuePair("3", "Section")));
        ReflectionTestUtils.setField(DisplayListService.class, "instance", lists);
        var controller = new ReferredOutTestsRestController();
        referrals = mock(ReferralService.class);
        ReflectionTestUtils.setField(controller, "referralService", referrals);
        session = new MockHttpSession();
        var actor = new UserSessionData();
        actor.setSytemUserId(7);
        session.setAttribute(IActionConstants.USER_SESSION_DATA, actor);
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ControllerSetup()).build();
    }

    @After
    public void restore() {
        ReflectionTestUtils.setField(DisplayListService.class, "instance", previousDisplayLists);
    }

    @Test
    public void initialLoadReturnsSelectionListsWithoutRunningAQuery() throws Exception {
        mvc.perform(get("/rest/ReferredOutTests").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.searchFinished").value(false))
                .andExpect(jsonPath("$.testSelectionList[0].id").value("11"));
        verifyZeroInteractions(referrals);
    }

    @Test
    public void missingAndBlankSearchTypesWithCriteriaReturn400BeforeQuery() throws Exception {
        mvc.perform(get("/rest/ReferredOutTests").session(session).param("labNumber", "12345"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/rest/ReferredOutTests").session(session).param("searchType", ""))
                .andExpect(status().isBadRequest());
        verifyZeroInteractions(referrals);
    }

    @Test
    public void unsupportedModeAndDateTypeReturn400BeforeQuery() throws Exception {
        mvc.perform(get("/rest/ReferredOutTests").session(session).param("searchType", "UNSUPPORTED"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/rest/ReferredOutTests").session(session).param("searchType", "TEST_AND_DATES")
                .param("dateType", "UNSUPPORTED")).andExpect(status().isBadRequest());
        verifyZeroInteractions(referrals);
    }

    @Test
    public void dateQueryPassesAllBoundCriteriaAndResolvedActorToTheService() throws Exception {
        mvc.perform(get("/rest/ReferredOutTests").session(session).param("searchType", "TEST_AND_DATES")
                .param("dateType", "SENT").param("startDate", "2026/10/05").param("endDate", "2026/10/05")
                .param("testIds", "11,12").param("testUnitIds", "3")).andExpect(status().isOk())
                .andExpect(jsonPath("$.searchFinished").value(true));
        var form = ArgumentCaptor.forClass(ReferredOutTestsForm.class);
        verify(referrals).getReferralItems(form.capture(), eq("7"));
        assertEquals(SearchType.TEST_AND_DATES, form.getValue().getSearchType());
        assertEquals("2026/10/05", form.getValue().getStartDate());
        assertEquals("2026/10/05", form.getValue().getEndDate());
        assertEquals(List.of("11", "12"), form.getValue().getTestIds());
        assertEquals(List.of("3"), form.getValue().getTestUnitIds());
    }

    @Test
    public void patientAndLabNumberQueriesKeepTheirExistingProtocol() throws Exception {
        mvc.perform(
                get("/rest/ReferredOutTests").session(session).param("searchType", "PATIENT").param("selPatient", "42"))
                .andExpect(status().isOk());
        mvc.perform(get("/rest/ReferredOutTests").session(session).param("searchType", "LAB_NUMBER").param("labNumber",
                "20261005-00042")).andExpect(status().isOk());
        var forms = ArgumentCaptor.forClass(ReferredOutTestsForm.class);
        verify(referrals, times(2)).getReferralItems(forms.capture(), eq("7"));
        assertEquals(SearchType.PATIENT, forms.getAllValues().get(0).getSearchType());
        assertEquals("42", forms.getAllValues().get(0).getSelPatient());
        assertEquals(SearchType.LAB_NUMBER, forms.getAllValues().get(1).getSearchType());
        assertEquals("20261005-00042", forms.getAllValues().get(1).getLabNumber());
    }

    @Test
    public void serviceValidationRemains400UnderTheRealGlobalAdvice() throws Exception {
        var form = ArgumentCaptor.forClass(ReferredOutTestsForm.class);
        // Validation is fully exercised with the real service in
        // ReferralQueryContractTest.
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "error.validation")).when(referrals)
                .getReferralItems(form.capture(), eq("7"));
        mvc.perform(get("/rest/ReferredOutTests").session(session).param("searchType", "TEST_AND_DATES")
                .param("dateType", "SENT").param("startDate", "invalid")).andExpect(status().isBadRequest());
        assertEquals("invalid", form.getValue().getStartDate());
    }
}
