// The guided tour: a few finished holders, one at a time, with every feature
// pointed out on the model itself. Opened on its own it has a bar of steps;
// embedded (?embed), the page around it drives it through window.holderTour:
//
//   holderTour.steps        [{ id, label, text }]
//   holderTour.go(i)        show step i; resolves once it is on screen
//   holderTour.pause(on)    stop moving (out of view)
//   holderTour.link(i)      the share-link part (after #) of the holder in step i
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { sanitize, resolve, toQuery } from './params.js';
import { VESSELS } from './vessels.js';
import { positions } from './geometry/build.js';
import { materials, lights, vesselGeometry } from './view.js';
import { SHOWCASE, ADAPT } from './tour-build.js';

const QS = new URLSearchParams(location.search);
const EMBED = QS.has('embed');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dark = matchMedia('(prefers-color-scheme: dark)');
const $ = (id) => document.getElementById(id);
const rad = (d) => (d * Math.PI) / 180;
const polar = (r, deg, z) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg)), z];
const mm = (v) => String(Number(v.toFixed(1)));

// ---------- the holders on show (tour-build.js) ----------
const D = SHOWCASE;
const R = Object.fromEntries(Object.entries(D).map(([k, p]) => [k, resolve(sanitize(p))]));

const foot = (r) => [r.sizeX, r.sizeY];
const top = (r) => r.rest + r.footH + r.v.length; // top of the tube caps
const cols = (r) => positions(r).slice(0, r.cols).map(([x]) => x);
const vessel = (r) => r.v.label.replace(/,.*$/, '').replace(/^\w/, (c) => c.toLowerCase());

/** Two rows, short holders in front: x, y of each holder's centre. */
function lineup(back, front, gap = 26) {
  const row = (ks, y) => {
    const w = ks.reduce((s, k) => s + foot(R[k])[0], 0) + gap * (ks.length - 1);
    let x = -w / 2;
    return ks.map((k) => {
      const at = [x + foot(R[k])[0] / 2, y, 0];
      x += foot(R[k])[0] + gap;
      return at;
    });
  };
  const deep = (ks) => Math.max(...ks.map((k) => foot(R[k])[1]));
  return [...row(back, deep(back) / 2 + gap / 2), ...row(front, -deep(front) / 2 - gap / 2)];
}

/*
 * A step: the holders it shows (design, place, cut open or not, tubes in or not), where the camera
 * looks from (az, el in degrees; az -90 is straight from the front), and the pins. A pin points at
 * `at` on holder `m` (in that holder's own coordinates; m: -1 for the scene) and has a label to
 * its `side`: left, right (default: the side of the model it is on), above or below.
 */
