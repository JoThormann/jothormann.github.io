// The single description of a holder. Controls, defaults, validation and
// share links are generated from this list. Lengths in mm.
import { VESSELS } from './vessels.js';

export const STYLES = {
  block: { label: 'Solid block' },
  stand: { label: 'Open stand' },
  tray: { label: 'Tray' },
};

export const GROUPS = [
  { id: 'vessel', label: 'Vessel' },
  { id: 'grid', label: 'Grid' },
  { id: 'body', label: 'Holder' },
  { id: 'extras', label: 'Extras' },
  { id: 'print', label: 'Printing' },
];

const custom = (f) => Boolean(VESSELS[f.vessel].custom);
const manual = (f) => !f.autoSpacing;
const is = (...styles) => (f) => styles.includes(f.style);

export const PARAMS = [
  { id: 'style', type: 'select', options: STYLES, def: 'block' },

  { id: 'vessel', group: 'vessel', label: 'Made for', type: 'select', options: VESSELS, def: 't15' },
  { id: 'customSize', group: 'vessel', label: 'Diameter or side', unit: 'mm', min: 3, max: 120, step: 0.1, def: 20, when: custom,
    hint: 'Outer size of the vessel where the holder grips it' },
  { id: 'customLength', group: 'vessel', label: 'Vessel height', unit: 'mm', min: 5, max: 250, step: 1, def: 60, when: custom },
  { id: 'fit', group: 'vessel', label: 'Fit', unit: 'mm', min: -0.5, max: 2, step: 0.05, def: 0,
    hint: 'Added to the opening: more for a looser fit, less for a tighter one' },

  { id: 'fitBox', group: 'grid', label: 'Fill a box', type: 'toggle', def: false,
    hint: 'Give the inside of a freezer box, bath or drawer and get as many positions as fit' },
  { id: 'boxX', group: 'grid', label: 'Box inside width', unit: 'mm', min: 20, max: 600, step: 1, def: 130, when: (f) => f.fitBox },
  { id: 'boxY', group: 'grid', label: 'Box inside depth', unit: 'mm', min: 20, max: 600, step: 1, def: 130, when: (f) => f.fitBox },
  { id: 'boxGap', group: 'grid', label: 'Clearance all round', unit: 'mm', min: 0, max: 10, step: 0.5, def: 1, when: (f) => f.fitBox },
  { id: 'cols', group: 'grid', label: 'Across', unit: '', min: 1, max: 24, step: 1, def: 6, when: (f) => !f.fitBox },
  { id: 'rows', group: 'grid', label: 'Deep', unit: '', min: 1, max: 12, step: 1, def: 2, when: (f) => !f.fitBox },
  { id: 'autoSpacing', group: 'grid', label: 'Usual spacing for this vessel', type: 'toggle', def: true },
  { id: 'pitchX', group: 'grid', label: 'Spacing across', unit: 'mm', min: 4, max: 150, step: 0.5, def: 20, when: manual,
    hint: 'Centre to centre' },
  { id: 'pitchY', group: 'grid', label: 'Spacing deep', unit: 'mm', min: 4, max: 150, step: 0.5, def: 20, when: manual },
  { id: 'margin', group: 'grid', label: 'Edge margin', unit: 'mm', min: 1, max: 30, step: 0.5, def: 4,
    hint: 'From the outermost openings to the edge' },

  { id: 'autoHeight', group: 'body', label: 'Usual height for this vessel', type: 'toggle', def: true },
  { id: 'height', group: 'body', label: 'Height', unit: 'mm', min: 5, max: 200, step: 1, def: 50, when: (f) => !f.autoHeight },
  { id: 'depth', group: 'body', label: 'Opening depth', unit: 'mm', min: 2, max: 190, step: 1, def: 20,
    when: (f) => !f.autoHeight && f.style !== 'stand' },
  { id: 'corner', group: 'body', label: 'Corner radius', unit: 'mm', min: 0, max: 20, step: 0.5, def: 4 },
  { id: 'edge', group: 'body', label: 'Bevel on the outer edges', unit: 'mm', min: 0, max: 3, step: 0.1, def: 0.6,
    hint: 'Top and bottom edges. A 45° bevel prints cleanly in any position; a rounded edge would sag' },
  { id: 'fillet', group: 'body', label: 'Fillet inside the frame', unit: 'mm', min: 0, max: 10, step: 0.5, def: 3, when: is('stand'),
    hint: 'Rounds the joints between plates and end walls, where a stand breaks first' },
  { id: 'chamfer', group: 'body', label: 'Lead-in at the opening', unit: 'mm', min: 0, max: 3, step: 0.1, def: 0.8,
    hint: 'A small funnel so vessels find their place' },
  { id: 'trayWall', group: 'body', label: 'Wall between pockets', unit: 'mm', min: 0.8, max: 10, step: 0.1, def: 2, when: is('tray') },
  { id: 'floor', group: 'body', label: 'Floor thickness', unit: 'mm', min: 0.6, max: 10, step: 0.2, def: 2, when: is('tray', 'block') },
  { id: 'plateT', group: 'body', label: 'Plate thickness', unit: 'mm', min: 1.2, max: 10, step: 0.2, def: 4, when: is('stand') },
  { id: 'wallT', group: 'body', label: 'End wall thickness', unit: 'mm', min: 1.2, max: 10, step: 0.2, def: 4, when: is('stand') },
  { id: 'standFloor', group: 'body', label: 'Bottom plate', type: 'toggle', def: true, when: is('stand'),
    hint: 'The vessels stand on it; without it they hang by their rim' },
  { id: 'guide', group: 'body', label: 'Second plate half-way down', type: 'toggle', def: false, when: is('stand'),
    hint: 'Keeps long tubes upright' },

  { id: 'handles', group: 'extras', label: 'Handles at the ends', type: 'select', def: 'none',
    options: { none: { label: 'None' }, lip: { label: 'Grip lips' }, loop: { label: 'Finger loops' } } },
  { id: 'handleLen', group: 'extras', label: 'Handle reach', unit: 'mm', min: 6, max: 40, step: 1, def: 20, when: (f) => f.handles !== 'none',
    hint: 'How far each handle sticks out' },
  { id: 'windows', group: 'extras', label: 'Windows in the long sides', type: 'toggle', def: false, when: (f) => f.style !== 'stand',
    hint: 'A slot at each position, to see fill levels or for the light path of a cuvette' },
  { id: 'windowW', group: 'extras', label: 'Window width', unit: '% of opening', min: 20, max: 90, step: 5, def: 60,
    when: (f) => f.windows && f.style !== 'stand' },
  { id: 'feet', group: 'extras', label: 'Underside', type: 'select', def: 'none',
    options: { none: { label: 'Plain' }, stack: { label: 'Stacking feet' }, pads: { label: 'Recesses for stick-on feet' } } },
  { id: 'padD', group: 'extras', label: 'Stick-on foot diameter', unit: 'mm', min: 6, max: 25, step: 0.5, def: 10, when: (f) => f.feet === 'pads' },

  { id: 'printDir', group: 'print', label: 'Printed', type: 'select', def: 'auto',
    options: { auto: { label: 'Best way up (automatic)' }, upright: { label: 'Upright, openings up' }, side: { label: 'Lying on a long side' } } },
  { id: 'printShape', group: 'print', label: 'Shape cut-outs for printing', type: 'toggle', def: true,
    hint: 'Teardrop holes and peaked windows, so nothing has to bridge or sag' },
  { id: 'nozzle', group: 'print', label: 'Nozzle', unit: 'mm', min: 0.2, max: 1.2, step: 0.05, def: 0.4 },
  { id: 'material', group: 'print', label: 'Filament', type: 'select', def: 'pla',
    options: { pla: { label: 'PLA', density: 1.24 }, petg: { label: 'PETG', density: 1.27 }, abs: { label: 'ABS / ASA', density: 1.05 }, pp: { label: 'PP', density: 0.9 } } },
  { id: 'infill', group: 'print', label: 'Infill', unit: '%', min: 5, max: 100, step: 5, def: 15 },
  { id: 'bedX', group: 'print', label: 'Bed width', unit: 'mm', min: 100, max: 500, step: 5, def: 220 },
  { id: 'bedY', group: 'print', label: 'Bed depth', unit: 'mm', min: 100, max: 500, step: 5, def: 220 },
  { id: 'bedZ', group: 'print', label: 'Print height', unit: 'mm', min: 100, max: 500, step: 5, def: 250 },
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
 * Everything the builder and the readouts need, worked out from the design:
 * the vessel's sizes, the opening, the spacing, the outer size and the heights.
 */
export function resolve(p) {
  const r = { ...p };
  const v = VESSELS[p.vessel];
  r.v = v.custom
    ? { label: v.label, shape: v.shape, body: p.customSize, hole: p.customSize + 0.5, top: p.customSize, length: p.customLength,
        pitch: round(p.customSize + 0.5 + Math.max(3, p.customSize * 0.2), 1), cone: 0 }
    : v;
  r.hole = round(r.v.hole + p.fit);

  // Spacing: a tray packs pockets wall to wall; the others use the vessel's usual rack spacing.
  if (p.style === 'tray') {
    r.pitchX = r.pitchY = round(Math.max(r.hole, r.v.top) + p.trayWall);
  } else if (p.autoSpacing) {
    r.pitchX = r.pitchY = r.v.pitch;
  }
  r.gapX = round(r.pitchX - r.hole);
  r.gapY = round(r.pitchY - r.hole);

  // Heights. By default a block or tray takes about half of a short vessel and
  // a third of a long one; a stand is tall enough for the vessel to stand in it
  // with its top sticking out to grab.
  const L = r.v.length;
  if (p.style === 'stand') {
    // Standing on the bottom plate, the top fifth shows. Hanging by the rim (about 8 mm of cap
    // above the plate), the stand must be taller than the vessel so the tip clears the table.
    if (p.autoHeight) r.height = p.standFloor ? Math.round(L - Math.max(12, Math.min(25, L * 0.2)) + p.plateT) : Math.round(L);
    r.height = Math.max(r.height, 3 * p.plateT + 6);
    r.depth = p.standFloor ? r.height - p.plateT : r.height;
    r.seat = p.standFloor ? p.plateT : null; // null: hangs by its rim
  } else {
    if (p.autoHeight) {
      r.depth = Math.round(p.style === 'tray' ? Math.min(L * 0.35, 20) : Math.max(8, Math.min(L * 0.5, 45)));
      r.height = round(r.depth + (p.style === 'tray' ? p.floor : Math.max(p.floor, Math.min(12, r.depth * 0.6))));
    }
    r.depth = Math.min(r.depth, r.height - p.floor);
    r.seat = round(r.height - r.depth);
  }

  const endWalls = p.style === 'stand' ? 2 * p.wallT : 0;
  r.handleLen = p.handles === 'none' ? 0 : p.handleLen;
  r.marginX = r.marginY = p.margin;
  if (p.fitBox) {
    // As many positions as fit, then the margins grow so the holder fills the box.
    const availX = p.boxX - 2 * p.boxGap - 2 * r.handleLen;
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
  r.footH = p.feet === 'stack' ? 2.5 : 0;
  r.footInset = Math.max(5.5, r.cornerR * 0.7);
  r.padInset = p.padD / 2 + 2.5;
  r.outerX = round(r.sizeX + 2 * r.handleLen);
  r.outerY = r.sizeY;
  r.outerZ = round(r.height + r.footH);
  // Finger loops: a ring with a 3.2 mm wall, 2 mm of it sunk into the end of the holder.
  r.loopR = (r.handleLen + 2) / 2;
  r.loopHole = round(2 * (r.loopR - 3.2));
  // Windows run from just above the floor of the opening to a band left under the top.
  r.windowW = round((r.hole * p.windowW) / 100);
  r.windowLo = round((r.seat ?? 0) + 2);
  r.windowHi = round(r.height - Math.max(4, p.chamfer + 3));
  r.hasWindows = p.windows && p.style !== 'stand' && r.windowHi - r.windowLo >= 4;

  // Bevel and fillet, held back where there is no room for them.
  const room = Math.min(r.marginX, r.marginY);
  r.edgeC = Math.max(0, Math.min(p.edge, room - 0.8, r.height / 4, p.feet === 'stack' ? 1.2 : Infinity,
    p.style === 'stand' ? Math.min(p.plateT, p.wallT) - 0.8 : Infinity));
  r.filletR = p.style === 'stand'
    ? Math.max(0, Math.min(p.fillet, r.marginX - 0.6, (r.height - (p.standFloor ? 2 : 1) * p.plateT) / (p.guide ? 4.2 : 2.1)))
    : 0;

  // ---- printing ----
  // A stand prints lying on a long side, so its plates stand upright; blocks and trays print as they stand.
  r.printUp = p.printDir === 'auto' ? (p.style === 'stand' ? 'y' : 'z') : p.printDir === 'side' ? 'y' : 'z';
  // Lying on its side, every round opening is a horizontal hole: a teardrop with its point up needs no bridge.
  r.tearOpenings = p.printShape && r.printUp === 'y' && r.v.shape === 'round';
  // Upright, a window's flat top would bridge: a 45° peak does not. Finger-loop holes get a teardrop.
  r.peakWindows = p.printShape && r.printUp === 'z' && r.hasWindows;
  r.tearLoops = p.printShape && r.printUp === 'z' && p.handles === 'loop';
  // The teardrop's point reaches 1.25 radii from the centre, a quarter radius past the round hole.
  r.tearExtra = r.tearOpenings ? round(r.hole / 8) : 0;
  return r;
}

/** 'error' = cannot be built; 'warn' = builds but deserves a look. */
export function validate(r) {
  const out = [];
  const err = (text) => out.push({ level: 'error', text });
  const warn = (text) => out.push({ level: 'warn', text });
  const minWall = 2 * r.nozzle;

  if (r.gapX < 0.4 || (r.rows > 1 && r.gapY < 0.4)) err('The openings overlap. Increase the spacing.');
  else {
    const gap = r.rows > 1 ? Math.min(r.gapX, r.gapY) : r.gapX;
    if (gap < minWall) warn(`Only ${gap.toFixed(1)} mm of material between openings; two nozzle widths (${minWall.toFixed(1)} mm) is the least that prints solidly.`);
    const capGap = Math.min(r.pitchX, r.rows > 1 ? r.pitchY : Infinity) - r.v.top;
    if (capGap < 0) warn(`Neighbouring caps overlap by ${(-capGap).toFixed(1)} mm at this spacing: the vessels will not all fit side by side.`);
    else if (capGap < 1.5 && r.v.top > r.hole) warn('The caps almost touch at this spacing, which makes single vessels hard to grab.');
  }
  if (Math.min(r.marginX, r.marginY) < minWall) warn(`The edge margin is thinner than two nozzle widths (${minWall.toFixed(1)} mm).`);
  if (r.tearOpenings) {
    const left = (r.rows > 1 ? Math.min(r.gapY, r.marginY) : r.marginY) - r.tearExtra;
    if (left < minWall) warn(`The teardrop points leave only ${Math.max(0, left).toFixed(1)} mm of material above each opening. Widen the spacing deep or the edge margin by ${Math.ceil(minWall - left + 0.4)} mm.`);
  }
  if (r.fitBox && !r.boxFits) err('Not even one position fits this box with these margins. Enlarge the box or reduce the margin or handle reach.');

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
    if (r.style === 'stand' && !r.standFloor) err('Stacking feet need the bottom plate to stand on. Switch it on.');
    else if (clearOf(r.footInset, r.footD / 2 + 0.4) < 0.8) {
      err(`Stacking feet need solid corners: increase the edge margin by about ${Math.ceil(0.8 - clearOf(r.footInset, r.footD / 2 + 0.4) + 0.5)} mm.`);
    } else if (r.style === 'stand' && r.plateT < 4) warn('The top plate is thin for the stacking pockets; 4 mm or more is better.');
  }
  if (r.feet === 'pads') {
    if (r.style === 'stand' && !r.standFloor) err('Stick-on feet need the bottom plate. Switch it on.');
    else if (r.sizeX < 2 * r.padInset + r.padD || r.sizeY < 2 * r.padInset + r.padD * 0.2) warn('The holder is small for four stick-on feet of this size.');
    else if ((r.style === 'stand' ? r.plateT : r.seat) < 2) warn('The floor is thin where the foot recesses go; 2 mm or more is safer.');
  }
  if (r.windows && r.style !== 'stand' && !r.hasWindows) warn('The openings are too shallow for windows; none are cut.');
  if (r.hasWindows && Math.min(r.marginY, r.rows > 1 ? r.gapY : Infinity) < 1.2) warn('The walls the windows are cut through are very thin.');
  if (r.handles === 'loop') {
    if (r.loopHole < 15) warn(`The finger loops have a ${r.loopHole.toFixed(0)} mm hole, tight for a finger. A reach of 20 mm or more gives 16 mm.`);
    if (2 * r.loopR > r.height) warn('The finger loops are taller than the holder and stand proud of its top.');
  }
  if (r.handles === 'lip' && r.handleLen + 3 > r.height) warn('The grip lips are longer than the holder is tall; their underside is cut short.');
  if (r.style !== 'stand' && r.depth < 3) err('The opening is too shallow to hold anything.');
  if (r.style === 'stand' && r.seat === null && r.v.top <= r.hole + 0.3) {
    err('Without a bottom plate the vessel hangs by its rim, but this one has no rim wider than the opening: it would fall through. Switch the bottom plate on.');
  }
  if (r.seat === null && r.rest < 2) {
    err(`Hanging by its rim, the vessel reaches the table. Make the stand at least ${Math.ceil(r.v.length - 6)} mm tall or switch the bottom plate on.`);
  }
  if (r.stickOut < 7.5) warn(`Only ${Math.max(0, r.stickOut).toFixed(0)} mm of the vessel shows above the holder, which is little to grab.`);
  if (r.style !== 'stand' && r.depth < Math.min(r.v.length * 0.2, 12) && r.v.length > 30) {
    warn('The opening is shallow for a vessel this tall; it may tip over when knocked.');
  }
  const tall = r.height + Math.max(0, r.stickOut);
  if (tall > 3.2 * Math.min(r.sizeX, r.sizeY)) warn('Loaded, this holder is more than three times as tall as its base is deep, so it tips easily. Add a row or widen the margin.');
  return out;
}

/** What decides the shape (print settings and labels do not). */
export function shapeKey(r) {
  const skip = new Set(['nozzle', 'material', 'infill', 'bedX', 'bedY', 'bedZ', 'printDir', 'printShape']);
  const o = {};
  for (const d of PARAMS) if (!skip.has(d.id)) o[d.id] = r[d.id];
  return JSON.stringify([o, r.hole, r.pitchX, r.pitchY, r.height, r.depth, r.cols, r.rows, r.sizeX, r.sizeY, r.tearOpenings, r.peakWindows, r.tearLoops, r.edgeC, r.filletR]);
}
