#!/usr/bin/env node
/*
  The rules test: the learning rules, case by case (from 9.27).

  Usage:  node tools/test-rules.js [path/to/index.html] [--no-browser]

  Scheduling, the streak and the answer checker are the heart of the app, and until now they were tested
  only where a screen happened to show their result. This states what each must give, written out by
  hand here (never worked out from the app's own tables), and runs the app's own code against it, in
  Node (tools/lib/node-app.js: no browser, a few seconds), with the clock and Math.random fixed:

    1. Scheduling (applyResult, undoResult). A grammar word, a flashcard, a Verbs tense and a
       recognition-only item, at every box 0 to 7 (a new item with and without a record), answered right
       and wrong, due and not yet due, as a first answer and as a repeat, as a recognition and as a
       production exercise: the new box (up one when due, down two when wrong, never under 1 or over 7; a
       recognition answer never promotes an item past box 2 when it can be typed), the exact time of the
       next review (10 minutes, 1, 3, 7, 14, 30 and 60 days; from 3 days on moved by up to 10% either
       way), lapses, lastRight, lastWrong, lastSeen and seenCount, what the answer returns, and the day's
       xp, new items, new cards and counts by kind; then undoResult puts the record and the day back
       exactly.
    2. The streak and the calendar, in Europe/Tirane: the goal met exactly, missed today, missed
       yesterday, a changed goal; the limit on new items resetting at midnight; a session that runs past
       midnight; the two days the clocks change (29 March and 25 October 2026: a 23-hour and a 25-hour
       day); and a device that changes time zone.
    3. The answer checker (checkAnswer, and answerTyped where the exercise decides): a table of what was
       typed, the answers accepted, the options and the settings, against the result, its note and the
       answer the panel compares with: accents lenient and strict, apostrophes, typos on and off, a slip
       that makes another word, British and American spelling, contractions, a leading to / the / a,
       parts in brackets, digits as words, a subject pronoun added or left out, Accept my answer, the
       closest answer. And, through answerTyped itself, for every kind of typed exercise: a one-letter
       slip is forgiven in the kinds that forgive (flashcards, typed recall, translate, reply, listen)
       and never in the others (conjugation, fill in the blank, the Verbs section's forms…).

  Then, unless --no-browser, in the real app (Playwright and Chromium, the clock fixed, the device in
  Europe/Tirane): Today and Stats show the streak with the goal met exactly, the new day arrives at
  midnight on the day the clocks go back, and the same saved progress opened in another time zone.

  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
process.env.TZ = "Europe/Tirane";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { openApp, seeded } = require("./lib/node-app");
const { loadPlaywright, serveApp, checks } = require("./lib/browser");

const args = process.argv.slice(2);
const BROWSER = !args.includes("--no-browser");
const file = path.resolve(args.find(a => a.endsWith(".html")) || path.join(__dirname, "..", "index.html"));
const T = checks({ onlyFailures: true }), { check, section } = T;
const tally = (from) => console.log(`  ${T.total - from} checks`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = (x) => JSON.stringify(x);

const app = openApp({ file });
const content = app.content();
console.log(`Rules test for ${path.basename(file)} (version ${app.version})`);

/* ------------------------------------------------------------------ 1. scheduling */
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
// Written out by hand. A right answer to a due item: [the box it moves to, the time to its next review in ms, promoted]
const RIGHT = {
  0: [1, 600000, true],        // 10 minutes
  1: [2, 86400000, true],      // 1 day
  2: [3, 259200000, true],     // 3 days
  3: [4, 604800000, true],     // 7 days
  4: [5, 1209600000, true],    // 14 days
  5: [6, 2592000000, true],    // 30 days
  6: [7, 5184000000, true],    // 60 days
  7: [7, 5184000000, false],   // the top box: 60 days again
};
// A right answer to a recognition exercise (a choice, a card turned over) for an item that can also be typed: it reaches
// box 2 and no further, but is still put off by its own box's time.
const RIGHT_RECOGNITION = {
  0: [1, 600000, true], 1: [2, 86400000, true], 2: [2, 86400000, false], 3: [3, 259200000, false],
  4: [4, 604800000, false], 5: [5, 1209600000, false], 6: [6, 2592000000, false], 7: [7, 5184000000, false],
};
const WRONG = { 0: 1, 1: 1, 2: 1, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 }; // down two boxes, never under box 1; back in 10 minutes
// The spread from box 3 up: with Math.random() at 0 the review comes 10% sooner, at its top 10% later (to the millisecond below).
const SOONEST = { 259200000: 233280000, 604800000: 544320000, 1209600000: 1088640000, 2592000000: 2332800000, 5184000000: 4665600000 };
const LATEST = { 259200000: 285120000, 604800000: 665280000, 1209600000: 1330560000, 2592000000: 2851200000, 5184000000: 5702400000 };

const T0 = Date.UTC(2026, 10, 10, 9, 0); // 10 November 2026, 10:00 in Tirane
const DAY0 = "2026-11-10";
const first = (unit, ok) => (content.byUnit[unit] || []).find(ok);
const flashUnit = content.units.find(u => app.isFlashUnit(u.id)).id;
const ITEMS = { // [the item, the day's count a new one adds to, can it be typed?]
  word: [first("u01", i => i.type === "vocab"), "new", true],
  card: [first(flashUnit, i => i.type === "vocab"), "cards", true],
  verb: [content.byUnit.vb[0], null, true],
  sort: [Object.values(content.items).find(i => (i.type === "sort" || i.type === "match") && !app.isFlashUnit(i.unit)), "new", false],
};

