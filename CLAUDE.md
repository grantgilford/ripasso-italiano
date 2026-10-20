# Italian practice app — briefing for Claude

This repo (`grantgilford/ripasso-italiano`, renamed from `italian-practice` in Oct 2026) is the workshop for Grant's personal Italian practice app, **Ripasso Italiano** ("Ripasso" in the app). Read this file first in every session.

## What's here

- `index.html` — the whole app: one self-contained HTML file (vanilla JS and CSS, no build step). Content (units, items, lessons, the Verbs section `VERB_GYM`, `ID_ALIASES`) is embedded as JS constants. The version is `APP_VERSION` near the end of the file.
- `docs/italian-app-spec.md` — the original build spec: goals, principles, exercise types, spaced repetition, screens.
- `docs/design-system.md` — the **Ripasso Italiano** look (Oct 2026): name, logo, colours, type, components and every screen, with mockups, logo files and fonts in `docs/design/`. Follow it for any interface work.
- `docs/italian-app-content-guide.md` — **the standard for all content work**. Every unit, item, explanation and lesson must meet it. Read it in full before touching content.
- `docs/exercise-types.md` — **the catalogue of exercise types**: every kind of exercise the app builds (from v8.6 also Spot the mistake, Complete the endings, Reply, Sort the words, Match the pairs, Listen and type, Make it plural), when each appears, which units could use the newer ones, ideas not yet built, and the checklist of every place a new type touches. Read it before choosing the mix of items for a unit, and before building a new type; add a row when you add one.
- `tools/check-content.js` — the content checks (`node tools/check-content.js`, add `--verbose` for every finding). Reads `index.html` and changes nothing.
- `tools/unit-items.js` — prints a unit's items readably (`node tools/unit-items.js u01`, `--type spot` for one type, `--json` as stored), every card and sentence that uses a word (`--word casa`, with the full data a copy in another unit must match to share progress), and how many items of each type every unit has (`--counts`). Reads `index.html` and changes nothing.
- `tools/add-items.js` — adds new items to `index.html` from a JSON file (`node tools/add-items.js items.json`, `--dry-run` first), each as one line after the last item of its unit; refuses existing ids and anything the app's own pack check rejects. Write new content in a scratch JSON file and add it with this rather than editing the long content lines by hand.
- `tools/check-new-words.js` — checks a list of candidate words for a new vocab pack against every word already in the app (`node tools/check-new-words.js words.txt`), so a pack adds only new words. The flashcard packs run from pack 1 (common words) to pack 6 (upper-intermediate), in order of difficulty; a pack's number comes from how common its words are, not from its unit id (pack 4 is unit `fc06`), and each later pack should be a gentle step up.
- `tools/pack-levels.js` — how common each vocab pack's words are (`node tools/pack-levels.js`), the same for a draft list (`… words.txt`), and the most common words no card has yet (`… --missing 1 3000`). It reads `tools/word-ranks.txt`, about 20,000 Italian words in order of frequency. Use it to choose a new pack's words and to number it among the others.
- `tools/test-progress.js` — the progress safety test (`node tools/test-progress.js`, about a minute; needs Playwright and Chromium). Runs the real app in a headless browser and checks that saved progress, in the browser and in the synced copy, survives loading, aliases, practice sessions, syncing and a new device. `tools/item-ids.txt` lists every id that may hold progress.
- `manifest.webmanifest`, `sw.js`, `icons/`, `.nojekyll` — what turns `index.html` into an installable phone app when the repo is served from its own website (GitHub Pages, see below). `sw.js` is the offline worker: it keeps a copy of the app on the device and fetches new versions in the background. It finds a new version by comparing `index.html` itself, so a release needs no change to `sw.js`.
- `tools/test-install.js` — the installed-copy test (`node tools/test-install.js`, about 30 seconds; needs Playwright and Chromium). Serves the repo like GitHub Pages and checks the manifest and icons, opening offline, the update prompt (offered on Today, never mid-session, keeping progress), the back button, the backup cards and buttons, and that none of it runs inside claude.ai.
- `tools/test-ui.js` — the interface test (`node tools/test-ui.js`, about a minute; needs Playwright and Chromium). Tours every screen by tapping, in light and dark at 390 and 360 px wide and at 120% text, and checks the design system's rules: every screen reachable, choosing a unit on Units (any card opens with Practise and Read lesson, and Today's Continue card follows the unit practised last), no script errors or outside loads, nothing hidden behind the tab bar, 44 px tap targets, the answer panel, the Appearance setting, the "Lo sapevi?" card, room above the keyboard (on typed questions Don't know and Check must clear a Pixel 8's keyboard, so keep the session screen compact), the exercise types added in v8.6, each answered right and wrong by tapping and typing (`newTypes`), and read aloud (with a stand-in voice: every speaker reads its Italian, a prompt's speaker never gives the answer away on any item, Listen and type plays only the item's own sentence without showing it, and the speakers hide where there is no Italian voice or no speech).

