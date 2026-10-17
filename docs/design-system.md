# Ripasso Italiano: design system and restyle brief

**For:** the Claude Code session that restyles `index.html`.
**Status:** decided by Grant, October 2026. Everything here has been reviewed on mockups; build it as written. Where this brief leaves something open, choose what fits the system and say so in your summary.

This brief turns the app from "Italian practice" (serif and blue, one long column of buttons) into **ripasso**: bright, card-based, Italian green with a red accent, in light and dark themes designed as a pair. The look changes; what the app does stays exactly the same.

Everything the brief refers to is in `docs/design/`:

| Folder | What it holds |
|---|---|
| `docs/design/mockups/` | Static mockups of each screen, light and dark (open them in a browser; they use the bundled fonts and work offline). |
| `docs/design/logo/` | The logo as SVG (icon, Android maskable icon, one-colour versions, wordmark lockups) and PNG renders in `png/`. |
| `docs/design/fonts/` | The two typefaces, already cut down to the characters Italian needs (75 KB together), with their open-font licences. |

---

## 1. Ground rules (read before anything else)

`CLAUDE.md` still governs this work in full. In particular:

1. **Restyle only.** Do not change content, exercise logic, scoring, spaced repetition or any storage format. Saved progress, both the browser copy and the synced copy, must come through untouched. `node tools/test-progress.js` must pass and `node tools/check-content.js` must report no problems.
2. **Keep every interaction hook.** The app's wiring (`wire()`) and the progress test click on the existing attributes: `data-go`, `data-start`, `data-act`, `data-opt`, `data-set`, `data-ref`, `data-reftab`, `data-lsec`, `data-unit`, `data-setunit`, `data-unflag`, `data-removepack` and the rest. Keep them on the new elements with the same values. New screens and controls get new hooks of the same kind.
3. **One self-contained file, no outside loads.** Do not link Google Fonts. Embed the fonts from `docs/design/fonts/` as base64 `@font-face` rules (section 4). Icons are inline SVG. The favicon and touch icon are data URIs.
4. **Nothing becomes unreachable.** Every screen and setting that exists today must still be reachable after the restyle; section 8 says where each one moves.
5. **British English** in all interface text, as now. Note: *practise* is the verb (a button: "Practise"), *practice* the noun (a tab or heading: "Practice").
6. **Version:** this is the biggest visible change since launch, so bump `APP_VERSION` to the next whole number (currently 7.6, so **8.0**) unless Grant says otherwise.

---

## 2. Name

- **Official name: "Ripasso Italiano".** Use it where a formal name is needed: the About row, credits, the repo README, any listing.
- **Short form, used in the app:** the wordmark is lowercase **"ripasso"** (logo only). In ordinary text and labels the name is **"Ripasso"**: the page `<title>`, `apple-mobile-web-app-title`, and any sentence that names the app.
- *Ripasso* means going back over your material (it is also a Valpolicella wine style).
- Replace "Italian practice" in the `<title>` and the old Home heading. Leave content and progress keys alone: the `itapp.*` keys keep their names.

---

## 3. Logo and icons

**The mark, "Due passi":** two slanted strokes on a rounded green tile, the first white and the second red. It reads as accent marks, or as "a second pass" over your material. No mascot.

| | Value |
|---|---|
| Tile | `#0F6B4B`, 100 × 100 with corner radius 23 |
| First stroke | `#FFFFFF`, from (31, 32) to (45, 68) |
| Second stroke | `#EF4B55`, from (55, 32) to (69, 68) |
| Strokes | 13 wide, round ends |
| One-colour version | solid ink tile with the strokes cut out |

The official Italian flag colours were tried and rejected: flag red on flag green is only 1.3:1 in brightness and the two merge for red–green colour-blind people. Do not "correct" the colours to the flag.

**Files** (all in `docs/design/logo/`):

