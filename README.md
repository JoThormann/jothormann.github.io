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
img/                           screenshots, the box photo, the social card
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
  width the labels stay readable at. On phones the figure scrolls sideways at that width
  instead of shrinking into illegibility.

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

### Checking motion

Neither headless Chrome nor an embedded preview can be trusted here. Headless
fast-forwards virtual time and samples one arbitrary frame, so a short loop looks
animated and a slow one looks frozen. An embedded preview pins its document clock
at zero, so nothing moves at all. Both produced convincing false negatives during
the build.

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

## Accessibility

- Hover barely changes anything by design, so `:focus-visible` is load-bearing rather than
  decorative: a 2 px outline on every interactive element. Do not remove it.
- Each wide figure's scroller is focusable, so the sideways scroll is reachable by keyboard.
- Both inline drawings carry `<title>` and `<desc>` and are exposed as `role="img"`.

## Deploying

Push to `main`. The workflow publishes everything except `scripts/`, `*.src.svg`, `SPEC.md`
and `README.md`. Enable Pages once, under Settings → Pages → Source: GitHub Actions.
