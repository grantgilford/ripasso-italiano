#!/usr/bin/env node
/*
  Adds new items to the built-in content in index.html.

  Usage:  node tools/add-items.js items.json [--dry-run]

  items.json is a JSON array of items in the content guide's format (or an
  object with an "items" array). Each item is written as one line, in the
  same style as the rest of BUILTIN, straight after the last item of its unit,
  in the order given (a new unit's first items go after the items of the unit
  listed before it). Refused, with nothing written, if:
    - an id already exists anywhere in the app, or appears twice in the file;
    - an item's unit is not one of the built-in grammar units;
    - the app's own pack check (validatePack) reports a problem.
  Afterwards run node tools/check-content.js, and node tools/test-progress.js
  --update-ids to add the new ids to tools/item-ids.txt.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const src = args.find(a => !a.startsWith("--"));
if (!src) { console.log("Usage: node tools/add-items.js items.json [--dry-run]"); process.exit(1); }
const file = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(file, "utf8");

let items = JSON.parse(fs.readFileSync(src, "utf8"));
if (!Array.isArray(items)) items = items.items;
if (!Array.isArray(items) || !items.length) { console.error("No items found."); process.exit(1); }

// the app's own checks
const code = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes("/* ---------- boot ---------- */"));
const boot = code.indexOf("/* ---------- boot ---------- */");
const noop = () => {};
const el = () => ({ addEventListener: noop, appendChild: noop, setAttribute: noop, style: {}, classList: { add: noop, remove: noop, toggle: noop } });
const sb = { console, setTimeout: noop, clearTimeout: noop, setInterval: noop, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  document: { addEventListener: noop, createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: el(), documentElement: el() },
  navigator: { userAgent: "node" }, location: { hash: "" }, matchMedia: () => ({ matches: false, addEventListener: noop }) };
sb.window = sb; sb.addEventListener = noop; sb.removeEventListener = noop;
const app = vm.runInNewContext(code.slice(0, boot) + "\n;({ buildContent, validatePack, getContent: () => content, BUILTIN })", sb);
app.buildContent();
const content = app.getContent();

const problems = [];
const seen = new Set();
for (const it of items) {
  if (content.items[it.id]) problems.push(`${it.id}: this id already exists (unit ${content.items[it.id].unit}).`);
  if (seen.has(it.id)) problems.push(`${it.id}: appears twice in ${src}.`);
  seen.add(it.id);
  if (!app.BUILTIN.units.some(u => u.id === it.unit)) problems.push(`${it.id}: unit "${it.unit}" is not a built-in grammar unit.`);
}
problems.push(...app.validatePack({ pack: "check", units: [], items }));
if (problems.length) { console.error("Nothing written. Problems:\n- " + problems.join("\n- ")); process.exit(1); }

// insert after the last line of each unit's items in BUILTIN
const lines = html.split("\n");
const start = lines.findIndex((l, i) => /^\s*"items": \[\s*$/.test(l) && lines.slice(0, i).some(x => x.startsWith("const BUILTIN = {")));
const ITEM = /^    \{"id":"[^"]+","unit":"([^"]+)"/;
let end = start + 1; while (end < lines.length && !/^\s*\]\s*,?\s*$/.test(lines[end])) end++; // the line closing the items array
const byUnit = {};
for (const it of items) (byUnit[it.unit] = byUnit[it.unit] || []).push(it);
const added = [];
for (const [unit, list] of Object.entries(byUnit)) {
  const lastOf = u => { let at = -1; for (let i = start; i < end; i++) { const m = lines[i].match(ITEM); if (m && m[1] === u) at = i; } return at; };
  let last = lastOf(unit);
  if (last < 0) { // a new unit's first items go after the unit before it in the list (by order) that has items
    const order = u => app.BUILTIN.units.find(x => x.id === u).order || 0;
    const before = app.BUILTIN.units.filter(u => order(u.id) < order(unit) && lastOf(u.id) >= 0).sort((a, b) => order(b.id) - order(a.id))[0];
    last = before ? lastOf(before.id) : -1;
  }
  if (last < 0) { console.error(`Nothing written: found no place in BUILTIN to add unit ${unit}'s items after.`); process.exit(1); }
  const isLastOfArray = !lines.slice(last + 1, end).some(l => ITEM.test(l));
  if (!lines[last].trimEnd().endsWith(",")) lines[last] = lines[last].trimEnd() + ",";
  const out = list.map((it, k) => "    " + JSON.stringify(it) + (isLastOfArray && k === list.length - 1 ? "" : ","));
  lines.splice(last + 1, 0, ...out);
  end += out.length;
  added.push(`${unit}: ${list.length} item(s) after line ${last + 1}`);
}
if (DRY) { console.log("Dry run, nothing written. Would add:\n  " + added.join("\n  ")); process.exit(0); }
fs.writeFileSync(file, lines.join("\n"));
console.log("Added:\n  " + added.join("\n  ") + "\nNow run node tools/check-content.js and node tools/test-progress.js --update-ids.");
