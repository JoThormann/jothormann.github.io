// The single description of a holder. Controls, defaults, validation and
// share links are generated from this list. Lengths in mm.
//
// Besides range and default, a control can carry what the page needs to explain
// it to someone without CAD experience:
//   group  the tab it sits on (see TABS)
//   adv    folded away under "Fine-tuning" on that tab
//   head   a small heading shown above it
//   hint   one plain sentence under it
//   ends   words under the two ends of a slider
//   seg    a yes/no setting shown as two buttons: [label for no, label for yes]
//   options[k].hint  shown under a choice while that option is picked
import { VESSELS } from './vessels.js';

export const STYLES = {
  block: { label: 'Solid block', blurb: 'Tubes sit in holes in one solid piece. Sturdy and quick to print; best for short tubes.' },
  stand: { label: 'Open stand', blurb: 'Plates with holes, held by two end walls. Light and open; best for long tubes like 15 and 50 ml.' },
  tray: { label: 'Tray', blurb: 'Shallow pockets packed side by side. Holds the most in little space; good for cuvettes and vials.' },
  single: { label: 'Single stand', blurb: 'One tube in a sleeve on a wide base. For a tube that stays on the bench next to an instrument, or one big tube that must not tip.' },
};

/** The kind of holder that usually suits a vessel; `count` = how many places are asked for. */
export function suggestStyle(v, count = 2) {
  if (count === 1) return 'single';
  if (v.shape === 'square') return 'tray';
  return v.length >= 70 ? 'stand' : 'block';
}

/** Common printers and their build volume (width × depth × height, mm), for the printer menu. */
export const PRINTERS = {
  a1mini: { label: 'Bambu Lab A1 mini', bed: [180, 180, 180] },
  bambu: { label: 'Bambu Lab A1 / P1S / X1C', bed: [256, 256, 256] },
  mk4: { label: 'Prusa MK4', bed: [250, 210, 220] },
  mini: { label: 'Prusa MINI+', bed: [180, 180, 180] },
  ender: { label: 'Creality Ender-3 V3 / K1', bed: [220, 220, 250] },
  k1max: { label: 'Creality K1 Max', bed: [300, 300, 300] },
  neptune: { label: 'Elegoo Neptune 4', bed: [225, 225, 265] },
  kobra: { label: 'Anycubic Kobra 2', bed: [220, 220, 250] },
  other: { label: 'Other: type the size' },
};

export const TABS = [
  { id: 'tubes', label: 'Tubes', intro: (f) => f.style === 'single' ? 'Pick the tube this stand is for. For most stands this is all you need.' : 'Pick what goes in the holder and how many. For most holders this is all you need.' },
  { id: 'shape', label: 'Shape', intro: 'The tool picks a height and shape that suit your tube. Change them here if you want.' },
  { id: 'extras', label: 'Extras', intro: (f) => f.style === 'single' ? 'Optional extras for the base.' : f.style === 'stand' ? 'Optional: dividers, numbers for each position, and feet underneath. Leave them off for a plain stand.' : 'Optional: slots to see into the tubes, and feet underneath. Leave them off for a plain holder.' },
  { id: 'print', label: 'Print', intro: 'How it prints: the filament and the way up. Your printer is picked at the top of the right-hand panel.' },
];

const custom = (f) => Boolean(VESSELS[f.vessel].custom);
const is = (...styles) => (f) => styles.includes(f.style);
const many = (f) => f.style !== 'single';
const manual = (f) => !f.autoSpacing && many(f);
const plated = (f) => f.style === 'stand' && f.basePlate;
const coned = (f) => !VESSELS[f.vessel].custom && VESSELS[f.vessel].cone > 0 && VESSELS[f.vessel].shape === 'round';

