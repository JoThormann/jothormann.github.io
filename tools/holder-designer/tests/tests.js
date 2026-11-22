// Browser test page: open tests.html. The title reads PASSED or FAILED.
import { PARAMS, defaults, sanitize, resolve, validate, toQuery, fromQuery, shapeKey, STYLES, shownFor, fitTest, fitLabel } from '../src/params.js';
import { VESSELS } from '../src/vessels.js';
import { loadKernel } from '../src/geometry/kernel.js';
import { buildHolder, buildBasePlate, buildFitTest, mergeMeshes, positions, toMesh, solidVolume } from '../src/geometry/build.js';
import { analyse } from '../src/print.js';
import { stlBuffer } from '../src/export/stl.js';
import { threeMf, readDesign } from '../src/export/threemf.js';
import { zipRead } from '../src/export/zip.js';
import { SHOWCASE, ADAPT, makeMesh } from '../src/tour-build.js';
import { depthPicture, conePicture } from '../src/explain.js';

const lines = [];
let failed = 0;
let count = 0;
function check(name, ok, detail = '') {
  count++;
  if (!ok) failed++;
  lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.abs(b);
const design = (over) => resolve(sanitize({ ...defaults(), ...over }));
const errors = (r) => validate(r).filter((i) => i.level === 'error');

function measure(mesh) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], mesh.positions[i + a]);
      hi[a] = Math.max(hi[a], mesh.positions[i + a]);
    }
  }
  const edges = new Map();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = mesh.indices[t + e], b = mesh.indices[t + ((e + 1) % 3)];
      const key = a < b ? a + '_' + b : b + '_' + a;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  return { size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], zMin: lo[2], watertight: [...edges.values()].every((n) => n === 2) };
}

