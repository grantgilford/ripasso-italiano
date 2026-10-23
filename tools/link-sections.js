#!/usr/bin/env node
/*
  Proposes, for each item of a grammar unit with a lesson, the lesson section that teaches it, and
  compares the proposal with the link stored in ITEM_SECTIONS (index.html).

  Usage:  node tools/link-sections.js [u01 …] [--low] [--missing] [--diff] [--min 0.5] [--json] [--write]

    u01 …       only these units (default: every grammar unit with a lesson)
    --low       only the proposals with a confidence under --min (default 0.5): the ones to review by hand
    --missing   only items with no link yet (and not listed as deliberately unlinked)
    --diff      only items whose stored link differs from the proposal
    --json      one JSON object per item instead of the readable listing
    --write     store the proposal for every item that has no link yet (never changes a stored one), in
                ITEM_SECTIONS's layout; review those with --low first, and fix any by hand

  How it scores. Each section of the item's own unit is a small document: its heading, and its text split
  into Italian (italic words, examples, Italian table columns, dialogue lines, the "wrong → right" pairs)
  and English (the rest). The item is the query: its Italian, weighted by how much it says about the rule
  (the answer, the cloze blanks, a spot item's wrong word and fix, the words a transform changes, a word's
  own forms count most; the rest of its sentences less), the Italian words of its explanation (words the
  content or the lessons use as Italian), the English terms of its explanation, and its English (prompt,
  task, cue, meaning). Each term is scored per section with BM25 (rarer terms across the unit's sections
  weigh more), a term in the heading counts extra, and the sections that only gather the unit's material
  (Putting it together, a reading, How to use this review) are not proposed. The confidence is the margin
  between the best section and the runner-up, as a share of the best: 1 is clear-cut, near 0 a toss-up.

  A stored link names a section by a unique start of its heading, without the markup ("Subject pronouns",
  "essere: the present"), or another unit's section as "u13#Where the pronouns"; null marks an item left
  unlinked on purpose. node tools/check-content.js checks every link.

  Reads index.html; changes it only with --write.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { loadApp } = require("./lib/load-app");
const src = require("./lib/content-source");

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const MIN = Number((args[args.indexOf("--min") + 1] || "").match(/^[\d.]+$/) ? args[args.indexOf("--min") + 1] : 0.5);
const only = args.filter(a => /^u\d+$/.test(a));
const index = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(index, "utf8");
const app = loadApp("buildContent, LESSONS, VERB_GYM, normalize, getContent: () => content, ITEM_SECTIONS: typeof ITEM_SECTIONS === 'undefined' ? {} : ITEM_SECTIONS", { html });
app.buildContent();
const content = app.getContent();
const { LESSONS, normalize } = app;
const STORED = app.ITEM_SECTIONS || {};
const arr = (x) => Array.isArray(x) ? x : (x == null ? [] : [x]);

/* ---------- headings and links ---------- */
const plainHeading = (h) => String(h).replace(/\[\[[^\]|]*\|?([^\]]*)\]\]/g, "$1").replace(/\*+/g, "").trim();
const lessonOf = (uid) => (content.unitById[uid] && content.unitById[uid].lesson) || LESSONS[uid] || null;
const headings = (uid) => (lessonOf(uid) ? lessonOf(uid).sections : []).map(s => plainHeading(s.h));
// The shortest start of a heading that no other heading of the unit begins with, at a word boundary, and of
// two words at least where the heading has two: what a link stores.
function startOf(uid, i) {
  const hs = headings(uid), words = hs[i].split(" ");
  for (let n = Math.min(2, words.length); n <= words.length; n++) {
    const s = words.slice(0, n).join(" ").replace(/[,:;]$/, ""); // no trailing comma or colon
    if (hs.filter(h => h.startsWith(s)).length === 1) return s;
  }
  return hs[i];
}
// A stored link → { unit, index } (index from 0), or null when it doesn't resolve to exactly one section.
function resolve(uid, link) {
  if (link == null) return null;
  const m = String(link).match(/^(?:(\w+)#)?(.+)$/), unit = m[1] || uid, hs = headings(unit);
  const hits = hs.map((h, i) => h.startsWith(m[2]) ? i : -1).filter(i => i >= 0);
  return hits.length === 1 ? { unit, index: hits[0] } : null;
}

/* ---------- words ---------- */
const EN_STOP = new Set(("a an the is are was were be been being am of to in on at by for with from as and or but not no nor so if then than " +
  "this that these those it its it's they them their there here he him his she her we us our you your i me my mine one ones " +
  "do does did done has have had having can could will would shall should may might must also only just very more most less " +
  "same other another such each every any some all both what which who whom whose when where why how about into out up down " +
  "over after before after because while so its like used use uses using word words form forms say says said mean means " +
  "meaning way take takes taken make makes go goes way thing things sentence answer right wrong correct here").split(/\s+/));
const tokens = (s) => normalize(String(s || "").replace(/\{|\}|\|/g, " ")).split(" ").filter(Boolean);
const stripLinks = (s) => String(s).replace(/\[\[[^\]|]*\|?([^\]]*)\]\]/g, "$1");
// A string with lesson markup → [italic (Italian) text, the rest (English)].
function splitMarkup(s) {
  const t = stripLinks(s).replace(/\*\*/g, "");
  const it = [], en = [];
  t.split(/(\*[^*]+\*)/).forEach(part => (part.startsWith("*") && part.endsWith("*") && part.length > 2 ? it : en).push(part.replace(/\*/g, "")));
  return [it.join(" "), en.join(" ")];
}