export const PARAMS = [
  { id: 'style', type: 'select', options: STYLES, def: 'block' },

  // ---- Tubes ----
  { id: 'vessel', group: 'tubes', head: 'What it holds', label: 'Tube or vial', type: 'select', options: VESSELS, def: 't15' },
  { id: 'customSize', group: 'tubes', label: 'Width of your tube', unit: 'mm', min: 3, max: 120, step: 0.1, def: 20, when: custom,
    hint: 'Measure across the tube where the holder should grip it. For a square one, measure one side.' },
  { id: 'customLength', group: 'tubes', label: 'Height of your tube', unit: 'mm', min: 5, max: 250, step: 1, def: 60, when: custom,
    hint: 'From the bottom to the top of the closed cap' },

  { id: 'fitBox', group: 'tubes', head: 'How many', label: 'Size the holder by', type: 'toggle', seg: ['Rows and columns', 'Filling a box'], def: false, when: many,
    hint: 'Or give the inside of a freezer box, water bath or drawer and get as many places as fit' },
  { id: 'cols', group: 'tubes', label: 'Tubes in a row', unit: '', min: 1, max: 24, step: 1, def: 6, when: (f) => !f.fitBox && many(f),
    hint: 'Left to right' },
  { id: 'rows', group: 'tubes', label: 'Rows', unit: '', min: 1, max: 12, step: 1, def: 2, when: (f) => !f.fitBox && many(f),
    hint: 'Front to back' },
  { id: 'boxX', group: 'tubes', label: 'Box, inside width', unit: 'mm', min: 20, max: 600, step: 1, def: 130, when: (f) => f.fitBox && many(f),
    hint: 'Measure inside the box, left to right' },
  { id: 'boxY', group: 'tubes', label: 'Box, inside depth', unit: 'mm', min: 20, max: 600, step: 1, def: 130, when: (f) => f.fitBox && many(f),
    hint: 'Measure inside the box, front to back' },
  { id: 'boxGap', group: 'tubes', adv: true, label: 'Room to spare', unit: 'mm', min: 0, max: 10, step: 0.5, def: 1, when: (f) => f.fitBox && many(f),
    hint: 'Left free all round, so the holder slides into the box easily' },

  { id: 'fit', group: 'tubes', adv: true, label: 'Hole fit', unit: 'mm', min: -0.5, max: 2, step: 0.05, def: 0, ends: ['Tighter', 'Looser'],
    hint: 'Leave at 0 at first. The fit test above shows what to set: type the value printed by the best hole here.' },
  { id: 'autoSpacing', group: 'tubes', adv: true, label: 'Usual spacing for this tube', type: 'toggle', def: true, when: many,
    hint: 'On: the distance racks normally use, so caps do not bump into each other. Off: set your own.' },
  { id: 'pitchX', group: 'tubes', adv: true, label: 'Spacing left to right', unit: 'mm', min: 4, max: 150, step: 0.5, def: 20, when: manual,
    hint: 'From the centre of one hole to the centre of the next' },
  { id: 'pitchY', group: 'tubes', adv: true, label: 'Spacing front to back', unit: 'mm', min: 4, max: 150, step: 0.5, def: 20, when: manual,
    hint: 'From the centre of one row to the centre of the next' },
  { id: 'margin', group: 'tubes', adv: true, label: 'Border', unit: 'mm', min: 1, max: 30, step: 0.5, def: 4, ends: ['Narrow', 'Wide'], when: many,
    hint: 'Solid material between the outer holes and the edge of the holder' },

  // ---- Shape ----
  { id: 'autoHeight', group: 'shape', head: 'Height', label: 'Usual height for this tube', type: 'toggle', def: true,
    hint: 'On: deep enough to hold the tube steady, low enough to grab it. Off: set it yourself.' },
  { id: 'height', group: 'shape', label: 'Height of the holder', unit: 'mm', min: 5, max: 200, step: 1, def: 50, when: (f) => !f.autoHeight,
    hint: 'From the table to the top' },
  { id: 'depth', group: 'shape', label: 'Hole depth', unit: 'mm', min: 2, max: 190, step: 1, def: 20,
    when: (f) => !f.autoHeight && is('block', 'tray')(f), hint: 'How far each tube sinks in' },

  { id: 'base', group: 'shape', head: 'Base', label: 'Shape of the base', type: 'select', def: 'ring', when: is('single'),
    options: {
      ring: { label: 'Spoked ring', hint: 'An outer ring on four spokes: a wide, steady footprint from little material, and quick to print.' },
      disc: { label: 'Solid disc', hint: 'A full disc: heavier, so even steadier, and easy to wipe clean.' },
    } },
  { id: 'autoBase', group: 'shape', label: 'Usual base size for this tube', type: 'toggle', def: true, when: is('single'),
    hint: 'On: wide enough that the full tube does not tip when knocked. Off: set it yourself.' },
  { id: 'baseD', group: 'shape', label: 'Base diameter', unit: 'mm', min: 20, max: 250, step: 1, def: 100, when: (f) => f.style === 'single' && !f.autoBase,
    hint: 'Wider stands steadier; narrower takes less bench space' },
  { id: 'grip', group: 'shape', head: 'Grip', label: 'Sleeve', type: 'select', def: '0', when: is('single'),
    options: {
      0: { label: 'Closed', hint: 'A plain sleeve with a fitted hole. Stiff and simple; if a test print is too tight or loose, change the hole fit (Tubes › Fine-tuning).' },
      3: { label: '3 fingers', hint: 'Slots split the sleeve into three springy fingers that hug the tube and forgive small size differences.' },
      4: { label: '4 fingers', hint: 'Four springy fingers, like a drill chuck: hugs the tube and forgives small size differences.' },
      6: { label: '6 fingers', hint: 'Six narrow fingers: the softest grip, for tubes that vary most in size.' },
    } },
  { id: 'coneSeat', group: 'shape', label: 'Rest on the cone', type: 'toggle', def: true, when: (f) => f.style === 'single' && coned(f),
    hint: 'Small ribs inside catch the pointed end, so the tube rests on its cone instead of its tip and stands straight.' },
  { id: 'standFloor', group: 'shape', head: 'Plates', label: 'Bottom plate', type: 'toggle', def: true, when: is('stand'),
    hint: 'The tubes stand on it. Without it they hang by their rim.' },
  { id: 'guide', group: 'shape', label: 'Middle plate', type: 'toggle', def: false, when: is('stand'),
    hint: 'A third plate half-way down keeps long tubes upright' },
  { id: 'corner', group: 'shape', head: 'Look', label: 'Rounded corners', unit: 'mm', min: 0, max: 20, step: 0.5, def: 4, ends: ['Square', 'Round'], when: many,
    hint: 'Seen from above. Rounder corners also print cleaner.' },
  { id: 'frameR', group: 'shape', label: 'Rounded frame corners', unit: 'mm', min: 0, max: 40, step: 1, def: 0, ends: ['Square', 'Round'], when: is('stand'),
    hint: 'Rounds the two top corners of the frame, seen from the front, like a bent sheet. The inside follows, so the wall stays even. Needs a wide border for big radii.' },

  { id: 'chamfer', group: 'shape', adv: true, label: 'Funnel at each hole', unit: 'mm', min: 0, max: 3, step: 0.1, def: 0.8, ends: ['None', 'Wide'],
    hint: 'A small slope at the top of each hole, so tubes find their way in' },
  { id: 'edge', group: 'shape', adv: true, label: 'Bevelled edges', unit: 'mm', min: 0, max: 3, step: 0.1, def: 0.6, ends: ['Sharp', 'Bevelled'], when: many,
    hint: 'A small 45° cut on the top and bottom edges. Nicer to hold, and it prints cleanly.' },
  { id: 'fillet', group: 'shape', adv: true, label: 'Rounded inside joints', unit: 'mm', min: 0, max: 10, step: 0.5, def: 3, when: is('stand'),
    hint: 'Rounds the corners where the plates meet the end walls, which is where a stand breaks first' },
  { id: 'trayWall', group: 'shape', adv: true, label: 'Wall between pockets', unit: 'mm', min: 0.8, max: 10, step: 0.1, def: 2, when: is('tray'),
    ends: ['Thin', 'Thick'], hint: 'Thicker walls are stronger but space the pockets further apart' },
  { id: 'floor', group: 'shape', adv: true, label: 'Floor thickness', unit: 'mm', min: 0.6, max: 10, step: 0.2, def: 2, when: is('tray', 'block'),
    hint: 'Under the deepest point of each hole' },
  { id: 'plateT', group: 'shape', adv: true, label: 'Plate thickness', unit: 'mm', min: 1.2, max: 10, step: 0.2, def: 4, when: is('stand'),
    hint: 'Thicker plates are stiffer' },
  { id: 'wallT', group: 'shape', adv: true, label: 'Wall thickness', unit: 'mm', min: 1.2, max: 10, step: 0.2, def: 4, when: is('stand'),
    hint: 'The two end walls the plates hang between, and any dividers' },
  { id: 'sleeveT', group: 'shape', adv: true, label: 'Sleeve wall', unit: 'mm', min: 1.2, max: 6, step: 0.2, def: 2.4, ends: ['Springy', 'Stiff'], when: is('single'),
    hint: 'Thinner fingers flex more; thicker ones hold tighter' },
  { id: 'baseT', group: 'shape', adv: true, label: 'Base thickness', unit: 'mm', min: 1.6, max: 8, step: 0.2, def: 3, when: is('single'),
    hint: 'Thicker is heavier and stiffer' },

  // ---- Extras ----
  { id: 'windows', group: 'extras', head: 'Viewing slots', label: 'Cut viewing slots', type: 'toggle', def: false, when: is('block', 'tray'),
    hint: 'An upright slot in the side at each hole. See how full a tube is without lifting it out, read a label, or let the light of a photometer through a cuvette.' },
  { id: 'windowSides', group: 'extras', label: 'Slots through', type: 'select', def: 'both', when: (f) => f.windows && is('block', 'tray')(f),
    options: {
      both: { label: 'Front and back', hint: 'Light passes straight through: needed for cuvettes, and easiest to see into.' },
      front: { label: 'Front only', hint: 'The back wall stays closed, which keeps the holder stiffer. Enough to check fill levels.' },
    } },
  { id: 'windowW', group: 'extras', label: 'Slot width', unit: '% of hole', min: 20, max: 90, step: 5, def: 60, ends: ['Narrow', 'Wide'],
    when: (f) => f.windows && is('block', 'tray')(f), hint: 'Wider shows more, narrower keeps more wall to hold the tube' },

  { id: 'dividers', group: 'extras', head: 'Dividers', label: 'A divider after every', type: 'select', def: 'none', when: is('stand'),
    hint: 'Inner walls that split the positions into groups, e.g. bays of three for triplicates. They also stiffen a long stand.',
    options: {
      none: { label: 'None', hint: 'One open bay' },
      two: { label: '2', hint: 'Bays of two positions' },
      three: { label: '3', hint: 'Bays of three positions' },
      four: { label: '4', hint: 'Bays of four positions' },
      six: { label: '6', hint: 'Bays of six positions' },
    } },
  { id: 'labels', group: 'extras', head: 'Position numbers', label: 'Numbering', type: 'select', def: 'none', when: is('stand'),
    options: {
      none: { label: 'None', hint: 'No numbering' },
      pads: { label: 'Sticker pads', hint: 'A round pad at the front of each position, for a numbered sticker or a marker' },
      digits: { label: 'Printed numbers', hint: 'Numbers 1, 2, 3 … cut into a pad at the front of each position. Read from the front, no stickers needed.' },
    } },
  { id: 'labelD', group: 'extras', label: 'Pad size', unit: 'mm', min: 6, max: 20, step: 0.5, def: 10, when: (f) => f.style === 'stand' && f.labels !== 'none',
    hint: 'Diameter of each pad. Match your stickers; 10 and 12 mm are common.' },

  { id: 'pushHole', group: 'extras', head: 'Base', label: 'Push-out hole', type: 'toggle', def: true, when: is('single'),
    hint: 'A hole under the tube: push a tight tube up from below with a finger or pen. Spills drain out too.' },

  { id: 'basePlate', group: 'extras', head: 'Base plate', label: 'Separate base plate', type: 'toggle', def: false, when: is('stand'),
    hint: 'A flat plate that reaches out in front of and behind the stand, so a tall stand does not tip. The stand drops into a shallow pocket in it. It is printed flat, beside the stand, so the stand itself still prints lying on its front.' },
  { id: 'plateReach', group: 'extras', label: 'Reaches out', unit: 'mm', min: 5, max: 60, step: 1, def: 15, ends: ['Less', 'More'], when: plated,
    hint: 'How far the plate reaches out in front of and behind the stand. Further is steadier but takes more bench space.' },

  { id: 'feet', group: 'extras', head: 'Underside', label: 'Feet', type: 'select', def: 'none', cards: true, when: (f) => many(f) && !plated(f),
    options: {
      none: { label: 'Flat', hint: 'Sits flat on the bench. Simplest to print.' },
      stack: { label: 'Stacking feet', hint: 'Four short feet underneath and matching pockets in the top: empty holders stack neatly on each other. Lifts the holder by 2.5 mm.' },
      pads: { label: 'Rubber feet', hint: 'Four shallow round recesses underneath for stick-on rubber feet (bumpons), so the holder does not slide or rattle.' },
    } },
  { id: 'padD', group: 'extras', label: 'Rubber foot diameter', unit: 'mm', min: 6, max: 25, step: 0.5, def: 10, when: (f) => f.feet === 'pads' && many(f) && !plated(f),
    hint: 'As printed on the pack; 8, 10 and 12.7 mm are common. The recesses come out 0.5 mm wider so the feet press in easily.' },

  // ---- Printing ----
  { id: 'material', group: 'print', head: 'Material', label: 'Filament', type: 'select', def: 'pla',
    hint: 'Only changes the weight estimate. PLA is fine for most racks; PETG or PP if it goes in a water bath.',
    options: { pla: { label: 'PLA', density: 1.24 }, petg: { label: 'PETG', density: 1.27 }, abs: { label: 'ABS/ASA', density: 1.05 }, pp: { label: 'PP', density: 0.9 } } },
  { id: 'printDir', group: 'print', label: 'Way up on the printer', type: 'select', def: 'auto', when: many,
    options: {
      auto: { label: 'Best', hint: 'The tool picks the way up that needs no support' },
      upright: { label: 'Upright', hint: 'Standing as shown, openings facing up' },
      side: { label: 'On its side', hint: 'Lying on one long side, openings facing sideways' },
    } },
  // The printer: in the printer box at the top of the right-hand panel (group 'printer' is not a tab).
  { id: 'printer', group: 'printer', label: 'Your printer', type: 'select', def: 'ender', options: PRINTERS,
    hint: 'Sets the size of the print bed. Not in the list? Choose Other and type it in.' },
  { id: 'bedX', group: 'printer', label: 'Bed width', unit: 'mm', min: 100, max: 500, step: 5, def: 220, when: (f) => f.printer === 'other',
    hint: 'From your printer’s specs' },
  { id: 'bedY', group: 'printer', label: 'Bed depth', unit: 'mm', min: 100, max: 500, step: 5, def: 220, when: (f) => f.printer === 'other' },
  { id: 'bedZ', group: 'printer', label: 'Highest print', unit: 'mm', min: 100, max: 500, step: 5, def: 250, when: (f) => f.printer === 'other' },

  { id: 'infill', group: 'print', adv: true, label: 'Infill', unit: '%', min: 5, max: 100, step: 5, def: 15, ends: ['Light', 'Solid'],
    hint: 'How solid the inside is printed. 15 % is plenty for a rack.' },
  { id: 'nozzle', group: 'print', adv: true, label: 'Nozzle size', unit: 'mm', min: 0.2, max: 1.2, step: 0.05, def: 0.4,
    hint: '0.4 mm on most printers. Used to check that walls are thick enough.' },
  { id: 'printShape', group: 'print', adv: true, label: 'Printer-friendly holes', type: 'toggle', def: true, when: many,
    hint: 'Teardrop holes and pointed slot tops, so nothing has to bridge a gap or sag' },
];

