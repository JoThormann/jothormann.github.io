# Portfolio site — spec

One scrolling page, hand-written, no build step. This file is the agreement; if the build
and this file disagree, this file is wrong and should be corrected.

## 1. Decisions locked

| | |
|---|---|
| Purpose | Peer calling card. Somewhere to point a colleague after meeting them. |
| Not this | No CV, no portrait, no credentials, no hire-me CTA, no form, no analytics, no cookies. |
| Structure | One scrolling page. Sticky nav, two projects, short about, dark footer. |
| Order | **01 Feed Profile Designer · 02 off-gas sensor · 03 about.** |
| Visual system | Jonas's own technical-drawing language. Not the old "Inked Halftone" comic system. |
| Ground | Pure white, pure black. No halftone, no hand-lettering, no comic accents. |
| Type | IBM Plex Sans + IBM Plex Mono, self-hosted. |
| Stack | Plain HTML + CSS. No framework, no generator, no npm, no build step. |
| Hosting | GitHub Pages, `jothormann.github.io`. No custom domain. |
| Language | English only. |
| Legal | No Impressum. Private, non-commercial: no ads, no services sold, no form. |
| Employer | Never named. Field described generically. |

## 2. Identity

- **Name** Jonas Thormann
- **Eyebrow** BIOPROCESS ENGINEER · UPSTREAM FERMENTATION
- **Email** jonasthormann@outlook.de
- **LinkedIn** linkedin.com/in/jonas-thormann
- **GitHub** JoThormann — repo `jothormann.github.io` (public)

## 3. Voice

- **First person in the hook, no narrator in the specs.** Each project opens with a real
  bench problem in Jonas's voice, then drops to labels, tables and numbers with no "I".
  The about is first person again.
- The reader is addressed as **you** in the hooks. It invites; it does not pitch.
- **Every claim carries a number or a constraint.** `€6,500`. `€500`. `3am`.
- Sentence case. Uppercase only for the wordmark and mono labels.
- Figure captions: one full sentence with a period, saying what the drawing shows.
- Labels are noun phrases, no period. Units are mono and spaced.
- No exclamation marks, no emoji, no marketing adjectives, no hand-lettered asides.
- **Never** "building practical solutions at the intersection of biology and technology"
  or anything in that register. It carries no number and could describe anyone.
- Total page budget ≈ 220 words. If a section grows, cut it back.

## 4. The page, in full

### Nav
Sticky. `JONAS THORMANN` left, Plex Sans 600. Right: `01 FEED  02 SENSOR  03 ABOUT` in mono.
1.6px bottom rule. No logo mark.

### Hero

> BIOPROCESS ENGINEER · UPSTREAM FERMENTATION
>
> **I solve lab problems with CAD, 3D printers and microcontrollers.**

Then the perfusion train, full container width, from `svg/perfusion-train.svg`.

> *FIG 01 — Draw-and-fill semi-continuous fermentation: growth and induction vessels,
> with medium feed under weight control.*

Nothing is named — no thesis, no institution, no employer. The caption describes only what
the drawing shows.

No paragraph. The drawing does the rest.

### 01 — Feed Profile Designer
*Software gets shown.*

> Every feed profile I've planned ended with the same question: does the phase switch land
> at 3am?
>
> So I built something to answer it. Set your phases — exponential, constant, ramps, each
> with its own temperature and feed bottle — and it gives you the pump setpoint, predicts
> the batch, and shows where every switch falls in your week.
>
> One HTML file, no install, MIT licensed. Fork it and swap in your own organism.

- **FIG 02** — a screen recording of the designer in use, `<video>` not GIF, shown at its
  native 1000 px. *Phases set, the batch predicted, and every switch placed on the wall clock.*
  Cropped to remove browser chrome, which leaked an email address, internal tool names and a
  claude.ai artifact URL. Poster still shown under reduced motion.
- Badges `GOAL-SEEK` `ELECTRON BALANCE` `RUNS IN A BROWSER`
- Button `Open the designer →` to `/tools/feed-profile-designer/`

### 02 — DIY off-gas sensor
*Hardware gets drawn.*

