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
       choosing a unit: tapping any unit's card on Units opens it in place
       with Practise and Read lesson (one open at a time, the tapped card
       staying put and clear of the tab bar), and Practise makes a grammar
       unit the current unit, so Today's Continue card follows the unit
       practised last; a unit's last new items move it on to the next;
    2. there are no script errors and no requests outside the file (the fonts,
       icons and favicon are embedded);
    3. nothing is hidden behind the tab bar, nothing scrolls sideways, and every
       button, menu and text field is at least 44 × 44 px;
    4. a practice session hides the tab bar, and after Check the answer panel
       shows "Correct" or "Not quite" with its Continue button on screen;
    5. Appearance (Light / Dark / Auto) sets the colours, survives a reload and
       leaves saved progress untouched;
    6. the "Lo sapevi?" card keeps its tidbit across redraws, picks afresh on
       a new load, and steps aside when Today would not fit above the tab bar;
    7. there is room above the keyboard: at Pixel 8 size (412 × 915) the
       exercise type sits in the session's top row, the answer box says "Your
       answer" inside it, and Don't know and Check end within the top 460 px
       (about what the phone leaves above its keyboard) on at least 95% of
       typed questions;
    8. read aloud, with a stand-in for the phone's voices: the speakers in the
       lessons, glossary, verb tables, Look up, Today and a practice session
       read their Italian with the Italian voice; a prompt's speaker reads only
       Italian the prompt already shows, never the answer (checked on every
       item), and the answer panel's only Italian from the item; tapping a
       speaker keeps the answer field focused; a second tap or leaving the
       screen stops it; Off · Normal · Slow is kept per device and leaves
       progress untouched; and with no Italian voice, or no speech at all, the
       speakers are hidden or never drawn and You says why;
    9. the exercise types added in v8.6 (docs/exercise-types.md) work by tapping
       and typing in light and dark at 360 px and at 120% text: Spot the
       mistake (a right word tapped, the wrong word tapped and typed right, No
       mistake), Sort the words, Match the pairs, Choose / Write the reply,
       Complete the endings (Enter moves between blanks), Listen and type (Play,
       Slow, and Can't listen now, which costs nothing) and Make it plural, each
       with the 44 px and no-sideways-scroll rules and the right answer panel.

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

async function openApp(browser, origin, { width, height, scheme, init, touch }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, hasTouch: !!touch });
  if (init) await context.addInitScript(init);
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
const listedUnits = page => page.$$eval(".ulist > *", es => es.map(e => e.dataset.upick || e.querySelector("[data-unit]")?.dataset.unit)); // the units on Units, in order
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
  const vocab = await listedUnits(page);
  check(L("the Vocab filter lists the vocab packs"), vocab.length && vocab.every(id => /^fc/.test(id)), vocab.join());
  await tap(page, '[data-useg="verbs"]');
  check(L("the Verbs filter lists the Verbs unit"), (await listedUnits(page)).join() === "vb");
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
  await tap(page, '.ulist [data-upick="u02"]');
  check(L("tapping another unit's card opens it in place, with Practise and Read lesson"), (await screen(page)) === "units" && (await page.$$(".ucard")).length === 1 && await page.$('.ucard [data-unit="u02"]') && await page.$('.ucard [data-ref="u02"][data-tab="lesson"]'));
  await layout(page, L("Units, another card open"), opts);
  await tap(page, '.ucard [data-ref="u02"]');
  check(L("its Read lesson opens that unit"), (await screen(page)) === "reference" && (await page.evaluate("S.refUnit")) === "u02");
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

