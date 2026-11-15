#!/usr/bin/env node
/*
  The runner: every suite, one after another, with a table at the end (npm test, from 9.26).

  Usage:  node tools/run-tests.js [suite …] [--no-speed] [--no-browser] [--times 5] [--verbose]
                                  [--update-counts] [-- arguments for the suites]

  Runs the content check and every test (the list is SUITES below), each to the end whether or not an
  earlier one failed, and finishes with a table of suite, result, number of checks and time; it exits
  with code 1 if any suite failed. Each suite's whole output is kept in test-output/ (not committed),
  and its failing checks are printed as it ends (--verbose prints everything as it runs).

    suite …          only the suites named: test-ui.js, or ui, rules, check-content…
    --no-speed       leave out the speed test (on a computer whose speed varies, or one busy with other work)
    --no-browser     only what needs no browser: the content check, the reports test, the rules test's Node part
                     and the course sweep (about a minute; nothing to install)
    --times N        run each suite N times in a row and report any check that failed in some runs and passed in
                     others (a check that wobbles); used to look for unreliable checks
    -- …             what follows is handed to each suite: node tools/run-tests.js verbs -- --shard 1/3

  The number of checks. A suite that quietly stops checking something still passes, so each suite's number of
  checks is recorded in tools/check-counts.json (committed), and a suite fails here when it passes with
  fewer checks than recorded. When a change is meant to remove checks, run the suite with --update-counts
  and commit the file in the same pull request, where the lower number can be seen and questioned; when a
  change adds checks, do the same, so the new number is the one held to. The speed test is recorded by its
  number of figures; the content check has no count.

  GitHub runs the same suites through this runner, each as its own job (.github/workflows/checks.yml).
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const COUNTS_FILE = path.join(__dirname, "check-counts.json");
const OUT = path.join(ROOT, "test-output");

// The suites, in the order they run. browser: what the suite needs installed (none: Node alone).
const SUITES = [
  { file: "check-content.js", title: "Content check", browser: "none" },
  { file: "test-reports.js", title: "Reports", browser: "none" },
  { file: "test-rules.js", title: "Learning rules", browser: "chromium", noBrowserArgs: ["--no-browser"] },
  { file: "test-course.js", title: "Course sweep", browser: "none" },
  { file: "test-storage.js", title: "Storage", browser: "chromium" },
  { file: "test-progress.js", title: "Progress safety", browser: "chromium" },
  { file: "test-ui.js", title: "Interface", browser: "chromium" },
  { file: "test-install.js", title: "Installed copy", browser: "chromium" },
  { file: "test-speedups.js", title: "Speed-ups", browser: "chromium" },
  { file: "test-sessions.js", title: "Sessions", browser: "chromium" },
  { file: "test-choices.js", title: "Choices", browser: "chromium" },
  { file: "test-items.js", title: "Items (a sample of the course)", browser: "chromium", args: ["--sample"] },
  { file: "test-verbs.js", title: "Verbs", browser: "chromium" },
  { file: "test-browsers.js", title: "Other browsers", browser: "all" },
  { file: "test-perf.js", title: "Speed", browser: "chromium", speed: true },
];

const argv = process.argv.slice(2);
const cut = argv.indexOf("--"), own = cut < 0 ? argv : argv.slice(0, cut), passOn = cut < 0 ? [] : argv.slice(cut + 1);
const flag = (name) => own.includes(name);
const TIMES = Math.max(1, Number(own[own.indexOf("--times") + 1]) || 1) * (flag("--times") ? 1 : 0) || 1;
const VERBOSE = flag("--verbose"), UPDATE = flag("--update-counts"), NO_SPEED = flag("--no-speed"), NO_BROWSER = flag("--no-browser");
const named = own.filter((a, i) => !a.startsWith("--") && own[i - 1] !== "--times");
const find = (n) => SUITES.find(s => s.file === n || s.file === n + ".js" || s.file === "test-" + n + ".js" || s.file === "test-" + n);
for (const n of named) if (!find(n)) { console.error(`No suite is called ${n}. The suites: ${SUITES.map(s => s.file).join(", ")}`); process.exit(2); }
const suites = SUITES.filter(s => fs.existsSync(path.join(__dirname, s.file)))
  .filter(s => named.length ? named.some(n => find(n) === s) : !(NO_SPEED && s.speed) && !(NO_BROWSER && s.browser !== "none" && !s.noBrowserArgs));

const readCounts = () => { try { return JSON.parse(fs.readFileSync(COUNTS_FILE, "utf8")); } catch (e) { return {}; } };
const argsOf = (s) => (s.args || []).concat(NO_BROWSER && s.noBrowserArgs ? s.noBrowserArgs : [], passOn);
const keyOf = (s) => [s.file].concat(argsOf(s)).join(" "); // a suite run another way (a part of it, without its browser checks) has its own count

// What a suite's output says: its number of checks (or figures), and the checks that failed.
function read(out) {
  const all = out.match(/All (\d+) (?:checks passed|figures are within budget)\./), part = out.match(/(\d+) of (\d+) check\(s\) failed\./);
  const fails = out.split("\n").filter(l => /^\s*FAIL\b/.test(l)).map(l => l.replace(/^\s*FAIL\s*/, "").trim());
  return { count: all ? Number(all[1]) : part ? Number(part[2]) : null, fails };
}
function runOne(s, n) {
  return new Promise((done) => {
    const t0 = Date.now(), log = path.join(OUT, keyOf(s).replace(/[^\w.-]+/g, "_") + (TIMES > 1 ? `.run${n}` : "") + ".log");
    const child = spawn(process.execPath, [path.join(__dirname, s.file), ...argsOf(s)], { cwd: ROOT });
    let out = "";
    const take = (d) => { out += d; if (VERBOSE) process.stdout.write(d); };
    child.stdout.on("data", take); child.stderr.on("data", take);
    child.on("close", (code) => { fs.writeFileSync(log, out); done(Object.assign(read(out), { code, secs: (Date.now() - t0) / 1000, out, log })); });
  });
}
const mmss = (secs) => secs >= 60 ? `${Math.floor(secs / 60)} min ${String(Math.round(secs % 60)).padStart(2, "0")} s` : `${Math.round(secs)} s`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const recorded = readCounts(), rows = [], t0 = Date.now();
  console.log(`Running ${suites.length} suite${suites.length === 1 ? "" : "s"}${TIMES > 1 ? `, ${TIMES} times each` : ""}${passOn.length ? " with " + passOn.join(" ") : ""}; each suite's output is kept in test-output/\n`);
  for (const s of suites) {
    const key = keyOf(s), runs = [];
    if (!VERBOSE) process.stdout.write(`${s.title} (${key}) … `);
    for (let n = 1; n <= TIMES; n++) runs.push(await runOne(s, n));
    const failed = runs.filter(r => r.code !== 0), last = runs[runs.length - 1];
    const count = runs.map(r => r.count).find(c => c != null), was = recorded[key];
    let result = failed.length ? "FAILED" : "passed", note = "";
    const wobble = TIMES > 1 ? [...new Set(runs.flatMap(r => r.fails))].filter(f => runs.some(r => !r.fails.includes(f))) : [];
    if (TIMES > 1 && failed.length) result = failed.length === TIMES ? "FAILED" : `WOBBLES (${failed.length} of ${TIMES} failed)`;
    if (TIMES > 1 && new Set(runs.map(r => r.count)).size > 1) note = `the number of checks changes from run to run (${runs.map(r => r.count).join(", ")})`;
    if (!failed.length && count != null) {
      if (UPDATE) { if (was !== count) note = was == null ? "recorded" : `recorded (was ${was})`; recorded[key] = count; }
      else if (was == null) note = "no number recorded yet: run with --update-counts and commit tools/check-counts.json";
      else if (count < was) { result = "FEWER CHECKS"; note = `${count} checks, but ${was} are recorded: a check has stopped running. If that is meant, run with --update-counts and commit tools/check-counts.json`; }
      else if (count > was) note = `${count - was} more than recorded: run with --update-counts and commit tools/check-counts.json`;
    }
    const secs = runs.reduce((a, r) => a + r.secs, 0) / runs.length;
    rows.push({ s, key, result, count, secs, note, ok: result === "passed" });
    if (!VERBOSE) console.log(`${result}${count != null ? `, ${count} checks` : ""}, ${mmss(secs)}${note ? "\n    " + note : ""}`);
    else console.log(`\n=> ${s.title}: ${result}${note ? " — " + note : ""}\n`);
    if (!VERBOSE) for (const r of failed.slice(0, 1)) { // the failing checks of the first failed run, as the suite printed them
      const lines = r.out.split("\n"), shown = [];
      lines.forEach((l, i) => { if (/^\s*FAIL\b/.test(l)) { shown.push(l); for (let j = i + 1; j < lines.length && /^\s{6,}\S/.test(lines[j]) && j < i + 6; j++) shown.push(lines[j]); } });
      console.log((shown.length ? shown.slice(0, 40) : lines.filter(Boolean).slice(-12)).map(l => "    " + l).join("\n") + `\n    (the whole output: ${path.relative(ROOT, r.log)})`);
    }
    if (wobble.length) console.log("    failed in some runs and passed in others:\n" + wobble.slice(0, 20).map(f => "      " + f).join("\n"));
  }
  if (UPDATE) { fs.writeFileSync(COUNTS_FILE, JSON.stringify(Object.fromEntries(Object.entries(recorded).sort(([a], [b]) => a < b ? -1 : 1)), null, 2) + "\n"); }
  const w = Math.max(...rows.map(r => r.key.length), 5) + 2;
  console.log("\n" + "suite".padEnd(w) + "result".padEnd(26) + "checks".padStart(7) + "   time");
  for (const r of rows) console.log(r.key.padEnd(w) + r.result.padEnd(26) + String(r.count == null ? "—" : r.count).padStart(7) + "   " + mmss(r.secs));
  const bad = rows.filter(r => !r.ok), total = rows.reduce((a, r) => a + (r.count || 0), 0);
  console.log(`\n${bad.length ? `${bad.length} of ${rows.length} suites failed: ${bad.map(r => r.s.file).join(", ")}.` : `All ${rows.length} suites passed`}${bad.length ? "" : `: ${total.toLocaleString("en-GB")} checks`}${bad.length ? "" : "."} ${mmss((Date.now() - t0) / 1000)} in all.${UPDATE ? " The numbers of checks were written to tools/check-counts.json." : ""}`);
  process.exit(bad.length ? 1 : 0);
})();