> Every run vents its answer and most rigs let it go out the door. A commercial off-gas
> analyser costs about €6,500.
>
> So I built one for €500. An O₂ cell and a CO₂ cell sit in the vent line, a BME280 corrects
> both to dry gas, and a Teensy 4.0 streams all three to a timestamped CSV — OUR, CER, and
> the RQ you only get from having both.
>
> The cells ship with a thread instead of barbs, so the Y-splitter is printed in SLA resin.

- **FIG 04** — `svg/chain.svg`, inlined and animated, full width.
  *The measurement chain, vent line to CSV. Solid lines carry gas, dashed lines carry data.*
- **FIG 05** — the photograph of the open box.
  *The same chain, assembled. This is why the drawing exists.*
- **Stat** `€500` — against €6,500 commercial
- **Spec table**, mono: O₂ cell €100 · CO₂ cell €350 · BME280 €10 · Teensy 4.0 €25.
  The CO₂ cell is 70 % of the build.

### 03 — About

> **Jonas Thormann**
>
> I am a bioprocess engineer working in upstream microbial fermentation. Most of what I
> build starts as something the lab needed and could not buy — a sensor, a fixture, a
> calculation nobody wanted to do twice. If you work on similar processes or similar
> hardware, I would rather compare notes than pitch anything.

Beside it: the instrumented vessel drawing, in place of a portrait. One button to LinkedIn.

### Footer
The one full-bleed element. Black band, white text: email and LinkedIn.

## 5. Visual system

### Colour — sampled from Jonas's own drawing, not invented

```
--paper        #ffffff     ground
--ink          #000000     every outline and body text
--ink-soft     #515151     mono labels, captions, secondary text
--rule         #c0c5c5     table rules, gridlines

--broth        #e2ddc6     culture
--glass        #f5f7f8     vessel walls
--glass-tint   #dfebeb
--steel        #939b9b
--steel-light  #c0c5c5
--ochre        #e3d184     tubing
--blue         #345ecc     the one saturated accent — buttons, OUR trace
--burnt        #c8781e     CER trace
--cell-red     #d93520     real objects keep their real colour
--pcb-green    #0e7a3a
```

**Rule: real objects keep their real colour; the interface uses ink, paper and blue only.**

### Type

IBM Plex Sans 400/600, IBM Plex Mono 400. Latin subset woff2, self-hosted,
`font-display: swap`. Preload Sans 400 and 600 only.

```
display   34px / 1.05 / -0.02em / 600
h2        24px / 1.15 / 600
h3        17px / 600
body      15px / 1.6 / 400      measure 68ch
small     13px
mono      10px / 0.16em tracking / uppercase   labels, figure numbers, units
```

### Space and structure

4px base, 8px working step, 80px section rhythm, 1180px container.

Strokes: `1px` leaders and table rules · `1.2px` label boxes · `1.6px` object outlines ·
`2px` buttons and section rules.

Radius 0 and 2px only. **No shadows, no gradients, no blur, no opacity transitions.**
Buttons invert on hover and press 1px.

### Motion

Two figures move, because in both cases the motion *is* the content. Nothing else moves.

- **FIG 01, perfusion train** — one draw-and-fill cycle: 3/4 out of the growth vessel and the
  same volume into the induction vessel, with each vessel's bubbles clipped to its own liquid.
  Impellers, bubbles and control-line dashes keep their own clocks.
- **FIG 04, chain** — impeller blades in four hard steps, bubbles rising clipped to the
  broth, dashes marching along the signal lines and USB, and the OUR/CER plot drawing in.

**The hero's levels are scroll-linked; everything else is timed.** The timeline is declared
on the figure in `css/site.css` and the SVG's animations are re-pointed at it by name — a view
timeline needs a layout box, which SVG children do not have. The levels are authored as timed
loops so the page override can only change their timing, never stop them. Verified in Chrome
152; see README, "Checking motion".

Pure CSS plus two `animateMotion` tags. **No JavaScript.**
`prefers-reduced-motion: reduce` stops everything and pins a complete, correct still.

### Mobile

The page is figure-led and every figure is wide and label-dense, so this is the hard part —
and it is where the previous site failed. At 390 px the chain figure's 15 px labels would
render at **3.7 px**. Scaling wide technical drawings to fit does not make labels small, it
deletes them.

