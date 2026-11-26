#!/usr/bin/env node
/*
  Speed test for index.html: how long the app takes to open and to draw its busiest screens with a
  lot of practice saved, on a CPU about as fast as a mid-range phone's.

  Usage:  node tools/test-perf.js [path/to/index.html] [--new-budgets] [--headed]
          node tools/test-perf.js [path/to/index.html] --against path/to/other/index.html
          (--against: no budgets; both files timed on this computer, failing when a figure is over 40% slower than the
          other file's. GitHub runs it so, against main's index.html: see AGAINST below.)

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
    - opening a verb in the Verbs reference (its tables are drawn then, from 9.20 with their example sentences);
    - from 9.32, opening the Verb map (its tense rows, filters and first 40 rows), drawing its next 40 rows (as it does when
      the grid scrolls near its end, held to the 50 ms of a slice of idle work), and one keystroke in its filter;
    - typing "casa" into Look up, one keystroke at a time (c, ca, cas, casa), each until its results
      are drawn (leaving out the pause the app waits for typing to stop): "ca" is the first search
      since buildContent, typed the moment Look up opens, so it includes building the search index;
      then "ca" again in Look up opened afresh, once the idle moment after opening has built it;
    - typing "andare" into the Verbs filter, and "casa" into the 1,000-card glossary's filter, each
      all at once;
    - buildSession for every kind of session (the mean of 5, as each takes only milliseconds);
    - the first lookup of a flashcard's sentence (9.7 on), which indexes the grammar units' sentences by their words;
    - from 9.20, the example sentences of the first 100 verbs that have them, found afresh (held to the same 50 ms), and drawing a Verbs
      session with Verb in a sentence and with Which tense fits?, then each one's answer panel after a wrong answer;
    - with a stand-in for the cloud database: one pushProgress with every document compared and
      written; one answer and the pushProgress after it; a snapshot from the cloud that is only the echo
      of those writes, and the pushProgress after it; and another device's newer copy merged in, as
      adoptRemote and as a whole snapshot, with Today redrawn. (The snapshots go through
      onProgressSnapshot from 9.4; on 9.3 and before, through the same steps as their handler.)
    - from 9.26, the storage (IndexedDB behind Store): after a reload, when the saved data is in memory (the
      database opened and every row read); saving one answer, a record changed as an answer changes it:
      saveProgress() itself and until the storage has it; and every part of progress compared with what is
      stored, as when the app is put away.

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
  "buildSession unit": 8,
  "buildSession review": 111,
  "buildSession flashcards": 76,
  "buildSession verbs": 54,
  "buildSession wild": 81,
  "buildSession hard": 28,
  "buildSession mistakes": 31,
  // the sync figures, set at 9.4 (dirty tracking and the record-by-record merge) in the same way; the push after an echo
  // takes well under a millisecond, so its budget leaves room for the timer's own granularity
  "pushProgress (fake db)": 94,
  "adoptRemote (fake db)": 140, // 9.26: was 166 (see below)
  "pushProgress after an answer": 23,
  "Snapshot: the echo of own writes": 43,
  "pushProgress after the echo": 3,
  "Snapshot: another device's changes": 160,
  // 9.7: meaning choices no longer list the whole course for every choice, so "buildSession unit" and "buildSession hard"
  // took about 60% and 50% of 9.6's time on the same computer; their budgets were lowered in the same proportion. The first
  // lookup of a flashcard's sentence indexes the grammar units' sentences while the answer panel is drawn, so it is held to
  // the same limit as a slice of idle work (about 25–31 ms on that computer)
  "Flashcard sentence, first lookup": 50,
  // 9.20: the Verbs section's example sentences, found for every verb with sentences at once (well under the 50 ms limit of an
  // index built while an answer is shown: about 8 ms for 25 verbs on the computer these were set on), and the two new drills
  // on the session screen and with their answer panel: the slower of two runs plus 25%. From 9.22 the first figure times the
  // first 100 verbs with sentences (as many as 9.20 had), not all of them: the app finds a verb-tense's sentences only when it
  // first needs them (a Verbs session its dozen items, a verb opened in the reference its eight tenses), so no tap waits for
  // every verb's, and timing them all grew with each batch of sentences (56 ms at 200 verbs and 85-115 ms at 300 on the
  // computer 9.22 was tested on) against a limit that doesn't grow. A fixed 100 keeps it a check on the cost of each lookup
  "Verb sentences, first lookup": 50,
  "Draw a session: Verb in a sentence": 12,
  "Draw its answer panel: Verb in a sentence": 18,
  "Draw a session: Which tense fits?": 10,
  "Draw its answer panel: Which tense fits?": 15,
  // 9.26: saved data moved to IndexedDB behind Store. Saving progress now writes only the parts that changed, so a merge
  // from the cloud, which ends by saving, is quicker: "adoptRemote" took 75–112 ms over six runs where 9.25 took 139 on
  // the same computer, and its budget was lowered to the slowest of them plus 25% ("Snapshot: another device's changes"
  // varied too much between runs, 77–129 ms, to lower). New figures, set the same way from six runs, two of them on a
  // slower afternoon: when the saved data is in memory after a reload (the database opened and every row read, while the
  // browser is still reading the app's own script); saving one answer (saveProgress() itself, which holds up the screen,
  // and until the storage has it); and every part of progress compared with what is stored, as when the app is put away
  "Saved data in memory": 820,
  "Save an answer": 21,
  "Save an answer: in the storage": 24,
  "Put away: everything compared": 76,
  // 9.32: the Verb map. Opening it draws its tense rows, filters and first 40 rows (the rest are drawn as the grid scrolls
  // near its end, 40 at a time, each held to the 50 ms limit of a slice of idle work); a keystroke in its filter, "a", leaves
  // nearly every verb, so it draws the most. Set from five runs on a computer that ran this test's other figures at about
  // half their budgets: the slowest plus 25%, doubled, to match them
  "Open the Verb map": 0,
  "Verb map: the next 40 rows": 50,
  "Verb map filter: one keystroke": 0,
};

// Budgets that are limits rather than measurements, which --new-budgets leaves as they are: no slice of idle work, and no
// index built while an answer is shown, may keep a tap waiting longer than this (the usual threshold for a "long task").
const FIXED = { "Idle work: longest slice": 50, "Flashcard sentence, first lookup": 50, "Verb sentences, first lookup": 50, "Verb map: the next 40 rows": 50 };

const args = process.argv.slice(2);
const HEADED = args.includes("--headed");
const NEW_BUDGETS = args.includes("--new-budgets");
const valued = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const AGAINST = valued("--against"), JSON_OUT = valued("--json");
const file = path.resolve(args.find((a, i) => !a.startsWith("--") && !["--against", "--json"].includes(args[i - 1])) || path.join(__dirname, "..", "index.html"));
/* --against other.html (from 9.27; how GitHub runs it): the fixed budgets mean nothing on a computer of another speed, so
   both files are timed here, turn and turn about (the other, this one, the other, this one), each figure's quicker turn
   is taken, and the test fails when a figure of this file is more than 40% slower than the other's and at least 3 ms
   slower (figures of a millisecond or two differ by more than 40% from one run to the next). */
