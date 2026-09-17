// Push notifications need a service worker, but the application shell must
// always come from nginx. Caching index.html here can pin users to an old UI
// after a container/image replacement.
const LEGACY_APP_SHELL_CACHES = ["my-cache-v1"];

// Cache assets during the install phase
self.addEventListener("install", (event) => {
  console.log("[Service Worker] Install");
  event.waitUntil(self.skipWaiting());
});

// Clean up old caches during the activate phase
self.addEventListener("activate", (event) => {
  console.log("[Service Worker] Activate");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                LEGACY_APP_SHELL_CACHES.includes(cacheName) ||
                cacheName.startsWith("lis-app-shell-"),
            )
            .map((cacheName) => {
              console.log("[Service Worker] Deleting stale app cache:", cacheName);
              return caches.delete(cacheName);
            }),
        );
      })
      .then(() => self.clients.claim()), // Take control of all clients as soon as active
  );
});

// Listen for push events and display notifications
self.addEventListener("push", (event) => {
  console.log("[Service Worker] Push Received", event);
  if (event.data) {
    const data = event.data.json();
    const notificationOptions = {
      body: data.body || "您收到一条来自临床检验信息系统的新消息",
      tag: data.external_id || "default-tag",
      icon: "images/openelis_logo.png",
    };

    event.waitUntil(
      self.registration.showNotification(
        "临床检验信息系统消息",
        notificationOptions,
      ),
    );
  }
});

// Notification click event listener
// self.addEventListener("notificationclick", (event) => {
//   console.log('Notification clicked');
//   event.notification.close(); // Close the notification popout

//   event.waitUntil(
//     clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
//       // Check if any client (tab or window) is already open
//       for (let i = 0; i < clientList.length; i++) {
//         const client = clientList[i];
//         if (client.url === 'https://www.youtube.com/' && 'focus' in client) {
//           return client.focus();
//         }
//       }

//       // If no client is open, open a new window
//       if (clients.openWindow) {
//         return clients.openWindow('https://www.youtube.com/');
//       }
//     })
//   );
// });

// Handle messages from clients
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
