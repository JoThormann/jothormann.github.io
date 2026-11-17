import { PARAMS, GROUPS, STYLES, defaults, sanitize, resolve, validate, shownFor, toQuery, fromQuery, shapeKey } from './params.js';
import { loadKernel } from './geometry/kernel.js';
import { buildHolder, positions, toMesh, solidVolume, solidArea } from './geometry/build.js';
import { createView } from './view.js';
import { analyse } from './print.js';
import { stlBuffer } from './export/stl.js';
import { threeMf, readDesign } from './export/threemf.js';

const STORE = 'holder-designer.design.v1';
const PREFS = 'holder-designer.prefs.v1';
const $ = (id) => document.getElementById(id);

// Embedded in another page (?embed): start from the address alone and remember nothing, so every
// visit opens the same way. Also read there: ?vessels=0|1.
const QS = new URLSearchParams(location.search);
const EMBED = QS.has('embed');
const NOSTORE = { getItem: () => null, setItem() {} };
const store = () => (EMBED ? NOSTORE : localStorage);
/** The address to share: the tool on its own, without the embed settings. */
const pageLink = () => (EMBED ? location.origin + location.pathname + location.hash : location.href);

const prefs = { vessels: true };
try {
  Object.assign(prefs, JSON.parse(store().getItem(PREFS) || '{}'));
} catch {}
if (EMBED && QS.has('vessels')) prefs.vessels = QS.get('vessels') !== '0';

let params = load();
let kernel = null;
let built = null; // { key, mesh, volume, area, ms }
let buildQueued = false;
let refit = false;
const controls = new Map();
const groups = new Map();

let view;
try {
  view = createView($('view'));
} catch (e) {
  console.error(e);
  $('view').innerHTML = '<p class="noview">This browser cannot show 3D graphics (WebGL is off or missing). The sizes and the export still work.</p>';
  view = { setScene() {}, fit() {}, snapshot: () => '', element: null };
}

/** A share link wins over the design remembered in this browser. */
function load() {
  if (location.hash.length > 1) return fromQuery(location.hash.slice(1));
  try {
    return sanitize(JSON.parse(store().getItem(STORE) || 'null'));
  } catch {
    return defaults();
  }
}
function save() {
  try {
    store().setItem(STORE, JSON.stringify(params));
  } catch {}
  const q = toQuery(params);
  history.replaceState(null, '', q ? '#' + q : location.pathname + location.search);
}

let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

function sig(v, digits = 3) {
  if (!isFinite(v)) return '–';
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  if (a === 0) return '0';
  const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(a)));
  return String(Number(v.toFixed(Math.min(decimals, 4))));
}
const mm = (v) => String(Number(v.toFixed(1)));
const decimalsOf = (step) => (String(step).includes('.') ? String(step).split('.')[1].length : 0);

// ---------- controls, generated from the parameter list ----------
function buildControls() {
  const form = $('controls');
  for (const g of GROUPS) {
    const box = document.createElement('details');
    box.open = true;
    box.innerHTML = `<summary>${g.label}</summary>`;
    for (const d of PARAMS.filter((x) => x.group === g.id)) box.appendChild(makeField(d));
    form.appendChild(box);
    groups.set(g.id, box);
  }
  form.addEventListener('submit', (e) => e.preventDefault());

  const style = $('style');
  style.innerHTML = Object.entries(STYLES).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
  style.addEventListener('change', () => {
    refit = true;
    set('style', style.value);
  });
}