function makeSteps() {
  const steps = [];
  {
    const back = ['stand', 'single'];
    const front = ['block', 'tray', 'pcr'];
    const at = lineup(back, front);
    const keys = [...back, ...front];
    const name = { single: 'Single stand', stand: 'Open stand', block: 'Solid block', tray: 'Tray', pcr: 'Solid block' };
    steps.push({
      id: 'kinds', label: 'Four kinds',
      text: 'Four kinds of holder for twelve kinds of tube, vial and cuvette, from 0.2 ml PCR tubes to 50 ml, or any size you measure.',
      models: keys.map((k, i) => ({ d: k, at: at[i] })),
      view: { az: -64, el: 30, zoom: 1.32 },
      pins: keys.map((k, i) => {
        const r = R[k];
        const behind = i < back.length;
        return {
          m: i, at: behind ? [0, 0, top(r)] : [0, -foot(r)[1] / 2, 0], side: behind ? 'above' : 'below',
          title: name[k], sub: `${r.count === 1 ? 'One' : r.count} ${vessel(r)}${r.count === 1 ? '' : 's'}`,
        };
      }),
      live: 'stand',
    });
  }
  {
    // One block, changed a setting at a time; the camera stays put, framed for the biggest.
    const variants = ADAPT.map((p, i) => ({ key: 'adapt' + i, p, r: resolve(sanitize(p)) }));
    const wide = Math.max(...variants.map((v) => Math.hypot(v.r.sizeX, v.r.sizeY)));
    const tall = Math.max(...variants.map((v) => top(v.r)));
    steps.push({
      id: 'adapt', label: 'Your settings',
      text: 'Every size is a setting. Change the tube, the count or the corners, or add viewing slots, and the holder is rebuilt to match, spacing and size included.',
      variants,
      models: [variants[0]],
      view: { az: -58, el: 30, zoom: 0.9, shift: 0.11, focus: { center: [0, 0, tall * 0.42], radius: Math.hypot(wide / 2, tall / 2) } },
      pins: [],
      live: ADAPT[ADAPT.length - 1],
    });
  }
  {
    const r = R.single;
    const Rs = r.sleeveR;
    steps.push({
      id: 'single', label: 'Single stand',
      text: 'One tube on a wide base, for the tube that lives next to an instrument. The base grows with the tube, so a full one does not tip over.',
      models: [{ d: 'single' }],
      view: { az: -55, el: 24, zoom: 1.28 },
      pins: [
        { at: polar(r.v.top / 2, -60, r.rest + r.v.length - 12), title: 'Free to grab', sub: `${mm(r.stickOut)} mm of the tube stands clear of the sleeve`, side: 'right' },
        { at: polar(r.hole / 2 + r.chamferC / 2 + 0.3, 120, r.height), title: 'Funnel at the mouth', sub: 'A 45° lead-in guides the tube in', side: 'left' },
        { at: polar(Rs, -45, r.slotLo + 0.55 * (r.height - r.slotLo)), title: 'Springy fingers', sub: 'Four slots let the sleeve hug the tube. Closed, three or six fingers are one click away.', side: 'right' },
        { at: polar(Rs + r.collar * 0.5, -110, r.baseT + r.collar * 0.5), title: '45° collar', sub: 'Stiffens the joint to the base and prints without support', side: 'left' },
        { at: polar(r.baseD / 2 - r.ringW / 2, -20, r.baseT), title: 'Spoked ring base', sub: `${r.baseD} mm across, 0.9 × the loaded height. Or a solid disc.`, side: 'right' },
      ],
      live: 'single',
    });
  }
  {
    // Cut open along the line through two of the ribs, which then show in profile left and right.
    const r = R.single;
    const rin = r.hole / 2 + 0.4;
    const mid = (r.tabR + rin) / 2;
    steps.push({
      id: 'inside', label: 'Inside',
      text: 'Cut open: small ribs catch the tube by its cone, so it stands straight with its tip off the floor. Everything prints upright, without support.',
      models: [{ d: 'single', cut: -45 }],
      view: { az: -45, el: 12, focus: { center: [0, 0, 24], radius: 36 } },
      pins: [
        { at: polar(mid, 45, r.seatZ - 0.3), title: 'Cone ribs', sub: 'The tube rests on its cone, not its point, and stands straight', side: 'right' },
        { at: [0, 0, r.rest], title: 'Tip off the floor', sub: '2 mm clear', side: 'right' },
        { at: polar(mid + 0.6, 225, r.seatZ - 1.2 - (rin - r.tabR) / 2), title: '45° underside', sub: 'The ribs need no support when printed', side: 'left' },
        { at: polar(r.hole / 2 + r.sleeveT / 2, 225, r.height - 14), title: `${mm(r.sleeveT)} mm sleeve wall`, sub: 'Thin enough to spring, thick enough to hold', side: 'left' },
        { at: [0, 0, r.baseT * 0.5], title: 'Push-out hole', sub: 'Push a tight tube up from below. Spills drain out.', side: 'left' },
      ],
      live: 'single',
    });
  }
  {
    const r = R.stand;
    const xs = cols(r);
    const y0 = -r.sizeY / 2;
    const X = r.sizeX / 2 - r.frameRC;
    const xw = r.sizeX / 2 - r.wallT;
    steps.push({
      id: 'stand', label: 'Open stand',
      text: 'For long tubes: plates between two end walls. Dividers, numbers and rounded corners are switched on here; each is one setting.',
      models: [{ d: 'stand' }],
      view: { az: -64, el: 20, zoom: 1.2 },
      pins: [
        { at: [xs[6], r.hole / 2 + r.tearExtra * 0.4, r.height], title: 'Teardrop openings', sub: 'Printed on its back, a pointed top needs no support', side: 'right' },
        { at: [X + r.frameRC * Math.SQRT1_2, y0, r.height - r.frameRC + r.frameRC * Math.SQRT1_2], title: 'Rounded frame corners', sub: 'Like a bent sheet: the wall stays as thick through the bend', side: 'right' },
        { at: [r.divXs[1], y0, r.height * 0.55], title: 'Dividers', sub: 'Bays of three for triplicates. They stiffen a long stand too.', side: 'right' },
        { at: [-xw + r.filletR * 0.3, y0, r.height - r.plateT - r.topFilletR * 0.3], title: 'Rounded inside joints', sub: 'Where a stand would break first', side: 'left' },
        { at: [xs[1], y0 + 3, r.plateT], title: 'Bottom plate', sub: `The tubes stand on it, ${mm(r.stickOut)} mm showing above the top`, side: 'left' },
        { at: [xs[0], y0, r.labelD / 2], title: 'Printed numbers', sub: '1 to 9, cut into a pad at each place. Or plain pads for stickers.', side: 'left' },
      ],
      live: 'stand',
    });
  }
  {
    const r = R.block;
    const H = r.height + r.footH;
    const [x0, x1, x2, x3] = cols(r);
    const yf = -r.spanY / 2;
    const c = r.cornerR;
    steps.push({
      id: 'block', label: 'Solid block',
      text: 'For short tubes and vials, here 2 ml cryovials. The spacing comes from the tube, so caps never touch, and empty blocks stack.',
      models: [{ d: 'block' }],
      view: { az: -60, el: 32, zoom: 1.35 },
      pins: [
        { at: [x3, yf + r.hole / 2 + r.chamferC / 2, H], title: 'Funnel at each hole', sub: 'A small slope guides each vial in', side: 'right' },
        { at: [r.sizeX / 2 - r.footInset, r.sizeY / 2 - r.footInset, H], title: 'Stacking pockets', sub: 'Feet underneath drop into the block below', side: 'right' },
        { at: [r.sizeX / 2 - c + c * Math.SQRT1_2, -r.sizeY / 2 + c - c * Math.SQRT1_2, r.footH + r.height * 0.5], title: 'Rounded corners', sub: 'They print cleaner and sit better in the hand', side: 'right' },
        { at: [(x1 + x2) / 2, yf, H], title: 'Spaced for the caps', sub: `${mm(r.pitchX)} mm apart, the usual rack spacing for this vial`, side: 'left' },
        { at: [(x0 + x1) / 2, -r.sizeY / 2 + r.edgeC / 2, H - r.edgeC / 2], title: 'Bevelled edges', sub: 'Top and bottom, so no sharp edge and no squashed first layer', side: 'left' },
      ],
      live: 'block',
    });
  }
  {
    const r = R.tray;
    const xs = cols(r);
    const y0 = -r.sizeY / 2;
    const peak = Math.min(r.windowW / 2, r.windowHi - r.windowLo - 1);
    steps.push({
      id: 'tray', label: 'Tray',
      text: 'Pockets packed wall to wall, here for square cuvettes, with slots that let the light of a photometer straight through.',
      models: [{ d: 'tray' }],
      view: { az: -70, el: 22, zoom: 1.4 },
      pins: [
        { at: [xs[3], r.spanY / 2 + r.hole * 0.3, r.height], title: 'Square pockets', sub: 'The most cuvettes in the least space', side: 'right' },
        { at: [xs[4], y0, (r.windowLo + r.windowHi - peak) / 2], title: 'Viewing slots', sub: 'Front and back: see the fill level, or shine light through', side: 'right' },
        { at: [xs[1], y0, r.windowHi - peak * 0.35], title: 'Pointed slot tops', sub: 'A 45° peak instead of a flat top, so nothing has to bridge', side: 'left' },
        { at: [(xs[0] + xs[1]) / 2, -r.spanY / 2, r.height], title: `${mm(r.trayWall)} mm walls`, sub: 'Shared between pockets', side: 'left' },
      ],
      live: 'tray',
    });
  }
  {
    // The stand as the tool lays it on the printer: on its front, the openings sideways.
    const r = R.stand;
    const xs = cols(r);
    const place = new THREE.Matrix4().makeTranslation(0, r.height / 2, r.sizeY / 2).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    steps.push({
      id: 'print', label: 'Ready to print',
      text: 'The tool picks the way up that needs no support, checks the part fits your printer, and hands over a 3MF or STL file.',
      models: [{ d: 'stand', matrix: place, tubes: false }],
      bed: [r.bedX, r.bedY],
      view: { az: -58, el: 34, zoom: 1.4 },
      pins: [
        { at: [xs[2], r.hole / 2 + r.tearExtra * 0.6, r.height], title: 'Points face up', sub: 'Every opening is a teardrop: no support inside', side: 'left' },
        { at: [xs[7] + 12, r.sizeY / 2, r.height - r.plateT / 2], title: 'Plates stand upright', sub: 'Lying on its front, nothing overhangs', side: 'right' },
        { m: -1, at: [r.bedX / 2, -r.bedY / 2, 0], title: 'Fits your printer', sub: `${mm(r.sizeX)} × ${mm(r.height)} mm on a ${r.bedX} × ${r.bedY} mm bed`, side: 'right' },
      ],
      live: 'stand',
    });
  }
  return steps;
}
const STEPS = makeSteps();