export const shownFor = (d, flat) => !d.when || d.when(flat);

export function defaults() {
  return Object.fromEntries(PARAMS.map((d) => [d.id, d.def]));
}

/** Turns anything (share link, saved design, file) into a full, in-range design. */
export function sanitize(obj) {
  const p = defaults();
  if (!obj || typeof obj !== 'object') return p;
  for (const d of PARAMS) {
    const v = obj[d.id];
    if (v === undefined || v === null) continue;
    if (d.type === 'toggle') p[d.id] = v === true || v === '1' || v === 'true';
    else if (d.type === 'select') {
      if (Object.hasOwn(d.options, String(v))) p[d.id] = String(v);
    } else {
      const n = Number(v);
      if (v !== '' && isFinite(n)) p[d.id] = Math.min(d.max, Math.max(d.min, n));
    }
  }
  // A link or file from before the printer menu that has its own bed size keeps it.
  if (obj.printer === undefined && ['bedX', 'bedY', 'bedZ'].some((k) => obj[k] !== undefined && p[k] !== defaults()[k])) p.printer = 'other';
  return p;
}

export function toQuery(p) {
  const q = new URLSearchParams();
  for (const d of PARAMS) {
    if (p[d.id] !== d.def) q.set(d.id, d.type === 'toggle' ? (p[d.id] ? '1' : '0') : String(p[d.id]));
  }
  return q.toString();
}
export const fromQuery = (str) => sanitize(Object.fromEntries(new URLSearchParams(str)));

