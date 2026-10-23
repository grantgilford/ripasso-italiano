#!/usr/bin/env node
/*
  Changes or removes existing items in the built-in content in index.html.

  Usage:  node tools/edit-items.js --replace items.json [--dry-run]
          node tools/edit-items.js --remove ID --to NEWID [--remove ID2 --to NEWID2 …] [--dry-run]

  --replace items.json
      items.json is a JSON array of items (or an object with an "items" array), each in full as
      it will be stored: it replaces the item with the same id, where that item stands. Fields
      left out of the new version are dropped. Refused if an id is not an item of a pack written
      in index.html (a Verbs item is built from VERB_GYM: edit the verb there), appears twice, or
      moves to a unit of another pack. Prints what changed in each item (--dry-run also prints
      the old and new lines), and says when a change stops an item sharing progress with its
      copies in other units (the same exercise shares one record; see sameItemKey in the app).
      An item may carry "section", its lesson link as add-items.js takes it: it replaces the
      item's line in ITEM_SECTIONS (and is not stored on the item). Without one the link stays,
      unless the item moves to another unit, where one with a lesson needs a "section".

  --remove ID --to NEWID
      Deletes item ID and adds ID_ALIASES[ID] = NEWID, so the progress saved for ID (on every
      device) moves to NEWID. Refused if ID is not an item of a pack written in index.html, or if
      NEWID is not an item that stays in the app. An alias that pointed at ID is pointed at NEWID
      too, since aliases must lead straight to a live item. ID's lesson link in ITEM_SECTIONS goes
      with it. Warns if ID's id appears anywhere else in index.html or the tests.

  Both run the app's own pack check (validatePack) on every pack they change and refuse, with
  nothing written, what it rejects; then load the changed app to make sure it still builds.
  The packs, ID_ALIASES and ITEM_SECTIONS are written back in the layout tools/format-content.js
  sets: one item, and one alias, per line, and one unit's links per line. --dry-run checks and reports but writes nothing.
  Afterwards run node tools/check-content.js, node tools/test-items.js on the units changed,
  and node tools/test-progress.js.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { loadApp } = require("./lib/load-app");
const src = require("./lib/content-source");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const valueOf = flag => args.flatMap((a, i) => a === flag ? [args[i + 1]] : []);
const replaceFile = valueOf("--replace")[0];
const removes = valueOf("--remove"), tos = valueOf("--to");
const USAGE = "Usage: node tools/edit-items.js --replace items.json [--dry-run]\n       node tools/edit-items.js --remove ID --to NEWID [--remove ID2 --to NEWID2 …] [--dry-run]";
if (!replaceFile === !removes.length) { console.log(USAGE); process.exit(1); }
if (removes.length !== tos.length || removes.concat(tos).some(x => !x || x.startsWith("--"))) { console.error("Each --remove ID needs its own --to NEWID.\n" + USAGE); process.exit(1); }

const ROOT = path.join(__dirname, "..");
const index = path.join(ROOT, "index.html");
const html = fs.readFileSync(index, "utf8");
const app = loadApp("buildContent, validatePack, sectionTarget, lessonOf, getContent: () => content, pid", { html });
app.buildContent();
const content = app.getContent();
const packs = src.literalPacks(html);
const aliases = src.parseLiteral(html, "ID_ALIASES");
const links = src.parseLiteral(html, "ITEM_SECTIONS"), linksChanged = new Set(); // the units whose links change
// where an item is written: { name, pack, at } (its index in pack.items), or null
const locate = id => { for (const p of packs) { const at = p.pack.items.findIndex(i => i.id === id); if (at >= 0) return Object.assign({ at }, p); } return null; };
const notWritten = (id, otherwise) => content.items[id] ? `${id} is a Verbs item, built from VERB_GYM: change the verb there instead.` : `${id} is not an item; ${otherwise}.`;
// the ids that share one progress record with id (itself included), as the app counts them
const sharing = (c, pid, id) => Object.keys(c.items).filter(x => pid(x) === pid(id)).sort();

const problems = [], report = [], changed = new Set();
let removed = [], replaced = [];

if (replaceFile) {
  let items = JSON.parse(fs.readFileSync(replaceFile, "utf8"));
  if (!Array.isArray(items)) items = items.items;
  if (!Array.isArray(items) || !items.length) { console.error("No items found."); process.exit(1); }
  const seen = new Set();
  for (const it of items) {
    if (!it || !it.id) { problems.push(`an item without an id: ${JSON.stringify(it)}`); continue; }
    if (seen.has(it.id)) problems.push(`${it.id}: appears twice in ${replaceFile}.`);
    seen.add(it.id);
    const where = locate(it.id);
    if (!where) { problems.push(notWritten(it.id, "--replace only changes items that exist (add new ones with add-items.js)")); continue; }
    if (it.unit !== where.pack.items[where.at].unit && !where.pack.units.some(u => u.id === it.unit)) problems.push(`${it.id}: unit "${it.unit}" is not in ${where.name}, where the item is; an item can only move to a unit of its own pack.`);
    const has = Object.prototype.hasOwnProperty.call(it, "section"), { section, ...neu } = it, oldUnit = where.pack.items[where.at].unit;
    const lesson = app.lessonOf(content.unitById[neu.unit]);
    if (has && !lesson) problems.push(`${it.id}: unit "${neu.unit}" has no lesson, so the item takes no "section".`);
    else if (has && /^(\w+#)?\d+$/.test(String(section))) problems.push(`${it.id}: "section" names a section by its heading, not its number.`);
    else if (has && section !== null && !app.sectionTarget(neu.unit, section)) problems.push(`${it.id}: "section": ${JSON.stringify(section)} doesn't name exactly one section.`);
    else if (!has && lesson && neu.unit !== oldUnit) problems.push(`${it.id}: moves to ${neu.unit}, which has a lesson: give it a "section".`);
    replaced.push({ old: where.pack.items[where.at], neu, where, section: has ? section : undefined, oldUnit });
  }
  if (!problems.length) {
    for (const r of replaced) {
      r.where.pack.items[r.where.at] = r.neu; changed.add(r.where.name);
      const before = links[r.oldUnit] && Object.prototype.hasOwnProperty.call(links[r.oldUnit], r.neu.id) ? links[r.oldUnit][r.neu.id] : undefined;
      if (r.neu.unit !== r.oldUnit && before !== undefined) { delete links[r.oldUnit][r.neu.id]; linksChanged.add(r.oldUnit); }
      if (r.section !== undefined) { (links[r.neu.unit] = links[r.neu.unit] || {})[r.neu.id] = r.section; linksChanged.add(r.neu.unit); }
      if (r.section !== undefined ? r.section !== before || r.neu.unit !== r.oldUnit : r.neu.unit !== r.oldUnit && before !== undefined) report.push(`${r.neu.id}: lesson link ${before === undefined ? "none" : JSON.stringify(before)} → ${r.section === undefined ? "none" : JSON.stringify(r.section)}`);
    }
  }
} else {
  const gone = new Set(removes);
  removes.forEach((id, k) => {
    const to = tos[k];
    const where = locate(id);
    if (!where) problems.push(notWritten(id, "nothing to remove"));
    if (removes.indexOf(id) !== k) problems.push(`${id} is removed twice.`);
    if (to === id) problems.push(`${id} can't hand its progress to itself.`);
    else if (!content.items[to]) problems.push(`${id} → ${to}: ${to} is not an item${aliases[to] ? ` (it is an alias of ${aliases[to]}: point at that instead)` : ""}.`);
    else if (gone.has(to)) problems.push(`${id} → ${to}: ${to} is being removed too.`);
    if (aliases[id]) problems.push(`${id} is already in ID_ALIASES (→ ${aliases[id]}).`);
    if (problems.length || !where) return;
    const old = where.pack.items[where.at], target = content.items[to];
    removed.push({ id, to, old, where });
    if (old.unit !== target.unit || old.type !== target.type) report.push(`note: ${id} (${old.type}, ${old.unit}) hands its progress to ${to} (${target.type}, ${target.unit}); make sure that is the item a learner of ${id} now practises.`);
  });
  if (!problems.length) {
    for (const r of removed) { r.where.pack.items = r.where.pack.items.filter(i => i.id !== r.id); changed.add(r.where.name); }
    for (const r of removed) if (links[r.old.unit] && Object.prototype.hasOwnProperty.call(links[r.old.unit], r.id)) { delete links[r.old.unit][r.id]; linksChanged.add(r.old.unit); }
    for (const r of removed) {
      for (const [k, v] of Object.entries(aliases)) if (v === r.id) { aliases[k] = r.to; report.push(`ID_ALIASES: ${k} → ${r.id} now points at ${r.to}.`); }
      aliases[r.id] = r.to;
    }
  }
}
for (const { name, pack } of packs) if (changed.has(name)) problems.push(...app.validatePack(pack).map(p => `${name}: ${p}`));
if (problems.length) { console.error("Nothing written. Problems:\n- " + problems.join("\n- ")); process.exit(1); }

/* ---------- write, then load the result to be sure it still builds ---------- */
let out = html;
for (const { name, pack } of packs) if (changed.has(name)) out = src.writeConstant(out, name, pack);
if (removed.length) out = src.writeConstant(out, "ID_ALIASES", aliases);
if (linksChanged.size) { // each changed unit's links in the order of its items
  for (const u of linksChanged) {
    const order = packs.flatMap(p => p.pack.items).filter(i => i.unit === u).map(i => i.id), m = links[u] || {}, o = {};
    order.forEach(id => { if (Object.prototype.hasOwnProperty.call(m, id)) o[id] = m[id]; });
    links[u] = o;
  }
  out = src.writeConstant(out, "ITEM_SECTIONS", links);
}
let after;
try {
  after = loadApp("buildContent, getContent: () => content, pid", { html: out });
  after.buildContent();
} catch (e) { console.error("Nothing written: the changed app doesn't build:\n" + e.stack); process.exit(1); }
const contentAfter = after.getContent();

