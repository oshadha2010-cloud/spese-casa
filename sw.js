/*
 * Service worker: tiene l'app in cache così dall'iPhone funziona anche senza rete e a Mac spento.
 * VERSIONE la riscrive tools/versione.js con l'impronta dei file: se cambia un file, cambia
 * questo script e l'iPhone scarica la nuova versione la prossima volta che raggiunge il Mac.
 */
const VERSIONE = "spese-casa-1.0.0-56efdc27";
const FILE = ["./", "index.html", "app.css", "core.js", "app.js", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSIONE)
      .then((cache) => cache.addAll(FILE.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== VERSIONE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Prima la cache, poi la rete: se il Mac non risponde l'app parte lo stesso, subito.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(caches.match("index.html").then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
