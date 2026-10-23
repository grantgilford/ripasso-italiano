#!/usr/bin/env node
/*
  The session test: how grammar sessions are put together (from version 9.5).

  Usage:  node tools/test-sessions.js [path/to/index.html] [--headed]

  Opens the real app in a headless browser (Playwright + Chromium) with about 6,600 progress records saved
  (tools/lib/seed.js), Math.random replaced by a seeded generator and a stand-in Italian voice (so Listen and
  type is among the choices, as on a phone), and checks:

    1. Balanced sessions: 12-exercise sessions of every grammar kind (Continue and a unit for each grammar unit,
       Review, Wild card, Mistakes, most-missed), built many times: never the same kind of exercise (typeKey)
       three times in a row; at least four kinds whenever the items can give four (as many as they can give
       otherwise: worked out by asking each item for every kind and matching kinds to items); and about the
       same share of typed exercises as the same items get without the session's hint (within 3 points).
       makeExercise's hint keeps the kind: with the same random numbers, a hinted choice is typed exactly
       when the plain one is. Flashcard and Verbs sessions are built as before (no hint, no new order).
    2. Rotation: each answered grammar exercise is remembered per device in itapp.lasttype.v1 (record id and
       typeKey, newest last, at most 2,000, never in progress); a vocab pack's cards are not; the next session
       gives an item another kind of exercise wherever it has one of the same kind (typed or not); a damaged
       value or a device that refuses to store it costs nothing.
    3. Spread: a correct answer that sets the next review at box 3 or above lands within 10% of the interval
       either way, and the dates do spread; boxes 1 and 2, and a wrong answer, keep their exact intervals.
    4. Tricky items (4 or more lapses, box 3 or below): the next session introduces each again (the flip card
       or first exercise, with its explanation); the introduction leaves the record as it was, and the typed
       follow-up comes later in the session and moves the item as usual; an item with 3 lapses, or at box 4,
       is not tricky; Stats lists up to 15, above the "Practise the most-missed items" button.
    5. The forecast on Stats: for each of the next 7 days, the items that fall due that day, grammar, cards
       and verbs, are exactly what dueIds(), flashDueIds() and dueIds("vb") gain from the end of the day
       before to the end of that day; the numbers drawn on Stats are those.
    6. Another round: after a session of every kind (Continue, a grammar unit, Review, Wild card, Mistakes,
       most-missed, Flashcards from Today and from a pack, Verbs from Today and from Units), started by
       tapping, the summary offers Another round beside Back to Today, which starts a session of the same
       kind and unit; it is disabled when nothing is left to practise.

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
        const out = { sessions: 0, exercises: 0, triples: [], unavoidable: 0, fewKinds: [], kindsHist: {}, typed: 0, typedPlain: 0, plainN: 0, flash: "", tooShort: 0 };
        // the kinds each item can give at its box: makeExercise asked for each kind in turn (anyKind), as the session's last pass asks
        const can = (q) => q.reintro || isSideUnit(q.ex.item.unit) ? new Set([q.ex.typeKey]) : new Set(HINT_KEYS.concat([q.ex.typeKey]).map(k => (makeExercise(q.ex.item, rec(q.ex.item.id), undefined, { prefer: [k], anyKind: true }) || {}).typeKey).filter(Boolean));
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
          const tally = {}; keys.forEach(k => tally[k] = (tally[k] || 0) + 1);
          const avoidable = Object.values(tally).every(c => c <= 2 * (n - c) + 2);
          const at = keys.findIndex((k, i) => i >= 2 && keys[i - 1] === k && keys[i - 2] === k);
          if (at >= 0) { if (avoidable) out.triples.push(`${kind} ${unit || ""}: ${keys.join(" ")}`); else out.unavoidable++; }
          const distinct = Object.keys(tally).length, want = Math.min(4, Math.ceil(n / 3)), best = Math.min(want, matching(s.queue.map(can)));
          if (n === 12) out.kindsHist[distinct] = (out.kindsHist[distinct] || 0) + 1; else out.tooShort++;
          if (distinct < best) out.fewKinds.push(`${kind} ${unit || ""}: ${distinct} kinds, the items could give ${best}: ${keys.join(" ")}`);
          // the same items without the session's hint, as 9.4 built them (tricky items' introductions left out of both)
          for (const q of s.queue) if (!q.reintro) {
            if (q.ex.kind === "production") out.typed++;
            const plain = makeExercise(q.ex.item, rec(q.ex.item.id));
            if (plain) { out.plainN++; if (plain.kind === "production") out.typedPlain++; }
          }
        }
        // Flashcard and Verbs sessions: with the same random numbers, the same items and exercises as plain makeExercise in shuffled order
        for (const [kind, unit] of [["flashcards"], ["flashcards", "fc01"], ["verbs"], ["verbs", "vb"]]) {
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
      check("flashcard and Verbs sessions are built as before: the same items and exercises, in the shuffled order", !r.flash, r.flash);

      const kept = await page.evaluate(() => { // the hint never changes the kind: the same random numbers, with and without a hint
        const ids = Object.keys(content.items).filter(id => !isSideUnit(content.items[id].unit) && ["vocab", "sentence"].includes(content.items[id].type)).filter((_, k) => k % 9 === 0);
        let n = 0; const bad = [];
        for (const id of ids) for (const box of [0, 1, 2, 3, 5]) for (const force of [undefined, "production"]) {
          const item = content.items[id], r = Object.assign({}, rec(id), { box }), hint = { avoid: [HINT_KEYS[n % HINT_KEYS.length]], prefer: HINT_KEYS.filter((_, k) => (k + n) % 3 === 0) };
          window.__reseed(n * 7919 + 1); const a = makeExercise(item, r, force);
          window.__reseed(n * 7919 + 1); const b = makeExercise(item, r, force, hint);
          n++;
          if (a && b && a.kind !== b.kind) bad.push(`${id} box ${box}${force ? " follow-up" : ""}: ${a.typeKey} (${a.kind}) became ${b.typeKey} (${b.kind})`);
        }
        return { n, bad };
      });
      check(`makeExercise's hint keeps the kind: of ${kept.n} exercises built with the same random numbers, a hinted one is typed exactly when the plain one is`, kept.n > 1000 && !kept.bad.length, kept.bad.slice(0, 5).join("\n"));

      section("2. Rotation: another kind of exercise for an item, per device");
      const rot = await page.evaluate(() => {
        const out = {};
        localStorage.removeItem("itapp.lasttype.v1"); LAST_TYPES = null;
        startSession("review");
        const answered = [];
        for (let n = 0; S.screen === "session" && n < 60; n++) { const q = current(); if (!S.feedback) { answered.push([pid(q.ex.item.id), q.ex.typeKey]); finishAnswer(true, "", ""); } continueSession(); }
        const saved = JSON.parse(localStorage.getItem("itapp.lasttype.v1") || "null");
        const last = new Map(); answered.forEach(([id, k]) => { last.delete(id); last.set(id, k); });
        out.saved = Array.isArray(saved) && saved.length === last.size && saved.every(([id, k]) => last.get(id) === k) && saved.map(p => p[0]).join() === [...last.keys()].join();
        out.notInProgress = !JSON.stringify(progress).includes("lasttype") && !localStorage.getItem("itapp.progress.v1").includes("lasttype");
        S.screen = "home"; session = null;
        // a vocab pack's cards are not remembered
        const before = localStorage.getItem("itapp.lasttype.v1");
        startSession("flashcards"); for (let n = 0; S.screen === "session" && n < 8; n++) { if (!S.feedback) finishAnswer(true, "", ""); continueSession(); }
        out.cardsLeftOut = localStorage.getItem("itapp.lasttype.v1") === before;
        session = null; S.screen = "home";
        // the next sessions: where an item's exercise has another of the same kind (typed or not), it is another kind
        const kindsAt = (item, r) => { const m = {}; for (const k of HINT_KEYS) { const ex = makeExercise(item, r, undefined, { prefer: [k], anyKind: true }); if (ex && ex.typeKey === k) m[k] = ex.kind; } return m; };
        let could = 0, same = 0, plainSame = 0;
        for (let rep = 0; rep < 40; rep++) {
          const s = buildSession("review");
          for (const q of s.queue) {
            if (q.reintro || isSideUnit(q.ex.item.unit)) continue;
            const id = pid(q.ex.item.id), was = lastTypes().get(id), r = rec(q.ex.item.id);
            if (was) {
              const m = kindsAt(q.ex.item, r), cls = m[q.ex.typeKey], alts = Object.keys(m).filter(k => m[k] === cls && k !== was);
              if (cls && m[was] === cls && alts.length) { could++; if (q.ex.typeKey === was) same++; const p = makeExercise(q.ex.item, r); if (p && p.typeKey === was) plainSame++; }
            }
            noteType(q.ex);
          }
        }
        Object.assign(out, { could, same, plainSame });
        // capped at 2,000, newest last
        const many = Array.from({ length: 2100 }, (_, k) => ["old-" + k, "recall"]);
        localStorage.setItem("itapp.lasttype.v1", JSON.stringify(many)); LAST_TYPES = null;
        const g = Object.values(content.items).find(i => i.unit === "u02" && i.type === "grammar_mc");
        noteType({ item: g, typeKey: "grammar" });
        const capped = JSON.parse(localStorage.getItem("itapp.lasttype.v1"));
        out.capped = capped.length === 2000 && capped[capped.length - 1][0] === pid(g.id) && capped[0][0] === "old-101";
        // damaged values are ignored
        out.damaged = [];
        for (const v of ["not json", "{\"a\":1}", "[1,2,[3]]", "null", "[[\"x\"]]"]) {
          localStorage.setItem("itapp.lasttype.v1", v); LAST_TYPES = null;
          try { const s = buildSession("review"); if (!s.queue.length) out.damaged.push(v + ": an empty session"); noteType(s.queue[0].ex); } catch (e) { out.damaged.push(v + ": " + e.message); }
        }
        return out;
      });
      check("each answered grammar exercise is remembered in itapp.lasttype.v1, as [record id, typeKey], newest last", rot.saved);
      check("…never in progress, so it never syncs", rot.notInProgress);
      check("…and a vocab pack's cards are not", rot.cardsLeftOut);
      check(`the next time, an item that has another exercise of the same kind gets another one (${rot.same} of ${rot.could} the same as last time; ${rot.plainSame} without the memory)`, rot.could > 100 && rot.same <= rot.could * 0.03 && rot.plainSame > rot.could * 0.15);
      check("the memory is capped at 2,000 items, the oldest dropped first", rot.capped);
      check("a damaged memory is ignored, and sessions still build", !rot.damaged.length, rot.damaged.join("\n"));
      check("no script errors", !page.errors.length, page.errors.slice(0, 3).join("\n"));
      await context.close();

      // a device that refuses to store anything new: sessions still run, nothing is remembered, nothing breaks
      const { page: p2, context: c2 } = await open(browser, origin, { seed: false, init: `Storage.prototype.setItem = function () { throw new Error("quota"); };` });
      await p2.evaluate(() => startSession("wild"));
      const refused = { scr: await p2.evaluate(FINISH), saved: await p2.evaluate(() => localStorage.getItem("itapp.lasttype.v1")) };
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
        const T = Date.now(), pick = (f) => Object.values(content.items).find(i => !isSideUnit(i.unit) && pid(i.id) === i.id && f(i)).id;
        const cases = [["a word", pick(i => i.type === "vocab"), 2], ["a sentence", pick(i => i.type === "sentence" && i.cloze), 3], ["a verb", pick(i => i.type === "verb"), 1],
          ["a transform", pick(i => i.type === "transform"), 2], ["a grammar question", pick(i => i.type === "grammar_mc"), 2], ["a number", pick(i => i.type === "number"), 3]];
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
        }
        for (const id of notTricky) { const q = s.queue.find(x => x.ex.item.id === id); if (!q || q.reintro) out.notTricky.push(id); }
        // answer every introduction right: a recognition one on an item with a typed exercise leaves the record alone and brings a typed follow-up
        session = s; S.screen = "session"; S.feedback = null; resetExState();
        const seen = {};
        for (let n = 0; S.screen === "session" && n < 80; n++) {
          const q = current(), id = q.ex.item.id, before = JSON.stringify(progress.items[pid(id)]);
          if (!S.feedback) {
            finishAnswer(true, "", "");
            const c = cases.find(x => x[1] === id);
            if (c && q.reintro) {
              const teach = q.ex.kind === "recognition" && itemHasProduction(q.ex.item);
              seen[id] = { teach, at: session.pos };
              if (teach && JSON.stringify(progress.items[pid(id)]).replace(/"(lastSeen|seenCount)":\d+/g, "") !== before.replace(/"(lastSeen|seenCount)":\d+/g, "")) out.moved.push(`${c[0]}: ${before} → ${JSON.stringify(progress.items[pid(id)])}`);
              if (!document.querySelector(".fb .why, .fb .facts")) out.why.push(c[0]);
              const f = session.queue.findIndex((x, i) => i > session.pos && x.followup && x.ex.item.id === id);
              if (teach && !(f > session.pos && (f >= session.pos + 3 || f === session.queue.length - 1) && f <= session.pos + 6 && session.queue[f].ex.kind === "production")) out.follow.push(`${c[0]}: follow-up at ${f}, now ${session.pos}`);
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
      check("…and the usual typed follow-up comes 3 to 6 exercises later (none after a typed or rule exercise)", !r.follow.length, r.follow.join("\n"));
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
      ];
      for (const [label, where, sel] of ways) {
        await page.evaluate((w) => { session = null; S.feedback = null; const [scr, seg, pickU] = w.split(":"); S.screen = scr; if (seg) S.unitSeg = seg; render(); S.unitPick = pickU || null; render(); }, where);
        await page.click(sel);
        const started = await page.evaluate(() => S.screen === "session" && { kind: session.kind, unit: session.unitId });
        const end = await page.evaluate(FINISH);
        const sum = await page.evaluate(() => { const b = document.querySelector('[data-act="again"]'), home = document.querySelector('.sumbtns [data-go="home"]'); return { b: !!b, disabled: b && b.disabled, beside: !!(b && home && b.parentElement === home.parentElement), left: sessionIds(session.kind, session.kind === "continue" ? undefined : session.unitId).length }; });
        check(`${label}: the summary has Another round beside Back to Today, enabled while something is left`, started && end === "summary" && sum.b && sum.beside && sum.disabled === !sum.left, JSON.stringify({ started, end, sum }));
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
  } catch (e) {
    results.stopped(e);
  } finally {
    await browser.close();
    server.close();
  }
  results.summary();
})();
