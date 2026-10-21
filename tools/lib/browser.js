/*
  Helpers shared by the browser tests (test-progress, test-ui, test-install, test-items, test-perf):
  finding Playwright, serving the app to the browser, and counting and printing checks.

    const { loadPlaywright, serveApp, checks } = require("./lib/browser");
    const { chromium } = loadPlaywright();
    const server = await serveApp(file);                 // http://127.0.0.1:<server.address().port>/index.html
    const T = checks();                                  // checks({ onlyFailures: true }) prints only failures (VERBOSE=1 prints all)
    T.check("the app opens", ok, "what went wrong");
    T.summary();                                         // prints the totals and exits, with code 1 if any check failed
*/
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

// Playwright from the repository's node_modules (npm install), else a global install (npm install -g playwright).
function loadPlaywright() {
  try { return require(require.resolve("playwright", { paths: [ROOT] })); } catch (e) { }
  try { return require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } catch (e) { }
  console.error("Playwright is not installed. Install it with: npm install (in the repository), or npm install -g playwright");
  process.exit(2);
}

// A local web server on a free port. handler(req, res) answers each request; host defaults to 127.0.0.1.
function serve(handler, host = "127.0.0.1") {
  const server = http.createServer(handler);
  return new Promise(r => host ? server.listen(0, host, () => r(server)) : server.listen(0, () => r(server)));
}

// The app at /index.html, read once from file, and a blank page on the same origin at any other address (for seeding storage).
function serveApp(file) {
  const html = fs.readFileSync(file);
  return serve((req, res) => {
    if (req.url.startsWith("/index.html")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); }
    else { res.writeHead(200, { "content-type": "text/html" }); res.end("<!doctype html><title>blank</title>"); }
  });
}

// Counts checks and prints each one as "  ok  " or "  FAIL", with the detail under a failure.
function checks({ onlyFailures = false } = {}) {
  const T = { total: 0, failures: 0 };
  T.check = (name, ok, detail) => {
    T.total++;
    if (!ok) T.failures++;
    if (!ok || !onlyFailures || process.env.VERBOSE) console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${!ok && detail ? "\n         " + String(detail).replace(/\n/g, "\n         ") : ""}`);
  };
  T.section = (title) => console.log("\n" + title);
  T.stopped = (e) => { T.failures++; console.log("\n  FAIL the test itself stopped: " + (e && e.stack || e)); };
  T.summary = ({ ofTotal = false } = {}) => {
    console.log(T.failures ? `\n${T.failures}${ofTotal ? " of " + T.total : ""} check(s) failed.` : `\nAll ${T.total} checks passed.`);
    process.exit(T.failures ? 1 : 0);
  };
  return T;
}

module.exports = { ROOT, loadPlaywright, serve, serveApp, checks };
