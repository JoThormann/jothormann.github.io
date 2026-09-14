# jothormann.github.io

A one-page personal site. Two projects, a short about, and three drawings.

**Plain HTML and CSS. No framework, no generator, no npm, no build step.** Edit a file,
commit, push — GitHub Actions copies the folder to Pages. Nothing is compiled, and nothing
in CI can fail because a generated file is out of date.

See [`SPEC.md`](SPEC.md) for the decisions behind it: purpose, voice, palette, and why the
page is shaped the way it is.

## Running it locally

```bash
python -m http.server 8800
```

Then open <http://localhost:8800>. Opening `index.html` directly also works, but the
self-hosted fonts only load over a real origin.

## Layout

```
index.html                     the whole page
css/site.css                   the only stylesheet
fonts/                         IBM Plex Sans 400/600 + Plex Mono 400, latin subset
img/                           the box photo, the social card
video/                         the Feed Designer screen recording (mp4 + webm + poster)
svg/drawings.src.svg           Inkscape source: train + vessel on one A4 page
svg/chain.src.svg              Inkscape source: the measurement chain
svg/perfusion-train.svg        hero drawing        (generated; inlined into index.html)
svg/vessel.svg                 about drawing       (generated; loaded as an <img>)
svg/chain.svg                  measurement chain   (generated, animated; inlined)
tools/feed-profile-designer/   the tool itself, self-hosted
scripts/                       three helpers; none is required to deploy
```

## Adding a project

This is the one real cost of having no build step, so it is written down.

Copy a whole `<section>` block in `index.html` — start from `#sensor`, it has every part:
a mono eyebrow, an `h2`, a `.prose` block with a `.hook` first paragraph, figures, and a
`.split` row. Change the `id`, add a link to `.nav__links`, and renumber the `Fig` captions.

Rules worth keeping:

- **Every claim carries a number or a constraint.** `€6,500`. `3am`. If there is no number,
  say what the trade-off was.
- First person in the opening hook; no narrator in the specs.
- Figure captions are one sentence, saying what the figure shows.
- Wide figures go in a `.fig__scroll` with `style="--fig-min:NNNpx"`, where `NNN` is the
  figure's own native width. On phones it scrolls sideways at that width instead of
  shrinking into illegibility.
- **Check what size a drawing's labels actually render at.** A figure authored 1568px wide
  inside the 1130px text column renders everything at 72%, which put its labels below the
  body text size and read as "low resolution" even though the SVG is vector-sharp. Add
  `fig--wide` to any drawing wider than the text column: it breaks out of the measure and
  stops at its own native width, never upscaling.

## Editing a drawing

Edit the `.src.svg` files in Inkscape — never the generated ones — then:

```bash
python scripts/build-drawings.py    # drawings.src.svg -> perfusion-train.svg + vessel.svg
python scripts/animate-chain.py     # chain.src.svg    -> chain.svg, with the motion
python scripts/inline-figures.py    # splice both inlined figures into index.html
```

Both figures are inlined into `index.html` rather than loaded as `<img>`, because an SVG
inside an `<img>` is a separate document and its CSS cannot be driven from the page.

**These scripts are a convenience, not a build step.** `index.html` is committed with the
drawings already inlined, so the site deploys whether or not you ever run them, and nothing
in CI checks that the inlined copy is current. Forgetting to run them can never break a
deploy — it just means the site shows the previous version of the drawing.

## The Feed Designer demo

`video/` holds a screen recording rather than screenshots. It is a `<video>`, not a
GIF: a GIF is capped at 256 colours, which smears fine UI text, and the same clip
costs 7.1 MB as a GIF against 0.8 MB as WebM.

It is shown at its native 1000 px and never upscaled — the recording is the
resolution ceiling, so stretching it to the 1180 px container only softens it.

Rebuilt from a source recording with:

```bash
ffmpeg -ss 5 -i "demo.gif" -vf "crop=1000:486:0:58,fps=12.5,format=yuv420p"        -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -an video/feed-designer.webm
```

The crop matters for more than framing: the untrimmed recording shows the browser
tab bar, the bookmarks bar and the address bar, which between them leak an email
address, internal tool names, spreadsheet titles with run IDs, and a claude.ai
artifact URL containing org and artifact tokens. **Check the top of any new
recording before committing it.**

Under `prefers-reduced-motion: reduce` the video is hidden and the poster still is
shown in its place.

## Motion

### What moves, and why

