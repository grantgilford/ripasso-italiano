#!/usr/bin/env node
/*
  Lays out the content in index.html one entry per line, so a pull request shows a change to
  the content as the lines it changes rather than as one enormous changed line.

  Usage:  node tools/format-content.js [path/to/index.html] [--check]

  Rewrites the content constants in the layout tools/lib/content-source.js sets out:
    BUILTIN, SLANG_PACK and the vocab packs   one unit per line (a grammar unit with one note per
                                              line) and one item per line
    LESSONS                                   one section per line, under its unit's line
    VERB_GYM                                  one verb per line
    VERB_SENTENCES                            one verb per line, with its example sentences
    ID_ALIASES                                one alias per line
    ITEM_SECTIONS                             one unit per line
  Only the layout changes: each constant is read as JSON and written back with the same values in
  the same order, and nothing else in the file is touched. Safe to run again at any time: on a file
  already laid out it changes nothing. add-items and edit-items write in the same layout.
  Afterwards node tools/same-content.js confirms the content is unchanged.

  --check  changes nothing; exits with code 1 if any constant is not in this layout.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const src = require("./lib/content-source");

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const file = args.find(a => !a.startsWith("--")) || path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(file, "utf8");

const changed = [];
let out = html;
for (const name of src.contentNames(html)) {
  const before = src.findLiteral(out, name).text;
  const after = src.formatConstant(name, src.parseLiteral(out, name));
  if (after === before) continue;
  out = src.replaceLiteral(out, name, after);
  const lines = t => t.split("\n").length;
  changed.push(`${name}: ${lines(before)} line${lines(before) === 1 ? "" : "s"} → ${lines(after)}`);
}
if (!changed.length) { console.log("Every content constant is already laid out one entry per line. Nothing to do."); process.exit(0); }
if (CHECK) { console.log("Not in the one-entry-per-line layout (run node tools/format-content.js):\n  " + changed.join("\n  ")); process.exit(1); }
fs.writeFileSync(file, out);
console.log("Laid out:\n  " + changed.join("\n  ") + `\nindex.html: ${html.split("\n").length} lines → ${out.split("\n").length}. Now run node tools/same-content.js.`);