function schedulingChecks() {
  section("1. Scheduling: applyResult and undoResult, case by case");
  const from = T.total;
  check("the items for the table exist (a grammar word, a flashcard, a Verbs tense, a recognition-only item)", Object.values(ITEMS).every(x => x[0]), show(Object.keys(ITEMS).filter(k => !ITEMS[k][0])));
  check("which of them can be typed (itemHasProduction)", Object.values(ITEMS).every(([it, , typed]) => app.itemHasProduction(it) === typed));
  let n = 0;
  const bad = [];
  for (const [name, [item, counts, typed]] of Object.entries(ITEMS)) for (const box of [0, 1, 2, 3, 4, 5, 6, 7]) for (const hasRec of box === 0 ? [false, true] : [true])
    for (const due of [true, false]) for (const correct of [true, false]) for (const repeat of [false, true]) for (const kind of ["production", "recognition"]) for (const dayBefore of [false, true]) {
      n++;
      const label = `${name}, box ${box}${hasRec ? "" : " (no record)"}, ${due ? "due" : "not due"}, ${correct ? "right" : "wrong"}, ${kind}${repeat ? ", a repeat" : ""}${dayBefore ? ", a day already begun" : ""}`;
      const p = app.reset();
      app.clock.t = T0; app.setRandom(() => 0.5); // 0.5: the spread adds nothing
      const id = app.pid(item.id), typeKey = kind === "production" ? "recall" : "meaning";
      const before = hasRec ? { box, due: due ? T0 - 1000 : T0 + 5 * DAY, lapses: 2, lastSeen: T0 - DAY, lastWrong: T0 - 3 * DAY, seenCount: 9, lastRight: T0 - DAY } : null;
      if (before) p.items[id] = Object.assign({}, before);
      const day0 = dayBefore ? { xp: 17, new: 3, cards: 2, t: { all: [5, 9], recall: [2, 4], cloze: [3, 5] } } : null;
      if (day0) p.days[DAY0] = JSON.parse(JSON.stringify(day0));
      const b = before || { box: 0, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 0, lastRight: 0 };

      // what must come out, by the rules as the header states them
      const want = Object.assign({}, b, { seenCount: b.seenCount + 1, lastSeen: T0 });
      let promoted = false, xp = 0;
      if (!repeat && correct) {
        const wasDue = box <= 1 || due; // boxes 0 and 1 move up within a session, whatever their time
        if (wasDue) { const [nb, wait, pr] = (kind === "recognition" && typed ? RIGHT_RECOGNITION : RIGHT)[box]; want.box = nb; want.due = T0 + wait; promoted = pr; }
        want.lastRight = T0; xp = kind === "production" ? 2 : 1;
      } else if (!repeat) { want.box = WRONG[box]; want.due = T0 + 600000; want.lapses = b.lapses + 1; want.lastWrong = T0; }
      else if (correct && box === 0) { want.box = 1; want.due = T0 + 600000; } // a repeat only lifts a new item to box 1
      const d0 = day0 || { xp: 0, new: 0 };
      const wantDay = { xp: (d0.xp || 0) + xp, new: (d0.new || 0) + (box === 0 && counts === "new" ? 1 : 0), cards: (d0.cards || 0) + (box === 0 && counts === "cards" ? 1 : 0) };
      const stat = (k) => { const s = (d0.t && d0.t[k]) || [0, 0]; return !repeat && (k === "all" || k === typeKey) ? [s[0] + (correct ? 1 : 0), s[1] + 1] : s; };
      const wantOut = { promoted, xp, before, dayDelta: { new: wantDay.new - (d0.new || 0), cards: wantDay.cards - (d0.cards || 0) }, typeKey: repeat ? null : typeKey, correct };

      const out = app.applyResult(item.id, correct, kind, repeat, typeKey);
      const got = p.items[id], day = p.days[DAY0] || {};
      const gotDay = { xp: day.xp || 0, new: day.new || 0, cards: day.cards || 0 }, st = (k) => (day.t && day.t[k]) || [0, 0];
      const problems = [];
      if (!same(got, want)) problems.push(`the record is ${show(got)}, not ${show(want)}`);
      if (!same(out, wantOut)) problems.push(`applyResult returned ${show(out)}, not ${show(wantOut)}`);
      if (!same(gotDay, wantDay)) problems.push(`the day is ${show(gotDay)}, not ${show(wantDay)}`);
      for (const k of ["all", "recall", "meaning", "cloze"]) if (!same(st(k), stat(k))) problems.push(`the day's count of ${k} is ${show(st(k))}, not ${show(stat(k))}`);
      if (Object.keys(p.days).length !== 1) problems.push(`days written: ${Object.keys(p.days).join(", ")}`);

      app.undoResult(item.id, out);
      const back = p.items[id] || null, dayBack = p.days[DAY0] || {};
      if (!same(back, before)) problems.push(`after undo the record is ${show(back)}, not ${show(before)}`);
      const undone = { xp: dayBack.xp || 0, new: dayBack.new || 0, cards: dayBack.cards || 0 }, was = { xp: d0.xp || 0, new: d0.new || 0, cards: d0.cards || 0 };
      if (!same(undone, was)) problems.push(`after undo the day is ${show(undone)}, not ${show(was)}`);
      for (const k of ["all", "recall", "meaning", "cloze"]) { const s = (dayBack.t && dayBack.t[k]) || [0, 0], w = (d0.t && d0.t[k]) || [0, 0]; if (!same(s, w)) problems.push(`after undo the day's count of ${k} is ${show(s)}, not ${show(w)}`); }
      if (Object.keys(p.items).length !== (before ? 1 : 0)) problems.push("after undo other records are left: " + Object.keys(p.items).join(", "));
      check(label, !problems.length, problems.join("\n"));
      if (problems.length) bad.push(label);
    }
  console.log(`  ${n} cases: ${Object.keys(ITEMS).join(", ")} × box 0–7 × due or not × right or wrong × first answer or repeat × production or recognition`);

  // the spread: at the bottom and the top of Math.random's range, and never at boxes 1 and 2
  const word = ITEMS.word[0], id = app.pid(word.id);
  for (const box of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const wait = RIGHT[box][1];
    const due = (rnd) => { const p = app.reset(); app.clock.t = T0; app.setRandom(() => rnd); p.items[id] = { box, due: T0 - 1, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 1, lastRight: 0 }; app.applyResult(word.id, true, "production", false, "recall"); return p.items[id].due - T0; };
    const lo = due(0), hi = due(0.999999999);
    if (wait < 259200000) check(`box ${box} right: the next review is exactly ${wait / MIN} minutes on, whatever Math.random gives`, lo === wait && hi === wait, `${lo} and ${hi} ms`);
    else check(`box ${box} right: the next review is between 10% sooner and 10% later than ${wait / DAY} days`, lo === SOONEST[wait] && hi <= LATEST[wait] && hi > LATEST[wait] - 1000, `${lo} to ${hi} ms, not ${SOONEST[wait]} to ${LATEST[wait]}`);
  }
  // a wrong answer is never spread
  { const p = app.reset(); app.clock.t = T0; app.setRandom(() => 0); p.items[id] = { box: 7, due: T0 - 1, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 1, lastRight: 0 }; app.applyResult(word.id, false, "production", false, "recall");
    check("a wrong answer comes back in exactly 10 minutes, whatever Math.random gives", p.items[id].due === T0 + 600000 && p.items[id].box === 5, show(p.items[id])); }
  // two copies of one word share a record (an alias, a copy in another unit): the answer lands on the record's id
  { const copy = Object.keys(content.canon)[0];
    if (copy) { const p = app.reset(); app.clock.t = T0; app.applyResult(copy, true, "production", false, "recall"); check("an answer to a copy of a word lands on the record the copies share", same(Object.keys(p.items), [content.canon[copy]]), show(Object.keys(p.items))); } }
  // a walk: right six times as each review falls due, then wrong, then right again
  { const p = app.reset(); app.setRandom(() => 0.5); let t = T0; const seen = [];
    for (const step of ["right", "right", "right", "right", "right", "right", "right", "right", "wrong", "right"]) { app.clock.t = t; app.applyResult(word.id, step === "right", "production", false, "recall"); const r = p.items[id]; seen.push([r.box, r.due - t]); t = r.due; }
    const want = [[1, 600000], [2, 86400000], [3, 259200000], [4, 604800000], [5, 1209600000], [6, 2592000000], [7, 5184000000], [7, 5184000000], [5, 600000], [6, 2592000000]];
    check("a word answered right as each review falls due climbs 1, 2, 3, 4, 5, 6, 7, stays at 7, drops to 5 when wrong and climbs again", same(seen, want), show(seen));
    check("… with one lapse, ten answers seen, and lastRight after lastWrong", p.items[id].lapses === 1 && p.items[id].seenCount === 10 && p.items[id].lastRight > p.items[id].lastWrong && p.items[id].lastWrong > 0, show(p.items[id])); }
  tally(from);
}

