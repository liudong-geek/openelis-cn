package org.openelisglobal.testcalculated.service;

import static org.junit.Assert.*;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.BaseWebContextSensitiveTest;
import org.openelisglobal.testcalculated.valueholder.Calculation;
import org.openelisglobal.testcalculated.valueholder.Operation;
import org.openelisglobal.testreflex.action.bean.ReflexRule;
import org.openelisglobal.testreflex.action.bean.ReflexRuleAction;
import org.openelisglobal.testreflex.action.bean.ReflexRuleCondition;
import org.openelisglobal.testreflex.action.bean.ReflexRuleOptions;
import org.openelisglobal.testreflex.service.ReflexRuleConfigurationService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.server.ResponseStatusException;

/**
 * Commands commit against disposable PostgreSQL; SQL asserts derived rows,
 * orphan cleanup and rollback.
 */
public class RuleConfigurationPersistenceTest extends BaseWebContextSensitiveTest {
    private static final int SAMPLE = 986001, TEST = 986101;
    @Autowired
    private ReflexRuleConfigurationService reflex;
    @Autowired
    private TestCalculationService calculations;
    @Autowired
    private TypeOfSampleService samples;
    private final ObjectMapper json = new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    @Before
    public void prepareFixtures() {
        cleanup();
        jdbcTemplate.update(
                "INSERT INTO clinlims.localization(id,description,lastupdated) VALUES (986301,'CHG068 specimen',NOW())");
        jdbcTemplate.update(
                "INSERT INTO clinlims.localization_value(id,localization_id,locale,value,last_updated) VALUES (986302,986301,'en','CHG068 specimen',NOW())");
        jdbcTemplate.update(
                "INSERT INTO clinlims.type_of_sample(id,description,domain,is_active,name_localization_id,lastupdated) VALUES (986001,'CHG068 specimen','H',true,986301,NOW())");
        for (int offset = 0; offset < 4; offset++) {
            jdbcTemplate.update("INSERT INTO clinlims.localization(id,description,lastupdated) VALUES (?, ?, NOW())",
                    986310 + offset, "CHG068 test " + offset);
            jdbcTemplate.update(
                    "INSERT INTO clinlims.localization_value(id,localization_id,locale,value,last_updated) VALUES (?,?,'en',?,NOW())",
                    986320 + offset, 986310 + offset, "CHG068 test " + offset);
            jdbcTemplate.update(
                    "INSERT INTO clinlims.test(id,name,description,is_active,guid,domain,orderable,name_localization_id,lastupdated) VALUES (?,?,?,'Y',?,'CLINICAL',true,?,NOW())",
                    TEST + offset, "CHG068 test " + offset, "CHG068 test " + offset, UUID.randomUUID().toString(),
                    986310 + offset);
            jdbcTemplate.update(
                    "INSERT INTO clinlims.sampletype_test(id,test_id,sample_type_id,display_order) VALUES (?,?,986001,?)",
                    986401 + offset, TEST + offset, offset);
            jdbcTemplate.update(
                    "INSERT INTO clinlims.test_result(id,test_id,tst_rslt_type,value,sort_order,is_active,lastupdated) VALUES (?,?,'N','0',0,true,NOW())",
                    986501 + offset, TEST + offset);
        }
        samples.clearCache();
    }

    @After
    public void finishFixtures() {
        cleanup();
        samples.clearCache();
    }

