// One model for the guided tour, as a mesh. No DOM: runs in the tour's worker,
// or on the page if a worker cannot load the kernel.
import { sanitize, resolve } from './params.js';
import { buildHolder, toMesh } from './geometry/build.js';

/**
 * The holders the tour shows. Each must pass the tool's own checks (tests.js
 * makes sure), since "Try it live" opens the tool on it. A 256 mm bed, a
 * common size, takes the nine-place stand lying down.
 */
const BED = { bedX: 256, bedY: 256, bedZ: 256 };
export const SHOWCASE = {
  single: { style: 'single', vessel: 'f50', grip: '4', chamfer: 1.2 },
  stand: { style: 'stand', vessel: 'f15', cols: 9, rows: 1, dividers: 'three', labels: 'digits', labelD: 12, frameR: 14, margin: 11, ...BED },
  block: { style: 'block', vessel: 'cryo', cols: 4, rows: 3, feet: 'stack', edge: 1.2, corner: 6, chamfer: 1.5, margin: 8 },
  tray: { style: 'tray', vessel: 'cuvette', cols: 5, rows: 2, windows: true, feet: 'pads' },
  pcr: { style: 'block', vessel: 'pcr', cols: 8, rows: 4 },
};

/**
 * "Your settings": one holder, changed one setting at a time, each step keeping the
 * changes before it. After the last it starts over from the first.
 */
const A0 = { style: 'block', vessel: 't15', cols: 4, rows: 2 };
const A1 = { ...A0, cols: 6 };
const A2 = { ...A1, rows: 3 };
const A3 = { ...A2, vessel: 'cryo' };
const A4 = { ...A3, corner: 10 };
const A5 = { ...A4, windows: true };
export const ADAPT = [A0, A1, A2, A3, A4, A5];

/**
 * @param p   a design (as in a share link)
 * @param cut if a number: cut the holder open, taking away the half that faces this
 *            direction (degrees around z), so its inside shows
 */
export function makeMesh(kernel, p, cut = null, segments = 96) {
  const M = kernel.Manifold;
  let solid = buildHolder(kernel, resolve(sanitize(p)), segments);
  if (cut !== null) {
    const big = 2000;
    const a = M.cube([big, big, big], false);
    const b = a.translate([0, -big / 2, -big / 2]);
    const c = b.rotate([0, 0, cut]);
    const open = solid.subtract(c);
    for (const m of [a, b, c, solid]) m.delete();
    solid = open;
  }
  try {
    return toMesh(solid);
  } finally {
    solid.delete();
  }
}
