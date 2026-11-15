/*
  Helpers shared by the browser tests (test-progress, test-ui, test-install, test-items, test-perf, test-sessions, test-speedups, test-choices):
  finding Playwright, serving the app to the browser, and counting and printing checks.

    const { loadPlaywright, serveApp, checks } = require("./lib/browser");
    const { chromium } = loadPlaywright();
    const server = await serveApp(file);                 // http://127.0.0.1:<server.address().port>/index.html
    const T = checks();                                  // checks({ onlyFailures: true }) prints only failures (VERBOSE=1 prints all)
    T.check("the app opens", ok, "what went wrong");
    T.summary();                                         // prints the totals and exits, with code 1 if any check failed

  Saved data (from 9.26 the app keeps it in IndexedDB, through Store; before, in localStorage). A test that seeds
  localStorage on a blank page before the app first opens still works, and exercises the move; once the app has opened,
  localStorage is no longer read, so a test reads and changes what is saved with these (they also work on a version
  before 9.26, for the tests that take an older index.html):

    const { stored, save, storedRows } = require("./lib/browser");
    await stored(page, "itapp.progress.v1");             // what the storage itself holds under the key, read afresh
    await save(page, "itapp.seen.v1", "9.0-old");        // sets it (null removes it) and waits until it is stored
    await storedRows(page);                              // every row of the database as text, by key (null: no database)
    await saveText(page, "itapp.confusions.v1", "{not json"); // a row written straight into the database, as text (a damaged one, say); reload the page after

  stored() reads the database itself, not the app's memory, and puts progress together from its parts by the format
  written out here by hand (STORAGE FORMAT below), not borrowed from the app: a change to the format makes the tests
  fail until a migration is written and this is updated with it.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

// Playwright from the repository's node_modules (npm install), else a global install (npm install -g playwright).
function loadPlaywright() {
  try { return require(require.resolve("playwright", { paths: [ROOT] })); } catch (e) { }
  try { return require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch (e) { }
  console.error("Playwright is not installed. Install it with: npm install (in the repository), or npm install -g playwright");
  process.exit(2);
}

// A local web server on a free port. handler(req, res) answers each request; host defaults to 127.0.0.1.
function serve(handler, host = "127.0.0.1") {
  const server = http.createServer(handler);
  return new Promise(r => host ? server.listen(0, host, () => r(server)) : server.listen(0, () => r(server)));
}

// The app at /index.html, read once from file, and a blank page on the same origin at any other address (for seeding storage).
function serveApp(file) {
  const html = fs.readFileSync(file);
  return serve((req, res) => {
    if (req.url.startsWith("/index.html")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); }
    else { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>blank</title>"); }
  });
}

// Counts checks and prints each one as "  ok  " or "  FAIL", with the detail under a failure.
function checks({ onlyFailures = false } = {}) {
  const T = { total: 0, failures: 0 };
  T.check = (name, ok, detail) => {
    T.total++;
    if (!ok) T.failures++;
    if (!ok || !onlyFailures || process.env.VERBOSE) console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${!ok && detail ? "\n         " + String(detail).replace(/\n/g, "\n         ") : ""}`);
  };
  T.section = (title) => console.log("\n" + title);
  T.stopped = (e) => { T.failures++; console.log("\n  FAIL the test itself stopped: " + (e && e.stack || e)); };
  T.summary = () => { // the runner (tools/run-tests.js) reads the number of checks from this line, passed or failed
    console.log(T.failures ? `\n${T.failures} of ${T.total} check(s) failed.` : `\nAll ${T.total} checks passed.`);
    process.exit(T.failures ? 1 : 0);
  };
  return T;
}

/* STORAGE FORMAT (from 9.26), written out by hand. IndexedDB database "ripasso", version 1, one object store "data" with
   out-of-line keys; every key and every value is text, each value JSON. A small value is one row under its own key
   ("itapp.theme.v1" → "\"dark\""). Progress is kept in parts:
     "itapp.progress.v1/head"       { p: progress without items and days, items: true, days: true } (true: kept in the rows below)
     "itapp.progress.v1/days_YYYY"  { "YYYY-MM-DD": day, … }: the days of that year
     "itapp.progress.v1/bNNN"       { id: record, … }: the records whose id hashes to bucket NNN (000–255): FNV-1a over the
                                    id's UTF-16 units (start 2166136261, times 16777619), modulo 256; an empty bucket has no row
   and two rows are the storage's own: "store.migration" (the move from localStorage: { state: "done", at, from, keys,
   records, days, fp, skipped }) and "store.rev" (a token, new with every save). */
