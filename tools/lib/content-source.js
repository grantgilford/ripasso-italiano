/*
  The content constants as text in index.html: where each one sits, and the layout every tool
  writes them in, so a change to the content shows in a pull request as the lines it changes.
  Used by format-content (which lays them all out), add-items and edit-items (which change
  items, aliases and links and write the constant back in the same layout).

  The content constants are JSON literals (const NAME = {…}; or […];), laid out like this:

    a pack (BUILTIN, SLANG_PACK, the vocab packs)     one unit per line and one item per line; a
                                                      grammar unit (no mode) with one note per line
    LESSONS                                           one section per line, under its unit's line
    VERB_GYM                                          one verb per line
    ID_ALIASES                                        one alias per line
    ITEM_SECTIONS                                     one unit per line: its items' lesson links

  Inside a line the JSON is compact, as JSON.stringify writes it, so a line can be copied into a
  JSON file and back. The layout is fixed: writing a constant twice gives the same text.

    const src = require("./lib/content-source");
    const at = src.findLiteral(html, "VOCAB1");        // { start, end, text } or null
    const pack = JSON.parse(at.text);
    html = src.replaceLiteral(html, "VOCAB1", src.formatConstant("VOCAB1", pack));
*/
"use strict";
const { BOOT_MARK, appScript } = require("./load-app");

const LESSON_NAMES = ["LESSONS"], VERB_NAMES = ["VERB_GYM"], ALIAS_NAMES = ["ID_ALIASES"], LINK_NAMES = ["ITEM_SECTIONS"];

// JSON.stringify, made safe inside a <script>: "</script" and "<!--" would end or confuse the
// script, so they are written with an escape (which JSON.parse and JavaScript read back unchanged).
const json = v => JSON.stringify(v).replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "\\u003c!--");
// A list written one entry per line: "[" or "{", the entries at indent, the closing bracket at close.
const block = (open, lines, indent, close, shut) => lines.length ? open + "\n" + lines.map(l => indent + l).join(",\n") + "\n" + close + shut : open + shut;

// A unit: on one line, except that a grammar unit's notes go one per line.
function formatUnit(u) {
  if (u.mode || !Array.isArray(u.notes) || !u.notes.length) return json(u);
  return "{" + Object.keys(u).map(k => json(k) + ":" + (k === "notes" ? block("[", u.notes.map(json), "      ", "    ", "]") : json(u[k]))).join(",") + "}";
}
// A pack: its other fields (pack, version…) on lines of their own, then "units" and "items"
// one entry per line, in the order the fields come in.
function formatPack(p) {
  const lines = [];
  let plain = [];
  const flush = () => { if (plain.length) lines.push(plain.join(", ")); plain = []; };
  for (const k of Object.keys(p)) {
    if ((k === "units" || k === "items") && Array.isArray(p[k])) {
      flush();
      lines.push(json(k) + ": " + block("[", p[k].map(k === "units" ? formatUnit : json), "    ", "  ", "]"));
    } else plain.push(json(k) + ": " + json(p[k]));
  }
  flush();
  return "{\n" + lines.map(l => "  " + l).join(",\n") + "\n}";
}
// LESSONS: each unit's lesson on a line of its own, with its sections one per line beneath it.
function formatLessons(lessons) {
  const lesson = l => "{" + Object.keys(l).map(k => json(k) + ":" + (k === "sections" && Array.isArray(l[k]) ? block("[", l[k].map(json), "    ", "  ", "]") : json(l[k]))).join(",") + "}";
  return block("{", Object.keys(lessons).map(u => json(u) + ": " + lesson(lessons[u])), "  ", "", "}");
}
const formatList = list => block("[", list.map(json), "  ", "", "]");                                        // VERB_GYM
const formatMap = map => block("{", Object.keys(map).map(k => json(k) + ": " + json(map[k])), "  ", "", "}"); // ID_ALIASES, ITEM_SECTIONS

