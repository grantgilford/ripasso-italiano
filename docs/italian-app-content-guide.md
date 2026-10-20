# Italian Practice App: Content Pack Guide (v3.1)

Companion to `italian-app-spec.md`. This describes what the built app (v8.6, Ripasso Italiano) actually accepts, so new packs can be written in a build chat and imported from the Your data screen (You → Content packs), or baked into the app on republish. Published app: https://claude.ai/artifact/1d1Zqo9n8UtXgizSuxjVnJ

## Standard for every pack

1. **Every wrong answer gets a reason.** Grammar questions carry an `explanation` and per-option `distractorNotes`. The app shows a note as "You chose X: …" just before the explanation, so it needn't repeat the rule, but it must make sense on its own: a bare "No.", "Not a form." or "Not a word." doesn't count, and nor does shorthand such as "Reversed.", "One word." or "cercare di."; name the right form and why, as in "*fare* works from the old stem *fac-*: *io faccio*" (units 1–18 meet this as of v7.2, and the build refuses a unit that has a lesson while any of its wrong options lacks a note or has one of these). Sentences carry an `explanation`, and every option in a cloze's `options` gets a note in `cloze.notes` saying why that word doesn't fit this sentence, not just what it means ("*mentre* means while, for two things at once; the call comes right after arriving: *appena*"). A distractor must not also make a correct sentence with the same meaning (*Non esco, purché non…* beside *a meno che non…*; *Per Natale vado dai nonni* beside *A Natale…*; *Che ore hai?* beside *Che ore sono?*; *Qui vendono biglietti* beside *Qui si vendono biglietti*; and check whether a verb you think needs a preposition can also take a direct object: *abitare una casa*, so *la casa che abito* is correct), and must never be one of the accepted answers: the app silently drops such an option from the multiple choice, and the build rejects it. Before calling an option "not a word", check a dictionary: Unit 18 once offered *sbronzato* as an invented form beside *ero sbronzo*, but it is the participle of *sbronzarsi* (to get drunk) and is also used as an adjective, so *ero sbronzato* is right too. When you add an accepted sentence, check that no cloze option now builds it (Unit 17's progressive cloze dropped the option *studia* once *Anna studia mentre Marco dorme* became an accepted answer). Nouns, verbs and tricky words carry a one-sentence `note`. In a mixed review unit (Unit 17), every explanation ends with the units it draws on, in brackets, one fixed tag per unit: *(Essere & basics)*, *(Nouns & articles)*, *(Present tense)*, *(Irregular verbs)*, *(Verb tenses)*, *(Adjectives)*, *(Numbers)*, *(Adverbs)*, *(Questions)*, *(Prepositions)*, *(Conjunctions)*, *(Subjunctive)*, *(Object pronouns)*, *(Formal & informal)*, *(Time)*, *(Longer sentences)*; its lesson is arranged by the decisions a sentence needs (agreement, which past tense, where the pronouns go…) and links each rule to the section that explains it in full. The app also derives explanations from the data itself (stem + ending for regular verbs, the article rule for each noun), so notes should add what the data can't say: exceptions, contrasts, memory hooks.
2. **Every unit gets `notes`**: 5–10 plain sentences summarising the rules (a review unit or a vocabulary pack needs only a few). They are shown on the unit's screen (Units → the unit) before drilling, as "The unit in brief" at the end of its lesson, and on the Rules screen, which gathers every unit's notes under a contents list.
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

Cards are typed in both directions. By default the Italian is shown and the English typed; You → More settings → Vocab pack cards switches to English → Italian, or a mix.
- **Italian → English:** any entry in `en` is accepted; a leading *to / the / a / an* is optional; British and American spellings count as the same word, so list only the British one (*colour*, *grey*, *theatre*, *organise*); digits count as words (*24 hours* = *twenty-four hours*); and in phrases of three words or more, *my / your / his…* and *me / him / someone…* are interchangeable. After a wrong answer, **Accept my answer** adds what was typed to that card's answers, saved with the learner's progress.
- **English → Italian:** the prompt is the first entry in `en`, so make it British and unambiguous. Where an English word has several senses, a bracket limits it: *orange (fruit)*, *floor (storey)*, *light (not heavy)*. The bracket is optional to type in the other direction (*orange* is accepted), but the "also means this" retry only pairs cards whose glosses match the prompt exactly, so if the bare word is a plain translation too, list it separately: *conoscere* has "to know (a person or place)" and "to know". A gloss that repeats a bracketed one is shown only once (*so (therefore), therefore*). A verb gloss never pairs with a noun gloss (*to fall* / *fall*).
- Order the glosses British first; American vocabulary can follow as a later accepted answer (*holiday / vacation*, *lift / elevator*, *number plate / license plate*).
- Notes add what the card can't show: false friends (*A false friend: …*), irregular plurals (*le uova*, *le dita*), masculine nouns in *-a* (*il problema*), nouns that don't change in the plural (*le foto*), and collective singulars (*la gente*, *la frutta*).
- Each pack adds new words: a word appears on one flashcard only, in any pack (accents count, so *metà* and *meta* are two words), and the content check refuses a repeat. Where a close relative of an earlier word is worth knowing, the note names it rather than giving it a card of its own (pack 6's *presupposto* mentions *presupporre*). A verb's first gloss starts with *to*, so it is never paired with a noun.
- **Packs run from easier to harder, judged by how common their words are.** `tools/pack-levels.js` gives each pack's median frequency rank (half its words are more common than this) and its share of the 1,000, 3,000, 5,000 and 10,000 most common Italian words; as a rough guide, 1,000 words take a learner to about A2, 3,000 to B1, 5,000 to B2 and 8,000–10,000 to C1. As of v8.5: pack 1 (unit fc01) is the core, median about 950; packs 2, 3 and 4 (fc03, fc02, fc06) share one band, median about 2,100–3,100; pack 5 (fc04) is about 4,600; pack 6 (fc05) about 11,000, upper-intermediate on the way to C1. Pack 3's phrases are built from common words, so it is no harder than pack 2, whatever its idioms suggest; pack 4 (v8.5) fills the gaps the first three left (general words, countries and nationalities, animals, music, sport). A new pack takes its number from its median: give its unit the next free id (fc07…) and an `order` between the packs it falls between, and renumber the titles (*Vocab pack N*), the `pack` names (`vocab-pack-0N`) and any "Pack N assumes packs 1–…" notes after it. Unit ids and item ids never change, so progress is untouched. `node tools/pack-levels.js words.txt` measures a draft list, and `--missing` lists the most common words no card has yet (the place to start a new pack's list), with names and English words mixed in to skip.

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
Forms are always ordered io, tu, lui/lei, noi, voi, loro. Add tenses as extra keys (`passato_prossimo`, `imperfetto`, `futuro`, `condizionale`, `trapassato_prossimo`); the conjugation drill picks one at random. Unit 5's verbs from v7.5 carry six tenses, and its sentences drill the *condizionale* and the *trapassato prossimo* (cloze hints name them: "perdere, trapassato prossimo"). `group` is `-are`, `-ere`, `-ire` (the app then introduces the verb as "an -ere verb" and explains each regular form as stem + ending) or a label like `irregular`; add `note` for spelling changes. A verb that follows its conjugation apart from a shortened future or an irregular participle keeps its `-ere` (or `-ire`) label, as in the Verbs section, and its `note` names the exception: *vedere* is `-ere`, with the note "Participle visto; shortened future stem vedr- (vedrò)." The content check accepts a shortened future only when the note mentions the future. A person that doesn't exist is written "—": *succedere*, used only of things that happen, has "—", "—", "succede", "—", "—", "succedono", and the drills skip the gaps. When a verb takes both auxiliaries, the note says when, as the Verbs section does for *finire*: *avere* with an object (*ho finito il libro*), *essere* when something comes to an end (*il film è finito*).

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
Shown first as a flip card with the answer and explanation, then as a typed exercise: the sentence and the task appear, any entry in `answer` is accepted, and there's no typo tolerance. Used for pronouns, imperatives and gerunds, in Unit 12 for the subjunctive (start with *Penso che…*, move the main verb into the past, make a condition hypothetical), and in Units 3–5 for conjugation: change the person or the tense, make it formal or polite, and "Correct the mistake" (*Sono fame.* → *Ho fame.*). List every correct rewrite in `answer` (*Voglio vederlo.* / *Lo voglio vedere.*), with and without the subject pronoun. Accents are lenient here as everywhere, so never build a correction that differs from the original only by an accent (*da* → *dà*): typing the original back would pass with a note. The content check refuses an answer that is the sentence unchanged.

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

### The practice types added in v8.6

Five item types turn a rule into something to do rather than a question to answer. Each is described, with what it looks like and where it fits, in `docs/exercise-types.md`; units 1 and 2 use all five. Like every item, each needs an `explanation`, and every wrong choice it offers needs a reason.

**spot** (Spot the mistake: tap the wrong word, then type it right)
```json
{ "id": "sp-u01-z01", "unit": "u01", "type": "spot", "it": "Anna è stanco.", "wrong": "stanco", "fix": ["stanca"],
  "en": "Anna is tired.", "explanation": "The adjective agrees with Anna, a woman: stanca.",
  "notes": { "è": "è is right: Anna is one person, so the lui/lei form." } }
```
`it` is the sentence as shown, with one mistake; `wrong` is that word, exactly as it appears once in the sentence (punctuation and capitals aside), and `fix` its right forms, first the one shown. A fix can be two words (*C'è* → *Ci sono*), and one ending in an apostrophe joins the next word (*una* → *un'*: *un'isola*). `en` is required: it is the prompt, and it is what tells the learner what the sentence should mean, so mark *(f.)* where an ending depends on it. `notes` are optional reasons for the right words a learner is likely to tap ("*trenta* is not the mistake…"); without one the app says the word is right as it stands. Set `"wrong": null` (and leave out `fix`) for a sentence with no mistake, the answer then being **No mistake**: use these for traps that are right (*Il problema è difficile*, *Marco è medico*, *Non sono mai stanco*), a few per unit. The learner types the fix only from box 2; a fix that differs from the mistake only by an accent or a capital (*e* → *è*, *Italiano* → *italiano*) is tap-only, since lenient accents would pass the wrong word typed back. The mistake must be a real slip a learner makes, and the corrected sentence must be the only fix: check that no other single word could be changed to make it right with the same meaning.

**endings** (Complete the endings: boxes inside the sentence)
```json
{ "id": "en-u01-z01", "unit": "u01", "type": "endings", "text": "Le ragazz{e} sono stanc{he}.", "en": "The girls are tired.",
  "explanation": "ragazza → ragazze; stanco → stanche, where the h keeps the hard c sound." }
```
Each `{…}` is a box; it can hold an ending (*stanc{he}*, which tests the *h*) or a short word (*{Un'}amica*), and `|` gives alternatives (*pront{i|e}* where the English doesn't settle the gender). Put the blank where the rule is, not where the answer is obvious: *stanc{he}* tests the spelling, *stanch{e}* doesn't. Keep to four boxes at most; `en` is shown as the hint. Checked exactly, accents lenient as everywhere.

**reply** (Choose the reply, then Write the reply)
```json
{ "id": "re-u01-z01", "unit": "u01", "type": "reply", "who": "Luca", "line": "Ciao! Come ti chiami?", "cue": "Say your name is Anna.",
  "answer": ["Mi chiamo Anna.", "Sono Anna.", "Il mio nome è Anna."],
  "options": ["Ti chiami Anna.", "Si chiama Anna.", "Mi chiama Anna."],
  "notes": { "Ti chiami Anna.": "ti chiami is “your name is”; for your own name, mi chiamo.", "…": "…" },
  "explanation": "chiamarsi carries a small pronoun: mi chiamo, ti chiami, si chiama." }
```
`line` is what the other person says (read aloud on tap, so Italian only; `who`, optional, is shown above it and never read). `cue` says in English what to answer, and must make one reply right: the options can then differ by grammar (*Ti chiami* / *Mi chiamo*), by register (*E tu?* / *E Lei?*) or by meaning. List in `answer` every natural reply that fits the cue, most natural first; a subject pronoun may be added to any of them without listing it. Give two or three `options`, each with a note; with fewer than two the reply is only ever typed. An option must not be an acceptable reply to the cue (the content check refuses one that is in `answer`).

**sort** (Sort the words)
```json
{ "id": "so-u02-z01", "unit": "u02", "type": "sort", "prompt": "Which article does each noun take?", "groups": ["il", "lo", "la", "l'"],
  "rows": [ { "it": "zaino", "group": "lo", "say": "lo zaino", "note": "z- takes lo." }, … ],
  "explanation": "il before most consonants, lo before z and s + consonant, la for feminine nouns, l' before a vowel." }
```
Two to four short `groups` (they share one row on a phone: a word or two each), and four to six `rows`, each Italian in `it`, its `group`, and a `note` saying why (the content check refuses a row without one). `say` is what the answer panel reads for the row, when the row alone would sound wrong (*lo zaino* rather than *zaino*, *c'è un problema* rather than *un problema*); a row with a gap shows it with an ellipsis (*Marco … stanco*) and gives the whole phrase in `say`. Every row must belong to one group only.

**match** (Match the pairs)
```json
{ "id": "ma-u01-z02", "unit": "u01", "type": "match", "prompt": "Match each question with its answer",
  "pairs": [["Come ti chiami?", "Mi chiamo Sara."], ["Di dove sei?", "Sono di Bologna."], …],
  "explanation": "Each answer uses the verb of its question: chiamarsi, essere, stare, essere, avere." }
```
Four or five `pairs`, short enough to fit half a phone's width (about 28 characters a side). Every left side must be different and so must every right side, and no left side may fit a second right side: *io → sono* and *loro → sono* can't be in the same set. The left column is Italian; add `"right": "en"` when the right column is English (it is then not read aloud). `notes`, optional, keyed by a left side, add a reason after a wrong pairing of it.

## How the app treats content

- New items are introduced with a recognition exercise, then get a production follow-up later in the same lesson; from box 2 on, only typed answers promote an item. Boxes: 10 min, 1, 3, 7, 14, 30, 60 days. Learned = box 5+. Sort and match items, and spot items with no mistake (or one whose fix differs only by an accent or a capital), have no typed exercise, so their recognition answers promote them. A new item's first exercise always shows its explanation, whatever the type.
- Two exercises are built from content that already exists (v8.6): **Make it plural / Make it singular**, for every grammar-unit noun with all four forms (so give each noun its true plural and plural article: they are now typed, *il lago → i laghi*); and **Listen and type**, for sentences of up to nine words that have a cloze, played in the device's Italian voice and typed (only when the device has an Italian voice and Read aloud isn't Off; the learner can choose Can't listen now). The sentence played is the first entry in `it`, and it is the only answer accepted, so make the first entry the plain, natural version.
- Accents lenient by default (with a note); apostrophes always matter, while quotation marks and other punctuation are ignored (*'zaino'* = *zaino*). Typo tolerance (on by default; Settings can turn it off) applies only to typed recall, translations and flashcards: one wrong, missing or extra letter in one word of five or more letters, as long as the last letter is right (so a changed last letter, such as a gender or number ending, is never forgiven) and the slip doesn't spell another word the app knows from its content: *quando* for *quanto*, *siamo* for *siano*, *vorrai* for *vorrei* or *night* for *right* is a wrong word, not a typo. Every other typed drill (articles, verb forms, agreement, prepositions, clozes, numbers, clock times, transforms) wants the exact spelling.
- A note in brackets in an answer is optional to type, in Italian as in English: `"che (relative)"` accepts *che*, `"time (occasion)"` accepts *time*. Use brackets to tell apart two items with the same word, not for anything the learner must type.
- Compound verb forms can carry agreement variants: `"sono andato/a"`, `"siamo andati/e"` — the drill and the clozes accept either ending.
- Flashcard units have their own pacing (cards per session, new per session) and are excluded from Continue and Review; grammar units use the daily new-item limit.
- A unit's screen has two tabs when the unit has a lesson: **Lesson** (long-form reading, below) and **Glossary**, which lists every item in the unit (verb tables, noun forms, sentences with explanations, grammar points) with its box, filterable. Units without a lesson show the glossary only.
- Explanations appear after mistakes by default, or after every answer (Settings); a new item's first card always shows its explanation.
- **Read aloud** (v8.2): a speaker beside the Italian reads it in the device's own Italian voice, so write the Italian exactly as it should sound. The speaker reads the text as written, except that a note in brackets is skipped (*che (relative)* is read *che*; a transform's *Vivo a Roma. (two years, still there)* is read *Vivo a Roma.*), only the first of two endings or words joined by a slash is read (*andato/a* → *andato*, *fa'/fai* → *fa'*), and an arrow, a dash between two speakers or a slash with spaces round it becomes a pause (*Grazie! — Prego.*). So keep English out of `it`, lesson examples (`ex`) and dialogue lines except in brackets. Verb tables are read one person at a time as labelled (*io parlo*, *che io parli*; commands bare). In a practice session a prompt is read only when it already shows the Italian, and the answers of grammar questions are never read, as they are often English.
- Every exercise has a **Flag this item** button with an optional note. Flagged items are listed on the Your data screen (You → Flagged items): that list is how a content problem gets back to the build chat.

## The Verbs section (`VERB_GYM`)

The Verbs tile on Today drills the verbs in `VERB_GYM` (437 as of v7.6), each one tense at a time, in this order: *presente*, *passato prossimo*, *imperfetto*, *futuro*, *condizionale*, *imperativo*, *congiuntivo presente*, *congiuntivo imperfetto*. A verb's next tense opens once the one before it is learned; a verb with no commands goes straight from the *condizionale* to the *congiuntivo presente*. Each entry is one line of data:

```json
{ "it": "passare", "en": ["to pass", "to spend (time)", "to drop in"], "fam": "are", "aux": "a", "pp": "passato",
  "f": [[…presente…], […passato prossimo…], […imperfetto…], […futuro…], […condizionale…], […imperativo…], […congiuntivo presente…], […congiuntivo imperfetto…]], "both": true,
  "note": "avere with an object (ho passato l'esame); essere when you go past or drop in (sono passato da Marco)." }
```

- `fam` is the family the reference screen groups it under and the explanations draw on: `aux`, `are`, `cg`, `iare`, `ere`, `ire`, `isc`, `erepp`, `irepp`, `futs`, `irr`, `contr`, `comp`, `pron` (verbs with built-in pronouns: *andarsene*, *farcela*, *metterci*) and `refl`. The content check compares every regular family, every reflexive verb and every compound labelled `-ere`/`-ire` with the regular rules, and every form shared with a unit with that unit.
- `aux` is the auxiliary the tables show. `both: true` marks a verb that takes either (*finire*, *passare*, *aumentare*): the essere-or-avere question skips it, so its `note` must say when each is used (the check makes sure it mentions both).
- `alts` lists a second correct form, accepted beside the table's (*prevederò*, *mentisco*, *che io deva* beside *debba*).
- **Commands and the subjunctive.** `f[5]` is the *imperativo*, with "—" for *io*; the drills label its persons *tu*, *Lei*, *noi*, *voi*, *Loro*, and a reflexive verb carries its pronoun (*alzati*, *si alzi*, *alziamoci*). Verbs that are hardly ever commands (*potere*, *dovere*, *piacere*, *costare*, *sembrare*…) have `null` there and get no command item. `f[6]` and `f[7]` are the *congiuntivo presente* and *imperfetto*, labelled *che io* … *che loro*; answers are accepted with or without *che* and the subject pronoun, while commands are typed bare. Both follow from forms the verb already has, and the content check holds them to it: the *congiuntivo presente* from the *io* present (*vengo → venga*; regular *-are* verbs take *-i*), the *imperfetto* from the *imperfetto* minus *-vo* + *-ssi* (*facevo → facessi*), and the commands from the present and the *congiuntivo*. Only the irregular ones are written by hand and reviewed: *sia*, *abbia*, *sappia*, *dia*, *stia*, *debba*; *fossi*, *dessi*, *stessi*; *sii*, *abbi*, *sappi*, *va'*, *fa'*, *da'*, *sta'*, *di'*; and the pronominal *andarsene* (*vattene*, *se ne vada*, *andiamocene*).
- The order of `VERB_GYM` is the order new verbs are introduced: everyday verbs first, upper-intermediate ones last.
- **The first gloss is a prompt.** The From English drill shows `en[0]` with a person and tense (*to go · noi · futuro* → *andremo*) and accepts every verb that lists that gloss; a verb sharing another of its glosses earns a retry with a hint. So `en[0]` starts with *to* and must be unambiguous: where two verbs share a word in different senses, a bracket tells them apart (*to stop (moving)* for *fermarsi*, *to stop (doing something)* for *smettere*; *to hire (a car, a bike)* for *noleggiare*, *to take on (staff)* for *assumere*). Verbs that share a first gloss must be true synonyms (*cominciare* / *iniziare*); the content check lists any pair not yet reviewed.
- The drills, besides full tables and single forms: **Pick the form** (multiple choice for new items, its wrong options built from the classic mistakes: the regular pattern where the verb is irregular, the spelling rules ignored, the wrong auxiliary, the *futuro* / *condizionale* mix-up, another person), **From English**, **Which verb?** (a form found in one verb only → its infinitive), **Change the tense** (between tenses the learner has started), **Which tense?**, **Which person?** and **essere or avere?** Every wrong answer gets a reason, as in the units.

## Unit lessons (a unit's Lesson tab)

A unit can carry a long-form lesson for passive reading, shown on the unit's screen under a **Lesson** tab beside the **Glossary**. Built-in lessons live in the app's `LESSONS` constant, keyed by unit id; an imported unit can carry its own `lesson` field, which takes precedence. Every unit has one, u01–u18 (the slang unit's since v6.7).

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
- Generated automatically: the contents list, a sticky Lesson/Glossary bar with a chip for each section (the one being read is highlighted), "Continue reading" (remembered per device), the unit's `notes` as a final section "The unit in brief", Practise / Glossary buttons at the end, and a "Next lesson" button leading to the next unit that has one. Look up also searches lesson text and links straight to the matching section.
- Standard: a full lesson, not a summary. Roughly 3,500–6,500 words in 15–19 sections (the bigger units run longer: Unit 5, with six tenses, has 20) that cover every rule the unit's items test; original examples with English; at least one model dialogue or reading passage; a common-mistakes section; "Looking ahead" links where a later unit takes a topic further; British spelling, as elsewhere in the app. Same accuracy bar as the items: if writing a lesson exposes a wrong or overstated item explanation, fix the item as well. Each new lesson also gets a re-read of the lessons before it, fixing anything the new unit shows to be inaccurate, inconsistent or unclear. Mark stress with capitals (*te-LE-fo-no*), split syllables the Italian way (*s* + consonant opens a syllable: *te-DE-sco*, *FRE-sco*), and check every stress claim against a dictionary: item notes have had the stress wrong twice so far (*amico*, *telefonare*), and the syllables once (*te-DES-co*). For any unit with verb tables, check every form by script, both against the regular conjugation rules and against the Verbs section (`VERB_GYM`), and review each difference by hand; as of v7.6 all 4,506 forms shared between the units and the Verbs section agree, Unit 12's subjunctives and Unit 14's commands included, and compound tenses (*passato prossimo* and *trapassato prossimo*) are checked for the right auxiliary and participle agreement. Subjunctives and commands, in the units and the Verbs section alike, are also checked against the rules they follow from: as of v7.6 all 5,784 subjunctive and 2,180 imperative forms follow them, with the irregular ones (*sia*, *abbia*, *sappia*, *dia*, *stia*, *debba*, *vada*, *faccia*; *sii*, *abbi*, *sappi*, *di'*, *va'*, *fa'*, *da'*, *sta'*) reviewed by hand. State *essere* vs *avere* in the settled wording above, never as "movement".

## Requesting a pack

"Build a pack on X" is enough. Useful extras: which unit it should follow, how many items, whether it should include sentences, and whether it should be imported (paste JSON on the Your data screen) or baked into the app.
