#!/usr/bin/env node
/*
  Storage test for index.html (from 9.26, when saved data moved from localStorage to IndexedDB behind Store, the storage
  script in <head>).

  Usage:  node tools/test-storage.js [path/to/index.html] [--old path/to/9.25/index.html] [--require-old] [--headed]
          (--require-old: fail, rather than skip section 9 with a note, when 9.25's index.html can't be had; GitHub runs it so)

  Opens the real app, and the storage script on its own, in a headless browser (Playwright + Chromium) and checks:

    1. The storage script alone: values are saved, read back, removed; nothing is written when nothing changed; progress
       is kept in parts, and a save writes only the parts that changed.
    2. The move from localStorage: every key copied and identical, checked before the switch, the old copy left exactly as
       it was, and made only once.
    3. An interrupted move: the app closed in the middle of the copy, and between the copy and the switch, moves
       everything again from the old copy, which stays the live one until the switch; a copy that doesn't match the
       original is never switched to.
    4. Fallback: without IndexedDB the app saves in localStorage as before and says so, and moves when IndexedDB is back;
       after the move it never goes back to the old copy: IndexedDB unavailable, emptied, or refusing a save is said
       plainly and nothing is written anywhere else.
    5. One source of truth: after the move the old keys are never written, and read only by the fingerprint check; a change
       made there by an older version is noticed, never used by itself, and merged in when asked.
    6. Saving: an answer is on the disk once it is saved (the browser is crashed and opened again), and putting the app
       away writes whatever was changed without being saved.
    7. Two windows on one storage (the installed app and a browser tab): each merges the other's saves before its own,
       nothing is lost or written twice, and two windows opening for the first time after the update both end up moved.
    8. Start-up: the theme is right before the page body exists, and nothing is drawn before the saved data is in memory.
    9. The version before (9.25, from the tag v9.25 or --old; skipped with a note where the tag hasn't been fetched:
       git fetch origin tag v9.25): updating keeps everything; going back shows the progress as it was at the move, and
       what is practised there is noticed and merged in after updating again; a backup file carries progress either way.
   10. Your data's Storage card and Today's notices say which storage is in use.
   11. An old storage filled to the brim still moves: the move needs no room there.

  The format of the storage is written out by hand in tools/lib/browser.js, not borrowed from the app. Changes nothing in
  index.html. Exits with code 1 if any check fails.
*/
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { ROOT, loadPlaywright, serve, checks, stored, storedRows, saveText, valueFrom, bucketOf, DB_NAME, DB_TABLE, PROGRESS_KEY: K } = require("./lib/browser");
const { storeScript } = require("./lib/load-app");

const args = process.argv.slice(2);
const HEADED = args.includes("--headed");
const oldArg = args.includes("--old") ? args[args.indexOf("--old") + 1] : null;
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--old") || path.join(ROOT, "index.html");
const { chromium } = loadPlaywright();
const results = checks(), { check, section } = results;