const SLOWER = 1.4, AT_LEAST_MS = 3;
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
  const card = typeof contextFor === "function" && (content.byUnit[fc] || []).find(c => contextFor(c).length); // a card with a sentence (9.7 on)
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
    if (typeof renderVerbMap === "function") { // 9.32 on: the Verb map opened (its first rows), the next rows as it scrolls, and a keystroke in its filter that leaves nearly every verb
      draw({ screen: "home", vm: null });
      add("Open the Verb map", draw({ screen: "vmap" }));
      add("Verb map: the next 40 rows", time(() => { vmMore(); layout(); }));
      add("Verb map filter: one keystroke", time(() => type("vmFilter", "a")));
      draw({ screen: "home", vm: null });
    }
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
    if (card) { CONTEXT = null; add("Flashcard sentence, first lookup", time(() => contextFor(card))); } // 9.7 on: the sentences indexed when a card first needs one
    if (typeof vgCtxExercise === "function") { // 9.20 on: every verb's example sentences found afresh, and the two drills on the session screen, then their answer panels
      const vsVerbs = VERB_GYM.filter(v => VERB_SENTENCES[v.it]).slice(0, 100); // the first 100 verbs with sentences, the same work whatever later batches add (see BUDGETS)
      VS_INDEX = null; add("Verb sentences, first lookup", time(() => vsVerbs.forEach(v => VG_TENSES.forEach(t => { const x = content.items[vgId(v.it, t)]; if (x) verbSentences(x); }))));
      const keep = {}; VG_TENSES.forEach(t => { const id = pid(vgId("andare", t)); keep[id] = progress.items[id]; progress.items[id] = Object.assign({}, rec(id), { box: 3 }); }); // its tenses started, so Which tense fits? can be built
      for (const [name, build, tense, box, given] of [["Verb in a sentence", vgCtxExercise, "passato_prossimo", 1, "vado"], ["Which tense fits?", vgFitExercise, "futuro", 4, "andavamo"]]) {
        const it = content.items[vgId("andare", tense)], ex = { item: it, note: "" };
        if (!build(ex, it, verbSentences(it).find(x => x.clue), box)) throw new Error(name + " could not be built");
        session = { kind: "verbs", unitId: vb, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
        add("Draw a session: " + name, draw({ screen: "session", feedback: null }));
        add("Draw its answer panel: " + name, draw({ feedback: { ok: false, given, note: "" } }));
      }
      Object.entries(keep).forEach(([id, r]) => { if (r) progress.items[id] = r; else delete progress.items[id]; });
      session = null; draw({ screen: "home", feedback: null });
    }
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
  if (typeof Store !== "undefined") Store.set(LS_PROGRESS, progress); else lsSet(LS_PROGRESS, progress);
  Math.random = random;
  return T;
}

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const fmt = (ms) => ms >= 100 ? String(Math.round(ms)) : ms.toFixed(1);