function formatConstant(name, value) {
  if (LESSON_NAMES.includes(name)) return formatLessons(value);
  if (VERB_NAMES.includes(name)) return formatList(value);
  if (ALIAS_NAMES.includes(name) || LINK_NAMES.includes(name)) return formatMap(value);
  if (value && Array.isArray(value.items)) return formatPack(value);
  throw new Error(`No layout for ${name}.`);
}

// Where the app's script sits in the page, and the part of it before the boot section (where
// the content is defined).
function scriptRange(html) {
  const code = appScript(html);
  const start = html.indexOf(code);
  if (!code || start < 0) throw new Error("Could not find the app's script in index.html.");
  const boot = code.indexOf(BOOT_MARK);
  return { start, end: start + (boot < 0 ? code.length : boot) };
}

// The JSON literal assigned by `const NAME = ` at the start of a line in the app's script:
// { start, end, text }, with start and end as positions in html, or null if NAME is not
// assigned a literal there. Strings are skipped as JSON writes them, so brackets inside them don't count.
function findLiteral(html, name) {
  const range = scriptRange(html);
  const decl = new RegExp(`^const ${name} = `, "m");
  const m = decl.exec(html.slice(range.start, range.end));
  if (!m) return null;
  const start = range.start + m.index + m[0].length;
  if (html[start] !== "{" && html[start] !== "[") return null;
  let depth = 0;
  for (let i = start; i < range.end; i++) {
    const c = html[i];
    if (c === '"') { for (i++; i < range.end && html[i] !== '"'; i++) if (html[i] === "\\") i++; continue; }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { if (--depth === 0) return { start, end: i + 1, text: html.slice(start, i + 1) }; }
  }
  throw new Error(`The literal assigned to ${name} never closes.`);
}
function parseLiteral(html, name) {
  const at = findLiteral(html, name);
  if (!at) throw new Error(`${name} is not assigned a JSON literal in index.html.`);
  try { return JSON.parse(at.text); }
  catch (e) { throw new Error(`${name} is not plain JSON (${e.message}); it can't be rewritten safely.`); }
}
function replaceLiteral(html, name, text) {
  const at = findLiteral(html, name);
  if (!at) throw new Error(`${name} is not assigned a JSON literal in index.html.`);
  return html.slice(0, at.start) + text + html.slice(at.end);
}

// The packs written in index.html as literals, in the order of BUILTIN_PACKS: the names of
// their constants (VERB_PACK is built by code from VERB_GYM, so it is not one of them).
function packNames(html) {
  const range = scriptRange(html);
  const m = html.slice(range.start, range.end).match(/^const BUILTIN_PACKS = \[([^\]]*)\]/m);
  if (!m) throw new Error("Could not find BUILTIN_PACKS in index.html.");
  return m[1].split(",").map(s => s.trim()).filter(n => /^[A-Z][A-Z0-9_]*$/.test(n) && findLiteral(html, n));
}
// Every content constant that has a layout: the literal packs, LESSONS, VERB_GYM, ID_ALIASES and ITEM_SECTIONS.
const contentNames = html => packNames(html).concat(LESSON_NAMES, VERB_NAMES, ALIAS_NAMES, LINK_NAMES).filter(n => findLiteral(html, n));

// The packs written as literals, parsed: [{ name, pack }], in the order of BUILTIN_PACKS.
const literalPacks = html => packNames(html).map(name => ({ name, pack: parseLiteral(html, name) }));
// The html with a content constant replaced by value, in its layout.
const writeConstant = (html, name, value) => replaceLiteral(html, name, formatConstant(name, value));
// The line (from 1) on which text first appears in html, or 0.
const lineOf = (html, text) => { const at = html.indexOf(text); return at < 0 ? 0 : html.slice(0, at).split("\n").length; };

// Writes every content constant in the layout above. Returns the new html.
function formatAll(html) {
  for (const name of contentNames(html)) html = replaceLiteral(html, name, formatConstant(name, parseLiteral(html, name)));
  return html;
}

module.exports = { findLiteral, parseLiteral, replaceLiteral, formatConstant, formatAll, packNames, contentNames, literalPacks, writeConstant, lineOf, json };