function makeField(d) {
  const row = document.createElement('div');
  row.className = 'field';
  const id = 'p-' + d.id;
  const hint = d.hint ? `<div class="hint">${d.hint}</div>` : '';

  if (d.type === 'toggle') {
    row.classList.add('toggle');
    row.innerHTML = `<div class="top"><input type="checkbox" id="${id}"><label for="${id}">${d.label}</label></div>${hint}`;
    const box = row.querySelector('input');
    box.addEventListener('change', () => set(d.id, box.checked));
    controls.set(d.id, { d, row, show: (v) => (box.checked = v) });
    return row;
  }
  if (d.type === 'select') {
    const opts = Object.entries(d.options).map(([k, o]) => `<option value="${k}">${o.label}</option>`).join('');
    row.innerHTML = `<div class="top"><label for="${id}">${d.label}</label><select id="${id}">${opts}</select></div>${hint}`;
    const sel = row.querySelector('select');
    sel.addEventListener('change', () => {
      if (d.id === 'vessel') refit = true;
      set(d.id, sel.value);
    });
    controls.set(d.id, { d, row, show: (v) => (sel.value = v) });
    return row;
  }

  const dec = decimalsOf(d.step);
  row.innerHTML =
    `<div class="top"><label for="${id}">${d.label}</label>` +
    `<input type="number" id="${id}" min="${d.min}" max="${d.max}" step="${d.step}" inputmode="decimal">` +
    `<span class="unit">${d.unit}</span></div>` +
    `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}" aria-label="${d.label}" tabindex="-1">${hint}`;
  const num = row.querySelector('input[type="number"]');
  const range = row.querySelector('input[type="range"]');
  range.addEventListener('input', () => {
    const v = Number(Number(range.value).toFixed(dec));
    num.value = v;
    set(d.id, v);
  });
  num.addEventListener('input', () => {
    const v = Number(num.value);
    if (num.value === '' || !isFinite(v) || v < d.min || v > d.max) return;
    range.value = v;
    set(d.id, v);
  });
  num.addEventListener('change', () => show(params[d.id]));
  function show(v) {
    if (document.activeElement !== num) num.value = v;
    range.value = v;
  }
  controls.set(d.id, { d, row, show });
  return row;
}

function set(id, value) {
  params[id] = value;
  save();
  update();
}

function syncControls() {
  $('style').value = params.style;
  for (const [id, c] of controls) {
    c.row.hidden = !shownFor(c.d, params);
    c.show(params[id]);
  }
  for (const [gid, box] of groups) box.hidden = !PARAMS.some((d) => d.group === gid && shownFor(d, params));
}

// ---------- readouts ----------
const value = (name, num, unit, sub = '', cls = '') =>
  `<div class="value"><span class="name">${name}</span><span class="num">${num}<small>${unit}</small></span>` +
  `<span class="sub ${cls}">${sub}</span></div>`;
const section = (title) => `<h2 class="sec">${title}</h2>`;

/** Footprint, height and bed fit for a way up: 'z' = upright, 'y' = lying on a long side. */
function onBed(r, up) {
  const foot = up === 'y' ? [r.outerX, r.outerZ] : [r.outerX, r.outerY];
  const tall = up === 'y' ? r.outerY : r.outerZ;
  const fitsFlat = (a, b) => a <= r.bedX && b <= r.bedY;
  return { foot, tall, fits: (fitsFlat(foot[0], foot[1]) || fitsFlat(foot[1], foot[0])) && tall <= r.bedZ };
}

/** Overhang figures for both ways up, worked out once per built shape. */
function orientations(r) {
  if (!built) return null;
  if (!built.ways) built.ways = { z: analyse(built.mesh, 2), y: analyse(built.mesh, 1) };
  return built.ways;
}

const WAY = { z: 'Upright', y: 'On a long side' };

