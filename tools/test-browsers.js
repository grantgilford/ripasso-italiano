#!/usr/bin/env node
/*
  The other-browsers test: the app in Firefox and WebKit (Safari's engine), from 9.26.

  Usage:  node tools/test-browsers.js [--browsers firefox,webkit,chromium] [--require] [path/to/index.html]

  Every other browser test runs in Chromium, which is what Chrome on Android is. This opens the app in
  Firefox and in WebKit and does, in each, what a learner's first days do:

    1. progress saved by an older version (in localStorage) is moved to IndexedDB as the app first opens,
       record for record, and the old copy is left as it was;
    2. one whole session of each kind is completed through the screen, by tapping and typing: a grammar
       session (Continue), a Flashcards session and a Verbs session, every answer right;
    3. after a reload the progress is there: the records the sessions made, the day's XP, Today showing it;
    4. a backup file is loaded on Your data and merged in;
    5. the theme is switched to Dark and back, and Dark is painted before the app starts after a reload;
    6. with no script errors and nothing logged as an error.

  Anything that fails only here is a real difference between browsers: report it, don't work around it
  in the test.

  Which browsers: Firefox and WebKit, where Playwright has them installed (npx playwright install firefox
  webkit; GitHub installs them). Where neither is installed, as in a Claude Code cloud session, which has
  only Chromium, the same checks are run in Chromium instead and the test says so plainly: that shows
  the test works, not that the other browsers do. --require fails instead when Firefox or WebKit is
  missing (GitHub runs it so); --browsers names the browsers to use.

  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { loadPlaywright, serveApp, checks, stored, storedRows } = require("./lib/browser");
const { answerOnScreen } = require("./lib/answer");

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const REQUIRE = args.includes("--require");
const NAMED = (opt("--browsers") || "").split(",").filter(Boolean);
const file = path.resolve(args.find((a, i) => a.endsWith(".html") && args[i - 1] !== "--browsers") || path.join(__dirname, "..", "index.html"));
const pw = loadPlaywright();
const T = checks(), { check, section } = T;
const ready = "typeof content !== 'undefined' && content && typeof S !== 'undefined' && S.screen === 'home'";
const sorted = (v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v;
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b)); // whatever the order of the keys
const LABEL = { firefox: "Firefox", webkit: "WebKit", chromium: "Chromium" };

async function inBrowser(name, origin) {
  const B = LABEL[name], browser = await pw[name].launch();
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
    const version = await browser.version();
    section(`${B} ${version}`);

    /* 1. the move from localStorage */
    await page.goto(origin + "/blank");
    const old = await page.evaluate(() => {
      const T = Date.now(), D = 864e5;
      const rec = (box, k) => ({ box, due: T + (k % 2 ? 3 : -1) * D, lapses: k % 3, lastSeen: T - (k + 1) * D, lastWrong: k % 3 ? T - (k + 2) * D : 0, seenCount: box + 2, lastRight: T - (k + 1) * D });
      const p = { v: 2, items: {}, days: {}, flags: {}, currentUnit: null, settingsUpdatedAt: T - D, updatedAt: T - D,
        settings: { accents: "lenient", typos: true, goal: 30, newPerDay: 10, flipDir: "both", explain: "wrong", cardsPerSession: 6, newCardsPerSession: 6, fcDir: "it-en", lessonLength: 6, verbsPerSession: 3, verbNewPerSession: 3, verbUnlockBox: 5 } };
      ["v-io", "v-tu", "v-lui", "v-lei", "v-noi", "v-voi", "v-loro"].forEach((id, k) => p.items[id] = rec(1 + k, k));
      p.days["2026-01-05"] = { xp: 31, new: 7, t: { all: [9, 12], recall: [4, 6] } };
      localStorage.setItem("itapp.progress.v1", JSON.stringify(p));
      localStorage.setItem("itapp.seen.v1", JSON.stringify("9.25"));
      localStorage.setItem("itapp.theme.v1", JSON.stringify("light"));
      return { p, text: localStorage.getItem("itapp.progress.v1") };
    });
    await page.goto(origin + "/index.html"); await page.waitForFunction(ready);
    const st = await page.evaluate(() => ({ status: Store.status(), ids: Object.keys(content.items).length, known: ["v-io", "v-loro"].every(id => content.items[id]), ls: localStorage.getItem("itapp.progress.v1") }));
    check(`${B}: the app opens`, st.ids > 19000 && st.known, `${st.ids} items`);
    check(`${B}: saved data is kept in IndexedDB`, st.status.backend === "idb", JSON.stringify(st.status));
    const moved = await stored(page), rows = await storedRows(page);
    check(`${B}: the progress an older version left in localStorage is moved, record for record`, moved && same(moved.items, old.p.items) && same(moved.days["2026-01-05"], old.p.days["2026-01-05"]) && moved.settings.lessonLength === 6, JSON.stringify(moved && moved.items).slice(0, 300));
    check(`${B}: the move is recorded as done, and the old copy is left exactly as it was`, rows && JSON.parse(rows["store.migration"] || "{}").state === "done" && st.ls === old.text, rows && rows["store.migration"]);
    check(`${B}: the other saved values moved too (the theme, What's new)`, (await stored(page, "itapp.theme.v1")) === "light" && (await stored(page, "itapp.seen.v1")) === "9.25");
    const gotIt = await page.$('#n-new [data-act], [data-act="seenNew"]'); if (gotIt) await gotIt.click().catch(() => { }); // the What's new card, if it is in the way

    /* 2. one whole session of each kind, through the screen */
    const done = {};
    for (const [kind, start] of [["grammar", '[data-start="continue"]'], ["flashcards", '[data-start="flashcards"]'], ["Verbs", '[data-start="verbs"]']]) {
      await page.evaluate(() => { if (S.screen !== "home") { S.screen = "home"; render(); } window.scrollTo(0, 0); });
      await page.click(start);
      const began = await page.evaluate(() => S.screen === "session" && session ? { kind: session.kind, n: session.queue.length } : null);
      check(`${B}: a ${kind} session starts from Today`, began && began.n > 0, JSON.stringify(began));
      if (!began) continue;
      let answered = 0, problem = "";
      for (let k = 0; k < 80; k++) {
        if (await page.evaluate(() => S.screen !== "session")) break;
        const r = await answerOnScreen(page, true, `${kind} exercise ${k + 1}`);
        if (r.problem) { problem = r.problem; break; }
        if (!r.done.fb.ok) { problem = `${kind} exercise ${k + 1} (${r.done.typeKey}): answered “${r.done.correct}”, the right answer, but marked wrong`; break; }
        answered++;
        await page.waitForFunction(() => Date.now() - S.answeredAt > 350); // the app ignores Continue for a moment after an answer, against a double tap
        await page.click('[data-act="continue"]');
      }
      const end = await page.evaluate(() => ({ screen: S.screen, finished: !!(session && session.finished), xp: session ? session.xp : 0, correct: session ? session.correct : 0, answered: session ? session.answered : 0 }));
      check(`${B}: the ${kind} session is completed by tapping and typing, every answer marked right (${end.answered} exercises)`, !problem && end.answered >= began.n && end.screen === "summary" && end.finished && end.correct === end.answered, problem || JSON.stringify(end));
      done[kind] = { answered, xp: end.xp };
      if (end.screen === "summary") await page.click('[data-go="home"]');
    }

    /* 3. after a reload */
    const before = await page.evaluate(async () => { await Store.flush(); return { items: Object.keys(progress.items).length, xp: today().xp, day: dayKey(now()) }; });
    await page.reload(); await page.waitForFunction(ready);
    const after = await page.evaluate(() => ({ items: Object.keys(progress.items).length, xp: (progress.days[dayKey(now())] || {}).xp || 0, ring: (document.querySelector(".home-meta .ring") || {}).getAttribute ? document.querySelector(".home-meta .ring").getAttribute("aria-label") : "", verbs: Object.keys(progress.items).filter(id => /^vg-/.test(id)).length, cards: Object.keys(progress.items).filter(id => /^fc/.test(id)).length }));
    const xp = Object.values(done).reduce((n, d) => n + d.xp, 0);
    check(`${B}: after a reload the sessions' progress is there (${after.items} records, ${after.xp} XP today)`, after.items === before.items && after.items > 7 && after.xp === before.xp && after.xp === xp && xp > 0 && after.verbs > 0 && after.cards > 0, JSON.stringify({ before, after, xp }));
    check(`${B}: Today shows the day's XP`, after.ring === `Today: ${after.xp} of 30 XP`, after.ring);
    const kept = await stored(page);
    check(`${B}: the storage itself holds it, with the records moved from the old copy`, kept && Object.keys(kept.items).length === after.items && ["v-tu", "v-loro"].every(id => kept.items[id] && kept.items[id].box >= old.p.items[id].box), "");

    /* 4. a backup file loaded */
    const extra = await page.evaluate(() => Object.keys(content.items).find(id => /^s-u19-/.test(id) && !progress.items[id]));
    const backup = { v: 2, items: { [extra]: { box: 4, due: Date.now() + 864e5, lapses: 1, lastSeen: Date.now() - 1000, lastWrong: 0, seenCount: 6, lastRight: Date.now() - 1000 } }, days: { "2026-01-06": { xp: 44, new: 3 } }, flags: {}, settings: old.p.settings, settingsUpdatedAt: 1, updatedAt: Date.now() };
    await page.click('.tab[data-go="you"]'); await page.click('[data-go="data"]');
    await page.setInputFiles("#progressFile", { name: "ripasso-backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
    await page.waitForFunction((id) => !!progress.items[id], extra, { timeout: 10000 }).catch(() => { });
    const merged = await page.evaluate(async (id) => { await Store.flush(); return { rec: progress.items[id], n: Object.keys(progress.items).length, day: progress.days["2026-01-06"], report: S.report || "" }; }, extra);
    check(`${B}: a backup file chosen on Your data is merged in, and nothing already there is lost`, merged.rec && merged.rec.box === 4 && merged.n === after.items + 1 && merged.day && merged.day.xp === 44 && /^Backup loaded/.test(merged.report), JSON.stringify(merged).slice(0, 300));
    const keptB = await stored(page);
    check(`${B}: … and saved`, keptB && keptB.items[extra] && keptB.items[extra].box === 4 && Object.keys(keptB.items).length === merged.n);

    /* 5. the theme */
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg();
    await page.click('.tab[data-go="you"]');
    await page.click('[data-appearance="dark"]');
    const dark = await bg();
    check(`${B}: Appearance › Dark switches the colours`, (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "dark" && dark !== light && dark === "rgb(14, 21, 18)", `${light} → ${dark}`);
    await page.addInitScript(() => { // the theme the page has before the app's script runs: looked at as the body first appears
      new MutationObserver((_, obs) => { if (document.body) { window.__themeAtBody = document.documentElement.getAttribute("data-theme"); obs.disconnect(); } }).observe(document, { childList: true, subtree: true });
    });
    await page.reload(); await page.waitForFunction(ready);
    check(`${B}: after a reload Dark is set before the page is drawn, and kept`, (await page.evaluate(() => window.__themeAtBody)) === "dark" && (await bg()) === dark && (await stored(page, "itapp.theme.v1")) === "dark", String(await page.evaluate(() => window.__themeAtBody)));
    await page.click('.tab[data-go="you"]'); await page.click('[data-appearance="light"]');
    check(`${B}: Light switches back`, (await bg()) === light && (await page.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light", await bg());

    /* 6. errors */
    check(`${B}: no script errors, and nothing logged as an error`, !errors.length, errors.slice(0, 6).join("\n"));
  } catch (e) {
    check(`${B}: the test ran to its end`, false, String(e && e.stack || e) + (errors.length ? "\nscript errors: " + errors.slice(0, 4).join("\n") : ""));
  } finally { await browser.close(); }
}

(async () => {
  const installed = (name) => { try { return fs.existsSync(pw[name].executablePath()); } catch (e) { return false; } };
  const wanted = NAMED.length ? NAMED : ["firefox", "webkit"];
  for (const n of wanted) if (!LABEL[n]) { console.error(`${n} is not a browser this test knows (firefox, webkit, chromium).`); process.exit(2); }
  const missing = wanted.filter(n => !installed(n));
  let browsers = wanted.filter(installed);
  console.log(`Other-browsers test for ${path.basename(file)}`);
  if (missing.length && (REQUIRE || NAMED.length)) check(`${missing.map(n => LABEL[n]).join(" and ")} installed for Playwright`, false, "install with: npx playwright install --with-deps " + missing.join(" "));
  else if (missing.length) {
    console.log(`\n  NOTE ${missing.map(n => LABEL[n]).join(" and ")} ${missing.length > 1 ? "are" : "is"} not installed here, so ${browsers.length ? "only " + browsers.map(n => LABEL[n]).join(" and ") + " was tested" : "the same checks were run in Chromium instead"}.`
      + `\n       That shows this test works; it says nothing about ${missing.map(n => LABEL[n]).join(" or ")}. GitHub runs it in both (npx playwright install firefox webkit to run it here).`);
    if (!browsers.length) browsers = ["chromium"];
  }
  const server = await serveApp(file), origin = `http://127.0.0.1:${server.address().port}`;
  for (const name of browsers) await inBrowser(name, origin);
  server.close();
  T.summary();
})().catch(e => { T.stopped(e); T.summary(); });
