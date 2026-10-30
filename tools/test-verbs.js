#!/usr/bin/env node
/*
  Verbs test for index.html: every kind of exercise the Verbs section can produce, answered right
  through the real screen (from 9.20; tools/test-items.js covers the grammar units and vocab packs).

  Usage:  node tools/test-verbs.js [--all] [--verbs parlare,andare] [path/to/index.html]

  Opens the real app in a headless browser (Playwright + Chromium), with Math.random seeded so a run
  can be repeated. For each verb-tense item chosen, with every tense of its verb started (box 3, so
  Change the tense, Which tense? and Which tense fits? can be built), it builds the item's exercise
  at boxes 0 to 5 again and again, and answers each kind it gets the right way, in the session
  screen, as a learner would: the New verb card's Got it, a whole table typed, the right option
  tapped, the right form typed. Every kind: New verb (intro), Verb table (vtable), Pick the form
  (vpick), Verb form (vspot), From English (vmeaning), Change the tense (vswitch), Which verb?
  (vinf), Which tense? (vtenseid), Which person? (vperson), essere or avere? (vaux), Verb in a
  sentence (vctx) and Which tense fits? (vfit). It fails if a right answer is refused, the right
  answer is missing from the options, the panel's example sentence is missing where the tense has
  one, or a script error occurs; and if a kind is never built at all.

  Which items:
    (default)      a seeded sample, quick enough for GitHub's checks (a minute or two): every verb-tense
                   with an example sentence (VERB_SENTENCES) and 150 more, at least 15 of each tense
    --all          every verb-tense (3,459 as of 9.20): about ten minutes
    --verbs a,b    every tense of the verbs named, every kind at every box

  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
const path = require("path");
const { loadPlaywright, serveApp, checks } = require("./lib/browser");

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const ALL = args.includes("--all");
const VERBS = (opt("--verbs") || "").split(",").filter(Boolean);
const file = path.resolve(args.find(a => a.endsWith(".html")) || path.join(__dirname, "..", "index.html"));
const KINDS = ["intro", "vtable", "vpick", "vspot", "vmeaning", "vswitch", "vinf", "vtenseid", "vperson", "vaux", "vctx", "vfit"];

const { chromium } = loadPlaywright();
const T = checks({ onlyFailures: true });

// Run in the page before the app: a seeded Math.random (mulberry32), so the sample and the exercises built are the same each run.
const SEED = () => { let s = 2020; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

(async () => {
  const server = await serveApp(file);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.addInitScript(SEED);
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => typeof content !== "undefined" && content && content.byUnit && content.byUnit.vb);
  const t0 = Date.now();

  // the items: [id, full] (full: every kind it gives at every box; otherwise one exercise per box)
  const plan = await page.evaluate(([ALL, VERBS]) => {
    const vb = content.byUnit.vb, missing = VERBS.filter(v => !vb.some(i => i.it === v));
    if (missing.length) return { missing };
    if (ALL) return { items: vb.map(i => [i.id, true]) };
    if (VERBS.length) return { items: vb.filter(i => VERBS.includes(i.it)).map(i => [i.id, true]) };
    const withS = vb.filter(i => typeof verbSentences === "function" && verbSentences(i).length);
    const rest = shuffle(vb.filter(i => !withS.includes(i))), extra = [];
    for (const t of VG_TENSES) extra.push(...rest.filter(i => i.tense === t).slice(0, 15));
    for (const i of rest) if (extra.length >= 150) break; else if (!extra.includes(i)) extra.push(i);
    return { items: withS.concat(extra).map(i => [i.id, true]) };
  }, [ALL, VERBS]);
  if (plan.missing) { console.error("Not verbs in the Verbs section: " + plan.missing.join(", ")); process.exit(1); }
  const sample = ALL ? "every verb-tense" : VERBS.length ? "the verbs " + VERBS.join(", ") : "a seeded sample";
  console.log(`Verbs test for ${path.basename(file)}: ${plan.items.length} verb-tenses (${sample})`);

  // Build and answer, in the page, in batches: each exercise is drawn in the session screen and answered by tapping and typing there.
  const kinds = {}, bad = [];
  let answered = 0, withSentence = 0;
  for (let k = 0; k < plan.items.length; k += 40) {
    const r = await page.evaluate((batch) => {
      const out = { kinds: {}, bad: [], answered: 0, withSentence: 0 };
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
        for (const box of [0, 1, 2, 3, 4, 5]) {
          const seen = new Set();
          for (let n = 0; n < (full ? 80 : 1) ; n++) {
            const ex = makeExercise(it, Object.assign({}, rec(id), { box }));
            if (!ex) { out.bad.push(`${id}, box ${box}: no exercise is built`); break; }
            if (seen.has(ex.typeKey)) continue;
            seen.add(ex.typeKey);
            session = { kind: "verbs", unitId: "vb", queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
            S.screen = "session"; S.feedback = null; S.revealed = false; S.picked = null; S.bankPicked = []; S.retry = null; resetExState(); render();
            const key = ex.typeKey + " · " + it.tense;
            out.kinds[key] = (out.kinds[key] || 0) + 1;
            const why = answer(ex);
            out.answered++;
            if (why) { out.bad.push(`${id}, box ${box}, ${ex.typeKey}: ${why}`); continue; }
            if (ex.mode !== "vintro" && hasS) { // the panel shows the tense in a sentence
              const ctx = document.querySelector(".fb .fb-ctx");
              if (!ctx) out.bad.push(`${id}, box ${box}, ${ex.typeKey}: the answer panel has no example sentence`);
              else out.withSentence++;
            }
          }
        }
      }
      return out;
    }, plan.items.slice(k, k + 40));
    for (const [key, n] of Object.entries(r.kinds)) kinds[key] = (kinds[key] || 0) + n;
    bad.push(...r.bad); answered += r.answered; withSentence += r.withSentence;
  }
  await browser.close(); server.close();

  const byKind = {};
  for (const [key, n] of Object.entries(kinds)) { const k = key.split(" · ")[0]; byKind[k] = (byKind[k] || 0) + n; }
  console.log(`  ${answered} exercises answered through the screen in ${Math.round((Date.now() - t0) / 1000)} s; ${withSentence} answer panels with an example sentence`);
  console.log("  by kind: " + KINDS.map(k => `${k} ${byKind[k] || 0}`).join(", "));
  T.check("every right answer is marked right, among the options offered, with the example sentence in the panel", !bad.length, [...new Set(bad)].slice(0, 15).join("\n") + (bad.length > 15 ? `\n… and ${bad.length - 15} more` : ""));
  const never = KINDS.filter(k => !byKind[k]);
  T.check("every kind of Verbs exercise is built", !never.length, "never built: " + never.join(", "));
  const tenses = await (async () => { const out = {}; for (const key of Object.keys(kinds)) { const [k, t] = key.split(" · "); (out[t] = out[t] || new Set()).add(k); } return out; })();
  T.check(`every tense is drilled (${Object.keys(tenses).length} tenses)`, Object.keys(tenses).length === 8, JSON.stringify(Object.keys(tenses)));
  T.check("no script errors", !errors.length, errors.slice(0, 5).join("\n"));
  T.summary();
})().catch(e => { T.stopped(e); T.summary(); });