// ---------- models, built off the page ----------
const meshes = new Map(); // key -> Promise<{ positions, indices }>
const waiting = new Map(); // key -> { resolve, reject, job }
let worker = null;
let local = null; // the page builds them itself if the worker cannot

function buildHere(job) {
  if (!local) {
    local = Promise.all([import('./geometry/kernel.js'), import('./tour-build.js')]).then(async ([k, b]) => ({ kernel: await k.loadKernel(), make: b.makeMesh }));
  }
  return local.then(({ kernel, make }) => make(kernel, job.p, job.cut));
}
function giveUpOnWorker() {
  if (!worker) return;
  worker.terminate();
  worker = null;
  for (const [key, w] of waiting) {
    waiting.delete(key);
    buildHere(w.job).then(w.resolve, w.reject);
  }
}
try {
  worker = new Worker(new URL('./tour-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { key, mesh, error } = e.data;
    const w = waiting.get(key);
    if (!w) return;
    if (error) return giveUpOnWorker();
    waiting.delete(key);
    w.resolve(mesh);
  };
  worker.onerror = (e) => {
    console.warn('Tour worker failed; building on the page instead.', e.message);
    giveUpOnWorker();
  };
} catch {
  worker = null;
}

function meshFor(model) {
  const job = { p: model.p || D[model.d], cut: model.cut ?? null };
  const key = (model.key || model.d) + '|' + job.cut;
  if (!meshes.has(key)) {
    meshes.set(key, new Promise((resolve, reject) => {
      if (worker) {
        waiting.set(key, { resolve, reject, job });
        worker.postMessage({ key, ...job });
      } else {
        buildHere(job).then(resolve, reject);
      }
    }));
  }
  return meshes.get(key);
}
// Ask for every model now, in the order they are shown.
for (const s of STEPS) for (const m of s.variants || s.models) meshFor(m);

// ---------- the scene ----------
const stage = $('stage');
const holder = $('view');
const notesEl = $('notes');
const leaders = $('leaders');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  holder.appendChild(renderer.domElement);
} catch (e) {
  console.error(e);
  holder.innerHTML = '<p class="noview">This browser cannot show 3D graphics, so the tour cannot play here.</p>';
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 20000);
camera.up.set(0, 0, 1);
lights(scene, camera);
const mat = materials();
const bedMat = {
  plate: new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }),
  grid: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 }),
};
function theme() {
  mat.theme();
  bedMat.plate.color.set(dark.matches ? 0x2b3538 : 0xd5d9d6);
  bedMat.grid.color.set(dark.matches ? 0x56666a : 0x9aa4a3);
}
theme();
dark.addEventListener('change', theme);

