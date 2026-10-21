/*
  Loads the app's content into Node, for the tools that read index.html without a browser
  (check-content, unit-items, add-items, check-new-words and pack-levels).

  The app's script is the inline <script> holding the boot section (a small start-up snippet in
  <head> comes first). Everything before the boot section only defines things (the content, the
  helpers, the screens), so it runs in a sandbox with just enough of a browser stubbed in, and the
  names asked for are handed back:

    const { loadApp } = require("./lib/load-app");
    const app = loadApp("buildContent, getContent: () => content, VERB_GYM");   // index.html beside tools/
    const app2 = loadApp(["BUILTIN_PACKS"], { html });                          // or from text already read

  Reads index.html and changes nothing.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BOOT_MARK = "/* ---------- boot ---------- */";
const INDEX = path.join(__dirname, "..", "..", "index.html");

// Every inline <script> in the page (those loaded with src= aside), as text.
const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
// The app's script: the inline one with the boot section, or "" if there is none.
const appScript = (html) => inlineScripts(html).find(s => s.includes(BOOT_MARK)) || "";

function sandbox() {
  const noop = () => {};
  const stubEl = () => ({ addEventListener: noop, appendChild: noop, setAttribute: noop, style: {}, classList: { add: noop, remove: noop, toggle: noop } });
  const sb = {
    console, setTimeout: noop, clearTimeout: noop, setInterval: noop,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { addEventListener: noop, createElement: stubEl, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: stubEl(), documentElement: stubEl() },
    navigator: { userAgent: "node" }, location: { hash: "" }, matchMedia: () => ({ matches: false, addEventListener: noop }),
  };
  sb.window = sb; sb.addEventListener = noop; sb.removeEventListener = noop;
  return sb;
}

// names: the names to hand back, as an array or as the inside of an object literal ("a, b, getContent: () => content").
// Exits with a message if the boot section can't be found; an error while running the script is thrown.
function loadApp(names, { html, file } = {}) {
  if (html == null) html = fs.readFileSync(file || INDEX, "utf8");
  const code = appScript(html);
  const boot = code.indexOf(BOOT_MARK);
  if (boot < 0) { console.error("Could not find the boot section in the script; the loader needs updating."); process.exit(1); }
  const list = Array.isArray(names) ? names.join(", ") : names;
  return vm.runInNewContext(code.slice(0, boot) + "\n;({ " + list + " })", sandbox(), { filename: "index.html <script>" });
}

module.exports = { BOOT_MARK, INDEX, inlineScripts, appScript, loadApp };