const round = (v, digits = 2) => Number(v.toFixed(digits));

/**
 * A single stand: one sleeve on a wide base. Origin at the centre, z = 0 on the table.
 *
 *   baseT   base thickness; the sleeve's bore has its floor on top of it
 *   sleeveR outer radius of the sleeve (round, also around a square opening)
 *   hubR    the solid disc under the sleeve that the spokes start from
 *   rest    where the tube's bottom sits; with cone ribs it hangs above the floor
 *   seatZ   top of the cone ribs, where they touch the cone
 */
function resolveSingle(r, p) {
  const v = r.v;
  const L = v.length;
  const rb = v.body / 2;
  r.cols = r.rows = r.count = 1;
  r.fitBox = false;
  r.boxFits = true;
  r.pitchX = r.pitchY = round(r.hole + 10);
  r.gapX = r.gapY = 10;
  r.spanX = r.spanY = 0;
  r.baseT = p.baseT;
  r.sleeveR = round((v.shape === 'square' ? r.hole / Math.SQRT2 : r.hole / 2) + p.sleeveT);

  // Cone ribs reach in to 0.55 of the body radius. The drawn tube narrows from its body to a
  // tip of a quarter of that radius over the cone's length, so it touches the ribs 0.4 cone
  // lengths above its tip; the tip then hangs 2 mm above the floor.
  r.coneTabs = p.coneSeat && v.shape === 'round' && v.cone > 0;
  r.tabR = round(rb * 0.55);
  r.rest = round(r.baseT + (r.coneTabs ? 2 : 0));
  r.seatZ = r.coneTabs ? round(r.rest + (v.cone * (0.55 - 0.25)) / (1 - 0.25)) : r.rest;

  // Height: the tube sinks in about 45 % of its length (12 to 70 mm), the rest stays free to grab.
  if (p.autoHeight) r.height = Math.round(r.rest + Math.min(70, Math.max(12, L * 0.45)));
  r.height = Math.max(r.height, round(r.seatZ + 6));
  r.depth = round(r.height - r.rest);
  r.seat = r.rest;
  r.stickOut = round(r.rest + L - r.height);

  // Base: by default as wide as 0.9 times the height of the loaded stand, so a knock does not
  // tip it; never narrower than the sleeve with 12 mm all round.
  r.hubR = round(r.sleeveR + 5);
  const least = 2 * r.sleeveR + 24;
  r.baseD = p.autoBase ? Math.max(Math.ceil(least), Math.round(0.9 * (r.rest + L))) : Math.max(p.baseD, Math.ceil(2 * r.hubR + 4));
  r.ringW = 6;
  r.spokeW = 6;
  r.ringFits = r.baseD / 2 - r.ringW > r.hubR + 4;
  r.baseRing = p.base === 'ring' && r.ringFits;
  // A 45° collar where the sleeve meets the base: stiffens the joint, prints without support.
  r.collar = round(Math.max(0, Math.min(4, r.hubR - r.sleeveR - 0.5)));

  // Fingers: slots from just above the collar to the top.
  r.slots = Number(p.grip);
  r.slotW = round(Math.max(2, 4 * p.nozzle + 0.4));
  r.slotLo = round(r.baseT + r.collar + 2);
  // Below 3 mm it would only clog; then there is none.
  r.pushD = p.pushHole ? round(Math.min(8, r.coneTabs ? 2 * r.tabR - 2 : r.hole * 0.5)) : 0;
  if (r.pushD < 3) r.pushD = 0;

  r.sizeX = r.sizeY = r.outerX = r.outerY = r.benchX = r.benchY = r.baseD;
  r.outerZ = r.benchZ = r.height;
  r.basePlate = false;
  r.marginX = r.marginY = round((r.baseD - r.hole) / 2);
  r.cornerR = r.baseD / 2;
  r.footH = 0;
  r.feet = 'none';
  r.windows = r.hasWindows = r.slotFrontOnly = r.peakWindows = false;
  r.edgeC = r.filletR = 0;
  r.printUp = 'z';
  r.tearOpenings = false;
  r.tearExtra = 0;
  r.chamferC = Math.floor(100 * Math.max(0, Math.min(p.chamfer, p.sleeveT * 0.5, r.depth * 0.8)) + 1e-6) / 100;
  r.divXs = [];
  r.labelsOn = false;
  r.frameRC = 0;
  return r;
}

/**
 * Everything the builder and the readouts need, worked out from the design:
 * the vessel's sizes, the opening, the spacing, the outer size and the heights.
 */