const root = new THREE.Group();
scene.add(root);
let solids = []; // the holders' meshes, for seeing whether a pin is hidden
let bounds = new THREE.Box3();

// Each holder is turned into a scene object once and kept, so going back to a step, or
// swapping one setting for the next, costs nothing.
const groups = new Map();
function groupFor(model, mesh) {
  const key = (model.key || model.d) + '|' + (model.cut ?? null) + '|' + (model.tubes !== false);
  if (!groups.has(key)) {
    const r = model.r || R[model.d];
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    const body = new THREE.Mesh(toCreasedNormals(geo, Math.PI / 6), mat.body);
    g.add(body, new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), mat.edge));
    geo.dispose();
    g.userData.body = body;
    if (model.tubes !== false) {
      const at = positions(r);
      const inst = new THREE.InstancedMesh(vesselGeometry(r.v), mat.vessel, at.length);
      const m = new THREE.Matrix4();
      at.forEach(([x, y], k) => inst.setMatrixAt(k, m.makeTranslation(x, y, r.rest + r.footH)));
      inst.renderOrder = 1;
      g.add(inst);
    }
    groups.set(key, g);
  }
  const g = groups.get(key);
  g.matrix.copy(model.matrix || new THREE.Matrix4().makeTranslation(...(model.at || [0, 0, 0])));
  return g;
}

