package org.openelisglobal.testalertrule.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.alert.service.AlertService;
import org.openelisglobal.alert.valueholder.AlertSeverity;
import org.openelisglobal.alert.valueholder.AlertType;
import org.openelisglobal.analysis.valueholder.Analysis;
import org.openelisglobal.notification.service.sender.AsyncNotificationDispatcher;
import org.openelisglobal.notifications.service.HeaderNotificationService;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultlimit.service.ResultLimitService;
import org.openelisglobal.resultlimits.valueholder.ResultLimit;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.testalertrule.valueholder.TestAlertRule;

@RunWith(MockitoJUnitRunner.class)
public class TestAlertEvaluationServiceImplTest {

    @Mock
    private TestAlertRuleService alertRuleService;
    @Mock
    private ResultService resultService;
    @Mock
    private ResultLimitService resultLimitService;
    @Mock
    private AlertService alertService;
    @Mock
    private HeaderNotificationService headerNotificationService;
    @Mock
    private RoleService roleService;
    @Mock
    private SampleHumanService sampleHumanService;
    @Mock
    private AsyncNotificationDispatcher asyncNotificationDispatcher;

    @InjectMocks
    private TestAlertEvaluationServiceImpl service;

    private Result result;
    private ResultLimit limits;

    @Before
    public void setUp() {
        org.openelisglobal.test.valueholder.Test test = mock(org.openelisglobal.test.valueholder.Test.class);
        when(test.getId()).thenReturn("91");
        when(test.getLocalizedName()).thenReturn("Q01 simulated potassium");
        Analysis analysis = new Analysis();
        analysis.setId("72");
        analysis.setTest(test);
        result = new Result();
        result.setId("501");
        result.setAnalysis(analysis);

        limits = new ResultLimit();
        limits.setId("301");
        limits.setLowCritical(2.5d);
        limits.setHighCritical(6.5d);
        when(resultLimitService.getResultLimitForAnalysis(analysis)).thenReturn(limits);
    }

    @Test
    public void evaluatesConfiguredLowHighAndAnalyzerInequalityBoundaries() {
        result.setValue("2.4");
        assertMatch("LOW", "2.5");

        result.setValue("6.6");
        assertMatch("HIGH", "6.5");

        result.setValue(">6.5");
        assertMatch("HIGH", "6.5");

        result.setValue("6.5");
        assertFalse(service.evaluateCriticalResult(result).isPresent());
    }

    @Test
    public void ignoresNonNumericValuesAndUnconfiguredInfiniteBounds() {
        result.setValue("hemolysed");
        assertFalse(service.evaluateCriticalResult(result).isPresent());

        limits.setLowCritical(Double.POSITIVE_INFINITY);
        limits.setHighCritical(Double.POSITIVE_INFINITY);
        result.setValue("4.0");
        assertFalse(service.evaluateCriticalResult(result).isPresent());
    }

    @Test
    public void criticalAcknowledgmentRuleCreatesOneFrozenResultAlert() {
        TestAlertRule rule = new TestAlertRule();
        rule.setId("rule-q01");
        rule.setTestId("91");
        rule.setName("Q01 simulated critical range");
        rule.setTriggerType("CRITICAL");
        rule.setEnabled(true);
        rule.setAcknowledgmentRequired(true);
        when(alertRuleService.getByTestId("91")).thenReturn(List.of(rule));
        result.setValue("7.1");

        service.evaluateAndDispatch(result, "1");

        ArgumentCaptor<String> context = ArgumentCaptor.forClass(String.class);
        verify(alertService).createAlert(eq(AlertType.CRITICAL_RESULT), eq("Result"), eq(501L),
                eq(AlertSeverity.CRITICAL), eq("Critical result requires acknowledgment: Q01 simulated potassium"),
                context.capture());
        assertTrue(context.getValue().contains("\"direction\":\"HIGH\""));
        assertTrue(context.getValue().contains("\"threshold\":\"6.5\""));
        assertTrue(context.getValue().contains("\"triggeredBy\":\"1\""));
        assertTrue(context.getValue().matches(".*\"evidenceDigest\":\"[0-9a-f]{64}\".*"));
        verify(headerNotificationService).notifyUser("1", "[ALERT: Q01 simulated critical range] "
                + "Q01 simulated potassium result 7.1");
    }

    @Test
    public void criticalRuleWithoutAcknowledgmentDoesNotCreateLifecycleAlert() {
        TestAlertRule rule = new TestAlertRule();
        rule.setTestId("91");
        rule.setName("Notification only");
        rule.setTriggerType("CRITICAL");
        rule.setEnabled(true);
        rule.setAcknowledgmentRequired(false);
        when(alertRuleService.getByTestId("91")).thenReturn(List.of(rule));
        result.setValue("7.1");

        service.evaluateAndDispatch(result, "1");

        verify(alertService, never()).createAlert(any(), any(), any(), any(), any(), any());
    }

    private void assertMatch(String direction, String threshold) {
        Optional<TestAlertEvaluationServiceImpl.CriticalResultMatch> match = service.evaluateCriticalResult(result);
        assertTrue(match.isPresent());
        assertEquals(direction, match.get().direction());
        assertEquals(threshold, match.get().threshold());
    }
}
