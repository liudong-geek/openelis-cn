package org.openelisglobal.testcalculated.controller.rest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.openelisglobal.config.AppConfig;
import org.openelisglobal.testcalculated.service.RuleConfigurationValidation;
import org.openelisglobal.testcalculated.service.TestCalculationService;
import org.openelisglobal.testcalculated.valueholder.Calculation;
import org.openelisglobal.testcalculated.valueholder.Operation;
import org.openelisglobal.testreflex.action.bean.ReflexRule;
import org.openelisglobal.testreflex.action.bean.ReflexRuleAction;
import org.openelisglobal.testreflex.action.bean.ReflexRuleCondition;
import org.openelisglobal.testreflex.action.bean.ReflexRuleOptions;
import org.openelisglobal.testreflex.controller.rest.TestReflexRuleRestController;
import org.openelisglobal.testreflex.service.ReflexRuleConfigurationService;
import org.openelisglobal.testreflex.service.TestReflexService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

public class RuleConfigurationRestContractTest {
    private static final String STORED_VERSION = "2026-10-04T01:02:03.123456Z";
    private static final String SUPPLIED_VERSION = "2026-10-04T01:02:03.123455Z";
    private MockMvc mvc;
    private ReflexRuleConfigurationService reflex;
    private TestCalculationService calculated;
    private TestReflexService reader;

    @Before
    public void prepare() {
        reflex = mock(ReflexRuleConfigurationService.class);
        calculated = mock(TestCalculationService.class);
        reader = mock(TestReflexService.class);
        var a = new TestReflexRuleRestController();
        var b = new CalculatedValueRestController();
        ReflectionTestUtils.setField(a, "configuration", reflex);
        ReflectionTestUtils.setField(a, "reflexService", reader);
        ReflectionTestUtils.setField(b, "testCalculationService", calculated);
        // Use the deployed converter, including Hibernate's treatment of @Transient.
        mvc = MockMvcBuilders.standaloneSetup(a, b).setMessageConverters(new AppConfig().jacksonMessageConverter())
                .build();
    }

    @Test
    public void savedReflexIncludesPersistentIdentityAndExactVersion() throws Exception {
        ReflexRule persisted = reflexRule();
        when(reflex.save(any())).thenReturn(persisted);
        when(reflex.get(28)).thenReturn(persisted);
        mvc.perform(post("/rest/reflexrule").contentType(MediaType.APPLICATION_JSON)
                .content("{\"configurationVersion\":\"" + SUPPLIED_VERSION + "\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(28)).andExpect(jsonPath("$.lastupdated").isNumber())
                .andExpect(jsonPath("$.configurationVersion").value(STORED_VERSION));
        ArgumentCaptor<ReflexRule> supplied = ArgumentCaptor.forClass(ReflexRule.class);
        verify(reflex).save(supplied.capture());
        assertEquals(SUPPLIED_VERSION, supplied.getValue().getConfigurationVersion());
        mvc.perform(get("/rest/reflexrule/28")).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(28))
                .andExpect(jsonPath("$.configurationVersion").value(STORED_VERSION));
    }

    @Test
    public void savedCalculationIncludesPersistentIdentity() throws Exception {
        Calculation persisted = calculation();
        when(calculated.saveDefinition(any())).thenReturn(persisted);
        when(calculated.getDefinition(29)).thenReturn(persisted);
        mvc.perform(post("/rest/test-calculation").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"规则\",\"sampleId\":1,\"testId\":2,\"configurationVersion\":\"" + SUPPLIED_VERSION
                        + "\",\"operations\":[{\"order\":0,\"type\":\"INTEGER\",\"value\":\"1\"}]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(29))
                .andExpect(jsonPath("$.configurationVersion").value(STORED_VERSION));
        ArgumentCaptor<Calculation> supplied = ArgumentCaptor.forClass(Calculation.class);
        verify(calculated).saveDefinition(supplied.capture());
        assertEquals(SUPPLIED_VERSION, supplied.getValue().getConfigurationVersion());
        mvc.perform(get("/rest/test-calculation/29")).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(29))
                .andExpect(jsonPath("$.configurationVersion").value(STORED_VERSION));
    }

    @Test
    public void calculationDetailIncludesExactVersionWithProductionConverter() throws Exception {
        when(calculated.getDefinition(29)).thenReturn(calculation());
        mvc.perform(get("/rest/test-calculation/29")).andExpect(status().isOk())
                .andExpect(jsonPath("$.configurationVersion").value(STORED_VERSION));
    }

    @Test
    public void reflexDetailIncludesExactVersionWithProductionConverter() throws Exception {
        when(reflex.get(28)).thenReturn(reflexRule());
        mvc.perform(get("/rest/reflexrule/28")).andExpect(status().isOk())
                .andExpect(jsonPath("$.configurationVersion").value(STORED_VERSION));
    }

    @Test
    public void ruleListsIncludeExactVersionsWithProductionConverter() throws Exception {
        when(calculated.getAll()).thenReturn(List.of(calculation()));
        when(reader.getAllReflexRules()).thenReturn(List.of(reflexRule()));
        mvc.perform(get("/rest/test-calculations")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(29))
                .andExpect(jsonPath("$[0].configurationVersion").value(STORED_VERSION));
        mvc.perform(get("/rest/reflexrules")).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(28))
                .andExpect(jsonPath("$[0].configurationVersion").value(STORED_VERSION));
    }

