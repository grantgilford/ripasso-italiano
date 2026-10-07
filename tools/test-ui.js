#!/usr/bin/env node
/*
  Interface test for index.html: the Ripasso look in docs/design-system.md.

  Usage:  node tools/test-ui.js [path/to/index.html] [--headed]

  Opens the real app in a headless browser (Playwright + Chromium), with some
  practice already saved, in light and dark at 390 × 844 and 360 × 740, and at
  325 px wide (a 390 px phone with text zoomed to 120%). It checks that:

    1. every screen is reachable by tapping: the tab bar, the Units filter, a
       unit's Lesson and Glossary, the section chips, the You rows (Stats,
       Settings, Your data at its sections), and the back arrows;
    2. there are no script errors and no requests outside the file (the fonts,
       icons and favicon are embedded);
    3. nothing is hidden behind the tab bar, nothing scrolls sideways, and every
       button, menu and text field is at least 44 × 44 px;
    4. a practice session hides the tab bar, and after Check the answer panel
       shows "Correct" or "Not quite" with its Continue button on screen;
    5. Appearance (Light / Dark / Auto) sets the colours, survives a reload and
       leaves saved progress untouched;
    6. the "Lo sapevi?" card keeps its tidbit across redraws, picks afresh on
       a new load, and steps aside when Today would not fit above the tab bar.

  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const HEADED = args.includes("--headed");
const file = path.resolve(args.find(a => !a.startsWith("--")) || path.join(__dirname, "..", "index.html"));

function loadPlaywright() {
  try { return require("playwright"); } catch (e) { }
  try { return require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch (e) { }
  console.error("Playwright is not installed. Install it with: npm install -g playwright");
  process.exit(2);
}
const { chromium } = loadPlaywright();

let failures = 0, total = 0;
function check(name, ok, detail) {
  total++;
  if (!ok) failures++;
  if (!ok || process.env.VERBOSE) console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${!ok && detail ? "\n         " + String(detail).replace(/\n/g, "\n         ") : ""}`);
}

function serve() {
  const html = fs.readFileSync(file);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/index.html")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); }
    else { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>blank</title>"); }
  });
  return new Promise(r => server.listen(0, "127.0.0.1", () => r(server)));
}

const ready = "typeof content !== 'undefined' && content && typeof S !== 'undefined' && S.screen === 'home'";
// Some saved practice, so every screen has something on it: units learned and under way, cards, verbs, mistakes, a streak, a flag.
function seedProgress() {
  const T = Date.now(), D = 864e5, items = {};
  const put = (id, box, extra) => { items[id] = Object.assign({ box, due: T + (box - 3) * D, lapses: 0, lastSeen: T - D, lastWrong: 0, seenCount: 4, lastRight: T - D }, extra || {}); };
  content.byUnit.u01.forEach(i => put(i.id, 6));
  for (const u of ["u02", "u03", "u04"]) content.byUnit[u].forEach((i, k) => put(i.id, k % 10 ? 5 : 2));
  content.byUnit.u05.forEach((i, k) => { if (k % 3 === 0) put(i.id, 1 + (k % 6)); });
  content.byUnit.fc01.slice(0, 200).forEach((i, k) => put(i.id, 1 + (k % 6)));
  content.byUnit.vb.slice(0, 40).forEach((i, k) => put(i.id, 1 + (k % 6)));
  Object.keys(items).slice(0, 6).forEach(id => { items[id].lastWrong = T - 3600e3; items[id].lastRight = 0; items[id].lapses = 2; });
  const days = {};
  for (let d = 0; d < 10; d++) days[dayKey(T - d * D)] = { xp: d ? 40 : 12, new: 5, t: { all: [20, 23] } };
  const flags = { "g-u01-02": { id: "g-u01-02", unit: "u01", exercise: "Grammar", prompt: "Sono can mean:", given: "", expected: "x", note: "", createdAt: T, updatedAt: T } };
  localStorage.setItem("itapp.progress.v1", JSON.stringify({ v: 2, items, days, flags, currentUnit: "u05", settings: defaultProgress().settings, updatedAt: T, settingsUpdatedAt: T }));
}

async function openApp(browser, origin, { width, height, scheme }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  const page = await context.newPage();
  page.errors = []; page.outside = [];
  page.on("pageerror", e => page.errors.push(String(e)));
  page.on("request", r => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")) page.outside.push(u); });
  await page.goto(origin + "/index.html");
  await page.waitForFunction(ready);
  await page.evaluate(seedProgress);
  await page.reload();
  await page.waitForFunction(ready);
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}
const screen = page => page.evaluate("S.screen");
async function tap(page, selector) { await page.click(selector); await page.waitForTimeout(60); }

// Layout rules that hold on every screen with a tab bar.
async function layout(page, label, { zoomOnly } = {}) {
  const r = await page.evaluate(() => {
    const out = { sideways: document.documentElement.scrollWidth > window.innerWidth + 1, hidden: "", small: [] };
    const bar = document.querySelector(".tabbar");
    window.scrollTo(0, document.documentElement.scrollHeight);
    if (bar) {
      const limit = bar.getBoundingClientRect().top + 0.5;
      const kids = [...app.children].filter(e => e !== bar && e.offsetParent !== null && !e.hidden);
      const last = kids[kids.length - 1];
      if (last && last.getBoundingClientRect().bottom > limit) out.hidden = (last.className || last.tagName) + ` ends at ${Math.round(last.getBoundingClientRect().bottom)}, tab bar starts at ${Math.round(limit)}`;
    }
    for (const el of app.querySelectorAll("button, select, input[type=text], textarea")) {
      if (el.offsetParent === null && !el.closest(".tabbar")) continue; // not shown (a closed section, a hidden file picker)
      const rc = el.getBoundingClientRect();
      if (rc.height < 43.5 || rc.width < 43.5) out.small.push(`${el.tagName.toLowerCase()} “${(el.textContent || el.getAttribute("aria-label") || el.id).trim().slice(0, 24)}” ${Math.round(rc.width)}×${Math.round(rc.height)}`);
    }
    window.scrollTo(0, 0);
    return out;
  });
  check(`${label}: nothing scrolls sideways`, !r.sideways);
  if (zoomOnly) return;
  check(`${label}: nothing is hidden behind the tab bar`, !r.hidden, r.hidden);
  check(`${label}: every control is at least 44 × 44 px`, !r.small.length, r.small.slice(0, 8).join("\n"));
}

async function tour(page, label, opts = {}) {
  const L = (s) => `${label} ${s}`;
  // Today
  check(L("Today is the first screen, with the Today tab current"), (await screen(page)) === "home" && await page.$('.tab[data-go="home"][aria-current="page"]'));
  check(L("Today has the Continue card and the four tiles"), await page.$('.hero[data-start="continue"]') && (await page.$$('.tile[data-start]')).length === 4 && await page.$('[data-start="wild"]'));
  await layout(page, L("Today"), opts);
  // Units, its filter and the unit screen
  await tap(page, '.tab[data-go="units"]');
  check(L("the Units tab opens Units"), (await screen(page)) === "units" && await page.$('.tab[data-go="units"][aria-current="page"]'));
  await layout(page, L("Units"), opts);
  await tap(page, '[data-useg="vocab"]');
  check(L("the Vocab filter lists the vocab packs"), (await page.$$eval(".ulist [data-ref]", es => es.map(e => e.dataset.ref))).every(id => /^fc/.test(id)));
  await tap(page, '[data-useg="verbs"]');
  check(L("the Verbs filter lists the Verbs unit"), (await page.$$eval(".ulist [data-ref]", es => es.map(e => e.dataset.ref))).join() === "vb");
  await tap(page, '[data-useg="grammar"]');
  check(L("the current unit's card has Practise and Read lesson"), await page.$('.ucard [data-unit="u05"]') && await page.$('.ucard [data-ref="u05"][data-tab="lesson"]'));
  await tap(page, '.ucard [data-ref="u05"]');
  check(L("Read lesson opens the unit's lesson, with Units still the current tab"), (await screen(page)) === "reference" && await page.$(".lesson") && await page.$('.tab[data-go="units"][aria-current="page"]'));
  const chips = await page.$$(".chips .chip"), secs = await page.$$(".lsec");
  check(L("there is one section chip per lesson section"), chips.length && chips.length === secs.length, `${chips.length} chips, ${secs.length} sections`);
  await tap(page, '.chips .chip[data-lsec="3"]'); await page.waitForTimeout(250);
  check(L("a section chip jumps to its section and is marked as the one in view"), await page.$('.chips .chip[data-lsec="3"][aria-current="true"]') && await page.evaluate(() => { const t = document.getElementById("lsec-3").getBoundingClientRect().top; return t > 0 && t < 260; }));
  await layout(page, L("Lesson"), opts);
  await tap(page, '[data-reftab="glossary"]');
  check(L("the Glossary tab shows the filter and the unit's items"), await page.$("#refFilter") && await page.$(".gloss"));
  await layout(page, L("Glossary"), opts);
  await tap(page, '.hdr .back[data-go="units"]');
  check(L("the back arrow returns to Units"), (await screen(page)) === "units");
  await tap(page, '.ulist [data-ref="u02"]');
  check(L("tapping a unit's card opens that unit"), (await screen(page)) === "reference" && (await page.evaluate("S.refUnit")) === "u02");
  check(L("another unit offers Make this my Continue unit"), await page.$('[data-setunit="u02"]'));
  // Rules and Look up
  await tap(page, '.tab[data-go="rules"]');
  check(L("the Rules tab opens Rules"), (await screen(page)) === "rules" && (await page.$$(".rule")).length > 10);
  await layout(page, L("Rules"), opts);
  await tap(page, '.tab[data-go="lookup"]');
  await page.fill("#lookupBox", "andare"); await page.waitForTimeout(100);
  check(L("Look up finds andare"), (await screen(page)) === "lookup" && (await page.$$(".hit")).length > 0);
  await layout(page, L("Look up"), opts);
  // You and its sub-screens
  await tap(page, '.tab[data-go="you"]');
  check(L("the You tab opens You"), (await screen(page)) === "you" && await page.$('[data-appearance="auto"]'));
  await layout(page, L("You"), opts);
  await tap(page, '.statcard[data-go="stats"]');
  check(L("the Stats card opens Stats, with You still the current tab"), (await screen(page)) === "stats" && await page.$('.tab[data-go="you"][aria-current="page"]'));
  await layout(page, L("Stats"), opts);
  await tap(page, '.hdr .back[data-go="you"]');
  await tap(page, '.srow[data-go="settings"]:not([data-to])');
  check(L("More settings opens Settings with all 13 options"), (await screen(page)) === "settings" && (await page.$$("select[data-set]")).length === 13);
  await layout(page, L("Settings"), opts);
  await tap(page, '.hdr .back[data-go="you"]');
  await tap(page, '.srow[data-to="sec-flags"]');
  check(L("Flagged items opens Your data at the flagged items"), (await screen(page)) === "data" && await page.evaluate(() => { const t = document.getElementById("sec-flags").getBoundingClientRect().top; return t >= -1 && t < 100; }));
  check(L("Your data keeps backup, import and Reset all progress"), await page.$('[data-act="exportProgress"]') && await page.$('[data-act="importProgress"]') && await page.$('[data-act="reset"]'));
  await layout(page, L("Your data"), opts);
  await tap(page, '.hdr .back[data-go="you"]');
  await tap(page, '.srow[data-to="sec-packs"]');
  check(L("Content packs opens Your data with the packs section open"), (await screen(page)) === "data" && await page.evaluate(() => document.getElementById("sec-packs").open));
  await tap(page, '.tab[data-go="home"]');
  check(L("the Today tab returns to Today"), (await screen(page)) === "home");
  // A practice session and its answer panel
  await tap(page, '.hero[data-start="continue"]');
  check(L("Continue starts a session with no tab bar"), (await screen(page)) === "session" && !(await page.$(".tabbar")));
  for (let step = 0; step < 4; step++) {
    const mode = await page.evaluate(() => current().ex.mode);
    if (mode === "typed") { await page.fill("#answer", "zzzz"); await tap(page, '[data-act="check"]'); }
    else if (mode === "options") { const wrong = await page.evaluate(() => { const ex = current().ex; return ex.options.find(o => o !== ex.correct); }); await page.click(`[data-opt="${wrong.replace(/["\\]/g, "\\$&")}"]`); }
    else if (mode === "vintro") { await tap(page, '[data-act="introDone"]'); continue; }
    else if (mode === "flip") { await tap(page, '[data-act="reveal"]'); await tap(page, '[data-act="missed"]'); }
    else await page.evaluate(() => finishAnswer(false, "", ""));
    await page.waitForTimeout(450);
    const p = await page.evaluate(() => { const fb = document.querySelector(".fb"), c = document.querySelector('.fb [data-act="continue"]'); if (!fb || !c) return null; const r = c.getBoundingClientRect(); return { title: fb.querySelector(".fb-title").textContent, onScreen: r.top >= 0 && r.bottom <= window.innerHeight + 0.5, icon: !!fb.querySelector(".fb-icon svg") }; });
    check(L(`after Check (${mode}) the answer panel shows its heading and icon, with Continue on screen`), p && /^(Not quite|Correct|Marked as missed)$/.test(p.title) && p.icon && p.onScreen, JSON.stringify(p));
    await tap(page, '[data-act="continue"]');
    if ((await screen(page)) !== "session") break;
  }
  if ((await screen(page)) === "session") { await tap(page, '[data-go="quit"]'); }
  else await tap(page, '[data-go="home"]');
  check(L("leaving a session returns to Today with the tab bar"), (await screen(page)) === "home" && await page.$(".tabbar"));
}

(async () => {
  const server = await serve();
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    console.log(`Interface test for ${path.relative(process.cwd(), file) || file}`);
    const sizes = [[390, 844, "light"], [390, 844, "dark"], [360, 740, "light"], [360, 740, "dark"]];
    for (const [width, height, scheme] of sizes) {
      const { page, context } = await openApp(browser, origin, { width, height, scheme });
      const label = `${width}×${height} ${scheme}:`;
      await tour(page, label);
      check(`${label} no script errors`, !page.errors.length, page.errors.slice(0, 3).join("\n"));
      check(`${label} nothing is loaded from outside the file`, !page.outside.length, page.outside.slice(0, 3).join("\n"));
      await context.close();
      console.log(`  ${label} toured every screen`);
    }
    { // a 390 px phone with text at 120%
      const { page, context } = await openApp(browser, origin, { width: 325, height: 703, scheme: "light" });
      await tour(page, "120% text:", { zoomOnly: true });
      check("120% text: no script errors", !page.errors.length, page.errors.slice(0, 3).join("\n"));
      await context.close();
      console.log("  120% text: toured every screen");
    }

    /* Appearance */
    {
      const { page, context } = await openApp(browser, origin, { width: 390, height: 844, scheme: "light" });
      const progressBefore = await page.evaluate(() => localStorage.getItem("itapp.progress.v1"));
      const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check("Appearance: Auto is the default and follows the phone", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === null && (await bg()) === "rgb(243, 246, 244)");
      await tap(page, '.tab[data-go="you"]');
      await tap(page, '[data-appearance="dark"]');
      check("Appearance: Dark switches to the dark colours", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark" && (await bg()) === "rgb(14, 21, 18)" && await page.$('[data-appearance="dark"][aria-pressed="true"]'));
      check("Appearance: the choice is kept in itapp.theme.v1 on this device", (await page.evaluate(() => localStorage.getItem("itapp.theme.v1"))) === '"dark"');
      await page.reload(); await page.waitForFunction(ready);
      check("Appearance: Dark survives a reload, with the browser bar colour to match", (await bg()) === "rgb(14, 21, 18)" && (await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].every(m => m.content === "#0E1512"))));
      await tap(page, '.tab[data-go="you"]');
      await tap(page, '[data-appearance="light"]');
      check("Appearance: Light switches back to the light colours", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light" && (await bg()) === "rgb(243, 246, 244)");
      await tap(page, '[data-appearance="auto"]');
      check("Appearance: Auto hands the choice back to the phone", (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === null && (await page.evaluate(() => localStorage.getItem("itapp.theme.v1"))) === '"auto"');
      check("Appearance: saved progress is untouched", (await page.evaluate(() => localStorage.getItem("itapp.progress.v1"))) === progressBefore);
      check("Appearance: it is not part of progress, so it never syncs", !(await page.evaluate(() => JSON.stringify(progress))).includes("theme"));
      check("Appearance: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
      console.log("  Appearance checked");
    }

    /* The "Lo sapevi?" card */
    {
      const { page, context } = await openApp(browser, origin, { width: 390, height: 1000, scheme: "light" });
      const tip = () => page.evaluate(() => { const c = document.getElementById("tipcard"); return c ? { text: c.querySelector("p").textContent, hidden: c.hidden } : null; });
      const first = await tip();
      check("Lo sapevi?: the card shows on a tall screen", first && !first.hidden && first.text.length > 3, JSON.stringify(first));
      check("Lo sapevi?: the tidbit is short (140 characters at most)", first && first.text.length <= 140, first && first.text);
      await tap(page, '.tab[data-go="units"]'); await tap(page, '.tab[data-go="home"]');
      await page.evaluate(() => { render(); render(); });
      check("Lo sapevi?: the same tidbit after leaving Today and redrawing", first && (await tip()).text === first.text);
      const seen = new Set([first && first.text]);
      for (let n = 0; n < 4; n++) { await page.reload(); await page.waitForFunction(ready); const t = await tip(); if (t) seen.add(t.text); }
      check("Lo sapevi?: a new load picks a new tidbit", seen.size > 1, [...seen].join(" | "));
      await page.setViewportSize({ width: 360, height: 560 }); await page.waitForTimeout(150);
      const small = await page.evaluate(() => { const c = document.getElementById("tipcard"), bar = document.querySelector(".tabbar"); return { hidden: !c || c.hidden, fits: !c || c.hidden || c.getBoundingClientRect().bottom <= window.innerHeight - bar.offsetHeight }; });
      check("Lo sapevi?: on a short screen the card steps aside", small.hidden, JSON.stringify(small));
      await page.setViewportSize({ width: 390, height: 1000 }); await page.waitForTimeout(150);
      check("Lo sapevi?: it comes back when there is room again", !(await tip()).hidden);
      check("Lo sapevi?: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
      console.log("  Lo sapevi? checked");
    }
  } catch (e) {
    failures++;
    console.log("\n  FAIL the test itself stopped: " + (e && e.stack || e));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failures ? `\n${failures} of ${total} check(s) failed.` : `\nAll ${total} checks passed.`);
  process.exit(failures ? 1 : 0);
})();
