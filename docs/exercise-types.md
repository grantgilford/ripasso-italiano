# Exercise types: the catalogue (v9.16)

Every kind of exercise the app can put in front of the learner, where it comes from, and how to add more. Read this before writing content (to choose a good mix of types for a unit) and before building a new type (the checklist at the end lists every place in the code and tests a type touches). The item formats themselves are in `italian-app-content-guide.md`; the look of each exercise is in `design-system.md`.

To see which types a unit already uses, run `node tools/unit-items.js --counts`; to read a unit's items, `node tools/unit-items.js u01` (add `--type spot` for one type). To see the mix of exercises a unit's items give (how many kinds, and how much the commonest takes), run `node tools/variety.js`; its figures for the current version are under Measured mix below. They are each item's own chances: from v9.5 a session also balances its exercises (Balanced sessions, below).

## How an exercise is chosen

Content authors write **items**; the app turns each item into an **exercise** every time it comes up (`makeExercise` in `index.html`). Which exercise depends on the item's type and its box:

- **Box 0 (new):** a recognition exercise: a flip card, a multiple choice, tapping. A new item's first exercise always shows its explanation. If the item also has a production exercise, one follows later in the same session.
- **Box 1:** mostly recognition, some production.
- **Box 2 and up:** production (typing Italian) wherever the item has it; from box 2, only a production answer promotes an item that has one (`itemHasProduction`). Items with no production exercise (grammar questions, sort, match, a spot item with no mistake or an accent-only one) are promoted by their recognition answer.

A wrong answer puts the item back at the end of the session. Every wrong answer gets a reason in the answer panel; from 9.7 the wrong choices themselves are chosen to teach (Wrong options that teach, below).

### Balanced sessions (from v9.5)

The rules above are each item's own chances. A grammar session (Continue, a unit, Review, Wild card, Mistakes, most-missed) then chooses each item's exercise with the whole session in view (`planSession`), through a hint to `makeExercise` (`opt.avoid`, `opt.prefer`; `pickKey` applies it):

- **Rotation.** Each device remembers the kind (`typeKey`) each grammar item was last answered with, in `itapp.lasttype.v1` (never synced, at most 2,000 items), and the hint avoids it, so a noun typed as *recall* last time gets its article or plural this time.
- **Variety.** The hint prefers kinds the session hasn't used yet, and if a session still has fewer than four kinds in 12 exercises (a third of the number in a shorter one) while its items can give more, the items whose kinds come most often are asked again.
- **No three in a row.** The exercises are ordered as shuffled, except that no kind comes three times running wherever the mix allows (`noTriples`).
- **The same share of typed exercises.** A hint only moves between exercises of the same kind, typed or not (`kind`), so how often an item is typed, and so what can promote it, is as before; only the last pass for variety may cross over, and over many sessions the share stays within a point or so.
- **Tricky items.** An item with 4 or more lapses, at box 3 or below, starts again with its introduction (the box-0 exercise, its explanation shown), which only teaches when a typed follow-up will come; the usual typed follow-up later in the session is the answer that counts.

Follow-ups, repeats and Can't listen now keep their own rules, and vocab pack and Verbs sessions are built as before. Only items whose type offers a choice (vocab and sentences) can be steered: the more kinds of item a unit has, the more varied its sessions. `tools/test-sessions.js` checks all of this.

### Wrong options that teach (from 9.7)

Where an exercise offers wrong choices, they are built to be mistakes worth making, and the answer panel says why. All of it is built from forms the content or `VERB_GYM` states, never derived; `tools/test-choices.js` checks it over the whole content.

