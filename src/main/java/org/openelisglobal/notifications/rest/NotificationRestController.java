package org.openelisglobal.notifications.rest;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.security.Security;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import nl.martijndwars.webpush.PushService;
import org.apache.http.HttpResponse;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.openelisglobal.common.rest.BaseRestController;
import org.openelisglobal.notifications.dao.NotificationDAO;
import org.openelisglobal.notifications.dao.NotificationSubscriptionDAO;
import org.openelisglobal.notifications.entity.Notification;
import org.openelisglobal.notifications.entity.NotificationSubscriptions;
import org.openelisglobal.systemuser.service.SystemUserService;
import org.openelisglobal.systemuser.valueholder.SystemUser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RequestMapping("/rest")
@RestController
public class NotificationRestController extends BaseRestController {

    public record PushSubscriptionStatus(boolean subscribed, String pfEndpoint) {
    }

    public record NotificationSaveReceipt(boolean saved, Long id, String pushStatus) {
    }

    private final NotificationDAO notificationDAO;
    private final SystemUserService systemUserService;
    private final NotificationSubscriptionDAO notificationSubscriptionDAO;

    @Autowired
    private ConfigurableEnvironment env;

    @Autowired
    public NotificationRestController(NotificationDAO notificationDAO, SystemUserService systemUserService,
            NotificationSubscriptionDAO notificationSubscriptionDAO) {
        this.notificationDAO = notificationDAO;
        this.systemUserService = systemUserService;
        this.notificationSubscriptionDAO = notificationSubscriptionDAO;
    }

    @GetMapping("/notifications/all")
    public List<Notification> getNotifications() {
        return notificationDAO.getNotifications();
    }

    @GetMapping("/notifications")
    public List<Notification> getNotificationsByUserId(HttpServletRequest request) {
        String sysUserId = getSysUserId(request);
        return notificationDAO.getNotificationsByUserId(Long.parseLong(sysUserId));
    }

    @PostMapping("/notification/{userId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> saveNotification(@PathVariable String userId, @RequestBody Notification notification) {
        try {
            // Set user and created date
            notification.setUser(systemUserService.getUserById(userId));
            notification.setCreatedDate(OffsetDateTime.now());
            notification.setReadAt(null);

            // Save notification
            notificationDAO.save(notification);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new NotificationSaveReceipt(false, null, "NOT_ATTEMPTED"));
        }

        // Persistence has succeeded. Optional browser transport cannot turn it into
        // an invitation to save the same message again.
        try {
            NotificationSubscriptions ns = notificationSubscriptionDAO
                    .getNotificationSubscriptionByUserId(Long.valueOf(userId));
            if (ns == null) {
                return ResponseEntity.ok(new NotificationSaveReceipt(true, notification.getId(), "NOT_SUBSCRIBED"));
            }
            if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
                Security.addProvider(new BouncyCastleProvider());
            }
            PushService pushService = createPushService();
            Map<String, String> payload = new HashMap<>();
            payload.put("title", "OpenELIS Global Notification");
            payload.put("body", notification.getMessage());
            payload.put("url", "http://localhost");
            String payloadJson = new ObjectMapper().writeValueAsString(payload);
            nl.martijndwars.webpush.Notification webPushNotification = new nl.martijndwars.webpush.Notification(
                    ns.getPfEndpoint(), ns.getPfP256dh(), ns.getPfAuth(), payloadJson);
            HttpResponse response = pushService.send(webPushNotification);
            int status = response.getStatusLine().getStatusCode();
            // A 2xx response acknowledges the push service, not delivery to a device.
            String pushStatus = status >= 200 && status < 300 ? "ACCEPTED" : "FAILED";
            return ResponseEntity.ok(new NotificationSaveReceipt(true, notification.getId(), pushStatus));
        } catch (Exception e) {
            return ResponseEntity.ok(new NotificationSaveReceipt(true, notification.getId(), "FAILED"));
        }
    }

    protected PushService createPushService() throws Exception {
        return new PushService(env.getProperty("vapid.public.key"), env.getProperty("vapid.private.key"),
                "mailto:your-email@example.com");
    }

    @GetMapping("/notification/pnconfig")
    public ResponseEntity<PushSubscriptionStatus> getSubscriptionDetails(HttpServletRequest request) {
        String sysUserId = getSysUserId(request);
        if (sysUserId == null || sysUserId.isBlank()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        NotificationSubscriptions ns = notificationSubscriptionDAO
                .getNotificationSubscriptionByUserId(Long.valueOf(sysUserId));

        if (ns == null) {
            return ResponseEntity.ok(new PushSubscriptionStatus(false, null));
        }

        return ResponseEntity.ok(new PushSubscriptionStatus(true, ns.getPfEndpoint()));

    }

    @PutMapping("/notification/markasread/{id}")
    public ResponseEntity<?> markNotificationAsRead(@PathVariable String id) {
        Notification notification = notificationDAO.getNotificationById(Long.parseLong(id));
        notification.setReadAt(OffsetDateTime.now());
        notificationDAO.updateNotification(notification);
        return ResponseEntity.ok().body("Notification updated successfully");
    }

    @PutMapping("/notification/markasread/all")
    public ResponseEntity<?> markAllNotificationsAsRead(HttpServletRequest request) {
        String sysUserId = getSysUserId(request);
        notificationDAO.setAllUserNotificationsToRead(Long.valueOf(sysUserId));
        return ResponseEntity.ok().body("All notifications updated successfully");
    }

    @GetMapping("/systemusers")
    public List<SystemUser> getSystemUsers() {
        return notificationDAO.getSystemUsers();
    }

    @GetMapping("/notification/public_key")
    public ResponseEntity<Map<String, String>> getPublicKey() {

        String publicKey = env.getProperty("vapid.public.key");

        Map<String, String> response = new HashMap<>();
        response.put("publicKey", publicKey);
        return ResponseEntity.ok().body(response);
    }

    @PostMapping("/notification/subscribe")
    public ResponseEntity<?> subscribe(@RequestBody NotificationSubscriptions notificationSubscription,
            HttpServletRequest request) {

        String sysUserId = getSysUserId(request);

        // Fetch the user object
        SystemUser user = systemUserService.getUserById(sysUserId);

        // Ensure user object is not null
        if (user == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("User not found");
        }

        // Set the user entity directly
        notificationSubscription.setUser(user);

        notificationSubscriptionDAO.saveOrUpdate(notificationSubscription);

        return ResponseEntity.ok().body("Subscribed successfully");
    }

    @PutMapping("/notification/unsubscribe")
    public ResponseEntity<?> unsubscribe(HttpServletRequest request) {
        String sysUserId = getSysUserId(request);
        NotificationSubscriptions ns = notificationSubscriptionDAO
                .getNotificationSubscriptionByUserId(Long.valueOf(sysUserId));

        if (ns == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Subscription not found");
        }

        notificationSubscriptionDAO.delete(ns);

        return ResponseEntity.ok().body("Unsubscribed successfully");
    }
}
