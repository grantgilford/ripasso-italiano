#!/usr/bin/env node
/*
  The course sweep: every exercise of every item, built and checked without a browser (from 9.26).

  Usage:  node tools/test-course.js [path/to/index.html] [--repeats 4] [--units u01,fc03,vb] [--seed 1]

  tools/test-items.js and tools/test-verbs.js answer exercises through the real screen, which is slow, so
  they can only ever cover a sample on each change. This runs the app's own code in Node
  (tools/lib/node-app.js) over the whole course in under a minute: for every item of every grammar unit,
  every vocab pack and the Verbs section, as a new item (box 0), a half-learned one (boxes 1 and 3) and a
  learned one (box 5), --repeats times each (4 by default) with Math.random seeded from the item's id (so
  every run builds the same exercises), with an Italian voice (so Listen and type is built), flashcards
  both ways, and every tense of the Verbs section started:

    built          an exercise is built, of a kind and a mode this test knows
    right answers  every answer the exercise accepts (ex.accepted: a typed answer, each cell of a verb
                   table, each blank of Complete the endings, a mistake's fix) is marked right by
                   checkAnswer with the very options answerTyped, checkTable and checkFields use; and the
                   first one typed through answerTyped itself is marked right
    options        the right answer is offered, once, among at least two options, all different, and
                   tapping it through answerOption is marked right
    wrong options  no wrong option is one the exercise accepts, and tapping one is marked wrong
    by tapping     a mistake to spot is a word of the sentence; every word to sort has one of the groups;
                   every pair to match is there once on each side; word order offers every word of the
                   sentence it wants
    other persons  a conjugation, and every typed form of the Verbs section: each different form of
                   another person in the same tense is refused
    other cards    a flashcard: the answers of a few other cards of its pack are refused, unless the
                   answer is one of the card's own
    nonsense       plain nonsense is refused everywhere something is typed

  One check per unit and rule, with the first few failures listed. It also fails if far fewer exercises
  are built than the course has (items × 4 boxes × repeats), if the course has shrunk below 19,000 items,
  or if a kind of exercise is never built. At 9.26: 19,400 items, 310,400 exercises.

  The options answerTyped uses are written out here once (typedOptions) and compared, for a sample of
  every kind in every unit, with the options the app's answerTyped really hands checkAnswer, so the two
  cannot drift apart unnoticed.

  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
const path = require("path");
const { openApp, seeded, hash } = require("./lib/node-app");
const { checks } = require("./lib/browser");

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const REPEATS = Number(opt("--repeats") || 4), SEED = Number(opt("--seed") || 1);
const ONLY = (opt("--units") || "").split(",").filter(Boolean);
const file = path.resolve(args.find(a => a.endsWith(".html")) || path.join(__dirname, "..", "index.html"));
const BOXES = [0, 1, 3, 5];
const MIN_ITEMS = 19000; // the course at 9.26 has 19,400; far fewer means the content didn't load
const KINDS = ["intro", "flip", "meaning", "article", "plural", "agreement", "recall", "conjugation", "bank", "cloze", "translate", "listen", "clock", "transform", "preparticle", "number",
  "spot", "sort", "match", "reply", "endings", "grammar", "flashcard", "vtable", "vpick", "vspot", "vmeaning", "vswitch", "vinf", "vtenseid", "vperson", "vaux", "vctx", "vfit"];
const MODES = ["typed", "options", "flip", "vintro", "table", "spot", "sort", "match", "fields", "bank"];

const T = checks({ onlyFailures: true }), { check } = T;
const t0 = Date.now();
const app = openApp({ file });
const content = app.content(), { arr, normalize, deaccent, checkAnswer, enForms } = app;
console.log(`Course sweep for ${path.basename(file)} (version ${app.version}): every item at boxes ${BOXES.join(", ")}, ${REPEATS} times each, seed ${SEED}`);

app.clock.t = Date.UTC(2026, 10, 10, 9, 0);
app.setListen(() => true);
const blank = () => ({ box: 0, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 0, lastRight: 0 });
const started = {}; // every tense of the Verbs section started, so Change the tense, Which tense? and Which tense fits? can be built
for (const i of content.byUnit.vb || []) started[app.pid(i.id)] = Object.assign(blank(), { box: 3, due: app.clock.t + 864e5, seenCount: 3 });
const fresh = () => { const p = app.reset(); p.settings.fcDir = "both"; Object.assign(p.items, started); return p; };
let progress = fresh();

// The options answerTyped hands checkAnswer, written out once; compared below with what the app really uses.
const typedOptions = (ex) => ({ typos: !!ex.typos, english: !!ex.english, numWords: !!ex.numWords, itemId: ex.item.id, pronoun: ex.typeKey === "translate" ? arr(ex.item.en).join(" | ") : null, pronounAny: ex.typeKey === "reply" });
const STRICT = { typos: false }; // what checkTable and checkFields use
const key = (s) => deaccent(normalize(s));
const NONSENSE = ["zzqx kjhq"]; // tried once per item and box: a refusal is the slow path of checkAnswer (it looks for the closest answer)

const units = content.units.filter(u => !ONLY.length || ONLY.includes(u.id));
for (const id of ONLY) if (!content.unitById[id]) { console.error(`${id} is not a unit.`); process.exit(1); }
const RULES = ["built", "right answers", "options", "wrong options", "by tapping", "other persons", "other cards", "nonsense"];
const kinds = {}, modes = {};
let built = 0, items = 0, compared = 0;
const drift = [];

for (const u of units) {
  const list = content.byUnit[u.id] || [], bad = {}, tried = {};
  for (const r of RULES) { bad[r] = []; tried[r] = 0; }
  const fail = (rule, item, box, ex, what) => bad[rule].push(`${item.id}, box ${box}${ex ? ", " + ex.typeKey : ""}: ${what}`);
  const sampled = {}; // kinds whose options have been compared with the app's own, in this unit
  const others = list.filter(i => i.type === "vocab"); // for the flashcard check
  for (const item of list) {
    items++;
    for (const box of BOXES) {
      const rnd = seeded(hash(item.id + "|" + box + "|" + SEED));
      app.setRandom(rnd);
      for (let k = 0; k < REPEATS; k++) {
        tried.built++;
        let ex = null;
        try { ex = app.makeExercise(item, Object.assign(blank(), { box, seenCount: box ? 3 : 0 })); } catch (e) { fail("built", item, box, null, "makeExercise threw " + (e && e.message)); continue; }
        if (!ex) { fail("built", item, box, null, "no exercise is built"); continue; }
        if (!KINDS.includes(ex.typeKey) || !MODES.includes(ex.mode)) { fail("built", item, box, ex, `a kind or mode this test doesn't know (${ex.typeKey}, ${ex.mode})`); continue; }
        if (!ex.promptHtml || (ex.mode === "flip" && !ex.backHtml) || (ex.mode === "vintro" && !ex.introHtml)) fail("built", item, box, ex, "nothing to show");
        built++; kinds[ex.typeKey] = (kinds[ex.typeKey] || 0) + 1; modes[ex.mode] = (modes[ex.mode] || 0) + 1;
        const id = app.pid(item.id), saved = progress.items[id];
        const restore = () => { if (saved) progress.items[id] = saved; else delete progress.items[id]; };

        if (ex.mode === "typed") {
          const o = typedOptions(ex), acc = arr(ex.accepted);
          tried["right answers"]++;
          if (!acc.length) fail("right answers", item, box, ex, "no accepted answer");
          for (const a of acc) if (!checkAnswer(a, ex.accepted, o).ok) fail("right answers", item, box, ex, `its own answer “${a}” is refused`);
          if (!sampled[ex.typeKey] || k === 0 && box === 3) { // through answerTyped itself: the first answer is right, and the options are the ones written out above
            const used = app.usedOptions(ex, acc[0]), fb = app.S().feedback;
            if (!fb || !fb.ok) fail("right answers", item, box, ex, `“${acc[0]}” typed through answerTyped is marked wrong`);
            if (JSON.stringify(used) !== JSON.stringify(o)) drift.push(`${ex.typeKey} (${item.id}): answerTyped used ${JSON.stringify(used)}, this test ${JSON.stringify(o)}`);
            sampled[ex.typeKey] = true; compared++; restore();
          }
          if (k === 0) tried.nonsense++;
          if (k === 0) for (const x of NONSENSE) if (checkAnswer(x, ex.accepted, o).ok) fail("nonsense", item, box, ex, `“${x}” is accepted`);
          // every different form of another person in the same tense
          const forms = ex.typeKey === "conjugation" ? item.forms[ex.tense] : item.type === "vtense" && ex.person != null && ex.typeKey !== "vinf" ? item.forms : null;
          if (forms) {
            tried["other persons"]++;
            const own = new Set(acc.map(normalize));
            forms.forEach((f, q) => { if (q === ex.person || !f || f === "—" || f === "-") return;
              for (const v of app.formVariants(f)) if (!own.has(normalize(v)) && checkAnswer(v, ex.accepted, o).ok) fail("other persons", item, box, ex, `“${v}” (${app.PERSONS[q]}) is accepted for ${app.PERSONS[ex.person]} (“${acc[0]}”)`); });
          }
          if (ex.typeKey === "flashcard" && k < 2) { // each way (it is built both ways), three other cards
            tried["other cards"]++;
            const en = !!ex.english, own = new Set(en ? arr(item.en).flatMap(e => enForms(String(e))) : arr(item.it).map(key));
            for (let n = 0; n < 3; n++) {
              const other = others[Math.floor(rnd() * others.length)]; if (!other || app.pid(other.id) === id) continue;
              const ans = String(arr(en ? other.en : other.it)[0]), mine = en ? enForms(ans).some(f => own.has(f)) : own.has(key(ans));
              if (!mine && checkAnswer(ans, ex.accepted, o).ok) fail("other cards", item, box, ex, `“${ans}”, the answer of ${other.id}, is accepted for “${acc[0]}”`);
            }
          }
        } else if (ex.mode === "table") {
          tried["right answers"]++; if (k === 0) { tried.nonsense++; tried["other persons"]++; } // a table is the same on every repeat
          for (const p of ex.cells) {
            const acc = arr(ex.accepted[p]), own = new Set(acc.map(normalize));
            if (!acc.length) fail("right answers", item, box, ex, `no answer for ${app.PERSONS[p]}`);
            for (const a of acc) if (!checkAnswer(a, acc, STRICT).ok) fail("right answers", item, box, ex, `its own answer “${a}” (${app.PERSONS[p]}) is refused`);
            if (k === 0) for (const x of NONSENSE) if (checkAnswer(x, acc, STRICT).ok) fail("nonsense", item, box, ex, `“${x}” is accepted`);
            if (k === 0) item.forms.forEach((f, q) => { if (q === p || !f || f === "—" || f === "-") return;
              for (const v of app.formVariants(f)) if (!own.has(normalize(v)) && checkAnswer(v, acc, STRICT).ok) fail("other persons", item, box, ex, `“${v}” (${app.PERSONS[q]}) is accepted for ${app.PERSONS[p]}`); });
          }
        } else if (ex.mode === "fields") {
          tried["right answers"]++; tried.nonsense++;
          if (!ex.cz.blanks.length) fail("right answers", item, box, ex, "no blanks");
          for (const b of ex.cz.blanks) {
            for (const a of b) if (!checkAnswer(a, b, STRICT).ok) fail("right answers", item, box, ex, `its own ending “${a}” is refused`);
            for (const x of NONSENSE) if (checkAnswer(x, b, STRICT).ok) fail("nonsense", item, box, ex, `“${x}” is accepted`);
          }
        } else if (ex.mode === "options") {
          tried.options++; tried["wrong options"]++;
          const opts = ex.options || [], n = opts.filter(o => o === ex.correct).length;
          if (n !== 1) fail("options", item, box, ex, `the right answer “${ex.correct}” is offered ${n} times (${opts.join(" | ")})`);
          if (opts.length < 2) fail("options", item, box, ex, "fewer than two options");
          if (new Set(opts).size !== opts.length) fail("options", item, box, ex, `two options are the same (${opts.join(" | ")})`);
          // A wrong option must not be an answer. A tap is compared exactly, so options a capital or an accent apart are
          // deliberate (Anna è Italiana. beside italiana, rifa beside rifà): accents count here, and a rule question's
          // options need only be different. Elsewhere a wrong option must not be one the exercise would accept if typed.
          if (ex.typeKey !== "grammar") {
            const english = ex.typeKey === "meaning" && arr(item.en).includes(ex.correct);
            const right = english ? arr(item.en) : arr(ex.accepted).length ? arr(ex.accepted).concat(ex.correct) : [ex.correct];
            progress.settings.accents = "strict";
            for (const o of opts) if (o !== ex.correct && checkAnswer(o, right, { english, typos: false }).ok) fail("wrong options", item, box, ex, `the wrong option “${o}” is accepted (the answer is “${ex.correct}”)`);
            progress.settings.accents = "lenient";
          }
          if (k === 0) { // through answerOption itself
            if (n === 1 && !app.pick(ex, ex.correct).ok) fail("options", item, box, ex, `“${ex.correct}” tapped through answerOption is marked wrong`);
            restore();
            const wrong = opts.find(o => o !== ex.correct);
            if (wrong != null && app.pick(ex, wrong).ok) fail("wrong options", item, box, ex, `“${wrong}” tapped through answerOption is marked right`);
            restore();
          }
        } else if (ex.mode === "spot") {
          tried["by tapping"]++;
          if (item.wrong == null ? ex.at !== -1 : !(ex.at >= 0 && ex.at < ex.tokens.length)) fail("by tapping", item, box, ex, `the mistake “${item.wrong}” is not a word of “${item.it}”`);
          if (ex.fix) {
            tried["right answers"]++; tried.nonsense++;
            const o = typedOptions(ex);
            for (const a of arr(ex.accepted)) if (!checkAnswer(a, ex.accepted, o).ok) fail("right answers", item, box, ex, `its own fix “${a}” is refused`);
            if (!arr(ex.accepted).length) fail("right answers", item, box, ex, "no fix to type");
            if (checkAnswer(item.wrong, ex.accepted, o).ok) fail("right answers", item, box, ex, `the mistake itself, “${item.wrong}”, typed back is accepted`);
            for (const x of NONSENSE) if (checkAnswer(x, ex.accepted, o).ok) fail("nonsense", item, box, ex, `“${x}” is accepted`);
          }
        } else if (ex.mode === "sort") {
          tried["by tapping"]++;
          if (!item.rows.every(r => item.groups.includes(r.group))) fail("by tapping", item, box, ex, "a word's group is not one of the groups");
          if (ex.order.slice().sort((a, b) => a - b).join() !== item.rows.map((r, i) => i).join()) fail("by tapping", item, box, ex, "not every word is shown once");
          if (new Set(item.groups).size !== item.groups.length || item.groups.length < 2) fail("by tapping", item, box, ex, "fewer than two different groups");
        } else if (ex.mode === "match") {
          tried["by tapping"]++;
          const all = item.pairs.map((p, i) => i).join();
          if (ex.left.slice().sort((a, b) => a - b).join() !== all || ex.right.slice().sort((a, b) => a - b).join() !== all) fail("by tapping", item, box, ex, "not every pair is shown once on each side");
          for (const side of [0, 1]) if (new Set(item.pairs.map(p => normalize(p[side]))).size !== item.pairs.length) fail("by tapping", item, box, ex, "two pairs have the same " + (side ? "right" : "left") + " side, so either could be tapped");
        } else if (ex.mode === "bank") {
          tried["by tapping"]++;
          const have = ex.tokens.map(t => t.n), want = ex.targetSeqs[0];
          const left = have.slice(), missing = want.filter(w => { const i = left.indexOf(w); if (i < 0) return true; left.splice(i, 1); return false; });
          if (missing.length) fail("by tapping", item, box, ex, `the words offered lack “${missing.join(" ")}”`);
          if (left.length !== 2 && unitHasSpare(u.id)) fail("by tapping", item, box, ex, `${left.length} extra words, not two`);
          if (left.some(w => ex.targetSeqs.some(t => t.join(" ") === want.concat(w).join(" ")))) fail("by tapping", item, box, ex, "an extra word makes another accepted sentence");
        }
      }
    }
  }
  for (const r of RULES) if (tried[r] || bad[r].length) {
    const all = [...new Set(bad[r])];
    check(`${u.id} ${u.title}: ${r} (${tried[r].toLocaleString("en-GB")})`, !all.length, all.slice(0, 8).join("\n") + (all.length > 8 ? `\n… and ${all.length - 8} more` : ""));
  }
  progress = fresh();
}
function unitHasSpare(unitId) { // a unit with very few sentences can't always give two extra words
  return (content.byUnit[unitId] || []).filter(i => i.type === "sentence").length >= 6;
}

const secs = Math.round((Date.now() - t0) / 1000), expected = items * BOXES.length * REPEATS;
console.log(`  ${items.toLocaleString("en-GB")} items, ${built.toLocaleString("en-GB")} exercises built and checked in ${secs} s`);
console.log("  by kind: " + KINDS.map(k => `${k} ${kinds[k] || 0}`).join(", "));
console.log("  by mode: " + MODES.map(k => `${k} ${modes[k] || 0}`).join(", "));
check(`the options this test checks typed answers with are the ones answerTyped uses (${compared.toLocaleString("en-GB")} compared)`, !drift.length && compared > 0, drift.slice(0, 5).join("\n"));
if (!ONLY.length) {
  check(`the course has at least ${MIN_ITEMS.toLocaleString("en-GB")} items (${items.toLocaleString("en-GB")})`, items >= MIN_ITEMS);
  check(`an exercise was built for every item, box and repeat (${built.toLocaleString("en-GB")} of ${expected.toLocaleString("en-GB")})`, built >= 0.999 * expected && built >= MIN_ITEMS * BOXES.length * REPEATS);
  const never = KINDS.filter(k => !kinds[k]);
  check("every kind of exercise is built", !never.length, "never built: " + never.join(", "));
}
T.summary();
