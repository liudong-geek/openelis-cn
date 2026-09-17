package org.openelisglobal.alert.controller.rest;

import static org.junit.Assert.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.openelisglobal.alert.form.AcknowledgeAlertRequest;
import org.openelisglobal.alert.form.AlertDTO;
import org.openelisglobal.alert.service.AlertService;
import org.openelisglobal.alert.valueholder.Alert;
import org.openelisglobal.alert.valueholder.AlertSeverity;
import org.openelisglobal.alert.valueholder.AlertStatus;
import org.openelisglobal.alert.valueholder.AlertType;
import org.openelisglobal.coldstorage.service.FreezerService;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

@RunWith(MockitoJUnitRunner.class)
public class AlertRestControllerUnitTest {

    @Mock
    private AlertService alertService;
    @Mock
    private FreezerService freezerService;

    @InjectMocks
    private AlertRestController controller;

    @Test
    public void acknowledgeUsesAuthenticatedSessionActorAndPersistsRequestNotes() {
        Alert alert = new Alert();
        alert.setId(41L);
        alert.setAlertType(AlertType.CRITICAL_RESULT);
        alert.setAlertEntityType("Result");
        alert.setAlertEntityId(501L);
        alert.setSeverity(AlertSeverity.CRITICAL);
        alert.setStatus(AlertStatus.ACKNOWLEDGED);
        alert.setAcknowledgmentNotes("Read-back confirmed");
        when(alertService.acknowledgeAlert(41L, 7, "Read-back confirmed")).thenReturn(alert);

        UserSessionData sessionUser = new UserSessionData();
        sessionUser.setSytemUserId(7);
        MockHttpServletRequest httpRequest = new MockHttpServletRequest();
        httpRequest.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, sessionUser);
        AcknowledgeAlertRequest request = new AcknowledgeAlertRequest();
        request.setUserId(999);
        request.setNotes("Read-back confirmed");

        ResponseEntity<AlertDTO> response = controller.acknowledgeAlert(41L, request, httpRequest);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("Read-back confirmed", response.getBody().getAcknowledgmentNotes());
        verify(alertService).acknowledgeAlert(41L, 7, "Read-back confirmed");
    }
}