Two figures move. Both because the motion *is* the content: a still drawing
cannot show a cyclic process or a measurement being acquired.

**The hero — one draw-and-fill cycle.** Three quarters of the growth vessel is
drawn off and the same volume appears in the induction vessel. Both vessels are
29 user units wide, so equal heights are equal volumes: growth loses 10.65 units
of height and induction gains exactly that. The arithmetic comes out of the
drawing rather than being chosen to look right.

Each vessel's bubbles are clipped to its own liquid, so they disappear as the
level falls and come back as it rises. Without that they hang in the empty
headspace, which is the one thing that would make the animation look broken.

**The chain** — impeller blades step through four positions, bubbles rise
clipped to the broth, dashes march along the signal lines and the USB cable, and
the OUR/CER traces draw themselves.

Impeller blades squash *toward the shaft*, not about their own middles, because
that is what a flat blade does as it turns.

Everything is CSS keyframes inside the SVG — **there is no JavaScript anywhere on this
site.** Under `prefers-reduced-motion: reduce` all motion stops and each figure holds a
complete, correct still.

### Scroll-linked levels

The hero's liquid levels follow the reader's scroll rather than a timer: scroll
down and the growth vessel empties into the induction vessel, scroll back and it
reverses. Everything else keeps its own clock, so the rig stays alive when the
reader is still.

The timeline is declared in `css/site.css` on the `<figure>` — `view-timeline:
--fig` — and the animations inside the SVG are re-pointed at it by name. A view
timeline needs a layout box and SVG children do not have one, so it cannot be
declared on the shapes themselves.

**The failure mode is designed out.** A scroll timeline needs
`animation-duration: auto`, which computes to *zero* if the timeline never
resolves — the animation would stop dead and the figure would silently show
nothing. So the levels are authored as ordinary timed loops inside the SVG, and
the page override only ever changes their *timing*. A browser without scroll
timelines keeps the loop.

### Chapter heads and the pinned hero

Each section's eyebrow and heading sit in a `.chapter` band that sticks under the
nav while its own section is on screen, then scrolls away as the next one arrives
in the same place. Sheets in a drawing set, sliding over one another. Pure CSS:
`position: sticky` on four siblings, no JavaScript, no library.

Two details that are load-bearing rather than cosmetic:

- **The band is full-bleed.** A container-width band would let the wider figures
  show past its edges as they pass underneath.
- **It is opaque.** The whole effect is one sheet covering the last one.

The hero figure pins beneath its head. Its own travel through the viewport gives
only about 1460px of scroll to drive the draw-and-fill, so a 220vh wrapper
supplies the scroll instead and the figure sticks inside it: the figure is locked
for 1370px while the growth vessel empties into the induction vessel. The
`view-timeline` is declared on that wrapper, and `animation-range` is mapped to
the pinned window so the cycle completes on screen rather than starting before
the pin and finishing after it.

Two traps worth knowing before you edit the motion CSS:

- **`y` and `height` in keyframes need units.** SVG's `y` presentation attribute
  accepts a bare number so `y: 64.5` survives, but `height: 15.5` is dropped
  silently. The clip window slid down without ever shrinking, so it never tracked
  the liquid. Chrome reports the surviving half without complaint; the only way
  to see it is to read the parsed keyframes back out of `document.styleSheets`.
- **`animation-fill-mode` must be `both` on anything scroll-linked.** Outside its
  range an animation stops applying and the element snaps to its base state, so
  the liquid jumped back to full the moment the hero scrolled away. The shorthand
  inside the SVG sets fill-mode to `none`, so the page override has to set it.

`--hero-head-h` is measured, not guessed: 168px, stable from 900 to 1680px
because the h1's `20ch` measure keeps it at three lines. If you change that
heading, re-measure, or the figure will sit behind the head.

Both are off below 900px (a pinned figure plus 220vh is a lot of thumb) and the
pin is off under `prefers-reduced-motion`. The heads stay: sticky is a layout
affordance, not an animation.

### Checking motion

Neither headless Chrome nor an embedded preview can be trusted here, and it is
worth knowing exactly how each one lies:

- Headless fast-forwards virtual time and samples one arbitrary frame, so a short
  loop looks animated and a slow one looks frozen.
- **Headless paints nothing below the fold after a scroll.** Shoot the page at any
  scroll offset and everything past the first viewport comes back blank, sticky
  or not. Verified with a control page: a plain in-flow block and a plain sticky
  block both vanished. Scrolled screenshots are worthless here, which also means
  `scripts/scroll-sweep.py` only tells the truth about the top of the page.