const html = fs.readFileSync(file, "utf8");
function previousVersion() { // 9.25's index.html: --old, or the tag v9.25 where this checkout has it
  if (oldArg) return fs.readFileSync(oldArg, "utf8");
  try { return execFileSync("git", ["show", "v9.25:index.html"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch (e) { return null; }
}
const oldHtml = previousVersion();

/* ---------- the site: the app (new, or the version before), the storage script alone, a stand-in for an older version, a blank page ---------- */
const site = { html };
// What a version before 9.26 did with storage, by hand: read it once, and write the whole of it after every answer.
const OLD_PAGE = `<!doctype html><meta charset="utf-8"><title>before 9.26</title><script>
function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
let progress = lsGet("itapp.progress.v1") || { v: 2, items: {}, days: {}, flags: {}, settings: {} };
function answer(id, t) { progress.items[id] = { box: 1, due: t + 600000, lapses: 0, lastSeen: t, lastWrong: 0, seenCount: 1, lastRight: t }; progress.updatedAt = t; return lsSet("itapp.progress.v1", progress); }
</script>`;
const STORE_PAGE = `<!doctype html><meta charset="utf-8"><title>storage alone</title><script>${storeScript(html)}</script>`;
function startSite() {
  return serve((req, res) => {
    const url = req.url.split("?")[0];
    const body = url === "/index.html" ? site.html : url === "/store.html" ? STORE_PAGE : url === "/old.html" ? OLD_PAGE : "<!doctype html><title>blank</title>";
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(body);
  });
}

const READY = "typeof content !== 'undefined' && content && typeof S !== 'undefined' && S.screen === 'home'";
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const canon = o => JSON.stringify(o, (k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
const same = (a, b) => canon(a) === canon(b); // ignores the order of keys
const REC = (t, box = 3) => ({ box, due: t + 864e5, lapses: 0, lastSeen: t, lastWrong: 0, seenCount: box + 1, lastRight: t });
let origin = "";

async function openPage(context, name, { init } = {}) { // "index.html" (the app), "store.html" (the storage script alone), "old.html" or "blank"
  const page = await context.newPage();
  page.errors = []; page.on("pageerror", e => page.errors.push(String(e)));
  page.on("dialog", d => d.accept());
  if (init) await page.addInitScript(init);
  await page.goto(origin + "/" + name);
  if (name === "index.html") await page.waitForFunction(READY, null, { timeout: 40000 });
  if (name === "store.html") await page.evaluate(() => Store.ready.then(() => true));
  return page;
}
async function reopen(page) { await page.reload(); await page.waitForFunction(READY, null, { timeout: 40000 }); }
// localStorage, on a blank page of the site: set (texts, as they are), and read whole
async function seedLocal(context, texts) { const p = await openPage(context, "blank"); await p.evaluate(t => { localStorage.clear(); for (const [k, v] of Object.entries(t)) localStorage.setItem(k, v); }, texts); await p.close(); }
const localTexts = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
const oldKeys = (texts) => JSON.stringify(Object.entries(texts).filter(([k]) => k !== "ripasso.boot.v1")); // everything but the note for the first paint
// The database by hand, from any page of the site (no app needed): every row, a row put or removed, the whole database removed.
const RAW = `(() => {
  const open = () => new Promise((ok, no) => { const r = indexedDB.open(${JSON.stringify(DB_NAME)}, 1); r.onupgradeneeded = () => r.result.createObjectStore(${JSON.stringify(DB_TABLE)}); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const get = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  window.__raw = {
    rows: async () => { const db = await open(); try { const s = db.transaction(${JSON.stringify(DB_TABLE)}).objectStore(${JSON.stringify(DB_TABLE)}); const [k, v] = await Promise.all([get(s.getAllKeys()), get(s.getAll())]); return Object.fromEntries(k.map((x, i) => [x, v[i]])); } finally { db.close(); } },
    change: async (puts, drops) => { const db = await open(); try { const tx = db.transaction(${JSON.stringify(DB_TABLE)}, "readwrite"), s = tx.objectStore(${JSON.stringify(DB_TABLE)}); for (const [k, t] of Object.entries(puts || {})) s.put(t, k); for (const k of drops || []) s.delete(k); await new Promise((ok, no) => { tx.oncomplete = ok; tx.onabort = () => no(tx.error); }); } finally { db.close(); } },
    remove: () => new Promise((ok, no) => { const r = indexedDB.deleteDatabase(${JSON.stringify(DB_NAME)}); r.onsuccess = () => ok(true); r.onerror = () => no(r.error); r.onblocked = () => no(new Error("the database is in use")); }),
  };
})();`;
async function raw(context, fn, ...a) { const p = await openPage(context, "blank"); await p.evaluate(RAW); try { return await p.evaluate(([f, a]) => window.__raw[f](...a), [fn, a]); } finally { await p.close(); } }
const mark = (rows) => rows && rows["store.migration"] ? JSON.parse(rows["store.migration"]) : null;
const status = (page) => page.evaluate(() => Store.status());
const noticeText = (page) => page.evaluate(() => { const c = document.querySelector("#app .notice"); return c ? c.id + ": " + c.textContent : ""; });
const records = (page) => page.evaluate(() => Object.keys(progress.items).length);
// In the app: one item answered right, as a session answers it (saved at once); the answer's time is returned.
const answer = (page, id) => page.evaluate((id) => { applyResult(id, true, "recall"); return progress.items[pid(id)].lastSeen; }, id);
const flushed = (page) => page.evaluate(() => Store.flush());

/* ---------- faults, as scripts run before the page's own ---------- */
// No IndexedDB at all in this browser.
const NO_IDB = `Object.defineProperty(window, "indexedDB", { get() { return undefined; }, configurable: true });`;
// IndexedDB that answers every open with an error.
const IDB_ERRORS = `IDBFactory.prototype.open = function () { const r = {}; setTimeout(() => r.onerror && r.onerror(new Event("error")), 0); return r; };`;
// IndexedDB that answers the first open with an error, and works after that.
const IDB_ERRORS_ONCE = `(() => { const open = IDBFactory.prototype.open; let n = 0; IDBFactory.prototype.open = function (...a) { if (n++) return open.apply(this, a); const r = {}; setTimeout(() => r.onerror && r.onerror(new Event("error")), 0); return r; }; })();`;
// IndexedDB that never answers an open.
const IDB_SILENT = `IDBFactory.prototype.open = function () { return {}; };`;
// A transaction held open and never finished, as if the app were closed in the middle of it: its commit does nothing and
// a chain of small reads keeps it alive until the page goes. hold(when) decides which transaction: "copy" holds the move's
// first writing transaction once it has put 40 rows, "switch" its second (the one that marks the move done).
const HOLD = (when) => `(() => {
  const transaction = IDBDatabase.prototype.transaction, put = IDBObjectStore.prototype.put, commit = IDBTransaction.prototype.commit;
  let writing = 0, puts = 0;
  const held = new WeakSet();
  const hold = (tx, store) => { held.add(tx); window.__held = true; const spin = () => { try { store.get("no such row").onsuccess = spin; } catch (e) { } }; spin(); };
  IDBTransaction.prototype.commit = function () { if (!held.has(this)) return commit.call(this); };
  IDBDatabase.prototype.transaction = function (names, mode, o) {
    const tx = transaction.call(this, names, mode, o);
    if (mode === "readwrite" && ++writing === 2 && ${JSON.stringify(when)} === "switch") hold(tx, tx.objectStore(${JSON.stringify(DB_TABLE)}));
    return tx;
  };
  IDBObjectStore.prototype.put = function (v, k) {
    const r = put.call(this, v, k);
    if (${JSON.stringify(when)} === "copy" && writing === 1 && ++puts === 40) hold(this.transaction, this);
    return r;
  };
})();`;
// A copy that goes wrong without saying so: one bucket of records is written with a figure changed.
const BAD_COPY = `(() => { const put = IDBObjectStore.prototype.put; let done = false; IDBObjectStore.prototype.put = function (v, k) { if (!done && /\\/b\\d{3}$/.test(String(k)) && /"box":3/.test(v)) { done = true; v = v.replace('"box":3', '"box":4'); window.__spoilt = k; } return put.call(this, v, k); }; })();`;
// A copy that fails outright part of the way through.
const FAILING_COPY = `(() => { const put = IDBObjectStore.prototype.put; let n = 0; IDBObjectStore.prototype.put = function (v, k) { if (++n === 25) throw new DOMException("no room", "QuotaExceededError"); return put.call(this, v, k); }; })();`;
// Every use of localStorage, by key, kept in window.__ls.
const SPY = `(() => { const P = Storage.prototype, log = window.__ls = { get: [], set: [], remove: [], clear: 0 };
  const get = P.getItem, set = P.setItem, remove = P.removeItem, clear = P.clear;
  P.getItem = function (k) { if (this === localStorage) log.get.push(k); return get.call(this, k); };
  P.setItem = function (k, v) { if (this === localStorage) log.set.push(k); return set.call(this, k, v); };
  P.removeItem = function (k) { if (this === localStorage) log.remove.push(k); return remove.call(this, k); };
  P.clear = function () { if (this === localStorage) log.clear++; return clear.call(this); };
})();`;

(async () => {
  const server = await startSite();
  origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: !HEADED });
  const newContext = () => browser.newContext({ viewport: { width: 390, height: 844 } });
  console.log(`Storage test for ${path.relative(process.cwd(), file) || file}`);
  try {
    // The app's items, to make progress out of: ids that hold a record of their own.
    let ids, version, defaults;
    {
      const context = await newContext(), page = await openPage(context, "index.html");
      ({ ids, version, defaults } = await page.evaluate(() => ({ ids: Object.keys(content.items).filter(id => !content.canon[id] && pid(id) === id && !isSideUnit(content.items[id].unit)), version: APP_VERSION, defaults: defaultProgress().settings })));
      await context.close();
    }
    console.log(`App version ${version}${oldHtml ? "; the version before: " + ((oldHtml.match(/const APP_VERSION = "([^"]+)"/) || [])[1] || "?") : ""}`);
    const T = Date.now(), DAY = 864e5;
    const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    // Progress as a learner a few months in has it: n records, 400 days of log across three calendar years, flags, an accepted answer.
    const someProgress = (n = 1200, t = T) => {
      const items = {}, days = {};
      ids.slice(0, n).forEach((id, k) => { items[id] = REC(t - (k % 50) * DAY - 1000, 1 + (k % 7)); });
      for (let d = 0; d < 400; d++) days[dayKey(t - d * DAY)] = { xp: 20 + (d % 40), new: d % 9, cards: d % 30, t: { all: [10 + (d % 7), 14 + (d % 7)], recall: [5, 6] } };
      return { v: 2, items, days, flags: { [ids[3]]: { id: ids[3], unit: "u01", prompt: "a question", expected: "x", given: "y", note: "", createdAt: t - DAY, updatedAt: t - DAY } }, synonyms: { [ids[10]]: ["my own answer"] }, currentUnit: "u03", settings: Object.assign({}, defaults, { goal: 40 }), settingsUpdatedAt: t - DAY, updatedAt: t - 1000 };
    };
    // Every other key the app keeps, as a well-used device has them.
    const otherKeys = () => ({
      "itapp.theme.v1": "dark", "itapp.audio.v1": "slow", "itapp.seen.v1": "9.25", "itapp.migratedV1": true,
      "itapp.backup.v1": { at: T - 3 * DAY, snooze: 0, welcomed: true },
      "itapp.reading.v1": { u01: 4, u02: 1 },
      "itapp.lasttype.v1": ids.slice(0, 300).map((id, k) => [id, ["recall", "cloze", "translate"][k % 3]]),
      "itapp.confusions.v1": ids.slice(0, 80).map((id, k) => [id, ids[k + 500]].sort().concat(1 + (k % 4))),
      "itapp.errors.v1": [{ m: "TypeError: a test problem", at: "index.html:100:1", screen: "units", v: "9.25", t: T - DAY, n: 2 }],
      "itapp.packs.v1": {},
    });
    const asTexts = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, JSON.stringify(v)]));
    const deviceTexts = (p = someProgress()) => Object.assign(asTexts(otherKeys()), { [K]: JSON.stringify(p) });

    /* 1. The storage script alone */
    section("1. The storage script alone: values saved, read back, removed; progress in parts");
    {
      const context = await newContext(), page = await openPage(context, "store.html");
      const st = await status(page);
      check("on a new device it keeps everything in IndexedDB", st.backend === "idb" && !st.moved && !st.lost && !st.oldCopy && !st.failed, JSON.stringify(st));
      check("…and puts only its note for the first paint in localStorage", same(Object.keys(await localTexts(page)), ["ripasso.boot.v1"]));
      const values = { "itapp.a": "text", "itapp.b": 42, "itapp.c": { x: [1, 2, { y: null }], "è": "più" }, "itapp.d": [], "itapp.e": false, "itapp.f": 0, "itapp.g": null };
      const back = await page.evaluate(async (values) => { for (const [k, v] of Object.entries(values)) Store.set(k, v); const now = Object.fromEntries(Object.keys(values).map(k => [k, Store.get(k)])); const ok = await Store.flush(); return { now, ok }; }, values);
      check("a value set is read back at once, the same", same(back.now, values) && back.ok, JSON.stringify(back));
      const rows = await storedRows(page);
      check("…and is in the database as its JSON text, under its own key", Object.entries(values).every(([k, v]) => rows[k] === JSON.stringify(v)), JSON.stringify(rows).slice(0, 300));
      check("Store.read gives what the database holds", same(await page.evaluate(async (keys) => Object.fromEntries(await Promise.all(keys.map(async k => [k, await Store.read(k)]))), Object.keys(values)), values));
      const again = await page.evaluate(async (values) => { const w = Store.status().writes; for (const [k, v] of Object.entries(values)) Store.set(k, v); await Store.flush(); return Store.status().writes - w; }, values);
      check("setting the same values again writes nothing", again === 0 && (await storedRows(page))["store.rev"] === rows["store.rev"], `${again} transaction(s)`);
      const fresh = await page.evaluate(() => { const a = Store.get("itapp.c"); a.x.push("changed"); return Store.get("itapp.c").x.length; });
      check("what get returns is a copy: changing it changes nothing saved", fresh === 3);
      await page.evaluate(async () => { Store.remove("itapp.a"); await Store.flush(); });
      check("a value removed is gone from memory and from the database", (await page.evaluate(() => Store.get("itapp.a"))) === null && !("itapp.a" in await storedRows(page)));
      await page.reload(); await page.evaluate(() => Store.ready.then(() => true));
      check("after a reload everything is read back from the database", same(await page.evaluate((keys) => Object.fromEntries(keys.map(k => [k, Store.get(k)])), Object.keys(values).filter(k => k !== "itapp.a")), Object.fromEntries(Object.entries(values).filter(([k]) => k !== "itapp.a"))));
      await saveText(page, "itapp.c", "{not json");
      await page.reload(); await page.evaluate(() => Store.ready.then(() => true));
      check("a row whose text can't be read counts as nothing saved, and the rest still loads", (await page.evaluate(() => Store.get("itapp.c"))) === null && (await page.evaluate(() => Store.get("itapp.b"))) === 42);

      // progress, in parts
      const p = someProgress(900);
      Object.assign(p.items, { "fc-città-è": REC(T - 5), "constructor": REC(T - 6), "toString": REC(T - 7), "odd-null": null, "odd-text": "box 3", "odd-list": [3, 1, 0], "odd-extra": Object.assign(REC(T - 8), { future: { a: [1] } }), "odd-text-box": Object.assign(REC(T - 9), { box: "3" }) });
      p.futureField = { kept: [1, 2, 3] };
      await page.evaluate(async ([K, p]) => { Store.set(K, p); await Store.flush(); }, [K, p]);
      let r1 = await storedRows(page);
      const parts = Object.keys(r1).filter(k => k.startsWith(K + "/"));
      check("progress is kept in parts: a head, a row for each year of the log, and the records in buckets", parts.includes(K + "/head") && parts.filter(k => /\/days_\d{4}$/.test(k)).length === new Set(Object.keys(p.days).map(d => d.slice(0, 4))).size && parts.filter(k => /\/b\d{3}$/.test(k)).length > 200 && !(K in r1), parts.slice(0, 5).join(", "));
      let whole = null, formatError = "";
      try { whole = valueFrom(r1, K); } catch (e) { formatError = e.message; }
      check("…each record in the bucket its id hashes to, and the parts put together are the progress saved, odd records and unknown fields too", !!whole && same(whole, p), formatError || "the progress read back differs");
      check("the app reads the same back", same(await page.evaluate((K) => Store.get(K), K), p) && same(await page.evaluate((K) => Store.read(K), K), p));
      const changed = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k] && k !== "store.rev").sort();
      const id = ids[5];
      p.items[id] = Object.assign({}, p.items[id], { box: 5, lastSeen: T });
      await page.evaluate(async ([K, p]) => { Store.set(K, p); await Store.flush(); }, [K, p]);
      let r2 = await storedRows(page);
      check("one record changed: only its bucket is written", same(changed(r1, r2), [K + "/" + bucketOf(id)]), changed(r1, r2).join(", "));
      p.days[dayKey(T)].xp += 2; p.updatedAt = T;
      await page.evaluate(async ([K, p]) => { Store.set(K, p); await Store.flush(); }, [K, p]);
      r1 = r2; r2 = await storedRows(page);
      check("a day's figure and the time of the save: only that year of the log and the head", same(changed(r1, r2), [K + "/days_" + dayKey(T).slice(0, 4), K + "/head"].sort()), changed(r1, r2).join(", "));
      delete p.items[ids[6]]; p.items["zz-new-item"] = REC(T);
      await page.evaluate(async ([K, p]) => { Store.set(K, p); await Store.flush(); }, [K, p]);
      r1 = r2; r2 = await storedRows(page);
      check("a record removed and one added: their two buckets, and the progress read back is right", same(changed(r1, r2), [...new Set([K + "/" + bucketOf(ids[6]), K + "/" + bucketOf("zz-new-item")])].sort()) && same(valueFrom(r2, K), p), changed(r1, r2).join(", "));
      // changes made in place, in the app's own object
      const inPlace = await page.evaluate(async ([K, id]) => {
        const p = Store.get(K);
        Store.set(K, p); await Store.flush();
        const w = Store.status().writes;
        p.items[id].seenCount += 1; Store.set(K, p); await Store.flush(); // a record changed in place, then saved
        const quick = (await Store.read(K)).items[id].seenCount === p.items[id].seenCount, writes = Store.status().writes - w;
        p.items["odd-extra"].future.a.push(2); Store.set(K, p); await Store.flush(); // a field the quick look doesn't compare
        const missed = (await Store.read(K)).items["odd-extra"].future.a.length === 1;
        Store.set(K, p, true); await Store.flush(); // every part compared, as when the app is put away
        return { quick, writes, missed, full: (await Store.read(K)).items["odd-extra"].future.a.length === 2 };
      }, [K, ids[7]]);
      check("a record changed in place is found and saved", inPlace.quick && inPlace.writes === 1, JSON.stringify(inPlace));
      check("…and a change only a full comparison finds is saved when everything is compared (as the app is put away)", inPlace.missed && inPlace.full, JSON.stringify(inPlace));
      const emptied = await page.evaluate(async (K) => { const p = Store.get(K); p.items = {}; p.days = {}; Store.set(K, p); await Store.flush(); return Store.read(K); }, K);
      r2 = await storedRows(page);
      check("progress emptied (a reset) leaves only the head", same(emptied.items, {}) && same(emptied.days, {}) && same(Object.keys(r2).filter(k => k.startsWith(K + "/")), [K + "/head"]));
      const notObject = await page.evaluate(async (K) => { Store.set(K, "not progress"); await Store.flush(); const a = await Store.read(K); Store.set(K, { v: 2, items: { x: { box: 1 } }, days: {} }); await Store.flush(); return [a, await Store.read(K)]; }, K);
      r2 = await storedRows(page);
      check("a value under the progress key that isn't an object is kept as it is, and progress after it in parts again", notObject[0] === "not progress" && same(notObject[1], { v: 2, items: { x: { box: 1 } }, days: {} }) && !(K in r2));
      check("no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }

    /* 2. The move */
    section("2. The move from localStorage: everything copied, checked, and the old copy left as it was");
    {
      const context = await newContext();
      const p = someProgress(3000);
      Object.assign(p.items, { "fc-città-è": REC(T - 5), "odd-null": null, "odd-text": "box 3", "odd-list": [3, 1, 0], "odd-extra": Object.assign(REC(T - 8), { future: 1 }), "odd-text-box": Object.assign(REC(T - 9), { box: "3" }) });
      p.futureField = { kept: [1, 2, 3] };
      const texts = Object.assign(deviceTexts(p), { "itapp.broken": "{not json", "itapp.empty": "", "itapp.null": "null", "itapp.zero": "0", "another.site.key": "left alone" });
      await seedLocal(context, texts);
      const page = await openPage(context, "store.html"); // the storage script alone, so the copy is seen before the app tidies anything
      const st = await status(page), rows = await storedRows(page), m = mark(rows);
      const copied = Object.keys(texts).filter(k => k.startsWith("itapp.") && !["itapp.broken", "itapp.empty"].includes(k));
      check("the data is now kept in IndexedDB, and the move is recorded", st.backend === "idb" && !!st.moved && st.moved.keys === copied.length && st.moved.records === Object.keys(p.items).length && st.moved.days === 400, JSON.stringify(st));
      check("every small value is in the database exactly as its text was", copied.filter(k => k !== K).every(k => rows[k] === texts[k]), copied.filter(k => k !== K && rows[k] !== texts[k]).join(", "));
      let whole = null, formatError = "";
      try { whole = valueFrom(rows, K); } catch (e) { formatError = e.message; }
      check("progress, put together from its parts, is the progress that was saved: every record (damaged ones as they were), day, flag and unknown field", !!whole && same(whole, p), formatError);
      check("the app's own reading of each key gives what the old storage gave", same(await page.evaluate((keys) => Object.fromEntries(keys.map(k => [k, Store.get(k)])), copied), Object.fromEntries(copied.map(k => [k, JSON.parse(texts[k])]))));
      check("a text that couldn't be read, and an empty one, are left where they are and noted; another site's key is not touched", !("itapp.broken" in rows) && !("itapp.empty" in rows) && !("another.site.key" in rows) && same(m.skipped, ["itapp.broken"]), JSON.stringify(m.skipped));
      check("the move is marked done, with what was moved and the old progress's fingerprint", m.state === "done" && m.from === "localStorage" && m.fp.startsWith(texts[K].length + ":") && m.at > T - 60000, JSON.stringify(m).slice(0, 200));
      const after = await localTexts(page);
      check("localStorage is exactly as it was, every key and text", oldKeys(after) === oldKeys(Object.fromEntries(Object.keys(texts).sort().map(k => [k, texts[k]]))));
      check("…but for the note for the first paint: the theme, and when the move was made", same(JSON.parse(after["ripasso.boot.v1"]), { theme: "dark", idb: m.at }), after["ripasso.boot.v1"]);
      await page.reload(); await page.evaluate(() => Store.ready.then(() => true));
      const rows2 = await storedRows(page);
      check("opened again, nothing is moved or written a second time", mark(rows2).at === m.at && rows2["store.rev"] === rows["store.rev"] && same(rows2, rows));
      check("no script errors", !page.errors.length, page.errors.join("\n"));
      await page.close();

      // and the app on top: the same device opened by the app itself
      const app = await openPage(context, "index.html");
      const loaded = await app.evaluate(() => ({ n: Object.keys(progress.items).length, unit: progress.currentUnit, goal: progress.settings.goal, theme: document.documentElement.getAttribute("data-theme"), flags: Object.keys(progress.flags).length }));
      const sound = Object.keys(p.items).filter(id => !/^odd-(null|text|list)$/.test(id)).length; // the app's guard drops what isn't a record, as it always has
      check("the app opens with all the progress and settings", loaded.n === sound && loaded.unit === "u03" && loaded.goal === 40 && loaded.theme === "dark" && loaded.flags === 1, JSON.stringify(loaded));
      check("no script errors in the app", !app.errors.length, app.errors.join("\n"));
      await context.close();
    }

    /* 3. An interrupted move */
    section("3. An interrupted move starts again from the old copy");
    {
      // (a) closed in the middle of the copy
      const context = await newContext(), p = someProgress(2000), texts = deviceTexts(p);
      await seedLocal(context, texts);
      let page = await context.newPage();
      await page.addInitScript(HOLD("copy"));
      await page.goto(origin + "/index.html");
      await page.waitForFunction("window.__held === true", null, { timeout: 20000 });
      check("(the app is in the middle of copying: nothing is drawn yet)", (await page.evaluate(() => document.getElementById("app").children.length)) === 0);
      await page.close(); // closed with the copy half made
      let rows = await raw(context, "rows");
      check("closed in the middle of the copy: nothing of it is in the database", Object.keys(rows).length === 0, Object.keys(rows).slice(0, 5).join(", "));
      const blank = await openPage(context, "blank");
      check("…and localStorage is as it was, with no note that a move was made", oldKeys(await localTexts(blank)) === oldKeys(Object.fromEntries(Object.keys(texts).sort().map(k => [k, texts[k]]))) && !("ripasso.boot.v1" in await localTexts(blank)));
      await blank.close();

      // (b) closed between the copy and the switch
      page = await context.newPage();
      await page.addInitScript(HOLD("switch"));
      await page.goto(origin + "/index.html");
      await page.waitForFunction("window.__held === true", null, { timeout: 20000 });
      await page.close();
      rows = await raw(context, "rows");
      check("closed after the copy, before the switch: the copy is there, marked as only copied", (mark(rows) || {}).state === "copied" && same(valueFrom(rows, K), p), JSON.stringify(mark(rows)));
      // the old copy is still the live one: an older window saves an answer there, and the unfinished copy is damaged
      const old = await openPage(context, "old.html");
      await old.evaluate(([id, t]) => answer(id, t), ["zz-answered-meanwhile", T + 5000]);
      await old.close();
      const bucket = Object.keys(rows).find(k => /\/b\d{3}$/.test(k));
      await raw(context, "change", { [K + "/head"]: "{damaged" }, [bucket]);
      page = await openPage(context, "index.html");
      const st = await status(page);
      rows = await storedRows(page);
      const now = await stored(page);
      check("opened again, the whole move is made afresh and finished", st.backend === "idb" && !!st.moved && st.moved.records === 2001 && mark(rows).state === "done", JSON.stringify(st));
      check("…from the old copy as it stands now: the answer saved there meanwhile is in", !!now.items["zz-answered-meanwhile"] && now.items["zz-answered-meanwhile"].lastSeen === T + 5000);
      check("…and nothing of the unfinished copy is trusted: every record is there", Object.keys(p.items).every(id => same(now.items[id], p.items[id])) && (await records(page)) === 2001);
      check("no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }
    {
      // (c) a copy that doesn't match the original is never switched to
      const context = await newContext(), p = someProgress(1500), texts = deviceTexts(p);
      await seedLocal(context, texts);
      let page = await openPage(context, "index.html", { init: BAD_COPY });
      let st = await status(page);
      check("a copy that differs from the original (one figure) is caught by the check", !!(await page.evaluate("window.__spoilt")) && st.backend === "local" && st.reason === "failed" && /did not match/.test(st.detail), JSON.stringify(st));
      check("…so the app carries on with the old storage, all progress there", (await records(page)) === 1500);
      check("…and says so on Today", /^n-store: .*Saving the older way.*couldn't be completed and checked/.test(await noticeText(page)), await noticeText(page));
      const t = await answer(page, ids[1600]);
      check("an answer is saved in the old storage, which is still the live copy", (JSON.parse((await localTexts(page))[K]).items[ids[1600]] || {}).lastSeen === t);
      await page.close();
      // (d) a copy that fails outright
      page = await openPage(context, "index.html", { init: FAILING_COPY });
      st = await status(page);
      check("a copy that fails part of the way is the same: the old storage stays in use, with the answer just given", st.backend === "local" && st.reason === "failed" && (await records(page)) === 1501, JSON.stringify(st));
      check("…with no script error", !page.errors.length, page.errors.join("\n"));
      await page.close();
      page = await openPage(context, "index.html");
      st = await status(page);
      check("the next time the app opens, the move is made, with the answer given meanwhile", st.backend === "idb" && !!st.moved && st.moved.records === 1501 && (await stored(page)).items[ids[1600]].lastSeen === t, JSON.stringify(st));
      check("…and Today says nothing about storage any more", !/^n-store/.test(await noticeText(page)), await noticeText(page));
      await context.close();
    }

    /* 4. Fallback */
    section("4. Fallback: said plainly, and never back to the old copy after the move");
    {
      const context = await newContext(), p = someProgress(800), texts = deviceTexts(p);
      await seedLocal(context, texts);
      let had = 800; // one more record with each answer given below
      for (const [name, fault] of [["no IndexedDB in the browser", NO_IDB], ["IndexedDB answering with an error", IDB_ERRORS]]) {
        const page = await openPage(context, "index.html", { init: fault });
        const st = await status(page);
        check(`${name}: the app saves in the old storage, as before`, st.backend === "local" && st.reason === "unavailable" && (await records(page)) === had++, JSON.stringify(st));
        check("…and Today says so, once, until Got it", /^n-store: .*Saving the older way.*isn't available here/.test(await noticeText(page)), await noticeText(page));
        await page.click('#n-store [data-act="storeSeen"]');
        check("…Got it puts the notice away for this visit", !/^n-store/.test(await noticeText(page)));
        const t = await answer(page, ids[900 + name.length]);
        const saved = JSON.parse((await localTexts(page))[K]);
        check("…an answer is saved there in the format every earlier version reads", saved.v === 2 && saved.items[ids[900 + name.length]].lastSeen === t && Object.keys(saved.items).length === (await records(page)));
        await page.evaluate(() => setTheme("light"));
        check("…the theme too, under its old key, with no note of a move", (await localTexts(page))["itapp.theme.v1"] === '"light"' && !("ripasso.boot.v1" in await localTexts(page)));
        await page.evaluate(() => { setTheme("dark"); S.screen = "data"; render(); });
        check("…and Your data says which storage is in use and why", /Saved in the browser's older storage.*isn't available here.*try again each time/.test(await page.textContent("#sec-storage")), await page.textContent("#sec-storage"));
        check("…with no script error", !page.errors.length, page.errors.join("\n"));
        await page.close();
      }
      {
        const page = await context.newPage();
        await page.addInitScript(IDB_SILENT);
        const t0 = Date.now();
        await page.goto(origin + "/index.html");
        await page.waitForFunction(READY, null, { timeout: 40000 });
        const st = await status(page);
        check(`IndexedDB that never answers: the app gives up waiting (${((Date.now() - t0) / 1000).toFixed(1)} s) and saves in the old storage`, st.backend === "local" && (await records(page)) === 802, JSON.stringify(st));
        await page.close();
      }
      // IndexedDB is back: the move is made, with what was practised meanwhile
      let page = await openPage(context, "index.html");
      let st = await status(page);
      check("when IndexedDB is back, the move is made, with the answers given meanwhile", st.backend === "idb" && !!st.moved && st.moved.records === 802 && (await records(page)) === 802, JSON.stringify(st));
      const tA = await answer(page, ids[1000]); await flushed(page);
      const frozen = oldKeys(await localTexts(page));
      await page.close();

      // after the move, IndexedDB can't be opened: not saving, said plainly, and the old copy is not gone back to
      for (const [name, fault] of [["no IndexedDB", NO_IDB], ["IndexedDB answering with an error", IDB_ERRORS]]) {
        page = await openPage(context, "index.html", { init: fault });
        st = await status(page);
        check(`after the move, ${name}: the app doesn't go back to the old copy`, st.backend === "none" && (await records(page)) === 0, JSON.stringify(st));
        check("…Today says the saved progress couldn't be opened, with Try again", /^n-store: .*Saved progress couldn't be opened.*nothing you do now will be saved/.test(await noticeText(page)) && !!(await page.$('#n-store [data-act="reloadApp"]')), await noticeText(page));
        await page.evaluate((id) => { applyResult(id, true, "recall"); setTheme("light"); }, ids[1001]);
        check("…and nothing is written to the old storage", oldKeys(await localTexts(page)) === frozen);
        check("…with no script error", !page.errors.length, page.errors.join("\n"));
        await page.close();
      }
      page = await openPage(context, "index.html");
      st = await status(page);
      check("when IndexedDB opens again, all the progress is there, as it was last saved", st.backend === "idb" && (await records(page)) === 803 && (await stored(page)).items[ids[1000]].lastSeen === tA && !(await stored(page)).items[ids[1001]], JSON.stringify(st));

      // a save the storage refuses: said, nothing written elsewhere, and saved once it works again
      await page.evaluate(async (id) => { window.__put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException("no room", "QuotaExceededError"); }; applyResult(id, true, "recall"); await Store.flush(); }, ids[1002]);
      check("a save the storage refuses: Today says progress couldn't be saved", /^n-save/.test(await noticeText(page)) && (await status(page)).failed, await noticeText(page));
      check("…and nothing is written to the old storage instead", oldKeys(await localTexts(page)) === frozen);
      await page.evaluate(async () => { IDBObjectStore.prototype.put = window.__put; saveProgress(false); await Store.flush(); });
      check("…once it works again the refused answer is saved, and the warning goes", !!(await stored(page)).items[ids[1002]] && !/^n-save/.test(await noticeText(page)) && !(await status(page)).failed);
      await page.close();

      // the database emptied after the move (the browser removed it): said plainly, and mended only when asked
      await raw(context, "remove");
      page = await openPage(context, "index.html");
      st = await status(page);
      check("the database gone after the move: the app starts empty and doesn't restore the old copy by itself", st.backend === "idb" && st.lost > 0 && !st.moved && (await records(page)) === 0, JSON.stringify(st));
      check("…Today says the saved progress wasn't found, and points to Your data", /^n-store: .*Saved progress wasn't found.*copy from before the move/.test(await noticeText(page)), await noticeText(page));
      await page.click('#n-store [data-go="data"]');
      check("…where the Storage card offers the copy from before the move", (await page.evaluate("S.screen")) === "data" && !!(await page.$('#sec-storage [data-act="mergeOld"]')));
      await page.click('#sec-storage [data-act="mergeOld"]');
      check("…and merging it in brings back the progress as it was at the move", (await records(page)) === 802 && /merged in/.test(await page.textContent("#sec-sync")) && Object.keys((await stored(page)).items).length === 802, String(await records(page)));
      await page.evaluate(() => { S.screen = "home"; render(); });
      check("…after which Today's notice is gone", !/^n-store/.test(await noticeText(page)), await noticeText(page));
      check("no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }

    /* 5. One source of truth */
    section("5. One source of truth: after the move the old copy is never written, and never read as data");
    {
      const context = await newContext(), p = someProgress(1000), texts = deviceTexts(p);
      await seedLocal(context, texts);
      await context.addInitScript(SPY);
      const page = await openPage(context, "index.html"); // the move
      const frozen = oldKeys(await localTexts(page));
      await reopen(page); // an ordinary start, after the move
      const tAns = await page.evaluate(async (list) => {
        for (const id of list) applyResult(id, true, "recall");
        progress.settings.goal = 55; progress.settingsUpdatedAt = now(); saveProgress();
        setTheme("light"); setAudio("off"); markSeen(); setBackupInfo({ at: now() });
        noteType({ item: content.items[list[0]], typeKey: "recall" });
        Store.set(LS_PROGRESS, progress, true);
        await Store.flush();
        return progress.items[pid(list[0])].lastSeen;
      }, ids.slice(1100, 1110));
      await pause(5500); // long enough for the fingerprint check, which runs a few seconds after starting
      const log = await page.evaluate("window.__ls");
      check("practice, settings, the theme and the rest write nothing to localStorage but the note for the first paint", same([...new Set(log.set)], ["ripasso.boot.v1"]) && !log.remove.length && !log.clear, JSON.stringify(log.set));
      check("…and the old copy is exactly as the move left it", oldKeys(await localTexts(page)) === frozen);
      const read = log.get.filter(k => k.startsWith("itapp."));
      check("the old keys are read once only: the old progress, by the fingerprint check", same(read, [K]), JSON.stringify(read));
      check("…which finds it unchanged", !(await status(page)).oldChanged && (await status(page)).oldCopy);
      check("what was practised is in the database", (await stored(page)).items[ids[1100]].lastSeen === tAns && (await stored(page)).settings.goal === 55 && (await stored(page, "itapp.theme.v1")) === "light");
      check("the note follows the theme", JSON.parse((await localTexts(page))["ripasso.boot.v1"]).theme === "light");

      // an older version (a window left open, or the app put back to 9.25) saves to the old copy after the move
      const old = await openPage(context, "old.html");
      await old.evaluate(([id, t]) => answer(id, t), ["zz-old-version-answer", T + 9000]);
      await old.close();
      await reopen(page);
      check("progress saved to the old copy afterwards is not read as data: the app opens with its own", !(await page.evaluate(() => progress.items["zz-old-version-answer"])) && (await records(page)) === 1010);
      await page.waitForFunction(() => Store.status().oldChanged, null, { timeout: 15000 }).catch(() => { });
      check("…but it is noticed within a few seconds, and Today says so", (await status(page)).oldChanged && /^n-store: .*Progress saved by an older version/.test(await noticeText(page)), await noticeText(page));
      await page.click('#n-store [data-act="oldLater"]');
      check("…Later puts the notice away for this visit", !/^n-store/.test(await noticeText(page)));
      await reopen(page);
      await page.waitForFunction(() => Store.status().oldChanged, null, { timeout: 15000 }).catch(() => { });
      await page.click('#n-store [data-act="mergeOld"]');
      const merged = await stored(page);
      check("Merge it in adds what the older version saved, keeping the newest record of each item", !!merged.items["zz-old-version-answer"] && merged.items[ids[1100]].lastSeen === tAns && Object.keys(merged.items).length === 1011 && merged.settings.goal === 55, String(Object.keys(merged.items).length));
      check("…says so on Your data", (await page.evaluate("S.screen")) === "data" && /merged in: for each item, the newest record is kept/.test(await page.textContent("#sec-sync")));
      await reopen(page);
      await pause(5500);
      check("…and the notice doesn't come back", !(await status(page)).oldChanged && !/^n-store/.test(await noticeText(page)), await noticeText(page));
      check("no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }

    /* 6. Saving */
    section("6. Saving: an answer is on the disk once saved, and putting the app away saves the rest");
    {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripasso-storage-"));
      const launch = async () => { const context = await chromium.launchPersistentContext(dir, { headless: !HEADED, viewport: { width: 390, height: 844 } }); const page = context.pages()[0] || await context.newPage(); page.errors = []; page.on("pageerror", e => page.errors.push(String(e))); await page.goto(origin + "/index.html"); await page.waitForFunction(READY, null, { timeout: 40000 }); return { context, page }; };
      const crash = async ({ context }) => { // the whole browser killed at once, as when a phone closes an app without warning
        const gone = new Promise(r => context.once("close", r));
        const pids = execFileSync("ps", ["-eo", "pid=,args="]).toString().split("\n").filter(l => l.includes(dir) && !/--type=/.test(l)).map(l => parseInt(l, 10)).filter(Boolean);
        if (!pids.length) throw new Error("could not find the browser's process to kill");
        for (const pid of pids) try { process.kill(pid, "SIGKILL"); } catch (e) { }
        await Promise.race([gone, pause(8000)]);
        await context.close().catch(() => { });
        await pause(300);
      };
      try {
        let b = await launch();
        const t1 = await answer(b.page, ids[20]);
        await flushed(b.page);
        await crash(b);
        b = await launch();
        check("an answer, saved, then the browser crashed: the answer is there when the app is opened again", ((await b.page.evaluate((id) => progress.items[id], ids[20])) || {}).lastSeen === t1 && (await status(b.page)).backend === "idb");
        // put away: an answer given, a change made without saving, and the app hidden; then the crash
        const t2 = await b.page.evaluate((list) => {
          applyResult(list[0], true, "recall");
          progress.items[list[1]] = { box: 2, due: now() + 864e5, lapses: 0, lastSeen: now(), lastWrong: 0, seenCount: 1, lastRight: now() }; // changed, and never saved
          Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange"));
          return progress.items[list[0]].lastSeen;
        }, [ids[21], ids[22]]);
        await pause(1500);
        await crash(b);
        b = await launch();
        const back = await b.page.evaluate((list) => list.map(id => progress.items[id] || null), [ids[21], ids[22]]);
        check("an answer, then the app put away and closed without warning: the answer is there", (back[0] || {}).lastSeen === t2);
        check("…and so is a change that had not been saved: putting the app away compares everything and writes what differs", !!back[1] && back[1].box === 2);
        // straight away, with no time at all: recorded, not required
        const t3 = await answer(b.page, ids[23]);
        await crash(b);
        b = await launch();
        const kept = ((await b.page.evaluate((id) => progress.items[id], ids[23])) || {}).lastSeen === t3;
        console.log(`         an answer, then a crash at once, without waiting for the save: ${kept ? "kept" : "lost (only that answer; everything before it is there)"}`);
        check("…and whatever happened to that answer, everything before it is intact", (await b.page.evaluate((list) => list.every(id => !!progress.items[id]), [ids[20], ids[21], ids[22]])) && !b.page.errors.length, b.page.errors.join("\n"));
        await b.context.close();
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }

    /* 7. Two windows */
    section("7. Two windows on one storage merge each other's saves");
    {
      const context = await newContext();
      await seedLocal(context, deviceTexts(someProgress(600)));
      // both opened at once, for the first time after the update
      const [a, b] = await Promise.all([openPage(context, "index.html"), openPage(context, "index.html")]);
      const sa = await status(a), sb = await status(b);
      check("two windows opening together for the first time: both end up on IndexedDB with all the progress, moved once", sa.backend === "idb" && sb.backend === "idb" && (await records(a)) === 600 && (await records(b)) === 600 && same(sa.moved, sb.moved), JSON.stringify([sa.moved, sb.moved]));
      // A practises; B, which hasn't looked since, then saves
      const tA = []; for (const id of ids.slice(700, 703)) tA.push(await answer(a, id));
      await a.evaluate(async (id) => { progress.flags["flag-a"] = { id, unit: "u01", prompt: "flagged in A", createdAt: now(), updatedAt: now() }; saveProgress(false); await Store.flush(); }, ids[700]);
      const tB = await b.evaluate(async (id) => { applyResult(id, true, "recall"); progress.settings.goal = 75; progress.settingsUpdatedAt = now(); saveProgress(); await Store.flush(); await new Promise(r => setTimeout(r, 300)); await Store.flush(); return progress.items[pid(id)].lastSeen; }, ids[710]);
      await a.waitForFunction((id) => !!progress.items[id], ids[710], { timeout: 10000 }).catch(() => { });
      await flushed(a); await flushed(b);
      const inStore = await stored(a);
      check("A's answers and B's later one are all in the storage: B merged A's saves before its own", ids.slice(700, 703).every((id, k) => (inStore.items[id] || {}).lastSeen === tA[k]) && (inStore.items[ids[710]] || {}).lastSeen === tB && Object.keys(inStore.items).length === 604, String(Object.keys(inStore.items).length));
      check("…with A's flag and B's setting", !!inStore.flags["flag-a"] && inStore.settings.goal === 75);
      check("…and both windows now show the same progress", (await records(a)) === 604 && (await records(b)) === 604 && (await a.evaluate("progress.settings.goal")) === 75 && !!(await b.evaluate(() => progress.flags["flag-a"])));
      const w = [await a.evaluate(() => Store.status().writes), await b.evaluate(() => Store.status().writes)], rev = (await storedRows(a))["store.rev"];
      await pause(1500);
      check("…and settle: neither goes on writing", (await a.evaluate(() => Store.status().writes)) === w[0] && (await b.evaluate(() => Store.status().writes)) === w[1] && (await storedRows(a))["store.rev"] === rev);
      // told at once: B hears of A's save without saving anything itself
      await a.evaluate(async () => { setTheme("light"); await Store.flush(); });
      const tA2 = await answer(a, ids[720]); await flushed(a);
      const heard = await b.waitForFunction((id) => !!progress.items[id] && document.documentElement.getAttribute("data-theme") === "light", ids[720], { timeout: 10000 }).then(() => true, () => false);
      check("a window is told when the other saves, and takes its progress and its theme without saving anything", heard && (await b.evaluate((id) => progress.items[id].lastSeen, ids[720])) === tA2);
      // the same item answered in both: the later answer wins, in both
      const t1 = await answer(a, ids[730]); await flushed(a);
      await pause(30);
      const t2 = await b.evaluate(async (id) => { applyResult(id, false, "recall"); await Store.flush(); return progress.items[pid(id)].lastSeen; }, ids[730]);
      await pause(800); await flushed(a); await flushed(b);
      const both = [await a.evaluate((id) => progress.items[id], ids[730]), await b.evaluate((id) => progress.items[id], ids[730]), (await stored(a)).items[ids[730]]];
      check("the same item answered in both windows: the later answer is the one kept, everywhere", t2 >= t1 && both.every(r => r && r.lastSeen === t2), JSON.stringify(both));
      // a reset in one window reaches the other
      await a.evaluate(async () => { const settings = progress.settings, flags = progress.flags; progress = defaultProgress(); progress.settings = settings; progress.flags = flags; progress.resetAt = now(); DIRTY = null; buildContent(); saveProgress(); await Store.flush(); });
      await b.waitForFunction(() => Object.keys(progress.items).length === 0, null, { timeout: 10000 }).catch(() => { });
      await flushed(b);
      check("a reset in one window empties the other too, and the storage", (await records(b)) === 0 && Object.keys((await stored(a)).items).length === 0);
      check("no script errors in either window", !a.errors.length && !b.errors.length, a.errors.concat(b.errors).join("\n"));
      await context.close();
    }
    {
      // a window that comes back to the screen looks before it is used (no channel needed)
      const context = await newContext();
      const a = await openPage(context, "index.html"), b = await openPage(context, "index.html", { init: `window.BroadcastChannel = undefined;` });
      const t = await answer(a, ids[40]); await flushed(a);
      await b.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
      const seen = await b.waitForFunction((id) => !!progress.items[id], ids[40], { timeout: 10000 }).then(() => true, () => false);
      check("a window coming back to the screen takes what the other saved while it was away", seen && (await b.evaluate((id) => progress.items[id].lastSeen, ids[40])) === t);
      const t2 = await answer(a, ids[41]); await flushed(a);
      const t3 = await b.evaluate(async (id) => { applyResult(id, true, "recall"); await Store.flush(); await new Promise(r => setTimeout(r, 300)); await Store.flush(); return progress.items[pid(id)].lastSeen; }, ids[42]);
      const s = await stored(b);
      check("…and even with no word from the other window, a save first merges what it saved", (s.items[ids[41]] || {}).lastSeen === t2 && (s.items[ids[42]] || {}).lastSeen === t3 && (s.items[ids[40]] || {}).lastSeen === t);
      await context.close();
    }

    {
      // a window saving the older way (IndexedDB didn't open for it) while another makes the move
      const context = await newContext();
      await seedLocal(context, deviceTexts(someProgress(300)));
      const a = await openPage(context, "index.html", { init: IDB_ERRORS_ONCE });
      check("(one window couldn't open IndexedDB and is saving the older way)", (await status(a)).backend === "local" && /^n-store: Saving the older way/.test(await noticeText(a)));
      const t1 = await answer(a, ids[400]); // saved in localStorage, the live copy
      const b = await openPage(context, "index.html"); // IndexedDB works here: the move is made
      check("(another window opens, and makes the move with what the first has saved so far)", (await status(b)).backend === "idb" && (await status(b)).moved.records === 301);
      const frozen = oldKeys(await localTexts(b));
      const t2 = await answer(a, ids[401]);
      await a.waitForFunction(() => Store.status().backend === "idb" && Store.status().writes > 0, null, { timeout: 10000 }).catch(() => { });
      await flushed(a); await pause(300); await flushed(a); await flushed(b);
      const s = await stored(a);
      check("the first window's next answer is saved in IndexedDB, not in the old storage: it has moved over", (await status(a)).backend === "idb" && (s.items[ids[401]] || {}).lastSeen === t2 && (s.items[ids[400]] || {}).lastSeen === t1 && Object.keys(s.items).length === 302, JSON.stringify(await status(a)));
      check("…the old copy is as the move left it", oldKeys(await localTexts(a)) === frozen);
      check("…its notice about saving the older way is gone, and both windows hold the same progress", !/^n-store/.test(await noticeText(a)) && (await records(a)) === 302 && await b.waitForFunction(() => Object.keys(progress.items).length === 302, null, { timeout: 10000 }).then(() => true, () => false), await noticeText(a));
      check("no script errors in either window", !a.errors.length && !b.errors.length, a.errors.concat(b.errors).join("\n"));
      await context.close();
    }

    /* 8. Start-up */
    section("8. Start-up: the theme before the page body, and nothing drawn before the saved data is in memory");
    {
      // what the page looks like as its body begins, and what progress was in memory when the app first drew
      const WATCH = `(() => { new MutationObserver((_, o) => { if (document.body) { window.__atBody = { theme: document.documentElement.getAttribute("data-theme") }; o.disconnect(); } }).observe(document, { childList: true, subtree: true });
        new MutationObserver((_, o) => { const app = document.getElementById("app"); if (app && app.children.length) { window.__atDraw = { started: typeof STARTED !== "undefined" && STARTED, records: Object.keys(progress.items).length, backend: Store.status().backend, theme: document.documentElement.getAttribute("data-theme") }; o.disconnect(); } }).observe(document, { childList: true, subtree: true }); })();`;
      const context = await newContext();
      await seedLocal(context, deviceTexts(someProgress(500))); // the theme saved is dark; this browser's own setting is light
      await context.addInitScript(WATCH);
      const page = await openPage(context, "index.html");
      let w = await page.evaluate(() => ({ body: window.__atBody, draw: window.__atDraw }));
      check("the first start after the update (no note yet): the theme is already right as the body begins, from the old key", w.body.theme === "dark", JSON.stringify(w.body));
      check("…and nothing is drawn until the saved data is in memory: the first thing drawn already has the progress", w.draw.started && w.draw.records === 500 && w.draw.backend === "idb", JSON.stringify(w));
      await reopen(page);
      w = await page.evaluate(() => ({ body: window.__atBody, draw: window.__atDraw }));
      check("later starts: the theme is right as the body begins, from the note", w.body.theme === "dark" && w.draw.records === 500 && w.draw.theme === "dark", JSON.stringify(w));
      await page.evaluate(async () => { setTheme("light"); await Store.flush(); });
      await reopen(page);
      w = await page.evaluate(() => ({ body: window.__atBody, draw: window.__atDraw }));
      check("the theme changed in the app is the one the next start paints with, though the old key still says dark", w.body.theme === "light" && w.draw.theme === "light" && (await localTexts(page))["itapp.theme.v1"] === '"dark"', JSON.stringify(w.body));
      await page.evaluate(async () => { setTheme("auto"); await Store.flush(); });
      await reopen(page);
      w = await page.evaluate(() => ({ body: window.__atBody }));
      check("Auto leaves the choice to the phone, from the first paint", w.body.theme === null, JSON.stringify(w.body));
      // a note that says the wrong thing (written by hand) is put right as the app starts
      await page.evaluate(() => localStorage.setItem("ripasso.boot.v1", JSON.stringify({ theme: "dark", idb: 1 })));
      await reopen(page);
      check("a note that is wrong is put right as the app starts: the saved data decides", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === null && JSON.parse((await localTexts(page))["ripasso.boot.v1"]).theme === "auto");
      check("the app asks the device to keep its storage only through Store, and gets an answer", [true, false, null].includes(await page.evaluate(() => Store.persist())));
      check("no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }

    /* 9. The version before */
    section("9. The version before (9.25): updating, going back, and updating again");
    if (!oldHtml && args.includes("--require-old")) check("9.25's index.html is here, so updating from it and going back to it can be tested (--require-old)", false, "the tag v9.25 isn't in this checkout: git fetch origin tag v9.25, or pass --old path/to/index.html");
    else if (!oldHtml) console.log("  note 9.25's index.html isn't in this checkout, so this section is skipped: fetch its tag (git fetch origin tag v9.25) or pass --old path/to/index.html");
    else {
      const context = await newContext();
      await seedLocal(context, deviceTexts(someProgress(700)));
      site.html = oldHtml;
      let page = await openPage(context, "index.html");
      check("(9.25 opens with the progress in localStorage)", (await page.evaluate("APP_VERSION")) === "9.25" && (await records(page)) === 700 && (await page.evaluate("typeof Store")) === "undefined");
      const t0 = await answer(page, ids[800]); // practised in 9.25, just before the update
      const before = oldKeys(await localTexts(page));
      site.html = html;
      await reopen(page);
      let st = await status(page);
      check("updated: everything practised in 9.25 is there, moved and checked", (await page.evaluate("APP_VERSION")) === version && st.backend === "idb" && !!st.moved && st.moved.records === 701 && (await page.evaluate((id) => progress.items[id].lastSeen, ids[800])) === t0, JSON.stringify(st));
      check("…and 9.25's copy is left exactly as it was", oldKeys(await localTexts(page)) === before);
      const t1 = await answer(page, ids[801]); await flushed(page); // practised after the update
      const backup = await page.evaluate(() => backupText());
      // going back to 9.25
      site.html = oldHtml;
      await reopen(page);
      check("put back to 9.25: it opens with the progress as it was at the move", (await page.evaluate("APP_VERSION")) === "9.25" && (await records(page)) === 701 && !(await page.evaluate((id) => progress.items[id], ids[801])));
      await page.evaluate((text) => { S.screen = "data"; render(); document.getElementById("progressText").value = text; action("importProgress"); }, backup);
      check("…and a backup file made before going back brings in what was practised since", (await records(page)) === 702 && (await page.evaluate((id) => progress.items[id].lastSeen, ids[801])) === t1);
      const t2 = await answer(page, ids[802]); // practised in 9.25 after going back
      // and updating again
      site.html = html;
      await reopen(page);
      st = await status(page);
      check("updated again: the app opens with its own progress, as it last saved it, and moves nothing a second time", st.backend === "idb" && (await records(page)) === 702 && !(await page.evaluate((id) => progress.items[id], ids[802])), JSON.stringify(st));
      await page.waitForFunction(() => Store.status().oldChanged, null, { timeout: 15000 }).catch(() => { });
      check("…notices that 9.25 saved progress meanwhile, and says so on Today", (await status(page)).oldChanged && /^n-store: .*Progress saved by an older version/.test(await noticeText(page)), await noticeText(page));
      await page.click('#n-store [data-act="mergeOld"]');
      check("…and Merge it in brings in what was practised in 9.25", (await records(page)) === 703 && (await stored(page)).items[ids[802]].lastSeen === t2 && (await stored(page)).items[ids[801]].lastSeen === t1 && (await stored(page)).items[ids[800]].lastSeen === t0);
      check("no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
      site.html = html;
    }

    /* 10. Your data and Today */
    section("10. Your data's Storage card says which storage is in use");
    {
      const context = await newContext();
      await seedLocal(context, deviceTexts(someProgress(900)));
      const page = await openPage(context, "index.html");
      await page.evaluate(() => { S.screen = "data"; render(); });
      await page.waitForFunction(() => /saved/.test(document.getElementById("store-use").textContent), null, { timeout: 5000 }).catch(() => { });
      const card = (await page.textContent("#sec-storage")).replace(/\s+/g, " ");
      check("it names the storage, how much is saved and the room left", /Storage Saved in this device's database \(IndexedDB\)\. \d+(\.\d)? (KB|MB) saved, with room for about \d+(\.\d)? (MB|GB) more\./.test(card), card);
      check("…when the data was moved, and how much was checked", /Moved here from the browser's older storage on \d{1,2} \w{3} \d{4}: 900 records and 400 days of log, checked against the original before the switch\./.test(card), card);
      check("…and offers the copy from before the move while it is on the device", /The copy from before the move is still on this device, untouched\./.test(card) && !!(await page.$('#sec-storage [data-act="mergeOld"]')));
      const use = await page.evaluate(() => Store.usage());
      const rows = await storedRows(page), text = Object.entries(rows).filter(([k]) => !k.startsWith("store.")).reduce((n, [k, t]) => n + k.length + t.length, 0);
      check("the size shown is the size of what is saved (every key and its text)", Math.abs(use.saved - text) < 400 && use.room > 0, `${use.saved} against ${text}`);
      const merged = await page.evaluate(async () => { const n = Object.keys(progress.items).length; action("mergeOld"); await Store.flush(); return { same: Object.keys(progress.items).length === n, report: S.report }; });
      check("merging the copy from before the move into progress that already has it changes no record", merged.same && /merged in/.test(merged.report), JSON.stringify(merged));
      check("no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
      const c2 = await newContext(), fresh = await openPage(c2, "index.html");
      await fresh.evaluate(() => { S.screen = "data"; render(); });
      const card2 = (await fresh.textContent("#sec-storage")).replace(/\s+/g, " ");
      check("a new device: the card names the storage, with no move and no old copy to speak of", /Saved in this device's database \(IndexedDB\)/.test(card2) && !/Moved here|before the move/.test(card2) && !(await fresh.$('#sec-storage [data-act="mergeOld"]')), card2);
      await c2.close();
    }

    /* 11. An old storage filled to the brim */
    section("11. An old storage filled to the brim still moves");
    {
      const context = await newContext();
      const p = someProgress(0);
      for (let k = 0; k < 31000; k++) p.items["zz-full-" + String(k).padStart(5, "0")] = { box: 7, due: T + 60 * DAY, lapses: 12, lastSeen: T - 1, lastWrong: T - DAY, seenCount: 123, lastRight: T - 1 };
      const texts = deviceTexts(p);
      const blank = await openPage(context, "blank");
      const filled = await blank.evaluate((t) => { // everything the device has, then filler until localStorage refuses another character
        localStorage.clear();
        for (const [k, v] of Object.entries(t)) localStorage.setItem(k, v);
        let size = 1 << 20, text = "";
        while (size >= 1) { try { localStorage.setItem("zz.filler", text + "x".repeat(size)); text += "x".repeat(size); } catch (e) { size = Math.floor(size / 2); } }
        let used = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); used += k.length + localStorage.getItem(k).length; }
        let more = true; try { localStorage.setItem("zz.one-more", "x"); localStorage.removeItem("zz.one-more"); } catch (e) { more = false; }
        return { used, more };
      }, texts);
      await blank.close();
      check(`(localStorage is full: ${(filled.used / 1048576).toFixed(2)} MB, of which progress ${(texts[K].length / 1048576).toFixed(2)} MB, and it refuses another key)`, !filled.more && filled.used > 5e6);
      const page = await openPage(context, "index.html");
      const st = await status(page);
      check("the move is made all the same, every record checked: it needs no room in the old storage", st.backend === "idb" && !!st.moved && st.moved.records === 31000 && (await records(page)) === 31000, JSON.stringify(st));
      const t = await answer(page, ids[50]); await flushed(page);
      await reopen(page);
      check("…and the app carries on from IndexedDB, saving and loading as usual", (await status(page)).backend === "idb" && (await records(page)) === 31001 && (await page.evaluate((id) => progress.items[id].lastSeen, ids[50])) === t);
      check("no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }
  } catch (e) {
    results.stopped(e);
  } finally {
    await browser.close();
    server.close();
  }
  results.summary();
})();

