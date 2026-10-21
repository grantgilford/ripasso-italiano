#!/usr/bin/env node
/*
  Adds new items to the built-in content in index.html.

  Usage:  node tools/add-items.js items.json [--dry-run]

  items.json is a JSON array of items in the content guide's format (or an
  object with an "items" array). Each item goes into the pack that holds its
  unit (BUILTIN for the grammar units, SLANG_PACK for u18, a vocab pack for a
  flashcard unit), straight after the last item of its unit, in the order
  given (a new unit's first items go after the items of the unit listed before
  it). The pack is written back in the layout tools/format-content.js sets, so
  each new item is one line. Refused, with nothing written, if:
    - an id already exists anywhere in the app, or appears twice in the file;
    - an item's unit is not a unit of a pack written in index.html (the Verbs
      section is built from VERB_GYM, so its items can't be added here);
    - the app's own pack check (validatePack) reports a problem.
  To change or remove existing items, use tools/edit-items.js.
  Afterwards run node tools/check-content.js, and node tools/test-progress.js
  --update-ids to add the new ids to tools/item-ids.txt.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { loadApp } = require("./lib/load-app");
const src = require("./lib/content-source");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const file = args.find(a => !a.startsWith("--"));
if (!file) { console.log("Usage: node tools/add-items.js items.json [--dry-run]"); process.exit(1); }
const index = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(index, "utf8");

let items = JSON.parse(fs.readFileSync(file, "utf8"));
if (!Array.isArray(items)) items = items.items;
if (!Array.isArray(items) || !items.length) { console.error("No items found."); process.exit(1); }

// the app's own checks
const app = loadApp("buildContent, validatePack, getContent: () => content", { html });
app.buildContent();
const content = app.getContent();
const packs = src.literalPacks(html);
const packOfUnit = u => packs.find(p => p.pack.units.some(x => x.id === u));

const problems = [];
const seen = new Set();
for (const it of items) {
  if (content.items[it.id]) problems.push(`${it.id}: this id already exists (unit ${content.items[it.id].unit}).`);
  if (seen.has(it.id)) problems.push(`${it.id}: appears twice in ${file}.`);
  seen.add(it.id);
  if (!packOfUnit(it.unit)) problems.push(`${it.id}: unit "${it.unit}" is not a unit of a pack written in index.html${content.unitById[it.unit] ? " (the Verbs section is built from VERB_GYM)" : ""}.`);
}
problems.push(...app.validatePack({ pack: "check", units: [], items }));
if (problems.length) { console.error("Nothing written. Problems:\n- " + problems.join("\n- ")); process.exit(1); }

// insert after the last item of each unit, in the pack that holds it
const byUnit = {};
for (const it of items) (byUnit[it.unit] = byUnit[it.unit] || []).push(it);
const changed = new Set(), placed = [];
for (const [unit, list] of Object.entries(byUnit)) {
  const { name, pack } = packOfUnit(unit);
  const lastOf = u => pack.items.map(i => i.unit).lastIndexOf(u);
  let last = lastOf(unit), after = unit;
  if (last < 0) { // a new unit's first items go after the unit before it in the list (by order) that has items
    const order = u => pack.units.find(x => x.id === u).order || 0;
    const before = pack.units.filter(u => order(u.id) < order(unit) && lastOf(u.id) >= 0).sort((a, b) => order(b.id) - order(a.id))[0];
    last = before ? lastOf(before.id) : -1;
    after = before ? before.id : null;
  }
  const anchor = last >= 0 ? pack.items[last].id : null;
  pack.items.splice(last + 1, 0, ...list);
  changed.add(name);
  placed.push({ unit, name, n: list.length, anchor, after, first: list[0].id });
}
let out = html;
for (const { name, pack } of packs) if (changed.has(name)) out = src.writeConstant(out, name, pack);
const where = p => `${p.unit}: ${p.n} item(s) in ${p.name}, ` + (p.anchor ? `after ${p.anchor}${p.after !== p.unit ? ` (the last of ${p.after})` : ""}` : "at the start of its items") + `, from line ${src.lineOf(out, `{"id":${JSON.stringify(p.first)},`)}`;
if (DRY) { console.log("Dry run, nothing written. Would add:\n  " + placed.map(where).join("\n  ")); process.exit(0); }
fs.writeFileSync(index, out);
console.log("Added:\n  " + placed.map(where).join("\n  ") + "\nNow run node tools/check-content.js and node tools/test-progress.js --update-ids.");
