#!/usr/bin/env node
/*
  Speed test for index.html: how long the app takes to open and to draw its busiest screens with a
  lot of practice saved, on a CPU about as fast as a mid-range phone's.

  Usage:  node tools/test-perf.js [path/to/index.html] [--new-budgets] [--headed]

  Opens the real app in Chromium (Playwright) at 390 × 844 with the CPU slowed 4× (the DevTools
  setting Emulation.setCPUThrottlingRate), saves about 6,600 progress records (spread over the
  grammar units, vocab packs 1–3 and the Verbs section) and 45 days of daily log, reloads, and times:

    - a reload, until Today is drawn;
    - after the reload, the word lists the typo rule uses (knownWords), built in idle time: how long
      after Today they are ready, and the longest slice of that work (it must stay under 50 ms, so a
      tap is never kept waiting longer);
    - buildContent(), a cold knownWords() (the word lists built all at once, as an answer that needs
      them before they are ready does), and the counts Today, Units, Stats and You show, worked out
      afresh (as after an answer or a sync);
    - drawing Today, Units, Stats, You, the Verb tenses unit's Lesson and Glossary, the Verbs
      reference and Vocab pack 1's glossary (1,000 cards), each until the layout is done, with the
      counts already worked out (a visit to a screen that is no longer the first since a change);
    - opening a verb in the Verbs reference (its tables are drawn then);
    - typing "casa" into Look up, one keystroke at a time (c, ca, cas, casa), each until its results
      are drawn (leaving out the pause the app waits for typing to stop): "ca" is the first search
      since buildContent, typed the moment Look up opens, so it includes building the search index;
      then "ca" again in Look up opened afresh, once the idle moment after opening has built it;
    - typing "andare" into the Verbs filter, and "casa" into the 1,000-card glossary's filter, each
      all at once;
    - buildSession for every kind of session (the mean of 5, as each takes only milliseconds);
    - with a stand-in for the cloud database: one pushProgress with every document compared and
      written; one answer and the pushProgress after it; a snapshot from the cloud that is only the echo
      of those writes, and the pushProgress after it; and another device's newer copy merged in, as
      adoptRemote and as a whole snapshot, with Today redrawn. (The snapshots go through
      onProgressSnapshot from 9.4; on 9.3 and before, through the same steps as their handler.)

  Each figure is the median of 7 runs (3 for the reload and the idle work), in milliseconds. The app's random
  choices (which items a session takes, which exercise each becomes) come from a fixed seed while
  it is timed, so every run of the test does the same work. It prints a table and fails when a
  figure is over its budget in BUDGETS below; --new-budgets also prints a BUDGETS table of this
  run's figures plus 25%, ready to paste.

  The figures depend on the computer, so this test is part of npm test but not of the GitHub
  workflow (shared runners vary in speed). It also runs on an older index.html (9.2 or before, which
  had no idle work, no counts cache and no pause in typing), leaving out the figures it can't take,
  so the same table can show before and after. Changes nothing in index.html. Exits with code 1 if a
  figure is over budget or missing, or a script error occurs.
*/
"use strict";
const path = require("path");
const { loadPlaywright, serveApp } = require("./lib/browser");
const { seedProgress } = require("./lib/seed");

/* ---------- budgets, in milliseconds ----------
   Set at version 9.3, when the app was made faster (in a Claude Code cloud session): each figure's slowest of five runs
   of the test, plus 25% (the runs on that computer varied by about a fifth, so the median plus 25% would fail now and
   then with nothing changed), or the 9.1 budget where that was lower; "Idle work: longest slice" is a limit, not a
   measurement (FIXED below). When a change makes something faster, run the test a few times and lower its budget to
   the new figure plus 25% (--new-budgets prints them); raise one only for a reason worth writing down. If every figure
   is over by about the same amount, the computer is probably slower than the one the budgets were set on: run the
   test on the previous version too (for example git show v9.2:index.html > /tmp/old.html, then
   node tools/test-perf.js /tmp/old.html) to compare. */
