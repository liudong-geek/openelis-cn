package org.openelisglobal.testcalculated.controller.rest;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.testcalculated.service.TestCalculationService;
import org.openelisglobal.testcalculated.valueholder.Calculation;
import org.openelisglobal.testreflex.action.bean.ReflexRule;
import org.openelisglobal.testreflex.controller.rest.TestReflexRuleRestController;
import org.openelisglobal.testreflex.service.ReflexRuleConfigurationService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

public class RuleConfigurationRestContractTest {
    private MockMvc mvc;
    private ReflexRuleConfigurationService reflex;
    private TestCalculationService calculated;

    @Before
    public void prepare() {
        reflex = mock(ReflexRuleConfigurationService.class);
        calculated = mock(TestCalculationService.class);
        var a = new TestReflexRuleRestController();
        var b = new CalculatedValueRestController();
        ReflectionTestUtils.setField(a, "configuration", reflex);
        ReflectionTestUtils.setField(b, "testCalculationService", calculated);
        mvc = MockMvcBuilders.standaloneSetup(a, b).build();
    }

    @Test
    public void savedReflexIncludesPersistentIdentityAndExactVersion() throws Exception {
        ReflexRule persisted = new ReflexRule();
        persisted.setId(28);
        persisted.setRuleName("规则");
        persisted.setLastupdated(Timestamp.valueOf("2026-10-04 01:02:03.123456"));
        persisted.setConditions(new LinkedHashSet<>());
        persisted.setActions(new LinkedHashSet<>());
        when(reflex.save(any())).thenReturn(persisted);
        when(reflex.get(28)).thenReturn(persisted);
        mvc.perform(post("/rest/reflexrule").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(28))
                .andExpect(jsonPath("$.lastupdated").isNumber())
                .andExpect(jsonPath("$.configurationVersion").isString());
        mvc.perform(get("/rest/reflexrule/28")).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(28));
    }

    @Test
    public void savedCalculationIncludesPersistentIdentity() throws Exception {
        Calculation persisted = new Calculation();
        persisted.setId(29);
        persisted.setOperations(new ArrayList<>());
        persisted.setLastupdated(Timestamp.valueOf("2026-10-04 01:02:03.123456"));
        when(calculated.saveDefinition(any())).thenReturn(persisted);
        when(calculated.getDefinition(29)).thenReturn(persisted);
        mvc.perform(post("/rest/test-calculation").contentType(MediaType.APPLICATION_JSON).content(
                "{\"name\":\"规则\",\"sampleId\":1,\"testId\":2,\"operations\":[{\"order\":0,\"type\":\"INTEGER\",\"value\":\"1\"}]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(29));
        mvc.perform(get("/rest/test-calculation/29")).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(29));
    }

    @Test public void missingThrownFromLegacyLookupReturns404() throws Exception {
        when(calculated.getDefinition(99)).thenThrow(new org.hibernate.ObjectNotFoundException(99, "Calculation"));
        mvc.perform(get("/rest/test-calculation/99")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("RULE_NOT_FOUND"));
    }

    @Test
    public void daoWrappedOptimisticConflictIsStill409() throws Exception {
        doThrow(new org.openelisglobal.common.exception.LIMSRuntimeException("wrapped database exception",
                new org.hibernate.StaleStateException("stale database version"))).when(reflex).save(any());
        mvc.perform(post("/rest/reflexrule").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("RULE_CONFLICT"));
    }

    @Test
    public void validationConflictAndPersistenceFailureCannotReturnSuccess() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_RULE")).when(reflex).save(any());
        mvc.perform(post("/rest/reflexrule").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("INVALID_RULE"));
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT, "RULE_CONFLICT")).when(reflex).save(any());
        mvc.perform(post("/rest/reflexrule").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("RULE_CONFLICT"));
        doThrow(new RuntimeException("private database failure")).when(reflex).save(any());
        mvc.perform(post("/rest/reflexrule").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.error").value("RULE_SAVE_FAILED"));
    }
}
