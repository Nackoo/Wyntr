self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const data = event.notification.data;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientsArr => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.focus();
          client.postMessage({
            type: "NOTIFICATION_CLICK",
            data
          });
          return;
        }
      }

      return clients.openWindow("/");
    })
  );
});
