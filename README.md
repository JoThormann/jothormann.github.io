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
svg/perfusion-train.svg        hero drawing          (inlined into index.html)
svg/chain.svg                  measurement chain     (inlined into index.html, animated)
svg/chain.src.svg              the Inkscape source for the chain — edit this one
svg/vessel.svg                 the about drawing     (loaded as an <img>)
tools/feed-profile-designer/   the tool itself, self-hosted
scripts/                       two helpers; neither is required to deploy
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

Open `svg/chain.src.svg` in Inkscape, change it, save, then:

```bash
python scripts/animate-chain.py     # re-add the motion -> svg/chain.svg
python scripts/inline-figures.py    # splice the drawings into index.html
```

Both figures are inlined into `index.html` rather than loaded as `<img>`, because an SVG
inside an `<img>` is a separate document and its CSS cannot be driven from the page.

**These scripts are a convenience, not a build step.** `index.html` is committed with the
drawings already inlined, so the site deploys whether or not you ever run them, and nothing
in CI checks that the inlined copy is current. Forgetting to run them can never break a
deploy — it just means the site shows the previous version of the drawing.

## Motion

Two figures move, and only because the motion is the content: a static drawing cannot show
a cyclic process or a measurement being acquired. Everything is CSS keyframes inside the SVG
— **there is no JavaScript anywhere on this site.** Under `prefers-reduced-motion: reduce`
all motion stops and each figure holds a complete, correct still.

### Scroll-linked motion — deliberately not shipped

The plan was to drive both figures from scroll position with `animation-timeline: view()`,
so nothing moves while the reader is still. It was written, and then removed.

A scroll timeline requires `animation-duration: auto`. If the timeline fails to resolve,
`auto` computes to zero and the animation stops dead — a figure that silently shows nothing.
That is exactly the bug that left the previous version of this site with an invisible
measurement-chain figure that no visitor ever saw.

It could not be verified in any browser available during the build: headless Chrome does not
drive scroll timelines under virtual time, and the embedded preview reports every view
timeline as inactive. Shipping an unverifiable enhancement whose failure mode is a blank
figure was not a trade worth making. The timed loops are verified and work everywhere.

To revisit: open the page in a real browser, confirm a view timeline resolves, then add the
override back to the `CSS` block in `scripts/animate-chain.py` and re-run it.

## Accessibility

- Hover barely changes anything by design, so `:focus-visible` is load-bearing rather than
  decorative: a 2 px outline on every interactive element. Do not remove it.
- Each wide figure's scroller is focusable, so the sideways scroll is reachable by keyboard.
- Both inline drawings carry `<title>` and `<desc>` and are exposed as `role="img"`.

## Deploying

Push to `main`. The workflow publishes everything except `scripts/`, `*.src.svg`, `SPEC.md`
and `README.md`. Enable Pages once, under Settings → Pages → Source: GitHub Actions.
