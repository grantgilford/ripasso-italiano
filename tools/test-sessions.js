#!/usr/bin/env node
/*
  The session test: how grammar sessions are put together (from version 9.5).

  Usage:  node tools/test-sessions.js [path/to/index.html] [--headed]

  Opens the real app in a headless browser (Playwright + Chromium) with about 6,600 progress records saved
  (tools/lib/seed.js), Math.random replaced by a seeded generator and a stand-in Italian voice (so Listen and
  type is among the choices, as on a phone), and checks:

    1. Balanced sessions: 12-exercise sessions of every grammar kind (Continue and a unit for each grammar unit,
       Review, Wild card, Mistakes, most-missed) and, from 9.31, Verbs sessions (from Today and from Units),
       built many times: never the same kind of exercise (typeKey) three times in a row; at least four kinds
       whenever the items can give four (as many as they can give otherwise: worked out by asking each item
       for every kind and matching kinds to items); and about the same share of typed exercises as the same
       items get without the session's hint (within 3 points), for the grammar sessions and the Verbs sessions
       each. makeExercise's hint keeps the kind: with the same random numbers, a hinted choice is typed exactly
       when the plain one is, for words, sentences and verb tenses. Flashcard sessions are built as before (no
       hint, no new order).
    2. Rotation: each answered grammar exercise, and from 9.31 each answered verb tense, is remembered per
       device in itapp.lasttype.v1 (record id and typeKey, newest last, at most 4,000 from 9.31, never in
       progress; its size at the cap, with the longest ids, is printed and must stay under 200 KB); a vocab
       pack's cards are not; the next session gives an item, or a verb tense, another kind of exercise
       wherever it has one of the same kind (typed or not); a damaged value or a device that refuses to store
       it costs nothing.
    3. Spread: a correct answer that sets the next review at box 3 or above lands within 10% of the interval
       either way, and the dates do spread; boxes 1 and 2, and a wrong answer, keep their exact intervals.
    4. Tricky items (4 or more lapses, box 3 or below): the next session introduces each again (the flip card
       or first exercise, with its explanation; from 9.31 a verb tense's New tense card, called Look again,
       then its whole table); the introduction leaves the record as it was, and the typed follow-up comes
       later in the session and moves the item as usual; an item with 3 lapses, or at box 4, is not tricky;
       Stats lists up to 15, above the "Practise the most-missed items" button.
    5. The forecast on Stats: for each of the next 7 days, the items that fall due that day, grammar, cards
       and verbs, are exactly what dueIds(), flashDueIds() and dueIds("vb") gain from the end of the day
       before to the end of that day; the numbers drawn on Stats are those.
    6. Another round: after a session of every kind (Continue, a grammar unit, Review, Wild card, Mistakes,
       most-missed, Flashcards from Today and from a pack, Verbs from Today and from Units, a lesson section),
       started by tapping, the summary offers Another round beside Back to Today, which starts a session of
       the same kind and unit; it is disabled when nothing is left to practise.
    7. The lesson's order (from 9.6): Continue and a unit's sessions take new items section by section in the
       order of the unit's lesson (ITEM_SECTIONS), the items of one section in a different order from session
       to session, and the items linked to another unit's lesson or to none only after those; on a device with
       no progress and with the seeded one, for every grammar unit. Practise this section: for every section
       with linked items, its session takes only those items, up to the lesson length: the due ones first
       (soonest due first), then new ones, no more than today's new items allow, then the rest, least known
       first; with today's new items used up it takes no new ones.
    8. Focus sessions (from 9.31): Practise this verb, a tense and a family, from the Verbs reference. For
       every tense, every family and 60 verbs, on a new device and with the seeded progress, each session
       takes only matching verb tenses, up to a Verbs session's length: the due ones first (soonest due
       first), then the others started (least known first), then new ones that can open now, in the order of
       VERB_GYM and no more than a Verbs session's new ones; never a tense that hasn't opened; its exercises
       are its items. The chips show each tense's number of verbs started; a focus with nothing started and
       nothing able to open is disabled, with its reason. Another round (section 6) works after each, and the
       summary names the focus ("Focus: imperfetto").
    9. The ladder cap (from 9.31): Settings › Verbs › Open new tenses up to, chosen by tapping, is stored
       with the settings (so it syncs, in the cloud's documents) and drawn as chosen; with it set to the
       imperfetto, on a device with every verb's presente and passato prossimo learned, no session, Verbs or
       focus, ever takes a newer tense as new, while the started ones beyond it still come up for review;
       Today's Verbs tile, the Units card and the reference's rows count new tenses accordingly (worked out
       here the plain way); and set back to All, the next tense opens again.

  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
const path = require("path");
const { loadPlaywright, serveApp, checks } = require("./lib/browser");
const { seedProgress } = require("./lib/seed");

const args = process.argv.slice(2);
const HEADED = args.includes("--headed");
const file = path.resolve(args.find(a => !a.startsWith("--")) || path.join(__dirname, "..", "index.html"));
const { chromium } = loadPlaywright();
const results = checks(), { check, section } = results;
const ready = "typeof content !== 'undefined' && content && typeof S !== 'undefined' && S.screen === 'home'";
const DAY = 864e5;

// Run in the page before the app: a seeded Math.random (mulberry32) and a stand-in Italian voice, so canListen() is true.
const INIT = `(() => {
  let s = 95; Math.random = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  window.__reseed = (n) => { s = n; };
  const voices = [{ name: "Italiano (test)", lang: "it-IT", localService: true, default: false, voiceURI: "it" }];
  const fake = { speaking: false, pending: false, paused: false, getVoices: () => voices, speak(u) { setTimeout(() => u.onend && u.onend({}), 10); }, cancel() { }, resume() { }, pause() { }, addEventListener() { }, removeEventListener() { } };
  Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; this.lang = ""; this.rate = 1; this.voice = null; };
})();`;

async function open(browser, origin, { seed = true, init = "" } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(INIT + init);
  const page = await context.newPage();
  page.errors = []; page.on("pageerror", e => page.errors.push(String(e)));
  page.on("dialog", d => d.accept());
  await page.goto(origin + "/index.html"); await page.waitForFunction(ready);
  if (seed) { await page.evaluate(seedProgress); await page.reload(); await page.waitForFunction(ready); }
  return { page, context };
}
// In the page: answer the rest of the session right (a flip card "Got it", a table filled), up to the summary.
const FINISH = () => { for (let n = 0; S.screen === "session" && n < 400; n++) { if (!S.feedback) finishAnswer(true, "", ""); continueSession(); } return S.screen; };

(async () => {
  const server = await serveApp(file);
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    console.log(`Session test for ${path.relative(process.cwd(), file) || file}`);

    /* 1 and 2. Balanced sessions, and rotation */
    {
      const { page, context } = await open(browser, origin);
      section("1. Balanced sessions");
      const r = await page.evaluate(() => {
        progress.settings.lessonLength = 12;
        const units = content.units.filter(u => !isSideUnit(u.id)).map(u => u.id);
        const kinds = [];
        for (const u of units) kinds.push(["continue", u], ["unit", u]);
        for (let k = 0; k < 6; k++) kinds.push(["review"], ["wild"], ["mistakes"], ["hard"]);
        for (let k = 0; k < 20; k++) kinds.push(["verbs"], ["verbs", "vb"]); // from 9.31: Verbs from Today and from Units
        const out = { sessions: 0, exercises: 0, triples: [], unavoidable: 0, fewKinds: [], kindsHist: {}, typed: 0, typedPlain: 0, plainN: 0, flash: "", tooShort: 0,
          verbs: { sessions: 0, kindsHist: {}, typed: 0, typedPlain: 0, plainN: 0 } };
        // the kinds each item can give at its box: makeExercise asked for each kind in turn (anyKind), as the session's last pass asks
        const can = (q) => q.reintro || !isBalancedUnit(q.ex.item.unit) ? new Set([q.ex.typeKey]) : new Set(HINT_KEYS.concat([q.ex.typeKey]).map(k => (makeExercise(q.ex.item, rec(q.ex.item.id), undefined, { prefer: [k], anyKind: true }) || {}).typeKey).filter(Boolean));
        const matching = (sets) => { // the most kinds that distinct items can give (Kuhn's augmenting paths)
          const owner = {}, ks = [...new Set(sets.flatMap(s => [...s]))];
          const tryKind = (k, seen) => { for (let i = 0; i < sets.length; i++) if (sets[i].has(k) && !seen.has(i)) { seen.add(i); if (owner[i] == null || tryKind(owner[i], seen)) { owner[i] = k; return true; } } return false; };
          return ks.filter(k => tryKind(k, new Set())).length;
        };
        for (const [kind, unit] of kinds) for (let rep = 0; rep < 4; rep++) {
          if (kind === "continue") progress.currentUnit = unit;
          const s = buildSession(kind, unit), keys = s.queue.map(q => q.ex.typeKey), n = keys.length;
          if (!n) continue;
          out.sessions++; out.exercises += n;
          const v = kind === "verbs" ? out.verbs : null; if (v) v.sessions++;
          const tally = {}; keys.forEach(k => tally[k] = (tally[k] || 0) + 1);
          const avoidable = Object.values(tally).every(c => c <= 2 * (n - c) + 2);
          const at = keys.findIndex((k, i) => i >= 2 && keys[i - 1] === k && keys[i - 2] === k);
          if (at >= 0) { if (avoidable) out.triples.push(`${kind} ${unit || ""}: ${keys.join(" ")}`); else out.unavoidable++; }
          const distinct = Object.keys(tally).length, want = Math.min(4, Math.ceil(n / 3)), best = Math.min(want, matching(s.queue.map(can)));
          if (n === 12) out.kindsHist[distinct] = (out.kindsHist[distinct] || 0) + 1; else out.tooShort++;
          if (v && n === 12) v.kindsHist[distinct] = (v.kindsHist[distinct] || 0) + 1;
          if (distinct < best) out.fewKinds.push(`${kind} ${unit || ""}: ${distinct} kinds, the items could give ${best}: ${keys.join(" ")}`);
          // the same items without the session's hint, as 9.4 built them (tricky items' introductions left out of both)
          for (const q of s.queue) if (!q.reintro) {
            if (q.ex.kind === "production") { out.typed++; if (v) v.typed++; }
            const plain = makeExercise(q.ex.item, rec(q.ex.item.id));
            if (plain) { out.plainN++; if (plain.kind === "production") out.typedPlain++; if (v) { v.plainN++; if (plain.kind === "production") v.typedPlain++; } }
          }
        }
        // Flashcard sessions: with the same random numbers, the same items and exercises as plain makeExercise in shuffled order
        for (const [kind, unit] of [["flashcards"], ["flashcards", "fc01"]]) {
          window.__reseed(4242); const s = buildSession(kind, unit);
          window.__reseed(4242); const plain = shuffle(uniqueByPid(sessionIds(kind, unit))).map(id => makeExercise(content.items[id], rec(id))).filter(Boolean);
          const a = s.queue.map(q => q.ex.item.id + ":" + q.ex.typeKey).join(), b = plain.map(ex => ex.item.id + ":" + ex.typeKey).join();
          if (!s.queue.length || a !== b) out.flash += `${kind} ${unit || ""}: ${a.slice(0, 120)} / ${b.slice(0, 120)}\n`;
        }
        return out;
      });
      const share = (a, b) => (100 * a / b).toFixed(1) + "%";
      console.log(`         ${r.sessions} sessions, ${r.exercises} exercises; kinds in a 12-exercise session: ${Object.entries(r.kindsHist).map(([k, v]) => `${k}: ${v}`).join(", ")}; typed ${share(r.typed, r.plainN)} (without the hint ${share(r.typedPlain, r.plainN)})`);
      check(`no session has the same kind three times in a row where its mix allows another order (${r.sessions} sessions${r.unavoidable ? `; ${r.unavoidable} whose items give one kind too often to avoid it` : ""})`, r.sessions > 150 && !r.triples.length, r.triples.slice(0, 5).join("\n"));
      check("every session has at least four kinds of exercise when its items can give four (or as many as they can)", !r.fewKinds.length, r.fewKinds.slice(0, 5).join("\n"));
      check(`about the same share of typed exercises as without the hint (${share(r.typed, r.plainN)} against ${share(r.typedPlain, r.plainN)}, within 3 points)`, Math.abs(r.typed - r.typedPlain) / r.plainN <= 0.03);
      const vb = r.verbs;
      console.log(`         Verbs: ${vb.sessions} sessions; kinds in a 12-exercise session: ${Object.entries(vb.kindsHist).map(([k, v]) => `${k}: ${v}`).join(", ")}; typed ${share(vb.typed, vb.plainN)} (without the hint ${share(vb.typedPlain, vb.plainN)})`);
      check(`Verbs sessions are balanced too (from 9.31): ${vb.sessions} built, counted in the checks above, each of 12 with at least four kinds`, vb.sessions === 160 && Object.keys(vb.kindsHist).length && Object.keys(vb.kindsHist).every(k => Number(k) >= 4), JSON.stringify(vb.kindsHist));
      check(`…with about the same share of typed exercises as without the hint (${share(vb.typed, vb.plainN)} against ${share(vb.typedPlain, vb.plainN)}, within 3 points)`, vb.plainN > 300 && Math.abs(vb.typed - vb.typedPlain) / vb.plainN <= 0.03);
      check("flashcard sessions are built as before: the same items and exercises, in the shuffled order", !r.flash, r.flash);

      const kept = await page.evaluate(() => { // the hint never changes the kind: the same random numbers, with and without a hint
        const ids = Object.keys(content.items).filter(id => isBalancedUnit(content.items[id].unit) && ["vocab", "sentence", "vtense"].includes(content.items[id].type)).filter((_, k) => k % 9 === 0);
        let n = 0, verbs = 0; const bad = [];
        for (const id of ids) for (const box of [0, 1, 2, 3, 5]) for (const force of [undefined, "production"]) {
          const item = content.items[id], r = Object.assign({}, rec(id), { box }), hint = { avoid: [HINT_KEYS[n % HINT_KEYS.length]], prefer: HINT_KEYS.filter((_, k) => (k + n) % 3 === 0) };
          window.__reseed(n * 7919 + 1); const a = makeExercise(item, r, force);
          window.__reseed(n * 7919 + 1); const b = makeExercise(item, r, force, hint);
          n++; if (item.type === "vtense") verbs++;
          if (a && b && a.kind !== b.kind) bad.push(`${id} box ${box}${force ? " follow-up" : ""}: ${a.typeKey} (${a.kind}) became ${b.typeKey} (${b.kind})`);
        }
        return { n, bad, verbs };
      });
      check(`makeExercise's hint keeps the kind: of ${kept.n} exercises built with the same random numbers (words, sentences and from 9.31 verb tenses), a hinted one is typed exactly when the plain one is`, kept.n > 1000 && kept.verbs > 2000 && !kept.bad.length, kept.bad.slice(0, 5).join("\n"));

      section("2. Rotation: another kind of exercise for an item, per device");
      const rot = await page.evaluate(() => {
        const out = {};
        Store.remove("itapp.lasttype.v1"); LAST_TYPES = null;
        startSession("review");
        const answered = [];
        for (let n = 0; S.screen === "session" && n < 60; n++) { const q = current(); if (!S.feedback) { answered.push([pid(q.ex.item.id), q.ex.typeKey]); finishAnswer(true, "", ""); } continueSession(); }
        const saved = Store.get("itapp.lasttype.v1");
        const last = new Map(); answered.forEach(([id, k]) => { last.delete(id); last.set(id, k); });
        out.saved = Array.isArray(saved) && saved.length === last.size && saved.every(([id, k]) => last.get(id) === k) && saved.map(p => p[0]).join() === [...last.keys()].join();
        out.notInProgress = !JSON.stringify(progress).includes("lasttype") && !JSON.stringify(Store.get("itapp.progress.v1")).includes("lasttype");
        S.screen = "home"; session = null;
        // a Verbs session's verb tenses are remembered too (from 9.31), each as its last kind
        startSession("verbs");
        const vAnswered = [];
        for (let n = 0; S.screen === "session" && n < 60; n++) { const q = current(); if (!S.feedback) { vAnswered.push([pid(q.ex.item.id), q.ex.typeKey]); finishAnswer(true, "", ""); } continueSession(); }
        const vSaved = new Map(Store.get("itapp.lasttype.v1")), vLast = new Map(); vAnswered.forEach(([id, k]) => vLast.set(id, k));
        out.verbsSaved = vLast.size >= 8 && [...vLast].every(([id, k]) => id.startsWith("vg-") && vSaved.get(id) === k);
        S.screen = "home"; session = null;
        // a vocab pack's cards are not remembered
        const before = JSON.stringify(Store.get("itapp.lasttype.v1"));
        startSession("flashcards"); for (let n = 0; S.screen === "session" && n < 8; n++) { if (!S.feedback) finishAnswer(true, "", ""); continueSession(); }
        out.cardsLeftOut = JSON.stringify(Store.get("itapp.lasttype.v1")) === before;
        session = null; S.screen = "home";
        // the next sessions: where an item's exercise has another of the same kind (typed or not), it is another kind.
        // Review 40 times brings back the same most-overdue items each time, so (from 9.13) every grammar unit's session
        // is built 6 times too, and the sample doesn't hang on which few items the seeded progress makes most overdue.
        const kindsAt = (item, r) => { const m = {}; for (const k of HINT_KEYS) { const ex = makeExercise(item, r, undefined, { prefer: [k], anyKind: true }); if (ex && ex.typeKey === k) m[k] = ex.kind; } return m; };
        let could = 0, same = 0, plainSame = 0;
        const plan = [];
        for (let rep = 0; rep < 40; rep++) plan.push(["review"]);
        for (let rep = 0; rep < 6; rep++) for (const u of content.units.filter(u => !isSideUnit(u.id) && !u.mode && u.id !== "vb")) plan.push(["unit", u.id]);
        for (let rep = 0; rep < 40; rep++) plan.push(["verbs"]); // from 9.31
        const v = { could: 0, same: 0, plainSame: 0 };
        for (const [kind, unit] of plan) {
          const s = buildSession(kind, unit);
          for (const q of s.queue) {
            if (q.reintro || !isBalancedUnit(q.ex.item.unit)) continue;
            const id = pid(q.ex.item.id), was = lastTypes().get(id), r = rec(q.ex.item.id), isV = q.ex.item.type === "vtense";
            if (was) {
              const m = kindsAt(q.ex.item, r), cls = m[q.ex.typeKey], alts = Object.keys(m).filter(k => m[k] === cls && k !== was);
              if (cls && m[was] === cls && alts.length) {
                const p = makeExercise(q.ex.item, r);
                could++; if (q.ex.typeKey === was) same++; if (p && p.typeKey === was) plainSame++;
                if (isV) { v.could++; if (q.ex.typeKey === was) v.same++; if (p && p.typeKey === was) v.plainSame++; }
              }
            }
            noteType(q.ex);
          }
        }
        Object.assign(out, { could, same, plainSame, v });
        // capped at 4,000 (from 9.31; 2,000 before), newest last
        const many = Array.from({ length: 4100 }, (_, k) => ["old-" + k, "recall"]);
        Store.set("itapp.lasttype.v1", many); LAST_TYPES = null;
        const g = Object.values(content.items).find(i => i.unit === "u02" && i.type === "grammar_mc");
        noteType({ item: g, typeKey: "grammar" });
        const capped = Store.get("itapp.lasttype.v1");
        out.capped = capped.length === 4000 && capped[capped.length - 1][0] === pid(g.id) && capped[0][0] === "old-101";
        // its size at the cap: the longest record ids (half grammar items, half verb tenses) with the longest kinds
        const longest = (f, n) => [...new Set(Object.keys(content.items).filter(id => f(content.items[id])).map(pid))].sort((a, b) => b.length - a.length).slice(0, n);
        const fullList = longest(i => !isSideUnit(i.unit), 2000).map(id => [id, "translate"]).concat(longest(i => i.type === "vtense", 2000).map(id => [id, "vtenseid"]));
        out.capSize = JSON.stringify(fullList).length;
        // damaged values are ignored (a row whose text can't be read at all is the storage test's: it reads as nothing saved)
        out.damaged = [];
        for (const v of ["\"not a list\"", "{\"a\":1}", "[1,2,[3]]", "null", "[[\"x\"]]"]) {
          Store.set("itapp.lasttype.v1", JSON.parse(v)); LAST_TYPES = null;
          try { const s = buildSession("review"); if (!s.queue.length) out.damaged.push(v + ": an empty session"); noteType(s.queue[0].ex); } catch (e) { out.damaged.push(v + ": " + e.message); }
        }
        return out;
      });
      check("each answered grammar exercise is remembered in itapp.lasttype.v1, as [record id, typeKey], newest last", rot.saved);
      check("…and so is each answered verb tense in a Verbs session (from 9.31)", rot.verbsSaved);
      check("…never in progress, so it never syncs", rot.notInProgress);
      check("…and a vocab pack's cards are not", rot.cardsLeftOut);
      check(`the next time, an item that has another exercise of the same kind gets another one (${rot.same} of ${rot.could} the same as last time; ${rot.plainSame} without the memory)`, rot.could > 100 && rot.same <= rot.could * 0.03 && rot.plainSame > rot.could * 0.15);
      check(`…and so does a verb tense in a Verbs session (${rot.v.same} of ${rot.v.could} the same as last time; ${rot.v.plainSame} without the memory)`, rot.v.could > 100 && rot.v.same <= rot.v.could * 0.03 && rot.v.plainSame > rot.v.could * 0.1);
      check("the memory is capped at 4,000 items (from 9.31, as verb tenses share it), the oldest dropped first", rot.capped);
      check(`at the cap, with the longest ids, it takes ${(rot.capSize / 1024).toFixed(0)} KB: under 200 KB`, rot.capSize > 0 && rot.capSize < 200 * 1024);
      check("a damaged memory is ignored, and sessions still build", !rot.damaged.length, rot.damaged.join("\n"));
      check("no script errors", !page.errors.length, page.errors.slice(0, 3).join("\n"));
      await context.close();

      // a device that refuses to store anything new: sessions still run, nothing is remembered, nothing breaks
      const { page: p2, context: c2 } = await open(browser, origin, { seed: false, init: `Storage.prototype.setItem = function () { throw new Error("quota"); }; IDBObjectStore.prototype.put = function () { throw new Error("quota"); };` });
      await p2.evaluate(() => startSession("wild"));
      const refused = { scr: await p2.evaluate(FINISH), saved: await p2.evaluate(() => Store.get("itapp.lasttype.v1")), saving: await p2.evaluate(() => Store.status().backend + ":" + S.saveFailed) };
      check("a device that refuses to save still runs a whole session, remembering nothing", refused.scr === "summary" && refused.saved === null && !p2.errors.length, JSON.stringify(refused) + p2.errors.join("\n"));
      await c2.close();
    }

    /* 3. Spread */
    {
      const { page, context } = await open(browser, origin);
      section("3. Spread: reviews at box 3 and above move by up to 10%");
      const r = await page.evaluate(() => {
        const ids = Object.keys(content.items).filter(id => content.items[id].type === "vocab" && !isSideUnit(content.items[id].unit) && pid(id) === id).slice(0, 700);
        const out = { off: [], exact: [], ratios: {} };
        ids.forEach((id, k) => {
          const to = 1 + (k % 7), t0 = Date.now(); // the box it reaches
          progress.items[id] = { box: to - 1, due: t0 - 1000, lapses: 0, lastSeen: t0 - 864e5, lastWrong: 0, seenCount: 3, lastRight: 0 };
          if (to === 1) progress.items[id].box = 0;
          applyResult(id, true, "production", false, "recall");
          const r = progress.items[id], iv = INTERVALS[r.box], ratio = (r.due - r.lastSeen) / iv;
          (out.ratios[r.box] = out.ratios[r.box] || []).push(ratio);
          if (r.box >= 3 && !(ratio >= 0.9 - 1e-9 && ratio <= 1.1 + 1e-9)) out.off.push(`${id} box ${r.box}: ${ratio.toFixed(3)} of the interval`);
          if (r.box <= 2 && ratio !== 1) out.exact.push(`${id} box ${r.box}: ${ratio}`);
        });
        const wrongId = ids[0]; progress.items[wrongId].due = 0; applyResult(wrongId, false, "production", false, "recall");
        const w = progress.items[wrongId]; out.wrong = w.due - w.lastSeen === INTERVALS[1];
        out.spread = Object.entries(out.ratios).filter(([b]) => b >= 3).map(([b, rs]) => [b, Math.min(...rs), Math.max(...rs), rs.length]);
        return out;
      });
      check("from box 3 up, a correct answer's next review is within 10% of the interval either way", !r.off.length, r.off.slice(0, 5).join("\n"));
      check(`…and the dates do spread, both ways, at every box from 3 to 7 (${r.spread.map(([b, lo, hi]) => `box ${b}: ${lo.toFixed(3)}–${hi.toFixed(3)}`).join(", ")})`, r.spread.length === 5 && r.spread.every(([, lo, hi, n]) => n >= 50 && lo < 0.95 && hi > 1.05));
      check("boxes 1 and 2 keep exactly 10 minutes and 1 day", !r.exact.length, r.exact.slice(0, 5).join("\n"));
      check("a wrong answer keeps exactly 10 minutes", r.wrong);
      check("no script errors", !page.errors.length, page.errors.slice(0, 3).join("\n"));
      await context.close();
    }

    /* 4. Tricky items */
    {
      const { page, context } = await open(browser, origin, { seed: false });
      section("4. Tricky items are introduced again");
      const r = await page.evaluate(() => {
        const T = Date.now(), pick = (f) => Object.values(content.items).find(i => isBalancedUnit(i.unit) && pid(i.id) === i.id && f(i)).id;
        const cases = [["a word", pick(i => i.type === "vocab"), 2], ["a sentence", pick(i => i.type === "sentence" && i.cloze), 3], ["a verb", pick(i => i.type === "verb"), 1],
          ["a transform", pick(i => i.type === "transform"), 2], ["a grammar question", pick(i => i.type === "grammar_mc"), 2], ["a number", pick(i => i.type === "number"), 3],
          ["a verb tense (from 9.31)", pick(i => i.type === "vtense" && i.tense === "imperfetto"), 2]];
        const ids0 = cases.map(c => c[1]), notTricky = [pick(i => i.type === "vocab" && !ids0.includes(i.id)), pick(i => i.type === "sentence" && i.cloze && !ids0.includes(i.id))];
        progress.items = {};
        for (const [, id, box] of cases) progress.items[id] = { box, due: T - 1000, lapses: 4 + box, lastSeen: T - 864e5, lastWrong: T - 3 * 864e5, seenCount: 12, lastRight: T - 864e5 };
        progress.items[notTricky[0]] = { box: 2, due: T - 1000, lapses: 3, lastSeen: T - 864e5, lastWrong: T - 3 * 864e5, seenCount: 8, lastRight: T - 864e5 };
        progress.items[notTricky[1]] = { box: 4, due: T - 1000, lapses: 6, lastSeen: T - 864e5, lastWrong: T - 3 * 864e5, seenCount: 8, lastRight: T - 864e5 };
        saveProgress();
        const out = { intro: [], notTricky: [], moved: [], follow: [], why: [], promoted: [] };
        const s = buildSession("hard");
        for (const [label, id, box] of cases) {
          const q = s.queue.find(x => x.ex.item.id === id);
          const want = content.items[id].type === "vocab" ? ["flip", "meaning"] : [makeExercise(content.items[id], Object.assign({}, rec(id), { box: 0 })).typeKey];
          if (!q || !q.reintro || !q.ex.showWhy || !want.includes(q.ex.typeKey)) out.intro.push(`${label} (${id}, box ${box}): ${q ? q.ex.typeKey + (q.reintro ? "" : ", not marked") : "missing"}`);
          else if (q.ex.mode === "vintro" && !/^Look again · /.test(q.ex.type)) out.intro.push(`${label}: called “${q.ex.type}”, not Look again`);
        }
        for (const id of notTricky) { const q = s.queue.find(x => x.ex.item.id === id); if (!q || q.reintro) out.notTricky.push(id); }
        // answer every introduction right: a recognition one on an item with a typed exercise leaves the record alone and brings a typed follow-up
        session = s; S.screen = "session"; S.feedback = null; resetExState();
        const seen = {};
        for (let n = 0; S.screen === "session" && n < 80; n++) {
          const q = current(), id = q.ex.item.id, before = JSON.stringify(progress.items[pid(id)]);
          if (!S.feedback) {
            const card = q.ex.mode === "vintro" && document.querySelector(".card.vintro"); // a verb tense's card is its explanation: Got it moves straight on
            const cardWhy = !!card && card.textContent.includes(TENSE_USE[q.ex.item.tense]) && !!card.querySelector(".conjtable");
            finishAnswer(true, "", "");
            const c = cases.find(x => x[1] === id);
            if (c && q.reintro) {
              const teach = q.ex.kind === "recognition" && itemHasProduction(q.ex.item);
              seen[id] = { teach, at: session.pos };
              if (teach && JSON.stringify(progress.items[pid(id)]).replace(/"(lastSeen|seenCount)":\d+/g, "") !== before.replace(/"(lastSeen|seenCount)":\d+/g, "")) out.moved.push(`${c[0]}: ${before} → ${JSON.stringify(progress.items[pid(id)])}`);
              if (q.ex.mode === "vintro" ? !cardWhy : !document.querySelector(".fb .why, .fb .facts")) out.why.push(c[0]);
              const f = session.queue.findIndex((x, i) => i > session.pos && x.followup && x.ex.item.id === id);
              if (teach && !(f > session.pos && (f >= session.pos + 3 || f === session.queue.length - 1) && f <= session.pos + 6 && session.queue[f].ex.kind === "production")) out.follow.push(`${c[0]}: follow-up at ${f}, now ${session.pos}`);
              else if (teach && q.ex.item.type === "vtense" && session.queue[f].ex.typeKey !== "vtable") out.follow.push(`${c[0]}: the follow-up is ${session.queue[f].ex.typeKey}, not the whole table`);
              if (!teach && f >= 0) out.follow.push(`${c[0]}: a follow-up after a typed or rule exercise`);
            } else if (c && q.followup) {
              const was = JSON.parse(before), now = progress.items[pid(id)];
              if (!(now.box === was.box + 1 && now.due > Date.now())) out.promoted.push(`${c[0]}: box ${was.box} → ${now.box}`);
            } else if (c && !seen[id] && !q.repeat) out.intro.push(`${c[0]}: answered without its introduction`);
          }
          continueSession();
        }
        // Stats: the list, above the most-missed button
        S.screen = "stats"; render();
        const rows = [...document.querySelectorAll(".group")].find(g => /Tricky items/.test(g.textContent));
        const btn = document.querySelector('[data-start="hard"]');
        out.stats = !!rows && rows.querySelectorAll("tr").length === counts().tricky.length && !!btn && !!(rows.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING);
        out.listed = counts().tricky.map(t => t[0]);
        // up to 15
        const many = Object.values(content.items).filter(i => i.unit === "u06" && pid(i.id) === i.id).slice(0, 25).map(i => i.id);
        many.forEach((id, k) => { progress.items[id] = { box: 1 + (k % 3), due: Date.now() + 864e5, lapses: 4 + (k % 5), lastSeen: Date.now(), lastWrong: Date.now() - 864e5, seenCount: 9, lastRight: Date.now() }; });
        saveProgress(); render();
        const t = counts().tricky;
        out.fifteen = t.length === 15 && t.every((x, i) => !i || t[i - 1][1] > x[1] || (t[i - 1][1] === x[1] && t[i - 1][2] <= x[2])) && document.querySelectorAll(".group")[[...document.querySelectorAll(".group")].findIndex(g => /Tricky items/.test(g.textContent))].querySelectorAll("tr").length === 15;
        return out;
      });
      check("a tricky item's next exercise is its introduction (the flip card or first exercise), marked to explain itself", !r.intro.length, r.intro.join("\n"));
      check("an item with 3 lapses, or at box 4, is not tricky", !r.notTricky.length, r.notTricky.join(", "));
      check("the introduction shows the explanation", !r.why.length, r.why.join(", "));
      check("an introduction that isn't typed leaves the record as it was (only seen again)", !r.moved.length, r.moved.join("\n"));
      check("…and the usual typed follow-up comes 3 to 6 exercises later (none after a typed or rule exercise; for a verb tense, its whole table)", !r.follow.length, r.follow.join("\n"));
      check("the follow-up, answered right, moves the item up a box as usual", !r.promoted.length, r.promoted.join("\n"));
      check("Stats lists the tricky items, above the Practise the most-missed items button", r.stats);
      check("…at most 15, most lapses first", r.fifteen);
      check("no script errors", !page.errors.length, page.errors.slice(0, 3).join("\n"));
      await context.close();
    }

    /* 5. The forecast */
    {
      const { page, context } = await open(browser, origin);
      section("5. The forecast on Stats matches dueIds()");
      const r = await page.evaluate(() => {
        const fc = counts().forecast, real = Date.now, d0 = new Date(real());
        const endOf = (k) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1 + k).getTime() - 1; // the last moment of day k (0: today)
        const at = (t) => { Date.now = () => t; try { return [dueIds().length, flashDueIds().length, dueIds("vb").length]; } finally { Date.now = real; } };
        const bad = [];
        let prev = at(endOf(0));
        for (let k = 0; k < 7; k++) {
          const cur = at(endOf(k + 1)), want = { grammar: cur[0] - prev[0], cards: cur[1] - prev[1], verbs: cur[2] - prev[2] };
          const got = fc[k];
          if (got.grammar !== want.grammar || got.cards !== want.cards || got.verbs !== want.verbs || got.day !== dayKey(endOf(k + 1))) bad.push(`${got.day}: ${JSON.stringify(got)}, dueIds gives ${JSON.stringify(want)}`);
          prev = cur;
        }
        S.screen = "stats"; render();
        const drawn = [...document.querySelectorAll(".fc-n")].map(e => Number(e.textContent.replace(/,/g, "")));
        const table = [...document.querySelectorAll(".fc-table tbody tr")].map(tr => [...tr.cells].slice(1).map(c => Number(c.textContent.replace(/,/g, ""))));
        return { bad, fc, drawn, table, total: fc.reduce((n, d) => n + d.grammar + d.cards + d.verbs, 0), kinds: ["grammar", "cards", "verbs"].map(k => fc.reduce((n, d) => n + d[k], 0)) };
      });
      check(`for each of the next 7 days, the items due (grammar, cards, verbs: ${r.kinds.join(", ")}) are what dueIds() gains that day`, !r.bad.length && r.kinds.every(n => n > 0), r.bad.join("\n"));
      check("Stats draws those numbers: a column for each day's total, and a table by kind", r.drawn.length === 7 && r.drawn.every((n, k) => n === r.fc[k].grammar + r.fc[k].cards + r.fc[k].verbs) && r.table.length === 7 && r.table.every((row, k) => row.join() === [r.fc[k].grammar, r.fc[k].cards, r.fc[k].verbs].join()), JSON.stringify(r.drawn));
      check("no script errors", !page.errors.length, page.errors.slice(0, 3).join("\n"));
      await context.close();
    }

    /* 6. Another round */
    {
      const { page, context } = await open(browser, origin);
      section("6. Another round, for every kind of session");
      const ways = [
        ["Continue", "home", '.hero[data-start="continue"]'], ["a grammar unit", "units", '.ucard [data-unit]'], ["Review", "home", '[data-start="review"]'],
        ["Wild card", "home", '[data-start="wild"]'], ["Mistakes", "home", '[data-start="mistakes"]'], ["the most-missed items", "stats", '[data-start="hard"]'],
        ["Flashcards", "home", '[data-start="flashcards"]'], ["a vocab pack", "units:vocab:fc01", '.ucard [data-unit]'], ["Verbs", "home", '[data-start="verbs"]'], ["the Verbs section from Units", "units:verbs:vb", '.ucard [data-unit]'],
        ["a lesson section", "reference:lesson:u06", '[data-practise]:not([disabled])'],
        ["a tense, from the Verbs reference", "reference:lesson:vb", '[data-vfocus="vtense:imperfetto"]', "Focus: imperfetto"],
        ["a family, from the Verbs reference", "reference:lesson:vb", '[data-vfocus="vfam:isc"]', "Focus: -ire with -isc-"],
        ["a verb, from its row in the Verbs reference", "reference:lesson:vb", 'details.vref[data-verb="andare"] [data-vfocus]', "Focus: andare"],
      ];
      for (const [label, where, sel, focus] of ways) {
        await page.evaluate((w) => { session = null; S.feedback = null; S.refFilter = ""; const [scr, seg, pickU] = w.split(":"); S.screen = scr; if (scr === "reference") { S.refTab = seg; S.refUnit = pickU; render(); return; } if (seg) S.unitSeg = seg; render(); S.unitPick = pickU || null; render(); }, where);
        if (/details\.vref/.test(sel)) await page.evaluate(() => { document.querySelector('details.vref[data-verb="andare"]').open = true; }); // its tables, and its button, are drawn as it opens
        await page.click(sel);
        const started = await page.evaluate(() => S.screen === "session" && { kind: session.kind, unit: session.unitId });
        const end = await page.evaluate(FINISH);
        const sum = await page.evaluate(() => { const b = document.querySelector('[data-act="again"]'), home = document.querySelector('.sumbtns [data-go="home"]'), f = document.querySelector(".sumfocus"); return { b: !!b, disabled: b && b.disabled, beside: !!(b && home && b.parentElement === home.parentElement), left: sessionIds(session.kind, session.kind === "continue" ? undefined : session.unitId).length, focus: f ? f.textContent.replace(/\u2011/g, "-") : null }; }); // nbHyphens keeps -ire in one piece
        check(`${label}: the summary has Another round beside Back to Today, enabled while something is left`, started && end === "summary" && sum.b && sum.beside && sum.disabled === !sum.left, JSON.stringify({ started, end, sum }));
        check(`${label}: the summary ${focus ? `names the focus (“${focus}”)` : "names no focus"}`, sum.focus === (focus || null), JSON.stringify(sum.focus));
        if (!sum.b || sum.disabled) continue;
        await page.evaluate(() => { window.__prev = session; });
        await page.click('[data-act="again"]');
        const again = await page.evaluate(() => ({ screen: S.screen, kind: session && session.kind, unit: session && session.unitId, fresh: !!session && session !== window.__prev && session.pos === 0 && !session.finished, n: session && session.queue.length }));
        check(`${label}: Another round starts another ${started.kind} session${started.unit ? " of " + started.unit : ""}`, again.screen === "session" && again.kind === started.kind && (again.unit === started.unit || started.kind === "continue") && again.n > 0 && again.fresh, JSON.stringify({ started, again }));
        await page.evaluate(() => { session = null; S.screen = "home"; render(); });
      }
      check("no script errors", !page.errors.length, page.errors.slice(0, 3).join("\n"));
      await context.close();

      // nothing left: a few mistakes and a few items due, all answered right
      const { page: p2, context: c2 } = await open(browser, origin, { seed: false });
      await p2.evaluate(() => {
        const T = Date.now(), ids = Object.values(content.items).filter(i => i.unit === "u02" && pid(i.id) === i.id).slice(0, 6).map(i => i.id);
        ids.forEach((id, k) => { progress.items[id] = { box: 2, due: T - 1000, lapses: 1, lastSeen: T - 864e5, lastWrong: k < 3 ? T - 864e5 : T - 30 * 864e5, seenCount: 4, lastRight: k < 3 ? 0 : T - 864e5 }; });
        saveProgress(); render();
      });
      for (const [label, sel] of [["Mistakes", '[data-start="mistakes"]'], ["Review", '[data-start="review"]']]) {
        await p2.click(sel);
        await p2.evaluate(FINISH);
        const d = await p2.evaluate(() => { const b = document.querySelector('[data-act="again"]'); return { disabled: b && b.disabled, note: !!document.getElementById("again-none") }; });
        await p2.click('[data-act="again"]', { force: true }).catch(() => { });
        check(`${label}: with nothing left to practise, Another round is disabled, says why, and does nothing`, d.disabled && d.note && (await p2.evaluate("S.screen")) === "summary", JSON.stringify(d));
        await p2.click('.sumbtns [data-go="home"]');
      }
      check("no script errors", !p2.errors.length, p2.errors.slice(0, 3).join("\n"));
      await c2.close();
    }

    /* 7. The lesson's order, and Practise this section */
    for (const seeded of [false, true]) {
      const { page, context } = await open(browser, origin, { seed: seeded });
      if (!seeded) section("7. The lesson's order, and Practise this section");
      const who = seeded ? "with the seeded progress" : "on a new device";
      const ord = await page.evaluate(() => {
        progress.settings.lessonLength = 12;
        const out = { units: 0, sessions: 0, bad: [], varied: 0, boundary: 0, last: [] };
        const rank = (u, id) => { const at = itemSection(id); return at && at.unit === u ? at.index : Infinity; };
        for (const u of content.units.filter(x => !isSideUnit(x.id) && lessonOf(x)).map(x => x.id)) {
          const fresh = newIds(u); if (!fresh.length) continue;
          out.units++;
          const sets = new Set();
          for (const kind of ["unit", "continue"]) for (let rep = 0; rep < 6; rep++) {
            if (kind === "continue") progress.currentUnit = u;
            const chosen = sessionIds(kind, u).filter(id => rec(id).box === 0), set = new Set(chosen), left = fresh.filter(id => !set.has(id));
            out.sessions++;
            const top = Math.max(-1, ...chosen.map(id => rank(u, id))), low = Math.min(Infinity, ...left.map(id => rank(u, id)));
            if (top > low) out.bad.push(`${kind} ${u}: takes a new item of section ${top + 1} while one of section ${low + 1} waits`);
            if (chosen.length) sets.add(chosen.slice().sort().join());
            if (chosen.some(id => rank(u, id) === Infinity) && left.some(id => rank(u, id) !== Infinity)) out.last.push(`${kind} ${u}: an unlinked item before a linked one`);
          }
          // the section at the edge of what a session takes: its items come in a different order from session to session
          const ranks = fresh.map(id => rank(u, id)).sort((a, b) => a - b), k = Math.min(fresh.length, Math.max(3, Math.round(12 / 2.4)), newLeftToday());
          if (k < fresh.length && ranks[k - 1] === ranks[k]) { out.boundary++; if (sets.size > 1) out.varied++; }
        }
        return out;
      });
      check(`${who}: Continue and a unit's sessions take new items in the order of the lesson's sections, linked ones before the rest (${ord.sessions} sessions in ${ord.units} units)`, ord.units >= 15 && !ord.bad.length && !ord.last.length, ord.bad.concat(ord.last).slice(0, 5).join("\n"));
      check(`${who}: …and the items of one section in a different order from session to session (${ord.varied} of ${ord.boundary} units where a section is cut short)`, ord.boundary > 3 && ord.varied >= ord.boundary - 1, JSON.stringify(ord));
      const sec = await page.evaluate(() => {
        progress.settings.lessonLength = 12;
        const out = { sections: 0, bad: [], due: 0, fresh: 0, rest: 0, full: 0 }, t = now();
        const kind = (id) => isDue(id, t) ? 0 : rec(id).box === 0 ? 1 : 2;
        for (const [key, list] of sections().items) {
          const all = uniqueByPid(list), ids = sessionIds("section", key), where = (id) => itemSection(id) && itemSection(id).unit + "#" + itemSection(id).index;
          out.sections++;
          const ks = ids.map(kind), avail = all.filter(id => kind(id) !== 1).length + Math.min(all.filter(id => kind(id) === 1).length, newLeftToday());
          if (ids.some(id => where(id) !== key)) out.bad.push(`${key}: takes an item of another section`);
          if (ids.length !== Math.min(12, avail)) out.bad.push(`${key}: ${ids.length} items, expected ${Math.min(12, avail)}`);
          if (ks.some((k, i) => i && k < ks[i - 1])) out.bad.push(`${key}: not due, then new, then the rest: ${ks.join("")}`);
          if (ks.filter(k => k === 1).length > newLeftToday()) out.bad.push(`${key}: more new items than today allows`);
          const due = ids.filter(id => kind(id) === 0), rest = ids.filter(id => kind(id) === 2);
          if (due.some((id, i) => i && rec(id).due < rec(due[i - 1]).due)) out.bad.push(`${key}: the due items not soonest first`);
          if (rest.some((id, i) => i && rec(id).box < rec(rest[i - 1]).box)) out.bad.push(`${key}: the rest not least known first`);
          if (rest.length && (all.filter(id => kind(id) === 0).length > due.length || ids.filter(id => kind(id) === 1).length < Math.min(newLeftToday(), all.filter(id => kind(id) === 1).length))) out.bad.push(`${key}: the rest taken before all the due and new items`);
          const q = buildSession("section", key).queue;
          if (!q.every(x => where(x.ex.item.id) === key) || q.length !== ids.length) out.bad.push(`${key}: its session's exercises aren't its items`);
          out.due += due.length; out.fresh += ks.filter(k => k === 1).length; out.rest += rest.length; if (ids.length === 12) out.full++;
        }
        // today's new items used up: no new ones
        const day = today(), was = day.new; day.new = progress.settings.newPerDay;
        const none = [...sections().items.keys()].every(key => sessionIds("section", key).every(id => rec(id).box !== 0));
        day.new = was;
        return Object.assign(out, { none });
      });
      check(`${who}: Practise this section takes only the section's items, due first, then new (within today's limit), then the rest, least known first, up to the lesson length (${sec.sections} sections: ${sec.due} due, ${sec.fresh} new, ${sec.rest} others)`, sec.sections > 250 && !sec.bad.length && (seeded ? sec.due > 0 && sec.rest > 0 : sec.fresh > 0), sec.bad.slice(0, 5).join("\n"));
      check(`${who}: with today's new items used up, Practise this section takes no new ones`, sec.none);
      check(`${who}: no script errors`, !page.errors.length, page.errors.slice(0, 3).join("\n"));
      await context.close();
    }
    /* 8. Focus sessions */
    for (const seeded of [false, true]) {
      const { page, context } = await open(browser, origin, { seed: seeded });
      if (!seeded) section("8. Focus sessions: a verb, a tense, a family (from 9.31)");
      const who = seeded ? "with the seeded progress" : "on a new device";
      const r = await page.evaluate(() => {
        progress.settings.verbsPerSession = 12; progress.settings.verbNewPerSession = 3;
        const out = { sessions: 0, bad: [], due: 0, rest: 0, fresh: 0, full: 0, empty: [] }, t = now(), vb = content.byUnit.vb, per = 12, nNew = 3;
        const kindOf = (id) => isDue(id, t) ? 0 : rec(id).box >= 1 ? 1 : 2; // due, started, new
        const keys = [...VG_TENSES.map(x => ["vtense", x]), ...Object.keys(VERB_FAMILIES).map(x => ["vfam", x]), ...VERB_GYM.filter((v, k) => k % 8 === 0).slice(0, 60).map(v => ["vverb", v.it])];
        for (const [kind, key] of keys) {
          const match = vb.filter(i => kind === "vtense" ? i.tense === key : kind === "vfam" ? i.fam === key : i.it === key);
          const ids = sessionIds(kind, key), ks = ids.map(kindOf), tag = kind + " " + key;
          out.sessions++;
          if (ids.some(id => !match.some(i => i.id === id))) out.bad.push(`${tag}: an item that isn't one of its verb tenses`);
          if (ks.some((k, i) => i && k < ks[i - 1])) out.bad.push(`${tag}: not due, then started, then new: ${ks.join("")}`);
          const due = ids.filter(id => kindOf(id) === 0), rest = ids.filter(id => kindOf(id) === 1), fresh = ids.filter(id => kindOf(id) === 2);
          if (due.some((id, i) => i && rec(id).due < rec(due[i - 1]).due)) out.bad.push(`${tag}: the due ones not soonest first`);
          if (rest.some((id, i) => i && rec(id).box < rec(rest[i - 1]).box)) out.bad.push(`${tag}: the started ones not least known first`);
          const rank = (id) => content.items[id].rank * 10 + content.items[id].step;
          if (fresh.some((id, i) => i && rank(id) < rank(fresh[i - 1]))) out.bad.push(`${tag}: the new ones not in the order of VERB_GYM`);
          if (fresh.length > nNew) out.bad.push(`${tag}: ${fresh.length} new ones, more than a Verbs session's ${nNew}`);
          const cap = progress.settings.verbTenseCap || 7;
          if (fresh.some(id => !vgUnlocked(content.items[id]) || content.items[id].step > cap)) out.bad.push(`${tag}: a tense that hasn't opened`);
          const opens = match.filter(i => rec(i.id).box === 0 && vgUnlocked(i) && i.step <= cap), started = match.filter(i => rec(i.id).box >= 1);
          const want = Math.min(per, started.length + Math.min(nNew, opens.length));
          if (ids.length !== want) out.bad.push(`${tag}: ${ids.length} items, expected ${want}`);
          if (started.filter(i => isDue(i.id, t)).length > due.length && ids.length < per) out.bad.push(`${tag}: a due one left out`);
          if (rest.length && due.length < Math.min(per, started.filter(i => isDue(i.id, t)).length)) out.bad.push(`${tag}: a started one before a due one`);
          if (fresh.length && rest.length < Math.min(per - due.length, started.length - due.length)) out.bad.push(`${tag}: a new one before a started one`);
          const q = buildSession(kind, key).queue;
          if (q.length !== ids.length || q.some(x => !ids.includes(x.ex.item.id))) out.bad.push(`${tag}: its session's exercises aren't its items`);
          if (!ids.length) out.empty.push(tag);
          out.due += due.length; out.rest += rest.length; out.fresh += fresh.length; if (ids.length === per) out.full++;
        }
        // the screen: the chips' numbers, and disabled exactly where there is nothing to practise, with the reason
        S.screen = "reference"; S.refUnit = "vb"; S.refFilter = ""; render();
        const chips = [...document.querySelectorAll(".tchip")].map(b => ({ t: b.dataset.vfocus.split(":")[1], n: Number(b.querySelector(".tchip-n").textContent.replace(/\D/g, "")), off: b.disabled, why: b.getAttribute("aria-describedby") }));
        out.chips = chips.length === 8 && chips.every(c => c.n === vb.filter(i => i.tense === c.t && rec(i.id).box >= 1).length && c.off === !sessionIds("vtense", c.t).length && (!c.off || (c.why && document.getElementById(c.why))));
        out.offChips = chips.filter(c => c.off).length;
        const fams = [...document.querySelectorAll('[data-vfocus^="vfam:"]')];
        out.fams = fams.length === Object.keys(VERB_FAMILIES).length && fams.every(b => b.disabled === !sessionIds("vfam", b.dataset.vfocus.slice(5)).length);
        return out;
      });
      check(`${who}: each focus session takes only its verb tenses, due first (soonest first), then the others started (least known first), then new ones that can open, in VERB_GYM order and within a Verbs session's new ones, up to a Verbs session's length (${r.sessions} focuses: ${r.due} due, ${r.rest} started, ${r.fresh} new)`, r.sessions > 70 && !r.bad.length && (seeded ? r.due > 0 && r.rest > 0 : r.fresh > 0), r.bad.slice(0, 6).join("\n"));
      check(`${who}: no focus session opens a tense that hasn't opened, and its exercises are its items`, !r.bad.some(b => /hasn't opened|aren't its items/.test(b)));
      check(`${who}: the tense chips show each tense's verbs started, and are disabled, with the reason, exactly where nothing can be practised (${r.offChips} of 8 disabled)`, r.chips && (seeded || r.offChips === 7), JSON.stringify(r.empty));
      check(`${who}: Practise this family is under every family's heading, disabled exactly where nothing can be practised`, r.fams);
      check(`${who}: no script errors`, !page.errors.length, page.errors.slice(0, 3).join("\n"));
      await context.close();
    }
    /* 9. The ladder cap */
    {
      const { page, context } = await open(browser, origin, { seed: false });
      section("9. The ladder cap: Open new tenses up to (from 9.31)");
      // every verb's presente and passato prossimo learned, the first 30 verbs' imperfetto and futuro started and due
      await page.evaluate(() => {
        const T = Date.now(), put = (i, box, due) => { progress.items[pid(i.id)] = { box, due, lapses: 0, lastSeen: T - 864e5, lastWrong: 0, seenCount: 6, lastRight: T - 864e5 }; };
        for (const i of content.byUnit.vb) if (i.step <= 1) put(i, 5, T + 30 * 864e5);
        VERB_GYM.slice(0, 30).forEach(v => { for (const t of ["imperfetto", "futuro"]) { const i = vgItem(v.it, t); if (i) put(i, 5, T - 1000); } });
        saveProgress(); S.screen = "settings"; render();
      });
      await page.selectOption('select[data-set="verbTenseCap"]', "2");
      const st = await page.evaluate(async () => { await Store.flush(); return { set: progress.settings.verbTenseCap, stored: (await Store.read("itapp.progress.v1")).settings.verbTenseCap, cloud: JSON.stringify(progressToDocs(progress)).includes('"verbTenseCap":2'), shown: document.querySelector('select[data-set="verbTenseCap"]').value }; });
      check("Settings › Verbs › Open new tenses up to, chosen by tapping, is stored with the settings, in the cloud's documents too, and drawn as chosen", st.set === 2 && st.stored === 2 && st.cloud && st.shown === "2", JSON.stringify(st));
      const r = await page.evaluate(() => {
        const out = { bad: [], fresh: 0, reviews: 0 }, cap = 2, vb = content.byUnit.vb;
        for (let k = 0; k < 30; k++) for (const [kind, key] of [["verbs"], ["vtense", "futuro"], ["vtense", "condizionale"], ["vfam", "irr"], ["vverb", VERB_GYM[k].it], ["vverb", VERB_GYM[100 + k].it]]) {
          const s = buildSession(kind, key);
          for (const q of s.queue) { const i = q.ex.item; if (rec(i.id).box === 0) { out.fresh++; if (i.step > cap) out.bad.push(`${kind} ${key || ""}: ${i.id}, a tense after the imperfetto, as new`); } else if (i.step > cap) out.reviews++; }
        }
        if (verbNewIds().some(id => content.items[id].step > cap)) out.bad.push("verbNewIds takes a tense after the imperfetto");
        out.plainNew = vb.filter(i => rec(i.id).box === 0 && vgUnlocked(i) && i.step <= cap).length;
        S.screen = "home"; render();
        out.tile = (document.querySelector('.tile[data-start="verbs"]') || {}).textContent || "";
        S.screen = "units"; S.unitSeg = "verbs"; render(); S.unitPick = "vb"; render();
        out.card = (document.querySelector(".ucard") || {}).textContent || "";
        S.screen = "reference"; S.refUnit = "vb"; S.refFilter = "andare"; render();
        out.row = (document.querySelector('details.vref[data-verb="andare"] summary') || {}).textContent || "";
        S.refFilter = ""; progress.settings.verbTenseCap = 7; progress.settingsUpdatedAt = now(); saveProgress();
        out.after = verbNewIds().filter(id => content.items[id].tense === "imperfetto").length;
        return out;
      });
      check(`with the cap at the imperfetto, no session (Verbs, a tense, a family, a verb) takes a newer tense as new (${r.fresh} new ones taken), while those already started still come up for review (${r.reviews})`, !r.bad.length && r.fresh > 0 && r.reviews > 0, r.bad.slice(0, 5).join("\n"));
      check(`Today's Verbs tile, the Units card and the reference count new tenses within the cap (${r.plainNew} new)`, r.tile.includes(`${r.plainNew} new`) && r.card.includes(`${r.plainNew} new`) && /condizionale held back/.test(r.row) && !/ new/.test(r.row),JSON.stringify({ tile: r.tile, card: r.card, row: r.row }));
      check("set back to All, the next tense opens again", r.after > 0);
      check("no script errors", !page.errors.length, page.errors.slice(0, 3).join("\n"));
      await context.close();
    }
  } catch (e) {
    results.stopped(e);
  } finally {
    await browser.close();
    server.close();
  }
  results.summary();
})();
