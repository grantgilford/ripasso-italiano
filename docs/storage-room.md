# Where progress is kept, and how much room it has

Rewritten on 15 November 2026 (v9.26), when saved data moved from the browser's small storage (localStorage, about 5 MB for everything) to its database (IndexedDB, gigabytes). The course has 19,242 items that can hold progress. Read this before changing how progress is saved, and before adding a very big pack. The earlier version of this note, with the 4 MB line and its four options, is in the repository's history (v9.25).

## Where things stand

- **The browser copy is in IndexedDB**, behind one storage script (`Store`, the second `<script>` in `index.html`; its opening comment is the reference). Nothing else in the page reads or writes the browser's storage, and `tools/check-content.js` reports a problem if anything does. The format is written out by hand in `tools/lib/browser.js`, which the tests read the database with.
- **Room on the device is no longer the limit.** A record for every item in the course, with two years of daily log, is **3.04 MB** in the database; the phone allows a site a share of its free space, measured in gigabytes (Your data's Storage card shows both figures). The progress test's section 8b saves a course of 35,035 records, nearly twice today's, which is more than the old storage could hold at all (5.34 MB as one text, against its 5 MB).
- **The cloud copy now sets the room** (the claude.ai copy only; the installed copy has no cloud). Progress syncs as 16 shard documents, each limited to 256 KB. At v9.26 the largest is **104.4 KB**, and the progress test holds every document under a **200 KB line** (`CLOUD_LINE`, at the top of the test), which leaves room for about **18,350 more records**, roughly eighteen 1,000-card vocab packs. The test prints the figure (section 8) and adds a note when fewer than 2,000 fit.
- **Saving is quicker, and no longer grows with the course in the same way.** Progress is kept in parts: a head (settings, flags, accepted answers), the daily log by year, and the item records in 256 buckets by a hash of the item id. An answer writes its one bucket (about 12 KB at the worst case), the head and the current year, in one transaction, so a save is all there or not at all. With the CPU slowed 4×, about as fast as a mid-range phone, saving one answer at the worst case takes about **35 ms** (it was 170–180 ms when the whole 3 MB copy was written each time), nearly all of it looking through the records for what changed; with 35,035 records it takes about 70 ms. The figures are printed by the progress test and held to a budget by the speed test ("Save an answer").
- **Loading at start-up** reads about 260 rows and puts them together; the app draws nothing until that is done. With the CPU slowed 4×, reading the rows takes about 90 ms at the worst case (65 ms with 6,600 records), while the browser is still reading the app's own script, and putting progress together about 110 ms (14 ms with 6,600 records), where reading the old single text took about 60 ms. The speed test's "Reload to Today" is unchanged within its run-to-run variation, and "Saved data in memory" times the reading.
- **A device without IndexedDB** (rare: a browser with it switched off) still saves in localStorage exactly as before 9.26, and says so on Today and in Your data. There the old 5 MB still applies: today's worst case is 3.03 MB, and the test prints a note once a full course comes within half a megabyte of the limit. If the browser ever refuses a save there, Today says "Progress couldn't be saved", as before.

## The move from the old storage

Made once per device, as 9.26 first opens, before anything is drawn:

1. Every `itapp.*` key in localStorage is copied into IndexedDB in one transaction (all or nothing).
2. Everything is read back and compared with the original: each small value's text exactly, progress part by part and again as a whole.
3. Only then is the move marked done (the row `store.migration`), in its own transaction.

Until the mark says done, localStorage is the live copy; after it, IndexedDB is the only one. Closing the app at any point before the mark changes nothing in localStorage, and the next start does the whole move again. A copy that doesn't match is never switched to: the app carries on in localStorage, says so, and tries again next time. With the CPU slowed 4× the move takes about 0.7 seconds at the worst case and about a third of a second with 6,600 records, once, and it needs no room in the old storage (the storage test moves one filled to the brim).

**The old copy stays where it is.** The `itapp.*` keys in localStorage are never written or removed after the move. They are read only when Merge in the copy from before the move is tapped (Your data › Storage), which merges it like a backup file: for each item the newest record is kept. One check looks at it without using it: a few seconds after starting, the old progress's length and checksum are compared with those taken at the move, and if an older version of the app has saved there since (a window left open on 9.25, or the app put back to 9.25 for a while), Today offers to merge it in.

**One key in localStorage is still written:** `ripasso.boot.v1`, `{ theme, idb }`. IndexedDB can't be read before the first paint, so the Appearance choice is copied there for the small script in `<head>`; and `idb`, the time of the move, tells a start where IndexedDB won't open that the data lives there, so the app says "Saved progress couldn't be opened" and saves nothing, rather than go back to the old copy, which is out of date.

## What can go wrong, and what the app does

| What happens | What the app does |
|---|---|
| The app is closed during the move | The next start moves everything again from the old copy |
| The copy doesn't match the original | Carries on in localStorage, says so, tries again next time |
| IndexedDB isn't available, and the data was never moved | Saves in localStorage as before; Today: "Saving the older way" |
| IndexedDB can't be opened after the move | Saves nothing and says so; Today: "Saved progress couldn't be opened", with Try again |
| The database comes back empty after the move | Starts empty and says so; the old copy or a backup file is merged in only when asked |
| A save is refused (no room on the phone) | Today: "Progress couldn't be saved", with Back up now; saved once it works again |
| The app is closed without warning | Each answer was committed as it was given; putting the app away compares everything and writes what differs |
| The installed app and a browser tab are both open | Each merges the other's saves before its own, the newest record of each item winning |
| An older version saves to the old copy after the move | Noticed within a few seconds of starting; Today offers Merge it in |

Each row is a section of `tools/test-storage.js`.

## Going back to an earlier version

Version 9.25 and before read only localStorage, so put back they would open with the progress as it was at the move, and save there. Before going back, save a backup file in 9.26 (Your data › Save backup file) and load it in the older version; backup files are the same in every version. After updating again, 9.26 opens with its own progress as it last saved it, notices that the older version has saved to the old copy, and offers to merge it in.

## Options that were on the table, and what became of them

1. **Raise the test's limit from 3 MB to 4 MB.** Done on 3 November 2026 (v9.24); the line went with the move.
2. **Leave out fields that are 0.** Not done; nothing to gain now.
3. **Save records as short arrays under a new key.** **No longer needed.** It was the next step while everything had to fit in 5 MB and each save wrote the whole copy. Room is now gigabytes, and a save writes one bucket, which is quicker than packing would have made it.
4. **Move progress to IndexedDB.** Done in 9.26: this note.

## What comes next

- **When the room under the cloud line runs short** (the progress test's note, at fewer than 2,000 records): the cloud copy needs more shards, 32 instead of 16, which halves each document. That is a change to the synced format, so it needs a migration that reads the 16-shard documents, as `CLAUDE.md` sets out; nothing about the browser copy changes. At about 1,000 records a pack, it is a long way off.
- **Removing the old copy.** It costs nothing but the few megabytes it occupies and a moment at each start (the browser loads localStorage whole). Once 9.26 has been in use for a few weeks on every device and copy that holds progress, with a backup file made since, a later version can remove the `itapp.*` keys from localStorage, together with the Merge in button and the fingerprint check. Keep `ripasso.boot.v1`.
- **A native app.** `Store` is the seam: the rest of the app asks for values by key and never learns where they are kept. A native database replaces the four functions named at the end of the script's opening comment, and the parts of progress can become rows of a table.
- **Firefox and Safari haven't been measured.** The figures here are Chromium's, which Chrome on Android uses. Both browsers have IndexedDB; measure before relying on the app there.