export function resolve(p) {
  const r = { ...p };
  // A printer from the list brings its bed; "Other" uses the sizes typed in.
  if (PRINTERS[p.printer]?.bed) [r.bedX, r.bedY, r.bedZ] = PRINTERS[p.printer].bed;
  const v = VESSELS[p.vessel];
  r.v = v.custom
    ? { label: v.label, shape: v.shape, body: p.customSize, hole: p.customSize + 0.5, top: p.customSize, length: p.customLength,
        pitch: round(p.customSize + 0.5 + Math.max(3, p.customSize * 0.2), 1), cone: 0 }
    : v;
  r.hole = round(r.v.hole + p.fit);
  if (p.style === 'single') return resolveSingle(r, p);

  // Spacing: a tray packs pockets wall to wall; the others use the vessel's usual rack spacing.
  if (p.style === 'tray') {
    r.pitchX = r.pitchY = round(Math.max(r.hole, r.v.top) + p.trayWall);
  } else if (p.autoSpacing) {
    r.pitchX = r.pitchY = r.v.pitch;
  }
  r.gapX = round(r.pitchX - r.hole);
  r.gapY = round(r.pitchY - r.hole);

  // Heights. By default a block is two thirds as tall as the vessel, on the floor (2 mm unless
  // changed), a tray takes about a third of it, and a stand is tall enough for the vessel to stand
  // in it with its top sticking out to grab.
  const L = r.v.length;
  if (p.style === 'stand') {
    // Standing on the bottom plate, the top fifth shows. Hanging by the rim (about 8 mm of cap
    // above the plate), the stand must be taller than the vessel so the tip clears the table.
    if (p.autoHeight) r.height = p.standFloor ? Math.round(L - Math.max(12, Math.min(25, L * 0.2)) + p.plateT) : Math.round(L);
    r.height = Math.max(r.height, 3 * p.plateT + 6);
    r.depth = p.standFloor ? r.height - p.plateT : r.height;
    r.seat = p.standFloor ? p.plateT : null; // null: hangs by its rim
  } else {
    if (p.autoHeight && p.style === 'tray') {
      r.depth = Math.round(Math.min(L * 0.35, 20));
      r.height = round(r.depth + p.floor);
    } else if (p.autoHeight) {
      r.height = Math.max(Math.round((L * 2) / 3), Math.ceil(p.floor + 3));
      r.depth = round(r.height - p.floor);
    }
    r.depth = Math.min(r.depth, r.height - p.floor);
    r.seat = round(r.height - r.depth);
  }

  const endWalls = p.style === 'stand' ? 2 * p.wallT : 0;
  r.marginX = r.marginY = p.margin;
  if (p.fitBox) {
    // As many positions as fit, then the margins grow so the holder fills the box.
    const availX = p.boxX - 2 * p.boxGap;
    const availY = p.boxY - 2 * p.boxGap;
    r.cols = Math.min(24, Math.floor((availX - r.hole - 2 * p.margin - endWalls) / r.pitchX) + 1);
    r.rows = Math.min(12, Math.floor((availY - r.hole - 2 * p.margin) / r.pitchY) + 1);
    r.boxFits = r.cols >= 1 && r.rows >= 1;
    r.cols = Math.max(1, r.cols);
    r.rows = Math.max(1, r.rows);
    if (r.boxFits) {
      r.marginX = round((availX - (r.cols - 1) * r.pitchX - r.hole - endWalls) / 2);
      r.marginY = round((availY - (r.rows - 1) * r.pitchY - r.hole) / 2);
    }
  }
  r.spanX = (r.cols - 1) * r.pitchX;
  r.spanY = (r.rows - 1) * r.pitchY;
  r.sizeX = round(r.spanX + r.hole + 2 * r.marginX + endWalls);
  r.sizeY = round(r.spanY + r.hole + 2 * r.marginY);
  r.cornerR = Math.min(p.corner, r.sizeX / 2 - 0.1, r.sizeY / 2 - 0.1);
  // How far the vessel sticks out of the top, and where its bottom rests.
  r.rest = r.seat === null ? r.height - (L - 8) : r.seat;
  r.stickOut = round(r.rest + L - r.height);
  r.count = r.cols * r.rows;

  // ---- extras ----
  // Stacking feet lift the holder; matching pockets in the top take the feet of the one above.
  r.footD = 8;
  // A separate base plate (stand only): the stand drops into a pocket in it, so it stands on the
  // plate's floor under the pocket, lifted by that much. The plate is the foot, so no other feet.
  r.basePlate = p.style === 'stand' && p.basePlate;
  r.basePlateT = 4;
  r.pocket = 1.6;
  r.plateRim = 3;
  r.plateFit = 0.3;
  r.plateReach = p.plateReach;
  if (r.basePlate) r.feet = 'none';
  r.footH = r.basePlate ? round(r.basePlateT - r.pocket) : r.feet === 'stack' ? 2.5 : 0;
  r.footInset = Math.max(5.5, r.cornerR * 0.7);
  r.padInset = p.padD / 2 + 2.5;
  // outer*: the part as it is printed (with a base plate, the stand alone); bench*: as it stands, plate included.
  r.outerX = r.sizeX;
  r.outerY = r.sizeY;
  r.outerZ = round(r.height + (r.basePlate ? 0 : r.footH));
  r.benchX = r.basePlate ? round(r.sizeX + 2 * r.plateRim) : r.outerX;
  r.benchY = r.basePlate ? round(r.sizeY + 2 * r.plateReach) : r.outerY;
  r.benchZ = round(r.height + r.footH);
  // Windows run from just above the floor of the opening to a band left under the top.
  r.windowW = round((r.hole * p.windowW) / 100);
  r.windowLo = round((r.seat ?? 0) + 2);
  r.windowHi = round(r.height - Math.max(4, p.chamfer + 3));
  r.hasWindows = p.windows && p.style !== 'stand' && r.windowHi - r.windowLo >= 4;
  r.slotFrontOnly = r.hasWindows && p.windowSides === 'front';

  // Bevel and fillet, held back where there is no room for them.
  const room = Math.min(r.marginX, r.marginY);
  r.edgeC = Math.max(0, Math.min(p.edge, room - 0.8, r.height / 4, r.feet === 'stack' ? 1.2 : Infinity,
    p.style === 'stand' ? Math.min(p.plateT, p.wallT) - 0.8 : Infinity));
  // Room for a fillet at the end walls: clear of the outermost openings, and of the next plate.
  const filletRoom = Math.max(0, Math.min(r.marginX - 0.6, (r.height - (p.standFloor ? 2 : 1) * p.plateT) / (p.guide ? 4.2 : 2.1)));
  r.filletR = p.style === 'stand' ? Math.min(p.fillet, filletRoom) : 0;

  // Rounded frame corners (stand, seen from the front): the outside is rounded by frameRC; inside,
  // the top joint gets a fillet of frameRC minus the wall, so the bend keeps its thickness. Held
  // to what the inside fillet has room for, so the arc ends before the outermost openings, and
  // clear of stacking pockets, which need a flat top.
  const bend = Math.min(p.wallT, p.plateT);
  const frameMax = p.style === 'stand'
    ? Math.min(filletRoom + bend, r.height / 2, r.sizeX / 4, r.feet === 'stack' ? Math.max(0, r.footInset - r.footD / 2 - 1) : Infinity)
    : 0;
  r.frameRC = Math.floor(10 * Math.max(0, Math.min(p.frameR, frameMax)) + 1e-6) / 10;
  r.topFilletR = r.frameRC > bend ? Math.max(r.filletR, r.frameRC - bend) : r.filletR;

  // Dividers: a wall in the middle of the gap after every n-th column.
  const every = { none: 0, two: 2, three: 3, four: 4, six: 6 }[p.dividers] || 0;
  r.divXs = [];
  if (p.style === 'stand' && every) {
    for (let i = every; i < r.cols; i += every) r.divXs.push(round((i - 0.5) * r.pitchX - r.spanX / 2));
  }
  r.divFits = r.gapX >= p.wallT + 1.2;
  r.divFilletR = Math.max(0, Math.min(r.filletR, (r.gapX - p.wallT) / 2 - 0.6));

  // Position numbers: a disc standing on the front edge of the bottom plate, flush with the front
  // face, one per column; printed numbers are cut 0.6 mm into it.
  r.labelsOn = p.style === 'stand' && p.labels !== 'none' && p.standFloor;
  r.labelD = round(Math.max(4, Math.min(p.labelD, r.pitchX - (r.divXs.length ? p.wallT : 0) - 1, r.height - p.plateT - 2)));
  r.labelT = round(Math.min(2.4, r.marginY - 0.6));
  r.digitH = round(r.labelD * 0.56);
  r.digitW = round(Math.max(0.8, 2 * p.nozzle));

  // ---- printing ----
  // A stand prints lying on a long side, so its plates stand upright; blocks and trays print as they stand.
  r.printUp = p.printDir === 'auto' ? (p.style === 'stand' ? 'y' : 'z') : p.printDir === 'side' ? 'y' : 'z';
  // Lying on its side, every round opening is a horizontal hole: a teardrop with its point up needs no bridge.
  r.tearOpenings = p.printShape && r.printUp === 'y' && r.v.shape === 'round';
  // Upright, a window's flat top would bridge: a 45° peak does not.
  r.peakWindows = p.printShape && r.printUp === 'z' && r.hasWindows;
  // The teardrop's point reaches 1.25 radii from the centre, a quarter radius past the round hole.
  r.tearExtra = r.tearOpenings ? round(r.hole / 8) : 0;

  // ---- funnel at the mouth ----
  // It follows the opening's shape (teardrop included) and is held back so it never cuts
  // through a thin plate, never meets the funnel of the next opening, and leaves a wall
  // next to the bevel on the outer edge.
  const pierced = p.style === 'stand' ? p.plateT * 0.5 : r.depth * 0.8;
  const between = Math.min(r.gapX, r.rows > 1 ? r.gapY - r.tearExtra : Infinity);
  const toEdge = Math.min(r.marginX, r.marginY - r.tearExtra) - r.edgeC;
  // Rounded down to 0.01 mm, so rounding never takes it past a limit.
  r.chamferC = Math.floor(100 * Math.max(0, Math.min(p.chamfer, pierced, (between - 0.6) / 2, toEdge - 0.6)) + 1e-6) / 100;
  return r;
}