/* ------------------------------------------------------------------ 2. the streak and the calendar */
// Moments in Europe/Tirane, written as UTC by hand: CEST (summer) is UTC+2, CET (winter) UTC+1. In 2026 the clocks go
// forward on 29 March at 02:00 (to 03:00) and back on 25 October at 03:00 (to 02:00).
const utc = (y, mo, d, h, mi = 0, s = 0, ms = 0) => Date.UTC(y, mo - 1, d, h, mi, s, ms);
function calendarChecks() {
  section("2. The streak and the calendar (Europe/Tirane)");
  const from = T.total;
  const days = (o, goal) => { const p = app.reset(); if (goal != null) p.settings.goal = goal; for (const [k, xp] of Object.entries(o)) p.days[k] = { xp, new: 0 }; return p; };
  const noon = utc(2026, 11, 10, 11); // 10 November 2026, 12:00 in Tirane (winter time)
  app.clock.t = noon;
  check("the test's clock: the app's day is 2026-11-10", app.dayKey(app.clock.t) === "2026-11-10" && process.env.TZ === "Europe/Tirane", app.dayKey(app.clock.t));
  const streakOf = (o, goal) => { days(o, goal); return app.streak(); };
  const cases = [ // [what, the days' xp, the goal (30 unless given), the streak]
    ["no practice at all", {}, null, 0],
    ["the goal met exactly today (30 of 30)", { "2026-11-10": 30 }, null, 1],
    ["one short of the goal today (29 of 30)", { "2026-11-10": 29 }, null, 0],
    ["over the goal today", { "2026-11-10": 31 }, null, 1],
    ["met exactly three days running", { "2026-11-10": 30, "2026-11-09": 30, "2026-11-08": 30 }, null, 3],
    ["not yet met today, met yesterday and the day before: the streak stands until the day is over", { "2026-11-10": 12, "2026-11-09": 30, "2026-11-08": 45 }, null, 2],
    ["nothing today yet, met yesterday", { "2026-11-09": 30 }, null, 1],
    ["met today, missed yesterday, met the day before", { "2026-11-10": 30, "2026-11-09": 29, "2026-11-08": 30 }, null, 1],
    ["missed yesterday and not yet met today", { "2026-11-10": 5, "2026-11-09": 10, "2026-11-08": 50, "2026-11-07": 50 }, null, 0],
    ["a day with no record breaks it", { "2026-11-10": 30, "2026-11-08": 30 }, null, 1],
    ["across a month and a year's end is no different", { "2026-11-10": 30, "2026-11-09": 30, "2026-11-08": 30, "2026-11-07": 30, "2026-11-06": 30, "2026-11-05": 30, "2026-11-04": 30, "2026-11-03": 30, "2026-11-02": 30, "2026-11-01": 30, "2026-10-31": 30, "2026-10-30": 30 }, null, 12],
    ["days of 20 against a goal of 30", { "2026-11-10": 20, "2026-11-09": 20, "2026-11-08": 20 }, 30, 0],
    ["the goal lowered to 20: the same days now count", { "2026-11-10": 20, "2026-11-09": 20, "2026-11-08": 20 }, 20, 3],
    ["the goal raised to 50: days of 30 no longer count", { "2026-11-10": 30, "2026-11-09": 30 }, 50, 0],
    ["the goal raised to 50, today 50, earlier days 30", { "2026-11-10": 50, "2026-11-09": 30 }, 50, 1],
    ["a goal of 10 met exactly", { "2026-11-10": 10, "2026-11-09": 10 }, 10, 2],
  ];
  for (const [what, o, goal, want] of cases) { const got = streakOf(o, goal); check(`streak: ${what} → ${want}`, got === want, `streak() gave ${got}`); }
  { days({ "2026-12-31": 30, "2027-01-01": 30 }); app.clock.t = utc(2027, 1, 1, 11); check("streak: 31 December and 1 January → 2", app.streak() === 2, String(app.streak())); }

  // the limit on new items: counted by the day, and back in full at midnight
  const word = (k) => content.byUnit.u01.filter(i => i.type === "vocab" && !content.canon[i.id])[k];
  { const p = app.reset(); p.settings.newPerDay = 10; app.clock.t = utc(2026, 11, 10, 22, 50); // 23:50
    check("new items: 10 left on a day with none started", app.newLeftToday() === 10, String(app.newLeftToday()));
    for (let k = 0; k < 4; k++) app.applyResult(word(k).id, true, "recognition", false, "meaning");
    check("new items: 6 left after four new items", app.newLeftToday() === 6, String(app.newLeftToday()));
    app.applyResult(word(0).id, true, "production", false, "recall");
    check("new items: an item already started doesn't count again", app.newLeftToday() === 6, String(app.newLeftToday()));
    for (let k = 4; k < 12; k++) app.applyResult(word(k).id, true, "recognition", false, "meaning");
    check("new items: none left after twelve, never fewer than none", app.newLeftToday() === 0 && p.days["2026-11-10"].new === 12, `${app.newLeftToday()} left, ${p.days["2026-11-10"].new} counted`);
    app.clock.t = utc(2026, 11, 10, 22, 59, 59, 999);
    check("new items: still none a millisecond before midnight", app.newLeftToday() === 0);
    app.clock.t = utc(2026, 11, 10, 23, 0);
    check("new items: all 10 again at midnight", app.newLeftToday() === 10 && app.dayKey(app.clock.t) === "2026-11-11", `${app.newLeftToday()} left on ${app.dayKey(app.clock.t)}`);
    check("new items: yesterday's count is kept as it was", p.days["2026-11-10"].new === 12 && ((p.days["2026-11-11"] || {}).new || 0) === 0, show(p.days));
    p.settings.newPerDay = 3; app.applyResult(word(12).id, true, "recognition", false, "meaning");
    check("new items: a limit of 3 with one started leaves 2", app.newLeftToday() === 2, String(app.newLeftToday())); }

  // a session that runs past midnight: each answer counts on the day it is given, and the streak stands
  { const p = app.reset(); p.settings.goal = 4; p.days["2026-11-09"] = { xp: 4, new: 0 };
    app.clock.t = utc(2026, 11, 10, 22, 58); // 23:58
    app.applyResult(word(0).id, true, "production", false, "recall"); app.applyResult(word(1).id, true, "production", false, "recall");
    check("past midnight: two typed answers at 23:58 give the day 4 xp and meet a goal of 4", p.days["2026-11-10"].xp === 4 && app.streak() === 2, `${show(p.days["2026-11-10"])}, streak ${app.streak()}`);
    app.clock.t = utc(2026, 11, 10, 23, 2); // 00:02 the next day
    check("past midnight: at 00:02 the streak still stands (yesterday met, today not yet)", app.streak() === 2, String(app.streak()));
    const out = app.applyResult(word(2).id, true, "production", false, "recall");
    check("past midnight: an answer at 00:02 counts on the new day, and the old day keeps its own", p.days["2026-11-11"].xp === 2 && p.days["2026-11-11"].new === 1 && p.days["2026-11-10"].xp === 4 && p.days["2026-11-10"].new === 2, show(p.days));
    app.undoResult(word(2).id, out);
    check("past midnight: undoing it takes it off the new day only", p.days["2026-11-11"].xp === 0 && p.days["2026-11-11"].new === 0 && p.days["2026-11-10"].xp === 4, show(p.days));
    app.applyResult(word(2).id, true, "production", false, "recall"); app.applyResult(word(3).id, true, "production", false, "recall");
    check("past midnight: the goal met on the new day too makes the streak 3", app.streak() === 3, String(app.streak()));
    // the session's own bonus (5 xp as it ends) lands on the day it ends
    const ex = app.makeExercise(word(4), { box: 2 }, "production"); app.show(ex);
    app.clock.t = utc(2026, 11, 11, 22, 59); app.answerTyped(ex.accepted[0]); // 23:59 on the 11th
    const xp11 = p.days["2026-11-11"].xp;
    app.clock.t = utc(2026, 11, 11, 23, 0, 30); app.continueSession(); // 00:00:30 on the 12th
    check("past midnight: a session begun at 23:59 and finished after midnight gives its 5 xp bonus to the new day", p.days["2026-11-11"].xp === xp11 && p.days["2026-11-12"].xp === 5 && app.session().finished, show(p.days)); }

  // 25 October 2026: the clocks go back at 03:00 (01:00 UTC), so the day is 25 hours long
  { const p = app.reset();
    const moments = [["00:00", utc(2026, 10, 24, 22, 0)], ["01:59", utc(2026, 10, 24, 23, 59)], ["02:30, the first time", utc(2026, 10, 25, 0, 30)], ["02:30, the second time", utc(2026, 10, 25, 1, 30)], ["03:00", utc(2026, 10, 25, 2, 0)], ["23:59:59", utc(2026, 10, 25, 22, 59, 59)]];
    for (const [at, t] of moments) check(`25 October (clocks back): ${at} is 2026-10-25`, app.dayKey(t) === "2026-10-25", app.dayKey(t));
    check("25 October: a millisecond before it begins is 2026-10-24, and 25 hours later it is 2026-10-26", app.dayKey(utc(2026, 10, 24, 21, 59, 59, 999)) === "2026-10-24" && app.dayKey(utc(2026, 10, 25, 23, 0)) === "2026-10-26" && utc(2026, 10, 25, 23, 0) - utc(2026, 10, 24, 22, 0) === 25 * HOUR);
    p.settings.newPerDay = 10; app.clock.t = utc(2026, 10, 24, 22, 10); // 00:10 on the 25th
    for (let k = 0; k < 10; k++) app.applyResult(word(k).id, true, "recognition", false, "meaning");
    app.clock.t = utc(2026, 10, 25, 22, 50); // 23:50 the same day, 24 hours and 40 minutes later
    check("25 October: new items started at 00:10 still count at 23:50, over 24 hours later", app.newLeftToday() === 0, String(app.newLeftToday()));
    app.clock.t = utc(2026, 10, 25, 23, 0);
    check("25 October: the limit is back at the next midnight", app.newLeftToday() === 10, String(app.newLeftToday()));
    for (const [at, t] of [["on the 24th at noon", utc(2026, 10, 24, 10)], ["on the 25th at 02:30, the first time", utc(2026, 10, 25, 0, 30)], ["on the 25th at 02:30, the second time", utc(2026, 10, 25, 1, 30)], ["on the 25th at 23:30", utc(2026, 10, 25, 22, 30)], ["on the 26th at 00:30", utc(2026, 10, 25, 23, 30)], ["on the 26th at noon", utc(2026, 10, 26, 11)], ["on the 27th at 00:30", utc(2026, 10, 26, 23, 30)]]) {
      days({ "2026-10-22": 30, "2026-10-23": 30, "2026-10-24": 30, "2026-10-25": 30, "2026-10-26": 30 }); app.clock.t = t;
      const want = { "2026-10-24": 3, "2026-10-25": 4, "2026-10-26": 5, "2026-10-27": 5 }[app.dayKey(t)];
      check(`25 October: five days met from the 22nd, seen ${at} → ${want}`, app.streak() === want, String(app.streak()));
    }
    days({ "2026-10-24": 30, "2026-10-26": 30 }); app.clock.t = utc(2026, 10, 26, 11);
    check("25 October: the long day missed breaks the streak", app.streak() === 1, String(app.streak()));
    // a review set for one day later is 24 hours later by the clock, which on this day is an hour earlier on the wall
    app.reset(); app.clock.t = utc(2026, 10, 24, 10, 0); const id = app.pid(word(0).id); // noon on the 24th
    app.progress().items[id] = { box: 1, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 1, lastRight: 0 }; app.applyResult(word(0).id, true, "production", false, "recall");
    check("25 October: a one-day review set at noon on the 24th falls due 24 hours later (11:00 on the wall)", app.progress().items[id].due === utc(2026, 10, 25, 10, 0) && !app.isDue(word(0).id, utc(2026, 10, 25, 9, 59, 59, 999)) && app.isDue(word(0).id, utc(2026, 10, 25, 10, 0)), String(app.progress().items[id].due)); }

  // 29 March 2026: the clocks go forward at 02:00 (01:00 UTC), so the day is 23 hours long and 02:30 never comes
  { const moments = [["00:00", utc(2026, 3, 28, 23, 0)], ["01:59", utc(2026, 3, 29, 0, 59)], ["03:00", utc(2026, 3, 29, 1, 0)], ["23:59:59", utc(2026, 3, 29, 21, 59, 59)]];
    for (const [at, t] of moments) check(`29 March (clocks forward): ${at} is 2026-03-29`, app.dayKey(t) === "2026-03-29", app.dayKey(t));
    check("29 March: a millisecond before it begins is 2026-03-28, and 23 hours later it is 2026-03-30", app.dayKey(utc(2026, 3, 28, 22, 59, 59, 999)) === "2026-03-28" && app.dayKey(utc(2026, 3, 29, 22, 0)) === "2026-03-30" && utc(2026, 3, 29, 22, 0) - utc(2026, 3, 28, 23, 0) === 23 * HOUR);
    for (const [at, t] of [["on the 29th at 00:30", utc(2026, 3, 28, 23, 30)], ["on the 29th at 03:00", utc(2026, 3, 29, 1, 0)], ["on the 30th at 00:30", utc(2026, 3, 29, 22, 30)], ["on the 30th at 02:30 (a time the 29th never had)", utc(2026, 3, 30, 0, 30)], ["on the 30th at noon", utc(2026, 3, 30, 10)], ["on the 31st at 02:30", utc(2026, 3, 31, 0, 30)]]) {
      days({ "2026-03-26": 30, "2026-03-27": 30, "2026-03-28": 30, "2026-03-29": 30, "2026-03-30": 30 }); app.clock.t = t;
      const want = { "2026-03-29": 4, "2026-03-30": 5, "2026-03-31": 5 }[app.dayKey(t)];
      check(`29 March: five days met from the 26th, seen ${at} → ${want}`, app.streak() === want, String(app.streak()));
    }
    days({ "2026-03-28": 30, "2026-03-30": 30 }); app.clock.t = utc(2026, 3, 30, 10);
    check("29 March: the short day missed breaks the streak", app.streak() === 1, String(app.streak()));
    const p = app.reset(); p.settings.newPerDay = 10; app.clock.t = utc(2026, 3, 29, 0, 30); // 01:30
    for (let k = 0; k < 10; k++) app.applyResult(word(k).id, true, "recognition", false, "meaning");
    app.clock.t = utc(2026, 3, 29, 21, 50); const left = app.newLeftToday(); app.clock.t = utc(2026, 3, 29, 22, 0);
    check("29 March: the limit on new items lasts the 23-hour day and is back at the next midnight", left === 0 && app.newLeftToday() === 10, `${left}, then ${app.newLeftToday()}`); }

  // a device that changes time zone: the days are named by the device's own calendar, so the record of a day never
  // moves; what "today" is does
  { const met = { "2026-11-08": 30, "2026-11-09": 30, "2026-11-10": 30 };
    const moment = utc(2026, 11, 10, 22, 30); // 23:30 on the 10th in Tirane
    const inZone = (tz, fn) => { process.env.TZ = tz; try { return fn(); } finally { process.env.TZ = "Europe/Tirane"; } };
    for (const [tz, today, want] of [["Europe/Tirane", "2026-11-10", 3], ["Europe/London", "2026-11-10", 3], ["America/New_York", "2026-11-10", 3], ["America/Los_Angeles", "2026-11-10", 3], ["Asia/Tokyo", "2026-11-11", 3], ["Pacific/Auckland", "2026-11-11", 3], ["Asia/Kolkata", "2026-11-11", 3]]) {
      days(met); app.clock.t = moment;
      const got = inZone(tz, () => [app.dayKey(app.clock.t), app.streak()]);
      check(`a change of time zone: three days met in Tirane, opened in ${tz} at the same moment (${today} there) → streak ${want}`, same(got, [today, want]), show(got));
    }
    // flying west just after midnight: the device's calendar goes back a day; the streak counts up to that day, and
    // the day ahead counts once the calendar reaches it
    days(met); app.clock.t = utc(2026, 11, 9, 23, 30); // 00:30 on the 10th in Tirane, where the 10th is already met
    const east = app.streak();
    const west = inZone("America/Los_Angeles", () => [app.dayKey(app.clock.t), app.streak(), app.newLeftToday()]); // 15:30 on the 9th there
    check("a change of time zone: flying west to the day before, the streak counts up to that day (2), losing nothing", east === 3 && same(west.slice(0, 2), ["2026-11-09", 2]), `${east} in Tirane; in Los Angeles ${show(west)}`);
    app.clock.t = utc(2026, 11, 10, 20, 0); // noon on the 10th in Los Angeles
    check("a change of time zone: … and is 3 again when the 10th comes there", inZone("America/Los_Angeles", () => app.streak()) === 3);
    // an answer given there counts on that device's day
    { const p = days(met); app.clock.t = utc(2026, 11, 11, 2, 0); // 03:00 on the 11th in Tirane, 18:00 on the 10th in Los Angeles
      inZone("America/Los_Angeles", () => app.applyResult(word(0).id, true, "production", false, "recall"));
      check("a change of time zone: an answer counts on the day the device shows (the 10th in Los Angeles, though the 11th in Tirane)", p.days["2026-11-10"].xp === 32 && !p.days["2026-11-11"], show(p.days)); }
    // flying east past midnight: a new day, a fresh limit, and yesterday still counted
    { const p = days(met); p.days["2026-11-10"].new = 10; app.clock.t = moment;
      const got = inZone("Asia/Tokyo", () => [app.newLeftToday(), app.streak()]);
      check("a change of time zone: flying east into tomorrow gives a new day's limit of new items and keeps the streak", same(got, [10, 3]), show(got)); } }
  tally(from);
}

