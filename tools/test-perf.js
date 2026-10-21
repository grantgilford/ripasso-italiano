#!/usr/bin/env node
/*
  Speed test for index.html: how long the app takes to open and to draw its busiest screens with a
  lot of practice saved, on a CPU about as fast as a mid-range phone's.

  Usage:  node tools/test-perf.js [path/to/index.html] [--new-budgets] [--headed]

  Opens the real app in Chromium (Playwright) at 390 × 844 with the CPU slowed 4× (the DevTools
  setting Emulation.setCPUThrottlingRate), saves about 6,600 progress records (spread over the
  grammar units, vocab packs 1–3 and the Verbs section) and 45 days of daily log, reloads, and times:

    - a reload, until Today is drawn;
    - buildContent(), and a cold knownWords() (the word lists the typo rule uses);
    - drawing Today, Units, Stats, You, the Verb tenses unit's Lesson and Glossary, the Verbs
      reference and Vocab pack 1's glossary (1,000 cards), each until the layout is done;
    - typing "casa" into Look up, one keystroke at a time (c, ca, cas, casa);
    - buildSession for every kind of session (the mean of 5, as each takes only milliseconds);
    - with a stand-in for the cloud database, one pushProgress (everything written) and one
      adoptRemote (another device's newer copy merged in, with Today redrawn).

  Each figure is the median of 7 runs (3 for the reload), in milliseconds. The app's random
  choices (which items a session takes, which exercise each becomes) come from a fixed seed while
  it is timed, so every run of the test does the same work. It prints a table and fails when a
  figure is over its budget in BUDGETS below; --new-budgets also prints a BUDGETS table of this
  run's figures plus 25%, ready to paste.

  The figures depend on the computer, so this test is part of npm test but not of the GitHub
  workflow (shared runners vary in speed). Changes nothing in index.html. Exits with code 1 if a
  figure is over budget or a script error occurs.
*/
"use strict";
const path = require("path");
const { loadPlaywright, serveApp } = require("./lib/browser");

/* ---------- budgets, in milliseconds ----------
   Set when the test was written (version 9.1, in a Claude Code cloud session): each figure's median over
   three runs of the test, plus 25%. When a change makes something faster, run the test a few times and
   lower its budget to the new figure plus 25% (--new-budgets prints them); raise one only for a reason
   worth writing down. If every figure is over by about the same amount, the computer is probably slower
   than the one the budgets were set on: run the test on the previous version too (for example
   git show v9.1:index.html > /tmp/old.html, then node tools/test-perf.js /tmp/old.html) to compare. */
const BUDGETS = {
  "Reload to Today": 3534,
  "buildContent()": 1128,
  "knownWords(), cold": 2632,
  "Draw Today": 318,
  "Draw Units": 239,
  "Draw Stats": 257,
  "Draw You": 67,
  "Draw Verb tenses lesson": 290,
  "Draw Verb tenses glossary": 939,
  "Draw Verbs reference": 2132,
  "Draw a 1,000-card glossary": 798,
  "Look up: c": 13,
  "Look up: ca": 1055,
  "Look up: cas": 1153,
  "Look up: casa": 1109,
  "buildSession continue": 16,
  "buildSession unit": 15,
  "buildSession review": 117,
  "buildSession flashcards": 76,
  "buildSession verbs": 54,
  "buildSession wild": 100,
  "buildSession hard": 55,
  "buildSession mistakes": 32,
  "pushProgress (fake db)": 225,
  "adoptRemote (fake db)": 1922,
};

const args = process.argv.slice(2);
const HEADED = args.includes("--headed");
const NEW_BUDGETS = args.includes("--new-budgets");
const file = path.resolve(args.find(a => !a.startsWith("--")) || path.join(__dirname, "..", "index.html"));
const CPU_SLOWDOWN = 4, RUNS = 7, RELOADS = 3;
const ready = "typeof content !== 'undefined' && content && typeof S !== 'undefined' && S.screen === 'home'";

const { chromium } = loadPlaywright();

