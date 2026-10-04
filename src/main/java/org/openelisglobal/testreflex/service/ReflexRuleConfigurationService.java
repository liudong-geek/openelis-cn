package org.openelisglobal.testreflex.service;

import static org.openelisglobal.testcalculated.service.RuleConfigurationValidation.*;

import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.openelisglobal.common.util.UserContextHolder;
import org.openelisglobal.test.service.TestService;
import org.openelisglobal.testreflex.action.bean.ReflexRule;
import org.openelisglobal.testreflex.action.bean.ReflexRuleAction;
import org.openelisglobal.testreflex.action.bean.ReflexRuleCondition;
import org.openelisglobal.testreflex.action.bean.ReflexRuleOptions.NumericRelationOptions;
import org.openelisglobal.testreflex.dao.ReflexRuleDAO;
import org.openelisglobal.testreflex.dao.TestReflexDAO;
import org.openelisglobal.testresult.service.TestResultService;
import org.openelisglobal.typeofsample.service.TypeOfSampleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ReflexRuleConfigurationService {
    @Autowired
    private ReflexRuleDAO rules;
    @Autowired
    private TestReflexDAO derived;
    @Autowired
    private TestReflexService writer;
    @Autowired
    private TypeOfSampleService samples;
    @Autowired
    private TestService tests;
    @Autowired
    private TestResultService results;
    @Autowired
    private UserContextHolder userContext;

    @Transactional(readOnly = true)
    public ReflexRule get(Integer id) {
        require(id != null && id > 0);
        return rules.get(id).orElseThrow(() -> missing());
    }

    @Transactional
    public ReflexRule save(ReflexRule supplied) {
        require(supplied != null && supplied.getRuleName() != null && !supplied.getRuleName().isBlank()
                && supplied.getRuleName().length() <= 64 && supplied.getActive() != null
                && supplied.getOverall() != null);
        require(supplied.getConditions() != null && !supplied.getConditions().isEmpty() && supplied.getActions() != null
                && !supplied.getActions().isEmpty());
        ReflexRule stored = supplied.getId() == null ? null : get(supplied.getId());
        if (stored != null) {
            version(supplied.getConfigurationVersion(), stored);
            require(Objects.equals(supplied.getAnalyteId(), stored.getAnalyteId()));
        } else {
            require(supplied.getAnalyteId() == null && supplied.getLastupdated() == null);
        }
        Map<Integer, ReflexRuleCondition> conditions = new HashMap<>();
        Map<Integer, ReflexRuleAction> actions = new HashMap<>();
        if (stored != null) {
            stored.getConditions().forEach(c -> conditions.put(c.getId(), c));
            stored.getActions().forEach(a -> actions.put(a.getId(), a));
        }
        Set<Integer> conditionIds = new HashSet<>(), actionIds = new HashSet<>();
        for (ReflexRuleCondition condition : supplied.getConditions()) {
            require(condition != null && condition.getRelation() != null);
            if (condition.getId() == null)
                require(condition.getTestAnalyteId() == null);
            else {
                ReflexRuleCondition original = conditions.get(condition.getId());
                require(original != null && conditionIds.add(condition.getId())
                        && Objects.equals(original.getTestAnalyteId(), condition.getTestAnalyteId()));
            }
            validateCondition(condition);
        }
        for (ReflexRuleAction action : supplied.getActions()) {
            require(action != null);
            if (action.getId() == null)
                require(action.getTestReflexId() == null);
            else {
                ReflexRuleAction original = actions.get(action.getId());
                require(original != null && actionIds.add(action.getId())
                        && Objects.equals(original.getTestReflexId(), action.getTestReflexId()));
            }
            require(action.getReflexTestName() != null && !action.getReflexTestName().isBlank()
                    && action.getReflexTestName().length() <= 64);
            require(action.getInternalNote() == null || action.getInternalNote().length() <= 50);
            require(action.getExternalNote() == null || action.getExternalNote().length() <= 50);
            linked(action.getReflexTestId(), action.getSampleId());
            require(action.getAddNotification() == null || "Y".equals(action.getAddNotification())
                    || "N".equals(action.getAddNotification()));
        }
        ReflexRule target = supplied;
        if (stored != null) {
            // Remove every original derived row before changing the managed child
            // collection.
            for (ReflexRuleCondition original : stored.getConditions()) {
                if (original.getTestAnalyteId() != null)
                    derived.getTestReflexsByTestAnalyteId(original.getTestAnalyteId().toString())
                            .forEach(derived::delete);
            }
            Set<ReflexRuleCondition> retainedConditions = new LinkedHashSet<>();
            for (ReflexRuleCondition condition : supplied.getConditions()) {
                ReflexRuleCondition targetCondition = condition.getId() == null ? new ReflexRuleCondition()
                        : conditions.get(condition.getId());
                copy(condition, targetCondition);
                retainedConditions.add(targetCondition);
            }
            Set<ReflexRuleAction> retainedActions = new LinkedHashSet<>();
            for (ReflexRuleAction action : supplied.getActions()) {
                ReflexRuleAction targetAction = action.getId() == null ? new ReflexRuleAction()
                        : actions.get(action.getId());
                copy(action, targetAction);
                retainedActions.add(targetAction);
            }
            stored.getConditions().clear();
            stored.getConditions().addAll(retainedConditions);
            stored.getActions().clear();
            stored.getActions().addAll(retainedActions);
            stored.setRuleName(supplied.getRuleName());
            stored.setOverall(supplied.getOverall());
            stored.setActive(supplied.getActive());
            target = stored;
        }
        target.setConfigurationVersion(null);
        target.setSysUserId(userContext.requireSysUserId());
        writer.saveOrUpdateReflexRule(target);
        return get(target.getId());
    }

    @Transactional
    public ReflexRule setActive(Integer id, boolean active) {
        ReflexRule rule = get(id);
        if (active) {
            for (ReflexRuleCondition condition : rule.getConditions())
                validateCondition(condition);
            for (ReflexRuleAction action : rule.getActions())
                linked(action.getReflexTestId(), action.getSampleId());
        }
        rule.setSysUserId(userContext.requireSysUserId());
        boolean changed = active ? writer.activateReflexRule(id.toString())
                : writer.deactivateReflexRule(id.toString());
        if (!changed)
            throw missing();
        return get(id);
    }

    private void linked(String testId, String sampleId) {
        positiveId(testId);
        positiveId(sampleId);
        var sample = samples.getTypeOfSampleById(sampleId);
        require(sample != null && sample.isActive());
        require(samples.getActiveTestsBySampleTypeId(sampleId, false).stream().anyMatch(t -> testId.equals(t.getId())));
    }

    private void validateCondition(ReflexRuleCondition condition) {
        require(condition.getTestName() != null && !condition.getTestName().isBlank()
                && condition.getTestName().length() <= 64);
        require(condition.getValue() == null || condition.getValue().length() <= 64);
        require(condition.getValue2() == null || condition.getValue2().length() <= 64);
        linked(condition.getTestId(), condition.getSampleId());
        String type = tests.getResultType(tests.getTestById(condition.getTestId()));
        if ("N".equals(type)) {
            if (condition.getRelation() != NumericRelationOptions.INSIDE_NORMAL_RANGE
                    && condition.getRelation() != NumericRelationOptions.OUTSIDE_NORMAL_RANGE) {
                finite(condition.getValue());
                if (condition.getRelation() == NumericRelationOptions.BETWEEN) {
                    finite(condition.getValue2());
                    require(Double.parseDouble(condition.getValue()) <= Double.parseDouble(condition.getValue2()));
                }
            } else {
                // These relations keep the original value in the existing derived column.
                require(condition.getValue() == null || condition.getValue().length() <= 50);
            }
        } else {
            require(condition.getValue() != null && !condition.getValue().isBlank());
            require("D".equals(type) || condition.getValue().length() <= 50);
            if ("D".equals(type))
                require(results.getActiveTestResultsByTest(condition.getTestId()).stream()
                        .anyMatch(result -> Objects.equals(result.getValue(), condition.getValue())));
        }
    }

    private void finite(String value) {
        try {
            require(value != null && Double.isFinite(Double.parseDouble(value)));
        } catch (NumberFormatException exception) {
            require(false);
        }
    }

    private void copy(ReflexRuleCondition source, ReflexRuleCondition target) {
        target.setSampleId(source.getSampleId());
        target.setTestId(source.getTestId());
        target.setTestName(source.getTestName());
        target.setRelation(source.getRelation());
        target.setValue(source.getValue());
        target.setValue2(source.getValue2());
    }

    private void copy(ReflexRuleAction source, ReflexRuleAction target) {
        target.setSampleId(source.getSampleId());
        target.setReflexTestId(source.getReflexTestId());
        target.setReflexTestName(source.getReflexTestName());
        target.setInternalNote(source.getInternalNote());
        target.setExternalNote(source.getExternalNote());
        target.setAddNotification(source.getAddNotification());
    }
}
