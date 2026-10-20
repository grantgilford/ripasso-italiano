#!/usr/bin/env node
/*
  Test of the installed copy: index.html served from its own website, as on
  GitHub Pages, with manifest.webmanifest, sw.js and icons/ beside it.

  Usage:  node tools/test-install.js [--headed]

  Serves the repository at http://localhost:<port>/ripasso-italiano/ (the same
  shape as https://<user>.github.io/ripasso-italiano/) and opens the real app
  in a headless browser (Playwright + Chromium). It checks that:

    1. the manifest and icons are complete and valid, so Android offers
       "Install app" with the Ripasso icon;
    2. the offline worker keeps a copy: with the website down, the app still
       opens, with its progress;
    3. a new index.html on the website is downloaded and offered on Today as
       "Update now", never during a session; Later hides it; Update now
       switches to the new version and keeps all progress; Check for updates
       in Your data works;
    4. the back button steps back through the screens (Units, You, Settings,
       a unit, the summary), and in a session first asks "Leave this
       session?" (Keep practising stays, Leave goes to Today); on Today the
       app keeps no extra history, so back leaves the app;
    5. backups: the first-run card on a new device, the reminder when the
       last backup is over a week old (Later snoozes it), Back up now shares a
       file (or saves one where sharing isn't available) and records the
       time, Load backup file merges a backup, and a device that refuses to
       save shows a warning on Today;
    6. inside claude.ai none of this runs: no manifest, no worker, no extra
       history, no notices.

  Changes nothing in the repository. Exits with code 1 if any check fails.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");

const HEADED = process.argv.includes("--headed");
const ROOT = path.join(__dirname, "..");
const BASE = "/ripasso-italiano/";

function loadPlaywright() {
  try { return require("playwright"); } catch (e) { }
  try { return require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch (e) { }
  console.error("Playwright is not installed. Install it with: npm install -g playwright");
  process.exit(2);
}
const { chromium } = loadPlaywright();

let failures = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${!ok && detail ? "\n         " + String(detail).replace(/\n/g, "\n         ") : ""}`);
}
const section = (t) => console.log("\n" + t);

/* ---------- a stand-in for GitHub Pages: the repository under /ripasso-italiano/, which can be taken down or given a new index.html ---------- */
const site = { down: false, html: fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), hits: [] };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png", ".json": "application/json" };
function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    site.hits.push(url.pathname);
    if (site.down) { res.writeHead(503); res.end("down"); return; }
    if (!url.pathname.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
    let rel = url.pathname.slice(BASE.length) || "index.html";
    if (rel === "index.html") { res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "max-age=600" }); res.end(site.html); return; }
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "max-age=600" });
    res.end(fs.readFileSync(file));
  });
  return new Promise(r => server.listen(0, () => r(server)));
}

const ready = "typeof content !== 'undefined' && content && typeof S !== 'undefined' && (S.screen === 'home' || S.screen === 'data')";
const pause = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(page, fn, arg, timeout = 8000) { try { await page.waitForFunction(fn, arg, { timeout }); return true; } catch (e) { return false; } }
async function tap(page, sel) { await page.click(sel); await page.waitForTimeout(80); }
const screen = (page) => page.evaluate("S.screen");
const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), key);

function seed(T) { // some practice, saved on this device
  const items = {};
  content.byUnit.u01.slice(0, 30).forEach((i, k) => { items[i.id] = { box: 1 + (k % 6), due: T + 864e5, lapses: 0, lastSeen: T - 864e5, lastWrong: 0, seenCount: 3, lastRight: T - 864e5 }; });
  localStorage.setItem("itapp.progress.v1", JSON.stringify({ v: 2, items, days: {}, flags: {}, currentUnit: "u01", settings: defaultProgress().settings, updatedAt: T, settingsUpdatedAt: T }));
}

function pngSize(file) { const b = fs.readFileSync(file); return b.toString("ascii", 1, 4) === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; }