if (AGAINST) compare(); else (async () => {
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
      const storeAt = await page.evaluate(() => (performance.getEntriesByName("ripasso-store-ready")[0] || {}).startTime);
      if (storeAt) (times["Saved data in memory"] = times["Saved data in memory"] || []).push(storeAt); // 9.26 on
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
    if (await page.evaluate("typeof Store !== 'undefined'")) Object.assign(times, await page.evaluate(async (runs) => { // 9.26 on: saving one answer, a record changed as an answer changes it
      const save = [], landed = [], away = [];
      const ids = Object.keys(progress.items);
      for (let i = 0; i < runs + 2; i++) {
        await new Promise(r => setTimeout(r, 300)); // answers come seconds apart
        const id = ids[(i * 131) % ids.length], r = progress.items[id];
        progress.items[id] = Object.assign({}, r, { lastSeen: (r.lastSeen || 0) + 1 }); markItem(id);
        const t0 = performance.now(); saveProgress(); const t1 = performance.now();
        await Store.flush();
        if (i >= 2) { save.push(t1 - t0); landed.push(performance.now() - t0); }
        const t2 = performance.now(); putAway(); if (i >= 2) away.push(performance.now() - t2); // every part compared, as when the app is put away
        await Store.flush();
      }
      clearTimeout(syncTimer);
      return { "Save an answer": save, "Save an answer: in the storage": landed, "Put away: everything compared": away };
    }, RUNS));

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
    if (JSON_OUT) { require("fs").writeFileSync(JSON_OUT, JSON.stringify({ version, figures, errors })); over = errors.length; } // --against: the budgets are not this computer's
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

function compare() {
  const fs = require("fs"), os = require("os"), { spawnSync } = require("child_process");
  const other = path.resolve(AGAINST), dir = fs.mkdtempSync(path.join(os.tmpdir(), "ripasso-perf-"));
  const turn = (f, n) => {
    const out = path.join(dir, n + ".json");
    const r = spawnSync(process.execPath, [__filename, f, "--json", out], { encoding: "utf8" });
    if (!fs.existsSync(out)) { console.log(r.stdout + r.stderr); console.log(`\n  FAIL the speed test stopped on ${f}`); process.exit(1); }
    return JSON.parse(fs.readFileSync(out, "utf8"));
  };
  const runs = { other: [], this: [] };
  for (let k = 0; k < 2; k++) { runs.other.push(turn(other, "other" + k)); runs.this.push(turn(file, "this" + k)); }
  fs.rmSync(dir, { recursive: true, force: true });
  const best = (rs, name) => Math.min(...rs.map(r => r.figures[name]).filter(x => x != null));
  const names = Object.keys(runs.this[0].figures), w = Math.max(...names.map(n => n.length)) + 2;
  console.log(`Speed test, this file (version ${runs.this[0].version}) against ${path.relative(process.cwd(), other) || other} (version ${runs.other[0].version}) on this computer:`);
  console.log(`each timed twice, turn and turn about; the quicker of each figure's two medians, in milliseconds. A figure fails when it is over ${Math.round((SLOWER - 1) * 100)}% and ${AT_LEAST_MS} ms slower.\n`);
  console.log("  " + "".padEnd(w) + "other".padStart(8) + "this".padStart(8) + "change".padStart(9));
  let over = 0, shared = 0;
  for (const name of names) {
    const a = best(runs.other, name), b = best(runs.this, name);
    if (!Number.isFinite(a)) { console.log(`  ${name.padEnd(w)}${"—".padStart(8)}${fmt(b).padStart(8)}${"".padStart(9)}   new`); continue; }
    shared++;
    const bad = name !== "Idle work: longest slice" ? b > a * SLOWER && b - a >= AT_LEAST_MS : b > Math.max(50, a * SLOWER); // a slice of idle work is a limit: over 50 ms, and slower than the other
    if (bad) over++;
    console.log(`  ${name.padEnd(w)}${fmt(a).padStart(8)}${fmt(b).padStart(8)}${((b >= a ? "+" : "") + Math.round(100 * (b - a) / a) + "%").padStart(9)}   ${bad ? "SLOWER" : "ok"}`);
  }
  const errors = runs.this.flatMap(r => r.errors);
  if (errors.length) { over++; console.log("\n  FAIL script errors:\n    " + errors.slice(0, 5).join("\n    ")); }
  if (!shared) { over++; console.log("\n  FAIL no figure could be compared"); }
  console.log(over ? `\n${over} figure(s) over ${Math.round((SLOWER - 1) * 100)}% slower than the other file's.` : `\nAll ${shared} figures are within ${Math.round((SLOWER - 1) * 100)}% of the other file's.`);
  process.exit(over ? 1 : 0);
}