const BUDGETS = {
  "Reload to Today": 2027,
  "Word lists ready, after Today": 6772,
  "Idle work: longest slice": 50,
  "buildContent()": 283,
  "knownWords(), cold": 2543,
  "Counts, worked out": 93,
  "Draw Today": 18,
  "Draw Units": 38,
  "Draw Stats": 34,
  "Draw You": 26,
  "Draw Verb tenses lesson": 290,
  "Draw Verb tenses glossary": 832,
  "Draw Verbs reference": 544,
  "Draw a 1,000-card glossary": 739,
  "Open a verb in the Verbs reference": 165,
  "Verbs filter: andare": 199,
  "1,000-card glossary filter: casa": 107,
  "Look up: c": 3,
  "Look up: ca": 1055,
  "Look up: cas": 78,
  "Look up: casa": 89,
  "Look up: ca, a moment after opening": 73,
  "buildSession continue": 16,
  "buildSession unit": 13,
  "buildSession review": 111,
  "buildSession flashcards": 76,
  "buildSession verbs": 54,
  "buildSession wild": 81,
  "buildSession hard": 55,
  "buildSession mistakes": 31,
  // the sync figures, set at 9.4 (dirty tracking and the record-by-record merge) in the same way; the push after an echo
  // takes well under a millisecond, so its budget leaves room for the timer's own granularity
  "pushProgress (fake db)": 94,
  "adoptRemote (fake db)": 166,
  "pushProgress after an answer": 23,
  "Snapshot: the echo of own writes": 43,
  "pushProgress after the echo": 3,
  "Snapshot: another device's changes": 160,
};

// Budgets that are limits rather than measurements, which --new-budgets leaves as they are: no slice of idle work may keep
// a tap waiting longer than this (the usual threshold for a "long task").
const FIXED = { "Idle work: longest slice": 50 };

const args = process.argv.slice(2);
const HEADED = args.includes("--headed");
const NEW_BUDGETS = args.includes("--new-budgets");
const file = path.resolve(args.find(a => !a.startsWith("--")) || path.join(__dirname, "..", "index.html"));
const CPU_SLOWDOWN = 4, RUNS = 7, RELOADS = 3;
const ready = "typeof content !== 'undefined' && content && typeof S !== 'undefined' && S.screen === 'home'";

