#!/usr/bin/env node
/*
  Test the tests: would the suites notice if the app broke? (from 9.27)

  Usage:  node tools/test-the-tests.js [--only id,id] [--suite test-rules.js] [--jobs 3] [--list] [--no-speed] [--keep] [--out DIR]

  A test that passes says little unless it can fail. This holds a list of small faults, each a single
  exact replacement of text in a copy of index.html (the real file is never touched) with the suite
  that must catch it and a few words of the check that must fail. For each fault in turn it makes the
  copy, runs that suite on it, and reports:

    caught      the suite failed, and its output names the check expected
    SURVIVED    the suite passed on the broken copy: the suite needs strengthening
    WRONG CHECK the suite failed, but not on the check expected (it may have failed for another reason)
    NOT FOUND   the text to replace is not in index.html exactly once: the code has changed, so the
                fault needs writing again

  and exits with code 1 unless every fault is caught. Run it by hand after changing a suite, and
  after changing the code a fault touches; a scheduled workflow (.github/workflows/weekly.yml)
  runs it weekly, not on every pull request, since it runs the suites some forty times (about a quarter
  of an hour with --jobs 3).

  The list began with the eight faults of the review at 9.26 (three the suites then caught, five they
  missed, which tools/test-rules.js now catches), and has at least one fault for every suite. When you
  add a suite, add a fault for it; when you fix a bug a suite missed, add the bug here as a fault.

  --only     run the faults named (see --list)
  --suite    run the faults of one suite
  --jobs     how many suites run at once (3 by default; browser suites slow each other down)
  --no-speed leave out the faults the speed test must catch (on a computer whose speed varies)
  --keep     keep the broken copies (in the system's temporary folder) to look at
  --out DIR  keep them, and each suite's output, in DIR
*/
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const ONLY = (opt("--only") || "").split(",").filter(Boolean), SUITE = opt("--suite"), JOBS = Number(opt("--jobs") || 3);
const LIST = args.includes("--list"), KEEP = args.includes("--keep") || !!opt("--out"), NO_SPEED = args.includes("--no-speed");

/* The faults. id: a short name; what: the fault in plain words; find → put: the one replacement (find must be in index.html
   exactly once); suite and args: what to run on the broken copy (its path is added); expect: text of the check that must fail. */
