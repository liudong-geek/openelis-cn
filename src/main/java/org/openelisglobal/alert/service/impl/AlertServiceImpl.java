package org.openelisglobal.alert.service.impl;

import java.time.OffsetDateTime;
import java.util.List;
import org.openelisglobal.alert.dao.AlertDAO;
import org.openelisglobal.alert.event.AlertAcknowledgedEvent;
import org.openelisglobal.alert.event.AlertCreatedEvent;
import org.openelisglobal.alert.event.AlertResolvedEvent;
import org.openelisglobal.alert.service.AlertService;
import org.openelisglobal.alert.valueholder.Alert;
import org.openelisglobal.alert.valueholder.AlertSeverity;
import org.openelisglobal.alert.valueholder.AlertStatus;
import org.openelisglobal.alert.valueholder.AlertType;
import org.openelisglobal.common.service.BaseObjectServiceImpl;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Business logic: - Alert creation with one-alert-per-lifecycle deduplication
 * (an existing OPEN/ACKNOWLEDGED alert for the same (type, entity) is reused;
 * its duplicate count and lastDuplicateTime are bumped instead of inserting a
 * new row) - Alert lifecycle management (OPEN → ACKNOWLEDGED → RESOLVED) -
 * Event publishing for downstream processing
 */
@Service
@Transactional
public class AlertServiceImpl extends BaseObjectServiceImpl<Alert, Long> implements AlertService {

    @Autowired
    private AlertDAO alertDAO;

    @Autowired
    private SystemUserService systemUserService;

    @Autowired
    private ApplicationEventPublisher eventPublisher;

    public AlertServiceImpl() {
        super(Alert.class);
    }

    @Override
    protected AlertDAO getBaseObjectDAO() {
        return alertDAO;
    }

    @Override
    @Transactional
    public Alert createAlert(AlertType alertType, String entityType, Long entityId, AlertSeverity severity,
            String message, String contextDataJson) {

        if (alertType == AlertType.CRITICAL_RESULT) {
            Alert existingCriticalResult = findAlertAcrossLifecycle(alertType, entityType, entityId);
            if (existingCriticalResult != null) {
                // Result evidence is immutable. Re-evaluation and exact HTTP retries return
                // the original alert without changing its context or duplicate counter.
                return existingCriticalResult;
            }
        }

        Alert existingAlert = findDuplicateAlert(alertType, entityType, entityId);
        if (existingAlert != null) {
            existingAlert.setDuplicateCount(existingAlert.getDuplicateCount() + 1);
            existingAlert.setLastDuplicateTime(OffsetDateTime.now());
            alertDAO.update(existingAlert);
            return existingAlert;
        }

        Alert alert = new Alert();
        alert.setAlertType(alertType);
        alert.setAlertEntityType(entityType);
        alert.setAlertEntityId(entityId);
        alert.setSeverity(severity);
        alert.setStatus(AlertStatus.OPEN);
        alert.setStartTime(OffsetDateTime.now());
        alert.setMessage(message);
        alert.setContextData(contextDataJson);
        alert.setDuplicateCount(0);

        Long id = alertDAO.insert(alert);
        Alert createdAlert = alertDAO.get(id).orElse(alert);
        eventPublisher.publishEvent(new AlertCreatedEvent(this, createdAlert));
        return createdAlert;
    }

    @Override
    @Transactional
    public Alert acknowledgeAlert(Long alertId, Integer userId) {
        return acknowledgeAlert(alertId, userId, null);
    }

    @Override
    @Transactional
    public Alert acknowledgeAlert(Long alertId, Integer userId, String acknowledgmentNotes) {
        Alert alert = alertDAO.get(alertId)
                .orElseThrow(() -> new IllegalArgumentException("Alert not found: " + alertId));

        String normalizedNotes = acknowledgmentNotes == null ? null : acknowledgmentNotes.trim();
        if (alert.getAlertType() == AlertType.CRITICAL_RESULT
                && (normalizedNotes == null || normalizedNotes.isEmpty())) {
            throw new IllegalArgumentException("Acknowledgment notes are required for critical results");
        }

        if (alert.getStatus() == AlertStatus.ACKNOWLEDGED) {
            boolean sameUser = alert.getAcknowledgedBy() != null
                    && alert.getAcknowledgedBy().getId().equals(String.valueOf(userId));
            boolean sameNotes = java.util.Objects.equals(alert.getAcknowledgmentNotes(), normalizedNotes);
            if (sameUser && sameNotes) {
                return alert;
            }
            throw new IllegalArgumentException("Alert is already acknowledged");
        }
        if (alert.getStatus() != AlertStatus.OPEN) {
            throw new IllegalArgumentException("Only open alerts can be acknowledged");
        }

        SystemUser user = systemUserService.get(userId.toString());
        if (user == null) {
            throw new IllegalArgumentException("User not found: " + userId);
        }

        alert.setStatus(AlertStatus.ACKNOWLEDGED);
        alert.setAcknowledgedAt(OffsetDateTime.now());
        alert.setAcknowledgedBy(user);
        alert.setAcknowledgmentNotes(normalizedNotes);

        Alert updatedAlert = alertDAO.update(alert);
        eventPublisher.publishEvent(new AlertAcknowledgedEvent(this, updatedAlert, userId.longValue()));
        return updatedAlert;
    }