    private void cleanup() {
        jdbcTemplate.execute("ALTER TABLE clinlims.test_reflex DROP CONSTRAINT IF EXISTS chg068_reject_derived");
        jdbcTemplate.execute(
                "ALTER TABLE clinlims.calculation_operation DROP CONSTRAINT IF EXISTS chg068_reject_operation");
        jdbcTemplate.update(
                "DELETE FROM clinlims.calculation_operation WHERE calculation_id IN (SELECT id FROM clinlims.calculation WHERE name LIKE 'CHG068%')");
        jdbcTemplate.update("DELETE FROM clinlims.calculation WHERE name LIKE 'CHG068%'");
        jdbcTemplate.update(
                "DELETE FROM clinlims.reflex_rule_action WHERE reflex_rule_id IN (SELECT id FROM clinlims.reflex_rule WHERE rule_name LIKE 'CHG068%')");
        jdbcTemplate.update(
                "DELETE FROM clinlims.reflex_rule_condition WHERE reflex_rule_id IN (SELECT id FROM clinlims.reflex_rule WHERE rule_name LIKE 'CHG068%')");
        jdbcTemplate.update("DELETE FROM clinlims.test_reflex WHERE test_id BETWEEN 986101 AND 986104");
        jdbcTemplate.update(
                "DELETE FROM clinlims.test_analyte WHERE analyte_id IN (SELECT id FROM clinlims.analyte WHERE name LIKE 'CHG068%')");
        jdbcTemplate.update("DELETE FROM clinlims.reflex_rule WHERE rule_name LIKE 'CHG068%'");
        jdbcTemplate.update("DELETE FROM clinlims.analyte WHERE name LIKE 'CHG068%'");
        jdbcTemplate.update("DELETE FROM clinlims.test_result WHERE test_id BETWEEN 986101 AND 986104");
        jdbcTemplate.update("DELETE FROM clinlims.sampletype_test WHERE sample_type_id=986001");
        jdbcTemplate.update("DELETE FROM clinlims.test WHERE id BETWEEN 986101 AND 986104");
        jdbcTemplate.update("DELETE FROM clinlims.type_of_sample WHERE id=986001");
        jdbcTemplate.update(
                "DELETE FROM clinlims.localization_value WHERE localization_id=986301 OR localization_id BETWEEN 986310 AND 986313");
        jdbcTemplate.update("DELETE FROM clinlims.localization WHERE id=986301 OR id BETWEEN 986310 AND 986313");
    }

    private ReflexRule rule(boolean active, boolean multiple) {
        ReflexRule rule = new ReflexRule();
        rule.setRuleName("CHG068 reflex");
        rule.setOverall(ReflexRuleOptions.OverallOptions.ALL);
        rule.setActive(active);
        rule.setSysUserId("999999");
        rule.setConditions(new LinkedHashSet<>());
        rule.setActions(new LinkedHashSet<>());
        for (int i = 0; i < (multiple ? 2 : 1); i++) {
            ReflexRuleCondition condition = new ReflexRuleCondition();
            condition.setSampleId("986001");
            condition.setTestId(Integer.toString(TEST + i));
            condition.setTestName("CHG068 test " + i);
            condition.setRelation(ReflexRuleOptions.NumericRelationOptions.GREATER_THAN);
            condition.setValue("5");
            condition.setValue2(null);
            rule.getConditions().add(condition);
            ReflexRuleAction action = new ReflexRuleAction();
            action.setSampleId("986001");
            action.setReflexTestId(Integer.toString(TEST + 2 + i));
            action.setReflexTestName("CHG068 added " + i);
            rule.getActions().add(action);
        }
        return rule;
    }

    private Calculation calculation(String name, boolean multiple) {
        Calculation calculation = new Calculation();
        calculation.setName("CHG068 " + name);
        calculation.setSampleId(SAMPLE);
        calculation.setTestId(TEST + 3);
        calculation.setOperations(new ArrayList<>());
        calculation.setSysUserId("999999");
        Operation first = new Operation();
        first.setOrder(0);
        first.setType(Operation.OperationType.TEST_RESULT);
        first.setValue(Integer.toString(TEST));
        first.setSampleId(SAMPLE);
        calculation.getOperations().add(first);
        if (multiple) {
            Operation plus = new Operation();
            plus.setOrder(1);
            plus.setType(Operation.OperationType.MATH_FUNCTION);
            plus.setValue("+");
            Operation number = new Operation();
            number.setOrder(2);
            number.setType(Operation.OperationType.INTEGER);
            number.setValue("2");
            calculation.getOperations().add(plus);
            calculation.getOperations().add(number);
        }
        return calculation;
    }

    private <T> T copy(T value, Class<T> type) throws Exception {
        return json.readValue(json.writeValueAsBytes(value), type);
    }