## How the app reaches Grant

The app reaches Grant in two ways, both from the same `index.html`:

1. **The claude.ai artifact** (https://claude.ai/artifact/1d1Zqo9n8UtXgizSuxjVnJ), with cloud sync. After work here is merged, Grant republishes `index.html` to that link from a claude.ai chat.
2. **The installed copy** (from version 8.1): GitHub Pages serves the `main` branch at https://grantgilford.github.io/ripasso-italiano/, and Grant installs it on his Android phone from Chrome. **Merging to `main` publishes it**: the installed app finds the new `index.html` the next time it opens and offers it on Today ("Update now"). Its progress is kept on the device only (no cloud sync), with backup files to move it between copies.

So:

- Never try to publish or deploy anything yourself, and don't merge to `main`. Your job ends with a tested `index.html` on a branch.
- `index.html` must keep working as a single self-contained file, both on claude.ai and opened straight from disk. Don't split it into several files, add a build step, or load anything except pinned scripts from cdnjs. The files beside it (manifest, worker, icons) are only for the installed copy, and the app only uses them when served from its own website (`HOSTED` in the code: outside claude.ai, over https or on localhost). Inside claude.ai (`IN_CLAUDE`) none of the installed-copy code runs: no manifest, no worker, no history entries, no notices.
- Outside claude.ai the Android back button is handled with one extra history entry while away from Today (`syncHistory()`); in a session, back asks before leaving. A new screen with a header back arrow (`screenHead(…, { back })`) is handled automatically.
- **Progress is kept in two places, and both hold Grant's real progress:**
  - **The browser copy**, in localStorage: `itapp.progress.v1` (progress), `itapp.packs.v1` (imported packs), `itapp.reading.v1` (last lesson section read) and `itapp.migratedV1` (a one-time flag). `itapp.theme.v1` (Appearance: `"light"`, `"dark"` or `"auto"`) is a per-device preference, deliberately kept out of progress so it never syncs; it is read by a small script in `<head>` before the first paint. `itapp.backup.v1` (`{ at, snooze, welcomed }`: the last backup made on this device, the backup reminder's snooze, and whether the first-run card was dismissed) is per-device too and never synced, as is `itapp.audio.v1` (Read aloud: `"off"`, `"normal"` or `"slow"`; from v8.2), since each phone has its own voices.
  - **The synced copy**, in the artifact's cloud database (`window.claude.use("db")`), which carries progress across devices: `progress2/meta`, `progress2/days_YYYY`, the item shards `progress2/s00`…`s15` (each record packed as a fixed-order array), plus `flags/<id>` and `packs/<id>`. The old `progress/main` document is still read once per device for migration.

  Never rename a key, collection or document, change the shard count or hashing, reorder the packed record, or otherwise change either format without a migration that reads the old format. The two copies are merged on every load, so a change to one must keep the merge with the other working, and a mistake in either loses progress on every device. When an item is removed or renamed, map its old id in `ID_ALIASES`.

## How to work

1. Work on a new branch, never directly on `main`. Grant reviews and merges.
2. Bump `APP_VERSION` (7.2 → 7.3, and so on) for any change that will be republished, and update the version mentioned in the content guide's first paragraph if the guide changes.
3. Before finishing, run `node tools/check-content.js`. It checks that the script parses and runs the content checks the guide describes (lesson links resolve, every wrong option has a note, verb forms agree with `VERB_GYM` and the regular rules, and more). It must report no problems; read its "worth a look" list and deal with anything your change added. Then run `node tools/test-progress.js`: every check must pass. For any change to the interface, also run `node tools/test-ui.js` (every check must pass), and for any change to navigation, backups, the installed-copy code or the files beside `index.html`, run `node tools/test-install.js` too. If you add items, run it with `--update-ids` to add their ids to `tools/item-ids.txt`; if it reports a missing id, an item was removed or renamed without an `ID_ALIASES` entry, so add one rather than editing the list. If you deliberately change a storage format, write the migration first and then update the test to the new format in the same branch. Where a check isn't scripted yet, add it to these scripts (or a new one under `tools/`) and commit it, so the next session can reuse it.
4. If a change alters how the app treats content, update `docs/italian-app-content-guide.md` in the same branch.
5. End with a short summary for Grant: what changed, the new version number, and anything he should check on his phone.

## Writing style

British English throughout, as the content guide sets out. Plain, concise explanations. Grant is learning Italian at roughly A1–A2 level and isn't a programmer: summaries for him should be in plain language.

## Safety net

The tag `v7.2` marks the known-good starting version. If anything goes wrong, `index.html` at that tag is the version to return to.