// Saved practice on a well-used device: ~3,000 grammar records spread evenly over every grammar unit, all of
// Vocab pack 1, most of pack 2 and half of pack 3 (cards arrive in order), the first 1,200 Verbs section
// tenses, and 45 days of log. Built from a fixed seed, so every run saves the same progress.
function seedProgress() {
  let s = 20261021; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const T = Date.now(), D = 864e5;
  const own = (u) => (content.byUnit[u] || []).filter(i => !content.canon[i.id]).map(i => i.id); // one record per shared exercise
  const spread = (ids, n) => { const step = ids.length / n; return Array.from({ length: Math.min(n, ids.length) }, (_, k) => ids[Math.floor(k * step)]); };
  const grammar = content.units.filter(u => !u.mode).flatMap(u => own(u.id));
  const pack = (title) => own(content.units.find(u => u.title === title).id);
  const ids = [...spread(grammar, 3000), ...pack("Vocab pack 1"), ...pack("Vocab pack 2").slice(0, 900), ...pack("Vocab pack 3").slice(0, 500), ...own("vb").slice(0, 1200)];
  const items = {};
  for (const id of ids) {
    const box = 1 + Math.floor(rnd() * rnd() * 7.99), lastSeen = T - Math.floor(rnd() * 45 * D);
    const lapses = rnd() < 0.18 ? 1 + Math.floor(rnd() * 3) : 0, wrong = lapses && rnd() < 0.5;
    items[id] = { box, due: lastSeen + [0, 1, 2, 4, 8, 16, 32, 64][box] * D * (0.6 + rnd()), lapses, lastSeen, lastWrong: wrong ? lastSeen : lapses ? lastSeen - 3 * D : 0, seenCount: box + 2 * lapses + Math.floor(rnd() * 4), lastRight: wrong ? 0 : lastSeen };
  }
  const days = {};
  for (let d = 0; d < 45; d++) {
    const n = 20 + Math.floor(rnd() * 60);
    days[dayKey(T - d * D)] = { xp: n, new: Math.floor(rnd() * 15), cards: Math.floor(rnd() * 30), t: { recall: [Math.floor(n / 3), Math.floor(n / 2)], cloze: [5, 7], flip: [10, 12], translate: [3, 5] } };
  }
  const flagged = ids.slice(0, 6);
  const flags = Object.fromEntries(flagged.map(id => [id, { id, unit: content.items[id].unit, exercise: "Grammar", prompt: "a question", given: "", expected: "x", note: "", createdAt: T - D, updatedAt: T - D }]));
  localStorage.setItem("itapp.progress.v1", JSON.stringify({ v: 2, items, days, flags, synonyms: { [ids[10]]: ["my own answer"] }, currentUnit: content.units.find(u => /^Verb tenses/.test(u.title)).id, settings: defaultProgress().settings, updatedAt: T, settingsUpdatedAt: T - D }));
  localStorage.setItem("itapp.seen.v1", JSON.stringify(APP_VERSION)); // an ordinary day: What's new already read
  return Object.keys(items).length;
}

// Everything timed inside the page, in rounds: each round times every figure once, so a moment when the computer
// is busy with something else costs each figure one run, which the median then leaves out.
async function measure(runs) {
  let s = 7; const random = Math.random; // the same sessions and exercises every time, so the figures compare
  Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const T = {};
  const add = (name, ms) => (T[name] = T[name] || []).push(ms);
  const layout = () => void document.body.offsetHeight; // the drawing isn't done until the layout is
  const time = (fn) => { const t0 = performance.now(); fn(); return performance.now() - t0; };
  const draw = (set) => time(() => { Object.assign(S, set); render(); layout(); });
  const vt = content.units.find(u => /^Verb tenses/.test(u.title)).id;
  const vb = content.units.find(u => u.mode === "verbs").id;
  const fc = content.units.find(u => u.title === "Vocab pack 1").id;
  const screens = [
    ["Draw Today", { screen: "home" }], ["Draw Units", { screen: "units" }], ["Draw Stats", { screen: "stats" }], ["Draw You", { screen: "you" }],
    ["Draw Verb tenses lesson", { screen: "reference", refUnit: vt, refTab: "lesson", refFilter: "" }],
    ["Draw Verb tenses glossary", { screen: "reference", refUnit: vt, refTab: "glossary", refFilter: "" }],
    ["Draw Verbs reference", { screen: "reference", refUnit: vb, refFilter: "" }],
    ["Draw a 1,000-card glossary", { screen: "reference", refUnit: fc, refTab: "glossary", refFilter: "" }],
  ];
  const kinds = [["continue"], ["unit", vt], ["review"], ["flashcards"], ["verbs"], ["wild"], ["hard"], ["mistakes"]];
  // A stand-in for window.claude.use("db") that keeps what is written.
  const store = {};
  db = { doc: (p) => ({ set: async (body) => { store[p] = body; }, get: async () => ({ exists: p in store, data: () => store[p] }), delete: async () => { delete store[p]; } }),
    collection: () => ({ get: async () => ({ docs: [] }), onSnapshot: () => () => { } }) };
  dbState = "on";
  const settle = () => new Promise(r => setTimeout(r, 0));
  const mine = JSON.stringify(progress);
  let theirs = null;

  for (let r = 0; r < runs; r++) {
    add("buildContent()", time(() => buildContent()));
    KNOWN_WORDS = null; add("knownWords(), cold", time(() => knownWords()));
    for (const [name, set] of screens) { draw({ screen: "home" }); add(name, draw(set)); }
    draw({ screen: "lookup", lookup: "" }); // then one keystroke at a time, as the box's input handler sees them
    for (const q of ["c", "ca", "cas", "casa"]) add("Look up: " + q, time(() => { const box = document.getElementById("lookupBox"); box.value = q; box.dispatchEvent(new Event("input")); layout(); }));
    draw({ screen: "home", lookup: "" });
    for (const [kind, unit] of kinds) add("buildSession " + kind, time(() => { for (let k = 0; k < 5; k++) if (!buildSession(kind, unit).queue.length) throw new Error("an empty " + kind + " session"); }) / 5); // quick, so the mean of 5
    lastPushed = {}; writing = {}; pendingWrite = {}; // so every document is written
    add("pushProgress (fake db)", time(() => pushProgress()));
    await settle();
    if (!theirs) { // another device's copy: what was just written, with 150 records practised since and more done today
      const remote = docsToProgress(Object.entries(store).filter(([k]) => k.startsWith("progress2/")).map(([k, v]) => [k.slice("progress2/".length), v]));
      Object.keys(remote.items).slice(0, 150).forEach((id, k) => { const x = remote.items[id]; x.lastSeen = Date.now() - k; x.box = Math.min(7, x.box + 1); x.seenCount++; });
      remote.days[dayKey(Date.now())] = { xp: 999, new: 5 };
      remote.updatedAt = Date.now();
      theirs = JSON.stringify(remote);
    }
    const copy = JSON.parse(theirs);
    add("adoptRemote (fake db)", time(() => { adoptRemote(copy); layout(); }));
    progress = JSON.parse(mine); buildContent(); draw({ screen: "home" }); // back to this device's own progress for the next round
  }
  clearTimeout(syncTimer); db = null; dbState = "off";
  lsSet(LS_PROGRESS, progress);
  Math.random = random;
  return T;
}

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const fmt = (ms) => ms >= 100 ? String(Math.round(ms)) : ms.toFixed(1);

