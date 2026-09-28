// 工事日報アプリ サービスワーカー（クラウド版）
// このフォルダの画面だけを保存する。データはGoogleスプレッドシート側なので触らない。
const CACHE = "nippou-daikuen-v8";
const SHELL = [
  "./", "./index.html", "./admin.html", "./print.html", "./install.html",
  "./config.js", "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];

async function precache() {
  const c = await caches.open(CACHE);
  await Promise.allSettled(SHELL.map(async (u) => {
    const res = await fetch(u, { cache: "reload" });
    if (res && res.ok) await c.put(u, res.clone());
  }));
}

self.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    const c = await caches.open(CACHE);
    if (!(await c.match("./"))) await precache();
    await self.clients.claim();
  })());
});

function offlinePage() {
  return new Response(
    "<!DOCTYPE html><html lang=\"ja\"><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<body style=\"font-family:sans-serif;padding:40px;text-align:center;color:#333\">" +
    "<h2>つながりません</h2><p>電波の良い場所で、もう一度お試しください。</p>" +
    "<p><button onclick=\"location.reload()\" style=\"padding:12px 24px;font-size:16px\">再読み込み</button></p>" +
    "</body></html>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // GASへの通信は素通し
  if (!url.pathname.startsWith(new URL("./", location).pathname)) return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match(req, { ignoreSearch: true })) ||
               (await c.match("./")) ||
               (await c.match("./index.html")) || offlinePage();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) {
      fetch(req).then((res) => {
        if (res && res.status === 200) caches.open(CACHE).then((c) => c.put(req, res));
      }).catch(() => {});
      return hit;
    }
    try { return await fetch(req); }
    catch (err) { return new Response("", { status: 503 }); }
  })());
});
