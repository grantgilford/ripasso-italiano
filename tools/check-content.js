#!/usr/bin/env node
/*
  Content checks for index.html, following docs/italian-app-content-guide.md.

  Usage:  node tools/check-content.js [path/to/index.html] [--verbose]

  Reads the app's built-in content straight out of index.html (nothing is
  changed) and reports in two groups:
    PROBLEMS     break a rule in the guide; fix before republishing.
    WORTH A LOOK may be fine, but a person should check (for example a verb
                 form that differs from the regular pattern, which the guide
                 says to review by hand).
  Exits with code 1 when there are problems, so it can gate a change.
  --verbose prints every finding instead of the first 40 of each kind.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { BOOT_MARK, inlineScripts, loadApp } = require("./lib/load-app");

const args = process.argv.slice(2);
const VERBOSE = args.includes("--verbose");
const file = args.find(a => !a.startsWith("--")) || path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(file, "utf8");

/* ---------- report ---------- */
const found = { problem: {}, look: {} };
const problem = (kind, msg) => (found.problem[kind] = found.problem[kind] || []).push(msg);
const look = (kind, msg) => (found.look[kind] = found.look[kind] || []).push(msg);
const stats = {};
const count = (k, n = 1) => (stats[k] = (stats[k] || 0) + n);

