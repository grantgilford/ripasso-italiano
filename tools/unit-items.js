#!/usr/bin/env node
/*
  Prints a unit's items in a compact, readable form, grouped by type, so a
  content session can see what a unit already has without paging through
  index.html.

  Usage:  node tools/unit-items.js u01 [u02 …] [--type spot] [--json]
          node tools/unit-items.js --word casa [--word amico …]

    --type T   only items of this type (vocab, sentence, grammar_mc, transform,
               spot, sort, match, reply, endings, verb, number, prep, clock)
    --json     print the items as JSON lines, as they are stored
    --word W   every item in any unit whose Italian is exactly W (a vocab word,
               with its full data, so a copy in another unit can match it and
               share progress), and every sentence that uses W
    --counts   a table of how many items of each type every grammar unit has

  Reads index.html and changes nothing.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const args = process.argv.slice(2);
const opt = (name) => { const out = []; args.forEach((a, i) => { if (a === name && args[i + 1]) out.push(args[i + 1]); }); return out; };
const JSON_OUT = args.includes("--json");
const types = opt("--type"), words = opt("--word");
const units = args.filter((a, i) => !a.startsWith("--") && !["--type", "--word"].includes(args[i - 1]));
const file = path.join(__dirname, "..", "index.html");

function loadApp() {
  const html = fs.readFileSync(file, "utf8");
  const code = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes("/* ---------- boot ---------- */"));
  const boot = code.indexOf("/* ---------- boot ---------- */");
  const noop = () => {};
  const el = () => ({ addEventListener: noop, appendChild: noop, setAttribute: noop, style: {}, classList: { add: noop, remove: noop, toggle: noop } });
  const sb = { console, setTimeout: noop, clearTimeout: noop, setInterval: noop, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { addEventListener: noop, createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: el(), documentElement: el() },
    navigator: { userAgent: "node" }, location: { hash: "" }, matchMedia: () => ({ matches: false, addEventListener: noop }) };
  sb.window = sb; sb.addEventListener = noop; sb.removeEventListener = noop;
  const app = vm.runInNewContext(code.slice(0, boot) + "\n;({ buildContent, normalize, getContent: () => content, spotAnswer, endingsFull })", sb);
  app.buildContent();
  return app;
}
const app = loadApp(), content = app.getContent();
const arr = x => Array.isArray(x) ? x : (x == null ? [] : [x]);

function line(i) {
  const id = i.id.padEnd(24);
  switch (i.type) {
    case "vocab": return `${id} ${i.art ? i.art + (i.art.endsWith("'") ? "" : " ") : ""}${arr(i.it).join(" / ")} = ${arr(i.en).join(", ")} [${i.pos}${i.gender ? " " + i.gender : ""}]${i.plural ? " pl. " + i.artPl + " " + i.plural : ""}${Array.isArray(i.forms) ? " (" + i.forms.join("/") + ")" : ""}${i.note ? "  · " + i.note : ""}`;
    case "sentence": return `${id} ${arr(i.it)[0]} = ${arr(i.en)[0]}${i.cloze ? "  · cloze: " + i.cloze.text + (i.cloze.hint ? " (" + i.cloze.hint + ")" : "") + (i.cloze.options ? " options " + i.cloze.options.join("/") : "") : ""}`;
    case "grammar_mc": return `${id} ${i.prompt} → ${i.answer}  [${i.options.filter(o => o !== i.answer).join(" | ")}]`;
    case "transform": return `${id} ${i.it}  (${i.task}) → ${arr(i.answer).join(" / ")}`;
    case "spot": return `${id} ${i.it}${i.wrong == null ? "  (no mistake)" : `  ✕ ${i.wrong} → ${arr(i.fix).join("/")}`} = ${arr(i.en)[0] || ""}`;
    case "sort": return `${id} ${i.prompt} [${i.groups.join(" | ")}]: ${i.rows.map(r => r.it + "→" + r.group).join(", ")}`;
    case "match": return `${id} ${i.prompt || ""}: ${i.pairs.map(p => p.join(" = ")).join("; ")}`;
    case "reply": return `${id} ${i.who ? i.who + ": " : ""}${i.line} → ${arr(i.answer).join(" / ")}${i.cue ? "  (" + i.cue + ")" : ""}`;
    case "endings": return `${id} ${i.text} = ${arr(i.en)[0]}`;
    case "verb": return `${id} ${i.it} = ${arr(i.en).join(", ")} [${i.group}] ${Object.keys(i.forms).join(", ")}`;
    default: return `${id} ${JSON.stringify(i)}`;
  }
}
const ORDER = ["vocab", "verb", "sentence", "transform", "grammar_mc", "spot", "endings", "reply", "sort", "match", "number", "prep", "clock"];
for (const u of units) {
  const items = (content.byUnit[u] || []).filter(i => !types.length || types.includes(i.type));
  const unit = content.unitById[u];
  if (!unit) { console.log(`No unit ${u}.`); continue; }
  console.log(`\n=== ${u}: ${unit.title} (${items.length} items)`);
  const byType = {};
  for (const i of items) (byType[i.type] = byType[i.type] || []).push(i);
  for (const t of Object.keys(byType).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))) {
    console.log(`\n-- ${t} (${byType[t].length})`);
    for (const i of byType[t]) { const { pack, ...rest } = i; console.log(JSON_OUT ? JSON.stringify(rest) : line(i)); }
  }
}
for (const w of words) {
  const n = app.normalize(w);
  const all = Object.values(content.items);
  const vocab = all.filter(i => i.type === "vocab" && arr(i.it).some(x => app.normalize(x) === n));
  const uses = all.filter(i => i.type !== "vocab" && [i.type === "spot" ? app.spotAnswer(i) : i.type === "endings" ? app.endingsFull(i) : arr(i.it)[0], i.line, arr(i.answer)[0]].some(x => x && (" " + app.normalize(x) + " ").includes(" " + n + " ")));
  console.log(`\n=== ${w}: ${vocab.length} card(s), used in ${uses.length} other item(s)`);
  for (const i of vocab) { const { pack, ...rest } = i; console.log((content.unitById[i.unit] || {}).mode === "flashcards" ? `  [${i.unit}] ` + line(i) : "  " + JSON.stringify(rest)); }
  for (const i of uses.slice(0, 12)) console.log(`  in ${i.unit}: ` + line(i));
  if (uses.length > 12) console.log(`  … and ${uses.length - 12} more`);
}
if (args.includes("--counts")) { // how many items of each type every grammar unit has: where a type is used, and where it could be
  const T = ["vocab", "verb", "sentence", "transform", "grammar_mc", "spot", "endings", "reply", "sort", "match", "number", "prep", "clock"];
  const short = { vocab: "vocab", verb: "verb", sentence: "sent", transform: "trans", grammar_mc: "mc", spot: "spot", endings: "end", reply: "reply", sort: "sort", match: "match", number: "num", prep: "prep", clock: "clock" };
  console.log("unit  " + T.map(t => short[t].padStart(6)).join("") + "   total");
  for (const u of content.units.filter(u => !u.mode)) {
    const items = content.byUnit[u.id] || [];
    console.log(u.id.padEnd(6) + T.map(t => String(items.filter(i => i.type === t).length || "·").padStart(6)).join("") + String(items.length).padStart(8));
  }
}
if (!units.length && !words.length && !args.includes("--counts")) console.log("Usage: node tools/unit-items.js u01 [u02 …] [--type T] [--json] | --word W | --counts");
