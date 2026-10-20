# Italian Practice App: Build Spec (Draft v0.1)

Owner: Grant Gilford. Purpose: personal study tool, not a commercial product.

## 1. Goal and principles

A text-first practice app (with Italian read aloud on request, from v8.2) that copies Duolingo's mechanics (short lessons, mixed exercise types, spaced repetition, XP and streaks) without its visual layer. It should feel fast and quiet. Every screen exists to put an Italian prompt in front of the learner and check the answer.

Design principles, in priority order:

1. **Learning first.** Typed production (writing the Italian) is favored over recognition (picking from options), because it builds real recall.
2. **No decoration.** No mascots, animations, confetti, sound effects, or images. Feedback is plain text, with color only as a secondary cue. The one sound is Italian read aloud (from v8.2): a speaker beside the Italian plays it in the device's own voice, only when tapped.
3. **Content is data.** Vocabulary, sentences, verbs, and grammar questions live in a JSON format, separate from app logic. New content can be added without rebuilding the app.
4. **The content is the source of truth for grammar.** The app never derives articles, plurals, or conjugations itself. It only uses what the content states.
5. **Mobile first, desktop friendly.** One column, large tap targets, full keyboard support on desktop.

## 2. Learner profile

A single user who speaks English, is roughly A1 level (a few weeks in), and studies alongside Duolingo, podcasts, and *Collins Easy Learning Italian Grammar*. Units should follow the Collins chapter order where practical, so the app reinforces what's being read.

## 3. Platform and technical constraints

| Area | Decision |
|---|---|
| Delivery | One self-contained HTML file, published as a private claude.ai artifact and opened in any browser |
| Code | Vanilla JavaScript and CSS, no build step. Any library loads as a pinned script from an allowed CDN (cdnjs preferred) |
| Progress storage (v1) | `localStorage`, versioned schema, every read/write wrapped in try/catch, app works from an empty state |
| Backup | Export progress as JSON (copy-to-clipboard text box, or the artifact downloads capability if available) and import by paste or file picker. Plain download links don't work in published pages |
| Cross-device sync (optional) | At the start of the build, check the Artifact tool's `capabilities` action. If a state or db capability exists, use it for progress and imported content |
| AI features (optional, later) | Only if the capabilities check shows a sample capability. The app must work fully without it |
| Theme | Light/dark follows the system setting, system font stack, max content width about 560px |

## 4. Course structure

**Course → Units → Items → Exercises.**

A **unit** is a topic (for example "Nouns, gender & articles") tagged with its Collins chapter. An **item** is one piece of content: a word, verb, sentence, or grammar question. **Exercises are generated automatically from items**, so content authors write only items and the app decides how to test them (see section 6).

All units are open. The home screen suggests the next unit in order, but nothing is locked.

## 5. Sessions

| Session | What it contains |
|---|---|
| **Continue** (main button) | A lesson of about 12 exercises from the current unit: up to 5 new items plus due reviews from that unit |
| **Review** | 15 exercises from items due across all units, most overdue first. Shows a count of due items on the home screen |
| **Mistakes** | Items answered wrong in the last 7 days |
| **Unit practice** | Any unit chosen from the unit list, new and review items mixed. Practising a grammar unit makes it the current unit, so Continue picks it up from then on |

Within any session, a missed exercise is repeated at the end of the session until it's answered correctly. The repeat doesn't earn a promotion (see section 8). A session ends with a text summary: accuracy, XP earned, items promoted, and a list of missed items with correct answers.

## 6. Exercise types

"Recognition" exercises show options or the answer. "Production" exercises require typing Italian.

| # | Type | Kind | Generated from | Prompt → answer | Phase |
|---|---|---|---|---|---|
| 1 | Flip card | Recognition | vocab | Shows IT (or EN), tap to reveal, self-grade "Missed / Got it" | v1 |
| 2 | Multiple choice: meaning | Recognition | vocab | IT word → pick EN (4 options), or EN → pick IT | v1 |
| 3 | Typed recall | Production | vocab | EN → type IT (with article for nouns) | v1 |
| 4 | Article drill | Production or recognition | vocab (nouns) | `___ zaino` → type or pick `lo`. Covers definite, indefinite, and plural articles | v1 |
| 5 | Conjugation drill | Production | verb | `parlare · noi · presente` → `parliamo` | v1 |
| 6 | Fill in the blank | Production | sentence with cloze | `Noi ___ italiano. (parlare)` → `parliamo` | v1 |
| 7 | Grammar question | Recognition | grammar_mc | Rule question with 3–4 options and an explanation | v1 |
| 8 | Word bank | Recognition | sentence | EN sentence → tap IT words in order. Includes 2 distractor words from the same unit | v2 |
| 9 | Match pairs | Recognition | vocab | 5 IT/EN pairs, tap to match | v2 |
| 10 | Typed translation | Production | sentence | EN sentence → type full IT sentence | v2 |

