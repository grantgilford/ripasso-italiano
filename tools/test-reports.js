#!/usr/bin/env node
/*
  Reports test (from 9.19): the reports the app writes, the issue forms they fill in and tools/read-reports.js.

  Usage:  node tools/test-reports.js [path/to/index.html]

  In Node, with the app's own functions (no browser needed, a few seconds). It checks that:
    1. the app's report text (reportText) starts "Ripasso report 1", has one "key: value" line per field
       given, in order, leaves empty fields out and indents a value's further lines by two spaces;
    2. read-reports.js reads back every field exactly, from the app's own text and from the same text
       wrapped as it arrives: a GitHub issue (a heading and a code fence round it), an email (quoted "> "),
       several reports one after another, with other text around them;
    3. GitHub's address (issueLink) opens the issue form for each kind, from a file that exists in
       .github/ISSUE_TEMPLATE, whose field "report" (and nothing else) it fills in, with the title, for the
       repository in REPORT_TO; it stays within REPORT_URL_MAX (6,000 characters), and a report too long for
       it gives the form with only its title (full: false); the email address (mailLink) does the same;
       with no repository or address, there is no link;
    4. each issue form adds its label (content, missing-answer, app), keeps the field ids the address uses,
       and config.yml is there;
    5. the sample reports in tools/samples/reports.txt are all read, and read-reports.js runs on them,
       following a removed id through ID_ALIASES, printing each item as it stands and its lesson section.

  Changes nothing. Exits with code 1 if any check fails.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadApp } = require("./lib/load-app");
const { checks } = require("./lib/browser");
const { parseReports } = require("./read-reports");

const file = path.resolve(process.argv[2] || path.join(__dirname, "..", "index.html"));
const T = checks(), { check, section } = T;
const ROOT = path.join(__dirname, "..");
const FORMS = path.join(ROOT, ".github", "ISSUE_TEMPLATE");

const app = loadApp("buildContent, getContent: () => content, reportText, issueLink, mailLink, REPORT_HEAD, REPORT_FORMS, REPORT_URL_MAX, ID_ALIASES", { file });
app.buildContent();
const content = app.getContent();
const html = fs.readFileSync(file, "utf8");
const toMatch = html.match(/const REPORT_TO = (\{[^}]*\})/);
const REPORT_TO = toMatch ? Function("return " + toMatch[1])() : null;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log(`Reports test for ${path.relative(process.cwd(), file) || file}`);
try {
  section("1. The app's report text");
  const fields = [["kind", "content problem"], ["app version", "9.19"], ["copy", "installed"], ["item", "s-u05-03"], ["unit", "u05 (Verb tenses)"], ["exercise", "Fill in the blank"],
    ["shown", "Io ___ alle sei. (finire)"], ["expected", "finisco"], ["given", ""], ["note", "Line one,\r\nline two: with a colon\n\n  line three  "]];
  const text = app.reportText(fields), lines = text.split("\n");
  check("it starts with Ripasso report 1", lines[0] === "Ripasso report 1" && app.REPORT_HEAD === "Ripasso report 1", lines[0]);
  check("one key: value line per field, in order, empty ones left out", same(lines.filter(l => !l.startsWith("  ")).slice(1).map(l => l.split(": ")[0]), fields.filter(f => f[1]).map(f => f[0])), text);
  check("a value's further lines are indented by two spaces, its blank lines left out", lines.slice(-3).join("|") === "note: Line one,|  line two: with a colon|  line three", text);

  section("2. read-reports.js reads them back");
  const want = Object.fromEntries(fields.filter(f => f[1]).map(([k, v]) => [k, String(v).split(/\r\n|\r|\n/).map(x => x.trim()).filter(Boolean).join("\n")]));
  const back = (t) => parseReports(t).map(r => r.fields);
  check("the app's text, read back field by field", same(back(text), [want]), JSON.stringify(back(text)));
  check("…from a GitHub issue (heading and code fence round it)", same(back("### Report\n\n```text\n" + text + "\n```\n\n### Anything to add?\n\n_No response_"), [want]));
  check("…from an email, quoted", same(back("On Monday someone wrote:\n" + text.split("\n").map(l => "> " + l).join("\n") + "\n>\n> Thanks"), [want]));
  check("…several, one after another, with text around them", same(back("Hello\n\n" + text + "\n\n" + text + "\nBye"), [want, want]));
  const two = parseReports(text + "\n" + app.reportText([["kind", "app problem"], ["errors", "a\nb"]]));
  check("…and a report starts where the next one's first line is, even without a blank line", two.length === 2 && two[1].fields.errors === "a\nb");

  section("3. The links that send a report");
  check("REPORT_TO names this repository, beside APP_VERSION", REPORT_TO && REPORT_TO.github === "grantgilford/ripasso-italiano" && /const APP_VERSION[^\n]*\n(?:const CHANGES[^\n]*\n)const REPORT_TO/.test(html), JSON.stringify(REPORT_TO));
  const rep = (kind, t) => ({ kind, title: "u05 · s-u05-03 · something", text: t || text });
  for (const kind of Object.keys(app.REPORT_FORMS)) {
    const l = app.issueLink(rep(kind), REPORT_TO), u = new URL(l.url);
    const params = [...u.searchParams.keys()];
    check(`${kind}: GitHub's new-issue form of the repository, from ${app.REPORT_FORMS[kind]}, which exists`, u.origin + u.pathname === `https://github.com/${REPORT_TO.github}/issues/new` && u.searchParams.get("template") === app.REPORT_FORMS[kind] && fs.existsSync(path.join(FORMS, app.REPORT_FORMS[kind])), l.url.slice(0, 160));
    check(`${kind}: the title and the report filled in, and nothing else`, l.full && same(params, ["template", "title", "report"]) && u.searchParams.get("title") === "u05 · s-u05-03 · something" && u.searchParams.get("report") === text && l.url.length <= app.REPORT_URL_MAX, params.join());
  }
  const long = Array.from({ length: 40 }, () => text).join("\n\n"), ll = app.issueLink(rep("content problem", long), REPORT_TO);
  check(`a report too long for the address (${encodeURIComponent(long).length} characters encoded) opens the form with only its title`, !ll.full && !new URL(ll.url).searchParams.has("report") && new URL(ll.url).searchParams.get("title") && ll.url.length <= app.REPORT_URL_MAX);
  let longest = "";
  for (let n = 1; ; n++) { const t = Array.from({ length: n }, () => text).join("\n\n"); if (!app.issueLink(rep("content problem", t), REPORT_TO).full) break; longest = t; }
  check(`the longest report that fits is filled in whole, within ${app.REPORT_URL_MAX} characters`, longest && app.issueLink(rep("content problem", longest), REPORT_TO).url.length <= app.REPORT_URL_MAX);
  const m = app.mailLink(rep("missing answer"), { github: "", email: "someone@example.org" }), mu = new URL(m.url);
  check("the email link: the address, the title as subject and the report as body", m.full && mu.protocol === "mailto:" && mu.pathname === "someone@example.org" && mu.searchParams.get("subject") === "u05 · s-u05-03 · something" && mu.searchParams.get("body") === text);
  const ml = app.mailLink(rep("missing answer", long), { email: "someone@example.org" });
  check("…and too long for it, the email with only its subject", !ml.full && !new URL(ml.url).searchParams.has("body") && ml.url.length <= app.REPORT_URL_MAX);
  check("no repository, no GitHub link; no address, no email link", app.issueLink(rep("app problem"), { github: "", email: "" }) === null && app.mailLink(rep("app problem"), { github: "x/y", email: "" }) === null);

  section("4. The issue forms");
  for (const [kind, f] of Object.entries(app.REPORT_FORMS)) {
    const y = fs.existsSync(path.join(FORMS, f)) ? fs.readFileSync(path.join(FORMS, f), "utf8") : "";
    const label = { "content problem": "content", "missing answer": "missing-answer", "app problem": "app" }[kind];
    check(`${f}: adds the label ${label}`, new RegExp(`^labels: \\["${label}"\\]$`, "m").test(y));
    check(`${f}: has the field report (filled in by the address), required and kept as written`, /- type: textarea\n\s+id: report\n[\s\S]*?render: text\n\s+validations:\n\s+required: true/.test(y));
    check(`${f}: says the page is public`, /This page is public/.test(y));
  }
  check("config.yml is there", fs.existsSync(path.join(FORMS, "config.yml")));

  section("5. The sample reports");
  const sample = fs.readFileSync(path.join(__dirname, "samples", "reports.txt"), "utf8"), got = parseReports(sample);
  check("all five sample reports are read", got.length === 5, got.length);
  check("the GitHub one, with its note on two lines", got[0].fields.item === "s-u05-03" && got[0].fields.note === "I typed the right answer and it was marked wrong?\nIt happened twice." && !("### Anything to add?" in got[0].fields));
  check("the emailed one, quoting taken off", got[1].fields.kind === "missing answer" && got[1].fields.given === "in case" && got[1].fields.expected === "if · whether");
  check("the app problem, with both errors", got[4].fields.kind === "app problem" && got[4].fields.errors.split("\n").length === 2 && got[4].fields.browser === "Chrome 141 · Android 10");
  check("every sample's item is in the app or led to one by ID_ALIASES", got.filter(r => r.fields.item).every(r => content.items[r.fields.item] || content.items[app.ID_ALIASES[r.fields.item]]));
  const out = execFileSync(process.execPath, [path.join(__dirname, "read-reports.js"), path.join(__dirname, "samples", "reports.txt")], { encoding: "utf8" });
  check("read-reports.js groups them by item: 5 reports, 3 items, 1 app problem", /^5 report\(s\): 3 item\(s\), 1 app problem\(s\)\./.test(out), out.split("\n")[0]);
  check("…the two reports of s-u05-03 together, with the item as it stands and its lesson section", /=== s-u05-03 · u05 [^\n]*\(2 reports\)[\s\S]*?Now \([^)]+\):\n    \{"id":"s-u05-03"[\s\S]*?Lesson: u05 section \d+, “/.test(out), out.slice(0, 1200));
  check("…a removed id followed through ID_ALIASES", /=== v-fiore [\s\S]*?Reported as v-u02-y-fiore, removed since/.test(out));
  check("…and the app problem with its errors", /=== App problems \(1\)[\s\S]*errors: +2026-10-27/.test(out));
  const json = execFileSync(process.execPath, [path.join(__dirname, "read-reports.js"), path.join(__dirname, "samples", "reports.txt"), "--json"], { encoding: "utf8" }).trim().split("\n").map(l => JSON.parse(l));
  check("--json gives one object per item and per app problem", json.length === 4 && json.some(j => j.item === "fc1-se" && j.now && j.now.stored.id === "fc1-se"));
} catch (e) { T.stopped(e); }
T.summary();
