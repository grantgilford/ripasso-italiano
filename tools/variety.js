#!/usr/bin/env node
/*
  Variety report: how many kinds of exercise each grammar unit gives the learner, and how evenly.

  Usage:  node tools/variety.js [u01 u02 …] [--runs 8] [--no-listen] [--markdown] [path/to/index.html]

  For every grammar unit (or those named), builds each item's exercise with the app's own
  makeExercise at boxes 1, 2, 3 and 4, --runs times each (8 by default), and counts the kinds
  (the exercise's typeKey, as the Stats screen groups them: cloze, translate, recall…). Every item
  and box counts the same, so the figures describe the unit's content, not one learner's mix.
  Math.random is replaced by a seeded generator, started afresh for each item and box from its
  id, so the report is the same on every run and a change to one item moves only its own share.
  Listen and type is counted as for a learner with an Italian voice and Read aloud on;
  --no-listen counts as if listening were off.

  Prints, per unit, the number of kinds and the shares of the two most common, flagging a unit
  with fewer than 10 kinds or one kind above 35%; then every kind's share over all the units.
  --markdown prints the same as a section for docs/exercise-types.md ("Measured mix (version)"):
  replace the section there with it after a change to the content or to makeExercise.
  Reads index.html and changes nothing.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { appScript, loadApp } = require("./lib/load-app");

const args = process.argv.slice(2);
const MARKDOWN = args.includes("--markdown"), LISTEN = !args.includes("--no-listen");
const RUNS = Number((args[args.indexOf("--runs") + 1] || "")) || 8;
const BOXES = [1, 2, 3, 4];
const MIN_KINDS = 10, MAX_SHARE = 0.35;
const file = args.find(a => a.endsWith(".html")) || path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(file, "utf8");
const version = (appScript(html).match(/^const APP_VERSION = "([^"]+)"/m) || [])[1] || "?";

const app = loadApp("buildContent, makeExercise, getContent: () => content, setRandom: f => { Math.random = f; }, setListen: f => { canListen = f; }", { html });
app.buildContent();
const content = app.getContent();
if (LISTEN) app.setListen(() => true);

// mulberry32, seeded from a string (FNV-1a), as in test-perf's fixed seed
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const seeded = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const wanted = args.filter(a => /^u\d+$/.test(a));
const units = content.units.filter(u => !u.mode && (!wanted.length || wanted.includes(u.id)));
for (const id of wanted) if (!units.some(u => u.id === id)) { console.error(`${id} is not a grammar unit.`); process.exit(1); }

const rows = [], overall = {}, unitsWith = {};
let none = 0;
for (const u of units) {
  const items = content.byUnit[u.id] || [], counts = {};
  let total = 0;
  for (const it of items) for (const box of BOXES) {
    app.setRandom(seeded(hash(it.id + "|" + box)));
    for (let k = 0; k < RUNS; k++) {
      const ex = app.makeExercise(it, { box, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3, lastRight: 0 });
      if (!ex || !ex.typeKey) { none++; continue; }
      counts[ex.typeKey] = (counts[ex.typeKey] || 0) + 1; total++;
    }
  }
  const kinds = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, share: n / total }));
  for (const { k, share } of kinds) { overall[k] = (overall[k] || 0) + counts[k]; (unitsWith[k] = unitsWith[k] || []).push(u.id); }
  const flags = [];
  if (kinds.length < MIN_KINDS) flags.push(`fewer than ${MIN_KINDS} kinds`);
  if (kinds.length && kinds[0].share > MAX_SHARE) flags.push(`${kinds[0].k} above ${Math.round(MAX_SHARE * 100)}%`);
  rows.push({ u, items: items.length, total, kinds, flags });
}
const grand = Object.values(overall).reduce((a, b) => a + b, 0);
const kindsAll = Object.entries(overall).sort((a, b) => b[1] - a[1]);
const pct = x => x > 0 && x < 0.005 ? "<1%" : (100 * x).toFixed(0) + "%";
const top = (r, i) => r.kinds[i] ? `${r.kinds[i].k} ${pct(r.kinds[i].share)}` : "";
const flagged = rows.filter(r => r.flags.length);
const how = `every item at boxes ${BOXES.slice(0, -1).join(", ")} and ${BOXES[BOXES.length - 1]}, ${RUNS} times each, with listening ${LISTEN ? "on" : "off"}`;

if (MARKDOWN) {
  const out = [`## Measured mix (${version})`, "",
    `What \`node tools/variety.js --markdown\` printed for version ${version}: the app's own \`makeExercise\`, with a seeded random generator, on ${how}, so every item and box counts the same. **Kinds** is how many different exercises (by key) a unit gives; a unit is flagged with fewer than ${MIN_KINDS} kinds or one kind above ${Math.round(MAX_SHARE * 100)}%. Run it again after changing a unit's items (or \`makeExercise\`) and replace this section with what it prints.`, "",
    "| Unit | Items | Kinds | Most common | Second | Flag |", "|---|---:|---:|---|---|---|",
    ...rows.map(r => `| ${r.u.id} ${r.u.title} | ${r.items} | ${r.kinds.length} | \`${r.kinds[0] ? r.kinds[0].k : ""}\` ${r.kinds[0] ? pct(r.kinds[0].share) : ""} | ${r.kinds[1] ? "`" + r.kinds[1].k + "` " + pct(r.kinds[1].share) : ""} | ${r.flags.join("; ") || ""} |`),
    "", `Over all ${rows.length} units (${rows.reduce((a, r) => a + r.items, 0)} items):`, "",
    "| Kind | Share | Units using it |", "|---|---:|---:|",
    ...kindsAll.map(([k, n]) => `| \`${k}\` | ${pct(n / grand)} | ${unitsWith[k].length} |`),
    "", flagged.length ? `Flagged: ${flagged.length} of ${rows.length} units.` : "No unit is flagged."];
  console.log(out.join("\n"));
} else {
  console.log(`Variety of exercises, version ${version}: ${how}.\n`);
  console.log("unit  " + "title".padEnd(34) + "items  kinds   most common         second              flag");
  for (const r of rows) console.log(r.u.id.padEnd(6) + r.u.title.slice(0, 33).padEnd(34) + String(r.items).padStart(5) + String(r.kinds.length).padStart(7) + "   " + top(r, 0).padEnd(20) + top(r, 1).padEnd(20) + (r.flags.length ? "⚑ " + r.flags.join("; ") : ""));
  console.log(`\nOver all ${rows.length} units:\nkind           share   units`);
  for (const [k, n] of kindsAll) console.log(k.padEnd(14) + pct(n / grand).padStart(6) + String(unitsWith[k].length).padStart(8));
  console.log(`\n${flagged.length ? `${flagged.length} of ${rows.length} units flagged (fewer than ${MIN_KINDS} kinds, or one kind above ${Math.round(MAX_SHARE * 100)}%).` : "No unit flagged."}`);
}
if (none) console.log(`\n${none} exercise${none === 1 ? "" : "s"} could not be built (makeExercise gave nothing); the app skips such an item.`);
