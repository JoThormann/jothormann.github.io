# Feed Profile Designer

A single-file browser tool for designing **fed-batch feed profiles** — and for seeing what a profile
implies before you run it.

Build the feed as a sequence of phases. Each phase sets a pump rate (constant, linear ramp,
exponential, or demand-matched to a growth rate), its own temperature, and its own feed bottle, and
ends on whichever condition fires first: an elapsed time, a state threshold (volume, OUR, DCW,
substrate fed), or a moment on the wall clock. The tool then tells you the pump setpoint, predicts the
batch phase, and shows where every switch lands in your working week.

**No install, no build step, no server, no account.** One HTML file, opened in a browser. Nothing you
type leaves your machine.

---

## Try it

Open `index.html`. That is the whole thing.

- **Hosted:** https://jothormann.github.io/tools/feed-profile-designer/
- **Local:** download `index.html` and double-click it. Works offline; it falls back to system fonts
  when it cannot reach Google Fonts.

---

## What it actually computes

The controlled variable is **volumetric pump flow**, because that is what a pump takes. Everything
else follows from it:

```
F                                    pump setpoint, mL/min
F_substrate = F · 0.06 · c_feed      g substrate per hour
dV/dt       = F · 0.06               L per hour
U           = min(F_substrate + pool, q_S,max · X·V)          uptake, g/h
U_ox        = min(U, q_S,crit · X·V),   U_of = U − U_ox       respired / overflow
d(X·V)/dt   = Y · (U_ox − m_s·X·V) + Y_of · U_of
OUR         = (O₂/g · U_ox + O₂,of/g · U_of) / V   ≤ OUR ceiling
```

Below q_S,crit this is exactly the old single-yield model. Above it the extra uptake **overflows**:
biomass at the low yield Y_of, the organism's product (acetate, ethanol) and only the oxygen the
electron balance still needs. q_S,max is set so growth on excess substrate equals µ_max
(`µ_max = Y(q_crit − m_s) + Y_of(q_max − q_crit)`); substrate fed faster than that stays in the broth
as residual substrate and is taken up later. If the plan needs more oxygen than the OUR ceiling,
OUR is held at the ceiling, uptake is scaled back, and the plan is flagged as an error.

Two things are worth knowing because they are easy to get wrong elsewhere:

**Oxygen demand is derived, not typed.** An electron balance over biomass, substrate and oxygen fixes
it from the yield:

```
mmol O₂ per g substrate = 1000 · (γ_S − γ_X · Y · M_S / M_X) / (4 · M_S)
```

so the biomass curve and the oxygen curve always describe the same organism. Expert mode lets you
enter a measured off-gas value instead, and then shows you the yield that measurement implies — if the
two disagree, one of your numbers is wrong, and you get told rather than quietly averaged.

**Feed strength and density are linked.** A bottle can be given in g/L or in % w/w; density converts
between them, and also converts the pump's mL/min into the g/min a gravimetric calibration reads:

```
c [g/L] = 10 · %w/w · ρ            m [g/min] = F [mL/min] · ρ
```

600 g of glucose in 1000 g of solution at 1.2 g/mL is **720 g/L**, not 600. Entering the w/w figure
into a g/L field understates the feed by the density.

**Glucose is usually weighed as the monohydrate.** Pick *Glucose → Monohydrate* and the strength
you type is what went on the balance; the model feeds anhydrous glucose. 600 g of monohydrate made up
to 1000 g of solution is 545 g glucose/kg, ρ ≈ 1.256 g/mL, i.e. **≈ 685 g/L of glucose** — against
773 g/L if the same weighing were anhydrous.

### What it does not model

Re-uptake of overflow product (so the product figure is an upper bound) and inhibition by it,
overflow during the batch (the batch assumes it is re-consumed before the DO spike), recombinant
product formation drawing on the same carbon, oxygen transfer falling as fill height rises,
evaporation, sampling losses, and pump calibration error. Treat the
endgame numbers as an upper bound, and the whole thing as a planning aid rather than a prediction.

---

## Features

- **Phases** — constant, linear, exponential (fixed *k*), or demand-matched (µ held by recomputing
  flow from current biomass). Add, duplicate, reorder, delete.
- **Exit conditions** — stack several per phase; whichever fires first wins. Elapsed, since feed
  start, volume, OUR, DCW, substrate fed, or a clock time.
- **Per-phase temperature** — the vessel ramps toward each target at a rate you set, and maintenance
  and µ_max are recalculated every step from the temperature it has actually reached.
- **Per-phase feed bottle** — start on a dilute bottle to lift F₀ above the pump's floor, then swap to
  a concentrated one. "Continue" across a swap holds the *substrate* rate, so the carbon feed is
  continuous and only the pump rate steps.