const { chromium } = loadPlaywright();

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
  const later = () => typeof drawTyped === "function" && drawTyped(); // results drawn now instead of after the pause in typing (9.3 on)
  const type = (id, q) => { const box = document.getElementById(id); box.value = q; box.dispatchEvent(new Event("input")); later(); layout(); };
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
  const cloudDocs = () => Object.fromEntries(Object.entries(store).filter(([k]) => k.startsWith("progress2/")).map(([k, v]) => [k.slice("progress2/".length), v]));
  const snapshot = (docs) => { // a snapshot of the progress2 collection, handled as the app handles one
    const snap = { docs: Object.entries(docs).map(([id, v]) => ({ id, data: () => v })) };
    if (typeof onProgressSnapshot === "function") onProgressSnapshot(snap, false);
    else { const list = snap.docs.map(d => [d.id, d.data()]); list.forEach(([name, data]) => { lastPushed[name] = canon(data); }); adoptRemote(docsToProgress(list)); scheduleSync(); } // 9.3 and before
    clearTimeout(syncTimer);
  };
  const answerIds = Object.keys(progress.items).filter(id => content.items[id] && !isVerbUnit(content.items[id].unit));
  db = { doc: (p) => ({ set: async (body) => { store[p] = body; }, get: async () => ({ exists: p in store, data: () => store[p] }), delete: async () => { delete store[p]; } }),
    collection: () => ({ get: async () => ({ docs: [] }), onSnapshot: () => () => { } }) };
  dbState = "on";
  const settle = () => new Promise(r => setTimeout(r, 0));
  progress = mergeProgress(progress, {}); // in the form a merge leaves it, as on a device that has synced before
  const mine = JSON.stringify(progress);
  let theirs = null;

  for (let r = 0; r < runs; r++) {
    add("buildContent()", time(() => buildContent()));
    KNOWN_WORDS = null; add("knownWords(), cold", time(() => knownWords()));
    if (typeof counts === "function") { COUNTS = null; add("Counts, worked out", time(() => counts())); }
    for (const [name, set] of screens) { draw({ screen: "home" }); add(name, draw(set)); }
    draw({ screen: "reference", refUnit: vb, refFilter: "" });
    { const row = [...document.querySelectorAll("details.vref")].find(d => /^andare\b/.test(d.textContent)) || document.querySelector("details.vref");
      const t0 = performance.now(); row.open = true; await new Promise(r => row.addEventListener("toggle", r, { once: true })); layout();
      add("Open a verb in the Verbs reference", performance.now() - t0); }
    add("Verbs filter: andare", time(() => type("refFilter", "andare")));
    draw({ screen: "reference", refUnit: fc, refTab: "glossary", refFilter: "" });
    add("1,000-card glossary filter: casa", time(() => type("refFilter", "casa")));
    draw({ screen: "lookup", lookup: "", refFilter: "" }); // then one keystroke at a time, as the box's input handler sees them
    for (const q of ["c", "ca", "cas", "casa"]) add("Look up: " + q, time(() => type("lookupBox", q)));
    draw({ screen: "home", lookup: "" });
    if (typeof warmSearch === "function") SEARCH = null; // 9.3 on: Look up opened afresh builds its index in idle time, so wait for it
    draw({ screen: "lookup", lookup: "" });
    for (let waited = 0; typeof warmSearch === "function" && !(SEARCH && SEARCH.items) && waited < 30000; waited += 100) await new Promise(r => setTimeout(r, 100));
    add("Look up: ca, a moment after opening", time(() => type("lookupBox", "ca")));
    draw({ screen: "home", lookup: "" });
    for (const [kind, unit] of kinds) add("buildSession " + kind, time(() => { for (let k = 0; k < 5; k++) if (!buildSession(kind, unit).queue.length) throw new Error("an empty " + kind + " session"); }) / 5); // quick, so the mean of 5
    lastPushed = {}; writing = {}; pendingWrite = {}; // so every document is written
    if (typeof DIRTY !== "undefined") DIRTY = null; // 9.4 on: and every one compared
    add("pushProgress (fake db)", time(() => pushProgress()));
    await settle();
    applyResult(answerIds[r * 37], true, "production", false, "recall"); clearTimeout(syncTimer); // one answer; the push that follows it 1.5 s later
    add("pushProgress after an answer", time(() => pushProgress()));
    await settle();
    add("Snapshot: the echo of own writes", time(() => { snapshot(cloudDocs()); layout(); }));
    add("pushProgress after the echo", time(() => pushProgress()));
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
    progress = JSON.parse(mine); buildContent(); draw({ screen: "home" }); // back to this device's own progress
    const docs = progressToDocs(JSON.parse(theirs));
    add("Snapshot: another device's changes", time(() => { snapshot(docs); layout(); }));
    progress = JSON.parse(mine); buildContent(); draw({ screen: "home" }); // and again, for the next round
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
      // how long each slice of idle work takes, and when the word lists are ready
      const ric = window.requestIdleCallback; window.__idle = [];
      if (ric) window.requestIdleCallback = (fn, o) => ric.call(window, (d) => {
        const t0 = performance.now();
        try { fn(d); } finally { window.__idle.push(performance.now() - t0); try { if (!window.__wordsAt && KNOWN_WORDS) window.__wordsAt = performance.now(); } catch (e) { } }
      }, o);
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
      if (!r) continue;
      (times["Reload to Today"] = times["Reload to Today"] || []).push(t);
      if (await page.evaluate("typeof warmKnownWords === 'function'")) { // 9.3 on: the word lists are built in idle time
        await page.waitForFunction(() => window.__wordsAt, null, { timeout: 60000, polling: 250 });
        const idle = await page.evaluate(() => ({ ready: window.__wordsAt - window.__todayAt, longest: Math.max(...window.__idle) }));
        (times["Word lists ready, after Today"] = times["Word lists ready, after Today"] || []).push(idle.ready);
        (times["Idle work: longest slice"] = times["Idle work: longest slice"] || []).push(idle.longest);
      }
    }
    const loaded = await page.evaluate("Object.keys(progress.items).length");
    if (loaded !== records) throw new Error(`the app loaded ${loaded} of the ${records} saved records`);
    Object.assign(times, await page.evaluate(measure, RUNS));

    console.log(`Speed test for ${path.relative(process.cwd(), file) || file} (version ${version}): CPU slowed ${CPU_SLOWDOWN}×, 390 × 844, ${records.toLocaleString("en-GB")} progress records and 45 days of log`);
    console.log(`Each figure is the median of ${RUNS} runs (${RELOADS} for the reload and the idle work), in milliseconds.\n`);
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
      for (const [name, ms] of Object.entries(figures)) console.log(`  ${JSON.stringify(name)}: ${FIXED[name] || Math.ceil(ms * 1.25)},`);
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