/* ------------------------------------------------------------------ 3. the answer checker */
function checkerChecks() {
  section("3. The answer checker: checkAnswer, case by case");
  const from = T.total;
  app.clock.t = T0; app.setRandom(seeded(3));
  const IT = {}, EN = { english: true }, TYPOS = { typos: true }, EN_TYPOS = { english: true, typos: true }, NUM = { english: true, numWords: true, typos: true };
  const eat = "I eat | I am eating";
  // [typed, accepted, options, settings (accents, typos), ok, note ("" for none), closest (wrong answers only, where it matters)]
  const LENIENT = {}, STRICT = { accents: "strict" }, NO_TYPOS = { typos: false }, STRICT_NO_TYPOS = { accents: "strict", typos: false };
  const table = [
    // the plain cases
    ["casa", ["casa"], IT, LENIENT, true, ""],
    ["Casa", ["casa"], IT, LENIENT, true, ""],
    ["  la   casa  ", ["la casa"], IT, LENIENT, true, ""],
    ["Ciao!", ["ciao"], IT, LENIENT, true, ""],
    ["come stai", ["Come stai?"], IT, LENIENT, true, ""],
    ["casa", ["la casa", "casa"], IT, LENIENT, true, ""],
    ["cane", ["casa"], IT, LENIENT, false, undefined, "casa"],
    ["", ["casa"], IT, LENIENT, false, undefined],
    ["   ", ["casa"], IT, LENIENT, false, undefined],
    ["?!", ["casa"], IT, LENIENT, false, undefined],
    // accents, lenient: accepted, with a reminder
    ["citta", ["città"], IT, LENIENT, true, "Watch the accent: città"],
    ["città", ["città"], IT, LENIENT, true, ""],
    ["CITTÀ", ["città"], IT, LENIENT, true, ""],
    ["perche", ["perché"], IT, LENIENT, true, "Watch the accent: perché"],
    ["perchè", ["perché"], IT, LENIENT, true, "Watch the accent: perché"],
    ["e", ["è"], IT, LENIENT, true, "Watch the accent: è"],
    ["è", ["e"], IT, LENIENT, true, "Watch the accent: e"],
    ["citta'", ["città"], IT, LENIENT, true, "Watch the accent: città"],
    ["piu", ["più"], IT, LENIENT, true, "Watch the accent: più"],
    ["lunedi", ["il lunedì", "lunedì"], IT, LENIENT, true, "Watch the accent: lunedì"],
    ["e una citta", ["È una città."], IT, LENIENT, true, "Watch the accent: È una città."],
    // accents, strict: refused, and the typo rule doesn't let them through either
    ["citta", ["città"], IT, STRICT, false, undefined, "città"],
    ["citta", ["città"], TYPOS, STRICT, false, undefined, "città"],
    ["città", ["città"], IT, STRICT, true, ""],
    ["perchè", ["perché"], TYPOS, STRICT, false, undefined],
    ["perche", ["perché"], TYPOS, STRICT, false, undefined],
    ["e", ["è"], IT, STRICT, false, undefined],
    ["citta'", ["città"], IT, STRICT, false, undefined],
    ["piu", ["più"], TYPOS, STRICT, false, undefined],
    // apostrophes must match
    ["l'amico", ["l'amico"], IT, LENIENT, true, ""],
    ["l’amico", ["l'amico"], IT, LENIENT, true, ""],
    ["l`amico", ["l'amico"], IT, LENIENT, true, ""],
    ["l amico", ["l'amico"], TYPOS, LENIENT, false, undefined],
    ["lamico", ["l'amico"], TYPOS, LENIENT, false, undefined],
    ["la amico", ["l'amico"], TYPOS, LENIENT, false, undefined],
    ["un amica", ["un'amica"], TYPOS, LENIENT, false, undefined],
    ["unamica", ["un'amica"], TYPOS, LENIENT, false, undefined],
    ["dell amico", ["dell'amico"], TYPOS, LENIENT, false, undefined],
    ["c è", ["c'è"], TYPOS, LENIENT, false, undefined],
    ["ce", ["c'è"], TYPOS, LENIENT, false, undefined],
    ["c'e", ["c'è"], IT, LENIENT, true, "Watch the accent: c'è"],
    ["l'amicco", ["l'amico"], TYPOS, LENIENT, true, "Check the spelling: l'amico"],
    ["un po'", ["un po'"], IT, LENIENT, true, ""],
    ["un po", ["un po'"], IT, STRICT, false, undefined],
    ["'zaino'", ["zaino"], IT, LENIENT, true, ""],
    // typos: one slip in a word of five letters or more, the last letter right
    ["ragazo", ["ragazzo"], TYPOS, LENIENT, true, "Check the spelling: ragazzo"],
    ["raggazzo", ["ragazzo"], TYPOS, LENIENT, true, "Check the spelling: ragazzo"],
    ["rahazzo", ["ragazzo"], TYPOS, LENIENT, true, "Check the spelling: ragazzo"],
    ["ragazo", ["ragazzo"], IT, LENIENT, false, undefined, "ragazzo"],
    ["ragazo", ["ragazzo"], TYPOS, NO_TYPOS, false, undefined, "ragazzo"],
    ["ragazo", ["ragazzo"], TYPOS, STRICT, true, "Check the spelling: ragazzo"],
    ["ragazo", ["ragazzo"], TYPOS, STRICT_NO_TYPOS, false, undefined],
    ["ragazzu", ["ragazzo"], TYPOS, LENIENT, false, undefined],
    ["ragaso", ["ragazzo"], TYPOS, LENIENT, false, undefined],
    ["rgazo", ["ragazzo"], TYPOS, LENIENT, false, undefined],
    ["caza", ["casa"], TYPOS, LENIENT, false, undefined],
    ["cas", ["casa"], TYPOS, LENIENT, false, undefined],
    ["il ragazo", ["il ragazzo"], TYPOS, LENIENT, true, "Check the spelling: il ragazzo"],
    ["il ragazo", ["ragazzo"], TYPOS, LENIENT, false, undefined],
    ["la ragazo simpatco", ["la ragazzo simpatico"], TYPOS, LENIENT, false, undefined],
    ["citá", ["città"], TYPOS, LENIENT, true, "Check the spelling: città"],
    ["buongorno", ["buongiorno"], TYPOS, LENIENT, true, "Check the spelling: buongiorno"],
    // a slip that makes another word of the course is a different word, never a typo
    ["quando", ["quanto"], TYPOS, LENIENT, false, undefined],
    ["siamo", ["siano"], TYPOS, LENIENT, false, undefined],
    ["ragazza", ["ragazzo"], TYPOS, LENIENT, false, undefined],
    ["night", ["right"], EN_TYPOS, LENIENT, false, undefined],
    ["house", ["horse"], EN_TYPOS, LENIENT, false, undefined],
    // English: typos, and British and American spelling
    ["beatiful", ["beautiful"], EN_TYPOS, LENIENT, true, "Check the spelling: beautiful"],
    ["beatiful", ["beautiful"], EN, LENIENT, false, undefined],
    ["beatiful", ["beautiful"], EN_TYPOS, NO_TYPOS, false, undefined],
    ["color", ["colour"], EN, LENIENT, true, ""],
    ["colour", ["color"], EN, LENIENT, true, ""],
    ["gray", ["grey"], EN, LENIENT, true, ""],
    ["theater", ["theatre"], EN, LENIENT, true, ""],
    ["center", ["the centre"], EN, LENIENT, true, ""],
    ["to practice", ["to practise"], EN, LENIENT, true, ""],
    ["traveling", ["travelling"], EN, LENIENT, true, ""],
    ["to organize", ["to organise"], EN, LENIENT, true, ""],
    ["neighbor", ["neighbour"], EN, LENIENT, true, ""],
    ["favorite", ["favourite"], EN, LENIENT, true, ""],
    ["pajamas", ["pyjamas"], EN, LENIENT, true, ""],
    ["mom", ["mum"], EN, LENIENT, true, ""],
    ["colur", ["colour"], EN, LENIENT, false, undefined],
    // contractions
    ["I'm tired", ["I am tired"], EN, LENIENT, true, ""],
    ["I am tired", ["I'm tired"], EN, LENIENT, true, ""],
    ["I don't know", ["I do not know"], EN, LENIENT, true, ""],
    ["I cannot come", ["I can't come"], EN, LENIENT, true, ""],
    ["it is late", ["it's late"], EN, LENIENT, true, ""],
    ["we will see", ["we'll see"], EN, LENIENT, true, ""],
    ["I would like", ["I'd like"], EN, LENIENT, true, ""],
    ["they have gone", ["they've gone"], EN, LENIENT, true, ""],
    ["let us go", ["let's go"], EN, LENIENT, true, ""],
    ["I wont come", ["I won't come"], EN, LENIENT, false, undefined],
    // a leading to, the, a or an
    ["eat", ["to eat"], EN, LENIENT, true, ""],
    ["to eat", ["eat"], EN, LENIENT, true, ""],
    ["house", ["the house"], EN, LENIENT, true, ""],
    ["the house", ["house"], EN, LENIENT, true, ""],
    ["a house", ["house"], EN, LENIENT, true, ""],
    ["an apple", ["apple"], EN, LENIENT, true, ""],
    ["apple", ["an apple"], EN, LENIENT, true, ""],
    ["go", ["to go to"], EN, LENIENT, false, undefined],
    ["to go to", ["to go"], EN, LENIENT, false, undefined],
    ["la casa", ["casa"], IT, LENIENT, false, undefined], // Italian articles are part of the answer
    ["casa", ["la casa"], IT, LENIENT, false, undefined],
    // parts in brackets are optional; one's, my, your and someone, somebody are interchangeable in phrases
    ["to wake up", ["to wake (someone) up"], EN, LENIENT, true, ""],
    ["wake someone up", ["to wake (someone) up"], EN, LENIENT, true, ""],
    ["to wake somebody up", ["to wake (someone) up"], EN, LENIENT, true, ""],
    ["to wake him up", ["to wake (someone) up"], EN, LENIENT, true, ""],
    ["to wake", ["to wake (someone) up"], EN, LENIENT, false, undefined],
    ["nice", ["nice (of a person)"], EN, LENIENT, true, ""],
    ["nice of a person", ["nice (of a person)"], EN, LENIENT, true, ""],
    ["to brush my teeth", ["to brush one's teeth"], EN, LENIENT, true, ""],
    ["to brush your teeth", ["to brush one's teeth"], EN, LENIENT, true, ""],
    ["to brush teeth", ["to brush one's teeth"], EN, LENIENT, false, undefined],
    ["andato", ["andato (m)"], IT, LENIENT, true, ""],
    // digits as words, where the exercise allows it (flashcards)
    ["24", ["twenty-four"], NUM, LENIENT, true, ""],
    ["twenty four", ["24"], NUM, LENIENT, true, ""],
    ["twenty-four", ["twenty-four"], EN, LENIENT, true, ""],
    ["24", ["twenty-four"], EN_TYPOS, LENIENT, false, undefined],
    ["100", ["one hundred", "a hundred"], NUM, LENIENT, true, ""],
    ["2 o'clock", ["two o'clock"], NUM, LENIENT, true, ""],
    ["25", ["twenty-four"], NUM, LENIENT, false, undefined],
    ["1500", ["one thousand five hundred"], NUM, LENIENT, true, ""],
    // a subject pronoun the verb already shows may be added or left out, in translations (the English must have that subject)
    ["Io mangio", ["Mangio."], { pronoun: eat }, LENIENT, true, ""],
    ["mangio", ["Io mangio."], { pronoun: eat }, LENIENT, true, ""],
    ["Tu mangio", ["Mangio."], { pronoun: eat }, LENIENT, false, undefined],
    ["Lui mangio", ["Mangio."], { pronoun: eat }, LENIENT, false, undefined],
    ["Io mangio", ["Mangio."], IT, LENIENT, false, undefined],
    ["Lei mangia", ["Mangia."], { pronoun: "She eats" }, LENIENT, true, ""],
    ["Lui mangia", ["Mangia."], { pronoun: "She eats" }, LENIENT, false, undefined],
    ["Lei mangia", ["Mangia."], { pronoun: "He eats | He is eating" }, LENIENT, false, undefined],
    ["Lui mangia", ["Mangia."], { pronoun: "He eats | He is eating" }, LENIENT, true, ""],
    ["Noi mangiamo", ["Mangiamo."], { pronoun: "We eat" }, LENIENT, true, ""],
    ["Loro mangiano", ["Mangiano."], { pronoun: "They eat" }, LENIENT, true, ""],
    ["Tu mangi", ["Mangi?"], { pronoun: "Are you eating?" }, LENIENT, true, ""],
    ["Voi mangi", ["Mangi?"], { pronoun: "Are you eating?" }, LENIENT, false, undefined],
    ["Io non mangio", ["Non mangio."], { pronoun: "I don't eat" }, LENIENT, true, ""],
    ["Io mangio la mela", ["Mangio la mela."], { pronoun: "I eat the apple", typos: true }, LENIENT, true, ""],
    ["Io mangio la melaa", ["Mangio la mela."], { pronoun: "I eat the apple", typos: true }, LENIENT, false, undefined],
    // … and in replies, where there is no English to go by: the verb alone decides
    ["Io sto bene", ["Sto bene."], { pronounAny: true }, LENIENT, true, ""],
    ["Sto bene", ["Io sto bene."], { pronounAny: true }, LENIENT, true, ""],
    ["Tu sto bene", ["Sto bene."], { pronounAny: true }, LENIENT, false, undefined],
    ["Io sto bene", ["Sto bene."], IT, LENIENT, false, undefined],
    // the closest accepted answer is the one the panel compares with; a guess far from all of them gets the first
    ["torno a caza", ["Vado a casa.", "Torno a casa."], IT, LENIENT, false, undefined, "Torno a casa."],
    ["vado a caza", ["Vado a casa.", "Torno a casa."], IT, LENIENT, false, undefined, "Vado a casa."],
    ["boh", ["Vado a casa.", "Torno a casa."], IT, LENIENT, false, undefined, "Vado a casa."],
    ["xyzxyzxyzxyzxyz", ["Vado a casa.", "Torno a casa."], IT, LENIENT, false, undefined, "Vado a casa."],
    ["the hose", ["house", "home"], EN, LENIENT, false, undefined, "house"],
    ["hime", ["house", "home"], EN, LENIENT, false, undefined, "home"],
  ];
  const known = (w, en) => app.knownWords(en).has(w);
  check("the words the “another word” cases rely on are words of the course (quando, siamo, ragazza; night, house)", known("quando") && known("siamo") && known("ragazza") && known("night", true) && known("house", true));
  check("… and the slips forgiven are not (ragazo, buongorno, beatiful)", !known("ragazo") && !known("buongorno") && !known("beatiful", true));
  for (const [typed, accepted, opts, settings, ok, note, closest] of table) {
    const p = app.reset(); Object.assign(p.settings, settings);
    const r = app.checkAnswer(typed, accepted, opts);
    const how = `${show(typed)} for ${show(accepted)}${Object.keys(opts).length ? ", " + show(opts) : ""}${Object.keys(settings).length ? ", settings " + show(settings) : ""}`;
    const fine = r.ok === ok && (ok ? (r.note || "") === note : (closest === undefined || r.closest === closest) && (!String(typed).replace(/[^\p{L}\p{N}]/gu, "") || r.shown === accepted[0]));
    check(`${how} → ${ok ? "right" + (note ? ", “" + note + "”" : "") : "wrong" + (closest ? ", compared with “" + closest + "”" : "")}`, fine, `checkAnswer gave ${show(r)}`);
  }

  // Accept my answer: the learner's own synonym counts for that card, in English only
  { const card = ITEMS.card[0], other = content.byUnit[flashUnit].find(i => i.type === "vocab" && i.id !== card.id);
    const p = app.reset(); p.settings.fcDir = "it-en";
    const opts = (id) => ({ english: true, typos: true, numWords: true, itemId: id });
    check("Accept my answer: before, a made-up synonym is wrong", !app.checkAnswer("thingummy", card.en, opts(card.id)).ok);
    const ex = app.makeExercise(card, { box: 2 });
    const fb = app.answer(ex, "the Thingummy");
    check("Accept my answer: the card is a typed flashcard into English, answered wrong", ex.typeKey === "flashcard" && ex.english && fb.ok === false && p.items[app.pid(card.id)].box === 1 && p.items[app.pid(card.id)].lapses === 1, show({ typeKey: ex.typeKey, fb: { ok: fb.ok }, rec: p.items[app.pid(card.id)] }));
    app.acceptAnswer();
    const r = p.items[app.pid(card.id)], fb2 = app.S().feedback;
    check("Accept my answer: the wrong answer is taken back and counted right (box 1, no lapse, “accepted as a synonym”)", fb2.ok && fb2.note === "accepted as a synonym" && r.box === 1 && r.lapses === 0 && r.lastRight === T0 && r.lastWrong === 0, show({ fb: { ok: fb2.ok, note: fb2.note }, r }));
    check("Accept my answer: it is kept as the app stores it (small letters, no leading the)", same(p.synonyms, { [card.id]: ["thingummy"] }), show(p.synonyms));
    check("Accept my answer: the synonym is right from then on, with or without to, the or a", app.checkAnswer("thingummy", card.en, opts(card.id)).ok && app.checkAnswer("The thingummy", card.en, opts(card.id)).ok);
    check("Accept my answer: … but only for that card", !app.checkAnswer("thingummy", other.en, opts(other.id)).ok);
    check("Accept my answer: … and only as English (the Italian side of the card doesn't take it)", !app.checkAnswer("thingummy", card.it, { typos: true, itemId: card.id }).ok);
    check("Accept my answer: … and a slip in it is forgiven as in any answer", app.checkAnswer("thingumy", card.en, opts(card.id)).note === "Check the spelling: thingummy", show(app.checkAnswer("thingumy", card.en, opts(card.id)))); }
  tally(from);

  /* Through answerTyped, for each kind of typed exercise: is a one-letter slip forgiven? Written by hand, kind by kind. */
  section("3b. A one-letter slip, kind by kind, through answerTyped");
  const from2 = T.total;
  const FORGIVES = { flashcard: true, recall: true, translate: true, reply: true, listen: true,
    conjugation: false, cloze: false, clock: false, transform: false, preparticle: false, number: false, plural: false, agreement: false, article: false, spot: false,
    vmeaning: false, vswitch: false, vinf: false, vspot: false, vctx: false, vfit: false };
  // a slip the typo rule would forgive: one letter doubled or dropped inside a word of five letters or more, found by trying
  const slipOf = (ex, base) => {
    const first = String(app.arr(ex.accepted)[0]);
    const words = first.split(" ");
    for (let w = 0; w < words.length; w++) { const x = words[w]; if (x.replace(/[^\p{L}]/gu, "").length < 6) continue;
      for (let k = 1; k < x.length - 2; k++) for (const y of [x.slice(0, k) + x[k] + x.slice(k), x.slice(0, k) + x.slice(k + 1)]) {
        const typed = words.map((v, j) => j === w ? y : v).join(" ");
        const loose = app.checkAnswer(typed, ex.accepted, Object.assign({}, base, { typos: true })), tight = app.checkAnswer(typed, ex.accepted, Object.assign({}, base, { typos: false }));
        if (loose.ok && /^Check the spelling/.test(loose.note || "") && !tight.ok) return typed;
      } }
    return null;
  };
  app.setListen(() => true);
  const p = app.reset(); p.settings.fcDir = "both";
  const seenKinds = {}, wrongly = [];
  const pool = [];
  for (const u of content.units) { const items = content.byUnit[u.id] || []; const step = Math.max(1, Math.floor(items.length / (u.id === "vb" ? 400 : 60))); for (let k = 0; k < items.length; k += step) pool.push(items[k]); }
  for (const item of pool) for (const box of [1, 2, 3, 5]) {
    if (item.type === "vtense") for (const t of app.VG_TENSES) { const x = content.items[app.vgId(item.it, t)]; if (x) p.items[app.pid(x.id)] = { box: 3, due: T0 + DAY, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 1, lastRight: 0 }; }
    const ex = app.makeExercise(item, { box, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3, lastRight: 0 });
    if (!ex || ex.mode !== "typed" || !(ex.typeKey in FORGIVES) && ex.typeKey !== "intro") continue;
    if ((seenKinds[ex.typeKey] || 0) >= 25) continue;
    const base = { english: !!ex.english, numWords: !!ex.numWords, itemId: item.id };
    const typed = slipOf(ex, base); if (!typed) continue;
    seenKinds[ex.typeKey] = (seenKinds[ex.typeKey] || 0) + 1;
    const fb = app.answer(ex, typed), forgiven = !!fb.ok;
    if (forgiven !== FORGIVES[ex.typeKey] || (forgiven && !/^Check the spelling/.test(fb.note || ""))) wrongly.push(`${ex.typeKey} (${item.id}): “${typed}” for “${app.arr(ex.accepted)[0]}” was ${forgiven ? "accepted" + (fb.note ? " (" + fb.note + ")" : "") : "refused"}`);
    delete p.items[app.pid(item.id)];
  }
  const typedKinds = Object.keys(FORGIVES).filter(k => k !== "spot" && k !== "article"); // a mistake's fix and an article are too short for a slip (five letters at least)
  check("spot the mistake and the article never forgive a slip either (their exercises are built with typos off)", pool.concat(content.byUnit.u01).every(item => [2, 3].every(box => { const ex = app.makeExercise(item, { box }); return !ex || !["spot", "article"].includes(ex.typeKey) || !ex.typos; })));
  check("a slip was tried on every kind of typed exercise", typedKinds.every(k => seenKinds[k] >= 3), "too few of: " + typedKinds.filter(k => !(seenKinds[k] >= 3)).map(k => `${k} (${seenKinds[k] || 0})`).join(", "));
  for (const k of typedKinds) check(`${k}: a one-letter slip is ${FORGIVES[k] ? "forgiven, with “Check the spelling”" : "never forgiven"} (${seenKinds[k] || 0} tried)`, !wrongly.some(w => w.startsWith(k + " ")), wrongly.filter(w => w.startsWith(k + " ")).slice(0, 5).join("\n"));
  app.setListen(() => false);
  tally(from2);
}