function clear() {
  for (const child of [...root.children]) {
    root.remove(child);
    if (!child.userData.body) child.traverse((o) => o.geometry && o.geometry.dispose());
  }
  solids = [];
}

function compose(step, list, models = step.models) {
  clear();
  models.forEach((model, i) => {
    const g = groupFor(model, list[i]);
    solids.push(g.userData.body);
    root.add(g);
  });
  if (step.bed) {
    const [bx, by] = step.bed;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(bx, by, 1.5), bedMat.plate);
    plate.position.set(0, 0, -0.76);
    const grid = new THREE.GridHelper(bx, Math.round(bx / 16), bedMat.grid.color, bedMat.grid.color);
    grid.material = bedMat.grid;
    grid.rotation.x = Math.PI / 2;
    grid.scale.set(1, 1, by / bx);
    grid.position.z = 0.02;
    root.add(plate, grid);
  }
  root.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(root);
}

// ---------- camera ----------
const cam = { az: -60, el: 30, dist: 400, target: new THREE.Vector3(), from: null, t0: 0 };
let fitted = null; // { az, el, dist, target } for the step on screen

function frameFor(step) {
  const v = step.view;
  let center;
  let radius;
  if (v.focus) {
    center = new THREE.Vector3(...v.focus.center);
    radius = v.focus.radius;
  } else {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    center = sphere.center;
    radius = sphere.radius;
  }
  // The model keeps to the middle of the frame, so the labels have room left and right;
  // on a narrow stage, room above and below instead.
  const half = rad(camera.fov / 2);
  const halfWide = Math.atan(Math.tan(half) * camera.aspect * (narrow ? 0.92 : 0.56));
  const halfHigh = narrow ? Math.atan(Math.tan(half) * (v.shift ? 0.56 : 0.62)) : half * 0.94;
  // Narrow, the close-ups are held back so the labels above and below stay off the model.
  const zoom = narrow && !v.focus ? Math.min(v.zoom || 1, 1.05) : v.zoom || 1;
  const dist = radius / Math.sin(Math.min(halfHigh, halfWide)) / zoom;
  return { az: v.az, el: v.el, dist, target: center };
}

/** Moves the picture sideways (a share of the width), to make room for a panel. */
function shiftView(step) {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const s = step && step.view.shift;
  // Beside the panel on a wide stage; above it (it sits at the bottom) on a narrow one.
  if (s && w && h) camera.setViewOffset(w, h, narrow ? 0 : -s * w, narrow ? 0.16 * h : 0, w, h);
  else camera.clearViewOffset();
}

