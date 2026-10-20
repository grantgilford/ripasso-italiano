# Ripasso Italiano

A personal Italian practice app (called "Ripasso" in the app; *ripasso* means going back over your material), built around typed answers, with a speaker beside the Italian to hear it read aloud by the device's own voice. The whole app is `index.html`; open it in any browser.

The app is used in two places: as a private claude.ai artifact (with cloud sync), and as an app installed on an Android phone from this repository's GitHub Pages site, https://grantgilford.github.io/ripasso-italiano/ (it works offline and offers each new version merged to `main`). This repository is where changes are made and reviewed. The tag `v7.2` marks the known-good starting version.

To install it on Android: open the address above in Chrome, tap the menu (⋮) and choose **Install app** (or **Add to Home screen**). To bring progress across from another copy, use **You → Your data → Save backup file** there, then **Load backup file** in the installed app.

See `CLAUDE.md` for how work is done here, and `docs/` for the spec, the content guide and the catalogue of exercise types (`docs/exercise-types.md`). To check the content, run `node tools/check-content.js` (needs Node.js). To check that saved progress is safe, run `node tools/test-progress.js` (also needs Playwright). To check the interface against the design system (`docs/design-system.md`), run `node tools/test-ui.js` (also needs Playwright). To check the installed copy (offline, updates, back button, backups), run `node tools/test-install.js` (also needs Playwright).
