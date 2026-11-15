#!/usr/bin/env node
/*
  Item test for index.html: the exercises of the grammar units and vocab packs, answered right and
  wrong through the real screen.

  Usage:  node tools/test-items.js u19 [u17 …] [--ids s-u17-p01,g-u17-p01] [--repeats 4]
          node tools/test-items.js --sample [3]
          node tools/test-items.js --all
          … [--seed 7] [--shard 1/3] [path/to/index.html]

  Opens the real app in a headless browser (Playwright + Chromium), with Math.random seeded (the seed
  is printed; --seed N runs the same exercises again), builds exercises with the app's own
  makeExercise as a new item (box 0), a half-learned one (boxes 1 and 3) and a learned one (box 5),
  and answers each the right way by tapping and typing, as a learner would: flip cards, meaning, typed
  recall, fill in the blank with and without options, word order, translate, grammar questions,
  transforms, spot the mistake (tap and type), endings, replies, sort, match and flashcards. Each must
  be marked right, with the right answer among the options offered. Listen and type needs a voice, so
  it isn't built here; tools/test-ui.js covers it.

  Then, once for each kind of exercise in each unit (from 9.26), the same exercise is answered wrong
  through the screen: a wrong option tapped, nonsense typed, a card marked Missed, the wrong word
  tapped, the words sorted and matched wrongly. It must be marked wrong, the panel must say "Not
  quite" (a card: "Marked as missed"), show the right answer, and explain it.

  Which exercises:
    u19 u17 …      every item of the units named (and any ids listed with --ids), at each box,
                   --repeats times each (4 by default), since the app picks the exercise at random.
                   Use this on every unit you add items to: a few minutes per unit.
    --sample [N]   the whole course but the Verbs section (tools/test-verbs.js): in every grammar unit
                   and vocab pack, N exercises (3 by default) of every kind the unit gives, taken from
                   its items in a seeded order. This is the run in npm test and on GitHub: about a
                   minute. tools/test-course.js checks every exercise of every item without the screen.
    --all          every item of every grammar unit and vocab pack, as if each were named: hours.
    --shard K/M    only the K-th of M equal parts of the exercises (to run the parts side by side).

  Use it after adding items, beside node tools/check-content.js, which checks the data; this checks
  that the app accepts the answers the data intends. Changes nothing in index.html. Exits with code 1
  if any check fails.
*/
"use strict";
const path = require("path");
const { loadPlaywright, serveApp, checks } = require("./lib/browser");
const { answerOnScreen } = require("./lib/answer");

const args = process.argv.slice(2);
const VALUED = ["--repeats", "--ids", "--seed", "--shard"];
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const REPEATS = Number(opt("--repeats") || 4);
const SEED = opt("--seed") != null ? Number(opt("--seed")) : 2026;
const ALL = args.includes("--all"), SAMPLE = args.includes("--sample");
const PER = SAMPLE && /^\d+$/.test(args[args.indexOf("--sample") + 1] || "") ? Number(args[args.indexOf("--sample") + 1]) : 3;
const [SHARD, SHARDS] = (opt("--shard") || "1/1").split("/").map(Number);
const extraIds = (opt("--ids") || "").split(",").filter(Boolean);
const units = args.filter((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1]) && !(args[i - 1] === "--sample" && /^\d+$/.test(a)) && !a.endsWith(".html"));
const file = path.resolve(args.find(a => a.endsWith(".html")) || path.join(__dirname, "..", "index.html"));
if (!units.length && !extraIds.length && !ALL && !SAMPLE || !(SHARD >= 1 && SHARD <= SHARDS)) {
  console.log("Usage: node tools/test-items.js u19 [u17 …] [--ids id1,id2] [--repeats 4]\n       node tools/test-items.js --sample [3]   (the whole course, a few of every kind in every unit)\n       node tools/test-items.js --all          (every item of every unit)\n       … [--seed 7] [--shard 1/3] [path/to/index.html]");
  process.exit(1);
}

const { chromium } = loadPlaywright();
const T = checks({ onlyFailures: true });
const few = (list, n = 15) => [...new Set(list)].slice(0, n).join("\n") + (new Set(list).size > n ? `\n… and ${new Set(list).size - n} more` : "");

