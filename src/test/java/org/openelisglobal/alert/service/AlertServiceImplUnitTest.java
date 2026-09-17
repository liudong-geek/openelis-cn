package org.openelisglobal.alert.service;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.alert.dao.AlertDAO;
import org.openelisglobal.alert.service.impl.AlertServiceImpl;
import org.openelisglobal.alert.valueholder.Alert;
import org.openelisglobal.alert.valueholder.AlertSeverity;
import org.openelisglobal.alert.valueholder.AlertStatus;
import org.openelisglobal.alert.valueholder.AlertType;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.context.ApplicationEventPublisher;

@RunWith(MockitoJUnitRunner.class)
public class AlertServiceImplUnitTest {

    @Mock
    private AlertDAO alertDAO;
    @Mock
    private SystemUserService systemUserService;
    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private AlertServiceImpl service;

    @Test
    public void criticalResultReplayReturnsOriginalAcrossEntireLifecycle() {
        Alert original = criticalAlert(10L, AlertStatus.RESOLVED);
        original.setMessage("Original");
        original.setContextData(criticalContext("6.5"));
        when(alertDAO.getAlertsByEntity("Result", 501L)).thenReturn(List.of(original));

        Alert replay = service.createAlert(AlertType.CRITICAL_RESULT, "Result", 501L, AlertSeverity.CRITICAL,
                "Changed", criticalContext("9.9"));

        assertSame(original, replay);
        assertEquals("Original", replay.getMessage());
        assertEquals(criticalContext("6.5"), replay.getContextData());
        verify(alertDAO, never()).insert(any());
        verify(alertDAO, never()).update(any());
    }

    @Test
    public void criticalResultAcknowledgmentRequiresAndPersistsOperatorNote() {
        Alert alert = criticalAlert(11L, AlertStatus.OPEN);
        when(alertDAO.get(11L)).thenReturn(Optional.of(alert));
        SystemUser user = new SystemUser();
        user.setId("1");
        when(systemUserService.get("1")).thenReturn(user);
        when(alertDAO.update(any(Alert.class))).thenAnswer(invocation -> invocation.getArgument(0));

        try {
            service.acknowledgeAlert(11L, 1, "  ");
            fail("Blank critical-result acknowledgment must be rejected");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("required"));
        }

        Alert acknowledged = service.acknowledgeAlert(11L, 1, "  Read-back confirmed  ");
        assertEquals(AlertStatus.ACKNOWLEDGED, acknowledged.getStatus());
        assertEquals("Read-back confirmed", acknowledged.getAcknowledgmentNotes());
        assertSame(user, acknowledged.getAcknowledgedBy());
    }

    private Alert criticalAlert(Long id, AlertStatus status) {
        Alert alert = new Alert();
        alert.setId(id);
        alert.setAlertType(AlertType.CRITICAL_RESULT);
        alert.setAlertEntityType("Result");
        alert.setAlertEntityId(501L);
        alert.setSeverity(AlertSeverity.CRITICAL);
        alert.setStatus(status);
        alert.setDuplicateCount(0);
        return alert;
    }

    private String criticalContext(String threshold) {
        return "{\"threshold\":\"" + threshold + "\",\"evidenceDigest\":\""
                + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}";
    }
}