- **Word order traps** (`nearMisses`). One of the two extra words is a near-miss of a word in the sentence where the data allows: another person of its verb in the same tense (*sei* beside *sono*, when the verb's person is certain: the cloze blank named by its hint, or the first verb with a subject pronoun before it or a subject in the English), the other article of the same number before a noun the content gives that article (*il* / *lo*, *la* / *l'*, *i* / *gli*, *un* / *uno*, *una* / *un'*), or another form of an adjective with `forms` (the other number; the other gender only after a noun or with the English marked *(m.)* / *(f.)*). It is never one that, put in place of a word of any accepted version (`translationsOf`, a subject pronoun added or left out, accents ignored), makes a sentence the item accepts; with none, both extra words are the unit's random words as before. The answer panel names it: "You chose *sei*: *sei* is the tu form; the subject is io (sono)", or, when it was left out and explanations are shown, "Near miss: …". About 845 of the 1,208 grammar-unit sentences of three words or more have one (3,163 verb persons, 195 articles, 232 adjective forms in all, as of 9.7).
- **Meaning choices** (`distractorsFor`). Best first: a word the learner has mixed up with this one before, then words with the same `pos` and `gender`, then look-alikes (the same first two letters, or a letter or two apart); a word with another `pos` comes in only as a look-alike or a past mix-up. They come from the item's unit; the whole course is searched only when the unit runs short. One option per word (progress record), and none is one of the item's answers, a word with the same Italian, or, for Italian options, a word sharing the meaning asked for.
- **Confusion memory** (`itapp.confusions.v1`, per device, never synced, at most 500 pairs). A wrong answer that is another word's right answer (its meaning chosen, its Italian typed for the English, or for a card another card's meaning typed) is remembered as a pair; that word is offered first in the next meaning choice, and from the second time the answer panel says "You've mixed up *casa* and *cosa* 2 times". Accept my answer takes the mix-up back.
- **Flashcards in context** (`contextFor`). After a card is answered, right or wrong, the answer panel shows one sentence from a grammar unit (the slang unit aside) that uses the card's word as whole words, accents ignored, with its English and a speaker; the sentences are indexed by their words the first time a card needs one. 661 of the 8,000 cards have one as of 9.7.

### Meanings in the answer panel (from 9.16)

Wherever an exercise shows Italian without its English, and the English isn't what it asks for, the answer panel gives it after the answer, right or wrong, whatever the explanations setting (`ex.meaning`, drawn as `.mean` straight after the answer line and "You typed"). Shown only after answering, it is never a hint; in the prompt it would be for some (Which verb?, a transform), so it stays out of every prompt.

| Exercise | The meaning shown |
|---|---|
| Conjugation | the verb: **sognare:** to dream (all its glosses, as the glossary lists them) |
| Article, Make it plural / singular | the noun, singular: **zaino:** backpack, rucksack |
| Agreement | the adjective and the noun: **stanco:** tired · **scuola:** school |
| Preposition + article | the preposition and the noun: **di:** of, from, 's · **stazione:** station |
| Which verb?, Which person?, Which tense?, Change the tense (Verbs section) | the verb: **andare:** to go |
| Listen and type | **In English:** the sentence's first English (before 9.16 only after a mistake, as "It means") |
| Transform (and its New pattern card) | **In English:** the English of the first answer (`en`, from 9.16) |
| Choose / Write the reply | **Luca:** “the other person's line in English” (`lineEn`, from 9.16) |

Everything else either shows the English already (typed recall, the sentence types, spot the mistake, endings, the other Verbs drills, every flip card) or asks for it (meaning, flashcards); rule questions, sort, match, numbers and clock times have no single English to give. `tools/test-choices.js` builds every exercise of every item and checks that each one is in one of these groups, and that each meaning is the item's own English.

## The types

**R** = recognition (choosing or tapping), **P** = production (typing Italian). The *key* is the `typeKey` the Stats screen groups accuracy by.

