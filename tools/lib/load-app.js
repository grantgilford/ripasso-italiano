/*
  Loads the app's content into Node, for the tools that read index.html without a browser
  (check-content, unit-items, add-items, edit-items, check-new-words, pack-levels, same-content, variety,
  link-sections and test-choices).

  The app's script is the inline <script> holding the boot section (small start-up snippets come
  first: the theme, the storage script that defines Store, the error log). Everything before the
  boot section only defines things (the content, the helpers, the screens), so it runs in a sandbox
  with just enough of a browser stubbed in, after the storage script (which finds no IndexedDB there
  and an empty localStorage, so nothing is saved or loaded), and the names asked for are handed back:

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
const STORE_MARK = "/* ---------- storage: the one place saved data is read and written";
const INDEX = path.join(__dirname, "..", "..", "index.html");

// Every inline <script> in the page (those loaded with src= aside), as text.
const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
// The app's script: the inline one with the boot section, or "" if there is none.
const appScript = (html) => inlineScripts(html).find(s => s.includes(BOOT_MARK)) || "";
// The storage script (from 9.26): the inline one that defines Store, or "" in a version before it.
const storeScript = (html) => inlineScripts(html).find(s => s.includes(STORE_MARK)) || "";

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
  const sb = vm.createContext(sandbox());
  const store = storeScript(html);
  if (store) vm.runInContext(store, sb, { filename: "index.html <script> (storage)" });
  return vm.runInContext(code.slice(0, boot) + "\n;({ " + list + " })", sb, { filename: "index.html <script>" });
}

module.exports = { BOOT_MARK, STORE_MARK, INDEX, inlineScripts, appScript, storeScript, loadApp };