function printAdvice(r) {
  const ways = orientations(r);
  const up = r.printUp;
  const other = up === 'z' ? 'y' : 'z';
  const bed = onBed(r, up);
  let html = value('Print it', WAY[up].toLowerCase(), '',
    up === 'y' ? 'One long side on the bed, openings facing sideways' : 'As shown, openings facing up',
    '');
  html += value('On the bed', `${mm(bed.foot[0])} × ${mm(bed.foot[1])}`, 'mm',
    bed.fits ? `Fits the ${r.bedX} × ${r.bedY} mm bed, ${mm(bed.tall)} mm tall` : `Too large for the ${r.bedX} × ${r.bedY} × ${r.bedZ} mm printer this way up`,
    bed.fits ? 'good' : 'caution');
  const tips = [];
  if (ways) {
    const cm = (v) => sig(v / 100, 2);
    const here = ways[up];
    const there = ways[other];
    html += value('Hanging surface', cm(here.overhang), 'cm²',
      here.overhang < 20 ? 'Nothing needs support or bridging'
        : `Flatter than 45° with nothing under it${here.flat > 0.6 * here.overhang ? '; mostly level faces, which bridge if short' : ''}`,
      here.overhang < 20 ? 'good' : here.overhang > 400 ? 'caution' : '');
    html += '<table class="imps"><thead><tr><th>Way up</th><th>Hanging</th><th>Height</th><th>Fits</th></tr></thead><tbody>';
    for (const w of ['z', 'y']) {
      html += `<tr class="${w === up ? 'on' : ''}"><td>${WAY[w]}</td><td>${cm(ways[w].overhang)} cm²</td><td>${mm(ways[w].height)} mm</td><td>${onBed(r, w).fits ? 'yes' : 'no'}</td></tr>`;
    }
    html += '</tbody></table>';
    if (r.printDir !== 'auto' && there.overhang < 0.5 * here.overhang - 20 && onBed(r, other).fits) {
      tips.push(['warn', `${WAY[other]} leaves ${cm(there.overhang)} cm² hanging instead of ${cm(here.overhang)} cm². Set “Printed” to automatic or to that way up; the cut-outs are then reshaped for it.`]);
    }
    // A narrow strip on the bed under a tall print wants a brim.
    const strip = Math.min(bed.foot[0], bed.foot[1]);
    if (bed.tall > 2.5 * strip || here.contact < 600) tips.push(['', `Little of it touches the bed for its ${mm(bed.tall)} mm height. Print with a brim so it does not come loose.`]);
  }
  if (r.tearOpenings) tips.push(['ok', 'The openings are teardrops with the point up, so their tops print without bridging. The vessel still sits in the round part.']);
  else if (up === 'y' && r.v.shape === 'round' && !r.printShape) tips.push(['warn', 'Lying on its side, the round openings sag at the top. Switch on “Shape cut-outs for printing” for teardrops.']);
  if (up === 'y' && r.v.shape === 'square') tips.push(['', `Each square opening bridges ${mm(r.hole)} mm at its top, which prints cleanly without support.`]);
  if (up === 'y') tips.push(['', 'Layers run along the length, so end walls and handles are strong where they are pulled.']);
  if (up === 'z' && r.style === 'stand') tips.push(['warn', 'Upright, the top plate has to bridge from wall to wall and will sag or need support. A stand prints far better lying on a long side.']);
  if (r.peakWindows) tips.push(['ok', 'The windows have a 45° peak instead of a flat top, so they print without bridging.']);
  else if (r.hasWindows && up === 'z') tips.push(['', `Each window bridges ${mm(r.windowW)} mm at its flat top. That usually prints; “Shape cut-outs for printing” removes the bridge.`]);
  if (r.handles === 'loop' && up === 'z') tips.push(['', (r.tearLoops ? 'The finger-loop holes are teardrops, but the' : 'The') + ' rounded underside of each loop still hangs a little: use supports there, or choose grip lips, which need none.']);
  if (r.handles === 'lip' && up === 'z') tips.push(['ok', 'The grip lips have a 45° underside and print without support.']);
  if (r.edgeC > 0.05) {
    tips.push(['ok', `The outer edges have a ${mm(r.edgeC)} mm bevel. On the bed side it hides the squashed first layer; a rounded edge there would hang and print rough.`]);
  } else if (r.edge > 0) tips.push(['', 'There is no room for the edge bevel at this margin or plate thickness; the edges are left sharp.']);
  if (r.style === 'stand') {
    tips.push(r.filletR > 0.2
      ? ['ok', `The joints between plates and end walls have a ${mm(r.filletR)} mm fillet${r.filletR < r.fillet - 0.01 ? ' (held back to clear the openings)' : ''}, which spreads the load where a stand cracks first.`]
      : ['', 'Without a fillet the plates meet the end walls in a sharp corner, where printed stands tend to crack.']);
  }
  if (up === 'y' && r.cornerR > 3) tips.push(['', `Lying on its side, the two rounded corners at the bed start as an overhang. A ${mm(r.cornerR)} mm radius comes out a little rough there; 3 mm or less prints clean.`]);
  if (r.cornerR < 1) tips.push(['', 'Sharp vertical corners lift off the bed more easily and bulge slightly. A corner radius of 2 mm or more prints cleaner.']);
  if (r.feet === 'stack') tips.push(['', 'Stacking feet fit the pockets in the top of an identical holder, for storing empty racks.']);
  if (up === 'z' && r.style !== 'stand') tips.push(['', 'Openings up gives the roundest, most accurate holes. Put the seam at the back so it does not land inside them.']);
  tips.push(['', 'Print a single position first (set across and deep to 1) to check the fit for your tubes and printer.']);
  html += `<ul class="checks">${tips.map(([cls, t]) => `<li class="${cls}">${t}</li>`).join('')}</ul>`;
  return html;
}