/* ---------- 1. the script parses ---------- */
// One inline script is the app (it holds the boot section). Any other inline script must be a
// small start-up snippet, such as the one in <head> that applies the Appearance setting before
// the first paint; it must parse too.
const scripts = inlineScripts(html);
const appScripts = scripts.filter(s => s.includes(BOOT_MARK));
if (appScripts.length !== 1) problem("Structure", `expected one inline app <script> (the one with the boot section), found ${appScripts.length}`);
for (const s of scripts.filter(s => !s.includes(BOOT_MARK))) {
  if (s.length > 2000) problem("Structure", `an extra inline <script> of ${s.length} characters; only small start-up snippets may sit beside the app script`);
  try { new vm.Script(s, { filename: "index.html start-up <script>" }); }
  catch (e) { console.error("A start-up script does not parse:\n" + e.stack); process.exit(1); }
}
const code = appScripts[0] || "";
try { new vm.Script(code, { filename: "index.html <script>" }); }
catch (e) { console.error("The app's script does not parse:\n" + e.stack); process.exit(1); }
const srcTags = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
for (const s of srcTags) if (!/^https:\/\/cdnjs\.cloudflare\.com\//.test(s)) problem("Structure", `script loaded from outside cdnjs: ${s}`);

/* ---------- 2. load the content (and a few of the app's own helpers) ---------- */
const exportsExpr = "BUILTIN_PACKS, LESSONS, VERB_GYM, VG_TENSES, ID_ALIASES, buildContent, normalize, parseCloze, translationsOf, sectionTarget, getContent: () => content, ITEM_SECTIONS: typeof ITEM_SECTIONS === 'undefined' ? null : ITEM_SECTIONS, VERB_SENTENCES: typeof VERB_SENTENCES === 'undefined' ? null : VERB_SENTENCES, vsFind: typeof vsFind === 'undefined' ? null : vsFind";
const appVersion = (code.match(/const APP_VERSION = "([^"]+)"/) || [])[1];
let app;
try { app = loadApp(exportsExpr, { html }); } // stops with a message if the boot section is missing
catch (e) { console.error("Could not load the app's content:\n" + e.stack); process.exit(1); }
app.buildContent();
const content = app.getContent();
const { LESSONS, VERB_GYM, VG_TENSES, ID_ALIASES, normalize } = app;
const arr = x => Array.isArray(x) ? x : (x == null ? [] : [x]);

const units = content.unitById;
const allItems = app.BUILTIN_PACKS.flatMap(p => (p.items || []).map(it => Object.assign({ pack: p.pack }, it)));
const gramUnits = new Set(Object.values(units).filter(u => !u.mode).map(u => u.id));
const lessonOf = id => (units[id] && units[id].lesson) || LESSONS[id] || null;

/* ---------- 3. ids, units and aliases ---------- */
{
  const seen = {};
  for (const it of allItems) {
    count("items");
    if (seen[it.id]) problem("Ids", `${it.id} is defined twice (${seen[it.id]} and ${it.pack}); the later one silently replaces the earlier`);
    seen[it.id] = it.pack;
    if (!units[it.unit]) problem("Ids", `${it.id}: unit "${it.unit}" does not exist`);
  }
  for (const [oldId, newId] of Object.entries(ID_ALIASES)) {
    count("aliases");
    if (!content.items[newId]) problem("ID_ALIASES", `${oldId} → ${newId}, but ${newId} is not an item (progress would be lost)`);
    if (content.items[oldId]) look("ID_ALIASES", `${oldId} is mapped to ${newId} but is still an item itself`);
    if (ID_ALIASES[newId]) problem("ID_ALIASES", `${oldId} → ${newId} → ${ID_ALIASES[newId]}: aliases must point straight at a live item`);
  }
}

/* ---------- 4. wrong options and their notes ---------- */
// Shorthand the guide names as not good enough, plus anything this terse.
const BARE_NOTE = /^(no|wrong|incorrect|not a (form|word)|reversed|one word|two words)\.?$/i;
const SHORT_WORDS = 3;
function checkNote(where, option, note) {
  if (note == null || !String(note).trim()) { problem("Wrong options without a note", `${where}: “${option}” has no note`); return; }
  const n = String(note).trim();
  if (BARE_NOTE.test(n)) problem("Notes that are only shorthand", `${where}: “${option}” → “${n}”`);
  else if (n.split(/\s+/).length < SHORT_WORDS) look("Very short wrong-option notes", `${where}: “${option}” → “${n}”`);
}
const MAX_CLOZE_SHOWN = 3; // the app shows the answer plus the first three other options

for (const it of allItems) {
  const where = `${it.id} (${it.unit})`;
  if (it.type === "grammar_mc") {
    count("grammar questions");
    if (!it.explanation) problem("Missing explanations", `${where}: grammar question has no explanation`);
    if (!it.options.includes(it.answer)) problem("Answer not among the options", `${where}: “${it.answer}”`);
    const dup = it.options.filter((o, i) => it.options.findIndex(x => x.trim() === o.trim()) !== i);
    if (dup.length) problem("Repeated options", `${where}: ${dup.map(d => "“" + d + "”").join(", ")}`);
    const notes = it.distractorNotes || {};
    for (const o of it.options) if (o !== it.answer) { count("wrong options checked"); checkNote(where, o, notes[o]); }
    for (const k of Object.keys(notes)) if (!it.options.includes(k)) look("Notes for options that no longer exist", `${where}: note for “${k}”`);
  }
  if (it.type === "sentence") {
    count("sentences");
    if (!it.explanation) problem("Missing explanations", `${where}: sentence has no explanation`);
    for (const s of arr(it.it).concat(arr(it.en))) if (/"/.test(s)) problem("Straight quotation marks in sentences", `${where}: ${s}`);
    const cz = it.cloze;
    if (!cz) continue;
    if (!/\{[^}]+\}/.test(cz.text || "")) { problem("Cloze without a blank", where); continue; }
    { // the cloze, filled with its first answer, is one of the sentence's own versions
      const pc = app.parseCloze(cz.text);
      const filled = normalize(pc.parts.map((p, i) => p + (i < pc.blanks.length ? pc.blanks[i][0] : "")).join(""));
      if (!arr(it.it).some(s => normalize(s) === filled)) problem("Clozes that don't match their sentence", `${where}: “${cz.text}” filled in isn't among ${arr(it.it).map(s => "“" + s + "”").join(", ")}`);
    }
    if (!Array.isArray(cz.options)) continue;
    const parsed = app.parseCloze(cz.text);
    const first = parsed.blanks[0].map(normalize);
    const accepted = new Set(app.translationsOf(it).map(s => normalize(s.replace(/\u0001/g, ""))));
    const notes = cz.notes || {};
    cz.options.forEach((o, i) => {
      count("cloze options checked");
      if (first.includes(normalize(o))) problem("Wrong options that are accepted answers", `${where}: cloze option “${o}” is an accepted answer for the blank (the app silently drops it)`);
      else {
        const built = normalize(parsed.parts.map((p, j) => p + (j === 0 ? o : j < parsed.blanks.length ? parsed.blanks[j][0] : "")).join(""));
        if (accepted.has(built)) problem("Wrong options that are accepted answers", `${where}: cloze option “${o}” builds an accepted sentence`);
      }
      checkNote(where, o, notes[o]);
      if (i >= MAX_CLOZE_SHOWN) look("Cloze options never shown", `${where}: “${o}” (the app shows only the first ${MAX_CLOZE_SHOWN})`);
    });
    for (const k of Object.keys(notes)) if (!cz.options.includes(k)) look("Notes for options that no longer exist", `${where}: cloze note for “${k}”`);
  }
  if (it.type === "transform") {
    count("transforms");
    if (!it.explanation) problem("Missing explanations", `${where}: transform has no explanation`);
    if (arr(it.answer).some(a => normalize(a) === normalize(it.it))) problem("Transforms whose answer is the sentence unchanged", `${where}: “${it.it}”`);
    // from 9.16 the answer panel shows what the rewrite means, so every transform carries the English of its first answer
    if (!arr(it.en).length) problem("Transforms without English", `${where}: add "en", the English of “${arr(it.answer)[0]}” (shown after answering)`);
    for (const s of [it.it, ...arr(it.answer), ...arr(it.en)]) if (/"/.test(s)) problem("Straight quotation marks in sentences", `${where}: ${s}`);
  }
  // the exercise types added in v8.6 (docs/exercise-types.md)
  if (["spot", "sort", "match", "reply", "endings"].includes(it.type)) {
    count("v8.6 practice items");
    if (!it.explanation) problem("Missing explanations", `${where}: ${it.type} has no explanation`);
    const texts = it.type === "spot" ? [it.it, ...arr(it.en), ...arr(it.fix)] : it.type === "reply" ? [it.line, it.lineEn || "", ...arr(it.answer), ...arr(it.options)] : it.type === "endings" ? [it.text, ...arr(it.en)] : [];
    for (const s of texts) if (/"/.test(s)) problem("Straight quotation marks in sentences", `${where}: ${s}`);
  }
  if (it.type === "spot") {
    const toks = String(it.it || "").split(/\s+/).filter(Boolean).map(normalize);
    if (!arr(it.en).length) problem("Spot the mistake without English", `${where}: the English meaning is what tells the learner what the sentence should say`);
    if (it.wrong != null) {
      if (toks.filter(t => t === normalize(it.wrong)).length !== 1) problem("Spot the mistake: the wrong word isn't in the sentence once", `${where}: “${it.wrong}” in “${it.it}”`);
      if (!arr(it.fix).length) problem("Spot the mistake: no fix", where);
      for (const f of arr(it.fix)) if (f === it.wrong) problem("Spot the mistake: a fix that is the wrong word", `${where}: “${f}”`);
    }
    for (const k of Object.keys(it.notes || {})) {
      if (!toks.includes(normalize(k))) look("Notes for words not in the sentence", `${where}: note for “${k}”`);
      if (it.wrong != null && normalize(k) === normalize(it.wrong)) look("Notes for words not in the sentence", `${where}: a note for the wrong word itself is never shown (the explanation covers it)`);
    }
  }
  if (it.type === "reply") {
    const acc = new Set(arr(it.answer).map(normalize)), notes = it.notes || {};
    // from 9.16 the answer panel shows what the other person said in English
    if (!it.lineEn || !String(it.lineEn).trim()) problem("Replies without English", `${where}: add "lineEn", the English of “${it.line}” (shown after answering)`);
    if (arr(it.options).length === 1) look("Replies with a single wrong option", `${where}: the multiple choice needs at least two, so it is never shown`);
    for (const o of arr(it.options)) {
      count("wrong options checked");
      if (acc.has(normalize(o))) problem("Wrong options that are accepted answers", `${where}: reply option “${o}” is an accepted answer (the app silently drops it)`);
      checkNote(where, o, notes[o]);
    }
    for (const k of Object.keys(notes)) if (!arr(it.options).includes(k)) look("Notes for options that no longer exist", `${where}: reply note for “${k}”`);
  }
  if (it.type === "sort") {
    const seen = new Set();
    for (const r of arr(it.rows)) {
      count("sort rows checked");
      if (!r.note || r.note.trim().split(/\s+/).length < SHORT_WORDS) problem("Sort rows without a reason", `${where}: “${r.it}” needs a note saying why it belongs to ${r.group}`);
      if (seen.has(normalize(r.it))) problem("Repeated options", `${where}: “${r.it}” appears twice`);
      seen.add(normalize(r.it));
    }
    if (new Set(arr(it.groups)).size !== arr(it.groups).length) problem("Repeated options", `${where}: a group appears twice`);
    if (arr(it.groups).some(g => String(g).length > 14)) look("Sort groups that may not fit a phone", `${where}: keep group labels short (they share one row)`);
  }
  if (it.type === "match") {
    count("match pairs checked", arr(it.pairs).length);
    if (arr(it.pairs).length > 6) look("Match grids that may not fit a phone", `${where}: ${arr(it.pairs).length} pairs (4 or 5 fit best)`);
    if (arr(it.pairs).some(p => p.some(x => String(x).length > 28))) look("Match grids that may not fit a phone", `${where}: a side over 28 characters wraps onto several lines`);
  }
  if (it.type === "endings") {
    const pc = app.parseCloze(it.text || "");
    if (pc.blanks.some(b => b.some(x => !x))) problem("Endings with an empty blank", `${where}: “${it.text}”`);
    if (pc.blanks.length > 4) look("Endings with many blanks", `${where}: ${pc.blanks.length} blanks`);
  }
}

// The same English sentence in two units gets the same accepted Italian, so an answer is never right in one unit and wrong in the other.
// (A leading subject pronoun is ignored: translations accept one added or left out wherever the verb fits.)
{
  const byEn = {};
  for (const it of allItems) if (it.type === "sentence") for (const e of arr(it.en)) (byEn[normalize(e)] = byEn[normalize(e)] || []).push(it);
  for (const [en, list] of Object.entries(byEn)) {
    if (new Set(list.map(i => i.unit)).size < 2) continue;
    const acc = list.map(i => JSON.stringify([...new Set(app.translationsOf(i).map(s => normalize(s.replace(/\u0001/g, "")).replace(/^(io|tu|lui|lei|noi|voi|loro) /, "")))].sort()));
    if (new Set(acc).size > 1) look("Same English sentence, different accepted Italian", `“${en}”: ${list.map(i => `${i.id} (${arr(i.it).join(" / ")})`).join("; ")}`);
  }
}

/* ---------- 5. vocabulary data ---------- */
const REGISTER = /^\((neutral|mild|informal|slang|youth slang|vulgar|regional)(, [^)]+)?\)/;
for (const it of allItems) {
  if (it.type !== "vocab" || !gramUnits.has(it.unit)) continue;
  const where = `${it.id} (${it.unit})`;
  count("grammar-unit words");
  if (it.pos === "noun") {
    const have = ["art", "indef", "plural", "artPl"].filter(k => it[k]);
    if (have.length && have.length < 4) problem("Nouns with some but not all forms", `${where}: has ${have.join(", ")}`);
  }
  if (it.forms && !(Array.isArray(it.forms) && it.forms.length === 4)) problem("Adjective forms not four", where);
  if (it.unit === "u18" && !REGISTER.test(it.note || "")) problem("Unit 18 notes without a register label", `${where}: ${it.it}`);
}

/* ---------- 5b. flashcard packs ---------- */
// Each flashcard pack adds new words: a word (its `it`, case and curly apostrophes aside; accents
// count, so metà and meta are two words) appears in one flashcard card only. pos codes are the
// guide's list, and a verb's first gloss (the English → Italian prompt) starts with "to".
const FC_POS = new Set(["nm", "nf", "v", "adj", "adv", "pron", "prep", "conj", "num", "det", "int", "expr", "np", "vp", "advp"]);
{
  const flashUnits = new Set(Object.values(units).filter(u => u.mode === "flashcards").map(u => u.id));
  const seenWord = {};
  for (const it of allItems) {
    if (!flashUnits.has(it.unit)) continue;
    const where = `${it.id} (${it.unit})`;
    count("flashcard cards");
    if (!String(it.pos || "").split("/").every(p => FC_POS.has(p))) problem("Flashcard pos codes not in the guide", `${where}: “${it.pos}”`);
    if (!arr(it.en).length) problem("Flashcards without English", where);
    for (const w of arr(it.it)) {
      const k = String(w).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
      if (seenWord[k]) problem("Flashcard words repeated across packs", `“${w}” is ${seenWord[k]} and ${where}`);
      else seenWord[k] = where;
    }
    const en0 = String(arr(it.en)[0] || "");
    if (String(it.pos).split("/")[0] === "v" && !/^to /.test(en0)) look("Flashcard verbs whose prompt lacks “to”", `${where}: “${en0}”`);
  }
}

/* ---------- 6. unit notes and the review-unit tags ---------- */
const REVIEW_TAGS = ["Essere & basics", "Nouns & articles", "Present tense", "Irregular verbs", "Verb tenses", "Adjectives", "Possessives", "Numbers", "Adverbs", "Questions", "Prepositions", "Conjunctions", "Subjunctive", "Object pronouns", "Formal & informal", "Time", "Longer sentences"];
for (const u of Object.values(units)) {
  if (u.mode) continue;
  const n = arr(u.notes).length;
  if (!n) problem("Units without notes", u.id);
  else if ((n < 5 || n > 10) && u.id !== "u17") look("Unit notes outside 5–10", `${u.id}: ${n} notes`);
}
for (const it of allItems) {
  if (it.unit !== "u17" || !it.explanation) continue;
  const m = it.explanation.match(/\(([^()]*)\)\s*$/);
  const tags = m ? m[1].split(/\s*[;,]\s*/) : [];
  if (!m || !tags.every(t => REVIEW_TAGS.includes(t))) problem("Unit 17 explanations without unit tags", `${it.id}: ends “${it.explanation.slice(-60)}”`);
}

/* ---------- 7. lessons: links, markup, tables ---------- */
function lessonTexts(L) { // every string in a lesson, with the section it sits in
  const out = [];
  const walk = (x, sec) => { if (typeof x === "string") out.push([sec, x]); else if (Array.isArray(x)) x.forEach(y => walk(y, sec)); else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) if (k !== "it") walk(v, sec); };
  walk(L.intro, 0);
  (L.sections || []).forEach((s, i) => { walk(s.h, i + 1); walk(s.b, i + 1); });
  return out;
}
const sectionCount = id => { const L = lessonOf(id); return L ? (L.sections || []).length + (arr(units[id] && units[id].notes).length ? 1 : 0) : 0; };
for (const uid of Object.keys(units)) {
  const L = lessonOf(uid);
  if (!L) { if (gramUnits.has(uid)) look("Grammar units without a lesson", uid); continue; }
  count("lessons");
  for (const [sec, t] of lessonTexts(L)) {
    const where = `${uid} lesson §${sec}`;
    for (const m of t.matchAll(/\[\[([^\]]*)\]\]/g)) {
      count("lesson links");
      const [target, text] = m[1].split("|");
      const lm = target.match(/^(\w*)(?:#(.+))?$/);
      if (!lm) { problem("Broken lesson links", `${where}: [[${m[1]}]]`); continue; }
      const unit = lm[1] || uid, secRef = lm[2];
      if (!units[unit]) { problem("Broken lesson links", `${where}: unit “${unit}” does not exist in [[${m[1]}]]`); continue; }
      if (secRef == null) continue;
      if (!/^\d+$/.test(secRef)) { problem("Broken lesson links", `${where}: [[${m[1]}]] names a heading; built-in lessons must hold section numbers`); continue; }
      const n = Number(secRef), max = sectionCount(unit);
      if (!lessonOf(unit)) problem("Broken lesson links", `${where}: [[${m[1]}]] points into ${unit}, which has no lesson`);
      else if (n < 1 || n > max) problem("Broken lesson links", `${where}: [[${m[1]}]] but ${unit} has ${max} sections`);
      const said = (text || "").match(/\bsection (\d+)\b/i);
      if (said && Number(said[1]) !== n) problem("Link text names the wrong section", `${where}: “${text}” points to section ${n}`);
    }
    const bare = t.replace(/\[\[[^\]]*\]\]/g, "");
    if (/\[\[|\]\]/.test(bare)) problem("Stray markup in lessons", `${where}: unmatched [[ or ]] in “${bare.slice(0, 80)}”`);
    const singles = bare.replace(/\*\*/g, "").match(/\*/g);
    if (singles && singles.length % 2) problem("Stray markup in lessons", `${where}: odd number of * in “${bare.slice(0, 80)}…”`);
    if (/\*\*\*/.test(bare)) look("Bold ending with italic", `${where}: “${bare.match(/.{0,30}\*\*\*.{0,10}/)[0]}”`);
  }
  (L.sections || []).forEach((s, i) => (s.b || []).forEach(b => {
    if (b && b.table) {
      count("lesson tables");
      const w = Math.max(arr(b.head).length, ...b.table.map(r => r.length));
      if (w > 5) problem("Tables wider than a label column plus four", `${uid} lesson §${i + 1}: ${w} columns`);
    }
  }));
}

/* ---------- 7b. the lesson section that teaches each item (ITEM_SECTIONS) ---------- */
// Every item of a unit with a lesson names the section that teaches it, by a unique start of its heading (another unit's
// as "u13#Where the pronouns"), or is listed with null, unlinked on purpose. tools/link-sections.js proposes links.
{
  const links = app.ITEM_SECTIONS;
  const plainH = (h) => String(h).replace(/\[\[[^\]|]*\|?([^\]]*)\]\]/g, "$1").replace(/\*+/g, "").trim();
  if (!links || typeof links !== "object") problem("Item links", "no const ITEM_SECTIONS = {…}; after LESSONS");
  else {
    for (const [uid, map] of Object.entries(links)) {
      if (!units[uid]) { problem("Item links", `ITEM_SECTIONS has a line for “${uid}”, which is not a unit`); continue; }
      if (!lessonOf(uid)) problem("Item links", `ITEM_SECTIONS has a line for ${uid}, which has no lesson`);
      for (const [id, link] of Object.entries(map || {})) {
        if (!content.items[id]) { problem("Item links", `${uid}: ${id} is not an item (removed or renamed? drop its link)`); continue; }
        if (content.items[id].unit !== uid) problem("Item links", `${id} is listed under ${uid} but belongs to ${content.items[id].unit}`);
        if (link === null) { count("items left unlinked"); continue; }
        count("item links");
        if (typeof link !== "string" || !link.trim()) { problem("Item links", `${id}: ${JSON.stringify(link)} is not a heading (or null)`); continue; }
        if (/^(\w+#)?\d+$/.test(link)) { problem("Item links", `${id}: “${link}” is a section number; name the section by the start of its heading`); continue; }
        if (app.sectionTarget(uid, link)) continue;
        const m = link.match(/^(?:(\w+)#)?(.+)$/), tu = m[1] || uid;
        if (m[1] && !units[tu]) { problem("Item links", `${id}: “${link}” names unit ${tu}, which does not exist`); continue; }
        const L = lessonOf(tu), hits = L ? (L.sections || []).filter(x => plainH(x.h).startsWith(m[2])).length : 0;
        problem("Item links", `${id}: “${link}” ${!L ? `points into ${tu}, which has no lesson` : hits ? `starts ${hits} headings in ${tu}; give more of the heading` : `starts no heading in ${tu}`}`);
      }
    }
    for (const u of Object.values(units)) {
      if (u.mode || !lessonOf(u.id)) continue;
      const map = links[u.id] || {};
      for (const it of content.byUnit[u.id] || []) if (!Object.prototype.hasOwnProperty.call(map, it.id)) problem("Items without a lesson link", `${it.id} (${u.id}): link it to the section that teaches it in ITEM_SECTIONS (node tools/link-sections.js ${u.id} --missing proposes one), or list it with null`);
    }
  }
  for (const it of allItems) if (it.section !== undefined) problem("Item links", `${it.id}: a built-in item keeps its link in ITEM_SECTIONS, not in a "section" field`);
}

/* ---------- 8. British spelling ---------- */
// Common American spellings. Only the first gloss of a word must be British
// (later glosses may add the American word), so later glosses aren't checked.
const AMERICAN = /\b(colou?r(?<!colour)(s|ed|ful)?|favor(ite|ites|s|ed)?|honor(s|ed)?|neighbor(s|hood)?|behavior|labor|flavor|humor|center(s|ed)?|theater(s)?|gray|traveler|traveling|traveled|canceled|canceling|jewelry|program(?!m)|catalog|dialog|apartment(s)?|elevator|sidewalk|vacation(s)?|cell ?phone|parking lot|zip code|faucet|garbage|trash can|realiz(e|ed|es|ing)|organiz(e|ed|es|ing)|recogniz(e|ed|es|ing)|apologiz(e|ed|es|ing)|practicing|license|defense|offense|mom)\b/i;
const AMERICAN_OK = /\b(program(me)?s? (in|on) (a )?computer|computer program)\b/i;
function british(where, s) {
  const m = String(s).match(AMERICAN);
  if (m && !AMERICAN_OK.test(s)) look("Possible American spellings", `${where}: “${m[0]}” in “${String(s).slice(0, 90)}”`);
}
for (const it of allItems) {
  const where = `${it.id} (${it.unit})`;
  if (arr(it.en).length) british(where + " first gloss", arr(it.en)[0]);
  for (const k of ["explanation", "note", "prompt", "task", "cue", "lineEn"]) if (it[k]) british(where, it[k]);
  for (const v of Object.values(it.distractorNotes || {})) british(where, v);
  for (const v of Object.values((it.cloze && it.cloze.notes) || {})) british(where, v);
  if (["spot", "reply"].includes(it.type)) for (const v of Object.values(it.notes || {})) british(where, v);
  for (const r of arr(it.rows)) british(where, r.note || "");
  if (it.type === "match" && it.right === "en") for (const p of arr(it.pairs)) british(where, p[1]);
}
for (const u of Object.values(units)) arr(u.notes).forEach(n => british(`${u.id} notes`, n));
for (const uid of Object.keys(units)) { const L = lessonOf(uid); if (L) for (const [sec, t] of lessonTexts(L)) british(`${uid} lesson §${sec}`, t.replace(/\*[^*]+\*/g, "")); }

/* ---------- 9. verb forms ---------- */
const P6 = ["io", "tu", "lui/lei", "noi", "voi", "loro"];
const vg = {}; for (const v of VERB_GYM) vg[v.it] = v;
const vgForms = (v, tense) => v.f[VG_TENSES.indexOf(tense)];
const AUX_PP = { a: ["ho", "hai", "ha", "abbiamo", "avete", "hanno"], e: ["sono", "sei", "è", "siamo", "siete", "sono"] };
// The auxiliary of each compound tense: the passato prossimo takes the present, the trapassato prossimo the imperfetto.
const AUX_OF = { passato_prossimo: AUX_PP, trapassato_prossimo: { a: ["avevo", "avevi", "aveva", "avevamo", "avevate", "avevano"], e: ["ero", "eri", "era", "eravamo", "eravate", "erano"] } };

// Pronominal verbs (alzarsi, metterci, andarsene, farcela) put pronouns in front of each form;
// strip them to check the verb itself: "mi alzo" → "alzo", "se n'è andato" → "è andato".
const PRONOMINAL = /^(.*r)(si|ci|ne|la|sene|sela|cela|cene)$/;
const baseInf = inf => { const m = inf.match(PRONOMINAL); return m ? m[1] + "e" : inf; };
const isPron = inf => PRONOMINAL.test(inf);
const strip = (f, pron) => pron ? String(f).replace(/^(?:(?:mi|ti|si|ci|vi|me|te|se|ce|ve) )?(?:(?:la|lo|li|le|ne) |[lnmtscv]')?/, "") : String(f);
// "andato/a" is one form with an agreement variant; "va'/vai" are two forms.
const variants = f => String(f).split("/").filter((part, i) => i === 0 || !/^[aeio]$/.test(part));

// Regular endings, by conjugation.
const END = {
  are: { presente: ["o", "i", "a", "iamo", "ate", "ano"], imperfetto: ["avo", "avi", "ava", "avamo", "avate", "avano"], futuro: ["erò", "erai", "erà", "eremo", "erete", "eranno"], condizionale: ["erei", "eresti", "erebbe", "eremmo", "ereste", "erebbero"] },
  ere: { presente: ["o", "i", "e", "iamo", "ete", "ono"], imperfetto: ["evo", "evi", "eva", "evamo", "evate", "evano"], futuro: ["erò", "erai", "erà", "eremo", "erete", "eranno"], condizionale: ["erei", "eresti", "erebbe", "eremmo", "ereste", "erebbero"] },
  ire: { presente: ["o", "i", "e", "iamo", "ite", "ono"], imperfetto: ["ivo", "ivi", "iva", "ivamo", "ivate", "ivano"], futuro: ["irò", "irai", "irà", "iremo", "irete", "iranno"], condizionale: ["irei", "iresti", "irebbe", "iremmo", "ireste", "irebbero"] },
};
END.isc = Object.assign({}, END.ire, { presente: ["isco", "isci", "isce", "iamo", "ite", "iscono"] });
// Stem + ending with the -are spelling rules: -care/-gare keep the hard sound (cerchi),
// -ciare/-giare drop the i before e or i (mangi, mangerò), and other -iare verbs drop it before
// i unless it is stressed (studi, but invii), so both are accepted there.
function join(stem, end, isAre) {
  if (!isAre) return [stem + end];
  if (/[cg]$/.test(stem) && /^[ei]/.test(end)) return [stem + "h" + end];
  if (/[cg]i$/.test(stem) && /^[ei]/.test(end)) return [stem.slice(0, -1) + end];
  if (/i$/.test(stem) && /^i/.test(end)) return end === "iamo" ? [stem.slice(0, -1) + end] : [stem.slice(0, -1) + end, stem + end];
  return [stem + end];
}
function regular(inf, conj, tense) {
  const e = END[conj] && END[conj][tense];
  return e ? e.map(x => join(inf.slice(0, -3), x, conj === "are")) : null;
}
const conjOfGroup = { "-are": "are", "-ere": "ere", "-ire": "ire", "-ire (-isc-)": "isc" };
const conjOfFam = { are: "are", cg: "are", iare: "are", ere: "ere", erepp: "ere", ire: "ire", irepp: "ire", isc: "isc" };
// Correct forms the regular pattern doesn't produce, checked by hand.
const REVIEWED = {
  sciare: "keeps its stressed i: scii, scierò",
  cucire: "keeps the i so the c stays soft: cucio, cuciono",
  sedere: "e becomes ie in the stressed forms (siedo, mi siedo); future siederò or sederò",
};

function compareRegular(where, inf, conj, tense, forms, note = "") {
  const base = baseInf(inf);
  const exp = regular(base, conj, tense);
  if (!exp) return;
  if (REVIEWED[base]) { count("forms of hand-reviewed verbs skipped"); return; }
  const diffs = [];
  forms.forEach((f, p) => {
    if (f === "—") return;
    count("forms checked against the regular rules");
    const got = variants(f).map(x => strip(x, isPron(inf)));
    if (got.some(g => exp[p].includes(g))) return;
    // A shortened future (vedere → vedrò, condizionale vedrei) keeps the -ere label, as in the
    // Verbs section, as long as the verb's note says so.
    if (conj === "ere" && /^(futuro|condizionale)$/.test(tense) && got.includes(base.slice(0, -3) + exp[p][0].slice(base.length - 2)) && /futur/i.test(note)) { count("shortened futures named in the note"); return; }
    diffs.push(`${P6[p]} “${f}” (pattern: ${exp[p][0]})`);
  });
  if (diffs.length) look("Verb forms that differ from the regular pattern", `${where}, labelled regular ${conj === "isc" ? "-ire (-isc-)" : "-" + conj}, ${tense.replace("_", " ")}: ${diffs.join("; ")}`);
}
// Compound tenses: the auxiliary fits the person, and the participle is the same in all six,
// agreeing where the auxiliary is essere.
function checkCompound(where, inf, forms, tense, pp, aux) {
  const AUX = AUX_OF[tense];
  forms.forEach((f, p) => {
    if (f === "—") return;
    count("compound forms checked");
    const bare = strip(f, isPron(inf));
    const sp = bare.indexOf(" ");
    const a = bare.slice(0, sp), part = bare.slice(sp + 1);
    if (![AUX.a[p], AUX.e[p]].includes(a) || (aux && a !== AUX[aux][p])) { problem("Compound tenses with the wrong auxiliary", `${where} ${tense} ${P6[p]}: “${f}”`); return; }
    if (!pp) return;
    const root = pp.slice(0, -1), sing = p < 3;
    const ok = a === AUX.a[p] ? [pp] : sing ? [root + "o/a", root + "o", root + "a"] : [root + "i/e", root + "i", root + "e"];
    if (!ok.includes(part)) problem("Compound tenses with the wrong participle", `${where} ${tense} ${P6[p]}: “${f}” (participle ${pp})`);
  });
}

// (a) The Verbs section itself: regular families follow the rules; compound tenses are well formed.
for (const v of VERB_GYM) {
  const where = `Verbs section: ${v.it}`;
  VG_TENSES.forEach((t, i) => {
    // only the imperativo may be missing: verbs whose commands aren't used in practice (potere, piacere) have none
    if (!v.f[i]) { if (t === "imperativo") count("Verbs section verbs without commands"); else problem("Verbs section gaps", `${where}: no ${t}`); return; }
    if (v.f[i].length !== 6) problem("Verb tables without six forms", `${where} ${t}`);
    if (t === "passato_prossimo") checkCompound(where, v.it, v.f[i], t, v.pp, v.aux);
    else if (conjOfFam[v.fam]) compareRegular(where, v.it, conjOfFam[v.fam], t, v.f[i]);
  });
}

// (a1) The Verbs section's English: the From English drill shows a verb's first gloss and accepts every verb
// that lists it, so verbs sharing a first gloss must be true synonyms. Pairs checked by hand:
const SAME_FIRST_GLOSS = new Set(["buttare/lanciare", "capire/comprendere", "chiedere/domandare", "cominciare/iniziare", "credere/ritenere",
  "cucinare/cuocere", "dimenticare/dimenticarsi", "mandare/inviare", "notare/accorgersi", "restituire/rendere", "ricordare/ricordarsi",
  "spostare/muovere", "stare/restare/rimanere"]);
{
  const byGloss = {};
  for (const v of VERB_GYM) {
    const en0 = String(arr(v.en)[0] || "");
    if (!/^to /.test(en0)) problem("Verbs section glosses", `${v.it}: the first gloss “${en0}” should start with “to” (it is the From English prompt)`);
    (byGloss[en0.toLowerCase()] = byGloss[en0.toLowerCase()] || []).push(v.it);
    // a verb flagged as taking both auxiliaries is skipped by the essere-or-avere question, so its note must say when each is used
    if (v.both && !(/essere/.test(v.note || "") && /avere/.test(v.note || ""))) problem("Verbs section glosses", `${v.it}: takes both auxiliaries, but its note doesn't say when essere and when avere`);
  }
  for (const [g, list] of Object.entries(byGloss)) if (list.length > 1 && !SAME_FIRST_GLOSS.has(list.join("/"))) look("Verbs sharing a first gloss (From English accepts both)", `“${g}”: ${list.join(", ")}; if they aren't true synonyms, add a bracket to one gloss, otherwise add them to SAME_FIRST_GLOSS`);
}

// (a2) Reflexive verbs, and compound verbs labelled -ere or -ire: the verb inside the pronouns
// follows the rules of its conjugation too (an -ire verb may take -isc-, as its io form shows).
for (const v of VERB_GYM) {
  const comp = v.fam === "comp" && conjOfGroup[v.group];
  if (v.fam !== "refl" && !comp) continue;
  const base = baseInf(v.it);
  const io = strip(v.f[0][0], isPron(v.it));
  const conj = comp ? conjOfGroup[v.group] : /are$/.test(base) ? "are" : /ere$/.test(base) ? "ere" : /isco$/.test(io) ? "isc" : "ire";
  VG_TENSES.forEach((t, i) => { if (t !== "passato_prossimo" && v.f[i]) compareRegular(`Verbs section: ${v.it}`, v.it, conj, t, v.f[i], v.note); });
}

// (b) The units: agree with the Verbs section, follow the rules, and the derived tenses
// (subjunctive, imperative, progressive) follow from the verb's other forms.
const CONG_PRES_IRR = ["sia", "abbia", "sappia", "dia", "stia", "debba", "vada", "faccia", "rifaccia"];
const IRR_SUBJ = new Set(CONG_PRES_IRR.concat(CONG_PRES_IRR.map(x => x + "no")));
const IMPER_TU_IRR = ["sii", "abbi", "sappi", "di'", "va'", "fa'", "da'", "sta'", "vai", "fai", "dai", "stai", "rifai"];
const IMPER_VOI_IRR = ["siate", "abbiate", "sappiate"];
const CONG_IMPF_IRR = { essere: "fo", dare: "de", stare: "ste" };
// Commands of pronominal verbs other than reflexives, checked by hand: the pronouns join the end of
// tu, noi and voi (va' + te + ne → vattene) and go before Lei and Loro.
const PRON_COMMANDS = { andarsene: "—, vattene, se ne vada, andiamocene, andatevene, se ne vadano" };
const STARE = { presente_progressivo: ["sto", "stai", "sta", "stiamo", "state", "stanno"], passato_progressivo: ["stavo", "stavi", "stava", "stavamo", "stavate", "stavano"] };
const CONG_AUX = { ho: "abbia", hai: "abbia", ha: "abbia", abbiamo: "abbiamo", avete: "abbiate", hanno: "abbiano", sono: null, sei: "sia", "è": "sia", siamo: "siamo", siete: "siate" };

// Present subjunctive from the present: the io stem + -i (regular -are verbs) or -a (all others),
// noi as in the present, voi from noi, loro from the singular.
function congPresRule(presB, areLike) {
  const io = presB[0].replace(/o$/, ""), noi = presB[3];
  const sing = areLike ? join(io, "i", true) : [io + "a"];
  return [sing, sing, sing, [noi], [noi.replace(/iamo$/, "iate")], sing.map(s => s + "no")];
}

// The Verbs section's commands and subjunctives go through the same checks as the units' (vgCheck marks
// them, so they are not compared with themselves). Their group follows the family: -are families take the
// -are rules, the irregular families (irr, comp, contr, pron, aux) take the -a subjunctive.
const VG_DERIVED = ["imperativo", "congiuntivo_presente", "congiuntivo_imperfetto"];
const vgCheckItems = VERB_GYM.map(v => {
  const forms = {};
  for (const t of VG_DERIVED) if (vgForms(v, t)) forms[t] = vgForms(v, t);
  const group = ["are", "cg", "iare"].includes(v.fam) ? "-are" : conjOfFam[v.fam] || v.fam === "refl" ? undefined : "irregular";
  return { id: `Verbs section: ${v.it}`, unit: "vb", it: v.it, group, forms, vgCheck: true };
});
for (const it of allItems.filter(i => i.type === "verb").concat(vgCheckItems)) {
  const where = it.vgCheck ? it.id : `${it.id} (${it.unit})`;
  const ref = vg[it.it], pron = isPron(it.it), base = baseInf(it.it);
  const tenses = it.forms || {};
  const conj = conjOfGroup[it.group] || (ref && conjOfFam[ref.fam]) || null;
  const areLike = conj === "are" || (!conj && it.group !== "irregular" && /are$/.test(base));
  const pres = tenses.presente || (ref && vgForms(ref, "presente"));
  const presB = pres && pres.map(f => strip(variants(f)[0], pron));
  const impf = tenses.imperfetto || (ref && vgForms(ref, "imperfetto"));
  const pp = tenses.passato_prossimo || (ref && vgForms(ref, "passato_prossimo"));
  const cpRule = presB && congPresRule(presB, areLike);
  count("unit verbs");
  for (const [t, forms] of Object.entries(tenses)) {
    if (!Array.isArray(forms) || forms.length !== 6) { problem("Verb tables without six forms", `${where} ${t}`); continue; }
    if (ref && VG_TENSES.includes(t) && !it.vgCheck) {
      if (!vgForms(ref, t)) { problem("Verb forms that disagree with the Verbs section", `${where} ${t}: the unit has this tense, the Verbs section has none`); continue; }
      vgForms(ref, t).forEach((g, p) => {
        count("forms shared with the Verbs section");
        if (forms[p] !== g) problem("Verb forms that disagree with the Verbs section", `${where} ${t} ${P6[p]}: unit has “${forms[p]}”, Verbs section has “${g}”`);
      });
    }
    if (conjOfGroup[it.group] || /^(reflexive|-rsi)$/.test(it.group)) { if (conj) compareRegular(where, it.it, conj, t, forms, it.note); }
    if (AUX_OF[t]) checkCompound(where, it.it, forms, t, ref && ref.pp, ref && ref.aux);
    if (t === "congiuntivo_presente" && cpRule && REVIEWED[base]) count("forms of hand-reviewed verbs skipped");
    else if (t === "congiuntivo_presente" && cpRule) {
      forms.forEach((f, p) => {
        if (f === "—") return;
        count("subjunctive forms checked");
        const g = variants(f).map(x => strip(x, pron));
        if (g.some(x => cpRule[p].includes(x))) return;
        if (g.some(x => IRR_SUBJ.has(x))) { count("irregular subjunctive forms (reviewed by hand, per the guide)"); return; }
        look("Subjunctive forms that differ from the rule", `${where} presente ${P6[p]}: “${f}”, the rule gives “${cpRule[p][0]}”`);
      });
    }
    if (t === "congiuntivo_imperfetto" && impf) {
      const stem = CONG_IMPF_IRR[it.it] || strip(impf[0], pron).replace(/vo$/, "");
      const exp = ["ssi", "ssi", "sse", "ssimo", "ste", "ssero"].map(e => stem + e);
      forms.forEach((f, p) => {
        if (f === "—") return;
        count("subjunctive forms checked");
        if (!variants(f).map(x => strip(x, pron)).includes(exp[p])) look("Subjunctive forms that differ from the rule", `${where} imperfetto ${P6[p]}: “${f}”, the rule gives “${exp[p]}”`);
      });
    }
    if (t === "congiuntivo_passato" && pp) {
      forms.forEach((f, p) => {
        if (f === "—") return;
        count("subjunctive forms checked");
        const src = String(pp[p]);
        const aux = src.split(" ").find(w => w in CONG_AUX);
        const exp = src.replace(new RegExp("(^| )" + aux + "(?= )"), "$1" + (aux === "sono" ? (p === 0 ? "sia" : "siano") : CONG_AUX[aux]));
        if (f !== exp) look("Subjunctive forms that differ from the rule", `${where} passato ${P6[p]}: “${f}”, the rule gives “${exp}”`);
      });
    }
    // Imperative: tu from the present (-are verbs: the lui form; others: the tu form), Lei and
    // loro from the present subjunctive, noi and voi as in the present. A reflexive pronoun is
    // joined to the end of tu, noi and voi, and goes before Lei and loro.
    if (t === "imperativo" && !presB) look("Imperatives with nothing to check against", `${where}: no present tense here or in the Verbs section, so “${forms.slice(1).join(", ")}” went unchecked`);
    if (t === "imperativo" && PRON_COMMANDS[it.it]) {
      if (forms.join(", ") === PRON_COMMANDS[it.it]) count("pronominal commands checked by hand");
      else problem("Imperative forms that differ from the rule", `${where}: “${forms.join(", ")}”, checked by hand as “${PRON_COMMANDS[it.it]}”`);
    } else if (t === "imperativo" && presB) {
      const cp = tenses.congiuntivo_presente ? tenses.congiuntivo_presente.map(f => strip(variants(f)[0], pron)) : null;
      const refl = /si$/.test(it.it);
      const lei = cp ? [cp[2]] : cpRule[2], loro = cp ? [cp[5]] : cpRule[5];
      const raw = [[], [/are$/.test(base) ? presB[2] : presB[1]], lei, [presB[3]], [presB[4]], loro];
      const exp = raw.map((list, p) => list.map(b => !refl ? b : p === 1 ? b + "ti" : p === 3 ? b + "ci" : p === 4 ? b + "vi" : "si " + b));
      forms.forEach((f, p) => {
        if (p === 0) { if (f !== "—") problem("Imperatives with an io form", `${where}: “${f}”`); return; }
        if (f === "—") return;
        count("imperative forms checked");
        const g = variants(f).map(x => x.trim());
        if (g.some(x => exp[p].includes(x))) return;
        const bare = g.map(x => (refl ? x.replace(/(ti|ci|vi)$/, "").replace(/^si /, "") : x));
        if ((p === 1 && bare.some(x => IMPER_TU_IRR.includes(x))) || (p === 4 && bare.some(x => IMPER_VOI_IRR.includes(x))) || ((p === 2 || p === 5) && bare.some(x => IRR_SUBJ.has(x)))) { count("irregular imperative forms (reviewed by hand, per the guide)"); return; }
        look("Imperative forms that differ from the rule", `${where} ${P6[p]}: “${f}”, the rule gives “${exp[p][0]}”`);
      });
    }
    if (STARE[t]) {
      const ger = strip(forms[0], pron).split(" ").slice(1).join(" ");
      forms.forEach((f, p) => {
        count("progressive forms checked");
        const want = STARE[t][p] + " " + ger;
        if (strip(f, pron) !== want) problem("Progressive forms that don't match stare + gerund", `${where} ${t} ${P6[p]}: “${f}”, expected “${want}”`);
      });
      if (!/(ando|endo)$/.test(ger)) look("Progressive forms with an unusual gerund", `${where} ${t}: “${ger}”`);
    }
  }
}

/* ---------- 9b. the Verbs section's example sentences (VERB_SENTENCES) ---------- */
// Each verb's sentences, [tense, person, Italian, English, clue, also], as the content guide sets out (The Verbs section):
// one per tense the verb has, the form for that tense and person in the Italian as whole words in a row (the app's own
// vsFind, so the drills blank exactly what is checked here), the clue in the Italian, 4 to 9 words, British English, and
// no sentence twice or copied from a grammar unit. Rare words go to the look list: the ranks come from
// tools/pack-levels.js, and the words below, everyday ones the frequency list ranks low, have been reviewed.
if (app.VERB_SENTENCES) {
  const VS = app.VERB_SENTENCES, T8 = VG_TENSES.map(t => t.replace(/_/g, " ")), words = s => String(s).split(/\s+/).filter(Boolean);
  const { rankOf } = require("./pack-levels");
  const EVERYDAY = new Set(("signora signore subito figli figlie torta telegiornale lotteria cameriere camerieri professoressa trecento pulsante yoga puntuali puntuale cenare ceniamo raccomando timido pescare freschissimo"
    + " dubito stanchissima cartolina cartoline modulo ombrello sedici astronauta cornetto nuotare glielo grammatica morbido piova pizzeria zaino").split(" "));
  const STOP = new Set("il lo la i gli le l' un uno una un' di a da in con su per tra fra e o che non si mi ti ci vi ne me te ce ve se del della dei delle dello degli al alla ai alle allo agli dal dalla dai dalle nel nella nei nelle sul sulla sui è ad ed".split(" "));
  const formOf = new Map(); for (const v of VERB_GYM) for (const t of v.f) for (const f of t || []) for (const w of words(f.replace(/\/\S+$/, ""))) if (!formOf.has(normalize(w))) formOf.set(normalize(w), v.it);
  const rank = w => Math.min(...[w, w.replace(/i$/, "o"), w.replace(/i$/, "io"), w.replace(/e$/, "a"), w.replace(/i$/, "e"), w.replace(/a$/, "o"), w.replace(/essa$/, "e"), w.replace(/issim([oaie])$/, "$1"), w.replace(/^\p{L}+'/u, ""), w.replace(/([aei])ss(i|e|imo|ero)$/, "$1re")].map(x => rankOf(x)).concat(formOf.has(w) ? [rankOf(formOf.get(w))] : []));
  const NAMES = new Set("Anna Marco Luca Sara Giulia Paolo Chiara Elena Marta Davide Matteo Francesca Giorgio Laura Roberto Luigi Maria Giovanni Silvia Andrea Federica Simone Alessandro Valentina Stefano".split(" "));
  const SUBJ = /(^|\s)(che|se|magari|come se|nel caso|benché|sebbene|purché|affinché|perché|prima che|a meno che|senza che|qualunque|qualsiasi|chiunque|ovunque|dovunque)(\s|$)/i;
  const known = new Map(); // a sentence (normalised) → where it first is
  for (const it of allItems) {
    if (units[it.unit] && (units[it.unit].mode === "flashcards" || units[it.unit].mode === "verbs")) continue;
    for (const s of arr(it.it).concat(it.type === "transform" || it.type === "reply" ? arr(it.answer) : [], it.line ? [it.line] : [])) if (typeof s === "string") known.set(normalize(s), `${it.id} (a grammar-unit sentence)`);
  }
  let without = [];
  for (const v of VERB_GYM) if (!VS[v.it]) without.push(v.it);
  for (const [inf, list] of Object.entries(VS)) {
    const v = vg[inf];
    if (!v) { problem("Verb sentences", `“${inf}” is not a verb in VERB_GYM`); continue; }
    if (!Array.isArray(list)) { problem("Verb sentences", `${inf}: its value must be a list of sentences`); continue; }
    const has = new Set(), persons = new Set();
    list.forEach((s, k) => {
      count("verb sentences checked");
      const [t, p, itx, en, clue, also] = Array.isArray(s) ? s : [];
      const where = `${inf} sentence ${k + 1}`;
      if (!Array.isArray(s) || s.length < 5 || s.length > 6 || typeof itx !== "string" || typeof clue !== "string") { problem("Verb sentences", `${where}: write it as [tense, person, Italian, English, clue] or [tense, person, Italian, English, clue, also]`); return; }
      if (!Number.isInteger(t) || t < 0 || t > 7) { problem("Verb sentences", `${where}: tense ${JSON.stringify(t)} is not 0–7`); return; }
      const tl = T8[t], tag = `${inf} ${tl}, ${t === 5 ? ["—", "tu", "Lei", "noi", "voi", "Loro"][p] : P6[p]}: “${itx}”`;
      if (!v.f[t]) { problem("Verb sentences", `${tag}: ${inf} has no ${tl}`); return; }
      if (!Number.isInteger(p) || p < 0 || p > 5 || !v.f[t][p] || v.f[t][p] === "—") { problem("Verb sentences", `${tag}: person ${JSON.stringify(p)} has no form in the ${tl}`); return; }
      has.add(t); persons.add(p);
      const item = content.items["vg-" + inf + "-" + VG_TENSES[t]];
      const hit = item && app.vsFind(item, p, itx);
      if (!hit) problem("Verb sentences: the form isn't in the sentence", `${tag}: needs “${v.f[t][p]}”${v.alts && v.alts[VG_TENSES[t]] && v.alts[VG_TENSES[t]][p] ? " or “" + v.alts[VG_TENSES[t]][p] + "”" : ""} as whole words in a row (no word between the auxiliary and the participle)`);
      if (typeof en !== "string" || !en.trim()) problem("Verb sentences", `${tag}: no English`);
      else { const m = en.match(AMERICAN); if (m && !AMERICAN_OK.test(en)) problem("Verb sentences: American spelling", `${tag}: “${m[0]}” in “${en}”`); }
      for (const x of [itx, en || ""]) if (/"/.test(x)) problem("Straight quotation marks in sentences", `${where}: ${x}`);
      const toks = words(itx).map(normalize);
      for (const part of clue.split("…").map(x => x.trim()).filter(Boolean)) {
        const cw = words(part).map(normalize);
        if (!toks.some((_, i) => cw.every((w, j) => toks[i + j] === w))) problem("Verb sentences: the clue isn't in the sentence", `${tag}: clue “${part}”`);
      }
      if (also !== undefined) {
        if (!Array.isArray(also) || !also.length) problem("Verb sentences", `${tag}: also must be a list of tense numbers (leave it out when there are none)`);
        else for (const a of also) if (a === t || !Number.isInteger(a) || !v.f[a]) problem("Verb sentences: also", `${tag}: also names ${a === t ? "the sentence's own tense" : Number.isInteger(a) && a >= 0 && a <= 7 ? "the " + T8[a] + ", which " + inf + " lacks" : JSON.stringify(a)}`);
      }
      const n = words(itx).length;
      if (n > 9) problem("Verb sentences over 9 words", `${tag} (${n} words)`);
      if (n < 4) look("Verb sentences under 4 words", tag);
      const key = normalize(itx);
      if (known.has(key)) problem("Verb sentences repeated", `${tag} is also ${known.get(key)}`);
      else known.set(key, `${inf} sentence ${k + 1}`);
      if (t === 5 && hit && hit.at > 0 && toks[hit.at - 1] === "non") problem("Verb sentences: negative commands", `${tag}: a negative tu command is non + the infinitive; write an affirmative command`);
      if (t >= 6 && hit && !SUBJ.test(words(itx).slice(0, hit.at).join(" "))) look("Verb sentences: a subjunctive without che or a conjunction before it", tag);
      const formW = new Set(hit ? words(hit.variant).map(normalize) : []);
      words(itx).forEach((w0, wi) => {
        const w = normalize(w0); if (!w || formW.has(w) || STOP.has(w) || EVERYDAY.has(w.replace(/^\p{L}+'(?=\p{L})/u, "")) || (wi > 0 && /^\p{Lu}/u.test(w0)) || NAMES.has(w0.replace(/[^\p{L}]/gu, ""))) return; // names aside
        const r = rank(w); if (r > 5000) look("Verb sentences: rare words", `${tag}: “${w}” (rank ${r >= 19000 ? "beyond 19,000" : r})`);
      });
    });
    const need = v.f.map((x, i) => x ? i : -1).filter(i => i >= 0 && !has.has(i));
    if (need.length) problem("Verb sentences: tenses without a sentence", `${inf}: no sentence for the ${need.map(i => T8[i]).join(", ")}`);
    if (persons.size < 4) look("Verb sentences: few persons", `${inf}: only ${[...persons].map(p => P6[p]).join(", ")}`);
  }
  count("verbs with sentences", Object.keys(VS).length);
  if (without.length) look("Verbs without sentences yet", `${without.length} of ${VERB_GYM.length}, from ${without[0]} to ${without[without.length - 1]} (in VERB_GYM order)`);
}

/* ---------- 10. release notes: CHANGES and CHANGELOG.md ---------- */
// Every version says what changed twice: in CHANGES beside APP_VERSION, shown once on Today as What's new (so one or two
// plain sentences), and in its line at the top of CHANGELOG.md (newest first).
{
  const changes = (code.match(/^const CHANGES = ("(?:[^"\\]|\\.)*");/m) || [])[1];
  if (changes == null) problem("Release notes", "no const CHANGES = \"…\"; beside APP_VERSION (What's new on Today)");
  else {
    const text = String(vm.runInNewContext(changes)).trim();
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    if (!text) problem("Release notes", "CHANGES is empty: say in a sentence or two what this version changes");
    else if (sentences > 2 || text.length > 280) problem("Release notes", `CHANGES should be one or two plain sentences (it has ${sentences} sentences, ${text.length} characters)`);
    if (/[<>]/.test(text)) problem("Release notes", "CHANGES is plain text, without HTML");
  }
  const logFile = [path.join(path.dirname(file), "CHANGELOG.md"), path.join(__dirname, "..", "CHANGELOG.md")].find(f => fs.existsSync(f));
  const versions = logFile ? [...fs.readFileSync(logFile, "utf8").matchAll(/^- \*\*([^*]+)\*\*/gm)].map(m => m[1]) : [];
  if (!logFile) problem("Release notes", "no CHANGELOG.md beside index.html");
  else if (versions[0] !== appVersion) problem("Release notes", `the newest line in CHANGELOG.md is for ${versions[0] || "no version"}, not ${appVersion}: add this version's line at the top`);
  else if (new Set(versions).size !== versions.length) problem("Release notes", "CHANGELOG.md has two lines for the same version");
}

/* ---------- 11. layout: one entry per line ---------- */
// The content constants are laid out one unit, item, note, lesson section, verb and alias per line
// (tools/format-content.js), so a pull request shows a change as the lines it changes, and
// add-items and edit-items, which write that layout, change only the lines they mean to.
try {
  const layout = require("./lib/content-source");
  for (const name of layout.contentNames(html)) {
    if (layout.findLiteral(html, name).text !== layout.formatConstant(name, layout.parseLiteral(html, name))) problem("Layout", `${name} is not laid out one entry per line: run node tools/format-content.js`);
  }
} catch (e) { problem("Layout", e.message); }

/* ---------- report ---------- */
const LIMIT = 40;
function printGroup(title, group) {
  const kinds = Object.keys(group);
  const total = kinds.reduce((n, k) => n + group[k].length, 0);
  console.log(`\n${title}: ${total}`);
  for (const k of kinds.sort()) {
    console.log(`\n  ${k} (${group[k].length})`);
    const list = VERBOSE ? group[k] : group[k].slice(0, LIMIT);
    for (const m of list) console.log("    - " + m);
    if (list.length < group[k].length) console.log(`    … and ${group[k].length - list.length} more (run with --verbose to see all)`);
  }
  return total;
}
console.log(`Content check for ${path.relative(process.cwd(), file) || file} (app version ${appVersion || "?"})`);
console.log("Checked: " + Object.entries(stats).map(([k, v]) => `${v} ${k}`).join(", "));
const nProblems = printGroup("PROBLEMS", found.problem);
printGroup("WORTH A LOOK", found.look);
console.log(nProblems ? `\n${nProblems} problem(s) found.` : "\nNo problems found.");
process.exit(nProblems ? 1 : 0);
