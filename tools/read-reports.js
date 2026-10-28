#!/usr/bin/env node
/*
  Reads reports sent from the app (You → Your data → Report, or Report it and Suggest it for everyone in the
  answer panel) and prints each beside the item as it stands now, ready to fix with tools/edit-items.js.

  Usage:  node tools/read-reports.js reports.txt [more.txt …] [--json]
          node tools/read-reports.js -            (reads what is pasted in, until Ctrl+D)

  A report is the text the app writes (see "reports" in index.html): a first line "Ripasso report 1", then
  "key: value" lines (kind, app version, copy, item, unit, exercise, shown, expected, given, note; for an app
  problem screen, browser and errors), a value's further lines indented by two spaces. Paste them from
  anywhere, as many as you like and in any wrapping: a GitHub issue (its "### Report" heading and the code
  fence round the report are skipped), an email (quoting "> " is taken off) or a plain copy.

  The reports are grouped by item id (an id removed from the app is followed through ID_ALIASES to the item
  that holds its progress now), and each group prints:
    - each report: its kind, version and copy, and what was shown, expected and given, and the note;
    - the item now, as stored in index.html (one line of JSON, as edit-items.js --replace takes it), or a
      line saying it is no longer in the app;
    - its lesson section (ITEM_SECTIONS), so the explanation can be checked against the lesson.
  App problems follow, newest first. --json prints the same as one JSON object per group instead.

  Reads index.html and the files named, and changes nothing. Working through reports: see CLAUDE.md.
*/
"use strict";
const fs = require("fs");

const HEAD = /^Ripasso report (\d+)\s*$/;
const KEY = /^([a-z][a-z ]*[a-z]): ?(.*)$/;

