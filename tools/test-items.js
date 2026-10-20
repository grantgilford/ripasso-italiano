#!/usr/bin/env node
/*
  Item test for index.html: every exercise a unit's items can produce,
  answered right through the real screen.

  Usage:  node tools/test-items.js u19 [u17 …] [--ids s-u17-p01,g-u17-p01] [--repeats 4]

  Opens the real app in a headless browser (Playwright + Chromium) and, for
  every item in the named units (and any ids listed with --ids), builds its
  exercise as a new item (box 0), a half-learned one (boxes 1 and 3) and a
  learned one (box 5), each --repeats times (default 4), since the app picks
  the exercise at random: flip cards, meaning, typed recall, fill in the
  blank with and without options, word order, translate, grammar questions,
  transforms, spot the mistake (tap and type), endings, replies, sort and
  match. Each is answered the right way by tapping and typing, as a learner
  would, and must be marked right. It also checks that the right answer is
  among the options offered. Listen and type needs a voice, so it isn't
  built here; tools/test-ui.js covers it.

  Use it after adding items, beside node tools/check-content.js, which checks
  the data; this checks that the app accepts the answers the data intends.
  Changes nothing in index.html. Exits with code 1 if any check fails.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const REPEATS = Number(opt("--repeats") || 4);
const extraIds = (opt("--ids") || "").split(",").filter(Boolean);
const units = args.filter((a, i) => !a.startsWith("--") && !["--repeats", "--ids"].includes(args[i - 1]) && !a.endsWith(".html"));
const file = path.resolve(args.find(a => a.endsWith(".html")) || path.join(__dirname, "..", "index.html"));
if (!units.length && !extraIds.length) { console.log("Usage: node tools/test-items.js u19 [u17 …] [--ids id1,id2] [--repeats 4]"); process.exit(1); }

function loadPlaywright() {
  try { return require("playwright"); } catch (e) { }
  try { return require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch (e) { }
  console.error("Playwright is not installed. Install it with: npm install -g playwright");
  process.exit(2);
}
const { chromium } = loadPlaywright();

(async () => {
  const html = fs.readFileSync(file);
  const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(() => typeof content !== "undefined" && content && content.byUnit);

  const ids = await page.evaluate(([units, extra]) => {
    const missing = units.filter(u => !content.byUnit[u]).concat(extra.filter(id => !content.items[id]));
    if (missing.length) return { missing };
    return { ids: units.flatMap(u => content.byUnit[u].map(i => i.id)).concat(extra) };
  }, [units, extraIds]);
  if (ids.missing) { console.error("Not found: " + ids.missing.join(", ")); process.exit(1); }

  const bad = [], kinds = {};
  let answered = 0;
  for (const id of ids.ids) for (const box of [0, 1, 3, 5]) for (let k = 0; k < REPEATS; k++) {
    const made = await page.evaluate(([id, box]) => { // a one-exercise session for this item at this box
      const it = content.items[id];
      const ex = makeExercise(it, Object.assign({}, rec(id), { box }));
      if (!ex) return null;
      session = { kind: "unit", unitId: it.unit, queue: [{ ex, repeat: false }], pos: 0, done: 0, total: 1, correct: 0, answered: 0, xp: 0, promoted: 0, missed: [], missedIds: new Set(), finished: false };
      S.screen = "session"; S.feedback = null; S.revealed = false; S.picked = null; S.bankPicked = []; resetExState(); render();
      return ex.typeKey;
    }, [id, box]);
    if (!made) { bad.push(`${id}, box ${box}: no exercise is built`); continue; }
    kinds[made] = (kinds[made] || 0) + 1;
    let done = null;
    for (let step = 0; step < 12 && !done; step++) {
      const st = await page.evaluate(() => {
        const ex = current().ex;
        const vis = sel => { const e = document.querySelector(sel); return !!(e && e.offsetParent !== null && !e.disabled); };
        return { fb: S.feedback ? { ok: S.feedback.ok, given: S.feedback.given } : null, has: Object.fromEntries(["introDone", "reveal", "gotit"].map(a => [a, vis(`[data-act="${a}"]`)])),
          opts: vis("[data-opt]"), input: vis("#answer"), mode: ex.mode, typeKey: ex.typeKey,
          correct: String(ex.correct != null ? ex.correct : (Array.isArray(ex.accepted) ? ex.accepted[0] : ex.shownAnswer || "")).replace(/\u0001/g, "") };
      });
      if (st.fb) { done = st; break; }
      if (st.has.introDone) { await page.click('[data-act="introDone"]'); continue; }
      if (st.has.reveal) { await page.click('[data-act="reveal"]'); continue; }
      if (st.has.gotit) { await page.click('[data-act="gotit"]'); continue; }
      if (["spot", "sort", "match", "fields", "bank"].includes(st.mode)) {
        const ex = await page.evaluate(() => { const e = current().ex; return { mode: e.mode, at: e.at, spotAt: S.spotAt, order: e.order, rows: e.item.rows && e.item.rows.map(r => e.item.groups.indexOf(r.group)), n: e.item.pairs ? e.item.pairs.length : 0, blanks: e.cz ? e.cz.blanks.map(b => b[0]) : [], tokens: e.tokens, target: e.targetSeqs && e.targetSeqs[0], accepted: e.accepted }; });
        if (ex.mode === "spot") {
          if (ex.spotAt != null) { await page.fill("#answer", [].concat(ex.accepted)[0]); await page.click('[data-act="check"]'); } // the typing step
          else if (ex.at < 0) await page.click('[data-act="nomistake"]');
          else await page.click(`[data-spot="${ex.at}"]`);
        } else if (ex.mode === "sort") {
          for (const ri of ex.order) await page.click(`[data-sort="${ri}:${ex.rows[ri]}"]`);
          await page.click('[data-act="checkSort"]');
        } else if (ex.mode === "match") {
          for (let i = 0; i < ex.n; i++) { await page.click(`[data-match="L${i}"]`); await page.click(`[data-match="R${i}"]`); }
        } else if (ex.mode === "fields") {
          for (let i = 0; i < ex.blanks.length; i++) await page.fill(`#fld${i}`, ex.blanks[i]);
          await page.click('[data-act="checkFields"]');
        } else { // word order: tap the words of the first accepted sentence, in order
          const used = new Set();
          for (const w of ex.target) {
            const i = ex.tokens.findIndex((t, j) => t.n === w && !used.has(j));
            if (i < 0) { bad.push(`${id}, box ${box}, word order: the words offered lack “${w}”`); break; }
            used.add(i); await page.click(`[data-pick="${i}"]`);
          }
          await page.click('[data-act="checkBank"]');
        }
        continue;
      }
      if (st.opts) {
        const opts = await page.$$eval("[data-opt]", es => es.map(e => e.getAttribute("data-opt")));
        if (!opts.includes(st.correct)) { bad.push(`${id}, box ${box}, ${st.typeKey}: the right answer “${st.correct}” isn't among the options (${opts.join(" | ")})`); break; }
        if (opts.length < 2) bad.push(`${id}, box ${box}, ${st.typeKey}: only one option`);
        await page.click(`[data-opt="${st.correct.replace(/["\\]/g, "\\$&")}"]`); continue;
      }
      if (st.input) { await page.fill("#answer", st.correct); await page.click('[data-act="check"]'); continue; }
      bad.push(`${id}, box ${box}: a screen this test can't answer (${st.typeKey}, ${st.mode})`); break;
    }
    if (!done) { if (!bad.some(b => b.startsWith(id + ", box " + box))) bad.push(`${id}, box ${box}: no answer was recorded`); continue; }
    answered++;
    if (!done.fb.ok) bad.push(`${id}, box ${box}, ${done.typeKey}: answered “${done.correct}”, the right answer, but marked wrong`);
  }
  await browser.close(); server.close();

  console.log(`Item test for ${path.basename(file)}: ${ids.ids.length} items, ${answered} exercises answered right through the screen`);
  console.log("  by type: " + Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(", "));
  const problems = [...new Set(bad)].concat(errors.map(e => "script error: " + e));
  if (problems.length) { console.log(`\n${problems.length} problem(s):\n  ` + problems.join("\n  ")); process.exit(1); }
  console.log("\nEvery answer was marked right, with no script errors.");
})().catch(e => { console.error(e); process.exit(1); });