| Shown as | Key | Built from | Kind | When | What the learner does |
|---|---|---|---|---|---|
| Flip card (New sentence, New verb, New pattern, New preposition) | `flip`, `intro` | vocab, sentence, verb, transform, prep | R | mostly new items | reads, reveals, grades themself |
| Meaning | `meaning` | vocab | R | box 0–1 | picks the meaning (IT → EN or EN → IT) from four: words it could be mixed up with (from 9.7, below) |
| Typed recall | `recall` | vocab | P | box 1+ | types the Italian for the English (nouns with their article) |
| Article drill | `article` | vocab (nouns with all four forms) | P | box 1+ | types *il / lo / un / gli…* for the noun |
| **Make it plural / Make it singular** (new) | `plural` | vocab (nouns with all four forms) | P | box 1+ | types the noun with its article in the other number: *il lago → i laghi* |
| Adjective agreement | `agreement` | vocab (adjectives with `forms`) | P | box 1+ | types the adjective agreeing with a noun from the content |
| Conjugation | `conjugation` | verb | P | box 1+ | types one form: *parlare · noi · presente* |
| Fill in the blank | `cloze` | sentence with `cloze` | R or P | R with `options` at box 0–1, else P | picks or types the missing word(s) |
| Word order | `bank` | sentence (3+ words) | R | mostly box 1–2 | taps the words in order (two extra words, one a near-miss where the data allows, from 9.7) |
| Translate | `translate` | sentence | P | mostly box 2+ | types the whole sentence from English |
| **Listen and type** (new) | `listen` | sentence (up to 9 words) | P | box 1+, about one time in five, only with an Italian voice and Read aloud on | hears the sentence (Play, or Slow), types it; Can't listen now swaps it at no cost |
| Grammar | `grammar` | grammar_mc | R | always | picks the answer to a rule question; each wrong option has a note |
| Transform | `transform` | transform | P | box 1+ | rewrites a sentence by an instruction (make it plural, formal, negative, correct the mistake…) |
| Preposition + article | `preparticle` | prep | P | box 1+ | types the merged form: *in + lo zoo → nello zoo* |
| Number | `number` | number | P | always | digits → words or words → digits |
| Clock | `clock` | clock | P | always | time in digits → words, or words → digits |
| Flashcard | `flashcard` | vocab in a flashcard unit | P | always | types the English (or Italian) for the card; the answer panel then shows the word in a grammar-unit sentence (from 9.7) |
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