    private int derivedCount() {
        return jdbcTemplate.queryForObject(
                "SELECT count(*) FROM clinlims.test_reflex WHERE test_id BETWEEN 986101 AND 986104", Integer.class);
    }

    private void rejected(int code, Runnable action) {
        try {
            action.run();
            fail("Expected rejection " + code);
        } catch (ResponseStatusException exception) {
            assertEquals(code, exception.getStatusCode().value());
        }
    }

    @Test
    public void createReadEditDeletesRemovedChildrenAndAllOldDerivedRows() throws Exception {
        ReflexRule persisted = reflex.save(rule(true, true));
        assertNotNull(persisted.getId());
        assertNotNull(persisted.getConfigurationVersion());
        assertEquals("1", persisted.getSysUserId());
        assertEquals(4, derivedCount());
        ReflexRule changed = copy(reflex.get(persisted.getId()), ReflexRule.class);
        var condition = changed.getConditions().iterator().next();
        var action = changed.getActions().iterator().next();
        Integer conditionId = condition.getId(), actionId = action.getId();
        changed.setConditions(new LinkedHashSet<>(List.of(condition)));
        changed.setActions(new LinkedHashSet<>(List.of(action)));
        changed.setRuleName("CHG068 revised");
        ReflexRule saved = reflex.save(changed);
        assertEquals(persisted.getId(), saved.getId());
        assertEquals(1, derivedCount());
        assertEquals(conditionId, saved.getConditions().iterator().next().getId());
        assertEquals(actionId, saved.getActions().iterator().next().getId());
        assertEquals(Integer.valueOf(1),
                jdbcTemplate.queryForObject(
                        "SELECT count(*) FROM clinlims.reflex_rule_condition WHERE reflex_rule_id=?", Integer.class,
                        saved.getId()));
        assertEquals(Integer.valueOf(1),
                jdbcTemplate.queryForObject("SELECT count(*) FROM clinlims.reflex_rule_action WHERE reflex_rule_id=?",
                        Integer.class, saved.getId()));
    }

    @Test
    public void inactiveCreateAndEditStayInactiveUntilExplicitActivation() throws Exception {
        ReflexRule saved = reflex.save(rule(false, false));
        assertEquals(0, derivedCount());
        assertFalse(saved.getActive());
        ReflexRule changed = copy(saved, ReflexRule.class);
        changed.setRuleName("CHG068 inactive edited");
        saved = reflex.save(changed);
        assertFalse(saved.getActive());
        assertEquals(0, derivedCount());
        assertNull(saved.getActions().iterator().next().getTestReflexId());
        reflex.setActive(saved.getId(), true);
        assertEquals(1, derivedCount());
        reflex.setActive(saved.getId(), false);
        assertEquals(0, derivedCount());
        ReflexRule disabled = copy(reflex.get(saved.getId()), ReflexRule.class);
        disabled.setRuleName("CHG068 disabled edited");
        assertFalse(reflex.save(disabled).getActive());
        assertEquals(0, derivedCount());
    }

    @Test
    public void staleAndForeignIdentitiesRejectBeforeAnyWrite() throws Exception {
        ReflexRule saved = reflex.save(rule(true, false));
        ReflexRule changed = copy(saved, ReflexRule.class);
        changed.getConditions().iterator().next().setId(999999);
        rejected(400, () -> reflex.save(changed));
        assertEquals(1, derivedCount());
        ReflexRule stale = copy(saved, ReflexRule.class);
        stale.setConfigurationVersion("2000-01-01T00:00:00Z");
        rejected(409, () -> reflex.save(stale));
        ReflexRule absent = rule(true, false);
        absent.setId(999999);
        rejected(404, () -> reflex.save(absent));
        ReflexRule invalidLink = rule(true, false);
        invalidLink.getActions().iterator().next().setSampleId("999999");
        rejected(400, () -> reflex.save(invalidLink));
        assertEquals(1, derivedCount());
    }

