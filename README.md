# Ripasso Italiano

A personal Italian practice app (called "Ripasso" in the app; *ripasso* means going back over your material), built around typed answers, with a speaker beside the Italian to hear it read aloud by the device's own voice. The whole app is `index.html`; open it in any browser.

The app is used in two places: as a private claude.ai artifact (with cloud sync), and as an app installed on an Android phone from this repository's GitHub Pages site, https://grantgilford.github.io/ripasso-italiano/ (it works offline and offers each new version merged to `main`). This repository is where changes are made and reviewed. The tag `v7.2` marks the known-good starting version.

To install it on Android: open the address above in Chrome, tap the menu (⋮) and choose **Install app** (or **Add to Home screen**). To bring progress across from another copy, use **You → Your data → Save backup file** there, then **Load backup file** in the installed app.

What changed in each version is in `CHANGELOG.md`, and each version is tagged on GitHub (`v9.1`, `v9.2`…). The lessons, words and exercises inside `index.html` are laid out one entry per line, so a pull request shows each change to them line by line. See `CLAUDE.md` for how work is done here, and `docs/` for the content guide, the design system, the catalogue of exercise types (`docs/exercise-types.md`) and the original spec.

To run the checks (needs Node.js): `npm install` once, then `npm run check` for the content check, or `npm test` for everything: the content check, then that saved progress is safe (`tools/test-progress.js`), the interface against the design system (`tools/test-ui.js`), the installed copy (`tools/test-install.js`) and the app's speed (`tools/test-perf.js`). GitHub runs the same checks, apart from the speed test, on every pull request.
