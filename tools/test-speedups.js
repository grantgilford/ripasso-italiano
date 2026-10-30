#!/usr/bin/env node
/*
  The speed-ups test: checks that what the app keeps ready to be quick (from version 9.3) gives exactly
  what the plain code gave.

  Usage:  node tools/test-speedups.js [path/to/index.html] [--headed]

  Opens the real app in a headless browser (Playwright + Chromium) and compares, in the page, the app's
  quick paths with the plain code they replaced, copied below as it was in version 9.2 (REFERENCE):

    1. Search: 30 sample queries through Look up (the items it lists, in order, the lesson sections, and
       the results drawn), a unit's glossary filter (five units, one of them 1,000 cards) and the Verbs
       filter, against searching every field afresh as 9.2 did.
    2. The Verbs reference: no tables drawn until a row is opened; every row, once opened, the same as
       9.2 drew it (from 9.20 with each tense's example sentences under its table); a filter's rows drawn open, the same as 9.2's.
    3. Counts: with about 6,600 records saved (tools/lib/seed.js), every count Today, Units, Stats and You
       show, from the cache, against 9.2's functions: when loaded, through the next 25 moments when time
       alone changes one (the cache kept just before each and worked out again at it), a day, a week and
       two months on, and after an answer, an undo, a setting, a sync merge, a backup loaded and a
       reset; and the numbers drawn on those screens.
    4. Word lists and indexes built in idle time (the words the typo rule knows, the English glosses
       altWords uses, and from 9.6 each item's lesson section and each section's items) against building
       them at once (the sections by a plain reading of ITEM_SECTIONS and the headings); kept when the
       content is built again unchanged, built again when a pack changes it (with the links its own
       items name).
    5. Start-up: progress already saved in order isn't written again; progress tidied while loading is.
    6. The sync merge (from 9.4): adoptRemote, which merges record by record in place, against 9.3's, which
       merged into a new copy (mergeProgress, as it was then) and built the content again: the same progress
       and the same answer to "did anything change", for the echo of this device's own writes, another
       device's practice, older and newer copies, records under an old id, a reset elsewhere, the flags and
       a current unit that isn't a unit of the course.

  Time stands still while counts are compared (Date.now is fixed), so both sides see the same moment.
  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
const path = require("path");
const { loadPlaywright, serveApp, checks } = require("./lib/browser");
const { seedProgress } = require("./lib/seed");

const args = process.argv.slice(2);
const HEADED = args.includes("--headed");
const file = path.resolve(args.find(a => !a.startsWith("--")) || path.join(__dirname, "..", "index.html"));
const { chromium } = loadPlaywright();
const results = checks(), { check, section } = results;
const ready = "typeof content !== 'undefined' && content && typeof S !== 'undefined' && S.screen === 'home'";

// 30 queries: Italian and English, with and without accents, plurals and verb forms, numbers, phrases with spaces,
// apostrophes, capitals and punctuation, a single letter (filters only), very common short strings and a miss.
const QUERIES = ["casa", "ca", "cas", "andare", "andrò", "andro", "uomini", "whose", "88", "the", "to go", "a casa", "perché", "perche",
  "c'è", "l'acqua", "Buongiorno!", "  Mi  PIACE ", "sono", "gli", "-isc", "ventuno", "time", "a", "è", "xyzzy", "dove sei", "parlato", "di", "fatto"];

/* ---------- the plain code, as it was in 9.2 (installed in the page as window.REF) ---------- */
function REFERENCE() {
  const R = window.REF = {};
  // Look up (renderLookup and lessonSearch): every field of every item and every lesson section normalised on each search
  R.lookupHits = (f) => {
    const score = (i) => { const fs = itemFields(i).map(normalize); if (fs.some(x => x === f)) return 0; if (fs.some(x => x.split(" ").includes(f))) return 1; if (fs.some(x => x.startsWith(f))) return 2; return fs.some(x => x.includes(f)) ? 3 : 9; };
    return Object.values(content.items).map(i => [score(i), i]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || (isFlashUnit(a[1].unit) ? 1 : 0) - (isFlashUnit(b[1].unit) ? 1 : 0)).slice(0, 40).map(x => x[1]);
  };
  R.lessonSearch = (f) => {
    const key = (x) => deaccent(normalize(plainText(x))), q = deaccent(f), out = [];
    for (const u of content.units) {
      const L = lessonOf(u); if (!L) continue;
      (L.sections || []).forEach((s, i) => {
        const hit = [s.h].concat((s.b || []).flatMap(lessonStrings)).find(x => key(x).includes(q));
        if (hit) out.push({ u, i, h: s.h, text: plainText(hit).replace(/\n~?/g, " · ") });
      });
    }
    return out;
  };
  R.lessonHitsHtml = (f, nItems) => {
    const lh = f.length >= 3 ? R.lessonSearch(f) : [];
    if (!lh.length) return nItems ? "" : `<p class="muted">No matches.</p>`;
    return groupHtml("In the lessons", `<div class="hits">` + lh.slice(0, 8).map(x => `<div class="card hit"><div class="unit">${esc(x.u.title)}</div><a href="#" class="xref" data-ref="${esc(x.u.id)}" data-tab="lesson" data-jump="${x.i}">${x.i + 1}. ${esc(plainText(x.h))}</a><div class="small muted">${esc(snippetAround(x.text, deaccent(f)))}</div></div>`).join("") + `</div>` + (lh.length > 8 ? `<p class="small muted">Showing the first 8 of ${lh.length} lesson sections.</p>` : ""));
  };
  R.lookupResultsHtml = (q) => {
    const f = normalize(q || "");
    const hits = f.length >= 2 ? R.lookupHits(f) : [];
    return f.length < 2 ? "" : (hits.length ? `<div class="hits">` + hits.map(i => `<div class="card hit"><div class="unit">${esc((content.unitById[i.unit] || {}).title || i.unit)}</div>${rowHtml(i)}</div>`).join("") + `</div>` + (hits.length === 40 ? `<p class="small muted">Showing the first 40 matches.</p>` : "") : "") + R.lessonHitsHtml(f, hits.length);
  };
  // a unit's glossary filter and the Verbs filter
  R.glossary = (unitId, f) => (content.byUnit[unitId] || []).filter(i => !f || itemFields(i).some(x => normalize(x).includes(f)));
  R.verbs = (f) => VERB_GYM.filter(v => !f || [v.it, arr(v.en).join(" "), v.f.flat().join(" ")].some(x => normalize(x).includes(f)));
  // the Verbs reference's list, every row with its tables (renderVerbReference)
  R.verbRow = (v, open) => {
    const items = VG_TENSES.map(t => content.items[vgId(v.it, t)]).filter(Boolean);
    const summ = items.map(i => `${TENSE_LABEL[i.tense]} ${vgStatus(i)}`).join(" · ");
    return `<details class="vref"${open ? " open" : ""}><summary><span class="it">${esc(v.it)}</span> <span class="muted">${esc(arr(v.en).join(", "))}</span><div class="small muted">${esc(summ)}</div></summary>`
      + items.map(i => `<div class="small muted" style="margin-top:8px">${esc(TENSE_LABEL[i.tense])} · ${esc(vgStatus(i))}</div>` + vgTableHtml(i, i.tense) + verbSentences(i).map(x => vsHtml(x, "vs-in")).join("")).join("") // from 9.20, each tense's example sentences under its table
      + (v.note ? `<div class="small muted" style="margin-top:6px">${esc(v.note)}</div>` : "") + `</details>`;
  };
  R.verbListHtml = (f) => {
    const famOrder = Object.keys(VERB_FAMILIES);
    const sorted = R.verbs(f).slice().sort((a, b) => famOrder.indexOf(a.fam) - famOrder.indexOf(b.fam) || a.it.localeCompare(b.it));
    let h = "", fam = null, rows = "";
    const flush = () => { if (fam !== null) h += groupHtml(esc(VERB_FAMILIES[fam][0]), `<p class="small muted">${esc(VERB_FAMILIES[fam][1])}</p><div class="card rows">${rows}</div>`); rows = ""; };
    for (const v of sorted) { if (v.fam !== fam) { flush(); fam = v.fam; } rows += R.verbRow(v, f); }
    flush();
    if (!sorted.length) h += `<p class="muted">No verbs match.</p>`;
    return h;
  };
  // the counts on Today (renderHome), Units (renderUnits, unitRow), Stats (renderStats) and You (learnedCount)
  R.counts = () => {
    const t = now(), unit = {};
    for (const u of content.units) {
      const items = content.byUnit[u.id] || [];
      const learned = items.filter(i => rec(i.id).box >= 5).length, started = items.filter(i => rec(i.id).box >= 1).length;
      unit[u.id] = { total: items.length, learned, started, pct: items.length ? Math.round(100 * learned / items.length) : 0, due: dueIds(u.id).length, fresh: newIds(u.id).length };
    }
    const all = Object.values(content.items).filter(i => isBuiltinPack(i.pack)), vi = content.byUnit.vb || [];
    const ids = Object.keys(progress.items).filter(id => content.items[id]);
    return {
      unit, due: dueIds().length, mistakes: Object.keys(progress.items).filter(id => isRecentMistake(id)).length,
      coursePct: all.length ? Math.round(100 * all.filter(i => rec(i.id).box >= 5).length / all.length) : 0,
      verbs: { verbs: new Set(vi.filter(i => rec(i.id).box >= 1).map(i => i.it)).size, totalVerbs: VERB_GYM.length, learned: vi.filter(i => rec(i.id).box >= 5).length, total: vi.length, due: dueIds("vb").length, fresh: verbNewIds().length },
      flashDue: flashDueIds().length, flashNew: flashNewIds().length,
      learned: Object.keys(progress.items).filter(id => content.items[id] && rec(id).box >= 5).length,
      started: ids.filter(id => rec(id).box >= 1).length,
      dueToday: ids.filter(id => rec(id).box >= 1 && rec(id).due <= t + 864e5).length,
      dueWeek: ids.filter(id => rec(id).box >= 1 && rec(id).due <= t + 7 * 864e5).length,
      items: new Set(Object.keys(content.items).map(pid)).size,
      lapsed: ids.map(id => [id, rec(id).lapses]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10),
      anyLapses: Object.keys(progress.items).some(id => content.items[id] && progress.items[id].lapses >= 1),
    };
  };
  // the sync merge as 9.3 did it (adoptRemote): mergeProgress, as it was then, into a new copy, changed if that differs,
  // then what buildContent did to progress: records moved to the id that holds them, and the current unit checked
  R.mergeProgress = (a, b) => {
    const out = defaultProgress();
    a = a || {}; b = b || {};
    const ai = a.items || {}, bi = b.items || {};
    for (const id of new Set([...Object.keys(ai), ...Object.keys(bi)])) { const ra = ai[id], rb = bi[id]; out.items[id] = !ra ? rb : !rb ? ra : ((rb.lastSeen || 0) > (ra.lastSeen || 0) ? rb : ra); }
    const ad = a.days || {}, bd = b.days || {};
    for (const d of new Set([...Object.keys(ad), ...Object.keys(bd)])) {
      const da = ad[d] || {}, db = bd[d] || {};
      out.days[d] = { xp: Math.max(da.xp || 0, db.xp || 0), new: Math.max(da.new || 0, db.new || 0) };
      if (da.cards || db.cards) out.days[d].cards = Math.max(da.cards || 0, db.cards || 0);
      const ta = da.t || {}, tb = db.t || {}; const keys = new Set([...Object.keys(ta), ...Object.keys(tb)]);
      if (keys.size) { out.days[d].t = {}; for (const k of keys) { const x = ta[k] || [0, 0], y = tb[k] || [0, 0]; out.days[d].t[k] = x[1] >= y[1] ? x.slice() : y.slice(); } }
    }
    const synKeys = new Set([...Object.keys(a.synonyms || {}), ...Object.keys(b.synonyms || {})]);
    if (synKeys.size) { out.synonyms = {}; for (const k of synKeys) out.synonyms[k] = [...new Set([...(a.synonyms && a.synonyms[k] || []), ...(b.synonyms && b.synonyms[k] || [])])]; }
    const af = a.flags || {}, bf = b.flags || {};
    for (const k of new Set([...Object.keys(af), ...Object.keys(bf)])) { const x = af[k], y = bf[k]; out.flags[k] = !x ? y : !y ? x : ((y.updatedAt || 0) > (x.updatedAt || 0) ? y : x); }
    const newerSettings = (b.settingsUpdatedAt || 0) > (a.settingsUpdatedAt || 0) ? b : a;
    out.settings = cleanSettings(newerSettings.settings || (newerSettings === a ? b.settings : a.settings));
    out.settingsUpdatedAt = newerSettings.settingsUpdatedAt || 0;
    const newer = (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
    out.currentUnit = newer.currentUnit || a.currentUnit || b.currentUnit || null;
    out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
    const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
    if (resetAt) { out.resetAt = resetAt; for (const id of Object.keys(out.items)) if ((out.items[id].lastSeen || 0) < resetAt) delete out.items[id]; }
    return out;
  };
  R.adopt = (p, remote) => {
    const m = R.mergeProgress(p, remote), changed = canon(m) !== canon(p);
    if (!changed) return { p, changed };
    for (const id of Object.keys(m.items)) { const k = pid(id); if (k !== id) { m.items[k] = mergeRec(m.items[k], m.items[id]); delete m.items[id]; } }
    const u = content.unitById[m.currentUnit];
    if (!m.currentUnit || !u || u.mode === "flashcards" || u.mode === "verbs") { const f = content.units.find(x => x.mode !== "flashcards" && x.mode !== "verbs"); m.currentUnit = f ? f.id : null; }
    return { p: m, changed };
  };
  R.diff = (a, b, at = "") => { // the first place two values differ
    if (JSON.stringify(a) === JSON.stringify(b)) return "";
    if (a && b && typeof a === "object" && typeof b === "object") for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = R.diff(a[k], b[k], at + "." + k); if (d) return d; }
    return `${at || "progress"}: 9.3 gives ${JSON.stringify(a)}, now ${JSON.stringify(b)}`;
  };
  // the app's counts, in the same shape
  R.cached = () => {
    const c = counts();
    return { unit: Object.fromEntries(content.units.map(u => [u.id, unitCounts(u.id)])), due: c.due, mistakes: c.mistakes, coursePct: c.coursePct, verbs: c.verbs,
      flashDue: c.flashDue, flashNew: c.flashNew, learned: c.learned, started: c.started, dueToday: c.dueToday, dueWeek: c.dueWeek, items: c.items, lapsed: c.lapsed, anyLapses: c.anyLapses };
  };
  R.sameCounts = () => { const a = JSON.stringify(R.counts()), b = JSON.stringify(R.cached()); return a === b ? "" : R.firstDiff(JSON.parse(a), JSON.parse(b)); };
  R.firstDiff = (a, b, at = "") => {
    if (JSON.stringify(a) === JSON.stringify(b)) return "";
    if (a && b && typeof a === "object" && typeof b === "object") for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = R.firstDiff(a[k], b[k], at + "." + k); if (d) return d; }
    return `${at || "counts"}: 9.2 gives ${JSON.stringify(a)}, the cache ${JSON.stringify(b)}`;
  };
  // the word lists (knownWords) and altWords' index (glossIndex), built at once as 9.2 did
  R.knownWords = () => {
    const it = new Set(), en = new Set();
    const addIt = (s) => normalize(String(s).replace(/\([^)]*\)/g, " ").replace(/(\p{L}+)\/(\p{L}{1,2})(?=[^\p{L}]|$)/gu, (m, w, e) => w + " " + w.slice(0, -e.length) + e)).split(" ").forEach(w => { if (w) { it.add(w); it.add(deaccent(w)); } });
    for (const x of Object.values(content.items)) {
      if (x.type !== "grammar_mc") {
        const own = x.type === "spot" ? [spotAnswer(x), x.fix] : x.type === "endings" ? [endingsFull(x)]
          : [x.it, x.answer, x.alt, x.plural, x.cloze && x.cloze.text, x.line, arr(x.rows).map(r => r.say || r.it), arr(x.pairs).map(p => x.right === "en" ? p[0] : p)];
        own.flat(2).forEach(v => arr(v).forEach(addIt));
        if (x.forms) (Array.isArray(x.forms) ? [x.forms] : Object.values(x.forms)).forEach(fs => arr(fs).forEach(addIt));
      }
      arr(x.en).forEach(e => enForms(String(e)).forEach(f => f.split(" ").forEach(w => { if (w) en.add(w); })));
    }
    for (const v of VERB_GYM) { addIt(v.it); (v.f || []).forEach(t => arr(t).forEach(addIt)); }
    return { it, en };
  };
  R.glossIndex = () => {
    const index = {};
    for (const it of Object.values(content.items)) {
      if (it.type !== "vocab") continue;
      const scope = content.unitById[it.unit] && content.unitById[it.unit].mode === "flashcards" ? "fc" : "gr";
      for (const e of arr(it.en)) { const g = scope + "|" + normEn(e); (index[g] = index[g] || []).push(it); }
    }
    return index;
  };
  R.sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  R.sameIndex = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k, n) => k === kb[n] && a[k].map(i => i.id).join() === b[k].map(i => i.id).join()); };
}