- A full-page screenshot uses a viewport as tall as the page, so every `vh` unit
  explodes: the hero's 220vh scroller became 15,400px the first time it was shot
  that way.
- The embedded preview pins its document clock at zero and reports every view
  timeline as inactive, so nothing moves and no scroll-driven animation resolves.

All four produced convincing false negatives during the build. What does work is
measuring the DOM in a real browser, and looking with human eyes.

```bash
python scripts/make-motion-check.py
```

That writes `_motion-check.html`, the real page with a readout pinned to the top.
Open it in a real browser, scroll slowly down and back up, and every row should
read MOVES. It is gitignored and never ships.

### One rule if you add a third drawing

Inlined SVGs share one CSS scope with the page. Both drawings originally defined
`@keyframes rise`, `blade` and `march` plus `.bub` and `.blade`, so the later
definition silently won for both and the train's bubbles ran the chain's 150 px
rise instead of their own 7 px one. Everything is now prefixed `tr-` or `ch-`.
**Give a third drawing its own prefix.**

## Phones

Three traps here cost real time. All three were invisible until something was measured.

**A later rule of equal specificity silently beat the media query.**
`.hero__scroller{height:220vh}` and `.fig--pin{position:sticky}` sat in the motion section at
the bottom of `site.css`, below `@media (max-width:900px)`. Plain class selectors, same
specificity, so the media query lost and both overrides were dead code — 1,270 px of blank
white in the hero on a phone, and readers who asked for reduced motion still got the pin.
**Layout rules that a media query overrides must come before it.** They now do, with a
comment saying so, and the mobile rules are written more specifically than the ones they
undo so nothing appended later can undo them again.

**Inkscape's `display:inline` is an inline style and outranks the stylesheet.**
It is redundant — that is the default — but it lives in a `style` attribute, so
`.tr-lbl{display:none}` hid 5 of 35 labels and looked simply broken. `build-drawings.py` now
strips the declaration rather than reaching for `!important`.

**A hidden `<video>` is still downloaded.** `autoplay` overrides `preload="none"`, and
`display:none` does not stop the fetch. Proved with cache-busted URLs: a phone pulled the
768 kB desktop recording it would never display. There is no CSS or HTML fix — `<source
media>` was removed from `<video>` in Chrome — so the site ships **one** recording for every
screen. If you ever add a second, measure the cost first:

```js
performance.getEntriesByType('resource')
  .filter(r => /(webm|mp4)/.test(r.name))
  .map(r => [r.name.split('/').pop(), Math.round(r.transferSize / 1024) + ' kB'])
```

Note that `transferSize: 0` means *served from cache*, not *not fetched* — the entry existing
at all is the proof it was requested. Bust the cache or the measurement will lie to you.

### One rule if you add a second drawing for phones

Both drawings live in the same document, so every id in the portrait copy is suffixed `-p`.
The first version of `chain-phone.py` suffixed only the children of `<svg>`, which left
`brothClip` and the whole plot group colliding with the landscape copy — the same failure as
the class collision that broke the signal lines. Suffix **every id in the subtree**, and the
`url(#…)` and `href="#…"` references with them.

Note that 47 duplicate ids already exist between the perfusion train and the chain, because
Inkscape names them both `rect43`, `path39` and so on. Only one, `rect1`, is referenced, and
it resolves correctly today only because the train happens to be inlined first and the
element pointing at it is empty. Nothing renders wrong, but do not add to it.

## Accessibility

- Hover barely changes anything by design, so `:focus-visible` is load-bearing rather than
  decorative: a 2 px outline on every interactive element. Do not remove it.
- Each wide figure's scroller is focusable, so any sideways scroll is reachable by keyboard.
- Exactly one of each portrait/landscape pair is ever displayed, so nothing is announced twice.
- Both inline drawings carry `<title>` and `<desc>` and are exposed as `role="img"`.

## Deploying

Push to `main`. The workflow publishes everything except `scripts/`, `*.src.*`, `SPEC.md`
and `README.md`. Enable Pages once, under Settings → Pages → Source: GitHub Actions.

The exclusion is `*.src.*`, not `*.src.svg`: the raw phone recording lives beside its
encoded output as `video/feed-designer-phone.src.mp4`, the way each Inkscape source sits
beside its drawing, and it is 5 MB that must not ship.
