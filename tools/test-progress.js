#!/usr/bin/env node
/*
  Progress safety test for index.html.

  Usage:  node tools/test-progress.js [path/to/index.html] [--update-ids] [--headed]

  Opens the real app in a headless browser (Playwright + Chromium) and checks
  that saved progress survives everything the app does with it:

    1. Saved progress in the browser loads intact.
    2. Progress saved under an old item id (ID_ALIASES) moves to the new id.
    3. Progress in the old v1 format still loads.
    4. Practice sessions (grammar, verbs, flashcards) update only what was
       practised, keep everything else, and the result survives a reload.
    5. The synced copy: browser and cloud progress merge without losing
       anything, the old progress/main document is merged once, and what is
       written to the cloud is in the documented format.
    6. A new device with an empty browser gets all its progress from the cloud.
    7. Every item id that has ever had progress still exists or is aliased
       (the list is tools/item-ids.txt; --update-ids adds new ids to it).

  The storage formats are written out here by hand, not borrowed from the app,
  so a change to either format makes this test fail until a migration is
  written and the test is updated with it. Changes nothing in index.html.
  Exits with code 1 if any check fails.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { loadPlaywright, serveApp, checks } = require("./lib/browser");

const args = process.argv.slice(2);
const UPDATE_IDS = args.includes("--update-ids");
const HEADED = args.includes("--headed");
const file = path.resolve(args.find(a => !a.startsWith("--")) || path.join(__dirname, "..", "index.html"));
const IDS_FILE = path.join(__dirname, "item-ids.txt");

const { chromium } = loadPlaywright();

/* ---------- the storage formats, as documented in CLAUDE.md ---------- */
const LS_PROGRESS = "itapp.progress.v1";
const LS_MIGRATED = "itapp.migratedV1";
const SHARDS = 16;
const REC_FIELDS = ["box", "due", "lapses", "lastSeen", "lastWrong", "seenCount", "lastRight"]; // packed in this order
function shardOf(id) { // FNV-1a, 32-bit
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return "s" + String((h >>> 0) % SHARDS).padStart(2, "0");
}
const packRec = r => REC_FIELDS.map(k => r[k] || 0);
const unpackRec = a => Object.fromEntries(REC_FIELDS.map((k, i) => [k, a[i] || 0]));

/* ---------- results ---------- */
const results = checks(), { check, section } = results;
const canon = o => JSON.stringify(o, (k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
const same = (a, b) => canon(a) === canon(b); // ignores the order of keys
const recEq = (a, b) => a && b && REC_FIELDS.every(k => (a[k] || 0) === (b[k] || 0));

/* ---------- a fake cloud database, shaped like window.claude.use("db") ----------
   The documents live here in Node, so they survive page reloads and can be inspected. */
function makeCloud(initial = {}) {
  const docs = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
  const writes = [];
  return {
    docs, writes,
    api: {
      get: p => (docs.has(p) ? JSON.parse(JSON.stringify(docs.get(p))) : null),
      set: (p, body) => { writes.push(p); docs.set(p, JSON.parse(JSON.stringify(body))); return true; },
      del: p => { docs.delete(p); return true; },
      list: col => [...docs.entries()].filter(([k]) => k.startsWith(col + "/") && !k.slice(col.length + 1).includes("/")).map(([k, v]) => [k.slice(col.length + 1), v]),
    },
  };
}
const CLOUD_SHIM = `(() => {
  const listeners = {};
  const fire = async (col) => { for (const [cb] of listeners[col] || []) cb(await snap(col)); };
  const snap = async (col) => ({ docs: (await window.__cloudList(col)).map(([id, data]) => ({ id, data: () => data })) });
  const db = {
    doc: (p) => ({
      get: async () => { const d = await window.__cloudGet(p); return { exists: d != null, data: () => d }; },
      set: async (body) => { await window.__cloudSet(p, body); setTimeout(() => fire(p.split("/")[0]), 0); },
      delete: async () => { await window.__cloudDel(p); setTimeout(() => fire(p.split("/")[0]), 0); },
    }),
    collection: (col) => ({
      get: () => snap(col),
      onSnapshot: (cb, err) => { (listeners[col] = listeners[col] || []).push([cb, err]); setTimeout(() => fire(col), 0); return () => {}; },
    }),
  };
  window.claude = { use: async (name) => name === "db" ? db : null };
})();`;

async function newPage(browser, origin, { storage = null, cloud = null } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", e => { page.__errors = (page.__errors || []).concat(String(e)); });
  if (cloud) {
    await page.exposeFunction("__cloudGet", cloud.api.get);
    await page.exposeFunction("__cloudSet", cloud.api.set);
    await page.exposeFunction("__cloudDel", cloud.api.del);
    await page.exposeFunction("__cloudList", cloud.api.list);
    await page.addInitScript(CLOUD_SHIM);
  }
  if (storage) {
    await page.goto(origin + "/blank");
    await page.evaluate(s => { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); }, storage);
  }
  await page.goto(origin + "/index.html");
  await page.waitForFunction("typeof content !== 'undefined' && content && S.screen === 'home'");
  return { page, context };
}
const stored = (page, key = LS_PROGRESS) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), key);
async function settleSync(page) {
  await page.waitForFunction("dbState === 'on' || dbState === 'off' || dbState === 'error'", null, { timeout: 15000 });
  await page.waitForTimeout(2500); // the app pushes changes 1.5 s after the last one
}

