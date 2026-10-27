# Room for progress in the browser copy

Written at v9.18 (October 2026), when Vocab pack 9 brought the course to 18,747 items that can hold progress. Read this before adding more than a few hundred items, or before changing how progress is saved.

## Where things stand

- **What the test measures.** `tools/test-progress.js` (section 8) saves a record for every item in the course, each with figures as long as they get (box 7, 123 answers, 12 lapses, four timestamps), plus two years of daily log, and checks that the browser copy (`itapp.progress.v1` in localStorage) stays under **3 MB**. At v9.18 it is **2.95 MB**, and the test prints how many more records fit under 3 MB (about 300 at v9.18).
- **The 3 MB is our own safety margin, not the browser's limit.** Chromium, which Chrome on Android uses, accepts about 5 MiB of text per site (5,242,240 characters, measured in the test browser), shared by every key the site saves. The app's other keys stay small (under about 0.1 MB, since `itapp.lasttype.v1` and `itapp.confusions.v1` are capped). So at worst, with every item practised, there are about 2 MB of real room left, or roughly 13,000 more records.
- **The worst case is a long way off.** It needs a record for every item, which means every grammar unit, all of the Verbs section and all ten vocab packs practised. A record is about 150 characters, much the same whether an item has been seen 3 times or 123, so the figure grows with the number of items practised, not with how long they have been practised.
- **If the browser ever refuses to save,** `saveProgress()` notices (`S.saveFailed`) and Today says "Progress couldn't be saved" with a Back up now button, so nothing is lost silently. The cloud copy (claude.ai only) is not affected: its 16 shards are about 102 KB each against a 256 KB limit, so it has room for about twice the course as it stands.

## Where the space goes

Each record is saved as an object, as `"fc10-laccio":{"box":7,"due":…,"lapses":12,"lastSeen":…,"lastWrong":…,"seenCount":123,"lastRight":…}`. The field names take about 41% of the browser copy, the numbers about 35%, the item ids about 10%, the daily log about 7% (0.22 MB for two years) and punctuation the rest.

## Options, from least to most work

1. **Raise the test's limit from 3 MB to 4 MB.** Nothing in the app changes; the test simply allows more of the real 5 MiB. This gives room for about 7,000 more items and still leaves a fifth of the browser's space spare. Quick and safe, but it only moves the line.
2. **Leave out fields that are 0.** `checkRec` already accepts a record with a field missing, but `applyResult` adds to the counts directly (`r.seenCount++`), so the loader would have to put the zeros back first, and an older version would lose those counts. It saves up to about a sixth for a typical learner (many records have no lapses and no wrong answer yet) but nothing in the worst case, so it doesn't help the test.
3. **Save records as arrays, as the cloud already does** (`[box, due, lapses, lastSeen, lastWrong, seenCount, lastRight]`, via `packRec` and `unpackRec`). This takes each record from about 150 characters to about 85, bringing the worst case to about 1.75 MB, with room for about 15,000 more items under 3 MB. It needs care, because an older version reading the new format would treat every record as damaged and start afresh. So the packed copy should go under a new key (for example `itapp.progress.v2`), and the new version should read the old key once if the new one is missing, then remove the old key (keeping both would need double the space); an older version opened afterwards then finds no progress of its own but leaves the packed copy alone, and a backup file restores it. Backups should stay in today's readable format, or the app must read both. Tests to update: the progress test (formats, migration, a rollback to the previous version), the speed test (saving after an answer packs every record) and the speed-ups test.
4. **Move progress to IndexedDB.** Its limit is hundreds of megabytes, but it is asynchronous, so loading at start-up, every save and the backup code would need reworking, and the installed copy's migration would need testing on the phone. This is the natural home for progress in a native app, so it is better done as part of that move than before it.

Splitting the browser copy into several keys does not help, because the 5 MiB is shared by the whole site. Compressing the text would save the most space, but it costs time on every save and would add a library to the single file, so it isn't worth it.

## Recommendation

Nothing needs to change for v9.18: the course fits within the test's margin, and the real limit is far off. Before the course grows by more than about 300 items, do option 3 (packed records under a new key with a migration). It frees the most room, makes each save smaller, and reuses the packing the cloud copy has used since 9.4. If the native app comes first, its own storage replaces all of this, and option 1 is enough to cover any content added in the meantime.
