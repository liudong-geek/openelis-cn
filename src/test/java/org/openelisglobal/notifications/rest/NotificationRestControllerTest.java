package org.openelisglobal.notifications.rest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.notifications.dao.NotificationDAO;
import org.openelisglobal.notifications.dao.NotificationSubscriptionDAO;
import org.openelisglobal.notifications.entity.NotificationSubscriptions;
import org.openelisglobal.notifications.rest.NotificationRestController.PushSubscriptionStatus;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

public class NotificationRestControllerTest {

    private NotificationSubscriptionDAO subscriptionDAO;
    private NotificationRestController controller;
    private MockHttpServletRequest request;

    @Before
    public void setUp() {
        subscriptionDAO = mock(NotificationSubscriptionDAO.class);
        controller = new NotificationRestController(mock(NotificationDAO.class), mock(SystemUserService.class),
                subscriptionDAO);
        request = new MockHttpServletRequest();
        UserSessionData sessionData = new UserSessionData();
        sessionData.setSytemUserId(17);
        request.getSession().setAttribute(IActionConstants.USER_SESSION_DATA, sessionData);
    }

    @Test
    public void getSubscriptionDetailsReturnsDisabledStateWhenPushIsNotConfigured() {
        when(subscriptionDAO.getNotificationSubscriptionByUserId(17L)).thenReturn(null);

        ResponseEntity<PushSubscriptionStatus> response = controller.getSubscriptionDetails(request);

        assertEquals(200, response.getStatusCodeValue());
        assertFalse(response.getBody().subscribed());
        assertNull(response.getBody().pfEndpoint());
    }

    @Test
    public void getSubscriptionDetailsOnlyExposesSubscriptionStateAndEndpoint() {
        NotificationSubscriptions subscription = new NotificationSubscriptions();
        subscription.setPfEndpoint("https://push.example/subscription/17");
        subscription.setPfP256dh("private-client-key");
        subscription.setPfAuth("private-auth-secret");
        when(subscriptionDAO.getNotificationSubscriptionByUserId(17L)).thenReturn(subscription);

        ResponseEntity<PushSubscriptionStatus> response = controller.getSubscriptionDetails(request);

        assertEquals(200, response.getStatusCodeValue());
        assertTrue(response.getBody().subscribed());
        assertEquals("https://push.example/subscription/17", response.getBody().pfEndpoint());
    }
}