- **Batch predictor** — from inoculum density and batch substrate, or fixed to a length you set. Drawn
  on the charts before t = 0 and used to place feed start on the calendar.
- **Three detail levels** — Hydraulic (pump and volume only), Standard (adds the estimated biology),
  Expert (everything editable, plus uncertainty bands and goal-seek).
- **Goal-seek** — solve one knob so a phase switch lands inside working hours, or so a DCW/volume
  target is met at a given wall-clock time. It verifies its own answer and refuses honestly when a
  target is out of reach.
- **Run schedule** — hour-by-hour grid over 1–14 days with night and weekend shading, so you can see
  which switches and samples fall at 3 a.m.
- **Readout line** — one vertical line at the same instant in every chart, with the exact value marked
  on each curve and a summary bar of every quantity.
- **Saved profiles and A/B compare** — save whole scenarios in the browser and overlay any two.
- **Units** — read the pump in mL/min or g/min, and volumes in L or kg, whichever your pump was
  calibrated in. Intensive figures (g/L, g/min/L, mmol/L/h) stay per litre.
- **Export** — copy the whole profile as annotated JSON, or print a one-page run summary.
- **Tooltips on every parameter** — what it is, a typical range, and what breaks if it is wrong.

---

## Modifying it

It is one file with no build step: edit `index.html`, reload the browser. Roughly 420 lines of CSS,
then markup, then ~3400 lines of plain JavaScript with no dependencies. Search for these banner
comments to jump to a section:

| Search for | What lives there |
| --- | --- |
| `biology tables` | `ORG` (organisms: biomass formula, µ_max, maintenance, q_S,crit), `SRC` (carbon sources: molar mass, degree of reduction, solubility, density coefficients), `PROD` (reduced products) |
| `feed density` | The w/w ↔ g/L conversion and the density estimator |
| `the electron balance` | `o2PerG`, `yieldFromO2`, `productYield` |
| `tooltip corpus` | `TIPS` — every parameter's explanation, range and failure mode |
| `state` | `S`, the single state object, and `mkPhase` |
| `presets` | `PRESETS` — the seven starting scenarios |
| `derived parameters` | `derive()` — input clamping, temperature scaling, batch prediction |
| `the batch phase` | `simulateBatch()` |
| `the phase engine` | `flowFor`, `resolveStart`, `simulate()` — the integrator |
| `display units` | The mL/min ↔ g/min and L ↔ kg presentation layer |
| `chart engine` | `drawChart()`, the hand-rolled SVG plotter |
| `runs: a scenario` | `CSERIES` (which series chart C can show), `PANEL_COPY` |
| `shared readout line` | `drawXhair`, `renderXhairBar` |
| `alerts` | `renderAlerts()` — every warning and its wording |
| `run schedule` | The hour grid and wall-clock timeline |
| `goal-seek` | `KNOBS` and `runSeek()` |
| `standalone build: touch support` | Tap-to-open tooltips and finger-drag for the readout line |

### Common changes

**Add your own organism** — copy an entry in `ORG`. You need the biomass elemental formula (which
gives `gX`, the degree of reduction, and `MX`, the C-mol mass), a reference temperature, µ_max per
carbon source, maintenance, and q_S,crit. Check the µ_crit the tool prints next to q_S,crit: it should
match the literature growth threshold, or you have typed a µ into a g/g/h field.

**Add a carbon source** — copy an entry in `SRC`. `MC` is the molar mass per carbon, `gS` the degree
of reduction per carbon, `solub` the practical ceiling in g/L, and `dA`/`dB` the quadratic density
coefficients (ρ = 0.998 + dA·x + dB·x², x = mass fraction).

**Add a preset** — copy an entry in `PRESETS`. The helpers `P_EXP`, `P_CON`, `P_DEM`, `P_LIN` build
phases and `X_OUR`, `X_VOL`, `X_ELA`, `X_SF`, `X_CLK` build exit conditions; `atT` and `atC` set a
phase's temperature and bottle.

**Change the look** — the CSS custom properties at the top of the `<style>` block define the whole
palette for light, dark and system themes. Every colour is a token; change them there, not inline.

**Change the model** — `simulate()` is a plain explicit-Euler loop, about 60 lines. If you change what
it means, bump `MODEL_VERSION` so old exported JSON stays identifiable.

### Sanity checks worth keeping

The model has closed-form answers you can check against after editing. Open the browser console:

