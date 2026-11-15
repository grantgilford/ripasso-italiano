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

  Then, once for each kind in each tense (from 9.26), the same exercise is answered wrong through the
  screen (a wrong option tapped, nonsense typed, a table filled with nonsense): it must be marked wrong,
  the panel must say "Not quite", show the right answer and explain it.

  How much:
    (default)      every verb-tense (3,954 at 9.26), each kind it can give answered once: about four
                   minutes. Until 9.26 each kind was answered once at every box (158,397 exercises,
                   eleven to thirteen minutes, and more with every batch of verbs); tools/test-course.js
                   now checks every exercise at every box without the screen, in seconds.
    --all          every verb-tense, each kind at every box, as before 9.26: the exhaustive run
    --verbs a,b    every tense of the verbs named, every kind at every box
    --shard K/M    only the K-th of M equal parts of the verb-tenses (to run the parts side by side)

  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
const path = require("path");
const { loadPlaywright, serveApp, checks } = require("./lib/browser");

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
  T.summary();
})().catch(e => { T.stopped(e); T.summary(); });
