/*
  Saved practice on a well-used device, for the browser tests that need a lot of it (test-perf, test-speedups):
  ~3,000 grammar records spread evenly over every grammar unit, all of Vocab pack 1, most of pack 2 and half of
  pack 3 (cards arrive in order), the first 1,200 Verbs section tenses, and 45 days of log, about 6,600 records in
  all. Built from a fixed seed, so every run saves the same progress (relative to the moment it runs).

    const { seedProgress } = require("./lib/seed");
    const records = await page.evaluate(seedProgress);   // in a page with the app loaded; then reload it

  seedProgress runs inside the page (it uses the app's content, dayKey, defaultProgress and APP_VERSION): it writes
  the progress to localStorage, marks What's new as read, and returns the number of records.
*/
"use strict";

function seedProgress() {
  let s = 20261021; const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const T = Date.now(), D = 864e5;
  const own = (u) => (content.byUnit[u] || []).filter(i => !content.canon[i.id]).map(i => i.id); // one record per shared exercise
  const spread = (ids, n) => { const step = ids.length / n; return Array.from({ length: Math.min(n, ids.length) }, (_, k) => ids[Math.floor(k * step)]); };
  const grammar = content.units.filter(u => !u.mode).flatMap(u => own(u.id));
  const pack = (title) => own(content.units.find(u => u.title === title).id);
  const ids = [...spread(grammar, 3000), ...pack("Vocab pack 1"), ...pack("Vocab pack 2").slice(0, 900), ...pack("Vocab pack 3").slice(0, 500), ...own("vb").slice(0, 1200)];
  const items = {};
  for (const id of ids) {
    const box = 1 + Math.floor(rnd() * rnd() * 7.99), lastSeen = T - Math.floor(rnd() * 45 * D);
    const lapses = rnd() < 0.18 ? 1 + Math.floor(rnd() * 3) : 0, wrong = lapses && rnd() < 0.5;
    items[id] = { box, due: lastSeen + [0, 1, 2, 4, 8, 16, 32, 64][box] * D * (0.6 + rnd()), lapses, lastSeen, lastWrong: wrong ? lastSeen : lapses ? lastSeen - 3 * D : 0, seenCount: box + 2 * lapses + Math.floor(rnd() * 4), lastRight: wrong ? 0 : lastSeen };
  }
  const days = {};
  for (let d = 0; d < 45; d++) {
    const n = 20 + Math.floor(rnd() * 60);
    days[dayKey(T - d * D)] = { xp: n, new: Math.floor(rnd() * 15), cards: Math.floor(rnd() * 30), t: { recall: [Math.floor(n / 3), Math.floor(n / 2)], cloze: [5, 7], flip: [10, 12], translate: [3, 5] } };
  }
  const flagged = ids.slice(0, 6);
  const flags = Object.fromEntries(flagged.map(id => [id, { id, unit: content.items[id].unit, exercise: "Grammar", prompt: "a question", given: "", expected: "x", note: "", createdAt: T - D, updatedAt: T - D }]));
  localStorage.setItem("itapp.progress.v1", JSON.stringify({ v: 2, items, days, flags, synonyms: { [ids[10]]: ["my own answer"] }, currentUnit: content.units.find(u => /^Verb tenses/.test(u.title)).id, settings: defaultProgress().settings, updatedAt: T, settingsUpdatedAt: T - D }));
  localStorage.setItem("itapp.seen.v1", JSON.stringify(APP_VERSION)); // an ordinary day: What's new already read
  return Object.keys(items).length;
}

module.exports = { seedProgress };