/**
 * A step of the guide to a fix: the control (by parameter id) to take the user to, what to do
 * there, and, where it can be told, when that step is done: done(params, resolved). The page
 * (main.js) walks through the steps in order, skipping any whose control is hidden or which
 * are done, until the problem is gone.
 */
const step = (id, say, done) => ({ id, say, done });

/**
 * 'error' = cannot be built; 'warn' = builds but deserves a look.
 * Each problem has a `key` that stays the same while it lasts, and `fix`, the guide to fixing it.
 */
export function validate(r) {
  const out = [];
  const err = (key, text, ...fix) => out.push({ level: 'error', key, text, fix });
  const warn = (key, text, ...fix) => out.push({ level: 'warn', key, text, fix });
  const minWall = 2 * r.nozzle;
  if (r.style === 'single') return validateSingle(r, out, err, warn, minWall);

  // The usual ways there. A setting that only shows once its "usual" switch is off comes after that switch.
  const ownSpacing = step('autoSpacing', 'Switch this off to set the spacing yourself.', (p) => !p.autoSpacing);
  const spacingX = (say, done) => (r.style === 'tray' ? [step('trayWall', 'Make the walls between the pockets thicker.')] : [ownSpacing, step('pitchX', say, done)]);
  const spacingY = (say, done) => (r.style === 'tray' ? [step('trayWall', 'Make the walls between the pockets thicker.')] : [ownSpacing, step('pitchY', say, done)]);
  const spacing = (say) => (r.style === 'tray' ? spacingX(say) : [ownSpacing, step('pitchX', say), ...(r.rows > 1 ? [step('pitchY', say)] : [])]);
  const ownHeight = step('autoHeight', 'Switch this off to set the height yourself.', (p) => !p.autoHeight);
  const floorOn = step('standFloor', 'Switch the bottom plate on.', (p) => p.standFloor);

  if (r.gapX < 0.4 || (r.rows > 1 && r.gapY < 0.4)) {
    err('overlap', 'The holes overlap. Widen the spacing (Tubes › Fine-tuning).',
      ...spacingX('Widen the spacing left to right until the holes no longer overlap.', (p, q) => q.gapX >= 0.4),
      ...(r.rows > 1 ? [step('pitchY', 'Widen the spacing front to back as well.', (p, q) => q.gapY >= 0.4)] : []));
  } else {
    const gap = r.rows > 1 ? Math.min(r.gapX, r.gapY) : r.gapX;
    if (gap < minWall) {
      warn('thinGap', `Only ${gap.toFixed(1)} mm of material between holes; two nozzle widths (${minWall.toFixed(1)} mm) is the least that prints solidly.`,
        ...spacing(`Widen the spacing until there are ${minWall.toFixed(1)} mm between the holes.`));
    }
    const capGap = Math.min(r.pitchX, r.rows > 1 ? r.pitchY : Infinity) - r.v.top;
    if (capGap < 0) {
      warn('caps', `Neighbouring caps overlap by ${(-capGap).toFixed(1)} mm at this spacing: the tubes will not all fit side by side. Widen the spacing (Tubes › Fine-tuning).`,
        ...spacing(`Widen the spacing by at least ${Math.ceil(-capGap)} mm, so the caps fit side by side.`));
    } else if (capGap < 1.5 && r.v.top > r.hole) {
      warn('capsTouch', 'The caps almost touch at this spacing, which makes single tubes hard to grab.',
        ...spacing('A millimetre or two more makes single tubes easy to grab.'));
    }
  }
  if (Math.min(r.marginX, r.marginY) < minWall) {
    warn('border', `The border is thinner than two nozzle widths (${minWall.toFixed(1)} mm). Widen it (Tubes › Fine-tuning).`,
      step('margin', `Widen the border to at least ${minWall.toFixed(1)} mm.`));
  }
  if (r.tearOpenings) {
    const left = (r.rows > 1 ? Math.min(r.gapY, r.marginY) : r.marginY) - r.tearExtra;
    if (left < minWall) {
      const more = Math.ceil(minWall - left + 0.4);
      warn('tearPoint', `The teardrop points leave only ${Math.max(0, left).toFixed(1)} mm of material above each opening. Widen the spacing front to back or the border (Tubes › Fine-tuning) by ${more} mm.`,
        ...(r.rows > 1 && r.gapY < r.marginY ? spacingY(`Widen the spacing front to back by ${more} mm.`) : [step('margin', `Widen the border by ${more} mm.`)]),
        step('printShape', 'Or switch teardrops off; the tops of the holes then sag a little when printed.'));
    }
  }
  if (r.fitBox && !r.boxFits) {
    err('box', 'Not even one position fits this box with these margins. Enlarge the box or make the border narrower.',
      step('boxX', 'Enlarge the box: check the inside width.'), step('boxY', 'And the inside depth.'), step('margin', 'Or make the border narrower.'));
  }

  // Corner features need solid material: clear of the nearest opening by a small margin.
  const clearOf = (inset, radius) => {
    const dx = r.sizeX / 2 - inset - r.spanX / 2;
    const dy = r.sizeY / 2 - inset - r.spanY / 2;
    const h = r.hole / 2;
    // Distance from the feature's centre to the edge of the opening: to the square's nearest side or corner, or to the circle.
    const d = r.v.shape === 'square' ? Math.hypot(Math.max(dx - h, 0), Math.max(dy - h, 0)) : Math.hypot(dx, dy) - h;
    return d - radius;
  };
  if (r.feet === 'stack') {
    if (r.style === 'stand' && !r.standFloor) err('stackFloor', 'Stacking feet need the bottom plate to stand on. Switch it on (Shape).', floorOn);
    else if (clearOf(r.footInset, r.footD / 2 + 0.4) < 0.8) {
      const more = Math.ceil(0.8 - clearOf(r.footInset, r.footD / 2 + 0.4) + 0.5);
      err('stackCorners', `Stacking feet need solid corners: widen the border (Tubes › Fine-tuning) by about ${more} mm.`,
        step('margin', `Widen the border by about ${more} mm.`), step('feet', 'Or choose other feet.'));
    } else if (r.style === 'stand' && r.plateT < 4) {
      warn('stackPlate', 'The top plate is thin for the stacking pockets; 4 mm or more is better.', step('plateT', 'Make the plates 4 mm or thicker.'));
    }
  }
  if (r.feet === 'pads') {
    if (r.style === 'stand' && !r.standFloor) err('padsFloor', 'Stick-on feet need the bottom plate. Switch it on (Shape).', floorOn);
    else if (r.sizeX < 2 * r.padInset + r.padD || r.sizeY < 2 * r.padInset + r.padD * 0.2) {
      warn('padsSmall', 'The holder is small for four stick-on feet of this size.', step('padD', 'Pick smaller feet (the size is on the pack).'), step('feet', 'Or leave the feet off.'));
    } else if ((r.style === 'stand' ? r.plateT : r.seat) < 2) {
      warn('padsThin', 'The floor is thin where the foot recesses go; 2 mm or more is safer.',
        r.style === 'stand' ? step('plateT', 'Make the plates 2 mm or thicker.') : step('floor', 'Make the floor 2 mm or thicker.'));
    }
  }
  if (r.windows && r.style !== 'stand' && !r.hasWindows) {
    warn('slotsShallow', 'The holes are too shallow for viewing slots; none are cut.',
      ownHeight, step('depth', 'Make the holes deeper to make room for the slots.'), step('windows', 'Or switch the slots off.'));
  }
  if (r.chamfer - r.chamferC > 0.5) {
    warn('funnel', `There is only room for a ${r.chamferC.toFixed(1)} mm funnel at the holes (Shape › Fine-tuning); a wider one would cut into the next hole, the edge or through the plate.`,
      step('chamfer', `Set the funnel to ${r.chamferC.toFixed(1)} mm or less.`));
  }
  if (r.hasWindows && Math.min(r.marginY, r.rows > 1 ? r.gapY : Infinity) < 1.2) {
    warn('slotWalls', 'The walls the viewing slots are cut through are very thin.',
      ...(r.rows > 1 && r.gapY < r.marginY ? spacingY('Widen the spacing front to back.') : [step('margin', 'Widen the border.')]),
      step('windowW', 'Or make the slots narrower.'));
  }
  if (r.style !== 'stand' && r.depth < 3) err('shallow', 'The holes are too shallow to hold anything.', ownHeight, step('depth', 'Make the holes at least 3 mm deep.'));
  if (r.style === 'stand' && r.seat === null && r.v.top <= r.hole + 0.3) {
    err('fallThrough', 'Without a bottom plate the vessel hangs by its rim, but this one has no rim wider than the hole: it would fall through. Switch the bottom plate on (Shape).', floorOn);
  }
  if (r.seat === null && r.rest < 2) {
    err('reachTable', `Hanging by its rim, the tube reaches the table. Make the stand at least ${Math.ceil(r.v.length - 6)} mm tall or switch the bottom plate on (Shape).`,
      floorOn, ownHeight, step('height', `Or make the stand at least ${Math.ceil(r.v.length - 6)} mm tall.`));
  }
  if (r.stickOut < 7.5) {
    warn('grab', `Only ${Math.max(0, r.stickOut).toFixed(0)} mm of the tube shows above the holder, which is little to grab.`,
      ownHeight, r.style === 'stand' ? step('height', 'Make the stand lower, so more of the tube shows.') : step('depth', 'Make the holes shallower, so more of the tube shows.'));
  }
  if (r.style !== 'stand' && r.depth < Math.min(r.v.length * 0.2, 12) && r.v.length > 30) {
    warn('shallowTip', 'The holes are shallow for a tube this tall; it may tip over when knocked.', ownHeight, step('depth', 'Make the holes deeper.'));
  }
  const tall = r.height + r.footH + Math.max(0, r.stickOut);
  if (tall > 3.2 * Math.min(r.benchX, r.benchY)) {
    warn('tips', 'Loaded, this holder is more than three times as tall as its base is deep, so it tips easily. Add a row or widen the border.',
      ...(r.style === 'stand'
        ? [step('basePlate', 'Add a base plate: it reaches out in front and behind, so the stand stays this slim.', (p) => p.basePlate),
           step('plateReach', 'Let the plate reach out further, until this note goes away.')]
        : []),
      step('rows', r.style === 'stand' ? 'Or add a row.' : 'Add a row.'), step('margin', 'Or widen the border.'));
  }

  if (r.style === 'stand') {
    if (r.frameR - r.frameRC > 0.5) {
      if (r.feet === 'stack' && r.frameRC < 1) {
        warn('frameRound', 'Stacking feet need a flat top for their pockets, so the frame corners stay square.', step('feet', 'Choose other feet to round the corners.'));
      } else {
        warn('frameRound', `There is only room to round the frame corners by ${r.frameRC.toFixed(0)} mm. A wider border (Tubes › Fine-tuning) allows more.`,
          step('margin', 'Widen the border for rounder corners.'), step('frameR', `Or round them by ${r.frameRC.toFixed(0)} mm.`));
      }
    }
    if (r.divXs.length && !r.divFits) {
      err('dividerRoom', `There is not enough room between the positions for a ${r.wallT} mm divider. Widen the spacing left to right (Tubes › Fine-tuning) or make the walls thinner (Shape › Fine-tuning).`,
        ...spacingX('Widen the spacing left to right.', (p, q) => q.gapX >= q.wallT + 1.2), step('wallT', 'Or make the walls thinner.'), step('dividers', 'Or leave the dividers out.'));
    }
    if (r.dividers !== 'none' && !r.divXs.length) {
      warn('dividerFew', 'There are too few positions for dividers at this interval; none are added.', step('dividers', 'Pick a smaller interval, or none.'));
    }
    if (r.labels !== 'none' && !r.standFloor) warn('labelsFloor', 'Position numbers stand on the bottom plate. Switch it on (Shape) to get them.', floorOn);
    else if (r.labelsOn && r.labelT < 1.2) warn('labelsBorder', 'The border at the front is too narrow for number pads; widen it (Tubes › Fine-tuning).', step('margin', 'Widen the border to make room for the pads.'));
    else if (r.labelsOn && r.labels === 'digits' && r.digitH < 4) {
      warn('digitsSmall', 'The pads are small for printed numbers; they may come out hard to read. Use bigger pads or sticker pads.',
        step('labelD', 'Make the pads bigger.'), step('labels', 'Or use sticker pads.'));
    }
  }
  return out;
}

