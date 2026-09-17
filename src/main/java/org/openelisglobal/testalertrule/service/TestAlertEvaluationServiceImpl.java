package org.openelisglobal.testalertrule.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.openelisglobal.alert.service.AlertService;
import org.openelisglobal.alert.valueholder.AlertSeverity;
import org.openelisglobal.alert.valueholder.AlertType;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.common.util.StringUtil;
import org.openelisglobal.notification.service.sender.AsyncNotificationDispatcher;
import org.openelisglobal.notification.valueholder.EmailNotification;
import org.openelisglobal.notification.valueholder.RemoteNotification;
import org.openelisglobal.notification.valueholder.SMSNotification;
import org.openelisglobal.notifications.service.HeaderNotificationService;
import org.openelisglobal.patient.valueholder.Patient;
import org.openelisglobal.person.valueholder.Person;
import org.openelisglobal.result.service.ResultService;
import org.openelisglobal.result.valueholder.Result;
import org.openelisglobal.resultlimit.service.ResultLimitService;
import org.openelisglobal.resultlimits.valueholder.ResultLimit;
import org.openelisglobal.role.service.RoleService;
import org.openelisglobal.role.valueholder.Role;
import org.openelisglobal.samplehuman.service.SampleHumanService;
import org.openelisglobal.test.valueholder.Test;
import org.openelisglobal.testalertrule.valueholder.TestAlertRule;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TestAlertEvaluationServiceImpl implements TestAlertEvaluationService {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String CRITICAL_RESULT_ENTITY = "Result";

    @Autowired
    private TestAlertRuleService alertRuleService;

    @Autowired
    private ResultService resultService;

    @Autowired
    private ResultLimitService resultLimitService;

    @Autowired
    private AlertService alertService;

    @Autowired
    private HeaderNotificationService headerNotificationService;

    @Autowired
    private RoleService roleService;

    @Autowired
    private SampleHumanService sampleHumanService;

    // Sends SMS/Email off the request thread so the result-entry response isn't
    // blocked on SMTP / SMS-gateway calls (same async behavior as the default
    // test-notification flow).
    @Autowired
    private AsyncNotificationDispatcher asyncNotificationDispatcher;

    @Override
    @Transactional
    public void evaluateAndDispatch(Result result, String sysUserId) {
        if (result == null || result.getAnalysis() == null) {
            return;
        }
        Test test = result.getAnalysis().getTest();
        if (test == null) {
            return;
        }
        List<TestAlertRule> rules = alertRuleService.getByTestId(test.getId());
        if (rules == null || rules.isEmpty()) {
            return;
        }
        String value = result.getValue();
        for (TestAlertRule rule : rules) {
            if (!Boolean.TRUE.equals(rule.getEnabled())) {
                continue;
            }
            Optional<CriticalResultMatch> criticalMatch = "CRITICAL".equals(rule.getTriggerType())
                    ? evaluateCriticalResult(result)
                    : Optional.empty();
            if ("CRITICAL".equals(rule.getTriggerType()) ? criticalMatch.isEmpty() : !matches(rule, result, value)) {
                continue;
            }
            String testName = test.getLocalizedName() != null ? test.getLocalizedName() : test.getName();
            String subject = "Test alert: " + testName;
            String message = "[ALERT: " + rule.getName() + "] " + testName + (value != null ? " result " + value : "");
            if (criticalMatch.isPresent() && Boolean.TRUE.equals(rule.getAcknowledgmentRequired())) {
                createCriticalResultAlert(result, rule, testName, criticalMatch.get(), sysUserId);
            }
            dispatchHeader(rule, message, sysUserId);
            dispatchExternal(rule, subject, message, result);
        }
    }

    private boolean matches(TestAlertRule rule, Result result, String value) {
        String trigger = rule.getTriggerType();
        if (trigger == null) {
            return false;
        }
        switch (trigger) {
        case "ALL":
            return true;
        case "SPECIFIC_VALUE":
            return rule.getTriggerValue() != null && rule.getTriggerValue().equals(value);
        case "ABNORMAL":
            return resultService.isAbnormalDictionaryResult(result);
        default:
            // CRITICAL is evaluated separately so its frozen threshold evidence can be
            // persisted. COMPLIANCE_BREACH waits for the compliance module.
            return false;
        }
    }

    /**
     * Match a numeric result against the age/gender/specimen-specific limits chosen
     * by the same service used by result display and validation. Infinite defaults
     * mean "not configured" and therefore never trigger.
     */
    Optional<CriticalResultMatch> evaluateCriticalResult(Result result) {
        if (result == null || result.getAnalysis() == null || result.getValue() == null) {
            return Optional.empty();
        }
        String rawValue = result.getValue().trim();
        String numericText = StringUtil.getActualNumericValue(rawValue);
        if ("NaN".equals(numericText)) {
            return Optional.empty();
        }
        double numericValue;
        try {
            numericValue = Double.parseDouble(numericText);
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        if (!Double.isFinite(numericValue)) {
            return Optional.empty();
        }

        ResultLimit limit;
        try {
            limit = resultLimitService.getResultLimitForAnalysis(result.getAnalysis());
        } catch (RuntimeException e) {
            LogEvent.logError(e);
            return Optional.empty();
        }
        if (limit == null) {
            return Optional.empty();
        }

        double low = limit.getLowCritical();
        boolean below = Double.isFinite(low)
                && (numericValue < low || rawValue.startsWith("<") && numericValue <= low);
        if (below) {
            return Optional.of(new CriticalResultMatch("LOW", numericText, Double.toString(low), limit.getId()));
        }
        double high = limit.getHighCritical();
        boolean above = Double.isFinite(high)
                && (numericValue > high || rawValue.startsWith(">") && numericValue >= high);
        if (above) {
            return Optional.of(new CriticalResultMatch("HIGH", numericText, Double.toString(high), limit.getId()));
        }
        return Optional.empty();
    }

    private void createCriticalResultAlert(Result result, TestAlertRule rule, String testName,
            CriticalResultMatch match, String sysUserId) {
        Long resultId = numericId(result.getId());
        if (resultId == null) {
            // Never create an alert that cannot be tied to the persisted result.
            return;
        }
        Map<String, Object> evidence = new LinkedHashMap<>();
        evidence.put("schemaVersion", 1);
        evidence.put("resultId", result.getId());
        evidence.put("analysisId", result.getAnalysis().getId());
        evidence.put("testId", result.getAnalysis().getTest().getId());
        evidence.put("testName", testName);
        evidence.put("ruleId", rule.getId());
        evidence.put("ruleName", rule.getName());
        evidence.put("triggeredBy", sysUserId);
        evidence.put("observedValue", result.getValue());
        evidence.put("numericValue", match.numericValue());
        evidence.put("direction", match.direction());
        evidence.put("threshold", match.threshold());
        evidence.put("resultLimitId", match.resultLimitId());
        try {
            String unsignedEvidence = JSON.writeValueAsString(evidence);
            evidence.put("evidenceDigest", sha256(unsignedEvidence));
            String context = JSON.writeValueAsString(evidence);
            alertService.createAlert(AlertType.CRITICAL_RESULT, CRITICAL_RESULT_ENTITY, resultId,
                    AlertSeverity.CRITICAL, "Critical result requires acknowledgment: " + testName, context);
        } catch (JsonProcessingException e) {
            LogEvent.logError(e);
        }
    }

    private Long numericId(String value) {
        try {
            return value == null ? null : Long.valueOf(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte item : digest) {
                hex.append(String.format("%02x", item));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    record CriticalResultMatch(String direction, String numericValue, String threshold, String resultLimitId) {
    }

    private void dispatchHeader(TestAlertRule rule, String message, String sysUserId) {
        if (notBlank(rule.getNotifyRoleId())) {
            try {
                Role role = roleService.get(rule.getNotifyRoleId());
                if (role != null && role.getName() != null) {
                    headerNotificationService.notifyRole(role.getName(), message);
                }
            } catch (RuntimeException e) {
                LogEvent.logError(e);
            }
        }
        // Always surface to the validating user so the alert is visible in-app.
        if (notBlank(sysUserId)) {
            headerNotificationService.notifyUser(sysUserId, message);
        }
    }

    private void dispatchExternal(TestAlertRule rule, String subject, String message, Result result) {
        if (Boolean.TRUE.equals(rule.getNotifySms())) {
            if (notBlank(rule.getNotifyCustomPhone())) {
                sendSms(rule.getNotifyCustomPhone(), subject, message);
            }
            if (Boolean.TRUE.equals(rule.getNotifyPatient())) {
                String phone = patientContact(result, true);
                if (notBlank(phone)) {
                    sendSms(phone, subject, message);
                }
            }
        }
        if (Boolean.TRUE.equals(rule.getNotifyEmail())) {
            if (notBlank(rule.getNotifyCustomEmail())) {
                sendEmail(rule.getNotifyCustomEmail(), subject, message);
            }
            if (Boolean.TRUE.equals(rule.getNotifyPatient())) {
                String email = patientContact(result, false);
                if (notBlank(email)) {
                    sendEmail(email, subject, message);
                }
            }
        }
        // Ordering-physician and referring-facility recipient resolution is a
        // follow-up; custom + patient channels are wired here.
    }

    private void sendSms(String phone, String subject, String message) {
        SMSNotification sms = new SMSNotification();
        sms.setReceiverPhoneNumber(phone);
        sms.setPayload(new AlertNotificationPayload(subject, message));
        dispatch(sms);
    }

    private void sendEmail(String email, String subject, String message) {
        EmailNotification mail = new EmailNotification();
        mail.setRecipientEmailAddress(email);
        mail.setPayload(new AlertNotificationPayload(subject, message));
        dispatch(mail);
    }

    private void dispatch(RemoteNotification notification) {
        // Fire-and-forget on a separate thread; the notification already carries
        // a fully-resolved string payload, so no Hibernate session is needed.
        asyncNotificationDispatcher.dispatch(notification);
    }

    private String patientContact(Result result, boolean phone) {
        try {
            Patient patient = sampleHumanService.getPatientForSample(result.getAnalysis().getSampleItem().getSample());
            Person person = patient != null ? patient.getPerson() : null;
            if (person == null) {
                return null;
            }
            if (phone) {
                return notBlank(person.getCellPhone()) ? person.getCellPhone() : person.getPrimaryPhone();
            }
            return person.getEmail();
        } catch (RuntimeException e) {
            LogEvent.logError(e);
            return null;
        }
    }

    private boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