try {
  // ---- vessel list and sizes ----
  for (const [k, v] of Object.entries(VESSELS)) {
    if (v.custom) continue;
    check(`${v.label}: opening is larger than the body, usual spacing clears opening and cap`,
      v.hole > v.body && v.hole - v.body <= 1.2 && v.pitch > v.hole + 1 && v.pitch >= v.top && v.length > 10, `${k}: body ${v.body}, opening ${v.hole}, spacing ${v.pitch}`);
  }
  const d = design({});
  check('default: 6 x 2 of 1.5 ml tubes, 11.5 mm openings at 20 mm', d.count === 12 && d.hole === 11.5 && d.pitchX === 20 && d.pitchY === 20);
  check('outer size = span + opening + two margins', d.sizeX === 5 * 20 + 11.5 + 8 && d.sizeY === 20 + 11.5 + 8, `${d.sizeX} x ${d.sizeY}`);
  check('fit shifts the opening', design({ fit: 0.3 }).hole === 11.8 && design({ fit: -0.2 }).hole === 11.3);
  check('custom round vessel: opening is size + 0.5', design({ vessel: 'customRound', customSize: 22 }).hole === 22.5);
  check('manual spacing is used when the usual one is switched off',
    design({ autoSpacing: false, pitchX: 25, pitchY: 30 }).pitchX === 25 && design({ autoSpacing: false, pitchX: 25, pitchY: 30 }).pitchY === 30);
  check('tray packs pockets wall to wall', design({ style: 'tray', vessel: 'cuvette', trayWall: 2 }).pitchX === 15);
  check('block: opening never deeper than the height minus the floor',
    (() => { const x = design({ autoHeight: false, height: 20, depth: 60, floor: 3 }); return x.depth === 17 && x.seat === 3; })());

  // Your existing holders, re-entered: the tool should land on the same outer sizes.
  const eppi = design({ vessel: 't15', cols: 9, rows: 3, autoSpacing: false, pitchX: 25, pitchY: 25, margin: 1.65, autoHeight: false, height: 50, depth: 19 });
  check('your 9 x 3 tube block: 214.8 mm long, 50 mm tall, openings 19 mm deep', near(eppi.sizeX, 214.8, 1e-9) && eppi.height === 50 && eppi.depth === 19, `${eppi.sizeX} x ${eppi.sizeY}`);
  const f50 = design({ style: 'stand', vessel: 'f50', cols: 6, rows: 1, margin: 5.25, wallT: 5, autoHeight: false, height: 115 });
  check('your 6 x 50 ml stand: openings 29.5 mm at 45 mm, 40 mm deep', f50.hole === 29.5 && f50.pitchX === 45 && f50.sizeY === 40, `${f50.sizeX} x ${f50.sizeY} x ${f50.height}`);
  const f15 = design({ style: 'stand', vessel: 'f15', cols: 9, rows: 1 });
  check('15 ml stand: openings 18 mm at 25 mm, as in yours', f15.hole === 18 && f15.pitchX === 25);
  const tray = design({ style: 'tray', vessel: 'cuvette', cols: 7, rows: 4 });
  check('cuvette tray: 13 mm square pockets, as in yours', tray.hole === 13 && tray.v.shape === 'square' && tray.count === 28);

  // ---- where the vessel sits ----
  check('block: the tube stands on the bottom of its opening', d.rest === d.height - d.depth && near(d.stickOut, d.rest + 40 - d.height, 1e-9));
  const stand = design({ style: 'stand', vessel: 'f15' });
  check('stand with bottom plate: the tube stands on the plate and shows above', stand.rest === stand.plateT && stand.stickOut >= 12, `${stand.stickOut} mm above`);
  const hang = design({ style: 'stand', vessel: 'f15', standFloor: false });
  check('stand without bottom plate: the tube hangs by its cap', hang.seat === null && hang.rest > 0 && errors(hang).length === 0);
  check('a vessel with no rim cannot hang: error', errors(design({ style: 'stand', vessel: 'hplc', standFloor: false })).some((i) => /fall through/.test(i.text)));

  // ---- validation ----
  for (const s of Object.keys(STYLES)) {
    for (const [k, v] of Object.entries(VESSELS)) {
      const r = design({ style: s, vessel: k });
      check(`${STYLES[s].label}, ${v.label}: defaults build without errors`, errors(r).length === 0, errors(r).map((i) => i.text).join(' '));
    }
  }
  check('overlapping openings are an error', errors(design({ autoSpacing: false, pitchX: 10, pitchY: 10 })).length === 1);
  check('caps that collide are flagged', validate(design({ autoSpacing: false, pitchX: 12.5, pitchY: 12.5 })).some((i) => /caps overlap/.test(i.text)));
  check('a tall single row is flagged as tippy', validate(design({ style: 'stand', vessel: 'f15', cols: 6, rows: 1 })).some((i) => /tips easily/.test(i.text)));
  check('thin material between openings is flagged', validate(design({ vessel: 'cryo', autoSpacing: false, pitchX: 13.6, pitchY: 13.6 })).some((i) => /nozzle widths/.test(i.text)));

  // ---- usual height of a block ----
  {
    const b15 = design({ style: 'block', vessel: 't15' });
    const b50 = design({ style: 'block', vessel: 'f50' });
    const thick = design({ style: 'block', vessel: 't15', floor: 3 });
    check('a block is two thirds as tall as the tube, on a 2 mm floor', b15.height === 27 && b15.depth === 25 && b15.seat === 2 &&
      b50.height === 77 && b50.seat === 2 && thick.height === 27 && thick.seat === 3, `${b15.height}/${b15.depth}, ${b50.height}, ${thick.height}/${thick.seat}`);
  }

  // ---- guides from a problem to its fix ----
  {
    // Designs that set off as many different problems as possible, across the kinds of holder.
    const troubled = [
      { vessel: 'f50', autoSpacing: false, pitchX: 20 },
      { style: 'stand', vessel: 'f15', autoSpacing: false, pitchX: 21, pitchY: 25, dividers: 'two' },
      { style: 'stand', vessel: 'f15', cols: 2, dividers: 'six' },
      { style: 'block', vessel: 'cryo', feet: 'stack' },
      { style: 'stand', standFloor: false, feet: 'pads' },
      { style: 'stand', standFloor: false, feet: 'stack' },
      { style: 'stand', labels: 'pads', standFloor: false },
      { style: 'stand', vessel: 'f15', margin: 4, frameR: 40 },
      { style: 'stand', vessel: 'f15', standFloor: false, autoHeight: false, height: 60 },
      { vessel: 't15', margin: 1, nozzle: 0.8 },
      { fitBox: true, boxX: 20, boxY: 20 },
      { chamfer: 3, margin: 1.5 },
      { style: 'block', windows: true, autoHeight: false, height: 8, depth: 5 },
      { style: 'block', vessel: 'f50', autoHeight: false, height: 6, depth: 2 },
      { style: 'tray', vessel: 'cryo', trayWall: 0.8, nozzle: 0.6 },
      { style: 'single', vessel: 'pcr' },
      { style: 'single', vessel: 'f50', autoBase: false, baseD: 50 },
      { style: 'single', vessel: 'f15', grip: '4', sleeveT: 4 },
      { style: 'single', vessel: 'f15', sleeveT: 1.2, nozzle: 0.8 },
    ];
    const ids = new Set(PARAMS.map((d) => d.id));
    const seen = new Set();
    const bad = [];
    for (const over of troubled) {
      const r = design(over);
      for (const i of validate(r)) {
        seen.add(i.key);
        const steps = i.fix || [];
        if (!i.key) bad.push(`no key: ${i.text}`);
        else if (!steps.length) bad.push(`${i.key}: no guide`);
        else if (!steps.every((st) => ids.has(st.id) && st.say)) bad.push(`${i.key}: a step names no setting or says nothing`);
        // The guide starts at the first step that can be seen; there must be one.
        else if (!steps.some((st) => shownFor(PARAMS.find((d) => d.id === st.id), r))) bad.push(`${i.key}: no step can be seen`);
      }
    }
    check('every problem has a guide to settings that exist and can be seen', bad.length === 0 && seen.size >= 20, `${seen.size} problems; ${bad.join(' | ')}`);

    // A guide that needs a switch flipped first: overlap -> "usual spacing" off, then the spacing.
    const ov = validate(design({ vessel: 'f50', autoSpacing: false, pitchX: 20 })).find((i) => i.key === 'overlap');
    const ovOn = validate(design({ vessel: 'f50', autoSpacing: true, pitchX: 20, fit: 2 }));
    check('the overlap guide starts at the spacing once the usual spacing is off', ov && ov.fix[0].id === 'autoSpacing' && ov.fix[0].done({ autoSpacing: false }) && ov.fix[1].id === 'pitchX', ovOn.map((i) => i.key).join());
  }

  // ---- printers ----
  {
    const bambu = design({ printer: 'bambu' });
    const typed = design({ printer: 'other', bedX: 300, bedY: 200, bedZ: 150 });
    check('a printer from the list brings its bed; Other uses the typed size',
      bambu.bedX === 256 && bambu.bedY === 256 && bambu.bedZ === 256 && typed.bedX === 300 && typed.bedY === 200 && typed.bedZ === 150);
    check('an old link with its own bed size keeps it', fromQuery('bedX=300&bedY=250').printer === 'other' && fromQuery('cols=3').printer === 'ender' &&
      resolve(fromQuery('bedX=300&bedY=250')).bedX === 300);
    check('the printer survives a share link', fromQuery(toQuery(sanitize({ ...defaults(), printer: 'mk4' }))).printer === 'mk4');
  }

  // ---- explainer pictures ----
  {
    const broken = [];
    for (const vessel of Object.keys(VESSELS)) {
      for (const style of ['block', 'tray']) {
        const svg = depthPicture(design({ style, vessel, feet: style === 'block' ? 'stack' : 'none', margin: 9 }));
        if (!svg.startsWith('<svg') || /NaN|undefined|Infinity/.test(svg)) broken.push(`${style} ${vessel}`);
      }
      const v = VESSELS[vessel];
      if (!v.custom && v.shape === 'round' && v.cone > 0) {
        for (const on of [true, false]) {
          const svg = conePicture(design({ style: 'single', vessel, coneSeat: true }), on);
          if (!svg.startsWith('<svg') || /NaN|undefined|Infinity/.test(svg)) broken.push(`single ${vessel} ${on}`);
        }
      }
    }
    check('the section pictures draw for every tube, with every number filled in', broken.length === 0, broken.join(', '));
  }

  // ---- links and files ----
  check('share link of the defaults is empty', toQuery(defaults()) === '');
  const custom = sanitize({ ...defaults(), style: 'stand', vessel: 'f50', cols: 4, rows: 2, guide: true, fit: 0.25, autoHeight: false, height: 90 });
  check('share link round trip', JSON.stringify(fromQuery(toQuery(custom))) === JSON.stringify(custom), toQuery(custom));
  const hostile = sanitize({ cols: 1e9, rows: 'x', vessel: 'toaster', style: '<b>', extra: 1 });
  check('bad input is clamped or dropped', hostile.cols === 24 && hostile.rows === 2 && hostile.vessel === 't15' && hostile.style === 'block' && !('extra' in hostile));
  check('print settings do not change the shape key', shapeKey(design({})) === shapeKey(design({ infill: 40, bedX: 300 })) && shapeKey(design({})) !== shapeKey(design({ cols: 7 })));
  check('every control has a label and a default in range', PARAMS.every((p) => !p.group || (p.label && (p.type || (p.def >= p.min && p.def <= p.max)))));

  // ---- geometry ----
  const k = await loadKernel();
  const build = (r, seg = 64) => {
    const s = buildHolder(k, r, seg);
    const mesh = toMesh(s);
    const out = { v: solidVolume(s), genus: s.genus(), mesh, m: measure(mesh) };
    s.delete();
    return out;
  };

  // Block with sharp corners and no funnel: box minus cylinders.
  const plainR = design({ corner: 0, chamfer: 0, edge: 0, fillet: 0 });
  const plain = build(plainR, 256);
  const expect = plainR.sizeX * plainR.sizeY * plainR.height - 12 * (Math.PI / 4) * 11.5 ** 2 * plainR.depth;
  check('block volume = box minus the openings', near(plain.v, expect, 0.002) && plain.m.watertight && plain.genus === 0, `${plain.v.toFixed(0)} vs ${expect.toFixed(0)} mm3`);
  check('block size and standing on the table',
    near(plain.m.size[0], plainR.sizeX, 1e-6) && near(plain.m.size[1], plainR.sizeY, 1e-6) && near(plain.m.size[2], plainR.height, 1e-6) && Math.abs(plain.m.zMin) < 1e-6);

  const round = build(design({ chamfer: 0, edge: 0 }), 256);
  const cut = (4 - Math.PI) * 4 * 4 * design({}).height;
  check('rounded corners remove (4 - pi) r² h', near(plain.v - round.v, cut, 0.01), `${(plain.v - round.v).toFixed(1)} vs ${cut.toFixed(1)}`);
  const fun = build(design({ corner: 0, edge: 0 }), 256);
  check('the funnel at each opening removes a little more', fun.v < plain.v && plain.v - fun.v < 12 * 60 && fun.m.watertight);

  // Tray of square pockets.
  const trayR = design({ style: 'tray', vessel: 'cuvette', cols: 7, rows: 4, corner: 0, chamfer: 0, edge: 0, fillet: 0 });
  const trayB = build(trayR);
  const trayV = trayR.sizeX * trayR.sizeY * trayR.height - 28 * 13 * 13 * trayR.depth;
  check('cuvette tray volume = box minus square pockets', near(trayB.v, trayV, 0.002) && trayB.m.watertight && trayB.genus === 0, `${trayB.v.toFixed(0)} vs ${trayV.toFixed(0)} mm3`);

  // Stand: two plates, two end walls, openings through the top plate only.
  const stR = design({ style: 'stand', vessel: 'f50', cols: 6, rows: 1, corner: 0, chamfer: 0, edge: 0, fillet: 0, printShape: false });
  const st = build(stR, 256);
  const inner = stR.sizeX - 2 * stR.wallT;
  const stV = 2 * stR.wallT * stR.sizeY * stR.height + 2 * inner * stR.sizeY * stR.plateT - 6 * (Math.PI / 4) * 29.5 ** 2 * stR.plateT;
  check('stand volume = walls + two plates minus the openings', near(st.v, stV, 0.002) && st.m.watertight, `${st.v.toFixed(0)} vs ${stV.toFixed(0)} mm3`);
  const guide = build(design({ style: 'stand', vessel: 'f50', cols: 6, rows: 1, corner: 0, chamfer: 0, edge: 0, fillet: 0, guide: true, printShape: false }), 256);
  check('guide plate adds one more pierced plate', near(guide.v - st.v, inner * stR.sizeY * stR.plateT - 6 * (Math.PI / 4) * 29.5 ** 2 * stR.plateT, 0.005));
  const open = build(design({ style: 'stand', vessel: 'f15', cols: 4, rows: 2, standFloor: false }));
  check('stand without bottom plate builds as one closed solid', open.m.watertight && open.v > 0);

  for (const s of Object.keys(STYLES)) {
    for (const vk of ['t15', 'f50', 'cuvette', 'pcr', 'scint', 'customSquare']) {
      const r = design({ style: s, vessel: vk, cols: 5, rows: 3 });
      const b = build(r);
      check(`${STYLES[s].label}, ${VESSELS[vk].label}, 5 x 3: closed solid of the stated size`,
        b.m.watertight && b.v > 0 && near(b.m.size[0], r.sizeX, 1e-4) && near(b.m.size[1], r.sizeY, 1e-4) && near(b.m.size[2], r.height, 1e-4),
        b.m.size.map((x) => x.toFixed(1)).join(' x '));
    }
  }
  const big = build(design({ vessel: 'pcr', cols: 24, rows: 12 }));
  check('288 positions build', big.m.watertight && big.genus === 0, `${(big.mesh.indices.length / 3).toLocaleString()} triangles`);
  check('openings are laid out row by row around the centre', (() => {
    const at = positions(d);
    return at.length === 12 && at[0][0] === -50 && at[0][1] === -10 && at[11][0] === 50 && at[11][1] === 10;
  })());

  // ---- extras ----
  {
    const flat = { corner: 0, chamfer: 0, edge: 0, fillet: 0, printShape: false };
    // Fill a box: 130 x 130 inside, 1 mm clearance, 1.5 ml tubes at 20 mm.
    const box = design({ fitBox: true, boxX: 130, boxY: 130, boxGap: 1 });
    check('fill a box: as many positions as fit, outer size fills the box',
      box.cols === 6 && box.rows === 6 && box.sizeX === 128 && box.sizeY === 128 && near(box.marginX, (128 - 100 - 11.5) / 2, 1e-9),
      `${box.cols} x ${box.rows}, margins ${box.marginX}`);
    check('a box too small for one position is an error', errors(design({ fitBox: true, boxX: 20, boxY: 20, vessel: 'f50' })).some((i) => /Not even one/.test(i.text)));
    const boxB = build(box);
    check('the box-filling holder builds to exactly that size', boxB.m.watertight && near(boxB.m.size[0], 128, 1e-6) && near(boxB.m.size[1], 128, 1e-6));

    // Windows: one slot per column through the whole depth.
    const wR = design({ ...flat, windows: true });
    const w = build(wR, 256);
    const slotH = wR.windowHi - wR.windowLo;
    // Material removed = slot through the full depth, minus what the openings had already removed inside it.
    // Area of one round opening that lies within the slot's width: 2 [a sqrt(r² - a²) + r² asin(a / r)].
    const rr = 11.5 / 2, aa = wR.windowW / 2;
    const seg = 2 * (aa * Math.sqrt(rr * rr - aa * aa) + rr * rr * Math.asin(aa / rr));
    const expectW = 6 * (wR.windowW * wR.sizeY - 2 * seg) * slotH;
    check('windows remove a slot per column, less what the openings already took', near(plain.v - w.v, expectW, 0.01) && w.m.watertight,
      `${(plain.v - w.v).toFixed(0)} vs ${expectW.toFixed(0)} mm3`);
    check('windows do not change the outer size', near(w.m.size[0], wR.sizeX, 1e-6) && near(w.m.size[2], wR.height, 1e-6));
    // Front only: the slot stops in the middle of the back row, so the back wall stays whole.
    const fR = design({ ...flat, windows: true, windowSides: 'front' });
    const front = build(fR, 256);
    check('front-only slots remove less than slots through both sides, and keep the back wall',
      front.v > w.v && plain.v - front.v > 0.3 * (plain.v - w.v) && front.m.watertight && near(front.m.size[1], fR.sizeY, 1e-6),
      `${(plain.v - front.v).toFixed(0)} vs ${(plain.v - w.v).toFixed(0)} mm3`);
    check('front-only slots with a single row and peaked tops build', build(design({ windows: true, windowSides: 'front', rows: 1 })).m.watertight);
    check('too shallow for windows: none cut, and said so',
      !design({ style: 'tray', vessel: 'pcr', windows: true }).hasWindows && validate(design({ style: 'tray', vessel: 'pcr', windows: true })).some((i) => /too shallow/.test(i.text)));

    // Stacking feet.
    const sR = design({ ...flat, feet: 'stack', margin: 9 });
    const st2 = build(sR, 256);
    const ref = build(design({ ...flat, margin: 9 }), 256);
    const feetV = 4 * Math.PI * 16 * 2.5 - 4 * Math.PI * 4.4 ** 2 * 2.9;
    check('stacking feet: four feet below, four pockets on top', near(st2.v - ref.v, feetV, 0.03) && st2.m.watertight && near(st2.m.size[2], sR.height + 2.5, 1e-6) && Math.abs(st2.m.zMin) < 1e-6,
      `${(st2.v - ref.v).toFixed(0)} vs ${feetV.toFixed(0)} mm3`);
    check('feet lift the vessels with the holder', sR.outerZ === sR.height + 2.5 && sR.footH === 2.5);
    check('stacking feet without room at the corners are an error', errors(design({ feet: 'stack', margin: 2 })).some((i) => /solid corners/.test(i.text)));
    check('stacking feet on a stand need the bottom plate', errors(design({ style: 'stand', vessel: 'f15', feet: 'stack', standFloor: false, margin: 9 })).some((i) => /bottom plate/.test(i.text)));
    const stStand = build(design({ style: 'stand', vessel: 'f15', feet: 'stack', margin: 9 }));
    check('stacking feet on a stand build', stStand.m.watertight);

    // Recesses for stick-on feet.
    const pR = design({ ...flat, feet: 'pads', padD: 10 });
    const pad = build(pR, 256);
    check('recesses for stick-on feet: four shallow pockets underneath', near(plain.v - pad.v, 4 * Math.PI * 5.25 ** 2 * 1.2, 0.03) && pad.m.watertight && near(pad.m.size[2], pR.height, 1e-6),
      `${(plain.v - pad.v).toFixed(0)} mm3`);

    const all = build(design({ vessel: 'cuvette', cols: 4, rows: 1, windows: true, feet: 'stack', margin: 9 }));
    check('cuvette holder with windows and stacking feet builds', all.m.watertight && all.v > 0);
    const linked = sanitize({ ...defaults(), fitBox: true, boxX: 150, windows: true, windowSides: 'front', feet: 'pads', padD: 12 });
    check('extras survive a share link', JSON.stringify(fromQuery(toQuery(linked))) === JSON.stringify(linked));
  }

  // ---- printing: way up, teardrops, peaks, bevels, fillets ----
  {
    const hang = (b, axis) => analyse(b.mesh, axis).overhang;
    check('way up: a stand lies on its side, a block stands upright, and a choice overrides it',
      design({ style: 'stand', vessel: 'f15' }).printUp === 'y' && design({}).printUp === 'z' &&
      design({ printDir: 'side' }).printUp === 'y' && design({ style: 'stand', printDir: 'upright' }).printUp === 'z');

    // A cube on the bed has no hanging surface; lifted off, its underside hangs.
    const cube = (z0) => ({
      positions: new Float32Array([0, 0, z0, 1, 0, z0, 1, 1, z0, 0, 1, z0, 0, 0, z0 + 1, 1, 0, z0 + 1, 1, 1, z0 + 1, 0, 1, z0 + 1]),
      indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]),
    });
    const two = { positions: new Float32Array([...cube(0).positions, ...cube(3).positions]), indices: new Uint32Array([...cube(0).indices, ...[...cube(0).indices].map((i) => i + 8)]) };
    const an = analyse(two, 2);
    check('overhang analysis: bed contact is not overhang, a face in the air is', near(an.contact, 1, 1e-9) && near(an.overhang, 1, 1e-9) && near(an.flat, 1, 1e-9) && an.height === 4);
    check('overhang analysis works for the other way up too', near(analyse(two, 1).overhang, 0, 1) && analyse(two, 1).height === 1);

    // Stand of 15 ml tubes, lying on its side: teardrops take away the sagging tops of the openings.
    const base = { style: 'stand', vessel: 'f15', cols: 4, rows: 2, corner: 0, chamfer: 0, edge: 0, fillet: 0 };
    const tear = build(design(base), 128);
    const roundHoles = build(design({ ...base, printShape: false }), 128);
    check('teardrop openings are on by default for a stand', design(base).tearOpenings && !design({ ...base, printShape: false }).tearOpenings);
    check('teardrops cut the hanging surface of a stand on its side by more than half', hang(tear, 1) < 0.5 * hang(roundHoles, 1),
      `${(hang(tear, 1) / 100).toFixed(1)} vs ${(hang(roundHoles, 1) / 100).toFixed(1)} cm2`);
    // Each teardrop adds the area between its two 45° roof lines (tangent to the hole) and the round hole,
    // up to 1.25 radii: teardrop R² + 3 pi R² / 4 - (sqrt2 R - 1.25 R)², less the circle. Through one 4 mm plate.
    const R = 9;
    const tipArea = R * R - (Math.PI / 4) * R * R - (Math.SQRT2 * R - 1.25 * R) ** 2;
    check('each teardrop removes exactly its pointed part from the plate', near(roundHoles.v - tear.v, 8 * tipArea * 4, 0.01), `${(roundHoles.v - tear.v).toFixed(0)} vs ${(8 * tipArea * 4).toFixed(0)} mm3`);
    check('a stand hangs far less on its side than upright', hang(tear, 1) < 0.2 * hang(tear, 2), `${(hang(tear, 1) / 100).toFixed(1)} vs ${(hang(tear, 2) / 100).toFixed(1)} cm2`);
    check('square openings get no teardrop', !design({ style: 'stand', vessel: 'cuvette' }).tearOpenings);
    check('tight rows are warned about the teardrop points',
      validate(design({ style: 'stand', vessel: 'f15', rows: 2, autoSpacing: false, pitchX: 25, pitchY: 20 })).some((i) => /teardrop/.test(i.text)));

    // Windows: a peak instead of a flat top.
    const win = { corner: 0, chamfer: 0, edge: 0, windows: true };
    const peak = build(design(win), 128);
    const flatTop = build(design({ ...win, printShape: false }), 128);
    check('peaked windows are on by default for an upright block', design(win).peakWindows);
    check('peaked windows leave no bridge: less hangs than with flat tops', hang(peak, 2) < hang(flatTop, 2) - 100,
      `${(hang(peak, 2) / 100).toFixed(1)} vs ${(hang(flatTop, 2) / 100).toFixed(1)} cm2`);
    check('a peaked window removes less material than a flat-topped one of the same height', peak.v > flatTop.v && peak.m.watertight);

    // ---- funnel at the mouth ----
    // Removed material per opening, from the outline's area A(g) grown by g, integrated over the funnel's depth c.
    // Round: pi (R + g)². Square: (s + 2g)². Teardrop: circle plus the pointed part between its 45° roof and the
    // circle, cut off at 1.25 R + g: 3 pi rho² / 4 + rho² - (sqrt2 rho - k)², with rho = R + g, k = 1.25 R + g.
    const funnelV = (r) => {
      const c = r.chamferC, R = r.hole / 2;
      const A = (g) => {
        if (r.v.shape === 'square') return (r.hole + 2 * g) ** 2;
        if (!r.tearOpenings) return Math.PI * (R + g) ** 2;
        const rho = R + g, k = 1.25 * R + g;
        return (3 * Math.PI / 4) * rho * rho + rho * rho - Math.max(0, Math.SQRT2 * rho - k) ** 2;
      };
      let v = 0; const n = 400;
      for (let i = 0; i < n; i++) v += (A(((i + 0.5) / n) * c) - A(0)) * (c / n);
      return v * r.count;
    };
    const tf = { style: 'stand', vessel: 'f15', cols: 3, rows: 2, corner: 0, edge: 0, fillet: 0, chamfer: 1.5 };
    const tfR = design(tf);
    const withF = build(tfR, 256);
    const without = build(design({ ...tf, chamfer: 0 }), 256);
    check('the teardrop is round right up to where its roof lines touch, with no step at the sides',
      (() => { const m = withF.mesh, p = m.positions; let worst = 0;
        // Every vertex of an opening, below the touching points, lies on the circle (within facet error).
        const at = positions(tfR); const R0 = tfR.hole / 2;
        for (let i = 0; i < p.length; i += 3) {
          const z = p[i + 2]; if (z < tfR.height - tfR.plateT + 0.1 || z > tfR.height - tfR.chamferC - 0.1) continue;
          for (const [x, y] of at) {
            const dx = p[i] - x, dy = p[i + 1] - y, d = Math.hypot(dx, dy);
            if (d < R0 + 1.5 && dy < R0 / Math.SQRT2 - 0.05) worst = Math.max(worst, d - R0);
          }
        }
        return worst < 0.02; })());
    check('teardrop openings get a teardrop funnel: the point has its own lead-in, not a notch in a round one',
      tfR.tearOpenings && near(without.v - withF.v, funnelV(tfR), 0.015) && withF.m.watertight,
      `${(without.v - withF.v).toFixed(1)} vs ${funnelV(tfR).toFixed(1)} mm3`);

    // Any configuration: every funnel is whole, has the opening's shape and stays clear of its neighbours, the
    // edge and the underside of the plate. Then the removed material is exactly the funnels' sum.
    let bad = [];
    let tried = 0;
    for (const style of Object.keys(STYLES)) {
      for (const vessel of ['t15', 'f15', 'f50', 'pcr', 'scint', 'cuvette']) {
        for (const printDir of ['auto', 'side']) {
          for (const rows of [1, 3]) {
            const o = { style, vessel, printDir, cols: 3, rows, chamfer: 3, edge: 1, corner: 4 };
            const r = design(o);
            if (errors(r).length || r.chamferC < 0.05) continue;
            tried++;
            const a = build(r, 128);
            const b = build(design({ ...o, chamfer: 0 }), 128);
            const plate = style === 'stand' ? r.plateT : r.depth;
            // 3 %, or 0.06 mm3 per opening for funnels a fraction of a millimetre deep (facets).
            const ok = a.m.watertight && Math.abs(b.v - a.v - funnelV(r)) <= Math.max(0.03 * funnelV(r), 0.06 * r.count) && r.chamferC <= plate * 0.8 + 1e-9;
            if (!ok) bad.push(`${style}/${vessel}/${printDir}/${rows} rows: ${(b.v - a.v).toFixed(1)} vs ${funnelV(r).toFixed(1)}`);
          }
        }
      }
    }
    check(`funnels in ${tried} configurations (each kind, six vessels, both ways up, one and three rows) are whole and clear of each other`,
      tried > 40 && !bad.length, bad.slice(0, 3).join('; '));
    check('the funnel is held back on a thin stand plate and between tight teardrops',
      design({ style: 'stand', vessel: 'f15', plateT: 1.2, chamfer: 3 }).chamferC <= 0.6 + 1e-9 &&
      design({ style: 'stand', vessel: 'f15', rows: 2, autoSpacing: false, pitchX: 25, pitchY: 21.5, chamfer: 3 }).chamferC <= (21.5 - 18 - 18 / 8 - 0.6) / 2 + 1e-9);
    check('a funnel held back a lot is said so', validate(design({ style: 'stand', vessel: 'f15', plateT: 1.2, chamfer: 3 })).some((i) => /room for a/.test(i.text)));

    // Bevelled edges.
    const bR = design({ chamfer: 0, corner: 0, edge: 1 });
    const bev = build(bR, 128);
    // Each bevelled edge removes a triangular strip c²/2 along the perimeter, less the corner overlaps.
    const per = 2 * (bR.sizeX + bR.sizeY);
    check('bevel removes about c²/2 per millimetre of top and bottom edge', near(plain.v - bev.v, 2 * 0.5 * per, 0.04) && bev.m.watertight && bev.genus === 0,
      `${(plain.v - bev.v).toFixed(0)} vs ${per.toFixed(0)} mm3`);
    check('bevel keeps the outer size', near(bev.m.size[0], bR.sizeX, 1e-6) && near(bev.m.size[1], bR.sizeY, 1e-6) && near(bev.m.size[2], bR.height, 1e-6));
    check('bevelled bottom: nothing hangs, the 45° slope carries itself', hang(bev, 2) < 1, `${hang(bev, 2).toFixed(2)} mm2`);
    check('the bevel is held back where the margin or plate is thin', design({ margin: 1.2, edge: 2 }).edgeC <= 0.4 + 1e-9 && design({ style: 'stand', plateT: 1.6, edge: 2 }).edgeC <= 0.8 + 1e-9);
    const bevRound = build(design({ edge: 1.5, corner: 6 }), 128);
    check('bevel with rounded corners builds', bevRound.m.watertight && bevRound.genus === 0);

    // Fillets inside the stand.
    const fR = design({ ...base, fillet: 3 });
    const fil = build(fR, 128);
    const perJoint = (1 - Math.PI / 4) * 9 * fR.sizeY;
    check('fillets add (1 - pi/4) r² per joint, four joints', near(fil.v - tear.v, 4 * perJoint, 0.03) && fil.m.watertight, `${(fil.v - tear.v).toFixed(0)} vs ${(4 * perJoint).toFixed(0)} mm3`);
    check('a guide plate gets fillets on both sides', near(build(design({ ...base, fillet: 3, guide: true }), 128).v - build(design({ ...base, guide: true }), 128).v, 8 * perJoint, 0.03));
    check('the fillet is held back so it does not run into the openings', design({ ...base, fillet: 10, margin: 2 }).filletR <= 1.4 + 1e-9);
    check('all print features together build as one closed solid',
      build(design({ style: 'stand', vessel: 'f50', cols: 4, rows: 1, guide: true, edge: 1, fillet: 4, feet: 'stack', margin: 9 })).m.watertight &&
      build(design({ vessel: 'cuvette', cols: 4, rows: 1, windows: true, windowSides: 'front', feet: 'pads', edge: 1, margin: 6 })).m.watertight);
  }

  // ---- single stand ----
  {
    const one = { style: 'single', chamfer: 0 };
    const f50 = design({ ...one, vessel: 'f50' });
    check('single stand: one place, base about 0.9 of the loaded height, never narrower than the sleeve plus 12 mm all round',
      f50.count === 1 && f50.baseD === Math.round(0.9 * (f50.rest + 115)) && design({ ...one, vessel: 'pcr' }).baseD >= 2 * design({ ...one, vessel: 'pcr' }).sleeveR + 24);
    check('single stand: rows, spacing and feet are not offered', !shownFor(PARAMS.find((d) => d.id === 'cols'), f50) && !shownFor(PARAMS.find((d) => d.id === 'feet'), f50) &&
      shownFor(PARAMS.find((d) => d.id === 'grip'), f50) && !shownFor(PARAMS.find((d) => d.id === 'grip'), design({})));
    check('single stand prints upright, with no teardrops', f50.printUp === 'z' && !f50.tearOpenings);

    // Where the cone touches the ribs: the drawn tube narrows from its body radius to a quarter of it over the cone.
    const coneR = (r, h) => (r.v.body / 2) * (0.25 + 0.75 * Math.min(1, h / r.v.cone));
    check('cone ribs: the tube touches them with its cone and its tip stays 2 mm above the floor',
      f50.coneTabs && near(coneR(f50, f50.seatZ - f50.rest), f50.tabR, 0.01) && f50.rest === f50.baseT + 2 && f50.seatZ < f50.rest + 15);
    check('flat-bottomed vials stand on the floor, no ribs', !design({ ...one, vessel: 'cryo' }).coneTabs && design({ ...one, vessel: 'cryo' }).rest === 3);
    check('cone ribs can be switched off', !design({ ...one, vessel: 'f50', coneSeat: false }).coneTabs);

    // Base: a spoked ring has four openings, the push-out hole one more; a closed disc without a hole none.
    const disc = build(design({ ...one, vessel: 'cryo', base: 'disc', pushHole: false }), 64);
    const ring = build(design({ ...one, vessel: 'f50' }), 64);
    const ringNoHole = build(design({ ...one, vessel: 'f50', pushHole: false }), 64);
    check('solid disc base, closed bottom: one closed solid with no through-holes', disc.m.watertight && disc.genus === 0, `genus ${disc.genus}`);
    check('spoked ring: four openings between the spokes, and the push-out hole goes through', ring.m.watertight && ringNoHole.genus === 4 && ring.genus === 5,
      `genus ${ringNoHole.genus} / ${ring.genus}`);
    check('the stand is the stated size', near(ring.m.size[0], f50.baseD, 1e-3) && near(ring.m.size[2], f50.height, 1e-6) && Math.abs(ring.m.zMin) < 1e-6);

    // Ribs: each adds its profile between the bore and tabR, (x)·0.8 + x²/2 with x = hole/2 - tabR, times its width.
    const rb = design({ ...one, vessel: 'f15', grip: '4', pushHole: false, autoHeight: false, height: 60, autoBase: false, baseD: 100 });
    const withRibs = build(rb, 128);
    const noRibs = build(design({ ...one, vessel: 'f15', grip: '4', pushHole: false, coneSeat: false, autoHeight: false, height: 60, autoBase: false, baseD: 100 }), 128);
    const x = rb.hole / 2 - rb.tabR;
    const ribV = 4 * Math.max(1.6, 4 * rb.nozzle) * (0.8 * x + x * x / 2);
    check('four cone ribs inside a four-finger sleeve', near(withRibs.v - noRibs.v, ribV, 0.06) && withRibs.m.watertight, `${(withRibs.v - noRibs.v).toFixed(0)} vs ${ribV.toFixed(0)} mm3`);

    // Fingers: each slot takes slot width x wall x its height out of the sleeve.
    const closed = build(design({ ...one, vessel: 'f15', coneSeat: false, pushHole: false }), 128);
    const four = design({ ...one, vessel: 'f15', grip: '4', coneSeat: false, pushHole: false });
    const fingers = build(four, 128);
    const slotV = 4 * four.slotW * four.sleeveT * (four.height - four.slotLo);
    check('four slots cut the sleeve into four fingers', near(closed.v - fingers.v, slotV, 0.05) && fingers.m.watertight && fingers.genus === closed.genus,
      `${(closed.v - fingers.v).toFixed(0)} vs ${slotV.toFixed(0)} mm3`);
    check('3 and 6 fingers, square cuvettes and custom sizes build as closed solids',
      build(design({ ...one, vessel: 'f50', grip: '3' })).m.watertight && build(design({ ...one, vessel: 'f50', grip: '6' })).m.watertight &&
      build(design({ ...one, vessel: 'cuvette', grip: '4' })).m.watertight && build(design({ ...one, vessel: 'customRound', customSize: 40, customLength: 150, base: 'disc' })).m.watertight);
    check('a base too small for a ring becomes a disc, and says so',
      !design({ ...one, vessel: 'pcr' }).baseRing && validate(design({ ...one, vessel: 'pcr' })).some((i) => /solid disc/.test(i.text)));
    check('a narrow hand-set base is warned about', validate(design({ ...one, vessel: 'f50', autoBase: false, baseD: 50 })).some((i) => /tips easily/.test(i.text)));
    check('a single stand survives a share link', (() => {
      const q = sanitize({ ...defaults(), style: 'single', vessel: 'f50', grip: '4', base: 'disc', autoBase: false, baseD: 90, pushHole: false });
      return JSON.stringify(fromQuery(toQuery(q))) === JSON.stringify(q);
    })());
  }

  // ---- open stand: dividers, rounded frame corners, position numbers ----
  {
    const bare = { style: 'stand', vessel: 'f15', cols: 9, rows: 1, corner: 0, chamfer: 0, edge: 0, fillet: 0, printShape: false, margin: 10 };
    const b0 = design(bare);
    const plain = build(b0, 128);
    const dR = design({ ...bare, dividers: 'three' });
    const div = build(dR, 128);
    const between = dR.height - 2 * dR.plateT;
    check('dividers after every third position: two walls between the plates', dR.divXs.length === 2 && near(div.v - plain.v, 2 * dR.wallT * dR.sizeY * between, 0.002) && div.m.watertight,
      `${(div.v - plain.v).toFixed(0)} vs ${(2 * dR.wallT * dR.sizeY * between).toFixed(0)} mm3`);
    check('dividers sit in the middle of the gaps', dR.divXs.every((x) => Math.abs(((x + dR.spanX / 2) / dR.pitchX) % 1 - 0.5) < 1e-9));
    check('no room between positions for a divider is an error',
      errors(design({ style: 'stand', vessel: 'f15', autoSpacing: false, pitchX: 21, pitchY: 25, dividers: 'two' })).some((i) => /not enough room/.test(i.text)));
    check('dividers with fillets build', build(design({ style: 'stand', vessel: 'f15', cols: 8, rows: 2, dividers: 'two', fillet: 3 })).m.watertight);

    // Rounded frame corners: the outside loses (1 - pi/4) R² per corner, the inside fillet of R - t gives (1 - pi/4)(R - t)² back.
    const R = 10;
    const fr = design({ ...bare, frameR: R });
    const frame = build(fr, 256);
    const expectF = 2 * fr.sizeY * (1 - Math.PI / 4) * (R * R - (R - 4) ** 2);
    check('rounded frame corners: the bend keeps the wall thickness', fr.frameRC === R && fr.topFilletR === R - 4 && near(plain.v - frame.v, expectF, 0.02) && frame.m.watertight,
      `${(plain.v - frame.v).toFixed(0)} vs ${expectF.toFixed(0)} mm3`);
    check('the rounding is held back so it ends before the outermost openings', design({ ...bare, margin: 4, frameR: 40 }).frameRC <= 4 - 0.6 + 4 + 1e-9 &&
      validate(design({ ...bare, margin: 4, frameR: 40 })).some((i) => /round the frame corners by/.test(i.text)));
    check('stacking feet keep the frame corners square', design({ ...bare, frameR: 10, feet: 'stack' }).frameRC < 1);

    // Position numbers: a pad per column, rising above the bottom plate; printed numbers are cut into it.
    const padR = design({ ...bare, labels: 'pads', labelD: 12 });
    const pads = build(padR, 256);
    const rr = padR.labelD / 2, d = rr - padR.plateT; // pad centre above the plate top... area of the disc above the plate:
    const above = rr * rr * Math.acos(-d / rr) + d * Math.sqrt(rr * rr - d * d);
    check('sticker pads: one per position, standing on the bottom plate', near(pads.v - plain.v, 9 * padR.labelT * above, 0.02) && pads.m.watertight,
      `${(pads.v - plain.v).toFixed(0)} vs ${(9 * padR.labelT * above).toFixed(0)} mm3`);
    const dig = build(design({ ...bare, labels: 'digits', labelD: 12 }), 256);
    check('printed numbers are cut into the pads', dig.v < pads.v && pads.v - dig.v < 9 * 25 && dig.m.watertight, `${(pads.v - dig.v).toFixed(1)} mm3 cut`);
    check('numbers 1 to 24 build', build(design({ style: 'stand', vessel: 't15', cols: 24, rows: 1, labels: 'digits', margin: 6 })).m.watertight);
    check('numbers need the bottom plate', !design({ ...bare, labels: 'pads', standFloor: false }).labelsOn &&
      validate(design({ ...bare, labels: 'pads', standFloor: false })).some((i) => /bottom plate/.test(i.text)));
    check('everything together builds: dividers, numbers, rounded corners, fillets, teardrops, bevel',
      build(design({ style: 'stand', vessel: 'f15', cols: 9, rows: 1, dividers: 'three', labels: 'digits', frameR: 14, margin: 10, fillet: 3, edge: 1, chamfer: 1 })).m.watertight);
  }

  // ---- the guided tour ----
  {
    const shown = [...Object.entries(SHOWCASE), ...ADAPT.map((p, i) => ['settings ' + (i + 1), p])].map(([k, p]) => [k, resolve(sanitize(p))]);
    const flagged = shown.flatMap(([k, r]) => validate(r).map((i) => `${k}: ${i.text}`));
    check('the tour only shows holders the tool accepts without a warning', flagged.length === 0, flagged.join(' | '));
    check('the tour\'s holders build as closed solids', [...Object.values(SHOWCASE), ...ADAPT].every((p) => measure(makeMesh(k, p, null, 48)).watertight));
    const whole = makeMesh(k, SHOWCASE.single, null, 64);
    const open = makeMesh(k, SHOWCASE.single, -45, 64);
    const half = measure(open);
    check('the cut-open stand is one closed solid, its front half gone', half.watertight && near(half.size[2], measure(whole).size[2], 1e-6) &&
      open.indices.length !== whole.indices.length);
  }

  // ---- base plate for an open stand ----
  {
    const slim = { style: 'stand', vessel: 'f15', cols: 6, rows: 1, edge: 0, corner: 0 };
    const tips = (r) => validate(r).some((i) => i.key === 'tips');
    const bare = design(slim);
    const pl = design({ ...slim, basePlate: true, plateReach: 15 });
    check('a slim stand tips; its guide starts at the base plate', tips(bare) && validate(bare).find((i) => i.key === 'tips').fix[0].id === 'basePlate');
    check('with a base plate it no longer tips, and no other feet', !tips(pl) && pl.feet === 'none' && !shownFor(PARAMS.find((d) => d.id === 'feet'), pl));
    const plate = buildBasePlate(k, pl, 64);
    const pm = measure(toMesh(plate));
    // A square-cornered plate: the slab less the pocket (plateFit all round, pocket deep).
    const want = (pl.sizeX + 6) * (pl.sizeY + 30) * 4 - (pl.sizeX + 0.6) * (pl.sizeY + 0.6) * 1.6;
    check('the base plate: closed, its size, the pocket cut out', pm.watertight && near(pm.size[0], pl.sizeX + 6, 1e-6) && near(pm.size[1], pl.sizeY + 30, 1e-6) &&
      near(pm.size[2], 4, 1e-6) && near(solidVolume(plate), want, 0.002), `${solidVolume(plate).toFixed(0)} vs ${want.toFixed(0)} mm3`);
    const stand = measure(toMesh(buildHolder(k, pl, 48)));
    check('the stand stands on the floor of the pocket', near(stand.zMin, 4 - 1.6, 1e-6) && near(pl.benchY, pl.sizeY + 30, 1e-9) && pl.outerZ === pl.height);
    plate.delete();
    const two = threeMf([{ mesh: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) }, name: 'Stand' },
      { mesh: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) }, name: 'Base plate' }], 'two', defaults());
    const doc2 = new DOMParser().parseFromString(new TextDecoder().decode(await zipRead(two.buffer, '3D/3dmodel.model')), 'application/xml');
    check('the 3MF keeps the stand and its base plate as two objects', doc2.querySelectorAll('object').length === 2 && doc2.querySelectorAll('build item').length === 2 &&
      doc2.querySelector('object[name="Base plate"]') !== null);
    check('merging two meshes keeps every triangle', mergeMeshes({ positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) }, { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) }).indices[5] === 5);
  }

  // ---- hole fit test ----
  {
    const t0 = fitTest({ ...defaults(), vessel: 'f15' });
    check('fit test: five holes, 0.15 mm apart, centred on the current fit, labelled with it',
      JSON.stringify(t0.fits) === JSON.stringify([-0.3, -0.15, 0, 0.15, 0.3]) && t0.labels.join(' ') === '-0.3 -0.15 0 +0.15 +0.3' && t0.holes[2] === 18);
    check('fit test: shifted with the fit, held inside its range', fitTest({ ...defaults(), fit: 0.1 }).labels.join(' ') === '-0.2 -0.05 +0.1 +0.25 +0.4' &&
      fitTest({ ...defaults(), fit: -0.5 }).fits[0] === -0.5 && fitLabel(0) === '0');
    const built0 = buildFitTest(k, t0, design({ vessel: 'f15' }), 48);
    const m0 = measure(toMesh(built0));
    // Five through-holes: genus 5 (the cut-in numbers do not go through).
    check('fit test strip: closed, the stated size, five through-holes', m0.watertight && near(m0.size[0], t0.sizeX, 1e-6) && near(m0.size[1], t0.sizeY, 1e-6) &&
      near(m0.size[2], 8, 1e-6) && built0.genus() === 5, `genus ${built0.genus()}`);
    built0.delete();
    const bad = [];
    for (const vessel of Object.keys(VESSELS)) {
      for (const style of ['block', 'stand', 'tray', 'single']) {
        const p = { ...defaults(), vessel, style };
        const t = fitTest(p);
        const s = buildFitTest(k, t, resolve(p), 32);
        if (!measure(toMesh(s)).watertight || s.genus() !== 5 || t.digitH < 2.4) bad.push(`${style} ${vessel} (${t.digitH} mm, ${t.rows} rows)`);
        s.delete();
      }
    }
    check('fit test builds for every vessel and kind, with readable numbers', bad.length === 0, bad.join(', '));
    const st = fitTest({ ...defaults(), style: 'stand', vessel: 'f15' });
    check('for a holder printed on its side the strip has its teardrops and way up', st.tear && st.printUp === 'y' && !fitTest({ ...defaults(), vessel: 'f15' }).tear);
  }

  // ---- files ----
  const stl = stlBuffer(plain.mesh, 'test');
  check('STL size and triangle count', stl.byteLength === 84 + (plain.mesh.indices.length / 3) * 50 && new DataView(stl).getUint32(80, true) === plain.mesh.indices.length / 3);
  const pkg = threeMf(plain.mesh, 'Holder <test> & "more"', custom);
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(await zipRead(pkg.buffer, '3D/3dmodel.model')), 'application/xml');
  check('3MF model is well-formed, in millimetres, with every triangle',
    !doc.querySelector('parsererror') && doc.documentElement.getAttribute('unit') === 'millimeter' &&
    doc.getElementsByTagName('triangle').length === plain.mesh.indices.length / 3);
  check('3MF carries the design and restores it', JSON.stringify(sanitize(await readDesign(pkg.buffer))) === JSON.stringify(custom));
} catch (e) {
  failed++;
  lines.push('ERROR  ' + (e && e.stack ? e.stack : e));
}

lines.push('', failed ? `${failed} FAILED of ${count}` : `ALL ${count} PASSED`);
document.body.textContent = lines.join('\n');
document.title = failed ? 'FAILED' : 'PASSED';
