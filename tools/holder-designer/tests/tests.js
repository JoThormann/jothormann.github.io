// Browser test page: open tests.html. The title reads PASSED or FAILED.
import { PARAMS, defaults, sanitize, resolve, validate, toQuery, fromQuery, shapeKey, STYLES } from '../src/params.js';
import { VESSELS } from '../src/vessels.js';
import { loadKernel } from '../src/geometry/kernel.js';
import { buildHolder, positions, toMesh, solidVolume } from '../src/geometry/build.js';
import { analyse } from '../src/print.js';
import { stlBuffer } from '../src/export/stl.js';
import { threeMf, readDesign } from '../src/export/threemf.js';
import { zipRead } from '../src/export/zip.js';

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
    check('fill a box: handles are counted inside the box', (() => {
      const h = design({ fitBox: true, boxX: 130, boxY: 130, boxGap: 1, handles: 'lip', handleLen: 15 });
      return h.outerX === 128 && h.cols === 4 && h.sizeX === 98;
    })());
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
    check('too shallow for windows: none cut, and said so',
      !design({ style: 'tray', vessel: 'pcr', windows: true }).hasWindows && validate(design({ style: 'tray', vessel: 'pcr', windows: true })).some((i) => /too shallow/.test(i.text)));

    // Grip lips: a 3 mm flat with a 45° underside at each end.
    const lR = design({ ...flat, handles: 'lip', handleLen: 12 });
    const lip = build(lR, 256);
    const lipV = 2 * lR.sizeY * (12 * 3 + 0.5 * 12 * 12);
    check('grip lips add two wedges and widen the holder by twice the reach', near(lip.v - plain.v, lipV, 0.01) && near(lip.m.size[0], lR.sizeX + 24, 1e-6) && lip.m.watertight,
      `${(lip.v - plain.v).toFixed(0)} vs ${lipV.toFixed(0)} mm3`);
    check('outer width in the readout includes the handles', lR.outerX === lR.sizeX + 24);

    // Finger loops.
    const oR = design({ ...flat, style: 'stand', vessel: 'f50', cols: 4, rows: 1, handles: 'loop', handleLen: 26 });
    const loop = build(oR, 128);
    check('finger loops: 20 mm hole at 26 mm reach, as on your stands', oR.loopHole === 21.6 || Math.abs(oR.loopHole - 20) < 2, `${oR.loopHole} mm`);
    check('finger loops build as part of one closed solid and widen it by twice the reach', loop.m.watertight && near(loop.m.size[0], oR.sizeX + 52, 1e-3));
    check('small loops are flagged', validate(design({ handles: 'loop', handleLen: 10 })).some((i) => /tight for a finger/.test(i.text)));

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

    const all = build(design({ vessel: 'cuvette', cols: 4, rows: 1, windows: true, handles: 'lip', feet: 'stack', margin: 9 }));
    check('cuvette holder with windows, lips and stacking feet builds', all.m.watertight && all.v > 0);
    const linked = sanitize({ ...defaults(), fitBox: true, boxX: 150, handles: 'loop', handleLen: 24, windows: true, feet: 'pads', padD: 12 });
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
    // Each teardrop adds the area between the 45° roof and the round hole, up to 1.25 radii: through one 4 mm plate.
    const R = 9;
    const tipArea = (() => { // integrate the gap between roof line and circle numerically
      let a = 0; const n = 4000;
      for (let i = 0; i < n; i++) {
        const x = -R + (2 * R * (i + 0.5)) / n;
        const roof = Math.min(R * Math.SQRT2 - Math.abs(x), 1.25 * R);
        const circle = Math.sqrt(R * R - x * x);
        if (roof > circle) a += (roof - circle) * (2 * R / n);
      }
      return a;
    })();
    check('each teardrop removes exactly its pointed part from the plate', near(roundHoles.v - tear.v, 8 * tipArea * 4, 0.02), `${(roundHoles.v - tear.v).toFixed(0)} vs ${(8 * tipArea * 4).toFixed(0)} mm3`);
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

    // Finger loops with teardrop holes.
    const lp = { corner: 0, chamfer: 0, edge: 0, handles: 'loop', handleLen: 26, autoHeight: false, height: 40, depth: 20 };
    const tl = build(design(lp), 128);
    const rl = build(design({ ...lp, printShape: false }), 128);
    check('finger loops get teardrop holes when printed upright', design(lp).tearLoops && tl.v < rl.v && tl.m.watertight && hang(tl, 2) < hang(rl, 2));

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
      build(design({ style: 'stand', vessel: 'f50', cols: 4, rows: 1, handles: 'loop', handleLen: 26, guide: true, edge: 1, fillet: 4, feet: 'stack', margin: 9 })).m.watertight &&
      build(design({ vessel: 'cuvette', cols: 4, rows: 1, windows: true, handles: 'lip', feet: 'pads', edge: 1, margin: 6 })).m.watertight);
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