    @Override
    @Transactional
    public Alert resolveAlert(Long alertId, Integer userId, String resolutionNotes) {
        Alert alert = alertDAO.get(alertId)
                .orElseThrow(() -> new IllegalArgumentException("Alert not found: " + alertId));

        if (alert.getStatus() != AlertStatus.ACKNOWLEDGED) {
            throw new IllegalArgumentException("Only acknowledged alerts can be resolved");
        }
        if (alert.getAlertType() == AlertType.CRITICAL_RESULT
                && (resolutionNotes == null || resolutionNotes.trim().isEmpty())) {
            throw new IllegalArgumentException("Resolution notes are required for critical results");
        }

        SystemUser user = systemUserService.get(userId.toString());
        if (user == null) {
            throw new IllegalArgumentException("User not found: " + userId);
        }

        alert.setStatus(AlertStatus.RESOLVED);
        alert.setResolvedAt(OffsetDateTime.now());
        alert.setResolvedBy(user);
        alert.setResolutionNotes(resolutionNotes == null ? null : resolutionNotes.trim());
        alert.setEndTime(OffsetDateTime.now());

        Alert updatedAlert = alertDAO.update(alert);
        eventPublisher.publishEvent(new AlertResolvedEvent(this, updatedAlert, userId.longValue(), resolutionNotes));
        return updatedAlert;
    }

    @Override
    @Transactional(readOnly = true)
    public List<Alert> getAlertsByEntity(String entityType, Long entityId) {
        return alertDAO.getAlertsByEntity(entityType, entityId);
    }

    @Override
    @Transactional(readOnly = true)
    public Long countActiveAlertsForEntity(String entityType, Long entityId) {
        return alertDAO.countActiveAlertsForEntity(entityType, entityId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Alert> getUnacknowledgedAlertsOlderThan(String entityType, AlertStatus status, AlertSeverity severity,
            OffsetDateTime cutoff) {
        return alertDAO.getUnacknowledgedAlertsOlderThan(entityType, status, severity, cutoff);
    }

    /**
     * Find an active alert for the same (type, entity) so a repeat condition just
     * bumps the duplicate count instead of inserting a new row. We deliberately do
     * NOT use a sliding time window here: with schedulers firing every 5 min and a
     * 30-min window, any condition lasting longer than half an hour spawned a fresh
     * alert each time the window expired — which is how dev systems accumulated
     * thousands of duplicate rows for the same underlying problem.
     *
     * <p>
     * One alert per lifecycle: if an OPEN or ACKNOWLEDGED alert already exists for
     * the same (alertType, entityType, entityId), reuse it. A new alert can only be
     * created once the existing one is RESOLVED (status filter below).
     */
    private Alert findDuplicateAlert(AlertType alertType, String entityType, Long entityId) {
        List<Alert> existingAlerts = alertDAO.getAlertsByEntity(entityType, entityId);
        for (Alert existingAlert : existingAlerts) {
            if (existingAlert.getAlertType() == alertType && (existingAlert.getStatus() == AlertStatus.OPEN
                    || existingAlert.getStatus() == AlertStatus.ACKNOWLEDGED)) {
                return existingAlert;
            }
        }
        return null;
    }

    private Alert findAlertAcrossLifecycle(AlertType alertType, String entityType, Long entityId) {
        for (Alert existingAlert : alertDAO.getAlertsByEntity(entityType, entityId)) {
            if (existingAlert.getAlertType() == alertType) {
                return existingAlert;
            }
        }
        return null;
    }
}
