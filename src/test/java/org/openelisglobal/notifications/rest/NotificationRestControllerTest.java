package org.openelisglobal.notifications.rest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyZeroInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Map;
import nl.martijndwars.webpush.PushService;
import org.apache.http.HttpResponse;
import org.apache.http.StatusLine;
import org.junit.Before;
import org.junit.Test;
import org.openelisglobal.common.action.IActionConstants;
import org.openelisglobal.login.valueholder.UserSessionData;
import org.openelisglobal.notifications.dao.NotificationDAO;
import org.openelisglobal.notifications.dao.NotificationSubscriptionDAO;
import org.openelisglobal.notifications.entity.Notification;
import org.openelisglobal.notifications.entity.NotificationSubscriptions;
import org.openelisglobal.notifications.rest.NotificationRestController.PushSubscriptionStatus;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

public class NotificationRestControllerTest {

    private NotificationSubscriptionDAO subscriptionDAO;
    private NotificationDAO notificationDAO;
    private SystemUserService users;
    private PushService pushService;
    private NotificationRestController controller;
    private MockHttpServletRequest request;

    @Before
    public void setUp() {
        subscriptionDAO = mock(NotificationSubscriptionDAO.class);
        notificationDAO = mock(NotificationDAO.class);
        users = mock(SystemUserService.class);
        pushService = mock(PushService.class);
        controller = new TransportControlledController(notificationDAO, users, subscriptionDAO, pushService);
        SystemUser recipient = new SystemUser();
        recipient.setId("17");
        when(users.getUserById("17")).thenReturn(recipient);
        doAnswer(invocation -> {
            ((Notification) invocation.getArgument(0)).setId(301L);
            return null;
        }).when(notificationDAO).save(any(Notification.class));
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

    @Test
    public void savingWithoutSubscriptionReturnsThePersistedReceiptAndDoesNotAttemptPush() {
        ResponseEntity<?> response = controller.saveNotification("17", notice());

        assertSaved(response, "NOT_SUBSCRIBED");
        verify(notificationDAO, times(1)).save(any(Notification.class));
        verify(subscriptionDAO, times(1)).getNotificationSubscriptionByUserId(17L);
        verifyZeroInteractions(pushService);
    }

    @Test
    public void daoFailureIsNotASuccessfulSaveAndNeverStartsOptionalPush() {
        doThrow(new IllegalStateException("fixture DAO failure")).when(notificationDAO).save(any(Notification.class));

        ResponseEntity<?> response = controller.saveNotification("17", notice());

        assertEquals(500, response.getStatusCodeValue());
        Map<String, Object> receipt = receipt(response);
        assertEquals(Boolean.FALSE, receipt.get("saved"));
        assertNull(receipt.get("id"));
        assertEquals("NOT_ATTEMPTED", receipt.get("pushStatus"));
        verify(notificationDAO, times(1)).save(any(Notification.class));
        verifyZeroInteractions(subscriptionDAO, pushService);
    }

    @Test
    public void subscriptionLookupFailureCannotUndoTheSinglePersistedNotification() {
        when(subscriptionDAO.getNotificationSubscriptionByUserId(17L))
                .thenThrow(new IllegalStateException("fixture lookup failure"));

        assertSaved(controller.saveNotification("17", notice()), "FAILED");

        verify(notificationDAO, times(1)).save(any(Notification.class));
        verify(subscriptionDAO, times(1)).getNotificationSubscriptionByUserId(17L);
        verifyZeroInteractions(pushService);
    }

    @Test
    public void actualPushServiceSendExceptionCannotTurnThePersistedMessageIntoARetryableSaveFailure()
            throws Exception {
        subscribed();
        when(pushService.send(any(nl.martijndwars.webpush.Notification.class)))
                .thenThrow(new IOException("fixture send failure"));

        assertSaved(controller.saveNotification("17", notice()), "FAILED");

        verify(notificationDAO, times(1)).save(any(Notification.class));
        verify(pushService, times(1)).send(any(nl.martijndwars.webpush.Notification.class));
    }

    @Test
    public void successfulPushResponseMeansServiceAcceptanceAndKeepsTheSameSavedId() throws Exception {
        subscribed();
        pushResponse(201);

        assertSaved(controller.saveNotification("17", notice()), "ACCEPTED");

        verify(notificationDAO, times(1)).save(any(Notification.class));
        verify(pushService, times(1)).send(any(nl.martijndwars.webpush.Notification.class));
    }

    @Test
    public void rejectedPushResponseReportsFailedPushWithoutSavingAgain() throws Exception {
        subscribed();
        pushResponse(503);

        assertSaved(controller.saveNotification("17", notice()), "FAILED");

        verify(notificationDAO, times(1)).save(any(Notification.class));
        verify(pushService, times(1)).send(any(nl.martijndwars.webpush.Notification.class));
    }

    private Notification notice() {
        Notification value = new Notification();
        value.setMessage("Synthetic fixture notification");
        return value;
    }

    private void subscribed() {
        NotificationSubscriptions subscription = new NotificationSubscriptions();
        subscription.setPfEndpoint("https://push.example/subscription/17");
        subscription
                .setPfP256dh("BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU");
        subscription.setPfAuth("AAAAAAAAAAAAAAAAAAAAAA");
        when(subscriptionDAO.getNotificationSubscriptionByUserId(17L)).thenReturn(subscription);
    }

    private void pushResponse(int status) throws Exception {
        HttpResponse response = mock(HttpResponse.class);
        StatusLine line = mock(StatusLine.class);
        when(response.getStatusLine()).thenReturn(line);
        when(line.getStatusCode()).thenReturn(status);
        when(pushService.send(any(nl.martijndwars.webpush.Notification.class))).thenReturn(response);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> receipt(ResponseEntity<?> response) {
        return new ObjectMapper().convertValue(response.getBody(), Map.class);
    }

    private void assertSaved(ResponseEntity<?> response, String pushStatus) {
        assertEquals(200, response.getStatusCodeValue());
        Map<String, Object> receipt = receipt(response);
        assertEquals(Boolean.TRUE, receipt.get("saved"));
        assertEquals(301L, ((Number) receipt.get("id")).longValue());
        assertEquals(pushStatus, receipt.get("pushStatus"));
    }

    // The same source compiles against RED's old controller. Only GREEN uses
    // this factory seam; PushService.send itself is mocked, never outbound HTTP.
    private static class TransportControlledController extends NotificationRestController {
        private final PushService transport;

        TransportControlledController(NotificationDAO notifications, SystemUserService users,
                NotificationSubscriptionDAO subscriptions, PushService transport) {
            super(notifications, users, subscriptions);
            this.transport = transport;
        }

        protected PushService createPushService() {
            return transport;
        }
    }
}
