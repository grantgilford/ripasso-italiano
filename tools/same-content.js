#!/usr/bin/env node
/*
  Checks that two copies of index.html hold exactly the same content, however it is laid out.

  Usage:  node tools/same-content.js [old] [new] [--verbose]

    old, new   each a path to an index.html, or a git ref (main, origin/main, v9.1…) whose
               index.html is read with git show. old defaults to origin/main (main if there is
               no origin/main), new to the index.html beside tools/.
    --verbose  print every difference instead of the first 20 of each constant

  Loads both copies as the content checks do (tools/lib/load-app.js) and compares, value by value:
    - every top-level constant in capitals defined before the boot section (BUILTIN_PACKS,
      LESSONS, VERB_GYM, ID_ALIASES, the vocab packs, the tables the exercises use, and the
      rest), in full: arrays, objects (with the order of their keys), strings, numbers, regular
      expressions, Sets and Maps; functions are code, not content, and are not compared;
    - the content the app builds from them (buildContent()), so a change to what the app
      derives shows up too.
  APP_VERSION and CHANGES (after the boot section) are only printed: they change with every version.

  Use it after reformatting content, or any change meant to leave the content alone, against
  the branch it started from. Reads both files and changes nothing. Exits with code 1 if anything
  differs.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { BOOT_MARK, INDEX, appScript, loadApp } = require("./lib/load-app");

const args = process.argv.slice(2);
const VERBOSE = args.includes("--verbose");
const SHOWN = 20;
const [oldArg, newArg] = args.filter(a => !a.startsWith("--"));
const ROOT = path.join(__dirname, "..");

// A copy of index.html: a file if there is one at that path, otherwise the index.html of a git ref.
function read(arg, fallbacks) {
  if (arg && fs.existsSync(arg) && fs.statSync(arg).isFile()) return { name: arg, html: fs.readFileSync(arg, "utf8") };
  for (const ref of arg ? [arg] : fallbacks) {
    const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
    try { return { name: `${ref}:index.html at ${git("rev-parse", "--short", ref).trim()}`, html: git("show", ref + ":index.html") }; }
    catch (e) { /* try the next */ }
  }
  console.error(`Could not read ${arg || fallbacks.join(" or ")}: not a file, and git show found no index.html there.`);
  process.exit(2);
}
const A = read(oldArg, ["origin/main", "main"]);
const B = newArg ? read(newArg) : { name: path.relative(process.cwd(), INDEX) || INDEX, html: fs.readFileSync(INDEX, "utf8") };