    @Test
    public void derivedPersistenceFailureRollsBackDefinitionChildrenAndPreviousDerivedRows() throws Exception {
        ReflexRule saved = reflex.save(rule(true, true));
        String version = saved.getConfigurationVersion();
        List<Integer> originalDerived = jdbcTemplate.queryForList(
                "SELECT id FROM clinlims.test_reflex WHERE test_id BETWEEN 986101 AND 986104 ORDER BY id",
                Integer.class);
        ReflexRule changed = copy(saved, ReflexRule.class);
        changed.setRuleName("CHG068 attempted");
        changed.getActions().iterator().next().setInternalNote("rollback");
        jdbcTemplate.execute(
                "ALTER TABLE clinlims.test_reflex ADD CONSTRAINT chg068_reject_derived CHECK (internal_note IS DISTINCT FROM 'rollback')");
        try {
            reflex.save(changed);
            fail("Expected actual PostgreSQL rejection");
        } catch (RuntimeException expected) {
            assertFalse(expected instanceof ResponseStatusException);
        }
        ReflexRule unchanged = reflex.get(saved.getId());
        assertEquals("CHG068 reflex", unchanged.getRuleName());
        assertEquals(version, unchanged.getConfigurationVersion());
        assertEquals(originalDerived,
                jdbcTemplate.queryForList(
                        "SELECT id FROM clinlims.test_reflex WHERE test_id BETWEEN 986101 AND 986104 ORDER BY id",
                        Integer.class));
        assertEquals(2, unchanged.getConditions().size());
        assertEquals(2, unchanged.getActions().size());
    }

    @Test
    public void calculationEditRetainsIdentityRemovesOperationsAndRejectsStaleAndForeign() throws Exception {
        Calculation saved = calculations.saveDefinition(calculation("calculation", true));
        assertNotNull(saved.getId());
        assertEquals("1", saved.getSysUserId());
        Calculation changed = copy(saved, Calculation.class);
        Integer firstId = changed.getOperations().get(0).getId();
        changed.setOperations(new ArrayList<>(List.of(changed.getOperations().get(0))));
        changed.setName("CHG068 calculation edited");
        Calculation revised = calculations.saveDefinition(changed);
        assertEquals(saved.getId(), revised.getId());
        assertEquals(firstId, revised.getOperations().get(0).getId());
        assertEquals(Integer.valueOf(1),
                jdbcTemplate.queryForObject(
                        "SELECT count(*) FROM clinlims.calculation_operation WHERE calculation_id=?", Integer.class,
                        saved.getId()));
        Calculation stale = copy(saved, Calculation.class);
        rejected(409, () -> calculations.saveDefinition(stale));
        Calculation foreign = copy(revised, Calculation.class);
        foreign.getOperations().get(0).setId(999999);
        rejected(400, () -> calculations.saveDefinition(foreign));
        calculations.setDefinitionActive(saved.getId(), false);
        Calculation inactive = copy(calculations.getDefinition(saved.getId()), Calculation.class);
        inactive.setNote("仍停用");
        assertFalse(calculations.saveDefinition(inactive).getActive());
    }

    @Test
    public void calculationOperationFailureRollsBackParentAndDeletedOperations() throws Exception {
        Calculation saved = calculations.saveDefinition(calculation("rollback", true));
        String version = saved.getConfigurationVersion();
        List<Integer> ids = saved.getOperations().stream().map(Operation::getId).toList();
        Calculation changed = copy(saved, Calculation.class);
        changed.setName("CHG068 rejected operation");
        changed.getOperations().get(2).setValue("17");
        jdbcTemplate.execute(
                "ALTER TABLE clinlims.calculation_operation ADD CONSTRAINT chg068_reject_operation CHECK (value IS DISTINCT FROM '17')");
        try {
            calculations.saveDefinition(changed);
            fail("Expected PostgreSQL constraint failure");
        } catch (RuntimeException expected) {
            assertFalse(expected instanceof ResponseStatusException);
        }
        Calculation unchanged = calculations.getDefinition(saved.getId());
        assertEquals(saved.getName(), unchanged.getName());
        assertEquals(version, unchanged.getConfigurationVersion());
        assertEquals(ids, unchanged.getOperations().stream().map(Operation::getId).toList());
        assertEquals("2", unchanged.getOperations().get(2).getValue());
    }