const FAULTS = [
  // ---- the eight of the review at 9.26
  { id: "option-always-right", what: "a tapped option is always marked right",
    find: `finishAnswer(opt === ex.correct, "", opt);`, put: `finishAnswer(true, "", opt);`,
    suite: "test-course.js", expect: "wrong options" },
  { id: "conditional-essere-forgotten", what: "the conjugation drill's explanation takes sarei, saresti… for a form of avere (9.28)",
    find: `sarò|sarai|sarà|saremo|sarete|saranno|sarei|saresti|sarebbe|saremmo|sareste|sarebbero|sia|siate|siano|fossi|fosse|fossimo|foste|fossero)$/.test(aux);`, put: `sarò|sarai|sarà|saremo|sarete|saranno|sia|siate|siano|fossi|fosse|fossimo|foste|fossero)$/.test(aux);`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "condizionale passato of andare" },
  { id: "plural-gender-from-singular", what: "the agreement drill takes a noun's plural gender from its singular: le paia diversi (9.29)",
    find: `const fem = (pl) => pl ? noun.artPl === "le" : noun.gender === "f";`, put: `const fem = (pl) => noun.gender === "f";`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "agreement: le paia" },
  { id: "typed-always-right", what: "a typed answer is always marked right",
    find: `finishAnswer(res.ok, res.note, text, res.closest);`, put: `finishAnswer(true, res.note, text, res.closest);`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "a one-letter slip is never forgiven" },
  { id: "new-items-unlimited", what: "the daily limit on new items is never reached",
    find: `function newLeftToday() { return Math.max(0, (progress.settings.newPerDay || 10) - (today().new || 0)); }`, put: `function newLeftToday() { return 9999; }`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "new items: 6 left after four new items" },
  { id: "wrong-drops-one-box", what: "a wrong answer drops the item one box, not two",
    find: `r.box = Math.max(1, r.box - 2); r.lapses++;`, put: `r.box = Math.max(1, r.box - 1); r.lapses++;`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "word, box 4, due, wrong, production" },
  { id: "streak-needs-more-than-goal", what: "the streak counts a day only when the goal is beaten, not when it is met",
    find: `|| {}).xp >= goal;`, put: `|| {}).xp > goal;`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "streak: the goal met exactly today" },
  { id: "accents-always-strict", what: "the Accents setting is ignored: always strict",
    find: `const lenient = progress.settings.accents !== "strict";`, put: `const lenient = false;`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "Watch the accent: città" },
  { id: "not-due-still-promoted", what: "extra practice of an item not yet due moves it up a box",
    find: `const wasDue = r.box <= 1 || r.due <= t;`, put: `const wasDue = true;`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "word, box 3, not due, right, production" },
  { id: "conjugation-forgives-typos", what: "a conjugation forgives a one-letter slip",
    find: `typeKey: "conjugation", kind: "production", mode: "typed", typos: false`, put: `typeKey: "conjugation", kind: "production", mode: "typed", typos: true`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "conjugation: a one-letter slip is never forgiven" },
  { id: "sprint-clock-never-stops", what: "the Verb sprint's clock goes on running while a wrong answer's right form is shown (9.32)",
    find: `const spLeft = () => !SP ? 0 : SP.phase === "run" ? `, put: `const spLeft = () => !SP ? 0 : SP.phase !== "done" ? `,
    suite: "test-rules.js", args: ["--no-browser"], expect: "the clock stays where it stopped" },
  // ---- more of the learning rules (test-rules.js)
  { id: "typed-answer-one-xp", what: "a typed answer earns 1 xp, as a tapped one does",
    find: `xp = kind === "production" ? 2 : 1;`, put: `xp = 1;`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "word, box 0 (no record), due, right, production" },
  { id: "day-named-a-month-early", what: "the day's name has the month one too low",
    find: `return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")`, put: `return d.getFullYear() + "-" + String(d.getMonth()).padStart(2, "0")`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "the app's day is 2026-11-10" },
  { id: "leading-a-not-dropped", what: "a leading a or an in an English answer is no longer set aside",
    find: `const normEn = (s) => foldEn(normalize(s).replace(/^(to|the|a|an) /, ""));`, put: `const normEn = (s) => foldEn(normalize(s).replace(/^(to|the) /, ""));`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "\"a house\" for [\"house\"]" },
  { id: "undo-leaves-new-record", what: "undoing the first answer to a new item leaves its record behind",
    find: `if (res.before) progress.items[id] = res.before; else delete progress.items[id];`, put: `if (res.before) progress.items[id] = res.before;`,
    suite: "test-rules.js", args: ["--no-browser"], expect: "word, box 0 (no record), due, right, production" },
  // ---- the course sweep (test-course.js)
  { id: "meaning-without-right-option", what: "a meaning choice leaves the right answer out of its options",
    find: `const options = shuffle([itToEn ? en : it].concat(d.map(x => x.value)));`, put: `const options = shuffle(d.map(x => x.value));`,
    suite: "test-course.js", expect: ": options (" },
  // ---- progress (test-progress.js)
  { id: "merge-keeps-older-record", what: "a sync merge keeps the older of two records, so a device's newer answers are lost",
    find: `(!ra || (rb.lastSeen || 0) > (ra.lastSeen || 0))) { p.items[id] = Object.assign({}, rb)`, put: `(!ra || (rb.lastSeen || 0) < (ra.lastSeen || 0))) { p.items[id] = Object.assign({}, rb)`,
    suite: "test-progress.js", expect: "the more recently practised one wins" },
  { id: "sprint-counts-as-practice", what: "a right answer in the Verb sprint moves the verb tense on, as a session's would (9.32)",
    find: `if (res.ok) { R.right++; R.rights.push(c);`, put: `if (res.ok) { applyResult(c.i.id, true, "production", false, "vspot"); saveProgress(); R.right++; R.rights.push(c);`,
    suite: "test-progress.js", expect: "leaving the browser copy of progress exactly as it was" },
  { id: "cloud-record-reordered", what: "the cloud's packed record has box and due the other way round",
    find: `const packRec = (r) => [r.box || 0, r.due || 0, r.lapses || 0,`, put: `const packRec = (r) => [r.due || 0, r.box || 0, r.lapses || 0,`,
    suite: "test-progress.js", expect: "the cloud copy matches the browser copy" },
  { id: "cloud-shard-hash-changed", what: "records go to a different cloud shard",
    find: `% SHARDS).padStart(2, "0")`, put: `% (SHARDS - 1)).padStart(2, "0")`,
    suite: "test-progress.js", expect: "every record sits in the shard its id hashes to" },
  { id: "record-guard-lets-box-8", what: "the record guard lets a box of 8 through",
    find: `const b = Math.min(7, Math.max(0, Math.round(box)));`, put: `const b = Math.min(8, Math.max(0, Math.round(box)));`,
    suite: "test-progress.js", expect: "damaged records are repaired" },
  { id: "aliases-ignored", what: "a removed item's progress no longer moves to the item that replaced it",
    find: `function pid(id) { const a = ID_ALIASES[id] || id;`, put: `function pid(id) { const a = id;`,
    suite: "test-progress.js", expect: "no record is left under an old id" },
  // ---- storage (test-storage.js)
  { id: "storage-bucket-hash-changed", what: "the browser copy's records go to different buckets",
    find: `>>> 0 & (BUCKETS - 1);`, put: `>>> 1 & (BUCKETS - 1);`,
    suite: "test-storage.js", expect: "each record in the bucket its id hashes to" },
  { id: "two-windows-never-settle", what: "two windows holding a day in two forms (cards: 0, or none) write it back and forth without end", // the bug fixed in 9.27
    find: `    else if (plain && !sameData(da, m)) p.days[d] = m; //`, put: `    //`,
    suite: "test-storage.js", expect: "they settle on one form, and stop writing" },
  // ---- the interface (test-ui.js)
  { id: "chip-under-44px", what: "a lesson's chips are 40 px high, under the 44 px a finger needs",
    find: `.chip { flex: none; max-width: 270px; min-height: 44px;`, put: `.chip { flex: none; max-width: 270px; min-height: 40px;`,
    suite: "test-ui.js", expect: "every control is at least 44 × 44 px" },
  { id: "theme-not-applied", what: "choosing Light or Dark in Appearance changes nothing",
    find: `if (v === "light" || v === "dark") root.setAttribute("data-theme", v);`, put: `if (v === "light" || v === "dark") root.setAttribute("data-theme-x", v);`,
    suite: "test-ui.js", expect: "Appearance: Dark switches to the dark colours" },
  { id: "vmap-due-never-marked", what: "the Verb map never marks a tense as due (9.32)",
    find: `const r = rec(i.id), b = r.box, due = b >= 1 && r.due <= t;`, put: `const r = rec(i.id), b = r.box, due = false;`,
    suite: "test-ui.js", expect: "a verb's row: its cells in ladder order" },
  { id: "vmap-sheet-ignores-escape", what: "Escape no longer closes the Verb map's sheet (9.32)",
    find: `if (S.vsheet) { if (e.key === "Escape") closeVmSheet(); return; }`, put: `if (S.vsheet) { return; }`,
    suite: "test-ui.js", expect: "Escape closes it" },
  { id: "compare-bolds-nothing", what: "Compare on the Verbs reference never shows where two verbs differ (9.32)",
    find: `if (f && g && f !== "—" && g !== "—" && vgBuiltAs(a, f) !== vgBuiltAs(b, g)) marks[p] = true;`, put: `if (f && g && f !== "—" && g !== "—" && false) marks[p] = true;`,
    suite: "test-ui.js", expect: "the forms built differently in bold" },
  { id: "sprint-enter-ignored", what: "Enter in the Verb sprint's field no longer checks the answer (9.32)",
    find: `spa.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); spCheck(spa.value); } };`, put: `spa.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); } };`,
    suite: "test-ui.js", expect: "a right answer typed with Enter" },
  // ---- what the app keeps ready (test-speedups.js)
  { id: "counts-gone-stale", what: "the counts on Today, Units, Stats and You are not worked out again after an answer",
    find: `COUNTS = null; // whatever changed, the counts on Today, Units, Stats and You are worked out again`, put: `// whatever changed, the counts on Today, Units, Stats and You are worked out again`,
    suite: "test-speedups.js", expect: "the same counts after" },
  { id: "vmap-box4-learned", what: "the Verb map's tense rows count a tense in box 4 as learned (9.32)",
    find: `if (b >= 5) c.learned++;`, put: `if (b >= 4) c.learned++;`,
    suite: "test-speedups.js", expect: "the same counts" },
  { id: "ref-az-unsorted", what: "the Verbs reference's A–Z leaves the verbs in course order (9.32)",
    find: `if (how === "az") return list.slice().sort((a, b) => a.it.localeCompare(b.it, "it"));`, put: `if (how === "az") return list.slice();`,
    suite: "test-speedups.js", expect: "four orders" },
  // ---- sessions (test-sessions.js)
  { id: "same-kind-three-in-a-row", what: "a session lets the same kind of exercise come three times running", // in noTriples, which has the last word: planSession's own hint against a run is a refinement the rule doesn't depend on
    find: `const r = k === a ? run + 1 : 1; if (r > 2) return false;`, put: `const r = k === a ? run + 1 : 1; if (r > 3) return false;`,
    suite: "test-sessions.js", expect: "three times in a row" },
  { id: "verbs-hint-ignored", what: "a Verbs drill ignores the session's hint, so a verb tense can get the same kind as last time (9.31)",
    find: `  make[pickKey(T, opt)]();`, put: `  make[pickKey(T)]();`,
    suite: "test-sessions.js", expect: "so does a verb tense in a Verbs session" },
  { id: "focus-opens-locked-tense", what: "a focus session on the Verbs reference opens a tense whose tense before it isn't learned yet (9.31)",
    find: `const vgOpens = (i) => rec(i.id).box === 0 && vgUnlocked(i) && vgWithinCap(i);`, put: `const vgOpens = (i) => rec(i.id).box === 0 && vgWithinCap(i);`,
    suite: "test-sessions.js", expect: "no focus session opens a tense that hasn't opened" },
  { id: "sprint-weights-ignored", what: "the Verb sprint asks every form as often, ignoring weak spots and the tenses started last (9.32)",
    find: `out.push({ i, p, w: recent * (e ? 2 + Math.min(e[3], 3) : 1) });`, put: `out.push({ i, p, w: 1 });`,
    suite: "test-sessions.js", expect: "come up more often" },
  { id: "weak-spots-never-heal", what: "a verb form's weak spot never goes away, however often it is got right again (9.31)",
    find: `if (--e[3] <= 0) m.delete(k);`, put: `if (--e[3] <= 0) e[3] = 1;`,
    suite: "test-verbs.js", args: ["--verbs", "parlare"], expect: "a later right answer takes one off" },
  { id: "reflexive-judged-with-pronoun", what: "a reflexive verb's forms are judged with their pronouns, so alzati and mi alzo are underlined as irregular (9.31)",
    find: `      if (!refl) return x;
      if (t === "imperativo"`, put: `      if (refl || !refl) return x;
      if (t === "imperativo"`,
    suite: "test-verbs.js", args: ["--verbs", "parlare"], expect: "exactly those checked by hand" },
  { id: "ladder-cap-ignored", what: "Open new tenses up to is ignored: a tense after it still opens as new (9.31)",
    find: `const vgWithinCap = (item) => item.step <= vgCap();`, put: `const vgWithinCap = (item) => item.step <= 7;`,
    suite: "test-sessions.js", expect: "takes a newer tense as new" },
  { id: "summary-misses-new-tense", what: "a Verbs session's summary never says which tenses have opened (9.31)",
    find: `for (const id of now.open) if (!was.open.includes(id) && rec(id).box === 0) out.opened.push(content.items[id]);`, put: `for (const id of now.open) if (was.open.includes(id) && rec(id).box === 0) out.opened.push(content.items[id]);`,
    suite: "test-sessions.js", expect: "the summary says New tense open" },
  { id: "reviews-spread-30-percent", what: "reviews are spread by 30% either way, not 10%",
    find: `const SPREAD = 0.1;`, put: `const SPREAD = 0.3;`,
    suite: "test-sessions.js", expect: "within 10% of the interval" },
  // ---- wrong options (test-choices.js)
  { id: "trap-is-a-word-of-the-sentence", what: "a word order trap may be a word the sentence already has",
    find: `if (acc.words.has(k)) return false;`, put: ``,
    suite: "test-choices.js", expect: "no word of the sentence" },
  { id: "meaning-offers-same-word", what: "a meaning choice may offer a word with the same Italian as a wrong option",
    find: `if (!v || ownIt.has(word(i)) || words.has(pid(i.id))) continue;`, put: `if (!v || words.has(pid(i.id))) continue;`,
    suite: "test-choices.js", expect: "no wrong option is right" },
  { id: "mixups-not-first", what: "a meaning choice no longer offers the words the learner has mixed up with it first (9.30)",
    find: `const score = (i) => (mixed.has(pid(i.id)) ? 4 : 0) + (kin(i) ? 2 : 0)`, put: `const score = (i) => (kin(i) ? 2 : 0)`,
    suite: "test-choices.js", expect: "remembered mix-ups are offered first" },
  // ---- the installed copy (test-install.js)
  { id: "back-button-unhandled", what: "the Android back button is no longer handled away from Today",
    find: `const want = S.screen !== "home";`, put: `const want = false;`,
    suite: "test-install.js", expect: "Units → back → Today" },
  // ---- reports (test-reports.js)
  { id: "report-lines-changed", what: "a report's lines are written key = value, which read-reports.js doesn't read",
    find: `if (parts.length) lines.push(k + ": " + parts[0],`, put: `if (parts.length) lines.push(k + " = " + parts[0],`,
    suite: "test-reports.js", expect: "one key: value line per field" },
  // ---- content (check-content.js)
  { id: "verb-form-misspelt", what: "a verb form in a grammar unit is misspelt (rifaciamo)",
    find: `"forms":{"presente":["rifaccio","rifai","rifà","rifacciamo","rifate","rifanno"]}`, put: `"forms":{"presente":["rifaccio","rifai","rifà","rifaciamo","rifate","rifanno"]}`,
    suite: "check-content.js", expect: "rifaciamo" },
  // ---- through the screen (test-items.js, test-verbs.js)
  { id: "sort-check-inverted", what: "Sort the words marks a right sorting wrong",
    find: `finishAnswer(ex.item.rows.every((r, i) => ex.item.groups[sel[i]] === r.group)`, put: `finishAnswer(ex.item.rows.every((r, i) => ex.item.groups[sel[i]] !== r.group)`,
    suite: "test-items.js", args: ["u01", "--repeats", "1"], expect: "every right answer is marked right" },
  { id: "verb-table-checks-wrong-cell", what: "a verb table checks every cell against the io form",
    find: `const res = v.trim() ? checkAnswer(v, ex.accepted[p], { typos: false }) : { ok: false };`, put: `const res = v.trim() ? checkAnswer(v, ex.accepted[0], { typos: false }) : { ok: false };`,
    suite: "test-verbs.js", args: ["--verbs", "parlare"], expect: "every right answer is marked right" },
  // ---- other browsers (test-browsers.js; in Chromium where Firefox and WebKit aren't installed)
  { id: "backup-file-not-read", what: "choosing a backup file on Your data does nothing",
    find: `const prf = document.getElementById("progressFile"); if (prf) prf.onchange = `, put: `const prf = document.getElementById("progressFile"); if (prf) prf.onclick = `,
    suite: "test-browsers.js", expect: "a backup file chosen on Your data is merged in" },
  // ---- speed (test-perf.js); left out with --no-speed
  { id: "idle-work-in-long-slices", what: "work done while the phone is idle runs in slices of up to 400 ms",
    find: `const end = Date.now() + Math.max(5, Math.min(25, d && d.timeRemaining ? d.timeRemaining() : 25));`, put: `const end = Date.now() + 400;`,
    suite: "test-perf.js", expect: "figure(s) over budget" },
];

