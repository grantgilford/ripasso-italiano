/*
  Answering the exercise on the screen as a learner would, by tapping and typing (for test-items and
  test-browsers): the app must be showing a session.

    const { answerOnScreen } = require("./lib/answer");
    const r = await answerOnScreen(page, true, "s-u01-01, box 1");   // true: the right answer; false: a wrong one
    r.done      what was on the screen once the answer was marked: { fb: { ok, given }, mode, typeKey, correct }
    r.problem   or what stopped it, as text: the right answer missing from the options, a screen it can't answer…

  Right: the Got it of a new item's card, a card turned over and marked Got it, the right option, the first
  accepted answer typed, the wrong word tapped and its fix typed, each word sorted and each pair matched, every
  ending and every cell of a verb table filled in, the sentence's words tapped in order. Wrong: a wrong option,
  nonsense typed, Missed, a word that isn't the mistake (or No mistake when there is one; or, where the fix is
  typed, the right word and then nonsense), every word in the wrong group, a slip before the pairs, nonsense in
  every ending and cell, one word where the sentence wants several.
*/
"use strict";

// What is on the screen and what the exercise wants.
const state = (page) => page.evaluate(() => {
  const ex = current().ex;
  const vis = sel => { const e = document.querySelector(sel); return !!(e && e.offsetParent !== null && !e.disabled); };
  return { fb: S.feedback ? { ok: S.feedback.ok, given: S.feedback.given } : null, has: Object.fromEntries(["introDone", "reveal", "gotit", "missed"].map(a => [a, vis(`[data-act="${a}"]`)])),
    opts: vis("[data-opt]"), input: vis("#answer"), mode: ex.mode, typeKey: ex.typeKey,
    correct: String(ex.correct != null ? ex.correct : (Array.isArray(ex.accepted) ? ex.accepted[0] : ex.shownAnswer || "")).replace(/\u0001/g, "") };
});
const tapped = (page) => page.evaluate(() => { const e = current().ex; return { mode: e.mode, at: e.at, fix: e.fix, spotAt: S.spotAt, order: e.order, rows: e.item.rows && e.item.rows.map(r => e.item.groups.indexOf(r.group)), groups: e.item.groups ? e.item.groups.length : 0, n: e.item.pairs ? e.item.pairs.length : 0, blanks: e.cz ? e.cz.blanks.map(b => b[0]) : [], tokens: e.tokens, target: e.targetSeqs && e.targetSeqs[0], accepted: e.accepted,
  cells: e.cells, forms: e.mode === "table" ? e.cells.map(p => [].concat(e.accepted[p])[0]) : null }; });
const optionsShown = (page) => page.$$eval("[data-opt]", es => es.map(e => e.getAttribute("data-opt")));
const clickOpt = (page, o) => page.click(`[data-opt="${o.replace(/["\\]/g, "\\$&")}"]`);

// One step towards an answer, right or wrong. Returns a problem as text, or "".
async function step(page, st, right, tag) {
  if (st.has.introDone) { await page.click('[data-act="introDone"]'); return ""; }
  if (st.has.reveal) { await page.click('[data-act="reveal"]'); return ""; }
  if (st.has.gotit) { await page.click(right ? '[data-act="gotit"]' : '[data-act="missed"]'); return ""; }
  if (["spot", "sort", "match", "fields", "bank", "table"].includes(st.mode)) {
    const ex = await tapped(page);
    if (ex.mode === "table") { // a verb table: every cell
      for (let i = 0; i < ex.cells.length; i++) await page.fill(`#vt${ex.cells[i]}`, right ? ex.forms[i] : "zzqx");
      await page.click('[data-act="checkTable"]');
    } else if (ex.mode === "spot") {
      if (ex.spotAt != null) { await page.fill("#answer", right ? [].concat(ex.accepted)[0] : "zzqx"); await page.click('[data-act="check"]'); } // the typing step
      else if (right || ex.fix) { if (ex.at < 0) await page.click('[data-act="nomistake"]'); else await page.click(`[data-spot="${ex.at}"]`); } // wrong, with a fix to type: the right word, then nonsense
      else if (ex.at < 0) await page.click('[data-spot="0"]'); // wrong: a word of a sentence with no mistake
      else await page.click('[data-act="nomistake"]');         // wrong: No mistake, when there is one
    } else if (ex.mode === "sort") {
      for (const ri of ex.order) await page.click(`[data-sort="${ri}:${right ? ex.rows[ri] : (ex.rows[ri] + 1) % ex.groups}"]`);
      await page.click('[data-act="checkSort"]');
    } else if (ex.mode === "match") {
      if (!right) { await page.click('[data-match="L0"]'); await page.click('[data-match="R1"]'); } // a slip first: the first left with the second right
      for (let i = 0; i < ex.n; i++) { await page.click(`[data-match="L${i}"]`); await page.click(`[data-match="R${i}"]`); }
    } else if (ex.mode === "fields") {
      for (let i = 0; i < ex.blanks.length; i++) await page.fill(`#fld${i}`, right ? ex.blanks[i] : "zz");
      await page.click('[data-act="checkFields"]');
    } else { // word order: the words of the first accepted sentence in order; wrong: only the last of them
      const used = new Set(), picks = [];
      for (const w of ex.target) {
        const i = ex.tokens.findIndex((t, j) => t.n === w && !used.has(j));
        if (i < 0) return `${tag}, word order: the words offered lack “${w}”`;
        used.add(i); picks.push(i);
      }
      for (const i of right ? picks : picks.slice(-1)) await page.click(`[data-pick="${i}"]`);
      await page.click('[data-act="checkBank"]');
    }
    return "";
  }
  if (st.opts) {
    const opts = await optionsShown(page);
    if (!opts.includes(st.correct)) return `${tag}, ${st.typeKey}: the right answer “${st.correct}” isn't among the options (${opts.join(" | ")})`;
    if (opts.length < 2) return `${tag}, ${st.typeKey}: only one option`;
    await clickOpt(page, right ? st.correct : opts.find(o => o !== st.correct)); return "";
  }
  if (st.input) { await page.fill("#answer", right ? st.correct : "zzqx"); await page.click('[data-act="check"]'); return ""; }
  return `${tag}: a screen this test can't answer (${st.typeKey}, ${st.mode})`;
}
async function answerOnScreen(page, right, tag = "") { // { done: the state with feedback } or { problem }
  for (let k = 0; k < 14; k++) {
    const st = await state(page);
    if (st.fb) return { done: st };
    const problem = await step(page, st, right, tag);
    if (problem) return { problem };
  }
  return { problem: `${tag}: no answer was recorded` };
}

module.exports = { answerOnScreen, state };
