# Holder designer

Design a printable rack for lab tubes, vials and cuvettes in the browser: pick
the vessel, set how many across and deep, and download a 3MF or STL.

- Vessels: 0.2, 0.5, 1.5, 2, 5, 15 and 50 ml tubes, cryovials, glass vials,
  cuvettes, and custom round or square sizes (`src/vessels.js`).
- Three styles: solid block with blind openings, open stand (plates on end
  walls), and tray with wall-to-wall pockets.
- Live 3D view with the vessels in place, size and filament figures, checks for
  thin walls, colliding caps, tipping and bed size.
- Extras: grip lips or finger loops, side windows, stacking feet or recesses
  for stick-on feet, and filling a box of a given size.
- Shaped for FDM printing: the tool picks the way up (stands lie on a long
  side), turns sideways holes into teardrops, gives windows a 45° peak, bevels
  the outer edges, fillets the joints inside a stand, and reports how much
  surface hangs for each way up (`src/print.js`).
- Designs are shared as links; a 3MF from this tool restores its design when
  dropped back on the page.

A static site with no build step. Everything runs in the browser and no outside
resources are loaded.

## Run it locally

Serve this folder with any static file server, for example:

```bash
python -m http.server 8768
```

Then open <http://127.0.0.1:8768/>. `tests.html` runs the checks; its title
reads PASSED or FAILED.

## Layout

| Path | Contents |
| --- | --- |
| `src/vessels.js` | The vessel list with sizes, openings and usual spacing |
| `src/params.js` | Every control, default, range and validation rule; sizes are worked out in `resolve()` |
| `src/geometry/build.js` | The solid builder for the three styles |
| `src/view.js`, `src/main.js` | 3D view and page wiring |
| `src/export/` | STL, 3MF and the small ZIP reader/writer |
| `vendor/` | three.js 0.180.0 (MIT) and manifold-3d 3.2.1 (Apache-2.0), with their licence files |

## Notes

- Vessel sizes are typical figures and vary between makers. Openings follow the
  hand-made holders the defaults were taken from where one exists (11.5 mm for 1.5 ml tubes,
  18 mm for 15 ml, 29.5 mm for 50 ml, 13 mm for cuvettes). Print one position
  as a test before a full rack.
- No licence has been chosen yet.