// Every report in the text, as { version, fields: { key: value } }, in the order found. A report runs from its first
// line to the first line that is neither "key: value" nor a further line of the last value (indented by two spaces).
function parseReports(text) {
  const out = [];
  let cur = null, last = null;
  for (let line of String(text).replace(/\r\n?/g, "\n").split("\n")) {
    line = line.replace(/^\s*(?:>\s?)+/, (m) => m.includes(">") ? "" : m).replace(/\s+$/, ""); // email quoting off
    line = line.replace(/^`{3,}\w*\s*/, ""); // a code fence opening on the report's first line
    const h = line.trim().match(HEAD);
    if (h) { cur = { version: Number(h[1]), fields: {} }; out.push(cur); last = null; continue; }
    if (!cur) continue;
    const k = line.match(KEY);
    if (k) { cur.fields[k[1]] = k[2].trim(); last = k[1]; continue; }
    if (last && /^ {2}\S/.test(line)) { cur.fields[last] += "\n" + line.trim(); continue; }
    cur = null; last = null; // a blank line, a code fence, a heading: the report has ended
  }
  return out;
}

module.exports = { parseReports };
if (require.main !== module) return;

const args = process.argv.slice(2), JSON_OUT = args.includes("--json");
const files = args.filter(a => a === "-" || !a.startsWith("--"));
if (!files.length) { console.log("Usage: node tools/read-reports.js reports.txt [more.txt …] [--json]   (or - to paste them in)"); process.exit(1); }
const text = files.map(f => f === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(f, "utf8")).join("\n");
const reports = parseReports(text);
if (!reports.length) { console.log("No reports found: each starts with the line \"Ripasso report 1\"."); process.exit(1); }

const { loadApp } = require("./lib/load-app");
const app = loadApp("buildContent, getContent: () => content, itemSection, lessonOf, plainText, ID_ALIASES, APP_ITEM_SECTIONS: ITEM_SECTIONS");
app.buildContent();
const content = app.getContent();

const other = reports.filter(r => r.version !== 1);
if (other.length) console.log(`Note: ${other.length} report(s) in a format other than "Ripasso report 1"; read as best as possible.`);

const groups = new Map(), problems = [];
for (const r of reports) {
  const f = r.fields;
  if (!f.item) { problems.push(r); continue; }
  const id = f.item.split(/\s/)[0];
  let now = id, via = null;
  for (let n = 0; !content.items[now] && app.ID_ALIASES[now] && n < 10; n++) { via = now; now = app.ID_ALIASES[now]; }
  const key = content.items[now] ? now : id;
  if (!groups.has(key)) groups.set(key, { id: key, asked: new Set(), reports: [] });
  const g = groups.get(key); g.asked.add(id); if (via) g.moved = true; g.reports.push(r);
}

function itemNow(id) { // the item as stored (as edit-items.js --replace takes it), its unit, and its lesson section
  const it = content.items[id];
  if (!it) return null;
  const { pack, ...stored } = it, unit = content.unitById[it.unit] || { id: it.unit, title: "" };
  const at = app.itemSection(id), L = at && app.lessonOf(content.unitById[at.unit]);
  const link = (app.APP_ITEM_SECTIONS[it.unit] || {})[id];
  return { stored, unit: { id: unit.id, title: unit.title }, pack,
    section: at && L ? { unit: at.unit, number: at.index + 1, heading: app.plainText(L.sections[at.index].h).trim(), link } : link === null ? "unlinked on purpose" : null };
}

if (JSON_OUT) {
  for (const g of groups.values()) console.log(JSON.stringify({ item: g.id, asked: [...g.asked], reports: g.reports.map(r => r.fields), now: itemNow(g.id) }));
  for (const r of problems) console.log(JSON.stringify({ item: null, reports: [r.fields] }));
  process.exit(0);
}

const show = (f, keys) => keys.filter(k => f[k]).map(k => `    ${(k + ":").padEnd(10)} ${f[k].replace(/\n/g, "\n" + " ".repeat(15))}`).join("\n");
const sorted = [...groups.values()].sort((a, b) => b.reports.length - a.reports.length || a.id.localeCompare(b.id));
console.log(`${reports.length} report(s): ${sorted.length} item(s), ${problems.length} app problem(s).`);
for (const g of sorted) {
  const now = itemNow(g.id);
  console.log(`\n=== ${g.id}${now ? ` · ${now.unit.id} ${now.unit.title}` : ""} (${g.reports.length} report${g.reports.length === 1 ? "" : "s"})`);
  if (g.moved) console.log(`  Reported as ${[...g.asked].filter(x => x !== g.id).join(", ")}, removed since: ID_ALIASES leads to ${g.id}.`);
  g.reports.forEach((r, i) => {
    const f = r.fields;
    console.log(`  ${i + 1}. ${f.kind || "report"} · version ${f["app version"] || "?"} · ${f.copy || "?"} copy`);
    console.log(show(f, ["exercise", "shown", "expected", "given", "note"]));
  });
  if (!now) { console.log("  Now: not in the app (removed, with no alias). Nothing to fix here."); continue; }
  console.log(`  Now (${now.pack}):\n    ${JSON.stringify(now.stored)}`);
  const s = now.section;
  console.log(`  Lesson: ${!s ? "none (the unit has no lesson, or the item no link)" : typeof s === "string" ? s : `${s.unit} section ${s.number}, “${s.heading}”`}`);
}
if (problems.length) {
  console.log("\n=== App problems (" + problems.length + ")");
  problems.forEach((r, i) => {
    const f = r.fields;
    console.log(`  ${i + 1}. version ${f["app version"] || "?"} · ${f.copy || "?"} copy · ${f.browser || "?"}${f.screen ? " · from " + f.screen : ""}`);
    console.log(show(f, ["note", "errors"]));
  });
}
console.log("\nTo fix an item: write it in full, corrected, in a JSON file and run node tools/edit-items.js --replace that.json --dry-run, then without --dry-run.");
console.log("Check each report against docs/italian-app-content-guide.md first: fix the item, or say on the issue why it is right.");
