#!/usr/bin/env node
/*
  Verbs test for index.html: every kind of exercise the Verbs section can produce, answered right and
  wrong through the real screen (from 9.20; tools/test-items.js covers the grammar units and vocab packs).

  Usage:  node tools/test-verbs.js [--all] [--verbs parlare,andare] [--seed 7] [--shard 1/3] [path/to/index.html]

  Opens the real app in a headless browser (Playwright + Chromium), with Math.random seeded so a run
  can be repeated (the seed is printed; --seed N). For each verb-tense item, with every tense of its
  verb started (box 3, so Change the tense, Which tense? and Which tense fits? can be built), it builds
  the item's exercise at boxes 0 to 5 again and again, and answers each kind the item can give the right
  way, in the session screen, as a learner would: the New verb card's Got it, a whole table typed, the
  right option tapped, the right form typed. Every kind: New verb (intro), Verb table (vtable), Pick the
  form (vpick), Verb form (vspot), From English (vmeaning), Change the tense (vswitch), Which verb?
  (vinf), Which tense? (vtenseid), Which person? (vperson), essere or avere? (vaux), Verb in a sentence
  (vctx) and Which tense fits? (vfit). It fails if a right answer is refused, the right answer is
  missing from the options, the panel's example sentence is missing where the tense has one, or a
  script error occurs; and if a kind is never built at all.

  Then, once for each kind in each tense (from 9.27), the same exercise is answered wrong through the
  screen (a wrong option tapped, nonsense typed, a table filled with nonsense): it must be marked wrong,
  the panel must say "Not quite", show the right answer and explain it.

  Weak spots (from 9.31), in a fresh page, through the screen: a wrong cell of a Verb table, Don't know on
  a table and a wrong answer to each drill on one form (Verb form, Pick the form, From English, Change the
  tense, Verb in a sentence, Which tense fits?) are each noted in itapp.vgmiss.v1 as [verb, tense,
  person, times, last time]; a later right answer takes one off, and at nought the cell goes, but not a
  right answer in a repeat; the list survives a reload, holds at most 1,500 cells (the oldest going
  first; its size at the cap is printed), drops damaged entries, and a damaged value or a device that
  refuses to store it costs nothing; it never reaches progress, the cloud's documents or a backup;
  Stats' "Verbs: weak spots" card shows exactly the stored misses by person, by tense and the 8 cells
  missed most; Practise my weak spots takes the verb tenses with misses, most first, its tables asking
  only the persons missed and its drills on one form those persons; and elsewhere a drill on one form
  asks for a person missed in that tense about half the time.

  How much:
    (default)      every verb-tense (3,954 at 9.27), each kind it can give answered once: about four
                   minutes. Until 9.27 each kind was answered once at every box (158,397 exercises,
                   eleven to thirteen minutes, and more with every batch of verbs); tools/test-course.js
                   now checks every exercise at every box without the screen, in seconds.
    --all          every verb-tense, each kind at every box, as before 9.27: the exhaustive run
    --verbs a,b    every tense of the verbs named, every kind at every box
    --shard K/M    only the K-th of M equal parts of the verb-tenses (to run the parts side by side)

  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
const path = require("path");
const { loadPlaywright, serveApp, checks, save, saveText } = require("./lib/browser");

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const ALL = args.includes("--all");
const VERBS = (opt("--verbs") || "").split(",").filter(Boolean);
const SEED = opt("--seed") != null ? Number(opt("--seed")) : 2020;
const [SHARD, SHARDS] = (opt("--shard") || "1/1").split("/").map(Number);
if (!(SHARD >= 1 && SHARD <= SHARDS)) { console.error("--shard K/M: K from 1 to M"); process.exit(1); }
const file = path.resolve(args.find(a => a.endsWith(".html")) || path.join(__dirname, "..", "index.html"));
const KINDS = ["intro", "vtable", "vpick", "vspot", "vmeaning", "vswitch", "vinf", "vtenseid", "vperson", "vaux", "vctx", "vfit"];

const { chromium } = loadPlaywright();
const T = checks({ onlyFailures: true });

// Run in the page before the app: a seeded Math.random (mulberry32), so the sample and the exercises built are the same each run.
const SEEDER = (seed) => { let s = seed; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

(async () => {
  const server = await serveApp(file);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.addInitScript(SEEDER, SEED);
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => typeof content !== "undefined" && content && content.byUnit && content.byUnit.vb);
  const t0 = Date.now();

  // the items: [id, every box?] (every box: each kind at each box; otherwise each kind the item can give, once)
  const plan = await page.evaluate(([ALL, VERBS, SHARD, SHARDS]) => {
    const vb = content.byUnit.vb, missing = VERBS.filter(v => !vb.some(i => i.it === v));
    if (missing.length) return { missing };
    const chosen = VERBS.length ? vb.filter(i => VERBS.includes(i.it)) : vb;
    return { items: chosen.filter((i, k) => k % SHARDS === SHARD - 1).map(i => [i.id, ALL || VERBS.length > 0]) };
  }, [ALL, VERBS, SHARD, SHARDS]);
  if (plan.missing) { console.error("Not verbs in the Verbs section: " + plan.missing.join(", ")); process.exit(1); }
  const sample = VERBS.length ? "the verbs " + VERBS.join(", ") + ", each kind at every box" : ALL ? "every verb-tense, each kind at every box" : "every verb-tense, each kind once";
  console.log(`Verbs test for ${path.basename(file)}: ${plan.items.length} verb-tenses (${sample})${SHARDS > 1 ? `, part ${SHARD} of ${SHARDS}` : ""}, seed ${SEED}`);

  // Build and answer, in the page, in batches: each exercise is drawn in the session screen and answered by tapping and typing there.
  // Small batches (from 9.21): with 200 verbs' sentences a batch of 40 drew thousands of screens in one call, and the page crashed.
  const BATCH = 10, kinds = {}, bad = [], badWrong = [], wrongKinds = {};
  let answered = 0, withSentence = 0, wrongDone = 0;
  for (let k = 0; k < plan.items.length; k += BATCH) {
    const r = await page.evaluate(([batch, wrongSeen]) => {
      const out = { kinds: {}, bad: [], answered: 0, withSentence: 0, badWrong: [], wrong: [] };
      const key = (s) => deaccent(normalize(String(s || "")));
      const show = (ex) => {
        session = { kind: "verbs", unitId: "vb", queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
        S.screen = "session"; S.feedback = null; S.revealed = false; S.picked = null; S.bankPicked = []; S.retry = null; S.flagOpen = false; resetExState(); render();
      };
      const answerWrong = (ex) => { // a wrong answer, by tapping and typing; then what the panel must show. Returns what went wrong, or ""
        if (ex.mode === "table") { for (const p of ex.cells) document.getElementById("vt" + p).value = "zzqx"; $('[data-act="checkTable"]').click(); }
        else if (ex.mode === "options") { const b = [...document.querySelectorAll("[data-opt]")].find(b => b.dataset.opt !== ex.correct); if (!b) return "no wrong option to tap"; b.click(); }
        else { $("#answer").value = "zzqx"; $('[data-act="check"]').click(); }
        const fb = $("section.fb");
        if (!S.feedback || !fb) return "no answer was recorded";
        if (S.feedback.ok) return `a wrong answer (“${S.feedback.given}”) was marked right`;
        const title = (fb.querySelector(".fb-title") || {}).textContent;
        if (!fb.classList.contains("bad") || title !== "Not quite") return `after a wrong answer the panel says “${title}”, not “Not quite”`;
        const line = key((fb.querySelector(".fb-answer") || {}).textContent), all = key(document.getElementById("app").textContent);
        const shown = ex.mode === "table" ? ex.cells.every(p => all.includes(key(ex.item.forms[p])))
          : ex.mode === "options" ? !!$("[data-opt].right") && line.includes(key(ex.shownAnswer || ex.correct))
          : [ex.shownAnswer].concat(ex.accepted).some(a => a && line.includes(key(a)));
        if (!shown) return `after a wrong answer the right answer isn't shown (the panel has “${(fb.querySelector(".fb-answer") || {}).textContent}”)`;
        if (!fb.querySelector(".why, .facts, table, .conjtable, .fb-ctx, .fb-rule, .mean")) return "after a wrong answer nothing explains it";
        return "";
      };
      const $ = (sel) => document.querySelector(sel);
      const answer = (ex) => { // the right answer, by tapping and typing; returns what went wrong, or ""
        if (ex.mode === "vintro") { if (!$('[data-act="introDone"]')) return "no Got it button"; $('[data-act="introDone"]').click(); return ""; }
        if (ex.mode === "table") {
          for (const p of ex.cells) { const el = document.getElementById("vt" + p); if (!el) return "no box for person " + p; el.value = [].concat(ex.accepted[p])[0]; }
          $('[data-act="checkTable"]').click();
        } else if (ex.mode === "options") {
          const btn = [...document.querySelectorAll("[data-opt]")].find(b => b.dataset.opt === ex.correct);
          if (!btn) return `the right answer “${ex.correct}” isn't among the options (${[...document.querySelectorAll("[data-opt]")].map(b => b.dataset.opt).join(" | ")})`;
          if (document.querySelectorAll("[data-opt]").length < 2) return "only one option";
          btn.click();
        } else if (ex.mode === "typed") {
          const el = $("#answer"); if (!el) return "no answer box";
          el.value = [].concat(ex.accepted)[0]; $('[data-act="check"]').click();
        } else return "a screen this test can't answer (" + ex.mode + ")";
        if (!S.feedback) return "no answer was recorded";
        if (!S.feedback.ok) return `answered “${S.feedback.given}”, the right answer, but marked wrong`;
        return "";
      };
      for (const [id, full] of batch) {
        const it = content.items[id];
        for (const t of VG_TENSES) { const x = content.items[vgId(it.it, t)]; if (x) progress.items[pid(x.id)] = Object.assign({}, rec(x.id), { box: 3 }); }
        const hasS = typeof verbSentences === "function" && verbSentences(it).length > 0;
        let seen = new Set();
        for (const box of [0, 1, 2, 3, 4, 5]) {
          if (full) seen = new Set(); // every box: each kind again at each box
          for (let n = 0; n < 80; n++) {
            const ex = makeExercise(it, Object.assign({}, rec(id), { box }));
            if (!ex) { out.bad.push(`${id}, box ${box}: no exercise is built`); break; }
            if (seen.has(ex.typeKey)) continue;
            seen.add(ex.typeKey);
            show(ex);
            const kt = ex.typeKey + " · " + it.tense;
            out.kinds[kt] = (out.kinds[kt] || 0) + 1;
            const why = answer(ex);
            out.answered++;
            if (why) { out.bad.push(`${id}, box ${box}, ${ex.typeKey}: ${why}`); continue; }
            if (ex.mode !== "vintro" && hasS) { // the panel shows the tense in a sentence
              const ctx = document.querySelector(".fb .fb-ctx");
              if (!ctx) out.bad.push(`${id}, box ${box}, ${ex.typeKey}: the answer panel has no example sentence`);
              else out.withSentence++;
            }
            if (ex.mode !== "vintro" && !wrongSeen.includes(kt)) { // once for each kind in each tense: the same exercise answered wrong
              wrongSeen.push(kt); out.wrong.push(kt);
              delete ex.lastCells; show(ex);
              const whyNot = answerWrong(ex);
              if (whyNot) out.badWrong.push(`${id}, box ${box}, ${ex.typeKey}: ${whyNot}`);
            }
          }
        }
      }
      return out;
    }, [plan.items.slice(k, k + BATCH), Object.keys(wrongKinds)]);
    for (const [key, n] of Object.entries(r.kinds)) kinds[key] = (kinds[key] || 0) + n;
    bad.push(...r.bad); answered += r.answered; withSentence += r.withSentence;
    badWrong.push(...r.badWrong); wrongDone += r.wrong.length; for (const kt of r.wrong) wrongKinds[kt] = true;
  }
  // Weak spots (from 9.31), in a fresh page: the drills above have missed cells on purpose
  const weak = await weakSpots(browser, `http://127.0.0.1:${server.address().port}/index.html`);
  await browser.close(); server.close();

  const byKind = {};
  for (const [key, n] of Object.entries(kinds)) { const k = key.split(" · ")[0]; byKind[k] = (byKind[k] || 0) + n; }
  console.log(`  ${answered} exercises answered right and ${wrongDone} answered wrong through the screen in ${Math.round((Date.now() - t0) / 1000)} s; ${withSentence} answer panels with an example sentence`);
  console.log("  by kind: " + KINDS.map(k => `${k} ${byKind[k] || 0}`).join(", "));
  T.check("every right answer is marked right, among the options offered, with the example sentence in the panel", !bad.length, [...new Set(bad)].slice(0, 15).join("\n") + (bad.length > 15 ? `\n… and ${bad.length - 15} more` : ""));
  T.check(`every wrong answer is marked wrong, with “Not quite”, the right answer shown and an explanation (${wrongDone}, once for each kind in each tense)`, !badWrong.length && wrongDone > 0, [...new Set(badWrong)].slice(0, 15).join("\n"));
  const never = KINDS.filter(k => !byKind[k]);
  T.check("every kind of Verbs exercise is built", !never.length, "never built: " + never.join(", "));
  const drilled = new Set(Object.keys(kinds).map(key => key.split(" · ")[1]));
  const want = new Set(plan.items.map(([id]) => id.replace(/^vg-.*?-(presente|passato_prossimo|imperfetto|futuro|condizionale|imperativo|congiuntivo_presente|congiuntivo_imperfetto)$/, "$1")));
  T.check(`every tense of the verbs chosen is drilled (${drilled.size} of ${want.size})`, [...want].every(t => drilled.has(t)), "not drilled: " + [...want].filter(t => !drilled.has(t)).join(", "));
  T.check("no script errors", !errors.length, errors.slice(0, 5).join("\n"));
  for (const [name, ok, detail] of weak) T.check(name, ok, detail);
  T.summary();
})().catch(e => { T.stopped(e); T.summary(); });

/* Weak spots (from 9.31): itapp.vgmiss.v1 through the screen, Stats and Practise my weak spots. Returns [check name, ok, detail]. */
async function weakSpots(browser, url) {
  const out = [], check = (name, ok, detail) => out.push([name, !!ok, detail || ""]);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(SEEDER, SEED + 1);
  await context.addInitScript(() => { // a session of one exercise on the screen, answered right or wrong by tapping and typing (kept across reloads)
    window.__show = (ex, repeat) => { session = { kind: "verbs", unitId: "vb", queue: [{ ex, repeat: !!repeat }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false }; S.screen = "session"; S.feedback = null; S.revealed = false; S.picked = null; S.bankPicked = []; S.retry = null; resetExState(); render(); };
    window.__answer = (ex, wrongCells) => { // wrongCells: for a table, the persons to get wrong; otherwise true for a wrong answer
      const $ = (q) => document.querySelector(q);
      if (ex.mode === "table") { for (const p of ex.cells) document.getElementById("vt" + p).value = wrongCells.includes(p) ? "zzqx" : [].concat(ex.accepted[p])[0]; $('[data-act="checkTable"]').click(); }
      else if (ex.mode === "options") { const b = [...document.querySelectorAll("[data-opt]")].find(b => wrongCells ? b.dataset.opt !== ex.correct : b.dataset.opt === ex.correct); b.click(); }
      else { $("#answer").value = wrongCells ? "zzqx" : [].concat(ex.accepted)[0]; $('[data-act="check"]').click(); }
      return S.feedback && S.feedback.ok;
    };
    window.__ex = (verb, tense, key, box) => { const item = vgItem(verb, tense); for (let n = 0; n < 400; n++) { const ex = makeExercise(item, Object.assign({}, rec(item.id), { box }), key === "vtable" ? "production" : undefined, { prefer: [key], anyKind: true }); if (ex.typeKey === key) return ex; } return null; };
  });
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e))); page.on("dialog", d => d.accept());
  const ready = () => page.waitForFunction(() => typeof S !== "undefined" && S.screen === "home" && content && content.byUnit && content.byUnit.vb);
  await page.goto(url); await ready();
  const KEY = "itapp.vgmiss.v1";
  const stored = () => page.evaluate((k) => Store.read(k), KEY); // what the storage holds, once every save has landed
  // In the page: a few verbs started, and a fresh memory
  await page.evaluate(() => {
    for (const v of ["andare", "parlare", "fare", "venire", "essere"]) for (const t of VG_TENSES) { const i = vgItem(v, t); if (i) progress.items[pid(i.id)] = { box: 3, due: Date.now() + 864e5, lapses: 0, lastSeen: Date.now() - 864e5, lastWrong: 0, seenCount: 3, lastRight: Date.now() }; }
    saveProgress();
    Store.remove("itapp.vgmiss.v1"); VG_MISS = null;
  });
  const cell = (list, verb, tense, p) => (list || []).find(e => e[0] === verb && e[1] === tense && e[2] === p);
  // a table with one cell wrong, then Don't know on another table
  const t1 = await page.evaluate(() => { const ex = __ex("andare", "futuro", "vtable", 3); __show(ex); return __answer(ex, [1, 4]); });
  let st = await stored();
  check("a Verb table with two cells wrong notes those two cells, once each, as [verb, tense, person, times, last time]", t1 === false && st && st.length === 2 && cell(st, "andare", 3, 1) && cell(st, "andare", 3, 1)[3] === 1 && cell(st, "andare", 3, 4) && cell(st, "andare", 3, 4)[4] > 0, JSON.stringify(st));
  await page.evaluate(() => { const ex = __ex("parlare", "presente", "vtable", 3); __show(ex); document.querySelector('[data-act="giveupTable"]').click(); });
  st = await stored();
  check("Don't know on a table notes every cell it asked", [0, 1, 2, 3, 4, 5].every(p => cell(st, "parlare", 0, p)), JSON.stringify(st));
  // each drill on one form, answered wrong
  const drills = await page.evaluate(() => {
    const res = [];
    for (const [key, verb, tense, box] of [["vspot", "venire", "presente", 2], ["vpick", "venire", "imperfetto", 1], ["vmeaning", "venire", "futuro", 2], ["vswitch", "venire", "condizionale", 2], ["vctx", "fare", "presente", 2], ["vfit", "fare", "imperfetto", 4]]) {
      const ex = __ex(verb, tense, key, box);
      if (!ex) { res.push([key, "not built"]); continue; }
      const t = VG_TENSES.indexOf(tense), before = (vgMisses().get(vgMissKey(verb, t, ex.person)) || [0, 0, 0, 0])[3];
      __show(ex); const ok = __answer(ex, true);
      const after = (vgMisses().get(vgMissKey(verb, t, ex.person)) || [0, 0, 0, 0])[3];
      res.push([key, ok === false && after === before + 1 ? "" : `marked ${ok}, count ${before} → ${after}`]);
    }
    return res;
  });
  check("a wrong answer to each drill on one form (Verb form, Pick the form, From English, Change the tense, Verb in a sentence, Which tense fits?) notes its cell", drills.length === 6 && drills.every(d => !d[1]), JSON.stringify(drills));
  // healing: andare futuro tu (1), missed once: missed again, then right twice; a right answer in a repeat heals nothing
  const heal = await page.evaluate(() => {
    const n = () => (vgMisses().get(vgMissKey("andare", 3, 1)) || [0, 0, 0, 0])[3], steps = [n()];
    let ex = __ex("andare", "futuro", "vtable", 3); __show(ex); __answer(ex, [1]); steps.push(n());
    ex = __ex("andare", "futuro", "vtable", 3); __show(ex, true); __answer(ex, []); steps.push(n()); // a repeat, right
    ex = __ex("andare", "futuro", "vtable", 3); __show(ex); __answer(ex, []); steps.push(n());
    ex = __ex("andare", "futuro", "vspot", 3); for (let k = 0; k < 50 && ex.person !== 1; k++) ex = __ex("andare", "futuro", "vspot", 3);
    __show(ex); __answer(ex, false); steps.push(n());
    return steps;
  });
  st = await stored();
  check(`a later right answer takes one off, and at nought the cell goes; a right answer in a repeat doesn't (andare · futuro · tu: ${heal.join(" → ")})`, heal.join() === "1,2,2,1,0" && !cell(st, "andare", 3, 1), JSON.stringify(st));
  // out of progress, the cloud and backups; and a reload
  const kept = await page.evaluate(() => { const all = [JSON.stringify(progress), JSON.stringify(Store.get("itapp.progress.v1")), JSON.stringify(progressToDocs(progress)), backupText()].join("\n"); return !/vgmiss/.test(all) && !/\["andare",3,4,/.test(all) && !/\["parlare",0,/.test(all); });
  check("the list is kept out of progress, the cloud's documents and the backup file", kept);
  const before = JSON.stringify(st);
  await page.reload(); await ready();
  check("it survives a reload", JSON.stringify(await page.evaluate(() => [...vgMisses().values()])) === before && JSON.stringify(await stored()) === before);
  // Stats shows exactly what is stored
  const stats = await page.evaluate(() => {
    S.screen = "stats"; render();
    const card = document.querySelector(".weak"), bars = [...card.querySelectorAll(".wkbars")].map(b => [...b.querySelectorAll(".wkrow")].map(r => [r.querySelector(".wk-l").textContent, Number(r.querySelector(".wk-n").textContent.replace(/\D/g, ""))]));
    const list = [...vgMisses().values()], byP = [0, 0, 0, 0, 0, 0], byT = VG_TENSES.map(() => 0);
    list.forEach(e => { byP[e[2]] += e[3]; byT[e[1]] += e[3]; });
    const top = list.slice().sort((a, b) => b[3] - a[3] || b[4] - a[4]).slice(0, 8).map(e => `${vgPerson(VG_TENSES[e[1]], e[2])} · ${e[0]} · ${TENSE_LABEL[VG_TENSES[e[1]]]}: ${vgItem(e[0], VG_TENSES[e[1]]).forms[e[2]]}, missed ${e[3]} time${e[3] === 1 ? "" : "s"}`);
    const drawn = [...card.querySelectorAll(".wk-top li")].map(li => li.textContent);
    return { persons: JSON.stringify(bars[0]) === JSON.stringify(PERSONS.map((l, i) => [l, byP[i]])), tenses: JSON.stringify(bars[1]) === JSON.stringify(VG_TENSES.map((t, i) => [TENSE_LABEL[t], byT[i]])), top: JSON.stringify(drawn) === JSON.stringify(top), drawn, btn: !!document.querySelector('[data-start="vweak"]:not([disabled])'), n: list.length };
  });
  check(`Stats' Verbs: weak spots shows the stored misses by person and by tense, each bar with its label and number, and the cells missed most (${stats.n} cells)`, stats.persons && stats.tenses && stats.top, JSON.stringify(stats.drawn));
  // Practise my weak spots
  await page.click('[data-start="vweak"]');
  const ws = await page.evaluate(() => {
    const res = { kind: session && session.kind, bad: [], tables: 0, one: 0, ids: vgWeakIds() };
    const check = (q) => {
      const it = q.ex.item, miss = vgMissedPersons(it), P = vgPersons(it), can = miss.filter(p => P.includes(p));
      if (!res.ids.includes(it.id) && it.type === "vtense") res.bad.push(it.id + ": not a weak spot");
      if (q.ex.typeKey === "vtable") { res.tables++; if (can.length && q.ex.cells.some(p => !can.includes(p))) res.bad.push(`${it.id}: a table asks ${q.ex.cells}, the persons missed are ${can}`); }
      if (VG_ONE_FORM.has(q.ex.typeKey)) { res.one++; const sents = verbSentences(it).filter(s => can.includes(s.p)); if (can.length && !can.includes(q.ex.person) && !(["vctx", "vfit"].includes(q.ex.typeKey) && !sents.length)) res.bad.push(`${it.id} ${q.ex.typeKey}: person ${q.ex.person}, missed ${can}`); }
    };
    session.queue.forEach(check);
    const ids = session.queue.map(q => q.ex.item.id);
    res.order = JSON.stringify(uniqueByPid(sessionIds("vweak")).slice().sort()) === JSON.stringify([...new Set(ids)].filter(id => res.ids.includes(id)).sort());
    for (let k = 0; k < 30; k++) buildSession("vweak").queue.forEach(check);
    return res;
  });
  check(`Practise my weak spots runs a session of the verb tenses with misses, its tables asking only the persons missed and its drills on one form those persons (${ws.tables} tables, ${ws.one} drills on one form)`, ws.kind === "vweak" && ws.order && !ws.bad.length && ws.tables > 0 && ws.one > 0, ws.bad.slice(0, 5).join("\n"));
  // elsewhere, a drill on one form asks for a missed person about half the time
  const half = await page.evaluate(() => {
    session = null; S.screen = "home";
    const item = vgItem("essere", "presente"), t = 0, r = Object.assign({}, rec(item.id), { box: 2 });
    const share = (n) => { let hit = 0, all = 0; for (let k = 0; k < n; k++) { const ex = makeExercise(item, r, undefined, { prefer: ["vspot"], anyKind: true }); if (ex.typeKey !== "vspot") continue; all++; if (ex.person === 4) hit++; } return hit / all; };
    for (const k of [...vgMisses().keys()]) if (k.startsWith("essere\n")) vgMisses().delete(k);
    const plain = share(600);
    vgMisses().set(vgMissKey("essere", t, 4), ["essere", t, 4, 2, Date.now()]);
    const missed = share(600);
    vgMisses().delete(vgMissKey("essere", t, 4));
    return { plain, missed };
  });
  check(`elsewhere a drill on one form asks for a person missed in that tense about half the time (voi: ${Math.round(100 * half.plain)}% with no misses, ${Math.round(100 * half.missed)}% once voi is missed; a half plus a sixth would be 58%)`, half.plain < 0.25 && half.missed > 0.48 && half.missed < 0.7, JSON.stringify(half));
  // the cap, damaged entries, its size at the cap
  {
    const list = [];
    for (let i = 0; i < 1600; i++) list.push(["zzverb" + String(i).padStart(4, "0"), i % 8, i % 6, 1 + (i % 4), 1700000000000 + i]);
    list.splice(5, 0, "oops", ["a", 9, 0, 1, 1], ["a", 0, 6, 1, 1], ["a", 0, 0, 0, 1], ["a", 0, 0, 1.5, 1], ["", 0, 0, 1, 1], null, { a: 1 }, ["a", 0, 0, 1]);
    await save(page, KEY, list);
  }
  await page.reload(); await ready();
  const capped = await page.evaluate(() => { const n = vgMisses().size; const ex = __ex("venire", "presente", "vspot", 2); __show(ex); __answer(ex, true); return { n, last: [...vgMisses().values()].pop() }; });
  st = await stored();
  check(`at most 1,500 cells are kept, the oldest going first, and damaged entries are dropped (${capped.n} loaded from 1,600 and 9 damaged; ${st && st.length} after one more)`, capped.n === 1500 && st.length === 1500 && st[0][0] === "zzverb0101" && st[st.length - 1][0] === "venire" && st.every(e => e.length === 5 && typeof e[0] === "string" && e[0]), JSON.stringify(st && st.slice(0, 1)));
  const size = await page.evaluate(() => { const longest = VERB_GYM.map(v => v.it).sort((a, b) => b.length - a.length)[0]; return JSON.stringify(Array.from({ length: VGMISS_CAP }, (_, k) => [longest, 7, 5, 99, Date.now() + k])).length; });
  console.log(`  itapp.vgmiss.v1 at its cap of 1,500 cells, with the longest verb: ${(size / 1024).toFixed(0)} KB`);
  check(`at the cap, with the longest verb, the list takes ${(size / 1024).toFixed(0)} KB: under 100 KB`, size < 100 * 1024);
  const before2 = errors.length;
  for (const raw of ["{not json", "\"oops\"", "42", "{\"a\":1}"]) {
    await saveText(page, KEY, raw);
    await page.reload(); await ready();
    await page.evaluate(() => { const ex = __ex("venire", "presente", "vspot", 2); __show(ex); __answer(ex, true); });
  }
  st = await stored();
  check("a damaged value costs nothing: the app opens, the answer counts and the cell is stored afresh", errors.length === before2 && Array.isArray(st) && st.length === 1 && st[0][0] === "venire", JSON.stringify({ st, errors: errors.slice(before2) }));
  await page.evaluate(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (v, k) { if (k === "itapp.vgmiss.v1") throw new DOMException("no room", "QuotaExceededError"); return put.call(this, v, k); }; });
  const refused = await page.evaluate(() => { const item = vgItem("venire", "presente"), was = (progress.items[pid(item.id)] || {}).seenCount || 0; const ex = __ex("venire", "presente", "vspot", 2); __show(ex); const ok = __answer(ex, true); return { ok, counted: progress.items[pid(item.id)].seenCount === was + 1 }; });
  check("a device that refuses to store it: no script error, and the answer still counts", errors.length === before2 && refused.ok === false && refused.counted, JSON.stringify({ refused, errors: errors.slice(before2) }));
  check("weak spots: no script errors", !errors.length, errors.slice(0, 5).join("\n"));
  await context.close();
  return out;
}