// The capitalised top-level constants before the boot section (including a second one declared
// in the same statement, as in const SYNC_COL = "progress2", SHARDS = 16).
function constantNames(html) {
  const code = appScript(html);
  const pre = code.slice(0, Math.max(0, code.indexOf(BOOT_MARK)));
  const names = [];
  for (const m of pre.matchAll(/^const ([A-Z][A-Z0-9_]*)\s*=(.*)$/gm)) {
    names.push(m[1]);
    const second = m[2].match(/^\s*("[^"\\]*"|[\w.]+)\s*,\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (second) names.push(second[2]);
  }
  return names;
}
function load(copy, names) {
  const app = loadApp(names.concat(["buildContent", "getContent: () => content"]), { html: copy.html });
  app.buildContent();
  return app;
}
const releaseNote = (html, name) => { const m = appScript(html).match(new RegExp(`^const ${name} = ("(?:[^"\\\\]|\\\\.)*");`, "m")); return m ? JSON.parse(m[1]) : null; };

const namesA = constantNames(A.html), namesB = constantNames(B.html);
const shared = namesA.filter(n => namesB.includes(n));
const appA = load(A, shared), appB = load(B, shared);

/* ---------- deep comparison ---------- */
const kind = v => {
  if (v === null) return "null";
  const t = typeof v;
  if (t !== "object") return t;
  return Object.prototype.toString.call(v).slice(8, -1); // Array, Object, RegExp, Set, Map… (the copies come from other realms, so no instanceof)
};
const show = v => {
  const k = kind(v);
  if (k === "function") return "a function";
  if (k === "RegExp") return String(v);
  if (k === "Set" || k === "Map") return `a ${k} of ${v.size}`;
  let s; try { s = JSON.stringify(v); } catch (e) { s = String(v); }
  if (s === undefined) s = String(v);
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
};
const key = k => /^[A-Za-z_$][\w$]*$/.test(k) ? "." + k : `[${JSON.stringify(k)}]`;

// Calls diff(path, message) for every difference between a and b.
function compare(a, b, at, diff, seen = new Map()) {
  if (Object.is(a, b)) return;
  const ka = kind(a), kb = kind(b);
  if (ka !== kb) return diff(at, `${ka} ${show(a)} → ${kb} ${show(b)}`);
  if (ka === "function") return; // code, not content
  if (!["Array", "Object", "RegExp", "Set", "Map"].includes(ka)) return diff(at, `${show(a)} → ${show(b)}`);
  if (seen.get(a) === b) return; // already being compared (shared or circular references)
  seen.set(a, b);
  if (ka === "RegExp") { if (String(a) !== String(b)) diff(at, `${a} → ${b}`); return; }
  if (ka === "Array" || ka === "Set") {
    const xa = [...a], xb = [...b];
    for (let i = 0; i < Math.min(xa.length, xb.length); i++) compare(xa[i], xb[i], `${at}[${i}]`, diff, seen);
    if (xa.length !== xb.length) diff(at, `${xa.length} entries → ${xb.length}` + (xb.length > xa.length ? `, new from [${xa.length}]: ${show(xb[xa.length])}` : `, gone from [${xb.length}]: ${show(xa[xb.length])}`));
    return;
  }
  const ea = ka === "Map" ? [...a.entries()] : Object.keys(a).map(k => [k, a[k]]);
  const eb = ka === "Map" ? [...b.entries()] : Object.keys(b).map(k => [k, b[k]]);
  const mb = new Map(eb), ma = new Map(ea);
  for (const [k, v] of ea) { const p = at + (ka === "Map" ? `.get(${show(k)})` : key(String(k))); if (!mb.has(k)) diff(p, `gone (was ${show(v)})`); else compare(v, mb.get(k), p, diff, seen); }
  for (const [k, v] of eb) if (!ma.has(k)) diff(at + (ka === "Map" ? `.get(${show(k)})` : key(String(k))), `new: ${show(v)}`);
  const order = ea.map(e => e[0]).filter(k => mb.has(k)), orderB = eb.map(e => e[0]).filter(k => ma.has(k));
  if (order.join("\u0000") !== orderB.join("\u0000")) diff(at, "the same keys in a different order");
}

console.log(`Comparing the content of ${A.name} (old) with ${B.name} (new).`);
let total = 0;
const report = (label, a, b) => {
  const found = [];
  compare(a, b, label, (p, m) => found.push(`${p}: ${m}`));
  total += found.length;
  if (!found.length) return true;
  console.log(`\n✗ ${label}: ${found.length} difference${found.length === 1 ? "" : "s"}`);
  for (const f of VERBOSE ? found : found.slice(0, SHOWN)) console.log("    " + f);
  if (!VERBOSE && found.length > SHOWN) console.log(`    … and ${found.length - SHOWN} more (--verbose for all)`);
  return false;
};
let same = 0, code = 0;
for (const n of shared) {
  if (kind(appA[n]) === "function" && kind(appB[n]) === "function") { code++; continue; }
  if (report(n, appA[n], appB[n])) same++;
}
const builtSame = report("buildContent()", appA.getContent(), appB.getContent());
for (const n of namesA.filter(n => !namesB.includes(n))) { total++; console.log(`\n✗ ${n}: only in the old copy`); }
for (const n of namesB.filter(n => !namesA.includes(n))) { total++; console.log(`\n✗ ${n}: only in the new copy`); }

const vA = releaseNote(A.html, "APP_VERSION"), vB = releaseNote(B.html, "APP_VERSION");
console.log(`\n${same} constant${same === 1 ? "" : "s"} the same${code ? ` (${code} holding code, not compared)` : ""}; the built content ${builtSame ? "the same" : "differs"}.`);
console.log(`Version ${vA} → ${vB}${vA === vB ? "" : " (APP_VERSION and CHANGES are not compared)"}.`);
if (total) { console.log(`\n${total} difference${total === 1 ? "" : "s"} in the content.`); process.exit(1); }
console.log("\nNo difference in the content.");