// What the content and the lessons use as Italian, and as English, across the course: tells the Italian
// words of an explanation from the English ones.
const IT_WORDS = new Set(), EN_WORDS = new Set();
for (const it of Object.values(content.items)) {
  for (const k of ["it", "answer", "fix", "wrong", "line", "options", "plural"]) for (const s of arr(it[k])) if (typeof s === "string") tokens(s).forEach(w => IT_WORDS.add(w));
  if (it.forms) Object.values(Array.isArray(it.forms) ? { f: it.forms } : it.forms).forEach(f => arr(f).forEach(s => tokens(s).forEach(w => IT_WORDS.add(w))));
  if (it.cloze) tokens(it.cloze.text).forEach(w => IT_WORDS.add(w));
  for (const s of arr(it.en)) tokens(s).forEach(w => EN_WORDS.add(w));
}
for (const v of app.VERB_GYM) for (const f of v.f) for (const s of arr(f)) tokens(s).forEach(w => IT_WORDS.add(w));

/* ---------- the sections as documents ---------- */
function blockParts(b, out) { // out: { it: [], en: [] }
  const add = (s) => { const [i, e] = splitMarkup(s); out.it.push(i); out.en.push(e); };
  if (typeof b === "string") return add(b);
  if (!b || typeof b !== "object") return;
  if (b.h) add(b.h);
  if (b.ex) for (const r of b.ex) { out.it.push(stripLinks(r[0]).replace(/\*/g, "")); if (r[1]) add(r[1]); if (r[2]) add(r[2]); }
  if (b.table) {
    const itc = new Set(b.it || []);
    for (const row of [b.head || []].concat(b.table)) row.forEach((c, j) => { const t = String(c || "").replace(/\n~/g, "\n"); if (itc.has(j)) out.it.push(stripLinks(t).replace(/\*/g, "")); else add(t); });
  }
  if (b.list) arr(b.list).forEach(add);
  if (b.tip) { arr(b.tip).forEach(add); if (b.label) add(b.label); }
  if (b.dlg) for (const r of b.dlg) { out.it.push(stripLinks(r[1]).replace(/\*/g, "")); if (r[2]) add(r[2]); }
  if (b.fix) for (const r of b.fix) { out.it.push(stripLinks(r[0]).replace(/\*/g, ""), stripLinks(r[1]).replace(/\*/g, "")); if (r[2]) add(r[2]); }
}
const GATHER = /^(Putting it together|Reading:|How to use this review|Keeping it going)/; // sections that gather a unit's material, never proposed
const PENALTY = { "Common mistakes": 0.75, "Common mistakes across the course": 0.75 };
const counts = (list) => { const m = new Map(); for (const w of list) m.set(w, (m.get(w) || 0) + 1); return m; };
const bigrams = (ws) => ws.slice(1).map((w, i) => ws[i] + " " + w);
function unitDocs(uid) {
  return lessonOf(uid).sections.map((s, i) => {
    const out = { it: [], en: [] };
    (s.b || []).forEach(b => blockParts(b, out));
    const [hi, he] = splitMarkup(s.h);
    const itW = out.it.flatMap(tokens), enW = out.en.flatMap(tokens).filter(w => !EN_STOP.has(w));
    const itAll = itW.concat(bigrams(itW)), enAll = enW.concat(bigrams(enW));
    return { i, h: plainHeading(s.h), gather: GATHER.test(plainHeading(s.h)), penalty: PENALTY[plainHeading(s.h)] || 1,
      it: counts(itAll), en: counts(enAll), nIt: itAll.length, nEn: enAll.length,
      head: new Set(tokens(hi).concat(tokens(he).filter(w => !EN_STOP.has(w)), bigrams(tokens(hi + " " + he)))) };
  });
}