/* ---------- drive a practice session through the screen, as a learner would ---------- */
async function runSession(page, start, maxSteps = 200) {
  await page.click(`[data-start="${start}"]`);
  let answered = 0;
  for (let step = 0; step < maxSteps; step++) {
    const st = await page.evaluate(() => {
      const q = typeof current === "function" ? current() : null, ex = q && q.ex;
      const vis = sel => { const e = document.querySelector(sel); return !!(e && e.offsetParent !== null && !e.disabled); };
      return {
        screen: S.screen, feedback: !!S.feedback, has: Object.fromEntries(["continue", "introDone", "reveal", "gotit", "giveupTable", "giveup", "check"].map(a => [a, vis(`[data-act="${a}"]`)])),
        opts: vis("[data-opt]"), input: vis("#answer"), bank: vis(".options.bank"), mode: ex && !S.feedback ? ex.mode : null,
        correct: ex ? String(ex.correct != null ? ex.correct : (Array.isArray(ex.accepted) ? ex.accepted[0] : ex.shownAnswer || "")).replace(/\u0001/g, "") : "",
      };
    });
    if (st.screen !== "session") return { answered, screen: st.screen };
    const right = answered % 3 !== 2; // two right, one wrong: both paths get exercised
    if (st.has.continue) { await page.waitForTimeout(400); await page.click('[data-act="continue"]'); } // the app ignores taps within 350 ms of answering
    else if (st.has.introDone) await page.click('[data-act="introDone"]');
    else if (st.has.reveal) await page.click('[data-act="reveal"]');
    else if (st.has.gotit) { await page.click(right ? '[data-act="gotit"]' : '[data-act="missed"]'); answered++; }
    else if (st.mode && ["spot", "sort", "match", "fields"].includes(st.mode)) { // the v8.6 exercise types, answered right or wrong through the screen
      const ex = await page.evaluate(() => { const e = current().ex; return { mode: e.mode, at: e.at, fix: e.fix, order: e.order, rows: e.item.rows && e.item.rows.map(r => e.item.groups.indexOf(r.group)), n: e.item.pairs ? e.item.pairs.length : 0, blanks: e.cz ? e.cz.blanks.map(b => b[0]) : [], spotAt: S.spotAt }; });
      if (ex.mode === "spot") {
        if (ex.spotAt != null) { await page.fill("#answer", right ? [].concat(await page.evaluate(() => current().ex.accepted))[0] : "zzzz"); await page.click('[data-act="check"]'); }
        else if (!right) await page.click('[data-act="giveup"]');
        else if (ex.at < 0) await page.click('[data-act="nomistake"]');
        else { await page.click(`[data-spot="${ex.at}"]`); if (ex.fix) continue; } // the typing step comes next
      } else if (ex.mode === "sort") {
        for (const ri of ex.order) await page.click(`[data-sort="${ri}:${right ? ex.rows[ri] : (ex.rows[ri] + 1) % 2}"]`);
        await page.click('[data-act="checkSort"]');
      } else if (ex.mode === "match") {
        if (!right) await page.click(`[data-match="L0"]`), await page.click(`[data-match="R${ex.n - 1}"]`);
        for (let i = 0; i < ex.n; i++) { await page.click(`[data-match="L${i}"]`); await page.click(`[data-match="R${i}"]`); }
      } else {
        for (let i = 0; i < ex.blanks.length; i++) await page.fill(`#fld${i}`, right ? ex.blanks[i] : "zz");
        await page.click('[data-act="checkFields"]');
      }
      answered++;
    }
    else if (st.has.giveupTable) { // a verb table: fill it in (a failed table comes back until it is right)
      await page.evaluate(() => { const ex = current().ex; for (const p of ex.cells) { const el = document.getElementById("vt" + p); if (el) el.value = [].concat(ex.accepted[p])[0]; } });
      await page.click('[data-act="checkTable"]'); answered++;
    }
    else if (st.opts) {
      const opts = await page.$$eval("[data-opt]", es => es.map(e => e.getAttribute("data-opt")));
      const pick = right && opts.includes(st.correct) ? st.correct : opts.find(o => o !== st.correct) || opts[0];
      await page.click(`[data-opt="${pick.replace(/["\\]/g, "\\$&")}"]`); answered++;
    }
    else if (st.input) { await page.fill("#answer", right && st.correct ? st.correct : "zzzz"); await page.click('[data-act="check"]'); answered++; }
    else if (st.bank || st.has.giveup) { await page.click('[data-act="giveup"]'); answered++; }
    else throw new Error("The session reached a screen the test doesn't know how to answer: " + JSON.stringify(st));
  }
  throw new Error(`The ${start} session did not finish within ${maxSteps} steps`);
}

