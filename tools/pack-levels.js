#!/usr/bin/env node
/*
  How common are the words in each vocab pack, and which common words has no pack taught yet?
  Uses tools/word-ranks.txt: about 20,000 Italian dictionary words in order of frequency
  (see its header). A word's rank is its line there: rank 1 is the most common word.

  Usage:
    node tools/pack-levels.js                    every flashcard pack, in the order the app shows them
    node tools/pack-levels.js words.txt          the same figures for a draft list, one word per line
                                                 (anything after a "|" is ignored, as in check-new-words.js)
    node tools/pack-levels.js --missing [N] [M]  the words ranked N to M (default 1 to 3000) that no
                                                 flashcard, grammar unit or the Verbs section has yet

  The figures: the median rank (half the pack's words are more common than this), and the share of
  words among the 1,000, 3,000, 5,000 and 10,000 most common. A phrase counts as hard as its rarest
  word. As a rough guide, the 1,000 most common words take a learner to about A2, 3,000 to B1,
  5,000 to B2 and 8,000–10,000 to C1. Packs should run from the most common words to the least,
  so a new pack is numbered by where its median falls. Reads index.html and changes nothing.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const args = process.argv.slice(2);
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const ranks = new Map();
fs.readFileSync(path.join(__dirname, "word-ranks.txt"), "utf8").split("\n").filter(l => l && !l.startsWith("#"))
  .forEach((w, i) => { if (!ranks.has(w)) ranks.set(w, i + 1); });
const BEYOND = ranks.size + 1;

/* load the content, as tools/check-new-words.js does */
const code = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes("/* ---------- boot ---------- */")) || "";
const boot = code.indexOf("/* ---------- boot ---------- */");
if (boot < 0) { console.error("Could not find the boot section in the script; the loader needs updating."); process.exit(1); }
const noop = () => {};
const stubEl = () => ({ addEventListener: noop, appendChild: noop, setAttribute: noop, style: {}, classList: { add: noop, remove: noop, toggle: noop } });
const sandbox = {
  console, setTimeout: noop, clearTimeout: noop, setInterval: noop,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  document: { addEventListener: noop, createElement: stubEl, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: stubEl(), documentElement: stubEl() },
  navigator: { userAgent: "node" }, location: { hash: "" }, matchMedia: () => ({ matches: false, addEventListener: noop }),
};
sandbox.window = sandbox; sandbox.addEventListener = noop; sandbox.removeEventListener = noop;
const app = vm.runInNewContext(code.slice(0, boot) + "\n;({ BUILTIN_PACKS, VERB_GYM })", sandbox, { filename: "index.html <script>" });
const arr = x => Array.isArray(x) ? x : (x == null ? [] : [x]);

/* ranks */
const STOP = new Set("il lo la i gli le un uno una di a da in con su per tra fra e o che non si mi ti ci vi ne del della dei delle al alla ai alle dal dalla nel nella sul sulla è".split(" "));
const low = s => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/\s*\([^)]*\)/g, "").trim();
const variants = w => { // the word as written, then the dictionary forms it may stand for
  const v = [w, w.replace(/^(l|un|dell|all|dall|nell|sull|d|c|s|m|t|v)'/, "")];
  const r = w.match(/^(.*)(ar|er|ir)(si|sene|sela|cela|ci|ne)$/); if (r) v.push(r[1] + r[2] + "e");
  const p = [["chi", "co"], ["ghi", "go"], ["che", "ca"], ["ghe", "ga"], ["i", "o"], ["i", "e"], ["e", "a"]];
  for (const [a, b] of p) if (w.endsWith(a)) v.push(w.slice(0, -a.length) + b);
  return v;
};
const rankOfWord = w => { for (const v of variants(w)) if (ranks.has(v)) return ranks.get(v); return BEYOND; };
const rankOf = it => {
  const toks = low(it).split(/[\s/]+/).filter(Boolean);
  if (toks.length === 1) return rankOfWord(toks[0]);
  const content = toks.filter(t => !STOP.has(t.replace(/^\w+'/, "")));
  return Math.max(...(content.length ? content : toks).map(rankOfWord)); // as hard as its rarest word
};

function report(name, words) {
  const rs = words.map(rankOf).sort((a, b) => a - b);
  const share = n => (100 * rs.filter(r => r <= n).length / rs.length).toFixed(0).padStart(3) + "%";
  const med = rs[Math.floor(rs.length / 2)];
  console.log(`${name.padEnd(24)} ${String(rs.length).padStart(5)}  ${(med >= BEYOND ? ">" + ranks.size : String(med)).padStart(6)}   ${share(1000)}   ${share(3000)}   ${share(5000)}   ${share(10000)}`);
}
const header = () => console.log(`${"".padEnd(24)} words  median  top 1k  top 3k  top 5k  top 10k`);

if (args[0] === "--missing") {
  const from = Number(args[1]) || 1, to = Number(args[2]) || 3000;
  const known = new Set();
  const addKnown = w => { const t = low(w); if (!t.includes(" ")) variants(t).forEach(v => known.add(v)); };
  for (const p of app.BUILTIN_PACKS) for (const it of p.items || []) if (it.type === "vocab" || it.type === "verb") arr(it.it).forEach(w => String(w).split("/").forEach(addKnown));
  for (const v of app.VERB_GYM) addKnown(v.it);
  const list = [...ranks].filter(([w, r]) => r >= from && r <= to && !known.has(w) && !STOP.has(w));
  console.log(`Words ranked ${from}–${to} that the app has no card for (${list.length}). Names, English words and forms grouped under the wrong word are mixed in; skip those.\n`);
  console.log(list.map(([w, r]) => `${r} ${w}`).join("\n"));
} else if (args[0]) {
  const words = fs.readFileSync(args[0], "utf8").split("\n").map(l => l.split("|")[0].trim()).filter(l => l && !l.startsWith("#"));
  header(); report(path.basename(args[0]), words);
} else {
  const units = [];
  for (const p of app.BUILTIN_PACKS) for (const u of p.units || []) if (u.mode === "flashcards") units.push(u);
  units.sort((a, b) => (a.order || 0) - (b.order || 0));
  header();
  for (const u of units) {
    const words = [];
    for (const p of app.BUILTIN_PACKS) for (const it of p.items || []) if (it.unit === u.id) words.push(arr(it.it)[0]);
    report(`${u.title} (${u.id})`, words);
  }
}