const changes = (a, b) => {
  const keys = [...new Set(Object.keys(a).concat(Object.keys(b)))];
  const out = keys.filter(k => !(k in b)).map(k => k + " dropped").concat(keys.filter(k => !(k in a)).map(k => k + " added"), keys.filter(k => k in a && k in b && JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => k + " changed"));
  return out.length ? out.join(", ") : "no change";
};
for (const r of replaced) {
  report.push(`${r.neu.id} (${r.where.name}, line ${src.lineOf(out, `{"id":${JSON.stringify(r.neu.id)},`)}): ${changes(r.old, r.neu)}`);
  if (DRY) report.push("  - " + JSON.stringify(r.old), "  + " + JSON.stringify(r.neu));
  const was = sharing(content, app.pid, r.neu.id), now = sharing(contentAfter, after.pid, r.neu.id);
  if (was.join() !== now.join()) report.push(`  note: ${r.neu.id} shared progress with ${was.filter(x => x !== r.neu.id).join(", ") || "nothing"}; now with ${now.filter(x => x !== r.neu.id).join(", ") || "nothing"}. Items that are the same exercise share one record; check that this is meant.`);
}
for (const r of removed) {
  const lands = after.pid(r.id);
  if (!contentAfter.items[lands]) { console.error(`Nothing written: ${r.id}'s progress would go to ${lands}, which is not an item.`); process.exit(1); }
  report.push(`${r.id} (${r.old.unit}, ${r.where.name}) removed; its progress goes to ${r.to}${lands !== r.to ? ` (and so to ${lands}, the copy whose record it shares)` : ""}.`);
  if (DRY) report.push("  - " + JSON.stringify(r.old));
  const shared = sharing(content, app.pid, r.id).filter(x => x !== r.id);
  if (shared.length && !shared.includes(r.to)) report.push(`  note: ${r.id} shared progress with ${shared.join(", ")} (the same exercise in another unit); --to ${shared[0]} would keep it together.`);
  const elsewhere = [["index.html", out]].concat(fs.readdirSync(path.join(ROOT, "tools")).filter(f => f.endsWith(".js")).map(f => ["tools/" + f, fs.readFileSync(path.join(ROOT, "tools", f), "utf8")]))
    .filter(([f, text]) => text.replace(/^ {2}"[^"\n]*": "[^"\n]*",?$/gm, "").includes(JSON.stringify(r.id))).map(([f]) => f); // aliases aside
  if (elsewhere.length) report.push(`  warning: "${r.id}" still appears in ${elsewhere.join(", ")}: check those places.`);
}
if (DRY) { console.log("Dry run, nothing written.\n" + report.join("\n")); process.exit(0); }
fs.writeFileSync(index, out);
console.log(report.join("\n") + "\nNow run node tools/check-content.js, node tools/test-items.js on the units changed, and node tools/test-progress.js.");