(async () => {
  const server = await serve();
  const origin = "http://localhost:" + server.address().port;
  const appUrl = origin + BASE;
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    /* 1. Manifest and icons */
    section("1. The app can be installed");
    {
      const m = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8"));
      check("the manifest names the app Ripasso Italiano, short name Ripasso", m.name === "Ripasso Italiano" && m.short_name === "Ripasso");
      check("it opens full screen (standalone) at the app's own address", m.display === "standalone" && m.start_url === "./" && m.scope === "./");
      for (const [size, purpose] of [["192x192", "any"], ["512x512", "any"], ["192x192", "maskable"], ["512x512", "maskable"]]) {
        const ic = (m.icons || []).find(i => i.sizes === size && i.purpose === purpose);
        const dim = ic && fs.existsSync(path.join(ROOT, ic.src)) ? pngSize(path.join(ROOT, ic.src)) : null;
        check(`it has a ${size} ${purpose} icon that exists and is that size`, dim && dim.join("x") === size, ic ? ic.src + " is " + (dim ? dim.join("x") : "missing") : "not listed");
      }
      const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
      const listed = [...sw.matchAll(/"((?:icons\/[^"]+)|manifest\.webmanifest)"/g)].map(x => x[1]);
      check("every file the worker keeps exists", listed.length >= 5 && listed.every(f => fs.existsSync(path.join(ROOT, f))), listed.filter(f => !fs.existsSync(path.join(ROOT, f))).join(", "));
      check("the site has a .nojekyll file, so GitHub Pages serves the files as they are", fs.existsSync(path.join(ROOT, ".nojekyll")));
    }

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    await page.goto(appUrl);
    await page.waitForFunction(ready);
    check("the page links the manifest", await page.evaluate(() => { const l = document.querySelector('link[rel="manifest"]'); return !!l && l.href.endsWith("/ripasso-italiano/manifest.webmanifest"); }));
    check("the offline worker starts", await waitFor(page, () => navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(r => !!r.active)), "no active worker");

    /* 5a. First run on a new device */
    section("5. Backups on this device (first run)");
    check("a new device shows the 'New on this device?' card", !!(await page.$("#n-welcome")));
    await tap(page, '#n-welcome [data-act="welcomeDone"]');
    check("Start fresh hides it for good", !(await page.$("#n-welcome")) && (await stored(page, "itapp.backup.v1") || {}).welcomed === true);

    /* 2. Offline */
    section("2. The app opens offline");
    const T = Date.now();
    await page.evaluate(seed, T);
    await page.reload(); await page.waitForFunction(ready);
    await waitFor(page, () => !!navigator.serviceWorker.controller);
    check("after a reload the worker serves the app", await page.evaluate(() => !!navigator.serviceWorker.controller));
    site.down = true;
    await page.reload(); const offOk = await waitFor(page, ready);
    check("with the website down, the app still opens", offOk);
    check("…with its progress", offOk && (await page.evaluate("Object.keys(progress.items).length")) === 30);
    site.down = false;

    /* 3. Updates */
    section("3. A new version is offered on Today, never mid-session");
    check("with nothing new on the website there is no update card", !(await page.$("#n-update")));
    site.html = site.html.replace('const APP_VERSION = "', 'const APP_VERSION = "9.9-test-').replace("<title>Ripasso</title>", "<title>Ripasso</title><!-- new version -->");
    await page.evaluate(() => startSession("continue"));
    check("(a practice session is open)", (await screen(page)) === "session");
    await page.evaluate(() => checkForUpdate());
    await waitFor(page, () => !!S.update);
    check("the new version is found in the background", await page.evaluate(() => !!S.update && /9\.9-test-/.test(S.update.version)));
    check("…but nothing appears in the session", (await screen(page)) === "session" && !(await page.$("#n-update")));
    await page.evaluate(() => applyUpdate()); await pause(300);
    check("…and it can't be applied mid-session", (await screen(page)) === "session" && !(await page.evaluate("S.applying")));
    await tap(page, '[data-go="quit"]');
    check("back on Today, the card offers the new version", !!(await page.$("#n-update")) && /9\.9-test-/.test(await page.textContent("#n-update")));
    await tap(page, '#n-update [data-act="updateLater"]');
    check("Later hides it for now", !(await page.$("#n-update")));
    await tap(page, '.tab[data-go="you"]'); await tap(page, '[data-go="data"]');
    const version = await page.evaluate("APP_VERSION"); // the running version, whatever its number
    check("Your data has an App section with the version", (await page.textContent("#sec-app")).includes("Version " + version) && !!(await page.$('#sec-app [data-act="applyUpdate"]')));
    const progBefore = await stored(page, "itapp.progress.v1");
    await Promise.all([page.waitForNavigation({ timeout: 10000 }), page.click('#sec-app [data-act="applyUpdate"]')]);
    await page.waitForFunction(ready);
    check("Update now switches to the new version", /^9\.9-test-/.test(await page.evaluate("APP_VERSION")));
    const progAfter = await stored(page, "itapp.progress.v1");
    check("…and keeps all the progress", JSON.stringify(progAfter.items) === JSON.stringify(progBefore.items));
    check("…and no update is offered any more", !(await page.$("#n-update")) && !(await page.evaluate("S.update")));
    site.down = true; await page.reload(); const stillNew = await waitFor(page, ready);
    check("offline, the new version is the one that opens", stillNew && /^9\.9-test-/.test(await page.evaluate("APP_VERSION")));
    site.down = false;
    await page.evaluate(() => { S.screen = "data"; render(); checkForUpdate(true); });
    await waitFor(page, () => S.updateState === "current");
    check("Check for updates reports the latest version", /latest version/.test(await page.textContent("#sec-app")));
    await page.evaluate(() => { S.screen = "home"; render(); });

    /* 4. The back button */
    section("4. The back button steps back through the app");
    const back = async () => { await page.goBack({ waitUntil: "commit" }).catch(() => { }); await page.waitForTimeout(150); };
    check("on Today the app keeps no extra history, so back leaves the app", !(await page.evaluate("history.state && history.state.ripasso")));
    await tap(page, '.tab[data-go="units"]'); await back();
    check("Units → back → Today", (await screen(page)) === "home");
    await tap(page, '.tab[data-go="you"]'); await tap(page, '[data-go="settings"]');
    await back(); check("Settings → back → You", (await screen(page)) === "you");
    await back(); check("You → back → Today", (await screen(page)) === "home");
    await tap(page, '.tab[data-go="units"]'); await tap(page, '.ulist [data-ref]');
    await back(); check("a unit → back → Units", (await screen(page)) === "units");
    await tap(page, '.tab[data-go="home"]');
    check("tapping Today removes the extra history again", (await screen(page)) === "home" && await waitFor(page, () => !(history.state && history.state.ripasso), null, 2000));
    await tap(page, '.hero[data-start="continue"]');
    await back();
    check("in a session, back asks 'Leave this session?'", (await screen(page)) === "session" && !!(await page.$("#sheetBg")) && /Leave this session/.test(await page.textContent("#sheetBg")));
    check("…with the focus moved into it, so the keyboard closes", await page.evaluate(() => !!(document.activeElement && document.activeElement.closest("#sheetBg"))));
    await tap(page, '#sheetBg [data-act="stay"]');
    check("Keep practising closes it and stays in the session", (await screen(page)) === "session" && !(await page.$("#sheetBg")));
    await back(); await back();
    check("back again while it's open just closes it", (await screen(page)) === "session" && !(await page.$("#sheetBg")));
    await back(); await tap(page, '#sheetBg [data-go="quit"]');
    check("Leave goes to Today", (await screen(page)) === "home" && await waitFor(page, () => !(history.state && history.state.ripasso), null, 2000));
    await page.evaluate(() => { startSession("continue"); session.finished = true; S.screen = "summary"; render(); });
    await back();
    check("the summary → back → Today", (await screen(page)) === "home");

    /* 5b. Backups */
    section("5. Backups on this device");
    await page.evaluate(() => { localStorage.removeItem("itapp.backup.v1"); render(); });
    check("with practice and no backup, Today reminds you to back up", !!(await page.$("#n-backup")));
    await tap(page, '#n-backup [data-act="backupLater"]');
    check("Later hides the reminder for three days", !(await page.$("#n-backup")) && (await stored(page, "itapp.backup.v1")).snooze > Date.now() + 2.9 * 864e5);
    await page.evaluate(() => { localStorage.setItem("itapp.backup.v1", JSON.stringify({ at: Date.now() - 2 * 864e5 })); render(); });
    check("no reminder when the last backup is recent", !(await page.$("#n-backup")));
    await page.evaluate(() => { localStorage.setItem("itapp.backup.v1", JSON.stringify({ at: Date.now() - 10 * 864e5 })); render(); });
    check("a reminder when it is over a week old, saying when", !!(await page.$("#n-backup")) && /10 days ago/.test(await page.textContent("#n-backup")));
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 5000 }).catch(() => null), page.click('#n-backup [data-act="backupNow"]')]);
    check("Back up now saves a backup file where sharing isn't available", !!dl && /^ripasso-backup-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
    const dlText = dl ? fs.readFileSync(await dl.path(), "utf8") : "";
    check("…holding the progress", dlText && JSON.parse(dlText).items && Object.keys(JSON.parse(dlText).items).length === 30);
    check("…and the time is recorded, so the reminder goes", (await stored(page, "itapp.backup.v1")).at > Date.now() - 60e3 && !(await page.$("#n-backup")));

    // Sharing, as on Android: a stand-in share menu that keeps the file
    await page.evaluate(() => {
      window.__shared = null;
      navigator.canShare = (d) => !!(d && d.files && d.files.every(f => f.type === "text/plain"));
      navigator.share = async (d) => { window.__shared = { name: d.files[0].name, type: d.files[0].type, text: await d.files[0].text() }; };
      localStorage.setItem("itapp.backup.v1", JSON.stringify({ at: 1 })); S.screen = "data"; render();
    });
    check("Your data shows Share backup… where sharing is available", !!(await page.$('[data-act="shareProgress"]')));
    check("…and when the last backup was made", /Last backup from this device/.test(await page.textContent("#sec-backup")));
    await tap(page, '[data-act="shareProgress"]'); await pause(200);
    const shared = await page.evaluate("window.__shared");
    check("Share backup… hands a text file with the backup to the share menu", shared && /^ripasso-backup-.*\.txt$/.test(shared.name) && shared.type === "text/plain" && Object.keys(JSON.parse(shared.text).items).length === 30, JSON.stringify(shared && { name: shared.name, type: shared.type }));
    check("…and records the time", (await stored(page, "itapp.backup.v1")).at > Date.now() - 60e3);

    // Loading a backup merges it
    const extra = await page.evaluate(() => { const id = content.byUnit.u02[0].id; const p = JSON.parse(backupText()); p.items[id] = { box: 4, due: Date.now(), lapses: 0, lastSeen: Date.now(), lastWrong: 0, seenCount: 2, lastRight: Date.now() }; return { id, text: JSON.stringify(p) }; });
    const bfile = path.join(require("os").tmpdir(), "ripasso-test-backup.txt"); fs.writeFileSync(bfile, extra.text);
    await page.setInputFiles("#progressFile", bfile); await pause(300);
    check("Load backup file (a .txt shared backup) merges its progress", await page.evaluate(id => progress.items[id] && progress.items[id].box === 4 && Object.keys(progress.items).length === 31, extra.id));
    check("…and says so", /Backup loaded/.test(await page.textContent("#sec-sync")));
    fs.unlinkSync(bfile);

    // A device that refuses to save
    await page.evaluate(() => { const set = Storage.prototype.setItem; window.__set = set; Storage.prototype.setItem = function (k, v) { if (k === "itapp.progress.v1") throw new Error("QuotaExceededError"); return set.call(this, k, v); }; S.screen = "home"; saveProgress(); render(); });
    check("if the device refuses to save, Today says so and offers a backup", !!(await page.$("#n-save")) && !!(await page.$('#n-save [data-act="backupNow"]')));
    await page.evaluate(() => { Storage.prototype.setItem = window.__set; saveProgress(); });
    check("…and the warning goes once saving works again", !(await page.$("#n-save")));
    check("the app asked the phone to protect its storage", typeof (await page.evaluate("S.persisted")) === "boolean");
    check("no script errors", !errors.length, errors.slice(0, 3).join("\n"));
    await ctx.close();

    /* 6. Inside claude.ai */
    section("6. Inside claude.ai none of this runs");
    {
      const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p2 = await c2.newPage();
      await p2.addInitScript(() => { window.claude = { use: async () => null }; });
      const hitsBefore = site.hits.length;
      await p2.goto(appUrl); await p2.waitForFunction(ready); await pause(500);
      check("no manifest link", !(await p2.$('link[rel="manifest"]')));
      check("no offline worker", await p2.evaluate(async () => !(await navigator.serviceWorker.getRegistration())));
      check("nothing else is fetched from the website", site.hits.slice(hitsBefore).every(h => h === BASE || h === BASE + "index.html"), site.hits.slice(hitsBefore).join(", "));
      const len = await p2.evaluate("history.length");
      await tap(p2, '.tab[data-go="units"]'); await tap(p2, '.tab[data-go="you"]');
      check("no history entries are added", (await p2.evaluate("history.length")) === len);
      await p2.evaluate(() => { localStorage.removeItem("itapp.backup.v1"); render(); });
      await tap(p2, '.tab[data-go="home"]');
      check("no welcome or backup cards on Today", !(await p2.$(".notice")));
      await c2.close();
    }
  } catch (e) {
    failures++;
    console.log("\n  FAIL the test itself stopped: " + (e && e.stack || e));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} check(s) failed.` : `\nAll ${results.length} checks passed.`);
  process.exit(failures ? 1 : 0);
})();