function validateSingle(r, out, err, warn, minWall) {
  const ownHeight = step('autoHeight', 'Switch this off to set the height yourself.', (p) => !p.autoHeight);
  if (r.stickOut < 7.5) {
    warn('grab', `Only ${Math.max(0, r.stickOut).toFixed(0)} mm of the tube shows above the sleeve, which is little to grab.`,
      ownHeight, step('height', 'Make the sleeve lower, so more of the tube shows.'));
  }
  if (r.base === 'ring' && !r.ringFits) {
    warn('ring', 'This base is too small for a spoked ring, so it is a solid disc. Widen the base (Shape) for a ring.',
      step('autoBase', 'Switch this off to set the base yourself.', (p) => !p.autoBase), step('baseD', 'Widen the base until it can be a ring.'), step('base', 'Or choose the solid disc.'));
  }
  if (r.pushHole && !r.pushD) warn('pushHole', 'This tube is too thin for a push-out hole; none is cut.', step('pushHole', 'Switch the push-out hole off.'));
  if (r.depth < Math.min(r.v.length * 0.2, 12)) warn('sleeveShort', 'The sleeve is short for a tube this tall; it may tip in the sleeve.', ownHeight, step('height', 'Make the sleeve taller.'));
  if (r.rest + r.v.length > 1.6 * r.baseD) {
    warn('narrowBase', 'The base is narrow for a tube this tall; the full stand tips easily. Switch on the usual base size (Shape).',
      step('autoBase', 'Switch the usual base size on.', (p) => p.autoBase), step('baseD', 'Or widen the base yourself.'));
  }
  if (r.sleeveT < minWall) warn('sleeveThin', `The sleeve wall is thinner than two nozzle widths (${minWall.toFixed(1)} mm).`, step('sleeveT', `Make the wall ${minWall.toFixed(1)} mm or thicker.`));
  if (r.slots && r.sleeveT > 3.2) warn('fingersThick', 'Fingers this thick hardly flex; a sleeve wall of 2 to 3 mm springs better.', step('sleeveT', 'Set the wall to 2 to 3 mm.'), step('grip', 'Or use a closed sleeve.'));
  if (r.slots && r.height - r.slotLo < 10) warn('fingersShort', 'The sleeve is too short for springy fingers.', ownHeight, step('height', 'Make the sleeve taller.'), step('grip', 'Or use a closed sleeve.'));
  if (r.chamfer - r.chamferC > 0.5) {
    warn('funnel', `There is only room for a ${r.chamferC.toFixed(1)} mm funnel at the top of the sleeve (Shape › Fine-tuning).`, step('chamfer', `Set the funnel to ${r.chamferC.toFixed(1)} mm or less.`));
  }
  return out;
}

