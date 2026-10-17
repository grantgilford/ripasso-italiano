/*
  Ripasso Italiano: the offline worker for the installed copy (GitHub Pages).

  It keeps a copy of the app on the device, so Ripasso opens instantly and
  works with no signal. Each time the app opens or comes back to the screen,
  the app asks the worker to check the website for a newer index.html. A
  newer copy is downloaded and held back as "pending" until the person taps
  Update now (the app only offers that on Today, never mid-session); then it
  replaces the kept copy and the app reloads.

  Because new versions are found by comparing index.html itself, releasing a
  new version needs no change here: merge the new index.html and the
  installed app offers it the next time it opens.

  None of this touches saved progress: that lives in the app's own storage
  (localStorage), which the worker never reads or clears.

  Not used inside claude.ai: the app only registers this worker when it is
  served from its own website.
*/
"use strict";
const CACHE = "ripasso-app"; // one fixed cache, so a change to this file never throws away the kept app
const SCOPE = self.registration.scope;
const PAGE = new URL("./", SCOPE).href;                 // the kept copy of the app
const PENDING = new URL("./__pending__", SCOPE).href;   // a newer copy, waiting for Update now
const SOURCE = new URL("index.html", SCOPE).href;       // where new versions are fetched from
const FILES = ["manifest.webmanifest", "icons/ripasso-icon-192.png", "icons/ripasso-icon-512.png", "icons/ripasso-icon-maskable-192.png", "icons/ripasso-icon-maskable-512.png"].map(f => new URL(f, SCOPE).href);

const versionOf = (text) => { const m = /const APP_VERSION = "([^"]+)"/.exec(text); return m ? m[1] : ""; };

// The app page from the website, or null if offline or if what came back isn't the app.
async function fetchPage() {
  try {
    const r = await fetch(SOURCE, { cache: "no-cache" });
    if (!r.ok || r.redirected) return null;
    const text = await r.clone().text();
    return versionOf(text) ? { response: r, text } : null;
  } catch (e) { return null; }
}

async function keepFiles(c, refresh) {
  await Promise.all(FILES.map(async (u) => {
    if (!refresh && await c.match(u)) return;
    try { const r = await fetch(u, { cache: "no-cache" }); if (r.ok) await c.put(u, r); } catch (e) { }
  }));
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    if (!(await c.match(PAGE))) { const p = await fetchPage(); if (p) await c.put(PAGE, p.response); }
    await keepFiles(c, false);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(SCOPE).pathname;
  if (req.mode === "navigate") {
    if (url.pathname !== scopePath && url.pathname !== scopePath + "index.html") return; // other pages on the site load as normal
    e.respondWith((async () => {
      const kept = await (await caches.open(CACHE)).match(PAGE);
      if (kept) return kept;
      return fetch(req); // not kept yet (the first visit): straight from the website
    })());
    return;
  }
  if (FILES.includes(url.origin + url.pathname)) {
    e.respondWith((async () => (await (await caches.open(CACHE)).match(url.origin + url.pathname)) || fetch(req))());
  }
});

// Messages from the app: "check" for a newer version, "apply" the one that is waiting.
self.addEventListener("message", (e) => {
  const type = e.data && e.data.type, client = e.source;
  const reply = (msg) => { try { client && client.postMessage(msg); } catch (err) { } };
  if (type === "check") e.waitUntil(check(reply));
  else if (type === "apply") e.waitUntil(apply(reply));
});

async function check(reply) {
  const c = await caches.open(CACHE);
  const fresh = await fetchPage();
  const waiting = await c.match(PENDING);
  if (!fresh) { // offline: still mention an update downloaded earlier
    if (waiting) reply({ type: "update", version: versionOf(await waiting.text()) });
    else reply({ type: "offline" });
    return;
  }
  const kept = await c.match(PAGE);
  if (!kept) { await c.put(PAGE, fresh.response); reply({ type: "current", version: versionOf(fresh.text) }); return; }
  if ((await kept.text()) === fresh.text) {
    if (waiting) await c.delete(PENDING);
    reply({ type: "current", version: versionOf(fresh.text) });
    return;
  }
  await c.put(PENDING, fresh.response);
  reply({ type: "update", version: versionOf(fresh.text) });
}

async function apply(reply) {
  const c = await caches.open(CACHE);
  const waiting = await c.match(PENDING);
  if (waiting) {
    await c.put(PAGE, waiting);
    await c.delete(PENDING);
    await keepFiles(c, true); // the icons and manifest may have changed too
  }
  reply({ type: "applied" });
}