async function openApp(browser, origin, { seed = false, init = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", e => page.errors.push(String(e)));
  page.on("dialog", d => d.accept());
  await page.goto(origin + "/index.html");
  await page.waitForFunction(ready);
  if (seed) { await page.evaluate(seedProgress); await page.reload(); await page.waitForFunction(ready); }
  await page.evaluate(REFERENCE);
  return { page, context };
}

(async () => {
  const server = await serveApp(file);
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    console.log(`Speed-ups test for ${path.relative(process.cwd(), file) || file}`);

    /* 1. Search */
    section("1. Search: Look up, a unit's glossary filter and the Verbs filter, 30 queries");
    {
      const { page, context } = await openApp(browser, origin, { seed: true });
      const units = await page.evaluate(() => ["u01", "u02", content.units.find(u => /^Verb tenses/.test(u.title)).id, content.units.find(u => u.title === "Vocab pack 1").id, content.units.find(u => /Possessives/.test(u.title)).id]);
      const out = await page.evaluate(({ queries, units }) => {
        const bad = { look: [], lessons: [], html: [], gloss: [], verbs: [] }, sizes = [];
        for (const q of queries) {
          const f = normalize(q);
          if (f.length >= 2) {
            const a = REF.lookupHits(f).map(i => i.id), b = lookupHits(f).map(i => i.id);
            if (a.join() !== b.join()) bad.look.push(`"${q}": 9.2 lists ${a.slice(0, 6).join(", ")}…, now ${b.slice(0, 6).join(", ")}…`);
            S.lookup = q;
            if (lookupResultsHtml() !== REF.lookupResultsHtml(q)) bad.html.push(`"${q}"`);
            sizes.push(a.length);
          }
          if (f.length >= 3) {
            const key = (x) => JSON.stringify(x.map(h => [h.u.id, h.i, h.h, h.text]));
            if (key(REF.lessonSearch(f)) !== key(lessonSearch(f))) bad.lessons.push(`"${q}"`);
          }
          for (const u of units) { const a = REF.glossary(u, f).map(i => i.id).join(), b = filterItems(u, f).map(i => i.id).join(); if (a !== b) bad.gloss.push(`"${q}" in ${u}`); }
          if (REF.verbs(f).map(v => v.it).join() !== filterVerbs(f).map(v => v.it).join()) bad.verbs.push(`"${q}"`);
        }
        S.lookup = "";
        return { bad, sizes };
      }, { queries: QUERIES, units });
      check(`Look up lists the same items in the same order for all ${QUERIES.length} queries (${out.sizes.filter(n => n === 40).length} of them fill all 40 places)`, !out.bad.look.length, out.bad.look.join("\n"));
      check("Look up finds the same lesson sections, with the same snippets", !out.bad.lessons.length, out.bad.lessons.join(", "));
      check("Look up draws the same results, item for item and section for section", !out.bad.html.length, out.bad.html.join(", "));
      check(`a unit's glossary filter leaves the same items, in ${units.join(", ")}`, !out.bad.gloss.length, out.bad.gloss.slice(0, 8).join(", "));
      check("the Verbs filter leaves the same verbs", !out.bad.verbs.length, out.bad.verbs.join(", "));
      // typing: only the results are drawn again, after a pause, and the box keeps its text, cursor and focus
      await page.evaluate(() => { S.screen = "lookup"; S.lookup = ""; render(); });
      await page.focus("#lookupBox");
      const box = await page.$("#lookupBox");
      await page.evaluate(() => { window.__redraws = 0; new MutationObserver(() => window.__redraws++).observe(document.getElementById("lookupResults"), { childList: true }); });
      await page.keyboard.type("cas");
      await page.waitForTimeout(400);
      const early = await page.evaluate("__redraws");
      await page.keyboard.type("a");
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, value: document.getElementById("lookupBox").value, at: document.getElementById("lookupBox").selectionStart, hits: document.querySelectorAll("#lookupResults .card.hit").length, html: document.getElementById("lookupResults").innerHTML }));
      const sameBox = await page.evaluate(b => b === document.getElementById("lookupBox"), box);
      const want = await page.evaluate(() => { const d = document.createElement("div"); d.innerHTML = REF.lookupResultsHtml("casa"); nbHyphens(d); return d.innerHTML; });
      check("Look up: typing keeps the same search box, with its text, cursor and focus", sameBox && after.focus === "lookupBox" && after.value === "casa" && after.at === 4, JSON.stringify({ sameBox, focus: after.focus, value: after.value, at: after.at }));
      check("Look up: the results are drawn once typing pauses (once for three letters typed quickly), and are those for the whole word", early === 1 && after.hits > 0 && after.html === want, `${early} redraws for "cas", ${after.hits} hits for "casa"`);
      check("Search: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }

    /* 2. The Verbs reference */
    section("2. The Verbs reference: tables drawn when a row is opened");
    {
      const { page, context } = await openApp(browser, origin, { seed: true });
      await page.evaluate(() => { S.screen = "reference"; S.refUnit = "vb"; S.refFilter = ""; render(); });
      const closed = await page.evaluate(() => ({ rows: document.querySelectorAll("details.vref").length, open: document.querySelectorAll("details.vref[open]").length, tables: document.querySelectorAll("details.vref .conjtable").length, verbs: VERB_GYM.length }));
      check(`the list has a row for each of the ${closed.verbs} verbs, closed, with no tables drawn`, closed.rows === closed.verbs && !closed.open && !closed.tables, JSON.stringify(closed));
      await page.evaluate(() => document.querySelectorAll("details.vref").forEach(d => { d.open = true; }));
      await page.waitForTimeout(500);
      const rows = await page.evaluate(() => {
        const bad = [];
        for (const d of document.querySelectorAll("details.vref")) {
          const v = VERB_GYM.find(x => x.it === d.dataset.verb), t = document.createElement("template");
          t.innerHTML = REF.verbRow(v, true); nbHyphens(t.content);
          if (d.innerHTML !== t.content.firstElementChild.innerHTML) bad.push(v.it);
        }
        return { bad, tables: document.querySelectorAll("details.vref .conjtable").length };
      });
      check(`every row, once opened, shows what 9.2 drew (${rows.tables} tables)`, !rows.bad.length && rows.tables > 0, rows.bad.slice(0, 10).join(", "));
      await page.evaluate(() => { document.querySelector("details.vref").open = false; document.querySelector("details.vref").open = true; });
      await page.waitForTimeout(100);
      check("closing and opening a row again leaves one set of tables", await page.evaluate(() => { const d = document.querySelector("details.vref"), t = document.createElement("template"); t.innerHTML = REF.verbRow(VERB_GYM.find(x => x.it === d.dataset.verb), true); nbHyphens(t.content); return d.innerHTML === t.content.firstElementChild.innerHTML; }));
      const filtered = await page.evaluate((qs) => qs.filter(q => { S.refFilter = q; const d = document.createElement("div"), e = document.createElement("div"); d.innerHTML = verbListHtml().replace(/ data-verb="[^"]*"/g, ""); e.innerHTML = REF.verbListHtml(normalize(q)); return d.innerHTML !== e.innerHTML; }), ["andare", "essere", "to go", "isc", "fatto", "xyzzy"]);
      await page.evaluate(() => { S.refFilter = ""; });
      check("a filter's rows come open with their tables, as 9.2 drew them (6 filters)", !filtered.length, filtered.join(", "));
      await page.evaluate(() => { S.refFilter = ""; render(); });
      await page.fill("#refFilter", "andare");
      await page.waitForTimeout(400);
      const typed = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, open: document.querySelectorAll("#refResults details.vref[open]").length, rows: document.querySelectorAll("#refResults details.vref").length, tables: document.querySelectorAll("#refResults .conjtable").length }));
      check("typing in the Verbs filter keeps the focus and shows the matching rows open, drawn", typed.focus === "refFilter" && typed.rows > 0 && typed.open === typed.rows && typed.tables > 0, JSON.stringify(typed));
      check("the Verbs reference: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }

    /* 3. Counts */
    section("3. Counts on Today, Units, Stats and You, with about 6,600 records saved");
    {
      const { page, context } = await openApp(browser, origin, { seed: true });
      await page.evaluate(() => { window.__t0 = window.__t = Date.now(); Date.now = () => window.__t; });
      const same = async (what) => { const d = await page.evaluate(() => REF.sameCounts()); check(`the same counts ${what}`, !d, d); };
      await same("when loaded");
      // through the next 25 moments when time alone changes a count
      const steps = await page.evaluate(() => {
        const bad = [];
        counts();
        for (let k = 0; k < 25; k++) {
          const c = COUNTS, until = c.until;
          if (!(until < Infinity)) { bad.push(`no moment of change after step ${k}`); break; }
          window.__t = until - 1;
          const d1 = REF.sameCounts(); if (d1) bad.push(`1 ms before change ${k + 1}: ${d1}`);
          if (COUNTS !== c) bad.push(`the cache was worked out again before change ${k + 1}`);
          window.__t = until;
          const d2 = REF.sameCounts(); if (d2) bad.push(`at change ${k + 1}: ${d2}`);
          if (COUNTS === c) bad.push(`the cache was kept past change ${k + 1}`);
        }
        return { bad };
      });
      check("the same counts through the next 25 moments time changes one: the cache is kept until each moment and worked out again at it", !steps.bad.length, steps.bad.slice(0, 5).join("\n"));
      // midnight is one of those moments, whatever the time of day the test runs at (from 9.11)
      const night = await page.evaluate(() => {
        const keep = window.__t, d = new Date(keep), m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
        window.__t = m - 6e4; const c = counts(), r = { untilByMidnight: c.until <= m };
        window.__t = m; r.renewed = counts() !== c; r.diff = REF.sameCounts();
        window.__t = keep;
        return r;
      });
      check("a minute before midnight the cache lasts no later than midnight, and at midnight it is worked out again, the same counts", night.untilByMidnight && night.renewed && !night.diff, JSON.stringify(night));
      for (const [label, days] of [["a day later", 1], ["a week and a day later", 8], ["two months later", 60]]) {
        await page.evaluate((d) => { window.__t += d * 864e5; }, days);
        await same(label);
      }
      await page.evaluate(() => { window.__t = window.__t0; }); // back to when the progress was saved
      // after an answer, an undo, a setting, a sync merge, a backup and a reset
      await page.evaluate(() => { window.__res = applyResult(dueIds()[0], true, "production", false, "recall"); });
      await same("after a right answer");
      await page.evaluate(() => { window.__id2 = flashNewIds()[0]; window.__res2 = applyResult(window.__id2, false, "production", false, "flashcard"); });
      await same("after a wrong answer on a new card");
      await page.evaluate(() => { undoResult(window.__id2, window.__res2); });
      await same("after an undo");
      await page.evaluate(() => { S.screen = "settings"; render(); const sel = document.querySelector('[data-set="verbUnlockBox"]'); sel.value = "3"; sel.dispatchEvent(new Event("change")); });
      await same("after a setting that opens verb tenses sooner");
      await page.evaluate(() => {
        const remote = JSON.parse(JSON.stringify(progress)); let k = 0;
        for (const id of Object.keys(remote.items)) { if (k++ % 40) continue; const r = remote.items[id]; r.lastSeen = Date.now(); r.box = Math.min(7, r.box + 2); r.due = Date.now() + 3 * 864e5; }
        remote.updatedAt = Date.now(); S.screen = "home"; adoptRemote(remote);
      });
      await same("after a sync merge");
      await page.evaluate(() => {
        const backup = JSON.parse(JSON.stringify(progress)); const id = Object.keys(content.items).find(i => !progress.items[pid(i)] && !isSideUnit(content.items[i].unit));
        backup.items[pid(id)] = { box: 2, due: Date.now() - 1000, lapses: 2, lastSeen: Date.now(), lastWrong: Date.now() - 5000, seenCount: 3, lastRight: 0 };
        S.screen = "data"; render(); document.getElementById("progressText").value = JSON.stringify(backup); action("importProgress");
      });
      await same("after a backup is loaded");
      // the screens show the cached numbers
      const shown = await page.evaluate(() => {
        const r = REF.counts(), text = (s) => { S.screen = s; render(); return app.textContent.replace(/\s+/g, " "); };
        const out = [];
        const today = text("home");
        if (!today.includes(`${r.due} due`) || !today.includes(`${r.mistakes} to fix`) || !today.includes(`${r.verbs.due} due · ${r.verbs.fresh} new`) || !today.includes(`${r.flashDue} due · ${r.flashNew} new`)) out.push("Today's tiles: " + today.slice(0, 300));
        const u = r.unit[progress.currentUnit];
        if (!today.includes(`${u.pct}% learned`) || !(today.includes(`${u.fresh} new · ${u.due} to review`) || (!u.fresh && !u.due))) out.push("Today's Continue card");
        const units = text("units");
        if (!units.includes(`${r.coursePct}% of the course learned`)) out.push("Units' course figure");
        const stats = text("stats");
        if (!stats.includes(`Due today${r.dueToday}`) || !stats.includes(`Due this week${r.dueWeek}`) || !stats.includes(`Items started${r.started} of ${r.items}`)) out.push("Stats: " + stats.slice(0, 400));
        const you = text("you");
        if (!you.includes(`${fmtN(r.learned)}items learned`)) out.push("You's items learned: " + you.slice(0, 200));
        S.screen = "home"; render();
        return out;
      });
      check("Today, Units, Stats and You show those numbers", !shown.length, shown.join("\n"));
      await page.evaluate(() => { S.screen = "data"; render(); action("reset"); });
      await same("after a reset");
      check("counts: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }

    /* 4. Word lists and indexes */
    section("4. Word lists and indexes built in idle time");
    {
      const { page, context } = await openApp(browser, origin);
      await page.waitForFunction("KNOWN_WORDS && GLOSS && SECTIONS", null, { timeout: 60000 });
      // each item's lesson section, read plainly: its link (ITEM_SECTIONS, or an imported item's own "section") against every heading
      await page.evaluate(() => {
        REF.sections = () => {
          const strip = (h) => String(h).replace(/\[\[[^\]|]*\|?([^\]]*)\]\]/g, "$1").replace(/\*+/g, "").trim(), of = [], items = {};
          for (const u of content.units) for (const it of content.byUnit[u.id] || []) {
            const link = typeof it.section === "string" ? it.section : (ITEM_SECTIONS[u.id] || {})[it.id];
            if (typeof link !== "string") continue;
            const m = link.match(/^(?:(\w+)#)?(.+)$/), tu = m[1] || u.id, L = content.unitById[tu] && (content.unitById[tu].lesson || LESSONS[tu]);
            const hits = L ? L.sections.map((x, i) => strip(x.h).startsWith(m[2]) ? i : -1).filter(i => i >= 0) : [];
            if (hits.length !== 1) continue;
            of.push(it.id + "→" + tu + "#" + hits[0]); (items[tu + "#" + hits[0]] = items[tu + "#" + hits[0]] || []).push(it.id);
          }
          return { of: of.sort().join(), items: JSON.stringify(Object.keys(items).sort().map(k => [k, items[k]])) };
        };
        REF.sameSections = () => { const x = sections(), r = REF.sections(); return [...x.of].map(([id, at]) => id + "→" + at.unit + "#" + at.index).sort().join() === r.of && JSON.stringify([...x.items.keys()].sort().map(k => [k, x.items.get(k)])) === r.items; };
      });
      check(`each item's lesson section, worked out in idle time, is the one read plainly (${await page.evaluate("SECTIONS.of.size")} items)`, await page.evaluate(() => REF.sameSections() && SECTIONS.of.size > 4000));
      const built = await page.evaluate(() => { const k = REF.knownWords(); return { it: REF.sameSet(KNOWN_WORDS.it, k.it), en: REF.sameSet(KNOWN_WORDS.en, k.en), gloss: REF.sameIndex(content.glossIndex, REF.glossIndex()), n: KNOWN_WORDS.it.size + KNOWN_WORDS.en.size }; });
      check(`the word lists built in idle time are those built at once (${built.n} words)`, built.it && built.en, JSON.stringify(built));
      check("altWords' index of English glosses, built in idle time, is the one built at once", built.gloss);
      const again = await page.evaluate(() => {
        for (const i of Object.values(content.items)) { tuHint(i); if (TU_FORMS) break; }
        lookupHits("casa"); const k = KNOWN_WORDS, g = GLOSS, tu = TU_FORMS, sc = SECTIONS, had = !!SEARCH;
        buildContent();
        return { kept: !!(k && g && tu && sc) && KNOWN_WORDS === k && GLOSS === g && TU_FORMS === tu && SECTIONS === sc, search: had && SEARCH === null };
      });
      check("building the content again unchanged keeps them (as when the packs are read from the cloud again)", again.kept, JSON.stringify(again));
      check("…and drops the search index", again.search);
      const cold = await page.evaluate(() => { KNOWN_WORDS = null; GLOSS = null; SECTIONS = null; const k = REF.knownWords(); return REF.sameSet(knownWords(), k.it) && REF.sameSet(knownWords(true), k.en) && REF.sameIndex(content.glossIndex, REF.glossIndex()) && REF.sameSections(); });
      check("needed before idle time comes, they are built at once, the same", cold);
      await page.evaluate(() => {
        S.screen = "data"; S.packsOpen = true; render();
        document.getElementById("packText").value = JSON.stringify({ pack: "speedtest", version: 1, units: [{ id: "zz1", title: "Zeta words", order: 999, lesson: { sections: [{ h: "The *zum* words", b: ["Zum."] }, { h: "More words", b: ["Buzz."] }] } }],
          items: [{ id: "v-zz-zumzum", unit: "zz1", type: "vocab", it: "zumzum", en: ["buzzbuzz"], pos: "noun", gender: "m", art: "lo", indef: "uno", plural: "zumzum", artPl: "gli", section: "More" },
            { id: "v-zz-zimzim", unit: "zz1", type: "vocab", it: "zimzim", en: ["bzzbzz"], pos: "noun", gender: "m", art: "lo", indef: "uno", plural: "zimzim", artPl: "gli", section: "u05#The tenses at" }] });
        action("importPack");
      });
      const fresh = await page.evaluate(() => ({ dropped: KNOWN_WORDS === null && GLOSS === null && SECTIONS === null, report: S.report }));
      check("a new pack drops them", fresh.dropped, JSON.stringify(fresh));
      await page.waitForFunction("KNOWN_WORDS && GLOSS && SECTIONS", null, { timeout: 60000 });
      const packLinks = await page.evaluate(() => ({ own: JSON.stringify(itemSection("v-zz-zumzum")), other: JSON.stringify(itemSection("v-zz-zimzim")), same: REF.sameSections() }));
      check("…and the lesson sections are worked out again in idle time, with the links the pack's items name", packLinks.own === '{"unit":"zz1","index":1}' && packLinks.other === '{"unit":"u05","index":0}' && packLinks.same, JSON.stringify(packLinks));
      const withPack = await page.evaluate(() => ({ it: knownWords().has("zumzum"), en: knownWords(true).has("buzzbuzz"), gloss: !!content.glossIndex["gr|buzzbuzz"], same: REF.sameIndex(content.glossIndex, REF.glossIndex()) && REF.sameSet(knownWords(), REF.knownWords().it) }));
      check("…and they are built again in idle time, with the pack's words", withPack.it && withPack.en && withPack.gloss && withPack.same, JSON.stringify(withPack));
      check("word lists: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }

    /* 5. Start-up */
    section("5. Start-up: saved again only if loading changed the progress");
    {
      const spy = () => { const set = Storage.prototype.setItem; window.__writes = []; Storage.prototype.setItem = function (k, v) { window.__writes.push(k); return set.call(this, k, v); }; };
      const { page, context } = await openApp(browser, origin, { seed: true, init: spy });
      check("progress saved in order is not written again at start-up", !(await page.evaluate("__writes")).includes("itapp.progress.v1"), (await page.evaluate("__writes")).join(", "));
      await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("itapp.progress.v1")); const alias = Object.keys(ID_ALIASES)[0]; p.items[alias] = { box: 3, due: 1, lapses: 0, lastSeen: 1, lastWrong: 0, seenCount: 1, lastRight: 1 }; localStorage.setItem("itapp.progress.v1", JSON.stringify(p)); });
      await page.reload(); await page.waitForFunction(ready);
      const moved = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("itapp.progress.v1")); return { written: __writes.includes("itapp.progress.v1"), gone: !p.items[Object.keys(ID_ALIASES)[0]] }; });
      check("progress with a record under an old id is written again, the record moved", moved.written && moved.gone, JSON.stringify(moved));
      await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("itapp.progress.v1")); delete p.settings.verbUnlockBox; localStorage.setItem("itapp.progress.v1", JSON.stringify(p)); });
      await page.reload(); await page.waitForFunction(ready);
      check("progress with a setting missing is written again, with the setting", await page.evaluate(() => __writes.includes("itapp.progress.v1") && JSON.parse(localStorage.getItem("itapp.progress.v1")).settings.verbUnlockBox === 5));
      check("start-up: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }

    /* 6. The sync merge */
    section("6. The sync merge: record by record, the same as 9.3's");
    {
      const { page, context } = await openApp(browser, origin, { seed: true });
      const res = await page.evaluate(() => {
        const T = Date.now(), D = 864e5, copy = (x) => JSON.parse(JSON.stringify(x));
        const base = REF.mergeProgress(progress, {}); // this device's progress, in the form a merge leaves it
        const ids = Object.keys(base.items), fresh = Object.keys(content.items).filter(id => pid(id) === id && !base.items[id]);
        const grammar = content.units.filter(u => !u.mode).map(u => u.id).filter(u => u !== base.currentUnit);
        const cloud = (p) => docsToProgress(Object.entries(progressToDocs(copy(p)))); // as a snapshot from the cloud brings it
        const days = Object.keys(base.days).sort(), flagId = Object.keys(base.flags)[0];
        const cases = [];
        cases.push(["the echo of this device's own writes", cloud(base), false]);
        { const r = cloud(base); r.items = Object.fromEntries(Object.entries(r.items).reverse()); cases.push(["the same progress, its records in another order", r, false]); }
        { const r = cloud(base);
          ids.slice(0, 150).forEach((id, k) => { const x = r.items[id]; x.lastSeen = T - k; x.box = Math.min(7, x.box + 1); x.seenCount++; x.due = T + D; });
          ids.slice(150, 250).forEach(id => { const x = r.items[id]; x.lastSeen -= D; x.box = 7; }); // older: this device's record stays
          fresh.slice(0, 50).forEach((id, k) => { r.items[id] = { box: 1, due: T + D, lapses: 0, lastSeen: T - k, lastWrong: 0, seenCount: 1, lastRight: T - k }; });
          r.days[days[days.length - 1]].xp += 50; r.days[days[0]].xp = 0; r.days[days[1]].t = { recall: [99, 999], cloze: [0, 0] }; r.days[days[2]].cards = 0; r.days["2020-01-05"] = { xp: 7, new: 1 };
          r.updatedAt = T + 1000; r.currentUnit = grammar[3];
          cases.push(["another device's practice: newer and older records, new ones, and higher and lower day totals", r, true]); }
        { const r = cloud(base);
          r.updatedAt = base.updatedAt - D; r.currentUnit = grammar[5]; r.settingsUpdatedAt = (base.settingsUpdatedAt || 0) - D; r.settings = Object.assign({}, r.settings, { goal: 99 });
          r.synonyms = { [ids[20]]: ["another answer"], [ids[10]]: ["my own answer", "a second one"] };
          r.flags = { [flagId]: Object.assign({}, base.flags[flagId], { note: "older", updatedAt: 1 }), "f-new": { id: "f-new", note: "from the phone", updatedAt: T } };
          cases.push(["an older copy (its current unit and settings lose) with accepted answers and flags of its own", r, true]); }
        { const r = cloud(base); r.settingsUpdatedAt = T + 5; r.settings = Object.assign({}, base.settings, { goal: 120, typos: false }); cases.push(["newer settings", r, true]); }
        { const r = cloud(base); const alias = Object.keys(ID_ALIASES).find(a => !base.items[pid(a)]) || Object.keys(ID_ALIASES)[0], shared = Object.keys(content.canon)[0];
          r.items[alias] = { box: 4, due: T, lapses: 1, lastSeen: T, lastWrong: T - D, seenCount: 5, lastRight: T };
          r.items[shared] = { box: 6, due: T + D, lapses: 0, lastSeen: T - 5, lastWrong: 0, seenCount: 8, lastRight: T - 5 };
          cases.push(["records under an old id and under a shared exercise's other id", r, true]); }
        { const r = cloud(base), cut = T - 10 * D; r.resetAt = cut; for (const id of Object.keys(r.items)) if (r.items[id].lastSeen < cut) delete r.items[id]; r.updatedAt = T + 9;
          cases.push(["progress reset on another device", r, true]); }
        cases.push(["the cloud's flags, one changed", { flags: { [flagId]: Object.assign({}, base.flags[flagId], { note: "changed", updatedAt: T + 3 }) } }, true]);
        cases.push(["the cloud's flags, unchanged", { flags: copy(base.flags) }, false]);
        { const r = cloud(base); r.updatedAt = T + 7; r.currentUnit = content.units.find(u => u.mode === "flashcards").id; cases.push(["a newer current unit that is a vocab pack", r, true]); }
        const out = [];
        S.screen = "home";
        for (const [label, remote, expect] of cases) {
          const want = REF.adopt(copy(base), copy(remote));
          progress = copy(base); COUNTS = null;
          const changed = adoptRemote(copy(remote));
          out.push({ label, diff: REF.diff(JSON.parse(canon(want.p)), JSON.parse(canon(progress))), changed, was: want.changed, expect });
        }
        progress = base; saveProgress(false);
        return out;
      });
      for (const r of res) {
        check(`${r.label}: the same progress as 9.3's merge`, !r.diff, r.diff);
        check(`…and ${r.expect ? "it says it changed" : "it says nothing changed"}, as 9.3 did`, r.changed === r.expect && r.was === r.expect, `now ${r.changed}, 9.3 ${r.was}`);
      }
      check("sync merge: no script errors", !page.errors.length, page.errors.join("\n"));
      await context.close();
    }
  } catch (e) {
    results.stopped(e);
  } finally {
    await browser.close();
    server.close();
  }
  results.summary();
})();
