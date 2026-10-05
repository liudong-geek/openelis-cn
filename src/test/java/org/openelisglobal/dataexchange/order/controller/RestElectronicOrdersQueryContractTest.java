package org.openelisglobal.dataexchange.order.controller;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.config.ControllerSetup;
import org.openelisglobal.dataexchange.order.form.ElectronicOrderViewForm;
import org.openelisglobal.dataexchange.order.form.ElectronicOrderViewForm.SearchType;
import org.openelisglobal.dataexchange.service.order.ElectronicOrderQueryService;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

public class RestElectronicOrdersQueryContractTest {
    private ElectronicOrderQueryService service;
    private MockMvc mvc;

    @Before
    public void setup() {
        var controller = new RestElectronicOrdersController();
        service = mock(ElectronicOrderQueryService.class);
        ReflectionTestUtils.setField(controller, "queryService", service);
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ControllerSetup()).build();
    }

    @Test
    public void independentPageCarriesAllCriteriaToService() throws Exception {
        mvc.perform(get("/rest/ElectronicOrders").param("queryVersion", "2").param("searchType", "IDENTIFIER")
                .param("searchValue", "DEMO-甲").param("startDate", "2026/10/05").param("endDate", "2026/10/06")
                .param("statusId", "23").param("pendingOnly", "false").param("page", "2").param("pageSize", "10")
                .param("useAllInfo", "true")).andExpect(status().isOk());
        var form = ArgumentCaptor.forClass(ElectronicOrderViewForm.class);
        verify(service).query(org.mockito.ArgumentMatchers.any(), form.capture());
        var f = form.getValue();
        assertEquals("2", f.getQueryVersion());
        assertEquals(SearchType.IDENTIFIER, f.getSearchType());
        assertEquals("DEMO-甲", f.getSearchValue());
        assertEquals("2026/10/05", f.getStartDate());
        assertEquals("2026/10/06", f.getEndDate());
        assertEquals("23", f.getStatusId());
        assertFalse(f.getPendingOnly());
        assertEquals(Integer.valueOf(2), f.getPage());
        assertEquals(Integer.valueOf(10), f.getPageSize());
        assertTrue(f.getUseAllInfo());
    }

    @Test
    public void badEnumPageBooleanAndVersionFailBeforeService() throws Exception {
        for (String[] pair : List.of(new String[] { "searchType", "INVALID" }, new String[] { "page", "NaN" },
                new String[] { "pendingOnly", "other" }, new String[] { "queryVersion", "3" },
                new String[] { "searchType", "" }, new String[] { "pendingOnly", "yes" },
                new String[] { "page", "01" })) {
            var req = get("/rest/ElectronicOrders").param("queryVersion", "2");
            if (pair[0].equals("queryVersion"))
                req = get("/rest/ElectronicOrders");
            mvc.perform(req.param(pair[0], pair[1])).andExpect(status().isBadRequest());
        }
        verifyZeroInteractions(service);
    }

    @Test
    public void unknownOrDuplicatedParameterFailsBeforeService() throws Exception {
        mvc.perform(get("/rest/ElectronicOrders").param("queryVersion", "2").param("actor", "99"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/rest/ElectronicOrders").param("queryVersion", "2").param("page", "1", "2"))
                .andExpect(status().isBadRequest());
        verifyZeroInteractions(service);
    }

    @Test public void forbiddenReadAndInvalidServiceDatesKeepActualHttpStatus() throws Exception {
        // Actual authorization and date validation have independent service tests.
        when(service.query(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any())).thenThrow(new AccessDeniedException("eorder.permissionDenied"));
        mvc.perform(get("/rest/ElectronicOrders").param("queryVersion","2")).andExpect(status().isForbidden());
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST,"error.validation")).when(service).query(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any());
        mvc.perform(get("/rest/ElectronicOrders").param("queryVersion","2")).andExpect(status().isBadRequest());
    }
}
