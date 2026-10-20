# Exercise types: the catalogue (v8.6)

Every kind of exercise the app can put in front of the learner, where it comes from, and how to add more. Read this before writing content (to choose a good mix of types for a unit) and before building a new type (the checklist at the end lists every place in the code and tests a type touches). The item formats themselves are in `italian-app-content-guide.md`; the look of each exercise is in `design-system.md`.

To see which types a unit already uses, run `node tools/unit-items.js --counts`; to read a unit's items, `node tools/unit-items.js u01` (add `--type spot` for one type).

## How an exercise is chosen

Content authors write **items**; the app turns each item into an **exercise** every time it comes up (`makeExercise` in `index.html`). Which exercise depends on the item's type and its box:

- **Box 0 (new):** a recognition exercise: a flip card, a multiple choice, tapping. A new item's first exercise always shows its explanation. If the item also has a production exercise, one follows later in the same session.
- **Box 1:** mostly recognition, some production.
- **Box 2 and up:** production (typing Italian) wherever the item has it; from box 2, only a production answer promotes an item that has one (`itemHasProduction`). Items with no production exercise (grammar questions, sort, match, a spot item with no mistake or an accent-only one) are promoted by their recognition answer.

A wrong answer puts the item back at the end of the session. Every wrong answer gets a reason in the answer panel.

## The types

**R** = recognition (choosing or tapping), **P** = production (typing Italian). The *key* is the `typeKey` the Stats screen groups accuracy by.

