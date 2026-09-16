package org.openelisglobal.sample.controller.rest;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.sample.form.OrderDashboardQuery;
import org.openelisglobal.sample.form.OrderDashboardResponse;
import org.openelisglobal.sample.service.OrderDashboardService;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

public class OrderDashboardControllerTest {
    private OrderDashboardService service;
    private MockMvc mvc;

    @Before
    public void setUp() {
        service = mock(OrderDashboardService.class);
        var controller = new OrderSearchRestController();
        ReflectionTestUtils.setField(controller, "orderDashboardService", service);
        mvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test public void passesAllFiltersAndRequestToAuthorizedServiceWithNoStore() throws Exception {
        when(service.getDashboard(any(), any())).thenReturn(new OrderDashboardResponse(List.of(), 47, null, 2, 25, "not_included", false));
        var response = mvc.perform(get("/rest/order/dashboard").param("page","2").param("pageSize","25")
                .param("search","SIM-4").param("status","in_progress").param("specimenIntakeStatus","collection_pending")
                .param("priority","stat").param("includeExternal","true").param("startDate","2026-09-01").param("endDate","2026-09-05"))
                .andExpect(status().isOk()).andReturn().getResponse();
        var capture = ArgumentCaptor.forClass(OrderDashboardQuery.class);
        verify(service).getDashboard(capture.capture(), notNull());
        assertEquals(new OrderDashboardQuery(2,25,"SIM-4","in_progress","collection_pending","stat",true,"2026-09-01","2026-09-05"), capture.getValue());
        assertEquals("no-store", response.getHeader("Cache-Control"));
        assertTrue(response.getContentAsString().contains("\"totalCount\":47"));
    }

    @Test public void lostPermissionIsNotAnEmptySuccessfulList() throws Exception {
        when(service.getDashboard(any(), any())).thenThrow(new AccessDeniedException("private details"));
        var response = mvc.perform(get("/rest/order/dashboard")).andExpect(status().isForbidden()).andReturn().getResponse();
        assertFalse(response.getContentAsString().contains("private details"));
        assertTrue(response.getContentAsString().contains("dashboard.access.changed"));
    }

    @Test
    public void malformedPageIsRejectedBeforeService() throws Exception {
        mvc.perform(get("/rest/order/dashboard").param("page", "invalid")).andExpect(status().isBadRequest());
        verifyZeroInteractions(service);
    }

    @Test public void invalidFilterIs400AndDatabaseFailureIs500() throws Exception {
        when(service.getDashboard(any(), any())).thenThrow(new IllegalArgumentException("dashboard.pagination.invalid"));
        mvc.perform(get("/rest/order/dashboard")).andExpect(status().isBadRequest());
        doThrow(new IllegalStateException("sensitive-db-detail")).when(service).getDashboard(any(), any());
        var response = mvc.perform(get("/rest/order/dashboard")).andExpect(status().isInternalServerError()).andReturn().getResponse();
        assertFalse(response.getContentAsString().contains("sensitive-db-detail"));
    }
}