The app has since grown well beyond these ten (the Verbs section's drills, numbers, clock times, transforms and, from v8.6, Spot the mistake, Complete the endings, Reply, Sort the words, Match the pairs, Listen and type and Make it plural). The current, complete list is kept in `docs/exercise-types.md`.

**Distractors** for multiple choice come from the same unit and the same part of speech. For grammar forms, they come from other forms of the same set (other persons of the same verb, other articles). If a unit is too small, the app fills from earlier units.

**Choosing exercises for an item:** a new item is introduced with a recognition exercise (1, 2, or 9). After that, the app prefers production exercises. An item can't go past box 2 (section 8) without a correct production answer.

## 7. Answer checking

Every typed answer is normalized before comparison: trim, lowercase, collapse repeated spaces, convert curly apostrophes to straight ones, and ignore punctuation other than apostrophes. Apostrophes matter (`l'amico`).

Each item can list **multiple accepted answers**. For sentences, content should include versions with and without subject pronouns (`Sono stanco` / `Io sono stanco`). For conjugation drills, the app also accepts the answer preceded by its own pronoun (`noi parliamo`).

| Check | Setting | Default | Behavior |
|---|---|---|---|
| Accents | Strict / Lenient | **Lenient** | Lenient: `perche` for `perché` counts as correct with a note ("Watch the accent: perché"). Typing an apostrophe for an accent (`e'` for `è`) gets the same treatment. Strict: counts as wrong |
| Typos | On / Off | **On** | Only for typed recall and typed translation. Accepts one wrong, missing, or extra letter in words of 5+ letters, **only if the final letter is correct** (Italian endings carry gender, number, and person), with a note showing the right spelling |
| Grammar drills | — | Always exact | Article, conjugation, and fill-in-the-blank exercises never accept typos, since one letter is the whole point. The accent setting still applies |

**Feedback** is a text bar under the answer: "Correct", "Correct (note: …)", or "Not quite. Answer: …", plus the item's `note` if it has one. Enter or a Continue button moves on.

## 8. Spaced repetition

Leitner-style boxes, tracked **per item**.

| Box | Next review after |
|---|---|
| 0 | New, not yet seen |
| 1 | Later in the same session / 10 minutes |
| 2 | 1 day |
| 3 | 3 days |
| 4 | 7 days |
| 5 | 14 days |
| 6 | 30 days |
| 7 | 60 days |

A correct answer moves the item up one box. A wrong answer moves it down two boxes, to a minimum of box 1, and logs a lapse. A self-graded "Missed" on a flip card counts as wrong. An item in box 5 or higher counts as **learned** for stats and unit progress.

Per-item record: `{ box, due, lapses, lastSeen, lastWrong, seenCount }`.

The new-items limit is **10 per day** by default.

## 9. Motivation (text only)

XP: +2 for a correct production answer, +1 for a correct recognition answer, +5 for finishing a session. Daily goal: **30 XP** by default. The streak counts consecutive days the daily goal was met and is shown as plain text on the home screen ("Streak: 12 days · Today: 18/30 XP"). No streak freezes, leaderboards, or badges.

## 10. Screens

| Screen | Contents |
|---|---|
| Home | Streak and today's XP, Continue button (shows unit name), Review (N due), Mistakes (N), links to Units, Stats, Settings |
| Units | List of units in order with Collins chapter, % learned, item count |
| Session | Progress counter ("7 / 12"), prompt, input or options, feedback bar. Nothing else on screen |
| Summary | Accuracy, XP, promotions, missed items with answers |
| Stats | Total learned, due today and this week, accuracy over the last 7 and 30 days, most-lapsed items |
| Settings | Accent strictness, typo tolerance, daily goal, new items per day, flashcard direction (IT→EN / EN→IT / both) |
| Data | Import content pack (paste JSON or pick file, with validation report), list of loaded packs, export/import progress, reset progress (with confirmation) |

**Input helpers:** an accent bar (`à è é ì ò ù`) above every text field inserts at the cursor. On desktop, Enter submits and continues, and keys 1–4 pick options.

## 11. Content format

The app ships with built-in content embedded as JSON. Imported packs are stored and merged by `id`, so an imported item with an existing id replaces the old version. Import validates required fields and duplicate ids, and reports problems without loading a broken pack.

```json
{
  "pack": "a1-core-01",
  "version": 1,
  "units": [
    { "id": "u02", "order": 2, "title": "Nouns, gender & articles", "collins": "Ch. ?", "description": "il/lo/la/l', un/uno/una/un'" }
  ],
  "items": [
    {
      "id": "v-zaino", "unit": "u02", "type": "vocab",
      "it": "zaino", "en": ["backpack", "rucksack"],
      "pos": "noun", "gender": "m",
      "art": "lo", "indef": "uno", "plural": "zaini", "artPl": "gli",
      "note": "lo before z-"
    },
    {
      "id": "vb-parlare", "unit": "u03", "type": "verb",
      "it": "parlare", "en": ["to speak", "to talk"], "group": "-are",
      "forms": { "presente": ["parlo", "parli", "parla", "parliamo", "parlate", "parlano"] }
    },
    {
      "id": "s-0031", "unit": "u03", "type": "sentence",
      "it": ["Parliamo italiano.", "Noi parliamo italiano."],
      "en": ["We speak Italian."],
      "cloze": { "text": "Noi {parliamo} italiano.", "hint": "parlare" }
    },
    {
      "id": "g-0007", "unit": "u02", "type": "grammar_mc",
      "prompt": "Which article goes with 'studente'?",
      "options": ["il", "lo", "la", "l'"], "answer": "lo",
      "explanation": "Masculine nouns starting with s + consonant take lo."
    }
  ]
}
```

Field rules: `it` and `en` may be a string or an array. The first entry is the one displayed, and all entries are accepted. Verb `forms` are always ordered io, tu, lui/lei, noi, voi, loro, and more tenses (`passato_prossimo`, `futuro`…) can be added as keys. `note` and `explanation` are optional, one sentence each. The exercise sentences should be original, not copied from textbooks.

## 12. Starter content (v1)

To be confirmed against where the learner currently is. Proposed A1 units, about 25–40 items each:

1. Greetings, basics & *essere*
2. Nouns, gender & articles
3. Present tense: regular *-are* verbs
4. *Avere* and common expressions with it
5. Present tense: *-ere* and *-ire* verbs (incl. *-isc-*)
6. Adjective agreement

## 13. Build phases and acceptance checks

**Phase 1 (core):** exercise types 1–7, answer checking with both settings, spaced repetition, Continue and Review sessions, summary screen, localStorage persistence, progress export/import, content-pack import, starter units 1–3. *Done when:* a full lesson and a review session can be completed on a phone, progress survives closing the browser, and a pasted pack appears as a new unit.

**Phase 2 (full experience):** exercise types 8–10, Mistakes session, Stats screen, streak and daily goal, starter units 4–6. *Done when:* a week of daily use works without errors and the streak and due counts are correct across days.

**Phase 3 (optional):** cross-device sync via a state capability, AI-generated sentences or free-form translation feedback via a sample capability, more tenses.

## 14. Out of scope

Recorded audio, speech recognition, images, animations, sound effects, accounts, social features, leaderboards, ads, and anything commercial. (Read aloud by the device's own voice came in with v8.2; listening exercises and speech recognition may follow.)

## 15. Open questions for Grant

| Question | Draft default |
|---|---|
| Which Collins chapter and Duolingo unit are you on now? | Start at unit 1 |
| Keep self-graded flip cards, or typed answers only? | Keep flip cards for introducing new words only |
| Accents strict or lenient? | Lenient, with a note |
| Daily goal and new words per day? | 30 XP, 10 new items |
| Main device: phone or laptop? | Phone |
| Should grammar explanations appear after every answer or only after mistakes? | Only after mistakes |

## 16. Kickoff message for the build chat

> Build Phase 1 of the Italian practice app described in `italian-app-spec.md` in this project. First check the Artifact tool's capabilities and tell me what's available for storage and sync. Then build the app as a single HTML file, publish it, and list any spec decisions you had to make along the way.