function renderReadouts(r) {
  let html = section('Holds');
  html += value('Positions', r.count, '', `${r.cols} across, ${r.rows} deep, for ${r.v.label.toLowerCase()}` +
    (r.fitBox && r.boxFits ? `; fills the ${r.boxX} × ${r.boxY} mm box with ${mm(r.boxGap)} mm to spare all round` : ''));
  html += value('Opening', mm(r.hole), 'mm',
    `${r.v.shape === 'square' ? 'Square' : 'Round'}, for a ${mm(r.v.body)} mm ${r.v.shape === 'square' ? 'side' : 'body'}`);
  html += value('Spacing', r.pitchX === r.pitchY ? mm(r.pitchX) : `${mm(r.pitchX)} × ${mm(r.pitchY)}`, 'mm',
    `${mm(Math.min(r.gapX, r.rows > 1 ? r.gapY : r.gapX))} mm of material between openings`);
  html += value('Vessel shows above', mm(Math.max(0, r.stickOut)), 'mm',
    r.seat === null ? 'Hangs by its rim in the top plate' : `Stands ${mm(r.height - r.rest)} mm deep in the holder`);

  html += section('Size');
  html += value('Outer size', `${mm(r.outerX)} × ${mm(r.outerY)} × ${mm(r.outerZ)}`, 'mm',
    'Width, depth and height' + (r.handleLen ? ', handles included' : '') + (r.footH ? ', feet included' : ''));
  if (r.fitBox && r.boxFits) html += value('Margins', `${mm(r.marginX)} × ${mm(r.marginY)}`, 'mm', 'Across and deep, widened to fill the box');

  html += section('Printing');
  if (built) {
    const density = PARAMS.find((d) => d.id === 'material').options[r.material].density;
    const shell = Math.min(built.volume, built.area * 3 * r.nozzle);
    const grams = ((shell + (built.volume - shell) * (r.infill / 100)) / 1000) * density;
    html += value('Filament', sig(grams, 2), 'g', `Estimate at ${r.infill} % infill with three wall lines; ${sig(built.volume / 1000)} cm³ if solid`);
  }
  html += printAdvice(r);
  $('values').innerHTML = html;
}

function renderIssues(issues) {
  $('issues').innerHTML = issues.map((i) => `<div class="issue ${i.level}">${i.text}</div>`).join('');
}

// ---------- geometry ----------
function queueBuild() {
  if (buildQueued) return;
  buildQueued = true;
  requestAnimationFrame(() => {
    buildQueued = false;
    rebuild();
  });
}