/** A fit value as printed on the test strip: "0", "+0.15", "-0.3". */
export const fitLabel = (v) => (Math.abs(v) < 1e-9 ? '0' : (v > 0 ? '+' : '-') + String(Number(Math.abs(v).toFixed(2))));

/**
 * The hole fit test: a short strip with five holes, from 0.3 mm tighter to 0.3 mm looser than the
 * current "Hole fit" in steps of 0.15 (held inside that setting's range), each with its fit value
 * cut into the top in front of it. The holes are the holder's own: same shape, funnel and, for a
 * holder printed on its side, teardrops and the same way up. Origin at the centre, z = 0 on the table.
 */
export function fitTest(p) {
  const r = resolve(p);
  const d = PARAMS.find((x) => x.id === 'fit');
  const centre = Math.min(d.max - 0.3, Math.max(d.min + 0.3, p.fit));
  const fits = [-0.3, -0.15, 0, 0.15, 0.3].map((s) => round(centre + s));
  const holes = fits.map((f) => round(r.v.hole + f));
  const big = Math.max(...holes);
  const across = big; // a square opening is `hole` wide across its flat sides, as a round one
  const gap = round(Math.max(3, 2 * r.nozzle + 1.6));
  const pitch = round(across + gap);
  const labels = fits.map(fitLabel);
  // Label size: a label is as wide as its glyphs (2 units, a dot 1) and the gaps between them
  // (0.9), a unit a quarter of the height. Where one row is too tight, they alternate between two.
  const units = Math.max(...labels.map((t) => [...t].reduce((s, ch) => s + (ch === '.' ? 1 : 2), 0) + 0.9 * (t.length - 1)));
  let rows = 1;
  let digitH = Math.min(5, ((pitch - 1.5) / units) * 4);
  if (digitH < 3.5) {
    rows = 2;
    digitH = Math.min(5, ((2 * pitch - 1.5) / units) * 4);
  }
  digitH = round(digitH, 1);
  const margin = 3;
  const tear = r.tearOpenings;
  const tearExtra = tear ? round(big / 8) : 0;
  const band = round(rows * (digitH + 1.5) + 1);
  const sizeX = round(4 * pitch + across + 2 * margin);
  const sizeY = round(across + tearExtra + 2 * margin + band);
  const holeY = round(sizeY / 2 - margin - tearExtra - across / 2);
  const xs = fits.map((_, i) => round((i - 2) * pitch));
  // Row 0 is next to the holes; with two rows the odd labels go in the row in front of it.
  const labelY = fits.map((_, i) => round(-sizeY / 2 + band - 1 - digitH / 2 - (rows === 2 && i % 2 ? digitH + 1.5 : 0)));
  return {
    v: r.v, fits, holes, labels, xs, labelY, pitch, rows, digitH,
    digitW: round(Math.max(0.8, 2 * r.nozzle)),
    sizeX, sizeY, holeY, H: 8, tear, tearExtra,
    chamferC: Math.min(r.chamferC, 1, gap / 2 - 0.4),
    printUp: r.printUp,
  };
}

/** What decides the shape (print settings and labels do not). */
export function shapeKey(r) {
  const skip = new Set(['nozzle', 'material', 'infill', 'printer', 'bedX', 'bedY', 'bedZ', 'printDir', 'printShape']);
  const o = {};
  for (const d of PARAMS) if (!skip.has(d.id)) o[d.id] = r[d.id];
  return JSON.stringify([o, r.hole, r.pitchX, r.pitchY, r.height, r.depth, r.cols, r.rows, r.sizeX, r.sizeY, r.tearOpenings, r.peakWindows, r.chamferC, r.slotFrontOnly, r.edgeC, r.filletR, r.frameRC, r.topFilletR, r.divXs, r.labelsOn, r.labelD, r.labelT, r.baseD, r.coneTabs, r.seatZ]);
}
