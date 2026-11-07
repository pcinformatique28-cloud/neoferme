const V = "nf-v13", RT = "nf-rt-v2", TILES = "nf-tiles-v1";
const CORE = ["./", "index.html", "app.js","scan.js","jsqr.min.js","assets/nav-bg.jpg","assets/fond.jpg", "alerte.js", "offline.js", "gabon.js", "firebase-config.js", "manifest.json", "fix-menu.css", "assets/accueil.jpg", "assets/banniere.jpg", "assets/challenge.png", "assets/fermes.png", "assets/fond.svg", "assets/icone-192.png", "assets/icone-512.png", "assets/logo.jpg", "assets/logos.png"];
const CDN = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  "https://unpkg.com/leaflet@1.9.4/dist/images/layers.png"
];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(V).then(c => Promise.allSettled([...CORE.map(u => c.add(new Request(u, { cache: "reload" }))), ...CDN.map(u => c.add(u))])));
});
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => ![V, RT, TILES].includes(x)).map(x => caches.delete(x)))).then(() => self.clients.claim())));

async function netFirst(r) {
  const c = await caches.open(V);
  try {
    const res = await Promise.race([fetch(r), new Promise((_, j) => setTimeout(j, 5000))]);
    if (res && res.ok) c.put(r, res.clone());
    return res;
  } catch (e) {
    const m = (await c.match(r, { ignoreSearch: true })) || (r.mode === "navigate" ? ((await c.match("index.html")) || (await c.match("./"))) : null);
    return m || fetch(r).catch(() => new Response("Hors ligne", { status: 503 }));
  }
}
async function trim(c, max) { const k = await c.keys(); if (k.length > max) for (const x of k.slice(0, k.length - max)) c.delete(x); }
async function cacheFirst(r, name, max) {
  const c = await caches.open(name);
  const m = await c.match(r); if (m) return m;
  try { const res = await fetch(r); if (res && res.ok) { c.put(r, res.clone()); if (max) trim(c, max); } return res; }
  catch (e) { return new Response("", { status: 504 }); }
}
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin === location.origin) return e.respondWith(netFirst(r));
  if (u.hostname.endsWith("tile.openstreetmap.org")) return e.respondWith(cacheFirst(r, TILES, 500));
  if ((u.hostname === "www.gstatic.com" && u.pathname.startsWith("/firebasejs/")) || u.hostname === "unpkg.com") return e.respondWith(cacheFirst(r, RT, 0));
});
