# Italian Practice App: Content Pack Guide (v2.3)

Companion to `italian-app-spec.md`. This describes what the built app (v7.2) actually accepts, so new packs can be written in a build chat and imported from the Data screen (or baked into the app on republish). Published app: https://claude.ai/artifact/1d1Zqo9n8UtXgizSuxjVnJ

## Standard for every pack

1. **Every wrong answer gets a reason.** Grammar questions carry an `explanation` and per-option `distractorNotes`. The app shows a note as "You chose X: …" just before the explanation, so it needn't repeat the rule, but it must make sense on its own: a bare "No.", "Not a form." or "Not a word." doesn't count, and nor does shorthand such as "Reversed.", "One word." or "cercare di."; name the right form and why, as in "*fare* works from the old stem *fac-*: *io faccio*" (units 1–18 meet this as of v7.2, and the build refuses a unit that has a lesson while any of its wrong options lacks a note or has one of these). Sentences carry an `explanation`, and every option in a cloze's `options` gets a note in `cloze.notes` saying why that word doesn't fit this sentence, not just what it means ("*mentre* means while, for two things at once; the call comes right after arriving: *appena*"). A distractor must not also make a correct sentence with the same meaning (*Non esco, purché non…* beside *a meno che non…*; *Per Natale vado dai nonni* beside *A Natale…*; *Che ore hai?* beside *Che ore sono?*; *Qui vendono biglietti* beside *Qui si vendono biglietti*; and check whether a verb you think needs a preposition can also take a direct object: *abitare una casa*, so *la casa che abito* is correct), and must never be one of the accepted answers: the app silently drops such an option from the multiple choice, and the build rejects it. Before calling an option "not a word", check a dictionary: Unit 18 once offered *sbronzato* as an invented form beside *ero sbronzo*, but it is the participle of *sbronzarsi* (to get drunk) and is also used as an adjective, so *ero sbronzato* is right too. When you add an accepted sentence, check that no cloze option now builds it (Unit 17's progressive cloze dropped the option *studia* once *Anna studia mentre Marco dorme* became an accepted answer). Nouns, verbs and tricky words carry a one-sentence `note`. In a mixed review unit (Unit 17), every explanation ends with the units it draws on, in brackets, one fixed tag per unit: *(Essere & basics)*, *(Nouns & articles)*, *(Present tense)*, *(Irregular verbs)*, *(Verb tenses)*, *(Adjectives)*, *(Numbers)*, *(Adverbs)*, *(Questions)*, *(Prepositions)*, *(Conjunctions)*, *(Subjunctive)*, *(Object pronouns)*, *(Formal & informal)*, *(Time)*, *(Longer sentences)*; its lesson is arranged by the decisions a sentence needs (agreement, which past tense, where the pronouns go…) and links each rule to the section that explains it in full. The app also derives explanations from the data itself (stem + ending for regular verbs, the article rule for each noun), so notes should add what the data can't say: exceptions, contrasts, memory hooks.
2. **Every unit gets `notes`**: 5–10 plain sentences summarising the rules (a review unit or a vocabulary pack needs only a few). They are shown on the unit's Reference screen before drilling, as "The unit in brief" at the end of its lesson, and on the Rules screen, which gathers every unit's notes under a contents list.
3. **Content is the source of truth.** The app never derives an article, plural or conjugation; it only checks what the pack states. Nouns must list all four forms or none.
4. **Concise and academic.** Explanations are one or two sentences, in plain terms, naming the rule and the form.
5. Sentences are original (not copied from textbooks) and reuse vocabulary from the same or earlier units.
6. **British English.** British spelling and vocabulary throughout (*flat*, *lift*, *chemist's*, *trainers*, *stay at home*), and floors counted the British way (*il secondo piano* is the second floor, the third in American English). Use *in case* only in its British sense of a precaution (take an umbrella in case it rains); for a condition write *if*, *should you…* or *in the event that* (*Call me should you have any problems*). Quotation marks in sentences are curly, in Italian and English alike: *Come si dice “book” in italiano?* Typed answers ignore quotation marks, so the learner never has to type them.
7. **One wording per rule.** A rule that comes up in several units is worded the same way everywhere, so the units never seem to disagree. Settled so far:
   - *se* never takes the present subjunctive in an if-clause, that is, a condition (*se piove*, not *se piova*); meaning whether, it can (*Non so se venga*).
   - *per* gives a whole period, finished or planned (*Ho vissuto qui per due anni*, *Resto per una settimana*); *da* + the present is for something still going on (*Vivo qui da due anni*).
   - *essere* in compound tenses: verbs of going somewhere, staying, change of state, and happening or seeming (*succedere*, *sembrare*, *piacere*), *essere* itself and every reflexive verb. Activities such as *camminare*, *viaggiare*, *nuotare* take *avere*, however much moving they involve.
   - *lo* and *la* usually become *l'* before a vowel, and always before *ho, hai, ha, hanno*.
   - A family member in the singular usually drops the article before a possessive (*mio padre*); plurals keep it (*i miei genitori*), *loro* always does (*il loro padre*), and *mamma* and *papà* often do.
   - *quanto* stays *quanto* when it asks how much (*Quanto costa?*); before a noun, or standing for people or things, it agrees (*quante persone*, *Quanti siete?*).
   - *chi* takes a singular verb, except *essere*, which agrees with the people asked about (*Chi sono quei ragazzi?*).
   - *metterci* has a subject, the person or thing taking the time (*Ci metto un'ora*, *Il treno ci mette due ore*); *volerci* has no personal subject: the time needed is the subject, and the verb agrees with it (*Ci vuole un'ora*, *Ci vogliono due ore*).
8. **Register labels for colloquial content.** In Unit 18 every word and phrase starts its note with its register in brackets: *(neutral)*, *(mild)* (a softened swear word, fine in any company), *(informal)*, *(slang)*, *(youth slang)*, *(vulgar)* or *(regional)*, with a place or a qualifier after a comma where it helps: *(regional, Rome)*, *(youth slang, Milan)*, *(informal, blunt)*. The unit's first note explains the scale. Vulgar items are limited to the few a learner needs to recognise.

## Pack format

```json
{
  "pack": "plurals-01", "version": 1,
  "units": [
    { "id": "u07", "order": 7, "title": "Plurals", "collins": "Nouns",
      "description": "-o → -i, -a → -e, -e → -i, and the exceptions",
      "notes": ["Rule 1 …", "Rule 2 …"] }
  ],
  "items": [ … ]
}
```

- `order` sorts the unit in the list. Grammar units use 1–99; flashcard units 100+. A decimal slots a unit between two others: the slang unit is 16.5, so the Wild card (17) stays last. The `collins` field is optional and no longer displayed; units are organised by topic, not by any textbook.
- `"mode": "flashcards"` on a unit makes every vocab item in it a typed card (see below). Omit for grammar units.
- An imported item whose `id` already exists replaces the old one. Prefix ids by pack to avoid collisions (`pl-`, `fc2-`).
- Don't repeat a word within one unit. A word repeated in another unit shares one progress record only when its `it`, `pos` and `forms` (and, for nouns, the articles) match exactly, so give repeated words identical data. When an item is removed, map its old id to the item that keeps its progress in the app's `ID_ALIASES`. A word with two roles in different units (*anche*, *perché*, *quando*, *appena*) gets the same combined label everywhere, `"pos": "adverb/conjunction"`, shown as "adverb · conjunction", so the copies share one record. Nouns taught as forms of address (*signore*, *dottore*, *avvocato*) stay nouns, with their articles, so they share progress with the same nouns elsewhere; `expression` is for real phrases (*buongiorno*, *mi dica*). Spelling variants are the same word: no *buona sera* beside *buonasera*.
- When the same English sentence appears in two units, give both the same accepted Italian, so the same answer isn't right in one unit and wrong in the other.

## Item types

**vocab** (grammar units)
```json
{ "id": "v-zaino", "unit": "u02", "type": "vocab", "it": "zaino", "en": ["backpack", "rucksack"],
  "pos": "noun", "gender": "m", "art": "lo", "indef": "uno", "plural": "zaini", "artPl": "gli",
  "note": "lo before z-" }
```
Exercises generated: flip card, meaning (multiple choice), typed recall (English → Italian, nouns typed with their definite article), article drill (only when `art/indef/plural/artPl` are all present). `pos` for grammar units: noun, adjective, adverb, pronoun, conjunction, preposition, verb, expression; `det` for determiners (*ogni*, *qualche*, *alcuni*, *nessuno*, *tutto*, *molto*, *poco*, *troppo*, *tanto*, *parecchio*, *altro*, *qualunque*), `possessive` (*il mio*, *il tuo*…) and `demonstrative` (*questo*, *quello*); two roles combine with `/` (`adverb/conjunction`). If typed recall gets another word with the same English (*cosa* for *che cosa*), the app asks for a retry and shows the first letters that tell the two apart ("it starts with ch"), so true synonyms can sit in the same unit.

**vocab (adjectives)** may carry `"forms": ["nuovo", "nuova", "nuovi", "nuove"]` (m sing, f sing, m pl, f pl). With forms present and `"pos": "adjective"`, the app generates an **agreement drill** (a real noun from the content + the adjective in brackets → type the agreed form) and explains the ending from the noun's gender and number. The drill places the adjective after the noun, so words that go before it take their own `pos` (`det`, `possessive`, `demonstrative`), and interrogatives (*quanto*, *quale*) carry no forms; the glossary still lists the forms of a determiner. A form that doesn't exist is written "—" (*alcuni*: "—", "—", "alcuni", "alcune"), and the app leaves it out of drills and lists.

**vocab** (flashcard units)
```json
{ "id": "fc2-uccello", "unit": "fc02", "type": "vocab", "it": "uccello", "en": ["bird"], "pos": "nm" }
```
`pos` codes: `nm` `nf` (nouns, shown as m/f on the card), `v`, `adj`, `adv`, `pron`, `prep`, `conj`, `num`, `det`, `int` (interjection), `expr`, and for phrases `np` (noun phrase), `vp` (verb phrase) and `advp` (adverbial phrase); combine with `/` (`nm/adj`). Later packs may use short phrases in `it` ("tre uccelli", "il tavolo rosso").

Cards are typed in both directions. By default the Italian is shown and the English typed; Settings → Vocab pack cards switches to English → Italian, or a mix.
- **Italian → English:** any entry in `en` is accepted; a leading *to / the / a / an* is optional; British and American spellings count as the same word, so list only the British one (*colour*, *grey*, *theatre*, *organise*); digits count as words (*24 hours* = *twenty-four hours*); and in phrases of three words or more, *my / your / his…* and *me / him / someone…* are interchangeable. After a wrong answer, **Accept my answer** adds what was typed to that card's answers, saved with the learner's progress.
- **English → Italian:** the prompt is the first entry in `en`, so make it British and unambiguous. Where an English word has several senses, a bracket limits it: *orange (fruit)*, *floor (storey)*, *light (not heavy)*. The bracket is optional to type in the other direction (*orange* is accepted), but the "also means this" retry only pairs cards whose glosses match the prompt exactly, so if the bare word is a plain translation too, list it separately: *conoscere* has "to know (a person or place)" and "to know". A gloss that repeats a bracketed one is shown only once (*so (therefore), therefore*). A verb gloss never pairs with a noun gloss (*to fall* / *fall*).
- Order the glosses British first; American vocabulary can follow as a later accepted answer (*holiday / vacation*, *lift / elevator*, *number plate / license plate*).
- Notes add what the card can't show: false friends (*A false friend: …*), irregular plurals (*le uova*, *le dita*), masculine nouns in *-a* (*il problema*), nouns that don't change in the plural (*le foto*), and collective singulars (*la gente*, *la frutta*).

**number**
```json
{ "id": "n-28", "unit": "u07", "type": "number", "value": 28, "it": "ventotto", "note": "venti drops its i before otto." }
```
Drilled both ways (digits → word, word → digits); explanations of the composition are derived by the app. Where a number has two correct spellings, give the usual one in `it` and the other in `"alt": ["centotto"]`: the drill accepts both and the glossary shows "also centotto". (*cento* and *mille* keep their vowel before *uno* and *otto*, so *centouno*, *centootto*, *milleuno* are the usual forms; before *ottanta*, *centottanta* is usual.)

**verb**
```json
{ "id": "vb-finire", "unit": "u05", "type": "verb", "it": "finire", "en": ["to finish"], "group": "-ire (-isc-)",
  "forms": { "presente": ["finisco", "finisci", "finisce", "finiamo", "finite", "finiscono"] },
  "note": "-isc- appears in every form except noi and voi." }
```
Forms are always ordered io, tu, lui/lei, noi, voi, loro. Add tenses as extra keys (`passato_prossimo`, `futuro`). `group` is `-are`, `-ere`, `-ire` (regular, and the app then explains stem + ending) or a label like `irregular`; add `note` for spelling changes. A person that doesn't exist is written "—": *succedere*, used only of things that happen, has "—", "—", "succede", "—", "—", "succedono", and the drills skip the gaps. When a verb takes both auxiliaries, the note says when, as the Verbs section does for *finire*: *avere* with an object (*ho finito il libro*), *essere* when something comes to an end (*il film è finito*).

**sentence**
```json
{ "id": "s-u05-03", "unit": "u05", "type": "sentence", "it": ["Finiamo alle sei.", "Noi finiamo alle sei."],
  "en": ["We finish at six."], "cloze": { "text": "Noi {finiamo} alle sei.", "hint": "finire" },
  "explanation": "noi → -iamo; the -isc- infix never appears in the noi form." }
```
Sentences generate three exercises: **fill in the blank** (from `cloze`), **word order** (English shown, Italian words tapped in order, two distractors from the unit's other sentences; needs ≥ 3 words) and **translate** (English shown, whole sentence typed). Sentences without a cloze still get the other two.
- **What translate accepts:** every entry in `it`; every combination of the cloze's alternative blanks (`{Dov'|Dove }è la stazione?`); and a leading subject pronoun, added or left out, wherever the verb form and the English subject agree (*Io parlo* for "I speak"). It doesn't accept one with *piacere*-type verbs, whose English subject is the indirect pronoun: *Gli piace la musica* (he likes music), not *Lui gli piace la musica*. Pronoun variants therefore needn't be listed (they do no harm); list real alternatives instead: other word orders, synonyms, the other gender (*Sono stanco* / *Sono stanca*).
- **English prompts:** an unmarked *you* means *tu*, and when the answer uses *tu* the prompt says “you” = *tu*. Mark the others: *you (plural)*, *(formal)*, and for commands that could go either way *(to a friend)* or *(to a stranger)*; add *(f.)* or *(m.)* where only one gender is accepted and an ending shows it: *I (f.) arrived late*, *The friends (f.) are nice*.
- **Feedback:** a wrong translation is compared with the accepted answer nearest to what was typed, with up to two others listed as "Also right". If the attempt is near none of them (a guess, or *non lo so*), the first entry is shown, so put the most natural, complete sentence first: *Lascio la luce accesa perché tu veda la strada* before *… perché veda …*.
- **Hints:** `cloze.hint` is an infinitive for verb blanks, followed by the person and the tense where needed, with the tense named in Italian as in the verb tables (*passato prossimo*, *imperfetto*, *futuro*, *condizionale*, *congiuntivo presente / passato / imperfetto*): "arrivare, loro, congiuntivo imperfetto". The app reads the part before the first comma to find the verb table for the feedback; for article blanks use a label like "definite article" (the app then finds the noun's forms). Several accepted blanks: `{sono|io sono}`.

**grammar_mc**
```json
{ "id": "g-u07-02", "unit": "u07", "type": "grammar_mc", "prompt": "What is the plural of l'amico?",
  "options": ["gli amici", "gli amichi", "i amici", "le amiche"], "answer": "gli amici",
  "explanation": "amico → amici: the plural is -ci, unlike most -co words. Masculine l' becomes gli.",
  "distractorNotes": { "gli amichi": "amico is one of the -co nouns that do NOT add h.", "i amici": "Before a vowel the masculine plural article is gli.", "le amiche": "That is the feminine plural (amica)." } }
```

**transform** (rewrite a sentence by an instruction)
```json
{ "id": "t-u13-01", "unit": "u13", "type": "transform", "it": "Compro il libro.", "task": "Replace il libro with a pronoun",
  "answer": ["Lo compro."], "explanation": "il libro is masculine singular, so lo, placed before the verb." }
```
Shown first as a flip card with the answer and explanation, then as a typed exercise: the sentence and the task appear, any entry in `answer` is accepted, and there's no typo tolerance. Used for pronouns, imperatives and gerunds; list every correct rewrite in `answer` (*Voglio vederlo.* / *Lo voglio vedere.*).

**prep** (preposition + article)
```json
{ "id": "p-u10-di", "unit": "u10", "type": "prep", "it": "di", "en": ["of", "from", "'s"], "note": "…" }
```
`it` must be one of *di, a, da, in, su*. Introduced with the table of merged forms; the drill then picks a noun from the unit (or any unit) that has full article data and asks for the merged form: *in + lo zoo → nello zoo*.

**clock**
```json
{ "id": "clk-u15-10", "unit": "u15", "type": "clock", "value": "10:40", "it": ["sono le undici meno venti", "sono le dieci e quaranta"] }
```
Drilled both ways: digits → words (any entry in `it` is accepted) and words → digits (*hh:mm*, a leading zero optional). The words shown are the first entry in `it`; if it is a 12-hour reading (*sono le sette e un quarto*), digits for either half of the day are accepted, while a 24-hour reading (*le diciannove e quindici*) or one with *mezzogiorno* / *mezzanotte* has one answer. List every common reading in `it`: counting up and counting back (*le sei meno un quarto*, *le cinque e tre quarti*, *le cinque e quarantacinque*), the plain-minutes forms (*le sei meno quindici*, *le due e trenta*), and the 24-hour one for afternoon times.

## How the app treats content

- New items are introduced with a recognition exercise, then get a production follow-up later in the same lesson; from box 2 on, only typed answers promote an item. Boxes: 10 min, 1, 3, 7, 14, 30, 60 days. Learned = box 5+.
- Accents lenient by default (with a note); apostrophes always matter, while quotation marks and other punctuation are ignored (*'zaino'* = *zaino*). Typo tolerance (on by default; Settings can turn it off) applies only to typed recall, translations and flashcards: one wrong, missing or extra letter in one word of five or more letters, as long as the last letter is right (so a changed last letter, such as a gender or number ending, is never forgiven) and the slip doesn't spell another word the app knows from its content: *quando* for *quanto*, *siamo* for *siano*, *vorrai* for *vorrei* or *night* for *right* is a wrong word, not a typo. Every other typed drill (articles, verb forms, agreement, prepositions, clozes, numbers, clock times, transforms) wants the exact spelling.
- A note in brackets in an answer is optional to type, in Italian as in English: `"che (relative)"` accepts *che*, `"time (occasion)"` accepts *time*. Use brackets to tell apart two items with the same word, not for anything the learner must type.
- Compound verb forms can carry agreement variants: `"sono andato/a"`, `"siamo andati/e"` — the drill and the clozes accept either ending.
- Flashcard units have their own pacing (cards per session, new per session) and are excluded from Continue and Review; grammar units use the daily new-item limit.
- The Reference screen has two tabs when a unit has a lesson: **Lesson** (long-form reading, below) and **Glossary**, which lists every item in the unit (verb tables, noun forms, sentences with explanations, grammar points) with its box, filterable. Units without a lesson show the glossary only.
- Explanations appear after mistakes by default, or after every answer (Settings); a new item's first card always shows its explanation.
- Every exercise has a **Flag this item** button with an optional note. Flagged items are listed on the Data screen: that list is how a content problem gets back to the build chat.

## Unit lessons (Reference → Lesson tab)

A unit can carry a long-form lesson for passive reading, shown on its Reference screen under a **Lesson** tab beside the **Glossary**. Built-in lessons live in the app's `LESSONS` constant, keyed by unit id; an imported unit can carry its own `lesson` field, which takes precedence. Every unit has one, u01–u18 (the slang unit's since v6.7).

```json
"lesson": {
  "intro": "One paragraph: what the unit covers and what you can do after it.",
  "sections": [
    { "h": "*essere*: the present tense", "b": [
      "A paragraph, with *italiano* in the Italian face and **bold** for emphasis.",
      { "h": "A sub-heading" },
      { "ex": [["Sono di Roma.", "I'm from Rome."]] },
      { "head": ["", "singular", "plural"], "it": [1, 2], "table": [["masculine", "italiano", "italiani"]] },
      { "list": ["…"], "ol": true },
      { "label": "Watch out", "tip": "…" },
      { "dlg": [["Luca", "Ciao!", "Hi!"]] },
      { "fix": [["Anna è stanco.", "Anna è stanca.", "The adjective agrees with Anna."]] }
    ]}
  ]
}
```

- Inline markup: `*italiano*`, `**bold**` (never end a bold span with an italic one), `[[u04|text]]` links to another unit, `[[u04#3|text]]` opens another unit's lesson at section 3, `[[#9|text]]` jumps to section 9 of the same lesson. In built-in lessons, name the section by its heading instead: `[[#Prepositions and pronouns|text]]`, or `[[#Prepositions and pronouns]]` to show "section 14"; across units, `[[u13#Where the pronouns go|the pronouns unit]]`. Point a cross-unit link at the section that answers the reader's question rather than the top of the unit, once that unit has a lesson. The build turns headings into numbers (a unique beginning of the heading is enough), so adding a section never leaves a link pointing at the wrong place; imported lessons use numbers. In a table cell, `\n` starts a new line in the same style and `\n~` adds a muted gloss line: `"il fiore, il cane\nla chiave, la notte"`, `"Chi è?\n~Who is it?"`. `it` lists the table columns set in the Italian face. Keep tables to a label column plus at most four short columns, so they fit a phone screen without sideways scrolling; if the cells still wrap, move what the columns share into the headings (Unit 6's possessives table heads its columns *il* …, *la* …, *i* …, *le* … and lists just *mio, mia, miei, mie*). When a row pairs items (*vicino a* and *lontano da*), give each its own line with `\n` in both cells rather than joining them with a semicolon: table lines have the same height in both kinds of column, so the pairs stay level, and a narrow column never breaks inside a phrase. In Italian columns a word of one to three letters is kept on the same line as the next word automatically (*a Roma*, *in Toscana*).
- Checked at build time: stray `*` or `[[`, links to units or sections that don't exist, a heading link that matches no section (or more than one) in its own or the named unit, a section link to a unit that has no lesson yet, a link whose text says "section N" but points elsewhere, and tables wider than a label column plus four. Word endings written with a leading hyphen (*-mente*, *-emmo*) never break across lines.
- Generated automatically: the contents list, a sticky Lesson/Glossary bar with a Contents jump, "Continue reading" (remembered per device), the unit's `notes` as a final section "The unit in brief", Practise / Glossary buttons at the end, and a "Next lesson" button leading to the next unit that has one. Look up also searches lesson text and links straight to the matching section.
- Standard: a full lesson, not a summary. Roughly 3,500–6,500 words in 15–19 sections (the bigger units run longer) that cover every rule the unit's items test; original examples with English; at least one model dialogue or reading passage; a common-mistakes section; "Looking ahead" links where a later unit takes a topic further; British spelling, as elsewhere in the app. Same accuracy bar as the items: if writing a lesson exposes a wrong or overstated item explanation, fix the item as well. Each new lesson also gets a re-read of the lessons before it, fixing anything the new unit shows to be inaccurate, inconsistent or unclear. Mark stress with capitals (*te-LE-fo-no*), split syllables the Italian way (*s* + consonant opens a syllable: *te-DE-sco*, *FRE-sco*), and check every stress claim against a dictionary: item notes have had the stress wrong twice so far (*amico*, *telefonare*), and the syllables once (*te-DES-co*). For any unit with verb tables, check every form by script, both against the regular conjugation rules and against the Verbs section (`VERB_GYM`), and review each difference by hand; as of v7.2 all 3,036 forms shared between the units and the Verbs section agree. Forms the Verbs section doesn't have, such as Unit 12's subjunctives and Unit 14's imperatives, are checked against the rules the same way: as of v7.2 all 558 subjunctive and 185 imperative forms follow the rules, with the irregular ones (*sia*, *abbia*, *sappia*, *dia*, *stia*, *debba*, *vada*, *faccia*; *sii*, *abbi*, *sappi*, *di'*, *va'*, *fa'*, *da'*, *sta'*) reviewed by hand. State *essere* vs *avere* in the settled wording above, never as "movement".

## Requesting a pack

"Build a pack on X" is enough. Useful extras: which unit it should follow, how many items, whether it should include sentences, and whether it should be imported (paste JSON on the Data screen) or baked into the app.
