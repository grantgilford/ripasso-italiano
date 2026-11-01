#!/usr/bin/env node
/*
  The choices test: wrong options and answer panels that teach (from version 9.7).

  Usage:  node tools/test-choices.js [path/to/index.html] [--headed]

  First, in Node (the app's own code loaded by tools/lib/load-app.js, Math.random seeded), over the whole content:

    1. Word order traps. For every sentence of a grammar unit with three words or more, every near-miss the app can
       offer (nearMisses): a form the content or VERB_GYM states (a verb form, an article, an adjective's form), no
       word of the sentence, and never part of a sentence the item accepts: put in place of any word of the sentence,
       or added anywhere in it, it gives nothing that checkAnswer accepts against translationsOf() (a subject pronoun
       added or left out, accents ignored) and nothing the word order check accepts. The word order exercise offers it
       as one of its two extra words, and the answer panel names it ("You chose sei: …", or "Near miss: …").
    2. Meaning choices. For every grammar-unit word, both ways (Italian → English and English → Italian), a few times
       each, with and without remembered mix-ups (each word paired with a copy of itself in another unit, a word
       sharing one of its meanings, a word with the same Italian, and a word chosen at random): the right answer is
       offered once, the options are all different, and no wrong option is right: not one of the item's answers
       (checkAnswer, English forms folded), not a word with the same Italian, and (Italian options) not a word that
       shares the meaning asked for. A remembered mix-up that is a valid option is always offered. Over every item of
       every grammar unit, new and half-learned, no option of any multiple choice is one of the exercise's answers.
    3. Flashcards in context: about 660 cards have a grammar-unit sentence (the slang unit aside) that uses their word
       as whole words, accents ignored, and every sentence offered does.
    4. Meanings (from 9.16). Every exercise of every item (the grammar units, the vocab packs and the Verbs section,
       new to learned, with the Verbs section's other tenses started) either shows the item's English in its prompt
       (or on a flip card's back), asks for the English, or carries a meaning for the answer panel (ex.meaning) that
       gives the item's own English: the verb of a conjugation, Which verb?, Which person?, Which tense? and Change
       the tense, the noun of an article or plural drill, the adjective and noun of an agreement drill, the preposition
       and noun of a merged form, the English of Listen and type, of a transform's answer and of a reply's line. Only
       rule questions, sort, match, numbers and clock times have none, and none of those shows a lone Italian word.
       From 9.20 also Verb in a sentence and Which tense fits?, which give the verb's meaning.
    4b. Verbs in a sentence (from 9.20). For every example sentence (VERB_SENTENCES), with every tense started: Verb in
       a sentence offers no wrong option that is an accepted answer or a form of a tense the sentence lists in also,
       and each has its reason; for lui/lei and loro only the sentence's own agreement ending is accepted. Which tense
       fits? offers no accepted answer, no tense in also and no command; its prompt shows neither the English nor a
       tense's name; typed, a tense in also is accepted. Every clue is in its sentence.

  Then in the real app (Playwright and Chromium, with a stand-in Italian voice): the indexes the traps and the confusion
  memory use (NEAR, ANSWERS) are built in idle time after Today, the same as built on the spot; and

    5. Confusion memory (itapp.confusions.v1): a wrong meaning chosen, a word typed that is another word's Italian, and
       a card typed with another card's meaning are each remembered as a pair; the answer panel says "You've mixed up
       X and Y N times" from the second time only; the pair survives a reload and its word is then offered first;
       Accept my answer takes the mix-up back; the store stays out of progress, the backup and the cloud's documents;
       it keeps at most 500 pairs (the oldest go), drops damaged entries, and a damaged value or a device that
       refuses to store it costs nothing (no script error, the answer still counts).
    6. A word order trap on the screen: choosing it gets "You chose …" with its reason; leaving it out, with
       explanations after every answer, gets "Near miss: …".
    7. A flashcard's sentence on the screen: after the answer, the panel shows one sentence with the card's word in
       bold, its English and a speaker that reads it (the same sentence on every redraw); a card with none shows none.
    8. Meanings on the screen: a conjugation (sognare), a transform, a reply and Listen and type, each answered right
       and wrong, show the meaning in the answer panel (“sognare: to dream”) whichever way, after the answer and
       "You typed", with explanations shown only after mistakes; never in the prompt; and Which verb? shows it once.

  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { loadApp } = require("./lib/load-app");
const { loadPlaywright, serveApp, checks } = require("./lib/browser");

const args = process.argv.slice(2);
const HEADED = args.includes("--headed");
const file = path.resolve(args.find(a => !a.startsWith("--")) || path.join(__dirname, "..", "index.html"));
const results = checks(), { check, section } = results;
const ready = "typeof content !== 'undefined' && content && typeof S !== 'undefined' && S.screen === 'home'";

// mulberry32, seeded
const seeded = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function nodeChecks() {
  const app = loadApp(`buildContent, makeExercise, nearMisses, wordBank, mcMeaning, explainFor, translationsOf, checkAnswer, contextFor,
    normalize, deaccent, enForms, arr, isSideUnit, isFlashUnit, pid, formVariants, VERB_GYM, SLANG_PACK,
    getContent: () => content, getProgress: () => progress, setRandom: f => { Math.random = f; }, setListen: f => { canListen = f; },
    setConfusions: m => { CONFUSIONS = m; }, confKey, esc, enList,
    VG_TENSES, TENSE_LABEL, verbSentences: typeof verbSentences === "undefined" ? null : verbSentences, vgCtxExercise: typeof vgCtxExercise === "undefined" ? null : vgCtxExercise,
    vgFitExercise: typeof vgFitExercise === "undefined" ? null : vgFitExercise, vsAccepted: typeof vsAccepted === "undefined" ? null : vsAccepted`, { html: fs.readFileSync(file, "utf8") });
  app.buildContent();
  const content = app.getContent(), { arr, normalize, deaccent, enForms, checkAnswer } = app;
  const grammar = Object.values(content.items).filter(i => !app.isSideUnit(i.unit));
  const key = (x) => deaccent(normalize(x));

  /* 1. Word order traps */
  section("1. Word order traps (every sentence of a grammar unit)");
  { // every form the content or VERB_GYM states, one word each
    const stated = new Set(["il", "lo", "la", "l'", "i", "gli", "le", "un", "uno", "una", "un'"]);
    const addForm = (f) => { if (f && f !== "—") for (const x of app.formVariants(String(f))) if (!/\s/.test(x.trim())) stated.add(normalize(x)); };
    for (const v of app.VERB_GYM) (v.f || []).forEach(t => arr(t).forEach(addForm));
    for (const it of Object.values(content.items)) {
      if (it.type === "verb" && it.forms && !Array.isArray(it.forms)) Object.values(it.forms).forEach(fs => arr(fs).forEach(addForm));
      if (it.type === "vocab" && Array.isArray(it.forms)) it.forms.forEach(addForm);
    }
    const sentences = grammar.filter(i => i.type === "sentence" && arr(i.it)[0].split(/\s+/).filter(Boolean).length >= 3);
    const bad = [], kinds = { verb: 0, article: 0, adjective: 0 };
    let withNear = 0, total = 0, offered = 0, named = 0;
    for (const item of sentences) {
      const words = arr(item.it)[0].split(/\s+/).filter(Boolean), bare = words.map(w => w.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "")).filter(Boolean);
      const near = app.nearMisses(item, words);
      if (near.length) withNear++;
      const acc = app.translationsOf(item), en = arr(item.en).join(" | "), seqs = arr(item.it).map(x => normalize(x));
      const accWords = new Set(acc.flatMap(a => key(a).split(" ")));
      for (const n of near) {
        total++;
        kinds[/ form; the subject is /.test(n.why) ? "verb" : / article /.test(n.why) ? "article" : "adjective"]++;
        const w = normalize(n.w), where = `${item.id} “${arr(item.it)[0]}”, near-miss “${n.w}”`;
        if (!stated.has(w)) bad.push(`${where}: not a form the content or VERB_GYM states`);
        if (accWords.has(key(n.w))) bad.push(`${where}: a word of an accepted sentence`);
        if (!n.why || !n.why.replace(/&#39;/g, "'").includes(n.w.toLowerCase())) bad.push(`${where}: its reason doesn't name it (${n.why})`);
        const tries = [];
        for (let j = 0; j < bare.length; j++) tries.push(bare.slice(0, j).concat(n.w, bare.slice(j + 1)));
        for (let j = 0; j <= bare.length; j++) tries.push(bare.slice(0, j).concat(n.w, bare.slice(j)));
        for (const t of tries) {
          const s = t.join(" ");
          if (checkAnswer(s, acc, { pronoun: en }).ok) bad.push(`${where}: makes “${s}”, which the item accepts`);
          if (seqs.includes(normalize(s))) bad.push(`${where}: makes “${s}”, which word order accepts`);
        }
      }
      if (near.length) { // the word order exercise offers one of them, and the answer panel names it
        app.setRandom(seeded(item.id.length * 7919 + total));
        const ex = app.wordBank({ item, note: "" }, item, words);
        const extras = ex.tokens.map(t => t.n);
        bare.forEach(b => { const k = extras.indexOf(normalize(b)); if (k >= 0) extras.splice(k, 1); });
        if (ex.nearMiss && near.some(n => n.w === ex.nearMiss.w) && extras.includes(normalize(ex.nearMiss.w)) && extras.length <= 2) offered++;
        else bad.push(`${item.id}: the word order exercise doesn't offer a near-miss among its two extra words (extras: ${extras.join(", ")})`);
        if (ex.nearMiss) {
          const used = words.map((w, j) => j === ex.nearMiss.at ? ex.nearMiss.w : w).join(" "); // at counts the sentence's words as split on spaces
          const a = app.explainFor(ex, { ok: false, given: used }).why.join(" "), b = app.explainFor(ex, { ok: true, given: arr(item.it)[0] }).why.join(" ");
          if (a.includes("You chose " + ex.nearMiss.w.replace(/'/g, "&#39;")) && b.includes("Near miss:")) named++;
          else bad.push(`${item.id}: the answer panel doesn't name the near-miss “${ex.nearMiss.w}” (${a.slice(0, 120)} / ${b.slice(0, 120)})`);
        }
      }
    }
    console.log(`         ${sentences.length} sentences; ${withNear} have a near-miss (${total} in all: ${kinds.verb} verb persons, ${kinds.article} articles, ${kinds.adjective} adjective forms)`);
    const out = (pre) => bad.filter(b => pre.test(b));
    check(`near-misses are forms the content or VERB_GYM states, and no word of the sentence (${total})`, sentences.length > 1000 && withNear > 600 && !out(/states|a word of an accepted/).length, out(/states|a word of an accepted/).slice(0, 8).join("\n"));
    check("no near-miss, put in place of any word or added anywhere, makes a sentence the item accepts (checkAnswer, a subject pronoun added or left out) or word order accepts", !out(/accepts/).length, out(/accepts/).slice(0, 8).join("\n"));
    check(`the word order exercise offers a near-miss as one of its two extra words wherever there is one (${offered} of ${withNear})`, offered === withNear, out(/offer/).slice(0, 8).join("\n"));
    check(`the answer panel names the near-miss with its reason: “You chose …” when it was used, “Near miss: …” when not (${named})`, named === withNear && !out(/reason|name/).length, out(/reason|name/).slice(0, 8).join("\n"));
  }

  /* 2. Meaning choices */
  section("2. Meaning choices (every grammar-unit word, both ways)");
  {
    const words = grammar.filter(i => i.type === "vocab");
    const byIt = new Map(), byEn = new Map();
    for (const w of words) { const k = key(arr(w.it)[0]); (byIt.get(k) || byIt.set(k, []).get(k)).push(w); for (const e of arr(w.en)) for (const f of enForms(String(e))) (byEn.get(f) || byEn.set(f, []).get(f)).push(w); }
    const copies = new Map(); // record id → every word that shares it
    for (const w of Object.values(content.items)) if (w.type === "vocab") { const id = app.pid(w.id); (copies.get(id) || copies.set(id, []).get(id)).push(w); }
    const rnd = seeded(97);
    // remembered mix-ups that test the exclusions: a copy with the same Italian, a word sharing a meaning, and one at random
    const conf = new Map(), note = (a, b) => { const x = app.pid(a.id), y = app.pid(b.id); if (x !== y) conf.set(app.confKey(x, y), (x < y ? [x, y] : [y, x]).concat(2)); };
    for (const w of words) {
      for (const o of byIt.get(key(arr(w.it)[0])) || []) note(w, o);
      for (const e of arr(w.en)) for (const f of enForms(String(e))) for (const o of byEn.get(f) || []) note(w, o);
      note(w, words[Math.floor(rnd() * words.length)]);
    }
    const bad = [], partnerMissed = [];
    let built = 0, partners = 0;
    for (const withConf of [false, true]) {
      app.setConfusions(withConf ? conf : new Map());
      for (const item of words) for (const toEn of [true, false]) for (let k = 0; k < 3; k++) {
        app.setRandom(seeded(built * 31 + 7));
        const ex = app.mcMeaning({ item, note: "" }, item, toEn); built++;
        const where = `${item.id} (${toEn ? "IT → EN" : "EN → IT"}${withConf ? ", with mix-ups" : ""})`;
        const opts = ex.options, wrong = opts.filter(o => o !== ex.correct);
        if (opts.filter(o => o === ex.correct).length !== 1) bad.push(`${where}: the right answer “${ex.correct}” is offered ${opts.filter(o => o === ex.correct).length} times`);
        if (new Set(opts.map(o => toEn ? enForms(o)[0] : key(o))).size !== opts.length) bad.push(`${where}: two options are the same (${opts.join(" | ")})`);
        if (new Set(wrong.map(o => app.pid(ex.optionSources[o].id)).concat(app.pid(item.id))).size !== opts.length) bad.push(`${where}: two options come from the same word (${opts.join(" | ")})`);
        if (opts.length < 2) bad.push(`${where}: only ${opts.length} option`);
        const ownEn = new Set(arr(item.en).flatMap(e => enForms(String(e)))), prompt = enForms(String(arr(item.en)[0]));
        for (const o of wrong) {
          const src = ex.optionSources[o];
          if (toEn ? checkAnswer(o, arr(item.en), { english: true, itemId: item.id }).ok || enForms(o).some(f => ownEn.has(f)) : checkAnswer(o, arr(item.it), {}).ok) bad.push(`${where}: the wrong option “${o}” is one of its answers`);
          if (src && key(arr(src.it)[0]) === key(arr(item.it)[0])) bad.push(`${where}: “${o}” belongs to a word with the same Italian (${src.id})`);
          if (!toEn && src && arr(src.en).some(e => enForms(String(e)).some(f => prompt.includes(f)))) bad.push(`${where}: “${o}” also means “${arr(item.en)[0]}”`);
        }
        if (withConf) { // remembered mix-ups that are valid options are offered first: as many of the three wrong options as there are of them
          const me = app.pid(item.id), mates = new Set(), texts = new Set(); // mixed-up record ids with a valid option, and the option texts they give
          for (const [x, y] of conf.values()) {
            const other = x === me ? y : y === me ? x : null;
            if (!other) continue;
            const ok = (copies.get(other) || []).filter(o => o.id === other || o.unit === item.unit).find(o => { // the word itself, or its copy in this unit
              const v = arr(toEn ? o.en : o.it)[0];
              return v && key(arr(o.it)[0]) !== key(arr(item.it)[0]) && !(toEn ? enForms(String(v)).some(f => ownEn.has(f)) : arr(o.en).some(e => enForms(String(e)).some(f => ownEn.has(f))));
            });
            if (ok) { mates.add(other); texts.add(toEn ? enForms(String(arr(ok.en)[0]))[0] : key(arr(ok.it)[0])); }
          }
          if (mates.size) {
            partners++;
            const got = new Set(wrong.map(o => ex.optionSources[o] && app.pid(ex.optionSources[o].id)).filter(id => mates.has(id))).size;
            if (got < Math.min(3, texts.size)) partnerMissed.push(`${where}: ${got} of the wrong options are remembered mix-ups, of ${texts.size} possible (${opts.join(" | ")})`);
          }
        }
      }
    }
    app.setConfusions(new Map());
    check(`no wrong option is right (not an answer, not a word with the same Italian, not one sharing the meaning asked for), and each comes from a different word (${built} meaning choices)`, built > 5000 && !bad.length, [...new Set(bad)].slice(0, 8).join("\n"));
    check(`remembered mix-ups are offered first, as many as fit (${partners} exercises with one)`, partners > 500 && !partnerMissed.length, partnerMissed.slice(0, 8).join("\n"));
    // every multiple choice of every grammar unit: no wrong option is one of the exercise's answers
    const bad2 = [];
    let n = 0;
    for (const item of grammar) for (const box of [0, 1]) for (let k = 0; k < 2; k++) {
      app.setRandom(seeded(n * 13 + 1));
      const ex = app.makeExercise(item, { box, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 0 });
      if (!ex || ex.mode !== "options") continue;
      n++;
      // an option is checked exactly as tapped, so accents count (ventitrè is a wrong option beside ventitré), and in a grammar
      // question capitals too (te-LE-fo-na-no beside te-le-fo-NA-no); elsewhere case and punctuation don't make another answer
      const same = item.type === "grammar_mc" ? (x) => String(x).trim() : (x) => normalize(String(x));
      const right = new Set([ex.correct].concat(item.type === "grammar_mc" ? [item.answer] : [], ex.typeKey === "meaning" ? [] : arr(ex.accepted)).map(same));
      for (const o of ex.options) if (o !== ex.correct && right.has(same(o))) bad2.push(`${item.id} (${ex.type}): the wrong option “${o}” is an answer`);
      if (!ex.options.includes(ex.correct)) bad2.push(`${item.id} (${ex.type}): the right answer isn't offered`);
    }
    check(`no option of any multiple choice is one of the exercise's answers (${n} exercises, every grammar-unit item, new and half-learned)`, n > 2000 && !bad2.length, bad2.slice(0, 8).join("\n"));
  }

  /* 3. Flashcards in context */
  section("3. Flashcards in context");
  {
    const cards = Object.values(content.items).filter(i => i.type === "vocab" && app.isFlashUnit(i.unit));
    const words = (s) => deaccent(normalize(String(s).replace(/\([^)]*\)/g, " "))).split(" ").filter(Boolean);
    const bad = [];
    let withCtx = 0;
    const t0 = Date.now();
    for (const c of cards) {
      const list = app.contextFor(c);
      if (list.length) withCtx++;
      for (const { s, at, len } of list) {
        const unit = content.unitById[s.unit];
        if (s.type !== "sentence" || app.isSideUnit(s.unit) || unit.pack === app.SLANG_PACK.pack) bad.push(`${c.id}: ${s.id} is not a sentence of a grammar unit outside the slang unit`);
        const ws = words(arr(s.it)[0]);
        if (!arr(c.it).some(f => { const fw = words(f); return fw.length === len && fw.every((x, j) => ws[at + j] === x); })) bad.push(`${c.id} “${arr(c.it)[0]}”: “${arr(s.it)[0]}” doesn't have it as whole words at word ${at + 1}`);
        if (!arr(s.en).length) bad.push(`${c.id}: ${s.id} has no English`);
      }
    }
    check(`about 660 cards have a sentence from a grammar unit that uses their word (${withCtx} of ${cards.length}, in ${Date.now() - t0} ms in Node), and each sentence has the word, as whole words, accents ignored`, withCtx >= 600 && withCtx <= 800 && !bad.length, bad.slice(0, 8).join("\n"));
  }

  /* 4. Meanings */
  section("4. Meanings in the answer panel (every exercise of every item)");
  {
    const progress = app.getProgress(), saved = progress.items;
    progress.items = {};
    for (const it of Object.values(content.items)) if (it.type === "vtense") progress.items[app.pid(it.id)] = { box: 1, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3, lastRight: 0 }; // every tense started: Change the tense and Which tense? can be built
    app.setListen(() => true);
    const NONE = new Set(["grammar", "sort", "match", "number", "clock"]); // a rule question, a sorting or matching of several words, a number or a time: no one English to give
    const MEANT = new Set(["conjugation", "article", "plural", "agreement", "preparticle", "listen", "transform", "reply", "vswitch", "vinf", "vtenseid", "vperson"].concat(app.verbSentences ? ["vctx", "vfit"] : []));
    const plain = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
    const bad = [], kinds = {}, missing = [];
    let n = 0, s = 7;
    for (const item of Object.values(content.items)) for (const box of [0, 1, 2, 3, 4]) for (let k = 0; k < (app.isFlashUnit(item.unit) ? 1 : 4); k++) { // a card gives the same kind every time
      app.setRandom(seeded(s += 7919));
      const ex = app.makeExercise(item, { box, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3, lastRight: 0 }, box === 0 && k % 2 ? "production" : undefined);
      if (!ex) continue;
      n++;
      const ens = arr(item.en).map(String).concat(item.lineEn ? [item.lineEn] : []);
      const shows = ens.some(e => ex.promptHtml.includes(app.esc(e)) || (ex.backHtml || "").includes(app.esc(e)) || (ex.introHtml || "").includes(app.esc(e)));
      const asks = !!ex.english || (ex.correct != null && arr(item.en).includes(ex.correct));
      const k2 = ex.typeKey + (ex.mode === "flip" ? " (flip)" : "");
      kinds[k2] = kinds[k2] || { n: 0, meaning: 0 }; kinds[k2].n++;
      if (ex.meaning) {
        kinds[k2].meaning++;
        // the meaning gives the item's own English: all its glosses (enList), or a sentence's English, or a reply line's
        const m = plain(ex.meaning), own = item.type === "reply" ? [item.lineEn] : ["listen", "transform"].includes(ex.typeKey) ? [arr(item.en)[0]] : [app.enList(item).join(", ")];
        if (!own.every(e => e && m.includes(plain(app.esc(e))))) bad.push(`${item.id} (${ex.typeKey}): the meaning “${m}” isn't its own English (${own.join(" | ")})`);
        if (plain(ex.promptHtml).includes(m)) bad.push(`${item.id} (${ex.typeKey}): the meaning is in the prompt already`);
      } else if (MEANT.has(ex.typeKey) || !(shows || asks || NONE.has(ex.typeKey))) missing.push(`${item.id} (${ex.type}, box ${box}): “${plain(ex.promptHtml).trim().slice(0, 60)}” shows Italian with no English, before or after the answer`);
    }
    progress.items = saved;
    const counted = Object.entries(kinds).filter(([, v]) => v.meaning).map(([k, v]) => `${k} ${v.meaning}`).join(", ");
    check(`every exercise shows its English, asks for it, or gives it in the answer panel (${n} exercises; with a meaning: ${counted})`, n > 100000 && !missing.length, [...new Set(missing)].slice(0, 10).join("\n"));
    check("every meaning is the item's own English (its glosses, a sentence's English, a reply line's), and none repeats the prompt", !bad.length, [...new Set(bad)].slice(0, 10).join("\n"));
    check(`all ${MEANT.size === 14 ? "fourteen" : "twelve"} kinds that need one give a meaning`, [...MEANT].every(k => kinds[k] && kinds[k].meaning === kinds[k].n), JSON.stringify(Object.fromEntries([...MEANT].map(k => [k, kinds[k]]))));
  }

  /* 4b. Verbs in a sentence (from 9.20) */
  if (app.verbSentences) {
    section("4b. Verb in a sentence and Which tense fits? (every example sentence)");
    const progress = app.getProgress(), saved = progress.items;
    progress.items = {};
    for (const it of Object.values(content.items)) if (it.type === "vtense") progress.items[app.pid(it.id)] = { box: 3, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3, lastRight: 0 }; // every tense started
    const formsOf = (item, t, p) => { const f = item.allForms[t] && item.allForms[t][p]; return f && f !== "—" ? app.formVariants(f).map(normalize) : []; };
    const LABELS = Object.values(app.TENSE_LABEL);
    const bad = [], fitBad = [], clueBad = [];
    let ctx = 0, fit = 0, sentences = 0, withClue = 0;
    for (const item of Object.values(content.items)) {
      if (item.type !== "vtense") continue;
      for (const s of app.verbSentences(item)) {
        sentences++;
        const where = `${item.id} “${s.it}”`, acc = app.vsAccepted(item, s).map(normalize), also = s.also.flatMap(t => formsOf(item, t, s.p));
        if (!acc.includes(normalize(s.variant))) bad.push(`${where}: the sentence's own form isn't accepted`);
        if ([2, 5].includes(s.p)) for (const f of app.formVariants(s.form)) if (f !== s.variant && acc.includes(normalize(f))) bad.push(`${where}: the other agreement ending ${f} is accepted, though the subject shows it`);
        if (s.clue) {
          withClue++;
          for (const part of s.clue.split("…").map(x => x.trim()).filter(Boolean)) if (!(" " + normalize(s.it) + " ").includes(" " + normalize(part) + " ")) clueBad.push(`${where}: the clue “${part}” isn't in it`);
        }
        for (let k = 0; k < 6; k++) {
          app.setRandom(seeded(7 + k * 31 + sentences));
          const ex = { item, note: "" };
          if (app.vgCtxExercise(ex, item, s, 1)) {
            ctx++;
            for (const o of ex.options.filter(o => o !== ex.correct)) {
              if (acc.includes(normalize(o))) bad.push(`${where}: Verb in a sentence offers ${o}, an accepted answer, as wrong`);
              if (also.includes(normalize(o))) bad.push(`${where}: Verb in a sentence offers ${o}, a tense the sentence lists in also, as wrong`);
              if (!ex.optionNotes[o]) bad.push(`${where}: Verb in a sentence's option ${o} has no reason`);
            }
          }
          for (const box of [3, 4]) {
            const fx = { item, note: "" };
            if (!app.vgFitExercise(fx, item, s, box)) continue;
            fit++;
            const prompt = normalize(fx.promptHtml.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'"));
            const hint = prompt.replace(normalize(s.it.split(/\s+/).slice(0, s.at).join(" ")), "").replace(normalize(s.it.split(/\s+/).slice(s.at + s.len).join(" ")), "");
            if (prompt.includes(normalize(s.en))) fitBad.push(`${where}: Which tense fits? shows the English`);
            if (LABELS.some(l => hint.includes(normalize(l)))) fitBad.push(`${where}: Which tense fits? names a tense (“${hint}”)`);
            if (!s.clue) fitBad.push(`${where}: Which tense fits? built without a clue`);
            if (box === 3) for (const o of fx.options.filter(o => o !== fx.correct)) {
              const t = fx.optionTenses[o];
              if (acc.includes(normalize(o))) fitBad.push(`${where}: offers ${o}, an accepted answer, as wrong`);
              if (also.includes(normalize(o)) || s.also.includes(t)) fitBad.push(`${where}: offers ${o}, a tense listed in also`);
              if (t === "imperativo" || !t) fitBad.push(`${where}: offers ${o}, not a form of another tense`);
            }
            if (box === 4 && also.some(f => !fx.accepted.map(normalize).includes(f))) fitBad.push(`${where}: typed, a form of a tense in also isn't accepted`);
          }
        }
      }
    }
    progress.items = saved;
    check(`Verb in a sentence: no wrong option is an accepted answer or a tense listed in also, each has its reason, and only the sentence's own agreement ending is right for lui/lei and loro (${sentences} sentences, ${ctx} built with options)`, sentences > 100 && ctx > 100 && !bad.length, [...new Set(bad)].slice(0, 10).join("\n"));
    check(`Which tense fits?: no option is an accepted answer, a tense listed in also or a command; no prompt shows the English or names a tense; typed, a tense in also is accepted (${fit} built)`, fit > 100 && !fitBad.length, [...new Set(fitBad)].slice(0, 10).join("\n"));
    check(`every clue is in its sentence (${withClue} sentences with a clue)`, withClue > 50 && !clueBad.length, clueBad.slice(0, 10).join("\n"));
  }
}

// Run in the page before the app: a stand-in Italian voice that records what it reads.
const INIT = `(() => {
  const voices = [{ name: "Italiano (test)", lang: "it-IT", localService: true, default: false, voiceURI: "it" }];
  window.__said = [];
  const fake = { speaking: false, pending: false, paused: false, getVoices: () => voices, speak(u) { window.__said.push(u.text); setTimeout(() => u.onend && u.onend({}), 10); }, cancel() { }, resume() { }, pause() { }, addEventListener() { }, removeEventListener() { } };
  Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; this.lang = ""; this.rate = 1; this.voice = null; };
})();`;

// In the page: a session of one exercise, as the item test makes one.
const ONE = ([ex]) => {
  session = { kind: "unit", unitId: ex.item.unit, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
  S.screen = "session"; S.feedback = null; S.revealed = false; S.picked = null; S.bankPicked = []; S.retry = null; resetExState(); render();
};

async function browserChecks(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  page.on("dialog", d => d.accept());
  await page.goto(origin + "/index.html"); await page.waitForFunction(ready);
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem("itapp.confusions.v1") || "null"));
  const panel = () => page.evaluate(() => { const f = document.querySelector(".fb"); return f ? f.innerText : ""; });

  section("Indexes built in idle time");
  await page.waitForFunction(() => NEAR && ANSWERS, null, { timeout: 60000, polling: 200 });
  const idle = await page.evaluate(() => {
    const was = { near: NEAR, answers: ANSWERS }, sum = (x) => [x.forms.size, x.nouns.size, x.adjs.size, x.other.size, Object.keys(x.verbs).length].join("/");
    NEAR = null; nearJob = null; ANSWERS = null; answersJob = null;
    const fresh = { near: nearIndex(), answers: answerIndex() };
    const same = sum(was.near) === sum(fresh.near) && was.answers.size === fresh.answers.size && [...fresh.answers.keys()].every(k => (was.answers.get(k) || []).length === fresh.answers.get(k).length);
    return { same, near: sum(fresh.near), answers: fresh.answers.size };
  });
  check(`the word order traps' forms and every word's Italian are built in idle time after Today, the same as built on the spot (${idle.near} forms/nouns/adjectives/other words/verbs; ${idle.answers} answers)`, idle.same, JSON.stringify(idle));

  /* 5. Confusion memory */
  section("5. Confusion memory (itapp.confusions.v1)");
  // a word and another word of its unit with the same part of speech: the meaning of the other chosen twice
  const pair = await page.evaluate(() => {
    const it = content.byUnit.u02.find(i => i.type === "vocab" && arr(i.it)[0] === "casa") || content.byUnit.u02.find(i => i.type === "vocab" && i.pos === "noun");
    return { id: it.id, pid: pid(it.id), it: arr(it.it)[0] };
  });
  const chooseWrong = async (prefer) => { // a meaning choice for the word, the wrong option prefer (or any) chosen by tapping
    const o = await page.evaluate(([id, prefer]) => {
      const item = content.items[id], ex = mcMeaning({ item, note: item.note || "" }, item, true);
      session = { kind: "unit", unitId: item.unit, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
      S.screen = "session"; S.feedback = null; S.picked = null; resetExState(); render();
      const wrong = ex.options.filter(o => o !== ex.correct), pickO = prefer ? wrong.find(o => pid(ex.optionSources[o].id) === prefer) : wrong[0];
      return pickO ? { o: pickO, src: pid(ex.optionSources[pickO].id), srcIt: arr(ex.optionSources[pickO].it)[0], first: wrong.map(o => pid(ex.optionSources[o].id)) } : null;
    }, [pair.id, prefer]);
    if (o) await page.click(`[data-opt="${o.o.replace(/["\\]/g, "\\$&")}"]`);
    return o;
  };
  const first = await chooseWrong(null);
  let st = await store();
  const k = (a, b) => (a < b ? [a, b] : [b, a]).join("|");
  const has = (list, a, b, n) => Array.isArray(list) && list.some(e => e[0] + "|" + e[1] === k(a, b) && e[2] === n);
  check("a wrong meaning chosen is remembered as a pair, once (the two record ids in order, and the count)", first && has(st, pair.pid, first.src, 1) && st.length === 1, JSON.stringify(st));
  check("…and the first time the answer panel doesn't mention it", !/mixed up/.test(await panel()), await panel());
  const second = await chooseWrong(first.src);
  st = await store();
  const p2 = await panel();
  check("the next meaning choice for the word offers the word it was mixed up with", second && second.src === first.src);
  check(`the second time the panel says “You've mixed up ${pair.it} and ${first.srcIt} 2 times”`, has(st, pair.pid, first.src, 2) && p2.includes(`You've mixed up ${pair.it} and ${first.srcIt} 2 times.`), p2);
  const outOfProgress = await page.evaluate(() => {
    const docs = JSON.stringify(progressToDocs(progress)), all = [localStorage.getItem("itapp.progress.v1"), docs, backupText()].join("\n");
    return !/confusion/i.test(all) && !("confusions" in progress);
  });
  check("the store is kept out of progress, the backup file and the cloud's documents", outOfProgress);
  await page.reload(); await page.waitForFunction(ready);
  const after = await page.evaluate((id) => { const m = mixedWith(content.items[id]); return [...m.entries()]; }, pair.id);
  check("it survives a reload", after.length === 1 && after[0][0] === first.src && after[0][1] === 2, JSON.stringify(after));
  const third = await chooseWrong(null);
  check("…and after it the word it was mixed up with is still offered", third && third.first.includes(first.src), JSON.stringify(third));

  // typed: another word's Italian typed for a word (typed recall), recorded; a card typed with another card's meaning, and Accept my answer
  const typed = await page.evaluate(() => {
    const words = content.byUnit.u02.filter(i => i.type === "vocab" && i.pos === "noun" && i.art);
    const a = words[0], b = words.find(w => pid(w.id) !== pid(a.id) && !arr(w.en).some(e => arr(a.en).includes(e)));
    const ex = makeExercise(a, { box: 3, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3 }, "production", { prefer: ["recall"] });
    return ex.typeKey === "recall" ? { a: a.id, pa: pid(a.id), b: pid(b.id), type: joinArt(b.art, arr(b.it)[0]), ex: true } : { ex: false };
  });
  if (typed.ex) {
    await page.evaluate(([id]) => {
      const item = content.items[id], ex = makeExercise(item, { box: 3, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3 }, "production", { prefer: ["recall"] });
      session = { kind: "unit", unitId: item.unit, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
      S.screen = "session"; S.feedback = null; S.retry = null; resetExState(); render();
    }, [typed.a]);
    await page.fill("#answer", typed.type); await page.click('[data-act="check"]');
  }
  st = await store();
  check("another word's Italian typed for a word is remembered as a pair", typed.ex && has(st, typed.pa, typed.b, 1), JSON.stringify({ typed, st }));
  const card = await page.evaluate(() => {
    progress.settings.fcDir = "it-en";
    const cards = content.byUnit.fc01.filter(i => i.type === "vocab");
    const only = (c) => { const k = normEn(arr(c.en)[0]); return (content.glossIndex["fc|" + k] || []).length === 1 && !(content.glossIndex["gr|" + k] || []).length; }; // no other word has its meaning
    const a = cards.find(c => /^[a-z]+$/.test(arr(c.it)[0])), b = cards.find(c => c !== a && /^[a-z ]+$/.test(arr(c.en)[0]) && only(c) && !arr(c.en).some(e => arr(a.en).map(normEn).includes(normEn(e))));
    const ex = makeExercise(a, { box: 2, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3 });
    session = { kind: "unit", unitId: a.unit, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
    S.screen = "session"; S.feedback = null; S.retry = null; resetExState(); render();
    return { a: pid(a.id), b: pid(b.id), type: arr(b.en)[0] };
  });
  await page.fill("#answer", card.type); await page.click('[data-act="check"]');
  const cardSt = await store();
  check("a card typed with another card's meaning is remembered as a pair", has(cardSt, card.a, card.b, 1), JSON.stringify(cardSt));
  await page.click('[data-act="accept"]');
  st = await store();
  check("…and Accept my answer takes it back", !st.some(e => e[0] + "|" + e[1] === k(card.a, card.b)) && (await page.evaluate(() => S.feedback && S.feedback.ok)), JSON.stringify(st));

  // the cap, damaged entries, a damaged value and a device that refuses to store it
  await page.evaluate(() => {
    const list = [];
    for (let i = 0; i < 700; i++) list.push(["zz-old-" + String(i).padStart(4, "0"), "zz-old-x" + i, 1 + (i % 3)]);
    list.splice(10, 0, "oops", [1, 2, 3], ["a", "a", 1], ["a", "b", -1], ["a", "b", 1.5], null, ["c"], { a: 1 });
    localStorage.setItem("itapp.confusions.v1", JSON.stringify(list));
  });
  await page.reload(); await page.waitForFunction(ready);
  const loaded = await page.evaluate(() => confusions().size);
  await chooseWrong(null);
  st = await store();
  const valid = Array.isArray(st) && st.every(e => Array.isArray(e) && e.length === 3 && typeof e[0] === "string" && typeof e[1] === "string" && e[0] < e[1] && Number.isInteger(e[2]) && e[2] > 0);
  check(`at most 500 pairs are kept, the oldest going first, and damaged entries are dropped (${loaded} loaded from 700 and 8 damaged; ${st && st.length} after one more)`, loaded === 500 && st.length === 500 && valid && st[st.length - 1].includes(pair.pid) && st.some(e => e[0] === "zz-old-0699") && !st.some(e => e[0] === "zz-old-0200"), JSON.stringify(st && st.slice(-2)));
  const before = errors.length;
  for (const raw of ["{not json", "\"oops\"", "42", "{\"a\":1}"]) {
    await page.evaluate((v) => localStorage.setItem("itapp.confusions.v1", v), raw);
    await page.reload(); await page.waitForFunction(ready);
    await chooseWrong(null);
  }
  st = await store();
  check("a damaged value costs nothing: the app opens, the answer counts and the pair is stored afresh", errors.length === before && Array.isArray(st) && st.length === 1 && (await page.evaluate(() => S.feedback && S.feedback.ok === false)), JSON.stringify({ st, errors: errors.slice(before) }));
  await page.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "itapp.confusions.v1") throw new Error("QuotaExceededError"); return set.call(this, k, v); }; });
  const seen = () => page.evaluate((id) => (progress.items[pid(id)] || {}).seenCount || 0, pair.id);
  const answered = await seen();
  await chooseWrong(null);
  const counted = await seen();
  check("a device that refuses to store it: no script error, and the answer still counts", errors.length === before && counted === answered + 1 && /Not quite/.test(await panel()), JSON.stringify({ answered, counted, errors: errors.slice(before) }));

  /* 5. A word order trap on the screen */
  section("6. A word order trap on the screen");
  await page.reload(); await page.waitForFunction(ready);
  const bankEx = async (explain) => page.evaluate((explain) => {
    progress.settings.explain = explain;
    const item = content.items["s-u08-y13"] || content.byUnit.u01.find(i => i.type === "sentence" && nearMisses(i, arr(i.it)[0].split(/\s+/)).length);
    let ex = null;
    for (let k = 0; k < 50 && !(ex && ex.nearMiss); k++) ex = wordBank({ item, note: "" }, item, arr(item.it)[0].split(/\s+/).filter(Boolean));
    session = { kind: "unit", unitId: item.unit, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
    S.screen = "session"; S.feedback = null; S.bankPicked = []; resetExState(); render();
    return { near: ex.nearMiss, target: ex.targetSeqs[0], tokens: ex.tokens.map(t => t.n), it: arr(item.it)[0] };
  }, explain);
  let b = await bankEx("mistakes");
  check("a word order exercise with a near-miss shows it among the words to tap", b.near && b.tokens.includes(b.near.w.toLowerCase()), JSON.stringify(b));
  { // the sentence with the near-miss in place of its word
    const used = new Set();
    for (let j = 0; j < b.target.length; j++) {
      const w = j === b.near.at ? b.near.w.toLowerCase() : b.target[j];
      const i = b.tokens.findIndex((t, x) => t === w && !used.has(x)); used.add(i);
      await page.click(`[data-pick="${i}"]`);
    }
    await page.click('[data-act="checkBank"]');
  }
  let p = await panel();
  check(`choosing it is Not quite, and the panel says why: “You chose ${b.near.w}: …”`, /Not quite/.test(p) && p.includes(`You chose ${b.near.w}:`) && p.includes(b.near.why.replace(/&#39;/g, "'").replace(/<[^>]+>/g, "").slice(0, 20)), p);
  b = await bankEx("always");
  { const used = new Set(); for (const w of b.target) { const i = b.tokens.findIndex((t, x) => t === w && !used.has(x)); used.add(i); await page.click(`[data-pick="${i}"]`); } await page.click('[data-act="checkBank"]'); }
  p = await panel();
  check("leaving it out is Correct, and with explanations after every answer the panel names it: “Near miss: …”", /Correct/.test(p) && p.includes("Near miss:") && p.includes(b.near.w.toLowerCase()), p);
  await page.evaluate(() => { progress.settings.explain = "mistakes"; });

  /* 7. A flashcard's sentence on the screen */
  section("7. A flashcard's sentence on the screen");
  const fc = await page.evaluate(() => {
    progress.settings.fcDir = "it-en";
    const cards = content.byUnit.fc01.filter(i => i.type === "vocab");
    const a = cards.find(c => contextFor(c).length) , none = cards.find(c => !contextFor(c).length);
    return { a: a.id, word: arr(a.it)[0], en: arr(a.en)[0], none: none.id, sentences: contextFor(a).map(c => [arr(c.s.it)[0], arr(c.s.en)[0]]) };
  });
  const cardSession = (id) => page.evaluate((id) => {
    const item = content.items[id], ex = makeExercise(item, { box: 2, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3 });
    session = { kind: "unit", unitId: item.unit, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
    S.screen = "session"; S.feedback = null; S.retry = null; resetExState(); render();
  }, id);
  await cardSession(fc.a);
  await page.fill("#answer", fc.en); await page.click('[data-act="check"]'); await page.waitForTimeout(400);
  const ctx = await page.evaluate(() => { const c = document.querySelector(".fb .fb-ctx"); if (!c) return null; const s = c.querySelector("[data-say]"), r = s && s.getBoundingClientRect(); return { it: c.querySelector(".it").textContent, b: [...c.querySelectorAll(".it b")].map(x => x.textContent).join(" "), en: c.querySelector(".ctx-en").textContent, say: s && s.dataset.say, w: r && r.width, h: r && r.height }; });
  const okSentence = ctx && fc.sentences.some(([it, en]) => it === ctx.it && en === ctx.en);
  check("after a right answer the panel shows a sentence that uses the card's word, with its English", /Correct/.test(await panel()) && okSentence, JSON.stringify({ ctx, fc }));
  check("…the card's word in bold", ctx && deaccentCmp(ctx.b, fc.word), JSON.stringify(ctx));
  check("…and a 44 px speaker that reads the sentence", ctx && ctx.say === ctx.it && ctx.w >= 44 && ctx.h >= 44, JSON.stringify(ctx));
  await page.evaluate(() => { window.__said = []; });
  await page.click(".fb .fb-ctx [data-say]"); await page.waitForTimeout(100);
  check("…which, tapped, reads it", (await page.evaluate(() => window.__said)).join() === (ctx && ctx.it), JSON.stringify(await page.evaluate(() => window.__said)));
  await page.evaluate(() => render());
  check("the same sentence on every redraw", (await page.evaluate(() => { const c = document.querySelector(".fb .fb-ctx .it"); return c && c.textContent; })) === (ctx && ctx.it));
  await cardSession(fc.a);
  await page.fill("#answer", "zzz"); await page.click('[data-act="check"]');
  check("after a wrong answer too", /Not quite/.test(await panel()) && !!(await page.$(".fb .fb-ctx")));
  await cardSession(fc.none);
  await page.fill("#answer", "zzz"); await page.click('[data-act="check"]');
  check("a card with no such sentence shows none", /Not quite/.test(await panel()) && !(await page.$(".fb .fb-ctx")));

  /* 8. Meanings on the screen */
  section("8. Meanings on the screen");
  await page.evaluate(() => { progress.settings.explain = "mistakes"; });
  // one exercise of an item, of the kind asked for (built until it comes up), in a session of its own
  const meaningSession = (id, typeKey, box) => page.evaluate(([id, typeKey, box]) => {
    const item = content.items[id];
    let ex = null;
    for (let k = 0; k < 200 && !(ex && ex.typeKey === typeKey); k++) ex = makeExercise(item, { box, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3, lastRight: 0 });
    if (!ex || ex.typeKey !== typeKey) return null;
    session = { kind: "unit", unitId: item.unit, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
    S.screen = "session"; S.feedback = null; S.revealed = false; S.picked = null; S.retry = null; resetExState(); render();
    const tmp = document.createElement("div"); tmp.innerHTML = ex.meaning || "";
    return { right: ex.mode === "options" ? ex.correct : arr(ex.accepted)[0], meaning: tmp.textContent, prompt: document.querySelector(".prompt").textContent, mode: ex.mode };
  }, [id, typeKey, box]);
  const meaningLine = () => page.evaluate(() => { // the meaning, and what comes before it in the panel
    const m = document.querySelector(".fb .mean"); if (!m) return null;
    const kids = [...document.querySelector(".fb .fb-body").children];
    return { text: m.textContent, before: kids.slice(0, kids.indexOf(m)).map(k => k.textContent).join(" | "), whyBefore: kids.slice(0, kids.indexOf(m)).some(k => k.matches(".why")) };
  });
  const answerWith = async (x, text) => {
    if (x.mode === "options") await page.click(`[data-opt="${text.replace(/"/g, '\\"')}"]`);
    else { await page.fill("#answer", text); await page.click('[data-act="check"]'); }
    await page.waitForTimeout(150);
  };
  const conjId = await page.evaluate(() => (content.items["vb-u03-y-sognare"] || content.byUnit.u03.find(i => i.type === "verb")).id);
  const cases = [
    { name: "a conjugation (the verb)", id: conjId, key: "conjugation", box: 2, want: (it) => `${it.it}: ${enList(it).join(", ")}` },
    { name: "a transform (its answer in English)", id: "t-u13-01", key: "transform", box: 2, want: (it) => `In English: ${arr(it.en)[0]}` },
    { name: "Choose the reply (the other person's line)", id: "re-u01-z01", key: "reply", box: 1, want: (it) => `${it.who}: “${it.lineEn}”` },
    { name: "Listen and type (the sentence)", id: "s-u01-01", key: "listen", box: 2, want: (it) => `In English: ${arr(it.en)[0]}` }
  ];
  for (const c of cases) {
    const want = await page.evaluate(([id, f]) => (0, eval)("(" + f + ")")(content.items[id]), [c.id, c.want.toString()]);
    for (const right of [true, false]) {
      const x = await meaningSession(c.id, c.key, c.box);
      if (!x) { check(`${c.name}: built`, false, c.id); break; }
      await answerWith(x, right ? x.right : x.mode === "options" ? await page.evaluate(() => [...document.querySelectorAll("[data-opt]")].map(b => b.dataset.opt).find(o => o !== session.queue[0].ex.correct)) : "zzz");
      const m = await meaningLine(), p = await panel();
      check(`${c.name}, answered ${right ? "right" : "wrong"}: “${want}” in the panel${right ? "" : x.mode === "options" ? ", after the answer" : ", after the answer and what was typed"}`,
        (right ? /Correct/ : /Not quite/).test(p) && m && m.text === want && !x.prompt.includes(want.replace(/^[^:]*: /, "")) && !m.whyBefore && (right || x.mode === "options" || /You typed: zzz/.test(m.before)), JSON.stringify({ m, want, x }));
    }
  }
  { // Which verb? (the Verbs section): the English isn't in the prompt (it would give the answer away) and the panel gives it once
    const v = await page.evaluate(() => {
      const item = content.byUnit.vb.find(i => i.it === "andare" && i.tense === "presente") || content.byUnit.vb[0];
      let ex = null;
      for (let k = 0; k < 400 && !(ex && ex.typeKey === "vinf"); k++) ex = makeExercise(item, { box: 3, due: 0, lapses: 0, lastSeen: 0, lastWrong: 0, seenCount: 3, lastRight: 0 });
      session = { kind: "verbs", unitId: "vb", queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
      S.screen = "session"; S.feedback = null; S.retry = null; resetExState(); render();
      return { key: ex.typeKey, en: arr(item.en)[0], it: item.it, prompt: document.querySelector(".prompt").textContent };
    });
    await page.fill("#answer", "zzz"); await page.click('[data-act="check"]'); await page.waitForTimeout(150);
    const p = await panel();
    check("Which verb?: no English in the prompt, and the panel gives the verb's meaning once", v.key === "vinf" && !v.prompt.includes(v.en) && p.split(v.en).length === 2 && /Not quite/.test(p), JSON.stringify({ v, p }));
  }
  await page.evaluate(() => { session = null; S.feedback = null; S.screen = "home"; render(); });
  check("no script errors", !errors.length, errors.slice(0, 5).join("\n"));
  await context.close();
}
function deaccentCmp(a, b) { const f = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}' ]/gu, "").trim(); return f(a) === f(b); }

(async () => {
  console.log(`Choices test for ${path.relative(process.cwd(), file) || file}`);
  try { nodeChecks(); } catch (e) { results.stopped(e); }
  const { chromium } = loadPlaywright();
  const server = await serveApp(file);
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: !HEADED });
  try { await browserChecks(browser, origin); } catch (e) { results.stopped(e); }
  finally { await browser.close(); server.close(); }
  results.summary();
})();