function rebuild() {
  if (!kernel) return;
  const r = resolve(params);
  if (validate(r).some((i) => i.level === 'error')) {
    built = null;
    view.setScene(null, null);
    $('meshinfo').textContent = '';
    $('status').textContent = 'Fix the highlighted problem to see the holder.';
    renderReadouts(r);
    return;
  }
  const key = shapeKey(r);
  if (!built || built.key !== key) {
    const t0 = performance.now();
    try {
      const solid = buildHolder(kernel, r);
      try {
        built = { key, mesh: toMesh(solid), volume: solidVolume(solid), area: solidArea(solid), ms: performance.now() - t0 };
      } finally {
        solid.delete();
      }
    } catch (e) {
      console.error(e);
      built = null;
      view.setScene(null, null);
      $('status').textContent = 'This holder could not be built. Try different sizes.';
      return;
    }
  }
  view.setScene(built.mesh, prefs.vessels ? { v: r.v, rest: r.rest + r.footH, at: positions(r) } : null, refit);
  refit = false;
  $('status').textContent = '';
  $('meshinfo').textContent = `${(built.mesh.indices.length / 3).toLocaleString('en-US')} triangles · ${built.ms.toFixed(0)} ms`;
  renderReadouts(r);
}

function update() {
  const r = resolve(params);
  syncControls();
  renderIssues(validate(r));
  renderReadouts(r);
  queueBuild();
}

// ---------- export, share, import ----------
function download() {
  if (!kernel || !built) return toast('Fix the highlighted problem first');
  const r = resolve(params);
  const title = `Holder for ${r.count} × ${r.v.label}, ${mm(r.outerX)} × ${mm(r.outerY)} × ${mm(r.outerZ)} mm`;
  const format = $('format').value;
  const solid = buildHolder(kernel, r, 128);
  let data;
  try {
    const mesh = toMesh(solid);
    data = format === 'stl' ? stlBuffer(mesh, title) : threeMf(mesh, title, params);
  } finally {
    solid.delete();
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: format === 'stl' ? 'model/stl' : 'model/3mf' }));
  a.download = `holder_${params.vessel}_${r.cols}x${r.rows}_${params.style}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function adopt(p) {
  params = p;
  refit = true;
  save();
  update();
}

async function importFile(file) {
  try {
    const stored = await readDesign(await file.arrayBuffer());
    if (!stored) return toast('That file has no holder design in it');
    adopt(sanitize(stored));
    toast('Design restored from ' + file.name);
  } catch (e) {
    console.error(e);
    toast('That file could not be read');
  }
}

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  $('drop').hidden = false;
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('drop').hidden = true;
});
window.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $('drop').hidden = true;
  if (e.dataTransfer.files[0]) importFile(e.dataTransfer.files[0]);
});
window.addEventListener('hashchange', () => {
  const next = fromQuery(location.hash.slice(1));
  if (toQuery(next) !== toQuery(params)) adopt(next);
});

// ---------- start ----------
buildControls();
$('vessels').checked = prefs.vessels;
update();
$('download').addEventListener('click', download);
$('fit').addEventListener('click', () => view.fit());
$('reset').addEventListener('click', () => adopt(defaults()));
$('vessels').addEventListener('change', (e) => {
  prefs.vessels = e.target.checked;
  try {
    store().setItem(PREFS, JSON.stringify(prefs));
  } catch {}
  queueBuild();
});
$('share').addEventListener('click', async () => {
  save();
  try {
    await navigator.clipboard.writeText(pageLink());
    toast('Link copied');
  } catch {
    toast('Copy the address from the address bar');
  }
});

$('status').textContent = 'Loading the geometry kernel…';
loadKernel().then(
  (k) => {
    kernel = k;
    $('status').textContent = '';
    rebuild();
  },
  (e) => {
    console.error(e);
    $('status').textContent = 'The geometry kernel could not be loaded. Reload the page; if it keeps failing, the vendor folder is missing or the page was opened as a file instead of through a web server.';
  }
);

window.holder = { get params() { return params; }, get built() { return built; }, view, importFile };
