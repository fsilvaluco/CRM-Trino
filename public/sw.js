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