// ---------- "Your settings": the panel beside the changing holder ----------
const tune = document.createElement('div');
tune.id = 'tune';
tune.setAttribute('aria-hidden', 'true');
stage.appendChild(tune);
const ROWS = [
  { label: 'Tube', show: (p) => VESSELS[p.vessel].label },
  { label: 'Tubes in a row', show: (p) => p.cols },
  { label: 'Rows', show: (p) => p.rows },
  { label: 'Rounded corners', show: (p) => `${p.corner} mm` },
  { label: 'Viewing slots', show: (p) => (p.windows ? 'On' : 'Off') },
];
const OUT = [
  { label: 'Holds', show: (r) => r.count },
  { label: 'Spacing', show: (r) => `${mm(r.pitchX)} mm` },
  { label: 'Size', show: (r) => `${mm(r.outerX)} × ${mm(r.outerY)} × ${mm(r.outerZ)} mm` },
];
let tuneShown = -1;
function buildTune(step) {
  tuneShown = -1;
  tune.classList.toggle('on', Boolean(step.variants));
  if (!step.variants) return;
  const row = (label) => `<div class="row"><span>${label}</span><b></b></div>`;
  tune.innerHTML = '<p class="sec">Your settings</p>' + ROWS.map((d) => row(d.label)).join('') +
    '<p class="sec out">Worked out for you</p>' + OUT.map((d) => row(d.label)).join('');
}
function showVariant(step, k) {
  if (k === tuneShown) return;
  const first = tuneShown < 0;
  const v = step.variants[k];
  tuneShown = k;
  if (!first) compose(step, [null], [v]); // the scene object is already made (go)
  const p = sanitize(v.p);
  const vals = [...ROWS.map((d) => String(d.show(p))), ...OUT.map((d) => String(d.show(v.r)))];
  tune.querySelectorAll('.row').forEach((c, i) => {
    const b = c.querySelector('b');
    const changed = !first && b.textContent !== vals[i];
    b.textContent = vals[i];
    c.classList.remove('flash');
    if (changed) {
      void c.offsetWidth;
      c.classList.add('flash');
    }
  });
}

function place(now) {
  if (!fitted) return;
  const swing = reduce ? 0 : 9 * Math.sin(((now - cam.t0) / 15000) * Math.PI * 2);
  let az = fitted.az + swing;
  let el = fitted.el;
  let dist = fitted.dist;
  // Coming in: from a little round the side, a little further away.
  const t = reduce ? 1 : Math.min(1, (now - cam.t0) / 1400);
  const e = 1 - Math.pow(1 - t, 3);
  az += (1 - e) * -16;
  el += (1 - e) * 4;
  dist *= 1 + (1 - e) * 0.08;
  const p = new THREE.Vector3(
    Math.cos(rad(el)) * Math.cos(rad(az)),
    Math.cos(rad(el)) * Math.sin(rad(az)),
    Math.sin(rad(el))
  ).multiplyScalar(dist).add(fitted.target);
  camera.position.copy(p);
  camera.lookAt(fitted.target);
  camera.updateMatrixWorld();
}

// ---------- pins ----------
let pins = [];
const tmp = new THREE.Vector3();
const ray = new THREE.Raycaster();

function makePins(step) {
  notesEl.textContent = '';
  leaders.textContent = '';
  pins = step.pins.map((pin, i) => {
    const world = new THREE.Vector3(...pin.at);
    const m = pin.m ?? 0;
    if (m >= 0) world.applyMatrix4(root.children[m].matrix);
    const dot = document.createElement('span');
    dot.className = 'dot';
    const note = document.createElement('div');
    note.className = 'note';
    note.innerHTML = '<b></b><span></span>';
    note.firstChild.textContent = pin.title;
    note.lastChild.textContent = pin.sub || '';
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    notesEl.append(dot, note);
    leaders.append(line);
    return { ...pin, world, dot, note, line, delay: reduce ? 0 : 650 + i * 260, hidden: false, w: 0, h: 0 };
  });
  for (const p of pins) {
    p.w = p.note.offsetWidth;
    p.h = p.note.offsetHeight;
  }
}

