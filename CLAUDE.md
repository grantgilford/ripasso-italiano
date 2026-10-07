# Italian practice app — briefing for Claude

This repo is the workshop for Grant's personal Italian practice app. Read this file first in every session.

## What's here

- `index.html` — the whole app: one self-contained HTML file (vanilla JS and CSS, no build step). Content (units, items, lessons, the Verbs section `VERB_GYM`, `ID_ALIASES`) is embedded as JS constants. The version is `APP_VERSION` near the end of the file.
- `docs/italian-app-spec.md` — the original build spec: goals, principles, exercise types, spaced repetition, screens.
- `docs/design-system.md` — the **Ripasso Italiano** look (Oct 2026): name, logo, colours, type, components and every screen, with mockups, logo files and fonts in `docs/design/`. Follow it for any interface work.
- `docs/italian-app-content-guide.md` — **the standard for all content work**. Every unit, item, explanation and lesson must meet it. Read it in full before touching content.
- `tools/check-content.js` — the content checks (`node tools/check-content.js`, add `--verbose` for every finding). Reads `index.html` and changes nothing.
- `tools/check-new-words.js` — checks a list of candidate words for a new vocab pack against every word already in the app (`node tools/check-new-words.js words.txt`), so a pack adds only new words. The flashcard packs run from pack 1 (common words) to pack 5 (upper-intermediate); each later pack should be a gentle step up.
- `tools/test-progress.js` — the progress safety test (`node tools/test-progress.js`, about a minute; needs Playwright and Chromium). Runs the real app in a headless browser and checks that saved progress, in the browser and in the synced copy, survives loading, aliases, practice sessions, syncing and a new device. `tools/item-ids.txt` lists every id that may hold progress.

## How the app reaches Grant

The live app is a private claude.ai artifact (https://claude.ai/artifact/1d1Zqo9n8UtXgizSuxjVnJ), used daily on his phone. It is **not** served from this repo. After work here is merged, Grant republishes `index.html` to that link from a claude.ai chat. So:

- Never try to publish or deploy anything. Your job ends with a tested `index.html` on a branch.
- The app must keep working as a single self-contained file. Don't split it into several files, add a build step, or load anything except pinned scripts from cdnjs.
- **Progress is kept in two places, and both hold Grant's real progress:**
  - **The browser copy**, in localStorage: `itapp.progress.v1` (progress), `itapp.packs.v1` (imported packs), `itapp.reading.v1` (last lesson section read) and `itapp.migratedV1` (a one-time flag).
  - **The synced copy**, in the artifact's cloud database (`window.claude.use("db")`), which carries progress across devices: `progress2/meta`, `progress2/days_YYYY`, the item shards `progress2/s00`…`s15` (each record packed as a fixed-order array), plus `flags/<id>` and `packs/<id>`. The old `progress/main` document is still read once per device for migration.

  Never rename a key, collection or document, change the shard count or hashing, reorder the packed record, or otherwise change either format without a migration that reads the old format. The two copies are merged on every load, so a change to one must keep the merge with the other working, and a mistake in either loses progress on every device. When an item is removed or renamed, map its old id in `ID_ALIASES`.

## How to work

1. Work on a new branch, never directly on `main`. Grant reviews and merges.
2. Bump `APP_VERSION` (7.2 → 7.3, and so on) for any change that will be republished, and update the version mentioned in the content guide's first paragraph if the guide changes.
3. Before finishing, run `node tools/check-content.js`. It checks that the script parses and runs the content checks the guide describes (lesson links resolve, every wrong option has a note, verb forms agree with `VERB_GYM` and the regular rules, and more). It must report no problems; read its "worth a look" list and deal with anything your change added. Then run `node tools/test-progress.js`: every check must pass. If you add items, run it with `--update-ids` to add their ids to `tools/item-ids.txt`; if it reports a missing id, an item was removed or renamed without an `ID_ALIASES` entry, so add one rather than editing the list. If you deliberately change a storage format, write the migration first and then update the test to the new format in the same branch. Where a check isn't scripted yet, add it to these scripts (or a new one under `tools/`) and commit it, so the next session can reuse it.
4. If a change alters how the app treats content, update `docs/italian-app-content-guide.md` in the same branch.
5. End with a short summary for Grant: what changed, the new version number, and anything he should check on his phone.

## Writing style

British English throughout, as the content guide sets out. Plain, concise explanations. Grant is learning Italian at roughly A1–A2 level and isn't a programmer: summaries for him should be in plain language.

## Safety net

The tag `v7.2` marks the known-good starting version. If anything goes wrong, `index.html` at that tag is the version to return to.