    @Test
    public void activationResponsesIncludeExactVersionsWithProductionConverter() throws Exception {
        when(calculated.setDefinitionActive(29, true)).thenReturn(calculation());
        when(calculated.setDefinitionActive(29, false)).thenReturn(calculation());
        when(reflex.setActive(28, true)).thenReturn(reflexRule());
        when(reflex.setActive(28, false)).thenReturn(reflexRule());
        for (String path : List.of("activate-test-calculation/29", "deactivate-test-calculation/29",
                "activate-reflexrule/28", "deactivate-reflexrule/28")) {
            mvc.perform(post("/rest/" + path)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.configurationVersion").value(STORED_VERSION));
        }
    }

    @Test
    public void calculationNullableDefinitionFieldsRemainExplicitWithProductionConverter() throws Exception {
        Calculation persisted = calculation();
        persisted.setSampleId(2);
        persisted.setTestId(5);
        Operation operation = new Operation();
        operation.setId(79);
        operation.setOrder(0);
        operation.setType(Operation.OperationType.INTEGER);
        operation.setValue("1");
        persisted.setOperations(new ArrayList<>(List.of(operation)));
        when(calculated.getDefinition(29)).thenReturn(persisted);
        String body = mvc.perform(get("/rest/test-calculation/29")).andExpect(status().isOk())
                .andExpect(jsonPath("$.operations[0].id").value(79)).andExpect(jsonPath("$.sysUserId").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        JsonNode json = new AppConfig().jacksonMessageConverter().getObjectMapper().readTree(body);
        assertExplicitNull(json, "result");
        assertExplicitNull(json, "note");
        assertExplicitNull(json.get("operations").get(0), "sampleId");
    }

    @Test
    public void reflexNullableDefinitionFieldsRemainExplicitWithProductionConverter() throws Exception {
        ReflexRule persisted = reflexRule();
        persisted.setOverall(ReflexRuleOptions.OverallOptions.ALL);
        ReflexRuleCondition condition = new ReflexRuleCondition();
        condition.setId(80);
        condition.setSampleId("2");
        condition.setTestId("5");
        condition.setTestName("淀粉酶");
        condition.setRelation(ReflexRuleOptions.NumericRelationOptions.INSIDE_NORMAL_RANGE);
        persisted.setConditions(new LinkedHashSet<>(List.of(condition)));
        ReflexRuleAction action = new ReflexRuleAction();
        action.setId(81);
        action.setSampleId("2");
        action.setReflexTestId("5");
        action.setReflexTestName("淀粉酶");
        persisted.setActions(new LinkedHashSet<>(List.of(action)));
        when(reflex.get(28)).thenReturn(persisted);
        String body = mvc.perform(get("/rest/reflexrule/28")).andExpect(status().isOk())
                .andExpect(jsonPath("$.conditions[0].id").value(80))
                .andExpect(jsonPath("$.actions[0].addNotification").value("Y"))
                .andExpect(jsonPath("$.sysUserId").doesNotExist()).andReturn().getResponse().getContentAsString();
        JsonNode json = new AppConfig().jacksonMessageConverter().getObjectMapper().readTree(body);
        JsonNode savedCondition = json.get("conditions").get(0), savedAction = json.get("actions").get(0);
        for (String property : List.of("value", "value2", "testAnalyteId"))
            assertExplicitNull(savedCondition, property);
        for (String property : List.of("internalNote", "externalNote", "testReflexId"))
            assertExplicitNull(savedAction, property);
    }

    @Test
    public void calculationWritePreservesMicrosecondConflictCheckWithProductionConverter() throws Exception {
        Calculation persisted = calculation();
        when(calculated.saveDefinition(any())).thenAnswer(invocation -> {
            Calculation supplied = invocation.getArgument(0);
            RuleConfigurationValidation.version(supplied.getConfigurationVersion(), persisted);
            return persisted;
        });
        String definition = "{\"id\":29,\"name\":\"规则\",\"sampleId\":2,\"testId\":5,\"lastupdated\":"
                + persisted.getLastupdated().getTime()
                + ",\"operations\":[{\"order\":0,\"type\":\"INTEGER\",\"value\":\"1\"}],\"configurationVersion\":\"";
        mvc.perform(post("/rest/test-calculation").contentType(MediaType.APPLICATION_JSON)
                .content(definition + SUPPLIED_VERSION + "\"}")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("RULE_CONFLICT"));
        mvc.perform(post("/rest/test-calculation").contentType(MediaType.APPLICATION_JSON)
                .content(definition + STORED_VERSION + "\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.configurationVersion").value(STORED_VERSION));
    }

    @Test
    public void reflexWritePreservesMicrosecondConflictCheckWithProductionConverter() throws Exception {
        ReflexRule persisted = reflexRule();
        when(reflex.save(any())).thenAnswer(invocation -> {
            ReflexRule supplied = invocation.getArgument(0);
            RuleConfigurationValidation.version(supplied.getConfigurationVersion(), persisted);
            return persisted;
        });
        String definition = "{\"id\":28,\"lastupdated\":" + persisted.getLastupdated().getTime()
                + ",\"configurationVersion\":\"";
        mvc.perform(post("/rest/reflexrule").contentType(MediaType.APPLICATION_JSON)
                .content(definition + SUPPLIED_VERSION + "\"}")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("RULE_CONFLICT"));
        mvc.perform(post("/rest/reflexrule").contentType(MediaType.APPLICATION_JSON)
                .content(definition + STORED_VERSION + "\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.configurationVersion").value(STORED_VERSION));
    }

    private static void assertExplicitNull(JsonNode node, String property) {
        assertTrue("Missing nullable definition property: " + property, node.has(property));
        assertTrue("Expected explicit null definition property: " + property, node.get(property).isNull());
    }

    private static Calculation calculation() {
        Calculation persisted = new Calculation();
        persisted.setId(29);
        persisted.setName("规则");
        persisted.setOperations(new ArrayList<>());
        persisted.setLastupdated(Timestamp.from(java.time.Instant.parse(STORED_VERSION)));
        return persisted;
    }

    private static ReflexRule reflexRule() {
        ReflexRule persisted = new ReflexRule();
        persisted.setId(28);
        persisted.setRuleName("规则");
        persisted.setLastupdated(Timestamp.from(java.time.Instant.parse(STORED_VERSION)));
        persisted.setConditions(new LinkedHashSet<>());
        persisted.setActions(new LinkedHashSet<>());
        return persisted;
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