function layout(now, check) {
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  // The model's extent on screen: labels line up just outside it.
  let minX = Infinity;
  let maxX = -Infinity;
  for (let k = 0; k < 8; k++) {
    tmp.set(k & 1 ? bounds.max.x : bounds.min.x, k & 2 ? bounds.max.y : bounds.min.y, k & 4 ? bounds.max.z : bounds.min.z).project(camera);
    const x = ((tmp.x + 1) / 2) * W;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  const mid = (minX + maxX) / 2;
  for (const p of pins) {
    tmp.copy(p.world).project(camera);
    p.sx = ((tmp.x + 1) / 2) * W;
    p.sy = ((1 - tmp.y) / 2) * H;
    p.place = p.side || (p.sx < mid ? 'left' : 'right');

    if (check) {
      // Hidden behind the holder: the dot goes hollow, the label stays.
      const d = camera.position.distanceTo(p.world);
      ray.set(camera.position, tmp.copy(p.world).sub(camera.position).normalize());
      ray.far = d;
      const hit = ray.intersectObjects(solids, false)[0];
      p.hidden = Boolean(hit && hit.distance < d - 1.2);
    }
  }
  // Narrow: a label beside the model goes in a band above or below it instead. Chosen once
  // per step, from where the dots first are, so labels do not hop as the model turns; the
  // two bands are evened out, moving the dots nearest the middle across.
  const banded = pins.filter((p) => p.place === 'left' || p.place === 'right');
  if (narrow && banded.length) {
    if (banded.some((p) => !p.band)) {
      for (const p of banded) p.band = p.sy < H / 2 ? 'top' : 'bottom';
      for (;;) {
        const top = banded.filter((p) => p.band === 'top');
        const bottom = banded.filter((p) => p.band === 'bottom');
        if (Math.abs(top.length - bottom.length) <= 1) break;
        const [from, to] = top.length > bottom.length ? [top, 'bottom'] : [bottom, 'top'];
        from.sort((a, b) => Math.abs(a.sy - H / 2) - Math.abs(b.sy - H / 2))[0].band = to;
      }
    }
    for (const p of banded) p.place = p.band;
  }
  const gap = Math.max(28, W * 0.035);
  const stack = (list) => {
    list.sort((a, b) => a.sy - b.sy);
    let y = 12;
    for (const p of list) {
      p.ly = Math.max(p.sy - 14, y);
      y = p.ly + p.h + 10;
    }
    let floor = H - 12;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      if (p.ly + p.h > floor) p.ly = floor - p.h;
      floor = p.ly - 10;
    }
  };
  // A band: labels in rows, each as near above (below) its dot as the ones before it allow.
  // A row that runs out of room on the right first slides left as far as it can; only then
  // does a label start a new row (whose line would cross the row before it).
  const band = (list, down) => {
    list.sort((a, b) => a.sx - b.sx);
    let row = 0;
    let line = [];
    const rowH = Math.max(0, ...list.map((p) => p.h)) + 6;
    for (const p of list) {
      const prev = line[line.length - 1];
      let x = Math.min(W - p.w - 8, Math.max(8, p.sx - p.w / 2));
      if (prev && x < prev.lx + prev.w + 6) x = prev.lx + prev.w + 6;
      const over = x + p.w - (W - 8);
      if (over > 0) {
        if (line.length && line[0].lx - 8 >= over) {
          for (const q of line) q.lx -= over;
          x -= over;
        } else {
          row++;
          line = [];
          x = Math.min(W - p.w - 8, Math.max(8, p.sx - p.w / 2));
        }
      }
      p.lx = x;
      p.ly = down ? 8 + row * rowH : H - 8 - p.h - row * rowH;
      line.push(p);
    }
    for (const p of list) {
      const ax = Math.min(p.lx + p.w - 10, Math.max(p.lx + 10, p.sx));
      p.path = `M${p.sx},${p.sy} L${ax},${down ? p.ly + p.h : p.ly}`;
    }
  };
  band(pins.filter((p) => p.place === 'top'), true);
  band(pins.filter((p) => p.place === 'bottom'), false);
  const left = pins.filter((p) => p.place === 'left');
  const right = pins.filter((p) => p.place === 'right');
  stack(left);
  stack(right);
  for (const p of left) {
    const edge = Math.max(minX - gap, p.w + 12);
    p.lx = edge - p.w;
    p.path = `M${p.sx},${p.sy} L${edge + 14},${p.ly + 14} L${edge},${p.ly + 14}`;
  }
  for (const p of right) {
    const edge = Math.min(maxX + gap, W - p.w - 12);
    p.lx = edge;
    p.path = `M${p.sx},${p.sy} L${edge - 14},${p.ly + 14} L${edge},${p.ly + 14}`;
  }
  for (const p of pins) {
    if (p.place === 'above' || p.place === 'below') {
      p.lx = Math.min(W - p.w - 8, Math.max(8, p.sx - p.w / 2));
      p.ly = p.place === 'below' ? p.sy + 24 : p.sy - 24 - p.h;
      p.path = `M${p.sx},${p.sy} L${p.sx},${p.place === 'below' ? p.ly : p.ly + p.h}`;
    }
    const on = now - cam.t0 >= p.delay;
    p.dot.style.transform = `translate(${p.sx}px,${p.sy}px)`;
    p.note.style.transform = `translate(${p.lx}px,${p.ly}px)`;
    p.line.setAttribute('d', p.path);
    p.dot.classList.toggle('on', on);
    p.dot.classList.toggle('hid', p.hidden);
    p.note.classList.toggle('on', on);
    p.line.classList.toggle('on', on);
  }
}

