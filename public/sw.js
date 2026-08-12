// Service worker minimo -- su unico trabajo hoy es cumplir el requisito de
// Chrome para que aparezca "Instalar app" (necesita un fetch handler
// registrado). A proposito NO cachea nada: este es un Next.js que se
// redeploya seguido, y una estrategia de cache mal pensada puede terminar
// sirviendo JS/CSS viejo a alguien con la app "instalada" -- prefiero
// dejarlo sin cache por ahora y sumar una estrategia real si mas adelante
// se necesita soporte offline de verdad.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

// ─── Web Push ──────────────────────────────────────────────────────────────
// El payload lo arma src/lib/push.ts en el server: { title, body, url }.
self.addEventListener("push", (event) => {
  let data = { title: "Artist Pro", body: "Tienes una notificacion nueva." };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    })
  );
});

// Clic en la notificacion: enfoca una pestaña ya abierta del CRM si existe,
// si no abre una nueva en la URL que vino en el payload.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