const DB_NAME = "ripasso", DB_TABLE = "data", PROGRESS_KEY = "itapp.progress.v1";
function bucketOf(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return "b" + String((h >>> 0) % 256).padStart(3, "0"); }
// The value under key in rows ({ key: text }), progress put together from its parts; throws if a part is out of place.
function valueFrom(rows, key) {
  const head = rows[key + "/head"];
  if (key !== PROGRESS_KEY || head === undefined) return rows[key] === undefined ? null : JSON.parse(rows[key]);
  const h = JSON.parse(head), p = h.p;
  if (h.items) p.items = {};
  if (h.days) p.days = {};
  for (const [k, text] of Object.entries(rows)) {
    if (!k.startsWith(key + "/") || k === key + "/head") continue;
    const name = k.slice(key.length + 1), part = JSON.parse(text);
    if (/^b\d{3}$/.test(name) && h.items) for (const [id, r] of Object.entries(part)) { if (bucketOf(id) !== name) throw new Error(`the record ${id} is stored in ${name}, not in ${bucketOf(id)}, the bucket its id hashes to`); if (Object.prototype.hasOwnProperty.call(p.items, id)) throw new Error(`the record ${id} is stored twice`); p.items[id] = r; }
    else if (/^days_/.test(name) && h.days) for (const [d, v] of Object.entries(part)) { if (d.slice(0, 4) !== name.slice(5)) throw new Error(`the day ${d} is stored in ${name}`); p.days[d] = v; }
    else throw new Error(`an unexpected part of progress: ${k}`);
  }
  return p;
}
// Every row of the database as { key: text }, once every save so far has landed; null where there is no database (the
// app saving in localStorage, or a version before 9.26). Read straight from IndexedDB, not through the app.
const storedRows = (page) => page.evaluate(async ([name, table]) => {
  if (typeof Store === "undefined" || Store.status().backend !== "idb") return null;
  await Store.flush();
  const db = await new Promise((ok, no) => { const r = indexedDB.open(name); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  try {
    const s = db.transaction(table, "readonly").objectStore(table), get = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    const [keys, values] = await Promise.all([get(s.getAllKeys()), get(s.getAll())]);
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  } finally { db.close(); }
}, [DB_NAME, DB_TABLE]);
// What the storage holds under key (every save so far landed first), in a page with the app open.
async function stored(page, key = PROGRESS_KEY) {
  const rows = await storedRows(page);
  return rows ? valueFrom(rows, key) : page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), key);
}
// Sets what is saved under key (null removes it) and waits until it is stored; the app in the page sees it at once.
const save = (page, key, value) => page.evaluate(async ([k, v]) => {
  if (typeof Store === "undefined") { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return; }
  if (v === null) Store.remove(k); else Store.set(k, v);
  await Store.flush();
}, [key, value]);
// Writes text under key straight into the database, past the app (which doesn't see it until the page is loaded again):
// for a row as a test wants it, damaged ones included. In a version before 9.26, into localStorage.
const saveText = (page, key, text) => page.evaluate(async ([name, table, k, t]) => {
  if (typeof Store === "undefined" || Store.status().backend !== "idb") { localStorage.setItem(k, t); return; }
  await Store.flush();
  const db = await new Promise((ok, no) => { const r = indexedDB.open(name); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  await new Promise((ok, no) => { const tx = db.transaction(table, "readwrite"); tx.objectStore(table).put(t, k); tx.oncomplete = ok; tx.onabort = () => no(tx.error); });
  db.close();
}, [DB_NAME, DB_TABLE, key, text]);

module.exports = { ROOT, loadPlaywright, serve, serveApp, checks, stored, save, saveText, storedRows, valueFrom, bucketOf, DB_NAME, DB_TABLE, PROGRESS_KEY };