    @Test
    public void normalRangeDoesNotRequireThresholdsAndBetweenRequiresSecondValue() {
        ReflexRule normal = rule(true, false);
        var condition = normal.getConditions().iterator().next();
        condition.setRelation(ReflexRuleOptions.NumericRelationOptions.INSIDE_NORMAL_RANGE);
        condition.setValue(null);
        condition.setValue2(null);
        assertNotNull(reflex.save(normal).getId());
        assertEquals(1, derivedCount());
        ReflexRule between = rule(true, false);
        between.setRuleName("CHG068 between");
        between.getConditions().iterator().next().setRelation(ReflexRuleOptions.NumericRelationOptions.BETWEEN);
        rejected(400, () -> reflex.save(between));
        assertEquals(1, derivedCount());
    }

    @Test
    public void betweenPersistsSignedScientificBoundsAndRejectsReversedRange() throws Exception {
        ReflexRule candidate = rule(true, false);
        candidate.setRuleName("CHG068 signed between");
        var condition = candidate.getConditions().iterator().next();
        condition.setRelation(ReflexRuleOptions.NumericRelationOptions.BETWEEN);
        condition.setValue("-5e-8");
        condition.setValue2("-1e-9");
        ReflexRule saved = reflex.save(candidate);
        assertEquals("-5e-8", saved.getConditions().iterator().next().getValue());
        assertEquals("-1e-9", saved.getConditions().iterator().next().getValue2());
        assertEquals("-5.0E-8--1.0E-9", jdbcTemplate.queryForObject(
                "SELECT non_dictionary_value FROM clinlims.test_reflex WHERE test_id=?", String.class, TEST));
        ReflexRule reversed = copy(saved, ReflexRule.class);
        reversed.getConditions().iterator().next().setValue("5");
        reversed.getConditions().iterator().next().setValue2("1");
        rejected(400, () -> reflex.save(reversed));
        assertEquals(saved.getConfigurationVersion(), reflex.get(saved.getId()).getConfigurationVersion());
        assertEquals(1, derivedCount());
        ReflexRule positive = copy(saved, ReflexRule.class);
        positive.getConditions().iterator().next().setValue("1e-9");
        positive.getConditions().iterator().next().setValue2("5e-8");
        reflex.save(positive);
        assertEquals("1.0E-9-5.0E-8", jdbcTemplate.queryForObject(
                "SELECT non_dictionary_value FROM clinlims.test_reflex WHERE test_id=?", String.class, TEST));
    }

    @Test
    public void rawDerivedValuesRespectExistingColumnLengthBeforePersistence() {
        assertEquals(Integer.valueOf(50), jdbcTemplate.queryForObject(
                "SELECT character_maximum_length FROM information_schema.columns WHERE table_schema='clinlims' AND table_name='test_reflex' AND column_name='non_dictionary_value'",
                Integer.class));
        ReflexRule normal = rule(true, false);
        var condition = normal.getConditions().iterator().next();
        condition.setRelation(ReflexRuleOptions.NumericRelationOptions.INSIDE_NORMAL_RANGE);
        condition.setValue("x".repeat(51));
        rejected(400, () -> reflex.save(normal));
        assertEquals(0, derivedCount());
        jdbcTemplate.update("UPDATE clinlims.test_result SET tst_rslt_type='A' WHERE test_id=?", TEST);
        ReflexRule text = rule(true, false);
        condition = text.getConditions().iterator().next();
        condition.setRelation(ReflexRuleOptions.NumericRelationOptions.EQUALS);
        condition.setValue("中".repeat(51));
        rejected(400, () -> reflex.save(text));
        assertEquals(0, derivedCount());
        condition.setValue("中".repeat(50));
        reflex.save(text);
        assertEquals("中".repeat(50), jdbcTemplate.queryForObject(
                "SELECT non_dictionary_value FROM clinlims.test_reflex WHERE test_id=?", String.class, TEST));
    }

}