/* ------------------------------------------------------------------ 4. in the real app */
async function browserChecks() {
  section("4. In the real app: the streak, midnight and a change of time zone (Chromium, the clock fixed)");
  const from = T.total;
  const { chromium } = loadPlaywright();
  const server = await serveApp(file), url = `http://127.0.0.1:${server.address().port}/index.html`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ripasso-rules-"));
  const ready = "typeof content !== 'undefined' && content && typeof S !== 'undefined' && S.screen === 'home'";
  const errors = [];
  const open = async (timezoneId, time) => {
    const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 }, timezoneId, locale: "en-GB" });
    const page = ctx.pages()[0] || await ctx.newPage();
    page.on("pageerror", e => errors.push(String(e)));
    await page.clock.install({ time });
    await page.goto(url); await page.waitForFunction(ready);
    return { ctx, page };
  };
  const streakShown = (page) => page.evaluate(() => { S.screen = "stats"; render(); const row = [...document.querySelectorAll(".rows > *")].map(e => e.textContent).find(t => /^Streak/.test(t)) || ""; S.screen = "home"; render(); return row.replace(/^Streak\s*/, ""); });
  try {
    // 24 October 2026, 23:58 in Tirane; the goal of 30 met exactly on the 22nd, 23rd and 24th
    let { ctx, page } = await open("Europe/Tirane", utc(2026, 10, 24, 21, 58));
    await page.evaluate(async () => {
      const p = defaultProgress(); p.settings.goal = 30;
      for (const d of ["2026-10-22", "2026-10-23", "2026-10-24"]) p.days[d] = { xp: 30, new: 10 };
      p.days["2026-10-21"] = { xp: 29, new: 0 }; p.updatedAt = Date.now();
      Store.set("itapp.progress.v1", p); Store.set("itapp.seen.v1", APP_VERSION); await Store.flush();
    });
    await page.reload(); await page.waitForFunction(ready);
    let got = await page.evaluate(() => ({ day: dayKey(now()), streak: streak(), left: newLeftToday(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    check("the browser is in Europe/Tirane at 23:58 on 24 October 2026", got.zone === "Europe/Tirane" && got.day === "2026-10-24", show(got));
    check("the goal met exactly three days running is a streak of 3, and Stats says “3 days”", got.streak === 3 && await streakShown(page) === "3 days", `${got.streak}, shown “${await streakShown(page)}”`);
    const pill = () => page.evaluate(() => [document.querySelector(".pill.streak").textContent.trim(), document.querySelector(".home-meta .ring").getAttribute("aria-label")]);
    check("Today shows “3 day streak” and the day's 30 of 30 XP", same(await pill(), ["3 day streak", "Today: 30 of 30 XP"]), show(await pill()));
    check("no new items are left on the 24th (10 of 10 started)", got.left === 0, String(got.left));
    // midnight: the day the clocks go back begins
    await page.clock.setFixedTime(utc(2026, 10, 24, 22, 0, 5));
    got = await page.evaluate(() => { render(); return { day: dayKey(now()), streak: streak(), left: newLeftToday(), counts: counts().day }; });
    check("at midnight the new day (25 October) begins: the streak stands, the new items are back, and the counts are for the new day", got.day === "2026-10-25" && got.streak === 3 && got.left === 10 && got.counts === "2026-10-25", show(got));
    check("… and Today, drawn again, shows the streak of 3 and 0 of 30 XP", same(await pill(), ["3 day streak", "Today: 0 of 30 XP"]), show(await pill()));
    // an answer in the hour that comes twice, then the end of the 25-hour day
    await page.clock.setFixedTime(utc(2026, 10, 25, 1, 30));
    got = await page.evaluate(async () => { const id = content.byUnit.u01.find(i => i.type === "vocab").id; for (let k = 0; k < 15; k++) applyResult(id, true, "production", false, "recall"); await Store.flush(); return { day: dayKey(now()), xp: today().xp, streak: streak() }; });
    check("15 typed answers at 02:30 (the second time) on 25 October count on that day and meet the goal exactly: streak 4", got.day === "2026-10-25" && got.xp === 30 && got.streak === 4, show(got));
    await page.clock.setFixedTime(utc(2026, 10, 25, 22, 59, 59));
    check("at 23:59:59 on the 25-hour day it is still 25 October", await page.evaluate(() => dayKey(now())) === "2026-10-25");
    await page.clock.setFixedTime(utc(2026, 10, 25, 23, 0, 1));
    got = await page.evaluate(() => ({ day: dayKey(now()), streak: streak() }));
    check("a second past the next midnight it is 26 October and the streak is 4", got.day === "2026-10-26" && got.streak === 4, show(got));
    await ctx.close();
    // the same device, the same saved progress, now in Los Angeles: 14:00 on the 25th there (23:00 in Tirane)
    ({ ctx, page } = await open("America/Los_Angeles", utc(2026, 10, 25, 21, 0)));
    got = await page.evaluate(() => ({ day: dayKey(now()), streak: streak(), days: Object.keys(progress.days).sort(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    check("opened in Los Angeles, the saved days are all there and the streak is still 4", got.zone === "America/Los_Angeles" && got.day === "2026-10-25" && got.streak === 4 && same(got.days, ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]) && await streakShown(page) === "4 days", show(got));
    await ctx.close();
    // … and in Tokyo, where it is already the 26th (06:00)
    ({ ctx, page } = await open("Asia/Tokyo", utc(2026, 10, 25, 21, 0)));
    got = await page.evaluate(() => ({ day: dayKey(now()), streak: streak(), left: newLeftToday() }));
    check("opened in Tokyo, where it is already the 26th: the streak is 4 and a new day's items are offered", got.day === "2026-10-26" && got.streak === 4 && got.left === 10, show(got));
    await ctx.close();
    check("no script errors", !errors.length, errors.slice(0, 5).join("\n"));
  } finally { server.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  tally(from);
}

(async () => {
  schedulingChecks();
  calendarChecks();
  checkerChecks();
  if (BROWSER) await browserChecks(); else console.log("\n(--no-browser: the checks in the real app were left out)");
  T.summary();
})().catch(e => { T.stopped(e); T.summary(); });