(async () => {
  const server = await serveApp(file);
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: !HEADED });
  let over = 0;
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => { // the moment Today is first drawn, from the start of the page load
      new MutationObserver((_, obs) => { if (document.querySelector("#app .home-hdr")) { window.__todayAt = performance.now(); obs.disconnect(); } }).observe(document, { childList: true, subtree: true });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    await page.goto(origin + "/index.html");
    await page.waitForFunction(ready);
    const records = await page.evaluate(seedProgress);
    const version = await page.evaluate("APP_VERSION");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

    const times = {};
    for (let r = 0; r <= RELOADS; r++) { // the first reload warms up and isn't counted
      await page.reload();
      await page.waitForFunction(() => window.__todayAt, null, { timeout: 60000 });
      const t = await page.evaluate("window.__todayAt");
      if (r) (times["Reload to Today"] = times["Reload to Today"] || []).push(t);
    }
    const loaded = await page.evaluate("Object.keys(progress.items).length");
    if (loaded !== records) throw new Error(`the app loaded ${loaded} of the ${records} saved records`);
    Object.assign(times, await page.evaluate(measure, RUNS));

    console.log(`Speed test for ${path.relative(process.cwd(), file) || file} (version ${version}): CPU slowed ${CPU_SLOWDOWN}×, 390 × 844, ${records.toLocaleString("en-GB")} progress records and 45 days of log`);
    console.log(`Each figure is the median of ${RUNS} runs (${RELOADS} for the reload), in milliseconds.\n`);
    const names = [...new Set([...Object.keys(BUDGETS), ...Object.keys(times)])];
    const w = Math.max(...names.map(n => n.length)) + 2;
    console.log("  " + "".padEnd(w) + "ms".padStart(8) + "budget".padStart(9));
    const figures = {};
    for (const name of names) {
      if (!times[name]) { console.log(`  ${name.padEnd(w)}${"—".padStart(8)}${String(BUDGETS[name]).padStart(9)}   NOT MEASURED`); over++; continue; }
      const ms = figures[name] = median(times[name]), budget = BUDGETS[name];
      const bad = !(budget > 0) || ms > budget;
      if (bad) over++;
      console.log(`  ${name.padEnd(w)}${fmt(ms).padStart(8)}${(budget > 0 ? String(budget) : "none").padStart(9)}   ${bad ? (budget > 0 ? "OVER" : "NO BUDGET") : "ok"}`);
    }
    if (errors.length) { over++; console.log("\n  FAIL script errors:\n    " + errors.slice(0, 5).join("\n    ")); }
    if (NEW_BUDGETS) {
      console.log("\nThis run's figures plus 25%, as a BUDGETS table:\nconst BUDGETS = {");
      for (const [name, ms] of Object.entries(figures)) console.log(`  ${JSON.stringify(name)}: ${Math.ceil(ms * 1.25)},`);
      console.log("};");
    }
    console.log(over ? `\n${over} figure(s) over budget or missing.` : `\nAll ${names.length} figures are within budget.`);
  } catch (e) {
    over++;
    console.log("\n  FAIL the test itself stopped: " + (e && e.stack || e));
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(over ? 1 : 0);
})();
