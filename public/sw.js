/*
 * gilda 注文管理の Service Worker。
 *
 * 目的はインストール性と起動速度だけで、オフライン運用は目的にしない（spec 2）。
 * そのため扱うのは次の 2 つだけ:
 *
 *   1. /_next/static/* … 内容ハッシュ付きで不変なのでキャッシュ優先
 *   2. ページ遷移       … ネットワーク優先。失敗したときだけオフライン案内を返す
 *
 * それ以外（Supabase API、認証、CSV など）は一切触らない。
 * 伝票や金額をキャッシュから返すと、古い情報で会計する事故に直結するため。
 */
const VERSION = "v1";
const STATIC_CACHE = `gilda-static-${VERSION}`;
const SHELL_CACHE = `gilda-shell-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 古いバージョンのキャッシュを片付ける
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
  }
});

/** 内容ハッシュ付きの静的アセット専用。中身が変われば URL も変わるので古い応答は返らない。 */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

/** ページ遷移。応答はキャッシュせず、通信できないときだけ案内を出す。 */
async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}
