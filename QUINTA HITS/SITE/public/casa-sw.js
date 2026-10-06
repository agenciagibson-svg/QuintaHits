/* Service worker do app da casa (/casa) — QUINTA HITS. Fica na raiz (/casa-sw.js) para o escopo "/casa" cobrir a própria página /casa.
 * Só cuida dos avisos de pedido novo. Não guarda páginas nem dados em cache: as reservas vêm sempre do servidor. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let aviso = { titulo: "Novo pedido de mesa", corpo: "Abra o app para ver.", url: "/casa" };
  try {
    if (e.data) aviso = { ...aviso, ...e.data.json() };
  } catch (_) {
    /* carga inesperada: mostra o aviso padrão */
  }
  e.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.corpo,
      icon: "/casa/icones/icone-192.png",
      tag: "pedido-novo",
      renotify: true,
      data: { url: aviso.url },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL((e.notification.data && e.notification.data.url) || "/casa", self.location.origin);
  // Só abre páginas do próprio app.
  if (destino.origin !== self.location.origin || !destino.pathname.startsWith("/casa")) destino.href = new URL("/casa", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin + "/casa")) {
          return j
            .focus()
            .then((c) => (c && "navigate" in c ? c.navigate(destino.href) : c))
            .catch(() => self.clients.openWindow(destino.href));
        }
      }
      return self.clients.openWindow(destino.href);
    }),
  );
});
