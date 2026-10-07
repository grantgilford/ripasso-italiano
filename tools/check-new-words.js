#!/usr/bin/env node
/*
  Checks a list of candidate words for a new vocabulary pack against every word
  already in the app (flashcard packs, grammar units, the slang unit and the
  Verbs section), so a new pack adds only new words.

  Usage:  node tools/check-new-words.js words.txt [path/to/index.html]

  words.txt has one Italian word or phrase per line; anything after a "|" is
  ignored (so a draft line "pertanto | conj | therefore" works), as are blank
  lines and lines starting with #. Reads index.html and changes nothing.

  Reports:
    EXISTS  the word is already in the app (case and curly apostrophes aside)
    REPEAT  the word comes twice in the list
    NEAR    probably the same word in another form: the same letters without
            accents, the verb with or without -si, or the same stem with another
            final vowel (previsione / previsioni). Most are fine (casa / caso);
            a person decides.
  Exits with code 1 when anything EXISTS or repeats.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const args = process.argv.slice(2);
if (!args[0]) { console.error("Usage: node tools/check-new-words.js words.txt [path/to/index.html]"); process.exit(2); }
const html = fs.readFileSync(args[1] || path.join(__dirname, "..", "index.html"), "utf8");

/* load the content, as tools/check-content.js does */
const code = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])[0] || "";
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

const known = []; // { w, where }
for (const p of app.BUILTIN_PACKS) for (const it of p.items || []) {
  if (it.type !== "vocab" && it.type !== "verb") continue;
  for (const w of arr(it.it)) known.push({ w: String(w), where: `${it.id} (${it.unit})` });
}
for (const v of app.VERB_GYM) known.push({ w: v.it, where: "Verbs section" });

const low = s => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const bare = s => low(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
const base = s => { const m = s.match(/^(.*r)(si|sene|sela|cela|ci|ne)$/); return m ? m[1] + "e" : s; };
const stem = s => (!/ /.test(s) && s.length >= 5) ? s.replace(/[aeiou]$/, "") : null;
const index = { exact: {}, near: {} };
const add = (tbl, k, o) => { if (k) (tbl[k] = tbl[k] || []).push(o); };
for (const o of known) {
  const w = low(o.w), b = bare(o.w);
  add(index.exact, w, o);
  add(index.near, "a:" + b, o); add(index.near, "r:" + base(b), o); add(index.near, "s:" + stem(b), o);
}

const words = fs.readFileSync(args[0], "utf8").split("\n").map(l => l.split("|")[0].trim()).filter(l => l && !l.startsWith("#"));
const seen = new Set(); let bad = 0, near = 0;
const list = os => [...new Set(os.map(o => `${o.w} [${o.where}]`))].join("; ");
for (const raw of words) {
  const w = low(raw), b = bare(raw);
  if (seen.has(w)) { console.log(`REPEAT  ${raw}`); bad++; continue; }
  seen.add(w);
  if (index.exact[w]) { console.log(`EXISTS  ${raw}  ← ${list(index.exact[w])}`); bad++; continue; }
  const hits = ["a:" + b, "r:" + base(b), stem(b) && "s:" + stem(b)].filter(Boolean).flatMap(k => index.near[k] || []);
  if (hits.length) { console.log(`NEAR    ${raw}  ← ${list(hits)}`); near++; }
}
console.log(`\n${words.length} words checked against ${known.length} in the app: ${bad} already there or repeated, ${near} to look at, ${words.length - bad - near} new.`);
process.exit(bad ? 1 : 0);