/* ---------- main ---------- */
(async () => {
  const server = await serveApp(file); // the app, plus a blank page on the same origin for seeding storage
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: !HEADED });
  const T = Date.now(), DAY = 864e5;
  try {
    console.log(`Progress test for ${path.relative(process.cwd(), file) || file}`);

    // What the app contains: item ids, which ones share a record, the aliases.
    const { page: probe, context: probeCtx } = await newPage(browser, origin);
    const info = await probe.evaluate(() => ({
      version: APP_VERSION, aliases: ID_ALIASES, canon: content.canon,
      items: Object.values(content.items).map(i => [i.id, i.unit, (content.unitById[i.unit] || {}).mode || "grammar", i.type]),
    }));
    await probeCtx.close();
    console.log(`App version ${info.version}: ${info.items.length} items, ${Object.keys(info.aliases).length} aliases`);
    const itemIds = new Set(info.items.map(i => i[0]));
    const canonicalOf = id => info.canon[id] || id;

    // A realistic saved progress: records across every kind of unit, a month of daily
    // log, flags, accepted synonyms and settings that differ from the defaults.
    const pickN = (filter, n) => { const list = info.items.filter(filter).filter(i => canonicalOf(i[0]) === i[0]); const step = Math.max(1, Math.floor(list.length / n)); return list.filter((_, k) => k % step === 0).slice(0, n).map(i => i[0]); };
    const seedIds = [
      ...pickN(i => i[2] === "grammar", 60), ...pickN(i => i[2] === "verbs", 15), ...pickN(i => i[2] === "flashcards", 25),
    ];
    const mkRec = (k) => ({ box: 1 + (k % 7), due: T + ((k % 5) - 2) * DAY, lapses: k % 3, lastSeen: T - (k % 20 + 1) * DAY, lastWrong: k % 4 ? T - (k % 30 + 2) * DAY : 0, seenCount: 3 + k, lastRight: T - (k % 20 + 1) * DAY });
    const seedItems = Object.fromEntries(seedIds.map((id, k) => [id, mkRec(k)]));
    const days = {};
    for (let d = 1; d <= 30; d++) { const t = new Date(T - d * DAY); days[t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0")] = { xp: 20 + d, new: d % 10, t: { cloze: [d, T - d * DAY] } }; }
    const seed = {
      v: 2, items: seedItems, days,
      flags: { [seedIds[0]]: { id: seedIds[0], note: "test flag", updatedAt: T - DAY } },
      synonyms: { [seedIds[70]]: ["a learner's own answer"] },
      currentUnit: "u05", updatedAt: T - DAY, settingsUpdatedAt: T - 2 * DAY,
      settings: { accents: "strict", typos: false, goal: 50, newPerDay: 15, flipDir: "both", explain: "always", cardsPerSession: 15, newCardsPerSession: 5 },
    };

    /* 1. Saved progress loads intact */
    section("1. Saved progress in the browser loads intact");
    {
      const { page, context } = await newPage(browser, origin, { storage: { [LS_PROGRESS]: seed } });
      const p = await stored(page);
      check("the progress key is unchanged and still holds format v2", p && p.v === 2);
      const inUse = await page.evaluate(ids => ids.filter(id => !progress.items[id]), seedIds);
      check("the app is using the saved progress (not starting afresh)", !inUse.length && (await page.evaluate("progress.currentUnit")) === seed.currentUnit, inUse.length + " records missing from the app's memory");
      const lost = seedIds.filter(id => !recEq(p.items[id], seedItems[id]));
      check(`all ${seedIds.length} item records are unchanged`, !lost.length, lost.slice(0, 5).map(id => `${id}: ${JSON.stringify(seedItems[id])} → ${JSON.stringify(p.items[id])}`).join("\n"));
      check("the daily log is unchanged", same(p.days, seed.days));
      check("flags are unchanged", same(p.flags, seed.flags));
      check("accepted answers (synonyms) are unchanged", same(p.synonyms, seed.synonyms));
      check("settings are unchanged", Object.entries(seed.settings).every(([k, v]) => p.settings[k] === v), JSON.stringify(p.settings));
      check("the current unit is unchanged", p.currentUnit === seed.currentUnit);
      check("no script errors", !page.__errors, page.__errors);
      await context.close();
    }

    /* 2. Aliases */
    section("2. Progress under an old item id moves to the new one");
    {
      const old = Object.keys(info.aliases);
      const items = Object.fromEntries(old.map((id, k) => [id, mkRec(k + 3)]));
      const { page, context } = await newPage(browser, origin, { storage: { [LS_PROGRESS]: { v: 2, items, days: {} } } });
      const p = await stored(page);
      check("no record is left under an old id", old.every(id => !p.items[id]), old.filter(id => p.items[id]).join(", "));
      const bad = old.filter(id => {
        const target = canonicalOf(info.aliases[id]), r = p.items[target], s = items[id];
        return !r || r.box < s.box || r.seenCount < s.seenCount || r.lapses < s.lapses;
      });
      check(`all ${old.length} old records reached their new item with box, count and lapses kept`, !bad.length, bad.map(id => `${id} → ${info.aliases[id]}: ${JSON.stringify(p.items[canonicalOf(info.aliases[id])])}`).join("\n"));
      await context.close();
    }

    /* 3. Format v1 */
    section("3. Progress in the old v1 format still loads");
    {
      const v1 = Object.assign({}, seed, { v: 1 });
      const { page, context } = await newPage(browser, origin, { storage: { [LS_PROGRESS]: v1 } });
      const p = await stored(page);
      check("it is read and saved again as v2", p && p.v === 2);
      check("all item records are kept", seedIds.every(id => recEq(p.items[id], seedItems[id])));
      check("the daily log and settings are kept", same(p.days, seed.days) && p.settings.goal === seed.settings.goal);
      await context.close();
    }

    /* 4. Practice sessions */
    section("4. Practice sessions change only what was practised");
    {
      const { page, context } = await newPage(browser, origin, { storage: { [LS_PROGRESS]: seed } });
      const before = await stored(page);
      const runs = [];
      for (const kind of ["continue", "verbs", "flashcards"]) {
        const has = await page.$(`[data-start="${kind}"]:not([disabled])`);
        if (!has) { check(`the ${kind} session can start`, false, "button missing or disabled"); continue; }
        const r = await runSession(page, kind);
        runs.push(`${kind}: ${r.answered} answers`);
        check(`a ${kind} session runs to the end (${r.answered} answers)`, r.answered > 0 && r.screen === "summary", JSON.stringify(r));
        await page.evaluate(() => { S.screen = "home"; render(); });
      }
      const after = await stored(page);
      const touched = Object.keys(after.items).filter(id => !recEq(after.items[id], before.items[id]));
      const lostIds = Object.keys(before.items).filter(id => !after.items[id]);
      check("no record disappeared", !lostIds.length, lostIds.join(", "));
      check(`some records were updated (${touched.length})`, touched.length > 0);
      const wrongTouch = touched.filter(id => !(after.items[id].lastSeen >= T - 60e3));
      check("every changed record was practised in this run", !wrongTouch.length, wrongTouch.slice(0, 5).map(id => `${id}: ${JSON.stringify(before.items[id])} → ${JSON.stringify(after.items[id])}`).join("\n"));
      const badRec = touched.filter(id => { const r = after.items[id]; return !(r.box >= 0 && r.box <= 7 && r.seenCount >= ((before.items[id] || {}).seenCount || 0)); });
      check("changed records are well formed (box 0–7, count never goes down)", !badRec.length, badRec.slice(0, 5).map(id => id + ": " + JSON.stringify(after.items[id])).join("\n"));
      check("earlier days in the log are unchanged", Object.keys(seed.days).every(d => same(after.days[d], seed.days[d])));
      const todayKey = await page.evaluate(() => dayKey(Date.now()));
      check("today's practice is logged", after.days[todayKey] && after.days[todayKey].xp > 0, JSON.stringify(after.days[todayKey]));
      check("settings, flags and synonyms are unchanged", same(after.settings, before.settings) && same(after.flags, before.flags) && same(after.synonyms, before.synonyms));
      check("no script errors", !page.__errors, page.__errors);
      await page.reload();
      await page.waitForFunction("typeof content !== 'undefined' && content && S.screen === 'home'");
      const reloaded = await stored(page);
      check("everything is still there after a reload", same(reloaded.items, after.items) && same(reloaded.days, after.days));
      await context.close();
    }

    /* 5. The synced copy */
    section("5. The synced copy merges with the browser copy");
    {
      // Browser: the seed. Cloud: an older copy of one record, a newer copy of another,
      // a record only the cloud has, a newer day total, newer settings, a flag, and the
      // old single progress/main document with a record of its own.
      const [a, b, c] = seedIds, onlyCloud = pickN(i => i[2] === "grammar" && !seedItems[i[0]], 1)[0], onlyOld = pickN(i => i[2] === "grammar" && !seedItems[i[0]] && i[0] !== onlyCloud, 2)[1];
      const older = Object.assign({}, seedItems[a], { box: 7, lastSeen: seedItems[a].lastSeen - DAY });
      const newer = Object.assign({}, seedItems[b], { box: 2, lastSeen: T - 3600e3, seenCount: seedItems[b].seenCount + 5 });
      const fresh = mkRec(42);
      const day0 = Object.keys(seed.days)[0];
      const cloudSettings = Object.assign({}, seed.settings, { goal: 80 });
      const initial = {
        "progress2/meta": { v: 2, settings: cloudSettings, settingsUpdatedAt: T - 3600e3, currentUnit: "u07", updatedAt: T - 3 * DAY, resetAt: 0, synonyms: {} },
        ["progress2/days_" + day0.slice(0, 4)]: { days: { [day0]: { xp: 999, new: 1 } } },
        "flags/cloud-flag": { id: c, note: "flagged on the phone", updatedAt: T - 3600e3 },
        "progress/main": { v: 1, items: { [onlyOld]: mkRec(7) }, days: {} },
      };
      for (const [id, r] of [[a, older], [b, newer], [onlyCloud, fresh]]) {
        const s = "progress2/" + shardOf(id);
        initial[s] = initial[s] || { items: {} };
        initial[s].items[id] = packRec(r);
      }
      const cloud = makeCloud(initial);
      const { page, context } = await newPage(browser, origin, { storage: { [LS_PROGRESS]: seed }, cloud });
      await settleSync(page);
      check("cloud sync switched on", (await page.evaluate("dbState")) === "on");
      const p = await stored(page);
      check("a record only in the browser is kept", recEq(p.items[c], seedItems[c]));
      check("a record only in the cloud is added", recEq(p.items[onlyCloud], fresh));
      check("where both have a record, the more recently practised one wins (browser newer)", recEq(p.items[a], seedItems[a]), JSON.stringify(p.items[a]));
      check("where both have a record, the more recently practised one wins (cloud newer)", recEq(p.items[b], newer), JSON.stringify(p.items[b]));
      check("the old progress/main document is merged in", recEq(p.items[onlyOld], mkRec(7)));
      check("…and only once: the device remembers it", (await stored(page, LS_MIGRATED)) === true);
      check("all other browser records are kept", seedIds.filter(id => id !== b).every(id => recEq(p.items[id], seedItems[id])));
      check("day totals keep the higher figure", p.days[day0].xp === 999);
      check("the newer settings win", p.settings.goal === 80);
      check("flags from both copies are kept", p.flags[seedIds[0]] && p.flags["cloud-flag"]);

      // What the app wrote back, read in the documented format.
      check("progress/main is never written", !cloud.writes.includes("progress/main"));
      const shardDocs = [...cloud.docs.keys()].filter(k => /^progress2\/s\d\d$/.test(k));
      const strayDocs = [...cloud.docs.keys()].filter(k => k.startsWith("progress2/") && !/^progress2\/(meta|days_\d{4}|s\d\d)$/.test(k));
      check("the cloud holds only meta, days_YYYY and s00–s15 documents", !strayDocs.length && shardDocs.every(k => Number(k.slice(-2)) < SHARDS), strayDocs.join(", "));
      const misplaced = [];
      const cloudItems = {};
      for (const k of shardDocs) for (const [id, packed] of Object.entries(cloud.docs.get(k).items || {})) {
        if ("progress2/" + shardOf(id) !== k) misplaced.push(`${id} in ${k}`);
        if (!Array.isArray(packed) || packed.length !== REC_FIELDS.length) misplaced.push(`${id}: not a ${REC_FIELDS.length}-number array`);
        cloudItems[id] = unpackRec(packed);
      }
      check("every record sits in the shard its id hashes to, packed as [box, due, lapses, lastSeen, lastWrong, seenCount, lastRight]", !misplaced.length, misplaced.slice(0, 5).join("\n"));
      const missing = Object.keys(p.items).filter(id => !recEq(cloudItems[id], p.items[id]));
      check(`the cloud copy matches the browser copy (${Object.keys(p.items).length} records)`, !missing.length, missing.slice(0, 5).map(id => `${id}: browser ${JSON.stringify(p.items[id])}, cloud ${JSON.stringify(cloudItems[id])}`).join("\n"));
      const meta = cloud.docs.get("progress2/meta") || {};
      check("meta holds the settings and current unit", meta.settings && meta.settings.goal === p.settings.goal && meta.currentUnit === p.currentUnit, JSON.stringify(meta).slice(0, 200));
      const cloudDays = Object.assign({}, ...[...cloud.docs.keys()].filter(k => /^progress2\/days_/.test(k)).map(k => cloud.docs.get(k).days));
      check("the daily log is in the cloud, filed by year", Object.keys(p.days).every(d => same(cloudDays[d], p.days[d]) && cloud.docs.has("progress2/days_" + d.slice(0, 4))));

      // Practise, then make sure the cloud is brought up to date.
      await runSession(page, "continue");
      await page.evaluate(() => { S.screen = "home"; render(); });
      await settleSync(page);
      const p2 = await stored(page);
      const cloudItems2 = {};
      for (const k of [...cloud.docs.keys()].filter(k => /^progress2\/s\d\d$/.test(k))) for (const [id, packed] of Object.entries(cloud.docs.get(k).items || {})) cloudItems2[id] = unpackRec(packed);
      const stale = Object.keys(p2.items).filter(id => !recEq(cloudItems2[id], p2.items[id]));
      check("after practice, the cloud copy is brought up to date", !stale.length, stale.slice(0, 5).join(", "));
      check("no script errors", !page.__errors, page.__errors);
      await context.close();

      /* 6. A new device */
      section("6. A new device gets everything from the cloud");
      const { page: fresh2, context: ctx2 } = await newPage(browser, origin, { storage: {}, cloud });
      await settleSync(fresh2);
      const p3 = await stored(fresh2);
      const notRestored = Object.keys(p2.items).filter(id => !recEq(p3.items[id], p2.items[id]));
      check(`all ${Object.keys(p2.items).length} records arrive on the new device`, !notRestored.length, notRestored.slice(0, 5).join(", "));
      check("the daily log arrives too", same(p3.days, p2.days), "days that differ: " + [...new Set([...Object.keys(p2.days), ...Object.keys(p3.days)])].filter(d => !same(p2.days[d], p3.days[d])).map(d => `${d}: had ${JSON.stringify(p2.days[d])}, new device ${JSON.stringify(p3.days[d])}`).join("; "));
      check("the settings arrive too", same(p3.settings, p2.settings), `had ${JSON.stringify(p2.settings)}\nnew device ${JSON.stringify(p3.settings)}`);
      check("the current unit arrives too", p3.currentUnit === p2.currentUnit, `had ${p2.currentUnit}, new device ${p3.currentUnit}`);
      await ctx2.close();
    }

    /* 7. Item ids */
    section("7. Every item that may hold progress still exists");
    {
      const known = fs.existsSync(IDS_FILE) ? fs.readFileSync(IDS_FILE, "utf8").split("\n").map(s => s.trim()).filter(Boolean) : [];
      if (!known.length && !UPDATE_IDS) check("the id list tools/item-ids.txt exists (create it with --update-ids)", false);
      const gone = known.filter(id => !itemIds.has(id) && !(info.aliases[id] && itemIds.has(info.aliases[id])));
      check(`all ${known.length} known ids are still items or are mapped in ID_ALIASES`, !gone.length, gone.length + " missing: " + gone.slice(0, 20).join(", ") + "\nMap each one in ID_ALIASES to the item that should keep its progress.");
      const added = [...itemIds, ...Object.keys(info.aliases)].filter(id => !known.includes(id)); // old aliased ids too, so dropping an alias is caught
      if (UPDATE_IDS && added.length) {
        fs.writeFileSync(IDS_FILE, known.concat(added.sort()).join("\n") + "\n");
        console.log(`         added ${added.length} new ids to tools/item-ids.txt`);
      } else if (added.length) console.log(`  note ${added.length} new items are not in tools/item-ids.txt yet; run with --update-ids to add them`);
    }
  } catch (e) {
    results.stopped(e);
  } finally {
    await browser.close();
    server.close();
  }
  results.summary();
})();
