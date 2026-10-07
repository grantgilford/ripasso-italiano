# Italian practice app — briefing for Claude

This repo is the workshop for Grant's personal Italian practice app. Read this file first in every session.

## What's here

- `index.html` — the whole app: one self-contained HTML file (vanilla JS and CSS, no build step). Content (units, items, lessons, the Verbs section `VERB_GYM`, `ID_ALIASES`) is embedded as JS constants. The version is `APP_VERSION` near the end of the file.
- `docs/italian-app-spec.md` — the original build spec: goals, principles, exercise types, spaced repetition, screens.
- `docs/italian-app-content-guide.md` — **the standard for all content work**. Every unit, item, explanation and lesson must meet it. Read it in full before touching content.

## How the app reaches Grant

The live app is a private claude.ai artifact (https://claude.ai/artifact/1d1Zqo9n8UtXgizSuxjVnJ), used daily on his phone. It is **not** served from this repo. After work here is merged, Grant republishes `index.html` to that link from a claude.ai chat. So:

- Never try to publish or deploy anything. Your job ends with a tested `index.html` on a branch.
- The app must keep working as a single self-contained file. Don't split it into several files, add a build step, or load anything except pinned scripts from cdnjs.
- **Progress lives in the browser's localStorage under the app's existing keys and schema.** Never rename keys or change the saved-progress format without a migration that reads the old format, since a mistake there loses Grant's real progress. When an item is removed or renamed, map its old id in `ID_ALIASES`.

## How to work

1. Work on a new branch, never directly on `main`. Grant reviews and merges.
2. Bump `APP_VERSION` (7.2 → 7.3, and so on) for any change that will be republished, and update the version mentioned in the content guide's first paragraph if the guide changes.
3. Before finishing, check the file: it must parse (extract the `<script>` and run it through `node --check`), and the content checks the guide describes must pass (lesson links resolve, every wrong option has a note, verb forms agree with `VERB_GYM` and the regular rules). Where a check isn't scripted yet, write the script under `tools/` and commit it, so the next session can reuse it.
4. If a change alters how the app treats content, update `docs/italian-app-content-guide.md` in the same branch.
5. End with a short summary for Grant: what changed, the new version number, and anything he should check on his phone.

## Writing style

British English throughout, as the content guide sets out. Plain, concise explanations. Grant is learning Italian at roughly A1–A2 level and isn't a programmer: summaries for him should be in plain language.

## Safety net

The tag `v7.2` marks the known-good starting version. If anything goes wrong, `index.html` at that tag is the version to return to.
