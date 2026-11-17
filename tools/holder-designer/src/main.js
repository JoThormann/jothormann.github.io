import { PARAMS, TABS, STYLES, suggestStyle, defaults, sanitize, resolve, validate, shownFor, toQuery, fromQuery, shapeKey } from './params.js';
import { loadKernel } from './geometry/kernel.js';
import { buildHolder, positions, toMesh, solidVolume, solidArea } from './geometry/build.js';
import { createView, createThumbnailer } from './view.js';
import { VESSELS, KINDS } from './vessels.js';
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

const prefs = { vessels: true, tab: 'tubes' };
try {
  Object.assign(prefs, JSON.parse(store().getItem(PREFS) || '{}'));
} catch {}
if (EMBED && QS.has('vessels')) prefs.vessels = QS.get('vessels') !== '0';
if (!TABS.some((t) => t.id === prefs.tab)) prefs.tab = 'tubes';
function savePrefs() {
  try {
    store().setItem(PREFS, JSON.stringify(prefs));
  } catch {}
}

let params = load();
let kernel = null;
let built = null; // { key, mesh, volume, area, ms }
let buildQueued = false;
let refit = false;
const controls = new Map();
const panes = new Map(); // tab id -> { tab, pane, more }
const cards = new Map(); // style -> its card

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
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function buildControls() {
  buildStyleCards();
  const form = $('controls');
  const tabs = $('tabs');
  TABS.forEach((t, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = 'tab-' + t.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', 'pane-' + t.id);
    tab.innerHTML = `<span class="n">${i + 1}</span><span class="t">${t.label}</span>`;
    tab.addEventListener('click', () => showTab(t.id));
    tabs.appendChild(tab);

    const pane = document.createElement('section');
    pane.className = 'pane';
    pane.id = 'pane-' + t.id;
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', tab.id);
    pane.innerHTML = '<p class="intro"></p>';
    const mine = PARAMS.filter((d) => d.group === t.id);
    for (const d of mine.filter((d) => !d.adv)) pane.appendChild(makeField(d));
    let more = null;
    if (mine.some((d) => d.adv)) {
      more = document.createElement('details');
      more.className = 'more';
      more.innerHTML = '<summary><span>Fine-tuning</span><small></small></summary><p class="moreintro">Most holders print well without touching these.</p>';
      for (const d of mine.filter((d) => d.adv)) more.appendChild(makeField(d));
      pane.appendChild(more);
    }
    const next = TABS[i + 1];
    const step = document.createElement('div');
    step.className = 'stepnav';
    step.innerHTML = next
      ? `<button type="button" class="next">Next: ${next.label} <span aria-hidden="true">→</span></button>`
      : `<p>All set? Download the file and open it in your slicer.</p><button type="button" class="next">Download <span aria-hidden="true">↓</span></button>`;
    step.querySelector('button').addEventListener('click', () => {
      if (!next) return download();
      showTab(next.id);
      // Bring the new tab's first lines into view, just under the tab strip (which sticks to the top).
      const side = $('side');
      const next0 = panes.get(next.id).pane;
      const top = side.scrollTop + next0.getBoundingClientRect().top - side.getBoundingClientRect().top - tabs.offsetHeight;
      if (side.scrollTop > top) side.scrollTo({ top, behavior: reduceMotion() ? 'auto' : 'smooth' });
      $('tab-' + next.id).focus({ preventScroll: true });
    });
    pane.appendChild(step);
    form.appendChild(pane);
    panes.set(t.id, { tab, pane, more });
  });
  // Arrow keys move between tabs, as in any tab strip.
  tabs.addEventListener('keydown', (e) => {
    const i = TABS.findIndex((t) => t.id === prefs.tab);
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -2;
    if (j === -2 || !TABS[j]) return;
    e.preventDefault();
    showTab(TABS[j].id);
    $('tab-' + TABS[j].id).focus();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  // Fine-tuning opens by itself where something in it was changed.
  for (const [tid, { more }] of panes) {
    if (more && PARAMS.some((d) => d.group === tid && d.adv && shownFor(d, params) && params[d.id] !== d.def)) more.open = true;
  }
  showTab(prefs.tab);
}

function showTab(id) {
  prefs.tab = id;
  savePrefs();
  for (const [tid, { tab, pane }] of panes) {
    const on = tid === id;
    tab.setAttribute('aria-selected', on);
    tab.tabIndex = on ? 0 : -1;
    tab.classList.toggle('on', on);
    pane.hidden = !on;
  }
  queueThumbs();
}

// ---------- picture cards: kind of holder, and the feet ----------
/**
 * A row of cards, one per choice, each with room for a small 3D picture.
 * Arrow keys move the choice, as in any radio group. Returns key -> card.
 */
function cardGroup(box, choices, current, onPick) {
  const map = new Map();
  for (const [k, label] of choices) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.setAttribute('role', 'radio');
    card.innerHTML = `<span class="pic"><img alt=""></span><span class="name">${esc(label)}</span>`;
    card.addEventListener('click', () => current() !== k && onPick(k));
    box.appendChild(card);
    map.set(k, card);
  }
  box.addEventListener('keydown', (e) => {
    const keys = [...map.keys()];
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const k = keys[(keys.indexOf(current()) + step + keys.length) % keys.length];
    onPick(k);
    map.get(k).focus();
  });
  return map;
}
function showCards(map, value) {
  for (const [k, card] of map) {
    const on = value === k;
    card.classList.toggle('on', on);
    card.setAttribute('aria-checked', on);
    card.tabIndex = on ? 0 : -1;
  }
}

function buildStyleCards() {
  const pick = (k) => {
    refit = true;
    set('style', k);
  };
  const made = cardGroup($('styles'), Object.entries(STYLES).map(([k, s]) => [k, s.label]), () => params.style, pick);
  for (const [k, card] of made) {
    card.querySelector('.pic').insertAdjacentHTML('beforeend', '<span class="badge" hidden title="Suits the tube you picked">Suggested</span>');
    cards.set(k, card);
  }
  $('suggest').querySelector('button').addEventListener('click', () => pick($('suggest').dataset.style));
  addPictures({
    cards,
    tubes: true,
    // Each kind, 3 by 2, for the tube that is picked now.
    key: () => JSON.stringify(resolve(params).v),
    design: (k) => {
      const base = { vessel: params.vessel, customSize: params.customSize, customLength: params.customLength, cols: 3, rows: 2 };
      return buildable([{ ...base, style: k }, { style: k, cols: 3, rows: 2 }]);
    },
    visible: () => true,
  });
}

function syncStyleCards() {
  const tip = params.style === 'single' ? suggestStyle(resolve(params).v, 1) : suggestStyle(resolve(params).v, resolve(params).count);
  showCards(cards, params.style);
  for (const [k, card] of cards) card.querySelector('.badge').hidden = k !== tip;
  $('blurb').textContent = STYLES[params.style].blurb;
  const box = $('suggest');
  box.hidden = tip === params.style;
  box.dataset.style = tip;
  const what = VESSELS[params.vessel].custom ? 'a tube of this size' : 'a ' + VESSELS[params.vessel].label.toLowerCase();
  box.querySelector('span').textContent = `For ${what}, the ${STYLES[tip].label.toLowerCase()} usually suits better.`;
}

/** The first of these designs that builds without an error, resolved. */
function buildable(list) {
  for (const over of list) {
    const r = resolve(sanitize(over));
    if (!validate(r).some((i) => i.level === 'error')) return r;
  }
  return resolve(sanitize(list[list.length - 1]));
}

// Pictures are drawn by a second, small renderer once the kernel is there, a moment after the
// design stops changing, and only for cards that can be seen.
const ABOVE = [0.62, -1.15, 1.05];
const BELOW = [0.62, -1.15, -0.8];
let thumber = null;
const pictureSets = [];
function addPictures(set) {
  pictureSets.push({ dir: ABOVE, last: '', timer: 0, ...set });
}
function queueThumbs(force = false) {
  if (!kernel || !thumber) return;
  for (const set of pictureSets) {
    if (force) set.last = '';
    if (!set.visible()) continue;
    const key = set.key();
    if (key === set.last) continue;
    set.last = key;
    clearTimeout(set.timer);
    set.timer = setTimeout(() => drawPictures(set), 300);
  }
}
function drawPictures(set) {
  for (const [k, card] of set.cards) {
    const r = set.design(k);
    try {
      const solid = buildHolder(kernel, r, 32);
      let mesh;
      try {
        mesh = toMesh(solid);
      } finally {
        solid.delete();
      }
      card.querySelector('img').src = thumber(mesh, set.tubes ? { v: r.v, rest: r.rest + r.footH, at: positions(r) } : null, set.dir);
      card.classList.add('drawn');
    } catch (e) {
      console.error(e);
    }
  }
}

/** Options of a select, with the vessel list grouped by kind. */
function optionsHtml(d) {
  if (d.id !== 'vessel') return Object.entries(d.options).map(([k, o]) => `<option value="${k}">${esc(o.label)}</option>`).join('');
  return KINDS.map((g) => {
    const keys = Object.keys(VESSELS).filter((k) => VESSELS[k].kind === g.id);
    if (g.order) keys.sort((a, b) => g.order.indexOf(a) - g.order.indexOf(b));
    return `<optgroup label="${esc(g.label)}">${keys.map((k) => `<option value="${k}">${esc(VESSELS[k].label)}</option>`).join('')}</optgroup>`;
  }).join('');
}

/** A row of buttons, one per choice; `values` are what is stored, `labels` what the buttons say. */
function segmented(d, id, values, labels, onPick) {
  const html =
    `<div class="segs" role="radiogroup" aria-labelledby="${id}-l">` +
    values.map((v, i) => `<button type="button" role="radio">${esc(labels[i])}</button>`).join('') +
    '</div>';
  return {
    html,
    wire(row) {
      const btns = [...row.querySelectorAll('.segs button')];
      btns.forEach((b, i) => b.addEventListener('click', () => onPick(values[i])));
      row.querySelector('.segs').addEventListener('keydown', (e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const i = (values.indexOf(params[d.id]) + step + values.length) % values.length;
        onPick(values[i]);
        btns[i].focus();
      });
      return (v) =>
        btns.forEach((b, i) => {
          const on = values[i] === v;
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', on);
          b.tabIndex = on ? 0 : -1;
        });
    },
  };
}

function makeField(d) {
  const row = document.createElement('div');
  row.className = 'field';
  const id = 'p-' + d.id;
  const head = d.head ? `<h3 class="head">${d.head}</h3>` : '';
  const hint = d.hint ? `<p class="hint" id="${id}-h">${d.hint}</p>` : '';
  const described = d.hint ? ` aria-describedby="${id}-h"` : '';

  // Yes/no as two named buttons ("Rows and columns" | "Filling a box").
  if (d.type === 'toggle' && d.seg) {
    row.classList.add('choice');
    const seg = segmented(d, id, [false, true], d.seg, (v) => set(d.id, v));
    row.innerHTML = `${head}<div class="top"><span class="lbl" id="${id}-l">${d.label}</span></div>${seg.html}${hint}`;
    controls.set(d.id, { d, row, show: seg.wire(row) });
    return row;
  }
  // Yes/no as a switch.
  if (d.type === 'toggle') {
    row.classList.add('switch');
    row.innerHTML = `${head}<label class="top" for="${id}"><span class="lbl">${d.label}</span>` +
      `<input type="checkbox" role="switch" id="${id}"${described}></label>${hint}`;
    const box = row.querySelector('input');
    box.addEventListener('change', () => set(d.id, box.checked));
    controls.set(d.id, { d, row, show: (v) => (box.checked = v) });
    return row;
  }
  // A few short choices as buttons, a long list as a menu.
  if (d.type === 'select') {
    const keys = Object.keys(d.options);
    const pick = (v) => {
      if (d.id === 'vessel') refit = true;
      set(d.id, v);
    };
    const optHint = keys.some((k) => d.options[k].hint) ? '<p class="ohint" aria-live="polite"></p>' : '';
    const sayHint = (v) => {
      const o = row.querySelector('.ohint');
      if (o) o.textContent = d.options[v]?.hint || '';
    };
    if (d.cards) {
      row.classList.add('choice', 'cardchoice');
      row.innerHTML = `${head}<div class="top"><span class="lbl" id="${id}-l">${d.label}</span></div>` +
        `<div class="cards" role="radiogroup" aria-labelledby="${id}-l"></div>${optHint}${hint}`;
      const map = cardGroup(row.querySelector('.cards'), keys.map((k) => [k, d.options[k].label]), () => params[d.id], pick);
      addPictures({
        cards: map,
        tubes: false,
        dir: BELOW,
        // The holder as it is now (at most 3 by 2), seen from underneath; with a wider border where the feet need one.
        key: () => {
          const { [d.id]: _, cols, rows, fitBox, boxX, boxY, boxGap, ...rest } = params;
          return JSON.stringify(rest);
        },
        design: (k) => {
          const small = { ...params, cols: Math.min(params.cols, 3), rows: Math.min(params.rows, 2), fitBox: false, [d.id]: k };
          const wide = { ...small, margin: Math.max(params.margin, 9) };
          return buildable([small, wide, { ...wide, standFloor: true }, { [d.id]: k, cols: 3, rows: 2, margin: 9 }]);
        },
        visible: () => prefs.tab === d.group && !row.hidden,
      });
      controls.set(d.id, { d, row, show: (v) => (showCards(map, v), sayHint(v)) });
      return row;
    }
    if (keys.length <= 5) {
      row.classList.add('choice');
      const seg = segmented(d, id, keys, keys.map((k) => d.options[k].label), pick);
      row.innerHTML = `${head}<div class="top"><span class="lbl" id="${id}-l">${d.label}</span></div>${seg.html}${optHint}${hint}`;
      const showSeg = seg.wire(row);
      controls.set(d.id, { d, row, show: (v) => (showSeg(v), sayHint(v)) });
      return row;
    }
    row.classList.add('menu');
    row.innerHTML = `${head}<label class="lbl" for="${id}">${d.label}</label><select id="${id}"${described}>${optionsHtml(d)}</select>${optHint}${hint}`;
    const sel = row.querySelector('select');
    sel.addEventListener('change', () => pick(sel.value));
    controls.set(d.id, { d, row, show: (v) => ((sel.value = v), sayHint(v)) });
    return row;
  }

  const dec = decimalsOf(d.step);
  const ends = d.ends ? `<div class="ends" aria-hidden="true"><span>${d.ends[0]}</span><span>${d.ends[1]}</span></div>` : '';
  row.classList.add('number');
  row.innerHTML =
    `${head}<div class="top"><label for="${id}">${d.label}</label>` +
    `<span class="entry"><input type="number" id="${id}" min="${d.min}" max="${d.max}" step="${d.step}" inputmode="decimal"${described}>` +
    (d.unit ? `<span class="unit">${d.unit}</span>` : '') + `</span></div>` +
    `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}" aria-label="${esc(d.label)}" tabindex="-1">${ends}${hint}`;
  const num = row.querySelector('input[type="number"]');
  const range = row.querySelector('input[type="range"]');
  const paint = () => range.style.setProperty('--at', `${(100 * (range.value - d.min)) / (d.max - d.min)}%`);
  range.addEventListener('input', () => {
    const v = Number(Number(range.value).toFixed(dec));
    num.value = v;
    paint();
    set(d.id, v);
  });
  num.addEventListener('input', () => {
    const v = Number(num.value);
    if (num.value === '' || !isFinite(v) || v < d.min || v > d.max) return;
    range.value = v;
    paint();
    set(d.id, v);
  });
  num.addEventListener('change', () => show(params[d.id]));
  function show(v) {
    if (document.activeElement !== num) num.value = v;
    range.value = v;
    paint();
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
  syncStyleCards();
  for (const [id, c] of controls) {
    c.row.hidden = !shownFor(c.d, params);
    c.show(params[id]);
  }
  for (const t of TABS) panes.get(t.id).pane.querySelector('.intro').textContent = typeof t.intro === 'function' ? t.intro(params) : t.intro;
  for (const [tid, { more }] of panes) {
    if (!more) continue;
    const shown = PARAMS.filter((d) => d.group === tid && d.adv && shownFor(d, params));
    const changed = shown.filter((d) => params[d.id] !== d.def).length;
    more.hidden = !shown.length;
    more.querySelector('small').textContent = changed ? `${changed} changed` : `${shown.length} settings`;
    more.classList.toggle('changed', changed > 0);
  }
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
      tips.push(['warn', `${WAY[other]} leaves ${cm(there.overhang)} cm² hanging instead of ${cm(here.overhang)} cm². Set “Way up on the printer” (Printing) to Best or to that way up; the holes are then reshaped for it.`]);
    }
    // A narrow strip on the bed under a tall print wants a brim.
    const strip = Math.min(bed.foot[0], bed.foot[1]);
    if (bed.tall > 2.5 * strip || here.contact < 600) tips.push(['', `Little of it touches the bed for its ${mm(bed.tall)} mm height. Print with a brim so it does not come loose.`]);
  }
  if (r.tearOpenings) tips.push(['ok', 'The openings are teardrops with the point up, so their tops print without bridging. The vessel still sits in the round part.']);
  else if (up === 'y' && r.v.shape === 'round' && !r.printShape) tips.push(['warn', 'Lying on its side, the round openings sag at the top. Switch on “Printer-friendly holes” (Printing › Fine-tuning) for teardrops.']);
  if (up === 'y' && r.v.shape === 'square') tips.push(['', `Each square opening bridges ${mm(r.hole)} mm at its top, which prints cleanly without support.`]);
  if (up === 'y') tips.push(['', 'Layers run along the length, so the end walls are strong where they are pulled.']);
  if (up === 'z' && r.style === 'stand') tips.push(['warn', 'Upright, the top plate has to bridge from wall to wall and will sag or need support. A stand prints far better lying on a long side.']);
  if (r.peakWindows) tips.push(['ok', 'The viewing slots have a 45° peak instead of a flat top, so they print without bridging.']);
  else if (r.hasWindows && up === 'z') tips.push(['', `Each viewing slot bridges ${mm(r.windowW)} mm at its flat top. That usually prints; “Printer-friendly holes” (Printing › Fine-tuning) removes the bridge.`]);
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
  if (r.style === 'single') {
    if (r.coneTabs) tips.push(['ok', 'The ribs inside have a 45° underside, so the whole stand prints upright without support.']);
    if (r.slots) tips.push(['', `Springy fingers last longest in PETG or PP; PLA is stiffer and can crack if a tube is forced in often.`]);
    if (r.baseRing) tips.push(['', 'The thin base ring has little bed contact; slow the first layer or use a brim if it lifts.']);
  }
  tips.push(['', r.style === 'single'
    ? 'Check the fit with a short test first: set the height (Shape) low, print, try your tube, then adjust the hole fit.'
    : 'Print a single position first (set across and deep to 1) to check the fit for your tubes and printer.']);
  html += `<ul class="checks">${tips.map(([cls, t]) => `<li class="${cls}">${t}</li>`).join('')}</ul>`;
  return html;
}