function run(fault, dir) {
  return new Promise((done) => {
    const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const n = src.split(fault.find).length - 1;
    if (n !== 1) return done({ result: "NOT FOUND", detail: n ? `the text is there ${n} times` : "the text is not in index.html", secs: 0 });
    const copy = path.join(dir, fault.id, "index.html");
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.writeFileSync(copy, src.replace(fault.find, () => fault.put));
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, fault.suite), copy, ...(fault.args || [])], { cwd: ROOT, env: Object.assign({}, process.env, { TEST_THE_TESTS: "1" }) });
    let out = "";
    child.stdout.on("data", d => out += d); child.stderr.on("data", d => out += d);
    const timer = setTimeout(() => child.kill("SIGKILL"), (fault.minutes || 20) * 60000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const secs = Math.round((Date.now() - t0) / 1000);
      fs.writeFileSync(path.join(dir, fault.id, "output.txt"), out);
      const failing = out.split("\n").filter(l => /^\s*FAIL\b/.test(l)).map(l => l.trim());
      if (code === 0) return done({ result: "SURVIVED", detail: `${fault.suite} passed on the broken copy`, secs });
      if (code === null) return done({ result: "WRONG CHECK", detail: `${fault.suite} was stopped after ${fault.minutes || 20} minutes`, secs });
      if (!out.includes(fault.expect)) return done({ result: "WRONG CHECK", detail: `${fault.suite} failed, but nothing in its output says “${fault.expect}”` + (failing.length ? "; it failed: " + failing.slice(0, 3).join(" · ") : "; its last lines: " + out.trim().split("\n").slice(-3).join(" · ")), secs });
      done({ result: "caught", detail: failing.length ? `${failing.length} check${failing.length === 1 ? "" : "s"} failed` : "", secs });
    });
  });
}