| Shown as | Key | Built from | Kind | When | What the learner does |
|---|---|---|---|---|---|
| Flip card (New sentence, New verb, New pattern, New preposition) | `flip`, `intro` | vocab, sentence, verb, transform, prep | R | mostly new items | reads, reveals, grades themself |
| Meaning | `meaning` | vocab | R | box 0–1 | picks the meaning (IT → EN or EN → IT) from four |
| Typed recall | `recall` | vocab | P | box 1+ | types the Italian for the English (nouns with their article) |
| Article drill | `article` | vocab (nouns with all four forms) | P | box 1+ | types *il / lo / un / gli…* for the noun |
| **Make it plural / Make it singular** (new) | `plural` | vocab (nouns with all four forms) | P | box 1+ | types the noun with its article in the other number: *il lago → i laghi* |
| Adjective agreement | `agreement` | vocab (adjectives with `forms`) | P | box 1+ | types the adjective agreeing with a noun from the content |
| Conjugation | `conjugation` | verb | P | box 1+ | types one form: *parlare · noi · presente* |
| Fill in the blank | `cloze` | sentence with `cloze` | R or P | R with `options` at box 0–1, else P | picks or types the missing word(s) |
| Word order | `bank` | sentence (3+ words) | R | mostly box 1–2 | taps the words in order (two distractors) |
| Translate | `translate` | sentence | P | mostly box 2+ | types the whole sentence from English |
| **Listen and type** (new) | `listen` | sentence (up to 9 words) | P | box 1+, about one time in five, only with an Italian voice and Read aloud on | hears the sentence (Play, or Slow), types it; Can't listen now swaps it at no cost |
| Grammar | `grammar` | grammar_mc | R | always | picks the answer to a rule question; each wrong option has a note |
| Transform | `transform` | transform | P | box 1+ | rewrites a sentence by an instruction (make it plural, formal, negative, correct the mistake…) |
| Preposition + article | `preparticle` | prep | P | box 1+ | types the merged form: *in + lo zoo → nello zoo* |
| Number | `number` | number | P | always | digits → words or words → digits |
| Clock | `clock` | clock | P | always | time in digits → words, or words → digits |
| Flashcard | `flashcard` | vocab in a flashcard unit | P | always | types the English (or Italian) for the card |
| **Spot the mistake** (new) | `spot` | spot | R, then P | R at box 0–1; from box 2 (and in the follow-up) the learner also types the fix | taps the one wrong word, or **No mistake**; then types the right word |
| **Complete the endings** (new) | `endings` | endings | P | always | types the missing endings in boxes inside the sentence: *Le ragazz[e] sono stanc[he]* |
| **Choose the reply / Write the reply** (new) | `reply` | reply | R, then P | choice at box 0–1 (when it has two or more options), typed after | answers someone's line in a short exchange, from an English cue |
| **Sort the words** (new) | `sort` | sort | R | always | puts each of 3–6 words in one of 2–4 groups (*il / lo / la / l'*; *tu / Lei*; *-chi / -ci*) |
| **Match the pairs** (new) | `match` | match | R | always | joins each left-hand item to its partner: question → answer, singular → plural, word → meaning |
| Verbs section drills | `vtable`, `vspot`, `vpick`, `vmeaning`, `vswitch`, `vinf`, `vaux`, `vtenseid`, `vperson` | the Verbs section (`VERB_GYM`) | R and P | by tense ladder | full tables, single forms, pick the form, from English, change the tense, which verb, essere or avere, which tense, which person |

### The types added in v8.6, in more detail

- **Spot the mistake** (`spot` items). The English meaning is the prompt and the Italian sentence is a row of word chips. One word is wrong (or none: "No mistake" is always offered, and a few items are deliberately right, to test judgement: *Il problema è difficile*, *Marco è medico*). Tapping a right word gets "You tapped *X*: that word is right as it stands" (or the item's own note for that word). From box 2 the learner also types the right word, checked exactly; a fix that differs from the mistake only by an accent or a capital (*e → è*, *Italiano → italiano*) is tap-only, since lenient accents would pass the wrong word typed back. Good for: agreement, articles, *essere* forms, *di / da*, *stare / essere*, invariable plurals, capital letters on nationalities.
- **Complete the endings** (`endings` items). Inline boxes in the sentence; Enter moves to the next box. Each blank can hold a word ending (*stanc{he}*) or a whole short word (*{Un'}amica*). Wrong boxes show the right answer beside them. Good for: agreement chains, plural spelling (*-chi / -ci*, *-cie / -ce*), verb endings.
- **Reply** (`reply` items). A line from someone (with an optional name) and an English cue of what to say. At first the learner chooses from the right reply and up to three wrong ones (each with a note), later types it; any listed answer is accepted, a subject pronoun may be added (*Io mi chiamo Anna*) and one-letter slips are forgiven as in translations. Good for: greetings, courtesy, register (*E Lei?*), answering with the right verb form.
- **Sort the words** (`sort` items). Rows with a segmented control each; Check waits until every row has a group. All must be right; the panel lists each misplaced word with its reason. A row can carry `say` (*lo zaino*) so the answer panel reads the whole phrase. Good for: gender and articles, *c'è / ci sono*, *tu / Lei*, hard or soft plurals, register, suffixes.
- **Match the pairs** (`match` items). Two shuffled columns of 4–5; tap one side then the other. A wrong pair flashes with a cross and counts as a slip; matched pairs lock with a number. Any slip makes it "Not quite", naming the slip. The right column can be English (`"right": "en"`). Good for: question → answer, informal → formal, singular → plural, word → meaning, man → woman.
- **Listen and type** (generated). Plays a unit's sentence in the device's Italian voice; nothing is shown. Built only when an Italian voice exists and Read aloud isn't Off; **Can't listen now** replaces every listening exercise left in the session, without touching progress. One-letter slips are forgiven as in translations, with a note.
- **Make it plural / singular** (generated). Every noun with full article data gets it, in every grammar unit; 70% of the time towards the plural. The panel explains the article, and the gender switch for *il dito → le dita*.

## Where the new types could go next

Each new type is ordinary content, so any unit can use it. Ideas, unit by unit:

| Type | Fits |
|---|---|
| spot | u03–u05 (a wrong person or tense: *Noi parlate*), u06 (agreement, *bello / buono* forms), u10 (*di / da / a* with towns and countries), u12 (indicative for subjunctive after *penso che*), u13 (*lo / la / li* agreement), u14 (*tu* forms in a formal sentence) |
| endings | u03–u05 (verb endings: *parl{iamo}*, *finisc{ono}*), u06 (adjective chains), u12 (subjunctive endings), u07 (ordinals: *second{a}*) |
| reply | u04 (*Hai fame? Sì, ho fame*), u09 (answering question words), u14 (formal exchanges, commands), u15 (*Che ore sono?*), u18 (reactions and slang replies) |
| sort | u05 (*essere* or *avere* in the *passato prossimo*), u08 (adjective or adverb), u10 (*di* or *da*), u11 (conjunctions that take the subjunctive or not), u12 (subjunctive or indicative triggers), u15 (masculine or feminine time words) |
| match | u07 (digits ↔ words), u09 (question word ↔ meaning), u11 (conjunction ↔ meaning), u15 (clock times), u16 (sentence halves joined by *che / cui*), u18 (slang ↔ plain Italian) |

## Ideas not yet built

- **Listen and choose**: the sentence is played, the learner picks its meaning from four (an easier step before Listen and type).
- **Dialogue order**: the lines of a short exchange, shuffled, put back in order.
- **Generated sort and match**: built from a unit's own nouns and words (an article sort from its nouns, a meaning match from its vocabulary), for endless variety at no authoring cost.
- **Answer → question**: the reverse of Reply: given *Sono di Bologna*, write the question.
- **Two-word mistakes**: Spot the mistake for word order (*Sono non stanco*), tapping where *non* should go.
- **Odd one out** as its own type (today it is a grammar question whose prompt starts "Odd one out").

## Adding a new exercise type: the checklist

Every new item type touches the same places. In `index.html`:

1. `validatePack`: what the item needs, so an imported pack is refused if it is broken.
2. `sameItemKey`: the key that lets identical items in two units share one progress record.
3. `itemHasProduction`: whether it has a typed exercise (this decides promotion from box 2).
4. `makeExercise`: the exercise itself: `type` (the name shown), `typeKey`, `kind`, `mode`, `promptHtml`, `accepted` / `correct`, `shownAnswer`; `showWhy: introduce` so a new item explains itself; `say` only for Italian the prompt shows; `sayAnswer`, `missedText` and `answerLine` / `okLine` when the defaults don't fit.
5. `renderSession`: the markup for a new `mode`, with a Don't know button (`data-act="giveup"`) so the tests and the learner can always move on; `action()`, the `keydown` handler and `wire()` for its taps and keys; `resetExState()` for any state it keeps in `S`.
6. `explainFor`: the reasons in the answer panel, every wrong choice named.
7. The glossary (`PRACTICE_TYPES`, `rowHtml`), Look up and the glossary filter (`itemFields`), the summary line, `itemLabel`, the Stats names (`typeName`) and `knownWords` (what the typo rule treats as real words; leave out text that is wrong on purpose).
8. CSS beside the other session styles: 44 px targets, the ok / bad tokens, never colour alone (a ✓ or ✕ goes with each colour).

Then the tools: a section for it in `tools/check-content.js` (explanations, a note for every wrong option, anything else that can be wrong in the data), a block in `newTypes` in `tools/test-ui.js` (answered right and wrong by tapping, in light and dark at 360 px and at 120% text) plus its fields in the read-aloud `dataWords`, and a branch in `runSession` in `tools/test-progress.js` so practice sessions answer it as a learner would. Finally the item format in the content guide, the look in the design system, and a row in the table above.