| File | Use |
|---|---|
| `ripasso-icon.svg` | The icon. Source for the favicon and the Home header mark. |
| `ripasso-icon-maskable.svg` | Android adaptive icon: full-bleed square, mark inside the safe zone. |
| `ripasso-icon-mono-dark.svg`, `ripasso-icon-mono-white.svg` | One-colour icon for light and dark backgrounds. |
| `ripasso-wordmark-on-light.svg`, `-on-dark.svg` | Icon + "ripasso" (lettering already outlined). |
| `ripasso-italiano-lockup-on-light.svg`, `-on-dark.svg` | Icon + "ripasso" + spaced "ITALIANO": the official lockup. |
| `png/ripasso-icon-{16,32,48,192,512,1024}.png`, `png/ripasso-icon-maskable-{192,512}.png`, `png/apple-touch-icon-180.png` | Bitmap icons for anywhere SVG isn't accepted (e.g. a future offline copy's manifest). |

**In `index.html`:**
- `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,…">` built from `ripasso-icon.svg` (URL-encode it; it is under 1 KB).
- `<link rel="apple-touch-icon" href="data:image/png;base64,…">` from `png/apple-touch-icon-180.png` (2.3 KB).
- `<meta name="theme-color">` twice, with `media="(prefers-color-scheme: light)"` `#F3F6F4` and `media="(prefers-color-scheme: dark)"` `#0E1512`.
- `<title>Ripasso</title>` and `<meta name="apple-mobile-web-app-title" content="Ripasso">`.
- The Home header shows the icon (32 px) and the word "ripasso" set in live text: Bricolage Grotesque Bold 24 px, letter-spacing −0.5 px. Use inline SVG for the icon; don't embed the wordmark SVG.

---

## 4. Typography