```js
// constant flow with no maintenance: V should be exactly V0 + F·0.06·t
applyPreset("glucsimple");
S.auto=false; S.ms=0; S.muMax=5; S.Y=0.5; S.cBasis="gl"; S.cFeed=500; S.rho=1;
S.V0=1; S.Vmax=99; S.horizon=10; S.lag=0; S.x0man=true; S.x0=2; S.perPhaseFeed=false;
S.phases=[mkPhase({shape:"constant", T:30, start:{mode:"absolute", value:2, factor:1},
  exits:[{on:"sinceFeed", op:">=", value:10, clockAt:"", clockHour:8}]})];
var e = simulate(derive(S), S.phases, S.sched.feed.getTime()), r = e.rows[e.endIdx];
console.log(r.V, 1 + 2*0.06*r.t);         // must agree to ~1e-9

// electron balance fixtures
o2PerG(4, 4.07, 0.45, 30.027, 25.00);      // E. coli on glucose  -> 15.0 mmol/g
o2PerG(14/3, 4.20, 0.45, 30.697, 24.61);   // generic on glycerol -> 18.8 mmol/g
```

---

## Publishing your own copy

1. Create a repository and put `index.html` at its root.
2. **Settings → Pages → Source: deploy from branch**, branch `main`, folder `/ (root)`.
3. It appears at `https://USERNAME.github.io/REPO/` within a minute or two.

**Fork it:** copy this folder (`index.html` and `LICENSE`) into your own repository. Before you
publish, point the source link in the page footer at your repository, and optionally fill in and
uncomment the `og:url` and `og:image` meta tags in `<head>` (with a `preview.png` screenshot next to
`index.html`) so shared links get a preview card.

---

## Browser support

Any current browser. It uses plain ES2020 JavaScript, CSS custom properties and inline SVG — no
framework, no transpiling, no polyfills.

**On a phone** the layout re-flows to one column, plots shorten, the parameter console starts
collapsed so you land on the charts, tap targets are enlarged, tooltips open on tap instead of hover,
and the readout line can be dragged with a finger. The hour grid and the wall-clock timeline are wider
than a phone by design and scroll sideways. A phone is good for reading and adjusting a plan; a laptop
is better for building one from scratch.

Saved profiles live in that browser's `localStorage`, so they are per-device and never uploaded. Some
privacy modes block storage; if so, the tool says as much and saves last only until you reload.

---

## Licence

MIT — see `LICENSE`. Use it, change it, ship it, including commercially. Keep the copyright notice.

## Disclaimer

Every number is a model estimate derived from the assumptions you enter, not a validated prediction.
This is a planning aid, not qualified software, and it is not intended for GMP or any use where an
error carries regulatory or safety consequences. Check any plan against your own runs before you trust
it.

---

Built by **Jonas Thormann**. If you extend it — a new organism, a better density correlation, an
overflow flux model — a pull request or a note would be welcome.

---

## Changelog

**Model 1.1.0 (2026-09-25).** Checked against glucose fed-batches, where 1.0.0 predicted about
twice the measured OUR during the growth ramp.

- Uptake capacity: uptake is capped at q_S,max; the excess shows up as *residual substrate*.
- Overflow branch above q_S,crit (new organism constant *overflow yield* Y_of), with the product
  as its own series, and DCW and OUR both following from the split.
- The OUR ceiling is enforced; exceeding it is an error, and an OUR exit above the ceiling is flagged
  as one that can never fire.
- Glucose monohydrate as a weighed form; the bottle is spelt out as a recipe, and a density that
  fits the monohydrate (or no strength at all) is called out.
- New phase exit *Feed pumped (mL)*; *Substrate fed* is labelled as grams.
- Each exponential or demand-matched phase shows µ_crit and µ_max at its own temperature while you type.
- Layout: the feed-concentration, OUR-ceiling and run-horizon sliders are gone. The bottle is
  entered once, under *Feed bottle*; OUR ceiling and run horizon live in a new *Run limits* group.
  The feed-start DCW override moved to *Batch phase*, the uncertainty band to *Kinetics*, and the two
  density buttons are now one. The *Respiro-fermentative* mode was removed (it behaved exactly like
  aerobic; saved profiles that use it load as aerobic).
- Fixes: typing into a parameter field no longer loses digits (0.05 used to arrive as 5, because
  every keystroke rewrote the field); the goal-seek feed-concentration knob and the built-in presets
  now work on a % w/w or g/kg bottle; a new phase copies the previous phase's bottle on every basis;
  an OUR exit set exactly at the ceiling no longer raises a false oxygen alarm.
- Panel D adds the µ the feed alone would give; the export adds uptake, overflow, residual substrate,
  product and feed pumped. Profiles saved under 1.0.0 load unchanged.