/* ---------- the item as a query ---------- */
// [term, weight, field]: field "it" matches the sections' Italian, "en" their English.
function itemQuery(item) {
  const q = [];
  const it = (s, w) => { const ws = tokens(s); ws.forEach(t => q.push([t, w, "it"])); bigrams(ws).forEach(t => q.push([t, w * 0.8, "it"])); };
  const en = (s, w) => { const ws = tokens(s).filter(t => !EN_STOP.has(t)); ws.forEach(t => q.push([t, w, "en"])); bigrams(tokens(s)).filter(b => b.split(" ").some(t => !EN_STOP.has(t))).forEach(t => q.push([t, w * 0.8, "en"])); };
  const explain = (s, w) => { // its Italian words (as the content uses them) against the Italian, the rest against the English
    for (const t of tokens(s)) {
      if (IT_WORDS.has(t) && !EN_WORDS.has(t)) q.push([t, w, "it"]);
      else if (!EN_STOP.has(t)) q.push([t, w * 0.6, "en"]);
    }
    bigrams(tokens(s)).forEach(t => q.push([t, w * 0.5, "it"], [t, w * 0.4, "en"]));
  };
  const FOCUS = 3, CONTEXT = 1, EXPL = 3.5, ENG = 0.8, NOTE = 0.6;
  switch (item.type) {
    case "vocab":
      arr(item.it).forEach(s => it(s, FOCUS));
      if (Array.isArray(item.forms)) item.forms.filter(f => f && f !== "—").forEach(s => it(s, FOCUS * 0.6));
      for (const k of ["art", "indef", "artPl"]) if (item[k]) it(item[k], 0.5);
      if (item.plural && item.plural !== "—") it(item.plural, FOCUS * 0.6);
      arr(item.en).forEach(s => en(s, ENG));
      if (item.note) explain(item.note, EXPL);
      if (item.pos) en(item.pos.replace("/", " "), 0.3);
      break;
    case "verb":
      it(item.it, FOCUS);
      Object.values(item.forms || {}).forEach(f => arr(f).forEach(s => it(s, 0.4))); // the tenses' names say nothing: a unit's verbs share them
      arr(item.en).forEach(s => en(s, ENG));
      if (item.group) en(item.group, 0.8);
      if (item.note) explain(item.note, EXPL);
      break;
    case "sentence": {
      arr(item.it).slice(0, 2).forEach(s => it(s, CONTEXT));
      arr(item.en).forEach(s => en(s, ENG));
      if (item.cloze) {
        const blanks = [...String(item.cloze.text).matchAll(/\{([^}]*)\}/g)].map(m => m[1]);
        blanks.forEach(b => b.split("|").forEach(s => it(s, FOCUS)));
        if (item.cloze.hint) { it(item.cloze.hint, 1.5); en(item.cloze.hint, 1); }
        arr(item.cloze.options).forEach(s => it(s, CONTEXT));
        Object.values(item.cloze.notes || {}).forEach(s => explain(s, NOTE));
      }
      if (item.explanation) explain(item.explanation, EXPL);
      break;
    }
    case "grammar_mc":
      en(item.prompt, 1.2); explain(item.prompt, 1.2);
      it(item.answer, FOCUS); explain(item.answer, 1);
      arr(item.options).filter(o => o !== item.answer).forEach(s => it(s, CONTEXT));
      if (item.explanation) explain(item.explanation, EXPL);
      Object.values(item.distractorNotes || {}).forEach(s => explain(s, NOTE));
      break;
    case "transform": {
      it(item.it, CONTEXT); en(item.task, 1.2); explain(item.task, 1.2);
      const from = new Set(tokens(item.it));
      arr(item.answer).slice(0, 2).forEach(a => { const ws = tokens(a); it(a, CONTEXT); ws.filter(w => !from.has(w)).forEach(t => q.push([t, FOCUS, "it"])); });
      if (item.explanation) explain(item.explanation, EXPL);
      break;
    }
    case "spot":
      it(item.it, CONTEXT); arr(item.en).forEach(s => en(s, ENG));
      if (item.wrong) it(item.wrong, FOCUS);
      arr(item.fix).forEach(s => it(s, FOCUS));
      if (item.explanation) explain(item.explanation, EXPL);
      Object.values(item.notes || {}).forEach(s => explain(s, NOTE));
      break;
    case "endings": {
      const text = String(item.text);
      it(text.replace(/\{([^}|]*)[^}]*\}/g, "$1"), CONTEXT);
      text.split(/\s+/).filter(w => /\{/.test(w)).forEach(w => it(w.replace(/\{([^}|]*)[^}]*\}/g, "$1"), FOCUS));
      arr(item.en).forEach(s => en(s, ENG));
      if (item.explanation) explain(item.explanation, EXPL);
      break;
    }
    case "reply":
      it(item.line, CONTEXT); en(item.cue, 1);
      arr(item.answer).slice(0, 2).forEach(s => it(s, FOCUS * 0.7));
      arr(item.options).forEach(s => it(s, CONTEXT * 0.7));
      if (item.explanation) explain(item.explanation, EXPL);
      Object.values(item.notes || {}).forEach(s => explain(s, NOTE));
      break;
    case "sort":
      en(item.prompt, 1.2); explain(item.prompt, 1.5);
      arr(item.groups).forEach(s => it(s, FOCUS));
      arr(item.rows).forEach(r => { it(r.say || r.it, CONTEXT); if (r.note) explain(r.note, NOTE); });
      if (item.explanation) explain(item.explanation, EXPL);
      break;
    case "match":
      en(item.prompt, 1.2); explain(item.prompt, 1.5);
      arr(item.pairs).forEach(p => { it(p[0], 1.5); if (item.right === "en") en(p[1], ENG); else it(p[1], 1.5); });
      if (item.explanation) explain(item.explanation, EXPL);
      break;
    case "number":
      it(item.it, FOCUS); arr(item.alt).forEach(s => it(s, FOCUS));
      q.push([String(item.value), FOCUS, "it"], [String(item.value), FOCUS, "en"]);
      if (item.note) explain(item.note, EXPL);
      break;
    case "clock":
      arr(item.it).forEach(s => it(s, 1.5)); q.push([String(item.value).replace(":", " "), 1, "en"]);
      en("time clock hours", 1);
      break;
    case "prep":
      it(item.it, FOCUS * 2); arr(item.en).forEach(s => en(s, ENG));
      if (item.note) explain(item.note, EXPL);
      break;
  }
  return q;
}