Each new type is ordinary content, so any unit can use it. Units 1 and 2 use all five, and so do the possessives unit (u19, v8.8), which shows how well they suit a single grammar point: sort for article or no article, *mio / mia / miei / mie* and *tuo / Suo / vostro*; match for *my book* ↔ *il mio libro*; spot for *lo mio zaino*; endings for *i mie{i} fratelli*; reply for *Di chi è?* From v9.8 the irregular verbs and verb tenses units (u04, u05) use all five too, for verb forms rather than agreement: spot for *Loro fano*, *Ho andato*, *Domani venirò* (a few right, to test judgement: *Usciamo stasera*, *Ho vissuto a Roma per due anni*); endings for *riman{go}*, *cerc{heremo}*, *andre{mo}* beside *andre{mmo}*; reply for *Hai fame? Sì, ho molta fame* and *Che cosa hai fatto ieri sera?*; sort for *sapere* or *conoscere*, *vado* or *vengo*, *essere* or *avere*, *ho giocato* or *giocavo*; match for *venire → vengo*, *prendere → preso*, *sarò → sarei*. From v9.9 the adverbs and conjunctions units (u08, u11) use all five as well: spot for *lentomente*, *Sono molte stanche*, *Non fumo ancora*, *Resto a casa siccome piove*, *Anche se sia caro*; endings for *Ho molt{e} amiche e poch{i} soldi*, *prima {di} partire* beside *prima {che} tu parta*; reply for *Fumi ancora? No, non fumo più* and *Non mi piace. Neanche a me*; sort for *meglio* or *migliore*, where an adverb goes in the *passato prossimo*, *anzi* or *invece*, indicative or subjunctive; match for *lento → lentamente*, *non … più → no longer*, *sia … sia* halves. The adverbs unit, whose 111 words made typed recall 55% of what it gave, also gained transforms (*Parla in modo lento → Parla lentamente*; *Ho già mangiato → Non ho ancora mangiato*) and 29 sentences. From v9.10 the questions and prepositions units (u09, u10) use all five: spot for *Qual'è*, *Quanti persone*, *Puoi aiutarmi, signora?*, *Non so che viene*, *Vado in Roma*, *Stasera ceniamo a Paolo*, *Hai qualcosa di bere?* (and right ones such as *Cerco le chiavi* and *Ci vediamo lunedì*, where a learner expects a preposition); endings for *Quant{i} anni hai e quant{e} sorelle hai?*, *Vado {a} Roma e poi {in} Francia*, *qualcosa {da} bere o qualcosa {di} caldo*; reply for *Da quanto tempo studi l'italiano? Da un anno*, *Quando parti? Tra due giorni*, *Come vai al lavoro? A piedi*; sort for *quanto / quanta / quanti / quante*, *tu* or *Lei*, *a* or *in*, *da* or *per*, *al / allo / alla / all'*, *a* or *di* before an infinitive; match for question words, direct and indirect questions, merged forms and phrases to learn whole. From v9.11 the subjunctive and object pronouns units (u12, u13) use all five: spot for *So che sia vero*, *Forse Luca abbia ragione*, *Bisogna che lui vadi*, *Se avrei più soldi*, *Lo telefono stasera*, *Mi piace i libri gialli*, *Hai del pane? Sì, lo ho* (and right ones such as *Penso di avere ragione*, *Anche se piove, esco*, *Lo aiuto con i compiti* and *Mi lavo le mani*); endings for *So che {è} vero, ma non credo che {sia} giusto*, *Spero {di} venire, e spero {che} venga anche tu*, *Ho visto Anna e Sara e {le} ho salutat{e}*; reply for *Vieni con noi? Sì, purché non piova*, *Hai vinto la lotteria? Magari!*, *Ti piacciono i film italiani? Sì, mi piacciono molto*, *Hai le chiavi? No, non ce le ho*; sort for indicative or subjunctive after a verb or a conjunction, *che* or *di*, *venga* or *venisse*, *ho* or *avessi*, *lo* or *gli*, *ci* or *ne*, *piace* or *piacciono*, the participle's agreement; match for irregular subjunctives, the conjunctions, combined pronouns and verbs like *piacere*. From v9.12 the formal and informal and time units (u14, u15) use all five: spot for *Scusi, sai dov'è la stazione?*, *Ti ringrazio, dottore*, *Marco, non tocca il forno!*, *Daggli il libro*, *Sono l'una e mezza*, *Ho lavorato a Londra da tre anni*, *Ci vuole tre ore* (and right ones such as *Senta, scusi, dov'è la posta?*, *Buongiorno, dottor Bianchi* and *È l'una meno un quarto*); endings for *Marco, aspett{a}! Signora, aspett{i}!*, *Di{mmi} la verità*, *In treno ci {vogliono} due ore, ma in macchina ci {vuole} un'ora*; reply for *Le dispiace se apro la finestra? No, faccia pure*, *Possiamo darci del tu? Volentieri*, *Quanto ci vuole da qui a Firenze? Ci vogliono tre ore*, *Quando parti? Tra due settimane*; sort for *tu*, *Lei* or *voi*, a *tu* or a *Lei* command, *signor* or *signore*, *lunedì* or *il lunedì*, *è* or *sono*, *fa* or *tra*, *fino a* or *entro*, *giorno* or *giornata*; match for the *tu* and *Lei* pairs, irregular commands, days, months, dates and clock times. The time unit, whose 153 words made typed recall 48% of what it gave, also gained 20 sentences and 19 transforms. From v9.13 the adjectives and numbers units (u06, u07) use all five: spot for *Il problema è seria*, *Quei studenti*, *È un buono amico*, *Ha i capelli marroni*, *Mio fratello ha ventiotto anni*, *Ci sono duecenti persone*, *Vorrei mezza chilo* (and right ones such as *La mano è fredda*, *Ho due maglie rosa* and *Il ventuno luglio è il mio compleanno*); endings for *stanc{hi} … stanc{he}*, *Che {bel} ragazzo e che {begli} occhi*, *Ho {ventun} anni e mio fratello ne ha {trentuno}*; reply for *Chi è più alto, tu o tuo fratello? Mio fratello è più alto di me*, *Quanti siete? Siamo in quattro*, *Cosa Le do? Due etti di prosciutto*; sort for *-chi* or *-ci*, *bel / bell' / bei / begli*, *di* or *che*, *migliore* or *meglio*, *molto* or *molti*, whether a number drops its vowel, an ordinal or a plain number, *mille* or *-mila*; match for opposites, irregular comparatives, the numbers in words and figures, ordinals and fractions. The numbers unit, whose 76 number drills made reading out figures 48% of what it gave, now has them at 32%. From v9.14 the longer sentences and colloquial units (u16, u18) use all five: spot for *La ragazza con che esco*, *il cui madre*, *Chi vogliono venire*, *Sono mangiando*, *Si vende libri usati*, *Mi ne vado*, *Ce l'abbiamo fatto*, *C'ho mangiato troppo*, *due frighi* (and right ones such as *Il libro che ho comprato è bello*, *Parto domani per Roma*, *Il caffè lo prendo io* and *Ce l'ho fatta!*); endings for *Stav{amo} per uscire*, *Al mare {ci} si diverte*, *Ce l'ho fatt{a}! Me la sono cavat{a}!*; reply for *Quando parti? Parto domani*, *Si può fumare qui? No, qui non si può*, *In bocca al lupo! Crepi!*, *Ti va un caffè? Ora non mi va*; sort for *che* or *cui*, *chi* or *che*, *il cui / la cui / i cui / le cui*, *-ando* or *-endo*, gerund or infinitive, *-o* or *-i* after *si è*, *me ne / me la / ce la*, fine with anyone or friends only, *troppo* as too or really; match for gerunds, impersonal phrases, fillers, reactions, idioms, short forms and texting. From v9.15 the present tense and wild card units (u03, u17) use all five, so every grammar unit does: spot for *I miei amici lavorono*, *Tu cerci sempre le chiavi*, *Noi pagiamo il conto*, *Gioco il pianoforte*, *Manca due giorni*, *Spero a vincere*, *Aspetto Marco per mezz'ora* (and right ones such as *Tu scii molto bene*, *Pago io* and *Aspetto l'autobus*); endings for *Tu cerc{hi} le chiavi e noi pag{hiamo} il conto*, *Imparo {a} nuotare e spero {di} vincere*, *Manc{ano} due giorni e manc{a} il pane*; reply for *Chi paga il conto? Pago io*, *Suoni il pianoforte? No, gioco a calcio*, *Quante sedie mancano? Ne mancano due*; sort for *-chi* or *-ci*, *-ghi* or *-gi*, one *i* or two, *a*, *di* or nothing before an infinitive, *suonare* or *giocare a*, *manca* or *mancano*, a habit, a plan or how long; match for verbs English mixes up (*imparare / insegnare*, *suonare / giocare*), the persons of *parlare*, the *tu* and *noi* forms of spelling-change verbs and how often. The wild card's items each mix two or three units, as its review does: spot for *Anna è andato*, *Ho visto Maria e l'ho salutato*, *più alto che me*, *Sono nato in 1995*, *So che Marco sia a casa*, *Prima di uscendo*, *Il ragazzo di che ti parlavo*, *Scusi, signora, puoi ripetere?* (and right ones such as *Mia sorella è uscita con il suo ragazzo*, *Quando arriverai, chiamami!* and *Non c'è nessuno che parli tedesco*); endings for *Le ragazze tedesc{he} sono arrivat{e} stanc{he}*, *Penso che {sia} vero, ma so che {è} difficile*, *Se piov{esse}, rest{erei} a casa*; reply for *Cosa facevi quando ti ho chiamato? Cucinavo*, *Secondo te, Luca ha ragione? Non credo che abbia ragione*, *Vieni anche tu? Sì, se ho tempo*; sort for *sono andato* or *andavo*, *è* or *sia*, *lo / gli / ci / ne*, *fa / tra / da / per*, the same subject or a new one, *a / in / da*, *tu* or *Lei*; match for the *tu* and *Lei* pairs, the small words (*già*, *non … ancora*, *non … più*), *tempo / ora / volta*, the tenses and comparisons. Ideas for the other units:

| Type | Fits |
|---|---|
| match | u16 (sentence halves joined by *che / cui*, beyond the pairs it has now) |

## Measured mix (9.15)

What `node tools/variety.js --markdown` printed for version 9.15: the app's own `makeExercise`, with a seeded random generator, on every item at boxes 1, 2, 3 and 4, 8 times each, with listening on, so every item and box counts the same. **Kinds** is how many different exercises (by key) a unit gives; a unit is flagged with fewer than 10 kinds or one kind above 35%. Run it again after changing a unit's items (or `makeExercise`) and replace this section with what it prints.

| Unit | Items | Kinds | Most common | Second | Flag |
|---|---:|---:|---|---|---|
| u01 Essere, subject pronouns & basics | 304 | 18 | `recall` 26% | `grammar` 12% |  |
| u02 Nouns, gender & articles | 325 | 16 | `recall` 17% | `article` 15% |  |
| u03 Present tense: regular -are verbs | 366 | 18 | `conjugation` 30% | `grammar` 12% |  |
| u04 Irregular verbs: present tense | 335 | 12 | `grammar` 17% | `conjugation` 17% |  |
| u05 Verb tenses: present, past, future and conditional | 390 | 12 | `conjugation` 26% | `grammar` 15% |  |
| u06 Adjectives | 339 | 16 | `recall` 23% | `agreement` 20% |  |
| u19 Possessives | 246 | 14 | `transform` 16% | `spot` 12% |  |
| u07 Numbers | 236 | 17 | `number` 32% | `recall` 11% |  |
| u08 Adverbs | 320 | 14 | `recall` 33% | `cloze` 11% |  |
| u09 Questions | 257 | 14 | `recall` 28% | `cloze` 14% |  |
| u10 Prepositions | 270 | 16 | `recall` 31% | `cloze` 11% |  |
| u11 Conjunctions | 202 | 13 | `recall` 30% | `grammar` 11% |  |
| u12 The subjunctive (congiuntivo) | 272 | 15 | `recall` 16% | `cloze` 12% |  |
| u13 Object pronouns, reflexives, ne & ci | 228 | 15 | `transform` 23% | `recall` 14% |  |
| u14 Formal & informal: register and the imperative | 354 | 17 | `transform` 21% | `recall` 20% |  |
| u15 Time: days, months, dates, clock, duration | 388 | 19 | `recall` 33% | `transform` 9% |  |
| u16 Building longer sentences: relative pronouns, gerund, impersonal si | 167 | 15 | `transform` 15% | `recall` 14% |  |
| u18 Colloquial Italian & slang | 284 | 18 | `recall` 24% | `cloze` 11% |  |
| u17 Wild card | 163 | 21 | `spot` 15% | `transform` 13% |  |

Over all 19 units (5446 items):

| Kind | Share | Units using it |
|---|---:|---:|
| `recall` | 18% | 17 |
| `grammar` | 10% | 19 |
| `cloze` | 10% | 19 |
| `spot` | 8% | 19 |
| `transform` | 7% | 14 |
| `conjugation` | 7% | 12 |
| `translate` | 5% | 19 |
| `endings` | 5% | 19 |
| `listen` | 5% | 19 |
| `bank` | 4% | 19 |
| `reply` | 4% | 19 |
| `match` | 3% | 19 |
| `sort` | 3% | 19 |
| `agreement` | 2% | 6 |
| `article` | 2% | 10 |
| `number` | 1% | 2 |
| `plural` | 1% | 10 |
| `meaning` | 1% | 17 |
| `clock` | 1% | 2 |
| `flip` | <1% | 17 |
| `preparticle` | <1% | 2 |
| `intro` | <1% | 1 |

No unit is flagged.

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
4. `makeExercise`: the exercise itself (where an item can be given more than one exercise at a box, list them in a `pickKey` table with their chances and kinds, so a session's hint can choose between them): `type` (the name shown), `typeKey`, `kind`, `mode`, `promptHtml`, `accepted` / `correct`, `shownAnswer`; `showWhy: introduce` so a new item explains itself; `say` only for Italian the prompt shows; `sayAnswer`, `missedText` and `answerLine` / `okLine` when the defaults don't fit; and `meaning` (`glossLine` for words, `sentenceGloss` for a sentence) when the prompt shows Italian without its English and the English isn't the answer.
5. `renderSession`: the markup for a new `mode`, with a Don't know button (`data-act="giveup"`) so the tests and the learner can always move on; `action()`, the `keydown` handler and `wire()` for its taps and keys; `resetExState()` for any state it keeps in `S`.
6. `explainFor`: the reasons in the answer panel, every wrong choice named.
7. The glossary (`PRACTICE_TYPES`, `rowHtml`), Look up and the glossary filter (`itemFields`), the summary line, `itemLabel`, the Stats names (`typeName`) and `knownWords` (what the typo rule treats as real words; leave out text that is wrong on purpose).
8. CSS beside the other session styles: 44 px targets, the ok / bad tokens, never colour alone (a ✓ or ✕ goes with each colour).

Then the tools: a section for it in `tools/check-content.js` (explanations, a note for every wrong option, anything else that can be wrong in the data), a block in `newTypes` in `tools/test-ui.js` (answered right and wrong by tapping, in light and dark at 360 px and at 120% text) plus its fields in the read-aloud `dataWords`, a branch in `runSession` in `tools/test-progress.js` so practice sessions answer it as a learner would, and one in `tools/test-items.js` if it has a new `mode`, so every item of the type is answered right through the screen. Finally the item format in the content guide, the look in the design system, and a row in the table above.