/** Filament in grams: three wall lines all over, the rest at the chosen infill. */
function filamentGrams(r) {
  const density = PARAMS.find((d) => d.id === 'material').options[r.material].density;
  const shell = Math.min(built.volume, built.area * 3 * r.nozzle);
  return ((shell + (built.volume - shell) * (r.infill / 100)) / 1000) * density;
}

/** The four answers most people look for, at the top of the right-hand panel. */
function summary(r) {
  const bed = onBed(r, r.printUp);
  const tile = (name, num, unit, sub = '', cls = '') =>
    `<div class="${cls}"><span>${name}</span><b>${num}${unit ? `<small>${unit}</small>` : ''}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  return '<div class="summary">' +
    tile('Holds', r.count, r.count === 1 ? 'place' : 'places', r.style === 'single' ? `One ${r.v.label.toLowerCase()}` : `${r.cols} × ${r.rows}, for ${r.v.label.toLowerCase()}`) +
    tile('Filament', built ? '≈ ' + sig(filamentGrams(r), 2) : '–', 'g', PARAMS.find((d) => d.id === 'material').options[r.material].label) +
    tile('Size', `${mm(r.outerX)} × ${mm(r.outerY)} × ${mm(r.outerZ)}`, 'mm',
      'Width × depth × height' + (r.footH ? ', feet included' : ''), 'wide') +
    `<p class="fits ${bed.fits ? 'good' : 'bad'}">` + (bed.fits
      ? `Fits your printer, ${WAY[r.printUp].toLowerCase()}`
      : `Too big for your printer this way up. Check the bed size under Print, or make it smaller.`) + '</p>' +
    '</div>';
}

function renderReadouts(r) {
  let html = summary(r);
  html += section('How the tubes sit');
  if (r.fitBox && r.boxFits) {
    html += value('Fills the box', `${r.cols} × ${r.rows}`, '', `The ${r.boxX} × ${r.boxY} mm box, with ${mm(r.boxGap)} mm to spare all round; ` +
      `borders widened to ${mm(r.marginX)} × ${mm(r.marginY)} mm`);
  }
  html += value('Hole', mm(r.hole), 'mm',
    `${r.v.shape === 'square' ? 'Square' : 'Round'}, for a ${mm(r.v.body)} mm ${r.v.shape === 'square' ? 'side' : 'body'}`);
  if (r.style === 'single') {
    html += value('Tube shows above', mm(Math.max(0, r.stickOut)), 'mm',
      r.coneTabs ? `Rests on its cone, ${mm(r.depth)} mm deep in the sleeve, tip 2 mm above the floor` : `Stands ${mm(r.depth)} mm deep in the sleeve`);
    html += value('Base', mm(r.baseD), 'mm', `${r.baseRing ? 'Spoked ring' : 'Solid disc'}, ${mm(r.baseT)} mm thick; ` +
      `${(Math.atan(r.baseD / 2 / ((r.rest + r.v.length) / 2)) * 180 / Math.PI).toFixed(0)}° tilt before the full stand tips`);
    html += value('Sleeve', mm(2 * r.sleeveR), 'mm', r.slots ? `${r.slots} springy fingers, ${mm(r.sleeveT)} mm wall` : `Closed, ${mm(r.sleeveT)} mm wall`);
  } else {
    html += value('Spacing', r.pitchX === r.pitchY ? mm(r.pitchX) : `${mm(r.pitchX)} × ${mm(r.pitchY)}`, 'mm',
      `${mm(Math.min(r.gapX, r.rows > 1 ? r.gapY : r.gapX))} mm of material between holes`);
    html += value('Tube shows above', mm(Math.max(0, r.stickOut)), 'mm',
      r.seat === null ? 'Hangs by its rim in the top plate' : `Stands ${mm(r.height - r.rest)} mm deep in the holder`);
  }


  html += section('Printing');
  if (built) {
    html += value('Filament', sig(filamentGrams(r), 2), 'g', `Estimate at ${r.infill} % infill with three wall lines; ${sig(built.volume / 1000)} cm³ if solid`);
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
  queueThumbs();
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
  a.download = params.style === 'single' ? `stand_${params.vessel}.${format}` : `holder_${params.vessel}_${r.cols}x${r.rows}_${params.style}.${format}`;
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
  savePrefs();
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
    try {
      thumber = createThumbnailer();
    } catch (e) {
      console.error(e);
    }
    queueThumbs(true);
  },
  (e) => {
    console.error(e);
    $('status').textContent = 'The geometry kernel could not be loaded. Reload the page; if it keeps failing, the vendor folder is missing or the page was opened as a file instead of through a web server.';
  }
);

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => queueThumbs(true));

window.holder = { get params() { return params; }, get built() { return built; }, view, importFile };