/* ---------- scoring ---------- */
const K1 = 1.2, B = 0.75, HEAD = 0.8;
function scorer(docs) {
  const N = docs.length, avg = { it: docs.reduce((n, d) => n + d.nIt, 0) / N || 1, en: docs.reduce((n, d) => n + d.nEn, 0) / N || 1 };
  const df = { it: new Map(), en: new Map() };
  for (const d of docs) for (const f of ["it", "en"]) for (const t of d[f].keys()) df[f].set(t, (df[f].get(t) || 0) + 1);
  const idf = (f, t) => Math.log((N - (df[f].get(t) || 0) + 0.5) / ((df[f].get(t) || 0) + 0.5) + 1);
  return (query) => docs.map(d => {
    let s = 0;
    for (const [t, w, f] of query) {
      const tf = d[f].get(t) || 0, len = f === "it" ? d.nIt : d.nEn;
      if (tf) s += w * idf(f, t) * tf * (K1 + 1) / (tf + K1 * (1 - B + B * len / avg[f]));
      if (d.head.has(t)) s += w * HEAD * Math.max(idf("it", t), idf("en", t));
    }
    return d.gather ? 0 : s * d.penalty;
  });
}

/* ---------- run ---------- */
function main() {
const units = content.units.filter(u => !u.mode && lessonOf(u.id) && (!only.length || only.includes(u.id)));
const short = (item) => {
  const t = item.type, s = (x) => String(x || "").replace(/\s+/g, " ");
  const text = t === "sentence" ? (item.cloze ? item.cloze.text : arr(item.it)[0]) : t === "grammar_mc" ? `${item.prompt} → ${item.answer}` : t === "transform" ? `${item.it} [${item.task}] → ${arr(item.answer)[0]}`
    : t === "spot" ? `${item.it} (${item.wrong ? item.wrong + " → " + arr(item.fix)[0] : "no mistake"})` : t === "endings" ? item.text : t === "reply" ? `${item.line} [${item.cue}] → ${arr(item.answer)[0]}`
    : t === "sort" ? `${item.prompt}: ${arr(item.groups).join(" / ")}` : t === "match" ? `${item.prompt}: ${arr(item.pairs).map(p => p.join("=")).join(", ")}`
    : t === "vocab" ? `${arr(item.it)[0]} (${arr(item.en)[0]})${item.note ? " · " + item.note : ""}` : t === "verb" ? `${item.it} (${Object.keys(item.forms || {}).join(", ")})` : t === "number" ? `${item.value} ${item.it}` : t === "clock" ? `${item.value} ${arr(item.it)[0]}` : `${item.it}`;
  return s(text).slice(0, 150) + (item.explanation ? `  — ${s(item.explanation).slice(0, 110)}` : "");
};
const out = [];
for (const u of units) {
  const docs = unitDocs(u.id), score = scorer(docs), stored = STORED[u.id] || {};
  for (const item of content.byUnit[u.id] || []) {
    const sc = score(itemQuery(item)), order = sc.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    const [best, second] = [order[0], order[1] || [0, -1]];
    const conf = best[0] > 0 ? (best[0] - second[0]) / best[0] : 0;
    const has = Object.prototype.hasOwnProperty.call(stored, item.id), link = has ? stored[item.id] : undefined, at = has ? resolve(u.id, link) : null;
    out.push({ id: item.id, unit: u.id, type: item.type, text: short(item), best: best[1], heading: docs[best[1]].h, start: startOf(u.id, best[1]), score: Math.round(best[0] * 10) / 10,
      second: second[1], secondHeading: second[1] >= 0 ? docs[second[1]].h : "", conf: Math.round(conf * 100) / 100,
      stored: has ? link : undefined, storedAt: at, agrees: has && at && at.unit === u.id && at.index === best[1] });
  }
}
let list = out;
if (flag("--low")) list = list.filter(r => r.conf < MIN);
if (flag("--missing")) list = list.filter(r => r.stored === undefined);
if (flag("--diff")) list = list.filter(r => r.stored !== undefined && !r.agrees);

if (flag("--write")) {
  const next = {};
  for (const u of content.units) if (!u.mode && lessonOf(u.id)) next[u.id] = Object.assign({}, STORED[u.id] || {});
  for (const k of Object.keys(STORED)) if (!next[k]) next[k] = STORED[k];
  let added = 0;
  for (const r of out) if (r.stored === undefined) { next[r.unit][r.id] = r.start; added++; }
  // each unit's links in the order its items are stored
  for (const u of Object.keys(next)) { const ids = (content.byUnit[u] || []).map(i => i.id), m = next[u], o = {}; ids.forEach(id => { if (id in m) o[id] = m[id]; }); Object.keys(m).forEach(id => { if (!(id in o)) o[id] = m[id]; }); next[u] = o; }
  if (!src.findLiteral(html, "ITEM_SECTIONS")) { console.error("index.html has no ITEM_SECTIONS constant to write to."); process.exit(1); }
  fs.writeFileSync(index, src.writeConstant(html, "ITEM_SECTIONS", next));
  console.log(`Stored ${added} proposed link(s) for items that had none. Review them (--low), then run node tools/check-content.js.`);
  return;
}
if (flag("--json")) { process.stdout.write(list.map(r => JSON.stringify(r) + "\n").join("")); return; } // one write, so a pipe gets all of it
let cur = null;
for (const r of list) {
  if (r.unit !== cur) { cur = r.unit; console.log(`\n${r.unit} ${content.unitById[r.unit].title}`); }
  const mark = r.stored === undefined ? "" : r.agrees ? "  [stored: same]" : `  [stored: ${r.stored === null ? "unlinked" : r.stored}${r.storedAt ? "" : " (does not resolve)"}]`;
  console.log(`  ${r.id} (${r.type}) ${r.text}\n      → ${r.best + 1}. ${r.heading} (${Math.round(r.conf * 100)}%)` + (r.second >= 0 ? `   2nd: ${r.second + 1}. ${r.secondHeading}` : "") + mark);
}
const lowN = out.filter(r => r.conf < MIN).length;
console.log(`\n${out.length} items in ${units.length} units; ${lowN} with a confidence under ${MIN}; ${out.filter(r => r.stored === undefined).length} without a stored link; ${out.filter(r => r.stored !== undefined && !r.agrees).length} stored differently from the proposal.`);
}
main();