- **The two drawings scroll horizontally, they do not shrink.** Minimum render width ~900 px
  inside `overflow-x: auto`, with `overscroll-behavior-x: contain` so a sideways swipe does
  not steal the page scroll, and a visible `swipe →` hint in mono. The old site did this
  silently, which is why nobody found the figure. The perfusion train behaves the same way
  in the hero — one drawing, same treatment everywhere.
- **No mobile-specific screenshots — tested and rejected.** The Feed Designer's day grid is
  its own horizontal scroller by design, so a 390 px capture is truncated: a phone-width
  screenshot would be *worse* than the desktop one. Both screenshots therefore get the same
  treatment as the drawings — one image, scrolling sideways. One rule for every wide figure.
- **Everything stacks.** Section 02's photo / stat / table row becomes photo → stat → table.
- **The nav loses its links** below ~700 px; wordmark only. Three sections on a two-screen
  page do not need anchors, and the old site's wordmark with `white-space: nowrap` forced the
  whole page to scroll sideways at 390 px.
- **Type:** mono labels 10 → 11 px, display 34 → 28 px, body stays 15 px. Buttons get a
  44 px minimum tap height.
- **Horizontal overflow is the first thing to check**, not the last. `overflow-x: hidden` on
  the body hides the symptom rather than fixing it: wide figures live in their own scroll
  containers and nothing else may exceed the viewport.
- **Images:** webp with jpg fallback, two widths each, `loading="lazy"` below the fold,
  explicit `width`/`height` on every image so nothing shifts while loading.
- **Test at 360, 390, 414 and 768.** The previous site broke at 768 — a clipped figure behind
  a silent inner scrollbar.

### Accessibility

Hover changes little, so `:focus-visible` is functional, not polish: 2px ink outline at 2px
offset on every interactive element. Skip link. Real `alt` text. Inlined figures carry
`role="img"` with a title and description.

## 6. Files

```
new_portfolio_website/
  index.html
  css/site.css
  fonts/                          plexsans-400/600, plexmono-400 (woff2)
  img/                            feed-designer screenshots, box photo (webp + jpg, 2 widths)
  svg/perfusion-train.src.svg     Jonas's Inkscape source — edit this
  svg/perfusion-train.svg         animated, generated
  svg/chain.src.svg               Jonas's Inkscape source — edit this
  svg/chain.svg                   animated, generated
  svg/vessel.svg                  the instrumented vessel, for the about
  tools/feed-profile-designer/    self-hosted, Google Fonts call stripped
  .github/workflows/deploy.yml
  README.md
  SPEC.md
```

No build step. The two generated files are the animated SVGs; each Inkscape source sits
beside its output so a drawing is never lost. Regeneration is one script run and is **not**
a precondition for deploying.

**Adding a project later** means copying one `<section>` block in `index.html`. The README
documents the block. That is the accepted cost of having no build step.

## 7. Assets

| | Status |
|---|---|
| Perfusion train | ✅ `references/perfusion train.svg` — vector, contains the vessel drawing too |
| Instrumented vessel | ✅ same file, second drawing |
| Chain figure | ✅ `references/chain.svg` + animated build |
| Box photograph | ✅ `references/photo_5269443127645249040_y.jpg` |
| Feed Designer demo | ✅ `video/` — mp4 + webm + poster, trimmed, cropped, chrome removed |
| Feed Designer tool | ✅ self-hosted at `tools/feed-profile-designer/`, CDN font call stripped |

## 8. Build order

| | |
|---|---|
| 0 | `git init`, push `jothormann.github.io`, Pages on, deploy workflow |
| 1 | Tokens, fonts, reset, type scale, focus styles |
| 2 | Shell: nav, section rules, footer |
| 3 | Hero + the perfusion figure |
| 4 | 01 Feed Profile Designer — needs the screenshots |
| 5 | 02 off-gas sensor — figure and photo are ready |
| 6 | 03 about |
| 7 | Self-host the Feed Designer, strip its CDN font call |
| 8 | Mobile pass — scrollers, stacking, mobile screenshots, overflow check at 360/390/414/768 |
| 10 | Contrast, focus and weight pass · `og:image` with an absolute URL · favicon |