// Run in the page before the app: a seeded Math.random (mulberry32), so the exercises built are the same each run.
const SEEDER = (seed) => { let s = seed; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

(async () => {
  const server = await serveApp(file);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.addInitScript(SEEDER, SEED);
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => typeof content !== "undefined" && content && content.byUnit && typeof S !== "undefined" && S.screen === "home");
  const t0 = Date.now();

  // The plan, kept in the page: next() builds the next exercise to answer and puts it on the screen, or says it is done.
  const plan = await page.evaluate(([units, extra, ALL, SAMPLE, PER, REPEATS, SHARD, SHARDS]) => {
    const course = content.units.filter(u => u.mode !== "verbs").map(u => u.id); // the Verbs section has its own test
    const missing = units.filter(u => !content.byUnit[u]).concat(extra.filter(id => !content.items[id]));
    if (missing.length) return { missing };
    const BOXES = [0, 1, 3, 5], st = window.__plan = { n: 0, kinds: {}, done: {}, none: [] };
    const show = (ex, unit) => {
      session = { kind: "unit", unitId: unit, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
      S.screen = "session"; S.feedback = null; S.revealed = false; S.picked = null; S.bankPicked = []; S.retry = null; S.flagOpen = false; resetExState(); render();
    };
    const kindOf = (ex) => ex.typeKey + (ex.mode === "typed" || ex.typeKey === "intro" || ex.typeKey === "flip" ? "" : " (" + ex.mode + ")") + (ex.typeKey === "flashcard" ? (ex.english ? " (to English)" : " (to Italian)") : "") + (ex.mode === "spot" ? (ex.fix ? ", typed" : "") + (ex.at < 0 ? ", no mistake" : "") : "");
    function* every(ids) { // every item, box and repeat
      for (const id of ids) for (const box of BOXES) for (let k = 0; k < REPEATS; k++) yield [id, box, null];
    }
    function* sample() { // in each unit, PER exercises of every kind it gives; its items in a seeded order, a few builds of each
      for (const u of course) {
        const have = {}, items = shuffle(content.byUnit[u].map(i => i.id)).slice(0, 400);
        for (const box of BOXES) for (const id of items) for (let k = 0; k < 2; k++) {
          const it = content.items[id], ex = makeExercise(it, Object.assign({}, rec(id), { box }));
          if (!ex) { st.none.push(`${id}, box ${box}`); continue; }
          const key = kindOf(ex);
          if ((have[key] || 0) >= PER) continue;
          have[key] = (have[key] || 0) + 1;
          yield [id, box, ex];
        }
      }
    }
    const ids = ALL ? course.flatMap(u => content.byUnit[u].map(i => i.id)) : units.flatMap(u => content.byUnit[u].map(i => i.id)).concat(extra);
    const jobs = SAMPLE ? sample() : every(ids);
    st.next = () => {
      for (;;) {
        const j = jobs.next(); if (j.done) return null;
        const [id, box] = j.value, it = content.items[id];
        if (st.n++ % SHARDS !== SHARD - 1) continue; // the other parts' exercises are built too, so each part sees the same ones
        const ex = j.value[2] || makeExercise(it, Object.assign({}, rec(id), { box }));
        if (!ex) { st.none.push(`${id}, box ${box}`); return { id, box, none: true }; }
        const kind = kindOf(ex), unit = it.unit;
        st.kinds[ex.typeKey] = (st.kinds[ex.typeKey] || 0) + 1;
        const first = !st.done[unit + "|" + kind]; st.done[unit + "|" + kind] = true;
        st.ex = ex; show(ex, unit);
        return { id, box, unit, kind, typeKey: ex.typeKey, wrongToo: first };
      }
    };
    st.again = () => { const ex = st.ex; delete ex.picked; delete ex.lastSel; delete ex.lastCells; delete ex.lastSlips; show(ex, ex.item.unit); }; // the same exercise once more, to answer wrong
    return { items: SAMPLE ? course.reduce((n, u) => n + content.byUnit[u].length, 0) : ids.length, units: SAMPLE || ALL ? course.length : units.length };
  }, [units, extraIds, ALL, SAMPLE, PER, REPEATS, SHARD, SHARDS]);
  if (plan.missing) { console.error("Not found: " + plan.missing.join(", ")); process.exit(1); }
  console.log(`Item test for ${path.basename(file)}: ${SAMPLE ? `a sample of the whole course (${PER} of every kind in each of ${plan.units} units and packs, ${plan.items} items)` : ALL ? `every item of the course (${plan.items} in ${plan.units} units and packs)` : `${plan.items} items`}${SHARDS > 1 ? `, part ${SHARD} of ${SHARDS}` : ""}, seed ${SEED}`);

  const answer = (right, tag) => answerOnScreen(page, right, tag); // one exercise answered by tapping and typing (tools/lib/answer.js)
  // The answer panel after a wrong answer: what it says, whether the right answer is on the screen, and what explains it.
  const panel = () => page.evaluate(() => {
    const ex = current().ex, fb = document.querySelector("section.fb"), key = (s) => deaccent(normalize(String(s || "")));
    if (!fb) return { none: true };
    const line = key((fb.querySelector(".fb-answer") || {}).textContent), all = key(document.getElementById("app").textContent);
    const answers = [ex.shownAnswer, ex.correct, ex.missedText, ex.answerInContext].concat(Array.isArray(ex.accepted) ? ex.accepted : []).filter(a => typeof a === "string" && a).map(key).filter(Boolean);
    let shown;
    if (ex.mode === "sort") shown = [...document.querySelectorAll(".sortrow")].every(r => r.querySelectorAll("button.right").length === 1);
    else if (ex.mode === "match") shown = ex.item.pairs.every(p => line.includes(key(p[1])));
    else if (ex.mode === "flip") shown = !!S.revealed && answers.some(a => all.includes(a)) || !!ex.backHtml;
    else if (ex.mode === "options") shown = !!document.querySelector("[data-opt].right") && answers.some(a => line.includes(a));
    else shown = answers.some(a => line.includes(a));
    return { bad: fb.classList.contains("bad"), title: (fb.querySelector(".fb-title") || {}).textContent || "", shown, line: (fb.querySelector(".fb-answer") || {}).textContent || "",
      why: fb.querySelectorAll(".why").length, facts: fb.querySelectorAll(".facts").length, table: fb.querySelectorAll("table, .conjtable, .preptable").length, rule: fb.querySelectorAll(".fb-rule").length, mean: fb.querySelectorAll(".mean").length, ctx: fb.querySelectorAll(".fb-ctx").length };
  });

  const bad = [], badWrong = [], kindsWrong = {}, noWhy = {};
  let answered = 0, wrongDone = 0;
  for (;;) {
    const job = await page.evaluate(() => window.__plan.next());
    if (!job) break;
    const tag = `${job.id}, box ${job.box}`;
    if (job.none) { bad.push(`${tag}: no exercise is built`); continue; }
    const r = await answer(true, tag);
    if (r.problem) { bad.push(r.problem); continue; }
    answered++;
    if (!r.done.fb.ok) bad.push(`${tag}, ${r.done.typeKey}: answered “${r.done.correct}”, the right answer, but marked wrong`);
    if (!job.wrongToo) continue;
    // the same exercise, answered wrong
    await page.evaluate(() => window.__plan.again());
    const w = await answer(false, tag);
    if (w.problem) { badWrong.push(w.problem + " (answering wrong)"); continue; }
    wrongDone++; kindsWrong[job.kind] = (kindsWrong[job.kind] || 0) + 1;
    const p = await panel(), flip = w.done.mode === "flip";
    if (w.done.fb.ok) badWrong.push(`${tag}, ${job.kind}: a wrong answer (“${w.done.fb.given}”) was marked right`);
    else if (p.none || !p.bad || p.title !== (flip ? "Marked as missed" : "Not quite")) badWrong.push(`${tag}, ${job.kind}: after a wrong answer the panel says “${p.title || "nothing"}”, not “${flip ? "Marked as missed" : "Not quite"}”`);
    else if (!p.shown) badWrong.push(`${tag}, ${job.kind}: after a wrong answer the right answer isn't shown (the panel has “${p.line}”)`);
    if (!p.none && !(p.why || p.facts || p.table || p.rule || p.mean || p.ctx)) (noWhy[job.kind] = noWhy[job.kind] || []).push(tag);
  }
  const st = await page.evaluate(() => ({ kinds: window.__plan.kinds, none: window.__plan.none }));
  await browser.close(); server.close();

  console.log(`  ${answered} exercises answered right and ${wrongDone} answered wrong through the screen in ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log("  by type: " + Object.entries(st.kinds).map(([k, n]) => `${k} ${n}`).join(", "));
  console.log("  answered wrong: " + Object.entries(kindsWrong).map(([k, n]) => `${k} ${n}`).join(", "));
  T.check("an exercise is built for every item", !st.none.length, few(st.none));
  T.check("every right answer is marked right, among the options offered", !bad.length, few(bad));
  T.check("every wrong answer is marked wrong, with “Not quite” and the right answer shown", !badWrong.length, few(badWrong));
  const unexplained = Object.entries(noWhy).map(([k, tags]) => `${k}: nothing explains the answer (${tags.slice(0, 3).join("; ")}${tags.length > 3 ? "; …" : ""})`);
  T.check("after a wrong answer the panel explains it (a reason, the word's facts, a table, its meaning, a sentence or Read the rule)", !unexplained.length, few(unexplained));
  T.check("exercises were answered", answered > 0 && wrongDone > 0, `${answered} right, ${wrongDone} wrong`);
  if (SAMPLE && SHARDS === 1) {
    const WANT = ["intro", "flip", "meaning", "article", "plural", "agreement", "recall", "conjugation", "bank", "cloze", "translate", "clock", "transform", "preparticle", "number", "spot", "sort", "match", "reply", "endings", "grammar", "flashcard"];
    T.check("every kind of exercise but Listen and type is answered", WANT.every(k => st.kinds[k]), "never built: " + WANT.filter(k => !st.kinds[k]).join(", "));
  }
  T.check("no script errors", !errors.length, errors.slice(0, 5).join("\n"));
  T.summary();
})().catch(e => { T.stopped(e); T.summary(); });