/* ---------- the exercise types added in v8.6 ---------- */
// Each one is put in front of the learner as a one-item session and answered right and wrong by tapping
// and typing, in light and dark at 360 px and with text at 120% (325 px wide), with a stand-in Italian voice.
async function newTypes(browser, origin) {
  for (const [width, height, scheme, label] of [[360, 740, "light", "360×740 light"], [360, 740, "dark", "360×740 dark"], [325, 703, "light", "120% text"]]) {
    const L = (t) => `New types, ${label}: ${t}`;
    const { page, context } = await openApp(browser, origin, { width, height, scheme, init: fakeSpeech(VOICES) });
    const one = (id, box = 0, how = null) => page.evaluate(([id, box, how]) => { // how: "listen" or "plural" builds that drill directly
      const item = content.items[id], r = { box, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 0 };
      const ex = how === "listen" ? listenDrill({ item, note: "" }, item) : how === "plural" ? pluralDrill({ item, note: "" }, item) : makeExercise(item, r);
      session = { kind: "unit", queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
      S.screen = "session"; S.feedback = null; S.retry = null; resetExState(); render(); window.scrollTo(0, 0);
      return { mode: ex.mode, at: ex.at, fix: ex.fix, accepted: ex.accepted, order: ex.order, n: item.pairs ? item.pairs.length : 0, rows: item.rows ? item.rows.map(r => item.groups.indexOf(r.group)) : [] };
    }, [id, box, how]);
    const panel = async () => { await page.waitForTimeout(450); return page.evaluate(() => { const fb = document.querySelector(".fb"), c = document.querySelector('.fb [data-act="continue"]'); if (!fb || !c) return null; const r = c.getBoundingClientRect(); return { title: fb.querySelector(".fb-title").textContent, onScreen: r.top >= 0 && r.bottom <= window.innerHeight + 0.5, text: fb.textContent.replace(/\s+/g, " ") }; }); };
    const ok = (p, title) => !!p && p.title === title && p.onScreen;

    // Spot the mistake: a correct word tapped, then the wrong word tapped and typed right, and No mistake
    let ex = await one("sp-u01-z01", 2);
    await layout(page, L("Spot the mistake"));
    await tap(page, '[data-spot="0"]');
    let p = await panel();
    check(L("Spot the mistake: tapping a word that is right gives Not quite, and says it was right"), ok(p, "Not quite") && /You tapped anna/i.test(p.text), JSON.stringify(p));
    ex = await one("sp-u01-z01", 2);
    await tap(page, `[data-spot="${ex.at}"]`);
    check(L("Spot the mistake: tapping the wrong word asks for the right one"), await page.$("#answer") && /Replace\s+stanco\s+with/.test(await page.textContent(".field")));
    await layout(page, L("Spot the mistake, typing the fix"));
    await page.fill("#answer", "stanca"); await page.press("#answer", "Enter");
    p = await panel();
    check(L("Spot the mistake: typing it right, with Enter, gives Correct and the corrected sentence"), ok(p, "Correct") && /Anna è stanca/.test(p.text), JSON.stringify(p));
    await one("sp-u01-z13", 0); await tap(page, '[data-act="nomistake"]'); p = await panel();
    check(L("Spot the mistake: No mistake on a right sentence gives Correct"), ok(p, "Correct"), JSON.stringify(p));
    await one("sp-u01-z06", 0); await tap(page, '[data-act="nomistake"]'); p = await panel();
    check(L("Spot the mistake: No mistake on a wrong sentence gives Not quite, naming the mistake"), ok(p, "Not quite") && /You chose No mistake/.test(p.text), JSON.stringify(p));

    // Sort the words
    ex = await one("so-u02-z01");
    await layout(page, L("Sort the words"));
    check(L("Sort the words: Check waits until every word has a group"), await page.$eval('[data-act="checkSort"]', b => b.disabled));
    for (const ri of ex.order) await tap(page, `[data-sort="${ri}:${ex.rows[ri]}"]`);
    await tap(page, '[data-act="checkSort"]'); p = await panel();
    check(L("Sort the words: all right gives Correct"), ok(p, "Correct"), JSON.stringify(p));
    ex = await one("so-u02-z01");
    for (const ri of ex.order) await tap(page, `[data-sort="${ri}:${ri === ex.order[0] ? (ex.rows[ri] + 1) % 4 : ex.rows[ri]}"]`);
    await tap(page, '[data-act="checkSort"]'); p = await panel();
    check(L("Sort the words: one wrong gives Not quite, with every row's right group marked and the reason"), ok(p, "Not quite") && (await page.$$(".sortseg .right")).length === ex.order.length && (await page.$$(".sortseg .wrong")).length === 1 && /, not /.test(p.text), JSON.stringify(p));

    // Match the pairs
    ex = await one("ma-u01-z01");
    await layout(page, L("Match the pairs"));
    await tap(page, '[data-match="L0"]'); await tap(page, '[data-match="R1"]');
    check(L("Match the pairs: a wrong pair is marked, with a cross"), (await page.$$(".mchip.bad")).length === 2 && (await page.$$(".mchip.bad .smark")).length === 2);
    for (let i = 0; i < ex.n; i++) { await tap(page, `[data-match="L${i}"]`); await tap(page, `[data-match="R${i}"]`); }
    p = await panel();
    check(L("Match the pairs: after a slip, finishing gives Not quite, naming the slip, with every pair numbered"), ok(p, "Not quite") && /You matched io with sei/.test(p.text) && (await page.$$(".mchip .mn")).length === 2 * ex.n, JSON.stringify(p));
    ex = await one("ma-u01-z01");
    for (let i = ex.n - 1; i >= 0; i--) { await tap(page, `[data-match="R${i}"]`); await tap(page, `[data-match="L${i}"]`); }
    p = await panel();
    check(L("Match the pairs: matching all, from either side, gives Correct"), ok(p, "Correct"), JSON.stringify(p));

    // Replies: choose at first, written later (a subject pronoun may be added)
    ex = await one("re-u01-z01", 0);
    check(L("Reply: a new one offers the replies to choose from"), ex.mode === "options" && (await page.$$("[data-opt]")).length === 4);
    await layout(page, L("Choose the reply"));
    await page.click('[data-opt="Si chiama Anna."]'); p = await panel();
    check(L("Reply: a wrong choice gives Not quite with its note"), ok(p, "Not quite") && /You chose Si chiama Anna/.test(p.text), JSON.stringify(p));
    ex = await one("re-u01-z01", 3);
    await page.fill("#answer", "Io mi chiamo Anna"); await page.press("#answer", "Enter"); p = await panel();
    check(L("Reply: a written reply with the subject pronoun added gives Correct"), ex.mode === "typed" && ok(p, "Correct"), JSON.stringify(p));

    // Complete the endings
    ex = await one("en-u01-z01", 1);
    await layout(page, L("Complete the endings"));
    check(L("Endings: the first blank has the focus"), (await page.evaluate(() => document.activeElement && document.activeElement.id)) === "fld0");
    await page.keyboard.type("e"); await page.keyboard.press("Enter");
    check(L("Endings: Enter moves to the next blank"), (await page.evaluate(() => document.activeElement && document.activeElement.id)) === "fld1");
    await page.keyboard.type("he"); await page.keyboard.press("Enter"); p = await panel();
    check(L("Endings: all right gives Correct, and the panel reads the whole sentence"), ok(p, "Correct") && (await page.$eval(".fb-head [data-say]", b => b.dataset.say)) === "Le ragazze sono stanche.", JSON.stringify(p));
    await one("en-u01-z01", 1);
    await page.fill("#fld0", "e"); await page.fill("#fld1", "e"); await tap(page, '[data-act="checkFields"]'); p = await panel();
    check(L("Endings: a wrong ending gives Not quite, with the right one beside it"), ok(p, "Not quite") && (await page.$$(".fldfix")).length === 1, JSON.stringify(p));

    // Listen and type, and Can't listen now
    ex = await one("s-u01-01", 3, "listen");
    await layout(page, L("Listen and type"));
    await page.evaluate(() => { window.__said.length = 0; });
    await tap(page, ".listen .say"); await page.waitForTimeout(100); await tap(page, ".listen .slowbtn"); await page.waitForTimeout(400); // a new utterance starts 80 ms after the one it stops
    const heard = await page.evaluate(() => window.__said.slice());
    check(L("Listen and type: Play reads the sentence, Slow reads it slowly"), heard.length >= 2 && heard[0].text === "Sono stanco." && heard[heard.length - 1].rate === 0.65 && heard[0].rate !== 0.65, JSON.stringify(heard));
    const before = await page.evaluate(() => JSON.stringify(progress.items[pid("s-u01-01")] || null));
    await tap(page, '[data-act="noListen"]');
    const swapped = await page.evaluate(() => ({ listen: !!current().ex.listen, id: current().ex.item.id, no: session.noListen }));
    check(L("Listen and type: Can't listen now swaps it for another exercise on the same item, at no cost"), !swapped.listen && swapped.id === "s-u01-01" && swapped.no && before === await page.evaluate(() => JSON.stringify(progress.items[pid("s-u01-01")] || null)), JSON.stringify(swapped));
    ex = await one("s-u01-01", 3, "listen");
    await page.fill("#answer", "sono stanco"); await page.press("#answer", "Enter"); p = await panel();
    check(L("Listen and type: typing what was heard gives Correct, with the meaning"), ok(p, "Correct"), JSON.stringify(p));

    // Make it plural / singular
    ex = await one("v-u02-x-dito", 3, "plural");
    await layout(page, L("Make it plural"));
    await page.fill("#answer", ex.accepted[0]); await page.press("#answer", "Enter"); p = await panel();
    check(L("Plural drill: the right form gives Correct"), ok(p, "Correct"), JSON.stringify(p));
    ex = await one("v-u02-x-dito", 3, "plural");
    await page.fill("#answer", "i diti"); await page.press("#answer", "Enter"); p = await panel();
    check(L("Plural drill: a wrong form gives Not quite, with the noun's forms"), ok(p, "Not quite") && /il dito · un dito · le dita/.test(p.text), JSON.stringify(p));

    check(L("no script errors"), !page.errors.length, page.errors.join("\n"));
    await context.close();
  }
  console.log("  New exercise types checked");
}

/* ---------- read aloud ---------- */
// A stand-in for the phone's speech, run in the page before the app: it lists the given voices, plays each
// utterance for 300 ms in turn, and records what was read (window.__said) and how often it was stopped.
function fakeSpeech(voices) {
  if (voices === null) return `Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true }); window.SpeechSynthesisUtterance = undefined;`;
  return `(() => {
    const voices = ${JSON.stringify(voices)}, said = window.__said = [], queue = [];
    let cur = null, timer = 0;
    const next = () => {
      cur = queue.shift() || null; fake.speaking = !!cur; fake.pending = queue.length > 0;
      if (!cur) return;
      said.push({ text: cur.text, lang: cur.lang, rate: cur.rate, voice: cur.voice ? cur.voice.name : null });
      timer = setTimeout(() => { const u = cur; next(); if (u.onend) u.onend({}); }, 300);
    };
    const fake = { speaking: false, pending: false, paused: false, cancels: 0,
      getVoices: () => voices.map(v => Object.assign({ localService: true, default: false, voiceURI: v.name }, v)),
      speak(u) { queue.push(u); if (!cur) next(); else fake.pending = true; },
      cancel() { fake.cancels++; clearTimeout(timer); const was = [cur].concat(queue.splice(0)).filter(Boolean); cur = null; fake.speaking = fake.pending = false; was.forEach(u => u.onerror && u.onerror({ error: "interrupted" })); },
      resume() { }, pause() { }, addEventListener() { }, removeEventListener() { } };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; this.lang = ""; this.rate = 1; this.voice = null; };
  })();`;
}
const VOICES = [{ name: "English (test)", lang: "en-GB" }, { name: "Italiano (test)", lang: "it-IT" }];

async function readAloud(browser, origin) {
  const said = (page) => page.evaluate(() => window.__said.slice());
  const clearSaid = (page) => page.evaluate(() => { window.__said.length = 0; });
  const visible = (page, sel) => page.$$eval(sel, es => es.filter(e => e.offsetParent !== null).length);
  const { page, context } = await openApp(browser, origin, { width: 390, height: 844, scheme: "light", init: fakeSpeech(VOICES), touch: true });
  const speakerText = (sel) => page.$eval(sel, b => b.dataset.say);
  const parts = (t) => page.evaluate(t => speakable(t), t);

  // Today, the lesson, its dialogue and its "wrong → right" pairs
  check("Read aloud: the Lo sapevi? card has a speaker for its Italian", await page.$("#tipcard .tip-h [data-say]"));
  await page.evaluate(() => { S.refUnit = "u01"; S.refTab = "lesson"; S.screen = "reference"; render(); });
  const lex = await page.$$eval(".lex > div", ds => ds.map(d => ({ it: d.querySelector(".lit").textContent.trim(), say: !!d.querySelector(".lit [data-say]") })));
  check("Read aloud: every lesson example has a speaker", lex.length && lex.every(x => x.say), `${lex.filter(x => !x.say).length} of ${lex.length} without`);
  check("Read aloud: every dialogue has Listen to the dialogue, and a speaker on each line", (await page.$$(".dlg")).length && (await page.$$eval(".dlg", ds => ds.every(d => d.querySelector(".dlg-all") && [...d.querySelectorAll(".lit")].every(l => l.querySelector("[data-say]"))))));
  check("Read aloud: the right version of each “wrong → right” pair has a speaker, the wrong one none", (await page.$$eval(".lfix .fx", fs => fs.length && fs.every(f => f.querySelector(".yes [data-say]") && !f.querySelector(".no [data-say]")))));
  await page.locator(".lex .lit [data-say]").first().scrollIntoViewIfNeeded();
  const first = await page.$eval(".lex .lit [data-say]", b => speakable(b.dataset.say));
  await clearSaid(page); await page.tap(".lex .lit [data-say]");
  let s1 = await said(page);
  check("Read aloud: a lesson example is read in Italian, with the Italian voice, at Normal speed", first.join() === lex[0].it && s1.length === 1 && s1[0].text === lex[0].it && s1[0].lang === "it-IT" && s1[0].voice === "Italiano (test)" && s1[0].rate === 0.9, JSON.stringify(s1) + " / " + lex[0].it);
  check("Read aloud: the speaker that is playing shows it", await page.$(".lex .lit [data-say].on"));
  await page.waitForTimeout(400);
  check("Read aloud: …and goes back to the speaker when it ends", !(await page.$(".lex .lit [data-say].on")));
  const lines = await page.$eval(".dlg", d => [...d.querySelectorAll(".lit [data-say]")].flatMap(b => speakable(b.dataset.say)));
  await page.locator(".dlg-all").first().scrollIntoViewIfNeeded();
  await clearSaid(page); await page.tap(".dlg-all");
  check("Read aloud: Listen to the dialogue reads it line by line and offers Stop", (await page.$(".dlg-all.on")) && (await page.$eval(".dlg-all.on .lbl-stop", e => e.offsetParent !== null)));
  await page.waitForTimeout(700);
  const cancels = await page.evaluate(() => speechSynthesis.cancels);
  await page.tap(".dlg-all");
  s1 = await said(page);
  check("Read aloud: the lines come in order, and a second tap stops them", s1.length >= 2 && s1.length < lines.length && s1.every((x, i) => x.text === lines[i]) && (await page.evaluate(() => speechSynthesis.cancels)) > cancels && !(await page.$(".dlg-all.on")) && !(await page.evaluate(() => speechSynthesis.speaking)), JSON.stringify(s1.map(x => x.text)) + "\n" + JSON.stringify(lines));
  await page.tap(".dlg-all"); await page.waitForTimeout(100);
  await page.evaluate(() => { S.refTab = "glossary"; render(); });
  check("Read aloud: switching to another screen stops the reading", !(await page.evaluate(() => speechSynthesis.speaking || !!sayNow)));

  // the glossary, verb tables and Look up
  await page.evaluate(() => { S.refUnit = "u02"; S.refTab = "glossary"; render(); });
  const nouns = await page.$$eval(".gloss td.it", ts => ts.map(t => ({ text: t.firstChild.textContent.trim(), say: t.querySelector("[data-say]") && t.querySelector("[data-say]").dataset.say })));
  check("Read aloud: every glossary word has a speaker reading the word beside it", nouns.length > 20 && nouns.every(n => n.say === n.text), JSON.stringify(nouns.filter(n => n.say !== n.text).slice(0, 3)));
  await page.evaluate(() => { S.refUnit = "u03"; render(); });
  await clearSaid(page); await page.evaluate(() => document.querySelector(".conj > .say").click());
  const table = (await said(page)).map(x => x.text);
  await page.waitForTimeout(2000);
  const all = (await said(page)).map(x => x.text);
  check("Read aloud: a verb table is read one person at a time (io …, tu …)", table.length === 1 && /^io \S/.test(table[0]) && all.length === 6 && /^tu \S/.test(all[1]), all.join(" | "));
  await page.evaluate(() => { S.refUnit = "vb"; render(); });
  const cmd = await page.evaluate(() => { const d = document.createElement("div"); d.innerHTML = vgTableHtml(vgItem("andare", "imperativo"), "imperativo"); const b = d.querySelector(".conj > .say"); return b && speakable(conjRead(b)).join(" | "); });
  check("Read aloud: in the Verbs section, commands are read bare (va', vada, andiamo…, no “tu va'”)", cmd === "va' | vada | andiamo | andate | vadano", cmd);
  const subj = await page.evaluate(() => { const b = [...document.querySelectorAll(".conj > .say")].find(x => /^che io /.test(conjRead(x))); return b && conjRead(b); });
  check("Read aloud: the subjunctive is read in its che clause (che io …)", !!subj, subj);
  await page.evaluate(() => { S.screen = "lookup"; S.lookup = "libro"; render(); });
  check("Read aloud: Look up results have speakers", (await page.$$(".hit [data-say]")).length > 0);

  // a practice session: the prompt's speaker, the answer field keeps the focus, the answer panel
  await page.evaluate(() => { progress.settings.fcDir = "it-en"; startSession("unit", "fc01"); });
  let ex = await page.evaluate(() => ({ say: current().ex.say, it: arr(current().ex.item.it)[0], mode: current().ex.mode }));
  check("Read aloud: a flashcard showing the Italian has a speaker for it", ex.say === ex.it && await page.$(".prompt-card [data-say]"), JSON.stringify(ex));
  await page.fill("#answer", "abc");
  await clearSaid(page); await page.tap(".prompt-card [data-say]");
  check("Read aloud: tapping it reads the word and leaves the answer field focused, with what was typed", (await said(page)).map(x => x.text).join() === ex.it && (await page.evaluate(() => document.activeElement && document.activeElement.id)) === "answer" && (await page.inputValue("#answer")) === "abc");
  await page.click(".prompt-card [data-say]");
  check("Read aloud: …with a mouse too", (await page.evaluate(() => document.activeElement && document.activeElement.id)) === "answer");
  await page.click('[data-act="check"]'); await page.waitForTimeout(400);
  const fbSay = await speakerText(".fb-head [data-say]").catch(() => null);
  check("Read aloud: the answer panel has a speaker for the Italian", fbSay === ex.it, fbSay);
  await clearSaid(page); await page.tap(".fb-head [data-say]");
  check("Read aloud: …and Continue keeps the focus, so Enter still moves on", (await said(page)).length === 1 && (await page.evaluate(() => document.activeElement && document.activeElement.dataset.act)) === "continue");
  await page.evaluate(() => { session = null; S.feedback = null; S.screen = "home"; render(); });

  // every item: a prompt reads only Italian it shows; the answer panel only Italian from the item itself
  const r = await page.evaluate(() => {
    const text = (h) => { const d = document.createElement("div"); d.innerHTML = String(h || "").replace(/</g, " <"); return normalize(d.textContent); };
    const words = (x) => normalize(x).replace(/'/g, "' ").split(" ").filter(Boolean); // l'amico is l' + amico
    const dataWords = (item, ex) => {
      const own = [item, ex.noun].filter(Boolean).flatMap(i => [i.it, i.forms, i.allForms, i.plural, i.art, i.indef, i.artPl, i.answer, i.alt, i.cloze && i.cloze.text,
        i.fix, i.line, i.type === "endings" ? endingsFull(i) : null, i.rows && i.rows.map(r => [r.it, r.say]), i.pairs && i.pairs.map(p => i.right === "en" ? p[0] : p)]) // the v8.6 types
        .concat(item.type === "prep" ? [PREP_TABLE[item.it]] : []); // a preposition's merged forms (della, nello…) come from the app's table
      return new Set(words(JSON.stringify(own).replace(/[{}|]/g, " ")).concat(["io", "tu", "lui", "lei", "noi", "voi", "loro", "che"]));
    };
    const keep = [progress.settings.fcDir, progress.settings.flipDir], bad = [], typesRead = new Set();
    let n = 0, prompts = 0, panels = 0, listens = 0;
    for (const [fcDir, flipDir] of [["it-en", "IT→EN"], ["en-it", "EN→IT"]]) {
      progress.settings.fcDir = fcDir; progress.settings.flipDir = flipDir;
      for (const item of Object.values(content.items)) for (const box of [0, 1, 3]) for (let k = 0; k < 2; k++) {
        const ex = makeExercise(item, { box, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 0 }); if (!ex) continue;
        n++;
        const where = `${item.id} (${ex.type})`;
        if (ex.say) {
          prompts++; typesRead.add(ex.typeKey);
          if (/^<span class="en">/.test(ex.promptHtml)) bad.push(`${where}: the prompt is English but has a speaker`);
          for (const x of speakable(ex.say)) if (!text(ex.promptHtml).includes(normalize(x))) bad.push(`${where}: reads “${x}”, the prompt shows “${text(ex.promptHtml)}”`);
        }
        for (const x of speakable(ex.sayBack || "")) if (!text(ex.backHtml).includes(normalize(x))) bad.push(`${where}: the back reads “${x}”, it shows “${text(ex.backHtml)}”`);
        if (ex.listen) { // Listen and type: the one prompt that plays Italian it doesn't show, and it must be the sentence itself
          listens++;
          if (ex.say) bad.push(`${where}: a listening exercise also has the ordinary prompt speaker`);
          if (ex.listen !== arr(item.it)[0]) bad.push(`${where}: plays “${ex.listen}”, not the item's first sentence`);
          if (text(ex.promptHtml).includes(normalize(ex.listen))) bad.push(`${where}: the sentence to type is shown`);
          if (!/data-say=/.test(ex.promptHtml) || !/data-rate="slow"/.test(ex.promptHtml)) bad.push(`${where}: a listening exercise needs its play and slow buttons`);
        }
        const a = sayAnswerOf(ex, { ok: true });
        if (ex.typeKey === "grammar") { if (a) bad.push(`${where}: a rule question's answer is read`); continue; }
        if (!speakable(a).length) { if (ex.mode !== "vintro") bad.push(`${where}: the answer panel has no speaker`); continue; }
        panels++;
        const own = dataWords(item, ex), stray = speakable(a).flatMap(words).filter(w => !own.has(w));
        if (stray.length) bad.push(`${where}: the panel reads “${stray.join(" ")}”, not in the item`);
      }
    }
    [progress.settings.fcDir, progress.settings.flipDir] = keep;
    return { n, prompts, panels, listens, types: [...typesRead].sort().join(", "), bad: [...new Set(bad)] };
  });
  check(`Read aloud: of ${r.n} exercises built from every item, ${r.prompts} prompts read only the Italian they show and ${r.panels} answer panels read only the item's Italian`, !r.bad.length && r.prompts > 1000 && r.panels > 10000, r.bad.slice(0, 8).join("\n") + (r.bad.length > 8 ? `\n… ${r.bad.length} in all` : ""));
  check(`Read aloud: ${r.listens} Listen and type exercises play the item's own sentence, without showing it`, r.listens > 100, "no listening exercises were built, though the stand-in voice is Italian");
  if (process.env.VERBOSE) console.log("         prompts with a speaker: " + r.types);

  // the setting: Off · Normal · Slow
  const progressBefore = await page.evaluate(() => localStorage.getItem("itapp.progress.v1"));
  await tap(page, '.tab[data-go="you"]');
  check("Read aloud: You has Off · Normal · Slow, with Normal chosen", await page.$('[data-audio="normal"][aria-pressed="true"]') && await page.$('[data-audio="off"]') && await page.$('[data-audio="slow"]') && !(await page.$("#readaloud-row .srow-hint")));
  await clearSaid(page); await tap(page, '[data-audio="slow"]');
  s1 = await said(page);
  check("Read aloud: choosing Slow reads a sample, slowly, and is kept in itapp.audio.v1", s1.length === 1 && s1.every(x => x.rate === 0.65) && (await page.evaluate(() => localStorage.getItem("itapp.audio.v1"))) === '"slow"', JSON.stringify(s1));
  await page.reload(); await page.waitForFunction(ready);
  await page.evaluate(() => { S.refUnit = "u01"; S.refTab = "lesson"; S.screen = "reference"; render(); });
  await clearSaid(page); await page.evaluate(() => document.querySelector(".lex .lit [data-say]").click());
  check("Read aloud: Slow survives a reload and slows every speaker", (await said(page)).every(x => x.rate === 0.65) && (await said(page)).length === 1);
  await tap(page, '.tab[data-go="you"]'); await tap(page, '[data-audio="off"]');
  await page.evaluate(() => { S.refUnit = "u01"; S.refTab = "lesson"; S.screen = "reference"; render(); });
  check("Read aloud: Off hides every speaker", (await visible(page, ".say, [data-say]")) === 0 && (await page.$$("[data-say]")).length > 0 && await page.evaluate(() => document.documentElement.classList.contains("nosay")));
  await tap(page, '.tab[data-go="you"]'); await tap(page, '[data-audio="normal"]');
  check("Read aloud: Normal brings them back", (await page.evaluate(() => document.documentElement.classList.contains("nosay"))) === false);
  check("Read aloud: saved progress is untouched, and the setting is not part of it, so it never syncs", (await page.evaluate(() => localStorage.getItem("itapp.progress.v1"))) === progressBefore && !(await page.evaluate(() => JSON.stringify(progress))).includes("audio"));
  check("Read aloud: no script errors", !page.errors.length, page.errors.join("\n"));
  await context.close();

  // a device whose voices include no Italian: the speakers are hidden and You says how to add one
  {
    const { page, context } = await openApp(browser, origin, { width: 390, height: 844, scheme: "dark", init: fakeSpeech([VOICES[0]]) });
    await page.evaluate(() => { S.refUnit = "u01"; S.refTab = "lesson"; S.screen = "reference"; render(); });
    check("No Italian voice: the speakers are hidden", (await visible(page, ".say, [data-say]")) === 0);
    await tap(page, '.tab[data-go="you"]');
    check("No Italian voice: You says so, and how to install one", /No Italian voice/.test(await page.$eval("#readaloud-row", e => e.textContent)));
    await layout(page, "No Italian voice: You");
    check("No Italian voice: no script errors", !page.errors.length, page.errors.join("\n"));
    await context.close();
  }
  // a browser with no speech at all (the Android WebView inside some apps): no speakers are drawn
  {
    const { page, context } = await openApp(browser, origin, { width: 390, height: 844, scheme: "light", init: fakeSpeech(null) });
    await page.evaluate(() => { S.refUnit = "u01"; S.refTab = "lesson"; S.screen = "reference"; render(); });
    const lessonSpeakers = (await page.$$(".say, [data-say]")).length;
    await page.evaluate(() => { S.refUnit = "vb"; S.screen = "reference"; render(); });
    const verbSpeakers = (await page.$$(".say, [data-say]")).length;
    await page.evaluate(() => startSession("unit", "fc01"));
    check("No speech: no speakers are drawn, in a lesson, the verb tables or a session", lessonSpeakers === 0 && verbSpeakers === 0 && (await page.$$(".say, [data-say]")).length === 0);
    await page.evaluate(() => { session = null; S.screen = "you"; render(); });
    check("No speech: You says read aloud isn't available in this browser", /Not available/.test(await page.$eval("#readaloud-row", e => e.textContent)) && !(await page.$("[data-audio]")));
    check("No speech: no script errors", !page.errors.length, page.errors.join("\n"));
    await context.close();
  }
  console.log("  Read aloud checked");
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

    /* Choosing a unit: any card opens in place, and Today's Continue card follows the unit practised last */
    {
      const { page, context } = await openApp(browser, origin, { width: 390, height: 844, scheme: "light" });
      const open = () => page.$$eval(".ucard [data-unit]", es => es.map(e => e.dataset.unit).join());
      const finish = () => page.evaluate(() => { for (let n = 0; S.screen === "session" && n < 300; n++) { if (!S.feedback) finishAnswer(true, "", ""); continueSession(); } return S.screen; });
      const heroChip = () => page.$eval(".hero .hero-chip", e => e.textContent);
      const grammar = await page.evaluate(() => content.units.filter(u => unitSeg(u) === "grammar").map(u => u.id));
      await tap(page, '.tab[data-go="units"]');
      check("Choosing a unit: Units opens with the current unit's card open", (await open()) === "u05");
      const mid = grammar[8], last = grammar[grammar.length - 1];
      await page.locator(`[data-upick="${mid}"]`).scrollIntoViewIfNeeded();
      const before = await page.$eval(`[data-upick="${mid}"]`, e => e.getBoundingClientRect().top);
      await tap(page, `[data-upick="${mid}"]`);
      const after = await page.$eval(".ucard", e => e.getBoundingClientRect().top);
      check("Choosing a unit: a unit below the open card opens without jumping, and the other card closes", (await open()) === mid && Math.abs(after - before) < 2, `${Math.round(before)} → ${Math.round(after)}`);
      check("Choosing a unit: the current unit's closed card still says Current unit", /^Current unit/.test(await page.$eval('[data-upick="u05"] .clamp1', e => e.textContent)));
      check("Choosing a unit: an open card that isn't the current unit leaves out “Current unit”", !/Current unit/.test(await page.$eval(".ucard", e => e.textContent)));
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await tap(page, `[data-upick="${last}"]`);
      const clear = await page.evaluate(() => document.querySelector(".ucard").getBoundingClientRect().bottom <= document.querySelector(".tabbar").getBoundingClientRect().top);
      check("Choosing a unit: the last unit's card opens with its buttons clear of the tab bar", (await open()) === last && clear);
      await tap(page, '[data-useg="vocab"]');
      await tap(page, '.ulist [data-upick="fc01"]');
      check("Choosing a unit: a vocab pack opens the same way, with Practise and Open unit", (await open()) === "fc01" && await page.$('.ucard [data-ref="fc01"]'));
      await tap(page, '[data-useg="verbs"]');
      await tap(page, '.ulist [data-upick="vb"]');
      check("Choosing a unit: so does the Verbs unit", (await open()) === "vb" && await page.$('.ucard [data-ref="vb"]'));
      await tap(page, '[data-useg="grammar"]');
      await tap(page, '.ulist [data-upick="u02"]');
      await tap(page, '.ucard [data-ref="u02"]');
      await tap(page, '.hdr .back[data-go="units"]');
      check("Choosing a unit: after reading its lesson, back on Units the same card is open", (await screen(page)) === "units" && (await open()) === "u02");
      await tap(page, '.tab[data-go="home"]'); await tap(page, '.tab[data-go="units"]');
      check("Choosing a unit: after leaving Units, the current unit's card is open again", (await open()) === "u05");
      await tap(page, '.ulist [data-upick="u02"]');
      await tap(page, '.ucard [data-unit="u02"]');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("itapp.progress.v1")).currentUnit);
      check("Choosing a unit: Practise starts that unit and makes it the current unit, saved at once", (await screen(page)) === "session" && (await page.evaluate("session.unitId")) === "u02" && (await page.evaluate("progress.currentUnit")) === "u02" && saved === "u02", saved);
      await tap(page, '[data-go="quit"]');
      check("Choosing a unit: back on Today, the Continue card shows that unit", (await screen(page)) === "home" && (await heroChip()) === "Unit 2");
      await tap(page, '.hero[data-start="continue"]');
      check("Choosing a unit: …and Continue practises it", (await page.evaluate("session.unitId")) === "u02");
      await tap(page, '[data-go="quit"]');
      await tap(page, '.tab[data-go="units"]');
      check("Choosing a unit: on Units it is now the current unit's card that is open", (await open()) === "u02" && /^Current unit/.test(await page.$eval(".ucard .urow-t > .small", e => e.textContent)) && !(await page.$eval('[data-upick="u05"]', e => e.textContent)).includes("Current unit"));
      // going back over a finished unit keeps it on Today; Continue then moves on to the next unit with new items, as before
      await tap(page, '.ulist [data-upick="u01"]');
      await tap(page, '.ucard [data-unit="u01"]');
      check("Choosing a unit: going back over a finished unit runs to the end", (await finish()) === "summary");
      check("Choosing a unit: …and keeps that unit on Today", (await page.evaluate("progress.currentUnit")) === "u01");
      await tap(page, '[data-go="home"]');
      check("Choosing a unit: …shown on the Continue card", (await heroChip()) === "Unit 1");
      await tap(page, '.hero[data-start="continue"]'); await finish();
      check("Choosing a unit: Continue on a finished unit then moves on to the next unit with new items", (await page.evaluate("progress.currentUnit")) === "u05");
      // practising the last new items of a unit moves Today on to the next unit
      await tap(page, '[data-go="home"]');
      const left = await page.evaluate(() => { const T = Date.now(); newIds("u05").slice(1).forEach(id => { progress.items[pid(id)] = { box: 1, due: T + 864e5, lapses: 0, lastSeen: T, lastWrong: 0, seenCount: 1, lastRight: T }; }); saveProgress(); return newIds("u05").length; });
      await tap(page, '.tab[data-go="units"]');
      await tap(page, '.ucard [data-unit="u05"]');
      const next = await page.evaluate(() => { const i = content.units.findIndex(u => u.id === "u05"); return content.units.slice(i + 1).find(u => !isSideUnit(u.id) && newIds(u.id).length).id; });
      await finish();
      check("Choosing a unit: practising a unit's last new items moves Today on to the next unit", left === 1 && (await page.evaluate("progress.currentUnit")) === next, `${left} new left; current ${await page.evaluate("progress.currentUnit")}, expected ${next}`);
      check("Choosing a unit: practising a vocab pack or the Verbs leaves the Continue unit as it is", await page.evaluate(() => { const was = progress.currentUnit, out = []; for (const u of ["fc01", "vb"]) { startSession("unit", u); out.push(S.screen === "session" && progress.currentUnit === was); session = null; S.screen = "home"; render(); } return out.every(Boolean); }));
      check("Choosing a unit: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
      console.log("  Choosing a unit checked");
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

    /* Room above the keyboard: a Pixel 8 (412 × 915) leaves about 460 px above its keyboard, so Don't know and Check must end by then */
    {
      const KEYBOARD_TOP = 460;
      const { page, context } = await openApp(browser, origin, { width: 412, height: 915, scheme: "light" });
      await tap(page, '.hero[data-start="continue"]');
      const top = await page.evaluate(() => { const t = document.querySelector(".sbar .sbar-type"), bar = document.querySelector(".sbar"); return { text: t && t.textContent, inRow: !!t && t.getBoundingClientRect().bottom <= bar.getBoundingClientRect().bottom, type: current().ex.type }; });
      check("Keyboard room: the exercise type is shown in the top row, under the progress bar", top.inRow && top.text === top.type, JSON.stringify(top));
      const r = await page.evaluate((limit) => {
        const out = { n: 0, fit: 0, worst: [], placeholder: true };
        for (const item of Object.values(content.items)) {
          if (isFlashUnit(item.unit)) continue; // flashcards are the shortest; verb tables move box to box with Enter
          for (const box of [0, 1, 3, 5]) {
            const ex = makeExercise(item, { box, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 0 });
            if (!ex || ex.mode !== "typed") continue;
            session = { kind: "unit", queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
            S.screen = "session"; S.feedback = null; S.retry = null; render(); window.scrollTo(0, 0);
            const inp = document.getElementById("answer"), lbl = document.querySelector("label.field > .vh");
            if (!inp || inp.placeholder !== "Your answer" || !lbl || lbl.textContent !== "Your answer") out.placeholder = false;
            const bottom = Math.max(...[...document.querySelectorAll('[data-act="giveup"], [data-act="check"]')].map(b => b.getBoundingClientRect().bottom));
            out.n++; if (bottom <= limit) out.fit++; else out.worst.push([Math.round(bottom), `${item.id} (${ex.type})`]);
          }
        }
        out.worst = out.worst.sort((a, b) => b[0] - a[0]).slice(0, 3).map(w => `${w[1]} ends at ${w[0]} px`);
        session = null; S.screen = "home"; render();
        return out;
      }, KEYBOARD_TOP);
      const pct = r.n ? 100 * r.fit / r.n : 0;
      check(`Keyboard room: Don't know and Check end within the top ${KEYBOARD_TOP} px on at least 95% of typed questions (${pct.toFixed(1)}% of ${r.n})`, r.n > 1000 && pct >= 95, r.worst.join("\n"));
      check("Keyboard room: the answer box says \"Your answer\" inside it, and keeps it as its label", r.placeholder);
      check("Keyboard room: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
      console.log("  Keyboard room checked");
    }

    /* English answers: a contraction counts as the words it stands for (the vocab packs' phrases rely on it) */
    {
      const { page, context } = await openApp(browser, origin, { width: 390, height: 844, scheme: "light" });
      const pairs = [["I am tired", "I'm tired"], ["I do not know", "I don't know"], ["I cannot remember", "I can't remember"], ["it is my turn", "it's my turn"], ["I will call you back", "I'll call you back"], ["you are joking", "you're joking"]];
      const ok = await page.evaluate(ps => ps.map(([a, b]) => !!checkAnswer(a, [b], { english: true }).ok && !!checkAnswer(b, [a], { english: true }).ok), pairs);
      check("English answers: a contraction counts as the words it stands for (I'm = I am, don't = do not), both ways", ok.every(Boolean), JSON.stringify(pairs.filter((p, i) => !ok[i])));
      check("English answers: …while another word is still wrong", !(await page.evaluate(() => checkAnswer("I'm hungry", ["I'm tired"], { english: true }).ok)));
      check("English answers: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
      console.log("  English contractions checked");
    }

    /* The exercise types added in v8.6 */
    await newTypes(browser, origin);

    /* Read aloud */
    await readAloud(browser, origin);
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
