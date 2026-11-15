/*
  The app's learning code running in Node, for the tests that need no browser (test-rules, test-course):
  load-app.js loads everything before the boot section, and this adds what a test needs to drive it:
  a clock it sets, a seeded Math.random, a session of one exercise, and the real answerTyped and
  answerOption with drawing the screen switched off (render does nothing), so an answer goes through
  the same code as a tap or a typed answer in the app, to S.feedback.

    const { openApp, seeded } = require("./lib/node-app");
    const app = openApp({ file });              // the content built, progress empty, the clock real
    app.clock.t = Date.UTC(2026, 9, 24, 21, 30); // from now on the app's Date.now() and new Date() give this moment
    app.setRandom(seeded(7));                    // mulberry32
    app.reset();                                 // empty progress again (the settings as a new device has them)
    const fb = app.answer(ex, "ciao");           // through answerTyped: { ok, note, given, closest, … }, or { retry } when the
                                                 // app asks to try again (another word with the same meaning)
    const fb2 = app.pick(ex, "il");              // through answerOption
    app.usedOptions(ex, text)                    // the options answerTyped hands checkAnswer for this exercise (seen, not copied)

  Nothing is saved: the storage script finds no IndexedDB in Node and a localStorage that keeps nothing.
  Set process.env.TZ before or after: Node reads the time zone afresh whenever it changes.
*/
"use strict";
const fs = require("fs");
const { loadApp, INDEX } = require("./load-app");

// mulberry32, as the other tests seed it
const seeded = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

const NAMES = `buildContent, applyResult, undoResult, streak, checkAnswer, makeExercise, newLeftToday, today, rec, pid, dayKey, isDue,
  answerTyped, answerOption, acceptAnswer, continueSession, defaultProgress, knownWords, normalize, deaccent, normEn, enForms, arr,
  isFlashUnit, isVerbUnit, isSideUnit, itemHasProduction, translationsOf, formVariants, VERB_GYM, VG_TENSES, TENSE_LABEL, PERSONS, vgId,
  content: () => content, progress: () => progress, S: () => S, session: () => session,
  setProgress: (p) => { progress = p; COUNTS = null; }, setSession: (s) => { session = s; },
  setRandom: (f) => { Math.random = f; }, setListen: (f) => { canListen = f; },
  noRender: () => { render = () => {}; },
  setClock: (clock) => { const R = Date; Date = class extends R { constructor(...a) { if (a.length || clock.t == null) super(...a); else super(clock.t); } static now() { return clock.t == null ? R.now() : clock.t; } }; },
  spyCheck: (seen) => { const real = checkAnswer; checkAnswer = (typed, accepted, opts) => { seen.push(opts); return real(typed, accepted, opts); }; return () => { checkAnswer = real; }; }`;

function openApp({ file, html, names = "" } = {}) {
  if (html == null) html = fs.readFileSync(file || INDEX, "utf8");
  const app = loadApp(NAMES + (names ? ", " + names : ""), { html });
  app.html = html;
  app.version = (html.match(/^const APP_VERSION = "([^"]+)"/m) || [])[1] || "?";
  app.clock = { t: null };
  app.setClock(app.clock);
  app.noRender();
  app.buildContent();
  app.S().screen = "test"; // not Today: a refused save (nothing is kept in Node) then draws nothing
  app.reset = () => { const p = app.defaultProgress(); app.setProgress(p); return p; };
  // A session of this one exercise, as the app holds it while the exercise is on the screen.
  app.show = (ex, kind = "unit") => {
    const S = app.S();
    app.setSession({ kind, unitId: ex.item.unit, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false });
    S.feedback = null; S.retry = null; S.picked = null; S.revealed = false; S.bankPicked = [];
  };
  const fed = () => { const S = app.S(); return S.feedback || { ok: false, retry: S.retry || "" }; };
  app.answer = (ex, text) => { app.show(ex); app.answerTyped(text); return fed(); };
  app.pick = (ex, opt) => { app.show(ex); app.answerOption(opt); return fed(); };
  app.usedOptions = (ex, text) => { const seen = [], undo = app.spyCheck(seen); try { app.show(ex); app.answerTyped(text); } finally { undo(); } return seen[0]; };
  return app;
}

module.exports = { openApp, seeded, hash };