Two typefaces, both under the SIL Open Font Licence (licences are in `docs/design/fonts/`; mention them in the About screen's credits):

| Role | Face | File (embed as base64 woff2) |
|---|---|---|
| Display: screen titles, unit names, exercise prompts, big numbers, the wordmark | **Bricolage Grotesque**, weights 500–700 | `bricolage-grotesque-500-700.woff2` (33 KB) |
| Everything else | **DM Sans**, weights 400–700 | `dm-sans-400-700.woff2` (22 KB) |
| Italian words inside running text | **DM Sans Italic**, 400–500 | `dm-sans-italic-400-500.woff2` (21 KB) |

The files are variable fonts already cut to Latin plus Latin-1, curly quotes, dashes, arrows, € and the non-breaking hyphen the app uses for endings like ‑iamo. One `@font-face` per file:

```css
@font-face { font-family: "Bricolage Grotesque"; src: url(data:font/woff2;base64,…) format("woff2"); font-weight: 500 700; font-style: normal; font-display: swap; }
@font-face { font-family: "DM Sans"; src: url(data:font/woff2;base64,…) format("woff2"); font-weight: 400 700; font-style: normal; font-display: swap; }
@font-face { font-family: "DM Sans"; src: url(data:font/woff2;base64,…) format("woff2"); font-weight: 400 500; font-style: italic; font-display: swap; }
```

`base64 -w0 docs/design/fonts/<file>` produces the data. Fallback stacks: `--display: "Bricolage Grotesque", system-ui, sans-serif;` and `--sans: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;`.

**The serif goes.** Today Italian text is set in a serif (`var(--serif)`). In the new system:
- Exercise prompts (`.prompt`) use Bricolage Grotesque 500, 30 px, line-height 1.25.
- Italian words in lists and tables (`.it`, `.lit`, `.flipback`, `.conjtable`, the word bank) use DM Sans 500, so they still stand apart from the English beside them.
- Italian words in running lesson text (`.itw`) use DM Sans italic.

| Style | Font | Size / line-height | Used for |
|---|---|---|---|
| Title | Bricolage 700 | 28 / 1.15 | Screen titles (Units, You) |
| Title S | Bricolage 700 | 24 / 1.15 | Unit screen title, lesson section headings |
| Hero | Bricolage 700 | 26 / 1.1 | Unit name on the Continue card |
| Prompt | Bricolage 500 | 30 / 1.25 | Exercise prompt |
| Big number | Bricolage 700 | 24 / 1.1 | Stats figures |
| Body | DM Sans 400 | 16 / 1.6 | Lesson text, explanations |
| Label | DM Sans 600 | 16 / 1.3 | Card and row titles |
| Small | DM Sans 400 | 13–14 / 1.4 | Secondary lines, values |
| Eyebrow | DM Sans 600 | 13 / 1.3 | Section labels, chips |
| Tab label | DM Sans 400 (600 when active) | 12 | Tab bar |

Input fields stay at 16 px or larger (iPhones zoom in below that). The typed-answer field is 22 px.

---

## 5. Colour

All colours are CSS custom properties on `:root`, redefined for dark. Keep the existing switching mechanism, and add the setting described in 8.8:

```css
:root { /* light */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark */ } }
:root[data-theme="dark"] { /* dark */ }
```

Keeping the old token names where they still fit saves churn; new tokens are marked *new*.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F3F6F4` | `#0E1512` | Page background |
| `--card` *new* | `#FFFFFF` | `#17211D` | Cards, rows, tiles, inputs |
| `--field` | `#FFFFFF` | `#17211D` | Inputs (same as card) |
| `--fg` | `#10201A` | `#E9F0EC` | Text |
| `--muted` | `#55655D` | `#9DB0A7` | Secondary text, inactive tabs |
| `--line` | `#E1E8E4` | `#2A3A33` | Dividers inside cards, table rules |
| `--track` *new* | `#D9E3DE` | `#24302B` | Empty part of progress bars and rings |
| `--tint` *new* | `#E1EFE8` | `#22312B` | Unit badges, chips, secondary buttons, icon wells |
| `--seg` *new* | `#E4EBE7` | `#17211D` (on bg) / `#0E1512` (inside a card) | Segmented-control track |
| `--seg-on` *new* | `#FFFFFF` | `#2A3A33` | Selected segment (green text on it in light, `--fg` in dark) |
| `--accent` | `#0F6B4B` | `#5FD3A2` | Brand green: icons, active tab, links, rings, selected chip |
| `--accent-fg` | `#FFFFFF` | `#0E1512` | Text on `--accent` |
| `--hero` *new* | `#0F6B4B` | `#127A55` | Continue card and primary buttons (white text on both) |
| `--hero-btn-fg` *new* | `#0F6B4B` | `#0E5A40` | Text on the white "Continue" pill inside the hero card |
| `--nav-bg` *new* | `#FFFFFF` | `#131C18` | Tab bar (top border `--line` in light, `#24302B` in dark) |
| `--bad` | `#C62B36` | `#F0616B` | Red accent: streak flame, Mistakes icon, wrong-answer border, wrong button |
| `--bad-fg` *new* | `#FFFFFF` | `#1F0B0D` | Text on a `--bad` button |
| `--bad-bg` | `#FDECEE` | `#2E1418` | Wrong-answer panel |
| `--bad-title` *new* | `#9E1F2A` | `#FF9AA2` | "Not quite" heading |
| `--ok` | `#0F6B4B` | `#5FD3A2` | Right-answer icon and border |
| `--ok-bg` | `#E3F1EA` | `#12291F` | Right-answer panel |
| `--ok-title` *new* | `#0A5A3E` | `#7FE0B4` | "Correct" heading |
| `--panel-text` *new* | `#3B4A43` | `#C9D6CF` (on ok) / `#D9C9CB` (on bad) | Explanation text inside feedback panels |
| `--note-bg` | `#E1EFE8` | `#183229` | Lesson tip boxes (`.ltip`), notes |
| `--note-title` *new* | `#0A4F37` | `#5FD3A2` | Tip-box heading |

Every text pairing above was checked: all are at least 4.5:1, most well over 6:1. Keep it that way for anything you add.

**Red is for mistakes and the streak only.** Don't use it for decoration or to mean "important". Tips and notes are green.

---

## 6. Shape, space and motion

- **Radii:** hero card 22 px, cards and tiles 18 px, list-row cards 18 px, inputs 14 px, buttons 14–16 px, inner cells and badges 12 px, chips and pills fully round (999 px). The feedback panel's top corners are 26 px.
- **Spacing:** screen side padding 20 px; 16 px between blocks on a screen, 12 px between tiles, 10 px between list cards, 14–16 px padding inside cards.
- **Width:** content column `max-width: 560px`, centred, as now; the tab bar spans the window, with its items centred within the same 560 px.
- **No shadows and no gradients.** Cards sit on the background by colour alone. Borders only on inputs, the current-unit card (2 px `--accent`) and answer states.
- **Tap targets:** at least 44 × 44 px everywhere, including the accent keys, chips and the Quit button.
- **Motion:** only purposeful and small: the feedback panel slides up (about 180 ms), pressed buttons dim slightly. Wrap all of it in `@media (prefers-reduced-motion: no-preference)`. No mascots, confetti, sounds or decorative animation (the spec's "no decoration" principle still holds).
- **Icons:** inline stroke SVG, 24-unit viewBox, stroke 1.8, round caps and joins, `currentColor`. Copy the exact paths from the mockups (Today, Units, Rules, Look up, You, Review, Verbs, Flashcards, Mistakes, the flame, settings rows). No emoji. Icon-only buttons get an `aria-label`.

---

## 7. Components

Each one appears in the mockups; match them.

**Tab bar.** Fixed to the bottom, five items: **Today · Units · Rules · Look up · You**, each an icon (22 px) over a 12 px label. The active item is `--accent` and semibold, with `aria-current="page"`; the others are `--muted`. Padding respects `env(safe-area-inset-bottom)`. Give the page enough bottom padding that nothing hides behind it. Hidden during a practice session and on the session summary.

**Screen header.** Title (Title style) on the left. Sub-screens get a back arrow (44 × 44, `aria-label="Back to …"`) before the title, plus a small eyebrow line above it where the mockups show one ("Unit 5").

**Cards.** `--card` background, 18 px radius, no border. A tappable card is a real `<button>` or `<a>`, with `all: unset`-style resets in CSS and a visible `:focus-visible` outline (2 px `--accent`).

**Continue (hero) card.** `--hero` background, white text, 22 px radius, 22 px padding. From top to bottom:
- a chip ("Unit 5", white at 16% opacity) with "64% learned" on the right;
- the unit name (Hero style);
- a 6 px progress bar, white on white at 22%;
- "5 new · 7 to review" on the left, a white pill button "Continue" on the right (`--hero-btn-fg` text).

**Tiles.** A 2 × 2 grid. Each tile has an icon (22 px, `--accent`; Mistakes uses `--bad`), a label and a muted count line. A tile with nothing to do is shown at 55% opacity and is `disabled`, as now.

**List-row card** (Units). A 42 px badge (12 px radius) holding the unit number, then the title, a muted one-line description and a 4 px progress bar, with the percentage or status on the right. Badge states:
- learned: `--accent` fill, white number (dark theme: `--accent` fill, `--bg` number), with a ✓ "Learned" label;
- in progress: `--tint` fill, `--accent` number;
- not started: `--seg` fill, `--muted` number, with "Not started".

The current unit's card has a 2 px `--accent` border and two buttons: **Practise** (`--hero`) and **Read lesson** (`--tint` with `--accent` text, book icon).

**Segmented control.** A `--seg` track with 4 px padding and 14 px radius; segments 44 px tall with 11 px radius. The selected segment is `--seg-on` with `--accent` text in light and `--fg` in dark. Where it switches views, use `role="tablist"` and `aria-selected`, as the existing Lesson/Glossary tabs do; for filters, `aria-pressed`.

**Chips.** Pills 40–44 px tall, 14 px horizontal padding. Unselected: `--card` with `--fg` text. Selected: `--accent` fill with `--accent-fg` text.

**Progress.** Bars are 4 px (lists), 6 px (cards, overall) or 10 px (session), with a `--track` background, `--accent` fill and round ends. The daily-goal ring is 52 px with a 5 px stroke and the value inside ("18/30").

**Buttons.**
- **Primary:** `--hero` fill, white text, 700 weight, 46–52 px tall, 14–16 px radius.
- **Secondary:** `--tint` fill, `--accent` text.
- **Quiet:** transparent, `--muted` text (Flag this item, Cancel).
- **Danger:** Reset all progress. Quiet style with `--bad` text, and keep the existing confirmation.

**Inputs.** `--field` background, 2 px border in `--line`, 14 px radius, 14–16 px padding. The border turns `--accent` on focus, `--bad` for a wrong answer and `--ok` for a right one. Selects get the same treatment.

**Accent keys** (à è é ì ò ù). A row of six equal tiles, 44 px tall, `--card`, 12 px radius, 18 px text.

**Answer options.** Full-width cards, 52 px or taller. Picked: 2 px `--accent` border. After checking, the right option gets `--ok` border and `--ok-bg` fill with a ✓; a wrong pick gets `--bad` border and `--bad-bg` fill with a ✕. Don't rely on colour alone (see 10).

**Feedback panel.** A sheet attached to the bottom of the session screen (26 px top radius, 22 px padding) that slides up after Check:
- *Wrong:* `--bad-bg` background, a 32 px `--bad` circle with a white ✕, the heading "Not quite" in Bricolage 700 22 px `--bad-title`, then the answer line ("Answer: **parliamo**"), the explanation (`--panel-text`), any table and facts, the actions (Accept my answer, Flag this item), and a full-width **Continue** button (`--bad` fill, `--bad-fg` text).
- *Right:* the same layout in `--ok-bg`, with a `--ok` circle and ✓, the heading "Correct" in `--ok-title`, and a Continue button in `--hero`.
- Keep the current wording (the head text comes from `renderSession`). Split it into heading plus answer line where the code allows: "Not quite. Answer: X" becomes heading "Not quite" with "Answer: X" beneath.
- Long explanations make the panel scroll, never the page behind it.

**Settings rows** (You screen). These sit in a card with dividers. Each row: a 36 px `--tint` icon well with a 20 px `--accent` icon, the label (16 px 500), the value (`--muted`, right-aligned), then a chevron. 56 px minimum height.

**Lesson tip box** (`.ltip`). `--note-bg` background, 14 px radius, an info icon, the heading in `--note-title` and the text in `--fg`. No left-border stripe.

**Tables** (lessons, glossary, conjugations). No outer border; 1 px `--line` rules between rows; header row in `--muted` 13 px 600 (or `--accent` for column heads naming a verb, as in the lesson mockup); 8 px cell padding. Wide tables keep their `overflow-x: auto` wrapper.

---

## 8. Screens

The current screens are `S.screen` values drawn by the `render*` functions. Here is where each one goes.

### 8.1 Navigation model

| Tab | Screens | Notes |
|---|---|---|
| **Today** | `home` | |
| **Units** | `units`, `reference` (a unit's Lesson / Glossary) | The unit screen shows Units as the active tab. |
| **Rules** | `rules` | |
| **Look up** | `lookup` | |
| **You** | **new** `you`, then `stats`, `settings`, `data` as sub-screens with a back arrow to You | Replaces the old Stats / Settings / Data buttons on Home. |

`session` and `summary` show no tab bar. Back buttons that today say "Home" become a back arrow to the screen's parent (Units for a unit screen, You for Stats, Settings and Data). Keep the existing scroll-position memory in `render()`.

### 8.2 Today (`renderHome`), see `mockups/home-*.html`

- **Header row:** logo icon (32 px) and "ripasso" on the left. On the right, the streak pill (`--card`, flame icon in `--bad`, `streak()`) and the daily-goal ring (`today().xp` of `progress.settings.goal`).
  - No "Ciao" greeting and no "Today" title: Grant chose to leave them off.
  - The moon button is gone; the theme setting lives in You (8.8).
  - The current "Streak · Today · New today · New cards" line is dropped from Home. Those figures belong to Stats.
- **Sync:** the sync label moves to You › Your data. Keep a small notice line under the header only when sync is in error ("Sync error, saved locally"), so a problem is never silent.
- **Flash message** (`S.flash`): shown as a card just below the header.
- **Continue card:**
  - The chip shows the unit's number. Grammar units are numbered by their position among the grammar units, the same numbers the new Units screen shows on its badges.
  - Then the title, `unitStats().pct` learned, new and due counts for the unit, and the **Continue** pill (`data-start="continue"`).
  - When the unit is finished, keep today's wording: "nothing due, extra practice".
- **Tiles, 2 × 2:**
  - **Review:** `data-start="review"`, count = due.
  - **Verbs:** `data-start="verbs"`, "N due · N new".
  - **Flashcards:** `data-start="flashcards"`, "N due · N new".
  - **Mistakes:** `data-start="mistakes"`, "N to fix", red icon.
  - Keep each tile's current disabled conditions. The longer explanatory lines move to Stats or simply go; the tile shows the short count.
- **Wild card:** a full-width card, `data-start="wild"`, subtitle "A random mix from every grammar unit". Right chevron.
- **"Lo sapevi?" tip card:** see section 9.

### 8.3 Units (`renderUnits`), see `mockups/units-*.html`

- **Header:** "Units" with "N% of the course learned" and a 6 px overall bar (learned ÷ total over all built-in items).
- **Segmented filter: Grammar · Vocab · Verbs**, with counts.
  - Grammar is every unit that isn't flashcards or verbs mode; Vocab is `mode === "flashcards"`; Verbs is `mode === "verbs"`.
  - Remember the choice for the visit. The default is the segment holding the current unit.
- **One list-row card per unit:**
  - **Showing:** the badge number, title, a one-line description (clamp to one line; the full text is on the unit screen) and the progress bar.
  - **Imported packs:** keep a small "pack …" note.
  - **Tapping a card** opens the unit screen (`data-ref`).
  - **The current unit's card** is expanded with **Practise** (`data-unit`) and **Read lesson** (`data-ref`).
  - **"Make this my Continue unit"** (`data-setunit`) moves to the unit screen.

### 8.4 Unit screen (`renderReference`, `renderVerbReference`), see `mockups/lesson-*.html`

- **Header:**
  - a back arrow to Units, the eyebrow "Unit N" and the unit title;
  - a "64% learned" chip on the right;
  - under it, "Make this my Continue unit" as a quiet button, or "This is your Continue unit" as muted text.
- **Lesson · Glossary:**
  - keep the existing tabs (`data-reftab`, `role="tablist"`) restyled as the segmented control;
  - keep them sticky at the top while scrolling, as now.
- **Section chips:**
  - a horizontally scrolling row of chips, one per lesson section, jumping with the existing `data-lsec`;
  - the chip for the section in view is selected (an IntersectionObserver is fine; no storage);
  - this row replaces the "Contents ↑" jump; keep the contents list at the top of the lesson.
- **Lesson body:**
  - one reading card in Body style;
  - section headings in Title S with the section number in `--muted`;
  - `.lead` slightly larger;
  - tables per section 7;
  - `.ltip` as the green tip box;
  - `.lex` and `.dlg` entries with the Italian in DM Sans 500 and the English muted;
  - `.lfix` "wrong → right" pairs must carry a ✕ and ✓ (or "Not:" and "Say:" labels) as well as red and green;
  - `.xref` links in `--accent`.
- **Glossary tab:** the filter field as an input (section 7), then the existing groups (Verbs, Nouns, …) each in a card. The box tags (`box 3`, `box 5 ✓`) become small `--tint` pills.
- **Practise this unit:** a primary button at the end of both tabs (`data-unit`).
- **Verbs reference:** the same frame.

### 8.5 Practice session (`renderSession`), see `mockups/exercise-wrong-*.html`

- **Top row:** a Quit button (✕ icon, 44 px, `aria-label="Quit"`, `data-go="quit"`), the 10 px progress bar, then "7/12" (add "· repeat" when repeating).
- **Prompt:**
  - the exercise type as a `--tint` chip ("Fill in the blank");
  - the prompt in a card (Prompt style), with the blank as a 3 px underline;
  - hints muted beneath.
- **Answer area:** the typed field labelled "Your answer", the accent keys, the options, the word bank and the verb tables. All the existing modes keep their markup hooks and simply take the new styles.
  - *Word bank:* chips as answer tiles.
  - *Verb tables:* each row is a person label and an input, coloured per the answer states.
- **Buttons:** Check (primary) and Don't know (secondary), side by side at the bottom of the content.
- **Feedback:** the bottom panel (section 7). Its Continue button carries `data-act="continue"`.

### 8.6 Session summary (`renderSummary`)

- A title, "Session complete".
- A card with three big numbers: accuracy, XP earned, items promoted. Below them, today's XP against the goal as a bar.
- The missed items as a card list (Italian in DM Sans 500, English muted).
- A primary "Back to Today" button (`data-go="home"`).

### 8.7 Rules (`renderRules`) and Look up (`renderLookup`)

The same content, in the new frame:
- **Rules:** each unit's rule sheet in a card with a Title S heading.
- **Look up:** a large search field at the top (sticky), with each hit as a card row (Italian, English, unit name muted).

### 8.8 You (**new screen**), see `mockups/you-*.html`

A new `S.screen = "you"` with its own render function and a `data-go="you"` tab. Top to bottom:

1. **Title "You".**
2. **Stats card** (button → `stats`): "Stats" with "See all ›", then three big numbers: day streak (`streak()`), items learned (box 5 or higher, as Stats counts them), and accuracy over the last 30 days.
3. **Settings** (section label, then a card of rows):
   - **Appearance:** an inline segmented control, **Light · Dark · Auto**.
     - This is the only new setting. Store it per device in a new localStorage key, `itapp.theme.v1`, holding `"light"`, `"dark"` or `"auto"`, defaulting to Auto.
     - Read it at start-up before the first paint; wrap every read and write in `try/catch`.
     - It sets or removes `data-theme` on `<html>`. Auto removes the attribute, so the phone's setting applies.
     - It is deliberately not part of `progress`, so it neither syncs nor touches the progress formats, and different devices can have different themes.
   - **Lesson length:** current value, e.g. "12 exercises".
   - **New items per day:** current value, e.g. "No limit".
   - **Vocab direction:** current value, e.g. "Italian → English".
   - **More settings:** opens the full `settings` screen.
   - *Each row opens* the full Settings screen, which keeps every existing option, restyled as grouped rows with their hints beneath.
4. **Your data** (card of rows):
   - **Sync:** a status dot plus words; the dot is never the only signal. It opens `data`.
   - **Flagged items:** the count; opens `data`, scrolled to that section.
   - **Back up progress:** opens `data`, at the backup section.
   - **Content packs:** "Advanced"; opens `data`, with the packs section open.
   - *The Data screen* keeps its current contents and order, restyled. "Reset all progress" stays at the bottom, in danger style.
5. **About** (card): the logo, **"Ripasso Italiano"**, and "Version {APP_VERSION} · About and credits". Expanding it (a `details` element is fine) shows a line on the app and the font credits (Bricolage Grotesque and DM Sans, SIL Open Font Licence).

The Stats screen keeps all its current tables and the "Practise the most-missed items" button, restyled into cards with big numbers at the top.

---

## 9. "Lo sapevi?" tip card (new, on Today)

A small card at the bottom of Today showing one short Italian tidbit, picked from content already in the app. It's Grant's idea: a bit of passive learning every time the app opens.

**Look:** a `--card` card with a lightbulb icon and **"Lo sapevi?"** in `--accent` 13 px 600, followed by "Did you know?" in `--muted`. Then one tidbit, 15 px, line-height 1.45, with the Italian word or phrase in bold. Not tappable.

**What it shows:**
- One random entry from the built-in content, any unit and any level.
- Good sources are vocab items (`type: "vocab"`: Italian, English meanings, and the `note` when it's short), sentences (`type: "sentence"`) and the idioms and expressions in the vocab packs (`pos` `expr`/idiom).
- Format examples:
  - **anello** means *ring*.
  - **Uffa!** is what you say when you're fed up or impatient.
  - **d'altronde** means *on the other hand*, *besides*.
  - **Ho fame.** I'm hungry.
- Use the item's own wording only; never invent facts.
- Skip anything that wouldn't fit in three lines at 390 px wide (roughly 140 characters in all).
- Skip notes that talk about the app rather than Italian (for example ones mentioning typing, "Accept my answer" or "card").
- Escape everything with `esc()`.

**Behaviour:**
- Pick once per app load and keep the pick in memory, so re-renders and returning to Today don't change it. A fresh pick comes on the next open.
- Nothing is stored and progress is untouched.
- Show the card only if it fits: after rendering Today, if the page would scroll because of the card (the content is taller than the viewport above the tab bar), hide it. Check again on resize. On small phones it simply doesn't appear, and it never pushes the tiles off the screen.

---

## 10. Accessibility rules

- **Never colour alone.** Right and wrong always pair the colour with an icon (✓ or ✕) and words ("Correct", "Not quite"), plus a clear difference in brightness. The same goes for the learned/not started badges, the sync dot and lesson "wrong → right" pairs.
- **Contrast:** text at least 4.5:1 against what it sits on. All tokens in section 5 pass; recheck anything new.
- **Real elements:** `<button>` and `<a>` for anything tappable, a `<label>` for every input, `aria-label` on icon-only buttons, and `aria-current` on the active tab.
- **Keyboard:** everything reachable and visible on focus (a 2 px `--accent` outline). Keep the existing Enter-to-check behaviour.
- **Text size:** respect the browser's text-size settings (no fixed heights on text containers); test at 120% zoom.
- **Reduced motion:** honour `prefers-reduced-motion`.

---

## 11. Suggested order of work

1. Tokens, fonts, icons, `<head>` changes (title, favicon, theme-color) and the theme setting.
2. The tab bar, the navigation model and the new You screen. Point the old Home buttons' destinations here.
3. Today: header, Continue card, tiles, Wild card, tip card.
4. Units and the unit screen (lessons and glossary).
5. Session and feedback panel, then the summary.
6. Rules, Look up, Stats, Settings, Data.
7. A full pass in both themes at 390 × 844 and 360 × 740, compared side by side with the mockups. Then run `node tools/check-content.js` and `node tools/test-progress.js`.

---

## 12. Out of scope

- Any change to content, scoring, scheduling, sync, backup formats or storage keys, apart from the one new device-only key `itapp.theme.v1`.
- New features beyond the You screen, the theme setting and the tip card.
- Publishing or deploying (Grant republishes from a chat, as always).
- A manifest or service worker. (Added afterwards, in version 8.1: see `CLAUDE.md`. The installed copy uses the PNG icons via `icons/`.)

---

## 13. Done when

- [ ] Every screen matches its mockup in light and dark, at 390 px and 360 px wide, with nothing hidden behind the tab bar.
- [ ] Every existing feature and setting is still reachable (8.1 to 8.8).
- [ ] Appearance Light / Dark / Auto works, survives a reload, and doesn't touch progress.
- [ ] The tip card changes between app opens, never between renders, and hides when there's no room.
- [ ] No outside loads: the fonts, favicon and touch icon are embedded.
- [ ] `node tools/check-content.js` reports no problems and `node tools/test-progress.js` passes in full.
- [ ] `APP_VERSION` is bumped (8.0 suggested).
- [ ] The final summary for Grant, in plain language, says what changed, the new version, and what to check on his phone (theme switch, tab bar, You screen, a wrong answer's panel).