(async () => {
  const ids = FAULTS.map(f => f.id);
  if (new Set(ids).size !== ids.length) { console.error("Two faults share an id."); process.exit(2); }
  for (const id of ONLY) if (!ids.includes(id)) { console.error(`No fault is called ${id} (see --list).`); process.exit(2); }
  const faults = FAULTS.filter(f => (!ONLY.length || ONLY.includes(f.id)) && (!SUITE || f.suite === SUITE) && !(NO_SPEED && f.suite === "test-perf.js"));
  if (LIST) { for (const f of FAULTS) console.log(`${f.id.padEnd(30)} ${f.suite.padEnd(18)} ${f.what}`); return; }
  const suites = [...new Set(FAULTS.map(f => f.suite))];
  console.log(`Test the tests: ${faults.length} fault${faults.length === 1 ? "" : "s"}, each in its own copy of index.html, ${JOBS} at a time`);
  const dir = opt("--out") ? path.resolve(opt("--out")) : fs.mkdtempSync(path.join(os.tmpdir(), "ripasso-faults-"));
  fs.mkdirSync(dir, { recursive: true });
  const results = new Array(faults.length);
  let next = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.max(1, JOBS) }, async () => {
    while (next < faults.length) {
      const k = next++, f = faults[k];
      results[k] = await run(f, dir);
      console.log(`  ${results[k].result === "caught" ? "ok  " : "FAIL"} ${f.id}: ${results[k].result}${results[k].result === "caught" ? "" : " — " + results[k].detail} (${f.suite}, ${results[k].secs} s)`);
    }
  }));
  console.log("\nfault".padEnd(32) + "suite".padEnd(19) + "result".padEnd(13) + "time");
  faults.forEach((f, k) => console.log(f.id.padEnd(31) + f.suite.padEnd(19) + results[k].result.padEnd(13) + String(results[k].secs).padStart(4) + " s"));
  const bad = faults.filter((f, k) => results[k].result !== "caught");
  if (!ONLY.length && !SUITE) { // every suite has a fault of its own
    const all = fs.readdirSync(__dirname).filter(n => /^test-.*\.js$/.test(n) && n !== "test-the-tests.js").concat("check-content.js");
    const none = all.filter(s => !suites.includes(s));
    if (none.length) { console.log(`\nNo fault for: ${none.join(", ")}. Every suite needs at least one.`); bad.push(...none); }
  }
  if (KEEP || bad.length) console.log(`\nThe broken copies and each suite's output are in ${dir}`); else fs.rmSync(dir, { recursive: true, force: true });
  console.log(bad.length ? `\n${bad.length} fault(s) not caught. Where a fault survived, strengthen the suite; where its text was not found, write the fault again.` : `\nAll ${faults.length} faults were caught, in ${Math.round((Date.now() - t0) / 1000)} s.`);
  process.exit(bad.length ? 1 : 0);
})();