// ---------- drawing ----------
let paused = false;
let looping = false;
let last = 0;
let frameNo = 0;

let narrow = false;
function size() {
  if (!renderer) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  // A phone, or any frame taller than wide: labels above and below, short titles only.
  const was = narrow;
  narrow = w < 560 || w < h * 0.95;
  stage.classList.toggle('narrow', narrow);
  if (narrow !== was) {
    for (const p of pins) {
      p.band = null;
      p.w = p.note.offsetWidth;
      p.h = p.note.offsetHeight;
    }
  }
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (current >= 0) {
    shiftView(STEPS[current]);
    fitted = frameFor(STEPS[current]);
  }
  draw(performance.now(), true);
}
new ResizeObserver(size).observe(stage);

function draw(now, check = false) {
  if (!renderer || !fitted) return;
  const step = STEPS[current];
  if (step.variants) {
    // The first a little longer, then one change every 1.5 s, round and round.
    const k = Math.floor(Math.max(0, now - cam.t0 - 500) / 1500) % step.variants.length;
    showVariant(step, k);
  }
  place(now);
  renderer.render(scene, camera);
  layout(now, check);
}

function loop(now) {
  if (paused || document.hidden || !fitted) {
    looping = false;
    return;
  }
  looping = true;
  requestAnimationFrame(loop);
  if (now - last < 32) return; // about 30 frames a second is plenty for a slow swing
  last = now;
  draw(now, frameNo++ % 8 === 0);
}
function wake() {
  if (!looping && !paused && !document.hidden) requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', wake);

// ---------- steps ----------
let current = -1;
let seq = 0;

async function go(i) {
  const step = STEPS[i];
  const my = ++seq;
  const shown = current >= 0;
  current = i;
  stage.classList.add('swap');
  const wait = setTimeout(() => stage.classList.add('busy'), 400);
  let list;
  try {
    list = await Promise.all((step.variants || step.models).map(meshFor));
  } finally {
    clearTimeout(wait);
  }
  if (shown && !reduce) await new Promise((r) => setTimeout(r, 160));
  if (my !== seq) return;
  stage.classList.remove('busy');
  // Every setting's model is made before the step starts, so the changes keep time.
  if (step.variants) step.variants.forEach((v, k) => groupFor(v, list[k]));
  compose(step, list.slice(0, step.models.length));
  shiftView(step);
  fitted = frameFor(step);
  makePins(step);
  buildTune(step);
  cam.t0 = performance.now();
  draw(cam.t0, true);
  stage.classList.remove('swap');
  syncBar();
  wake();
}

// ---------- on its own: a bar of steps that plays by itself ----------
const bar = $('bar');
let auto = null;
function syncBar() {
  if (EMBED || !bar) return;
  bar.querySelectorAll('[data-step]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.step) === current)));
  $('caption').textContent = STEPS[current].text;
}
if (!EMBED && bar) {
  bar.hidden = false;
  const chips = $('chips');
  STEPS.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.step = i;
    b.textContent = s.label;
    b.addEventListener('click', () => {
      clearInterval(auto);
      go(i);
    });
    chips.appendChild(b);
  });
  if (!reduce) auto = setInterval(() => go((current + 1) % STEPS.length), 10000);
}

window.holderTour = {
  steps: STEPS.map(({ id, label, text }) => ({ id, label, text })),
  go,
  pause(on) {
    paused = Boolean(on);
    wake();
  },
  link: (i) => toQuery(sanitize(typeof STEPS[i].live === 'string' ? D[STEPS[i].live] : STEPS[i].live)),
};

if (!EMBED) go(0);
