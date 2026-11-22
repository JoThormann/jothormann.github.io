import { PARAMS, TABS, STYLES, PRINTERS, fitTest, suggestStyle, defaults, sanitize, resolve, validate, shownFor, toQuery, fromQuery, shapeKey } from './params.js';
import { loadKernel } from './geometry/kernel.js';
import { buildHolder, buildBasePlate, buildFitTest, mergeMeshes, moveMesh, positions, toMesh, solidVolume, solidArea } from './geometry/build.js';
import { createView, createThumbnailer, createBedView } from './view.js';
import { VESSELS, KINDS } from './vessels.js';
import { analyse } from './print.js';
import { stlBuffer } from './export/stl.js';
import { threeMf, readDesign } from './export/threemf.js';
import { depthPicture, conePicture } from './explain.js';

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
const resets = new Map(); // id -> { d, b }: the reset arrows of the fine-tuning settings
const infos = new Map(); // id -> the "?" button that opens its explainer
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
// The holder on the print bed, in the printer box of the right-hand panel.
let bedView = { show() {} };
try {
  bedView = createBedView($('bedview'));
} catch (e) {
  console.error(e);
}
let bedShown = '';
function showOnBed(r) {
  const bed = bedLayout(r);
  const sig = JSON.stringify([built && built.key, r.bedX, r.bedY, r.bedZ, r.printUp, bed.turn, bed.fits]);
  if (sig === bedShown) return;
  bedShown = sig;
  bedView.show(built ? built.part : null, { bed: [r.bedX, r.bedY, r.bedZ], up: r.printUp, turn: bed.turn, fits: bed.fits, plate: built && built.plate });
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
      // The fit test leads the tubes' fine-tuning: it is how to find the right hole fit.
      if (t.id === 'tubes') {
        more.insertAdjacentHTML('beforeend',
          '<div class="fitcard"><svg class="fitpic" viewBox="0 0 92 36" aria-hidden="true"><rect x="1" y="5" width="90" height="26" rx="4"/>' +
          [6.6, 7, 7.4, 7.8, 8.2].map((rr, i) => `<circle class="${i === 2 ? 'mid' : ''}" cx="${12 + i * 17}" cy="15" r="${rr}"/><line x1="${8 + i * 17}" x2="${16 + i * 17}" y1="27" y2="27"/>`).join('') +
          '</svg><div><b>Will your tubes fit?</b><span>Print a small test strip first: five holes from tighter to looser, a few minutes on the printer. Then set the hole fit below.</span>' +
          '<button type="button" class="ftbtn fittest">Print a fit test</button></div></div>');
      }
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
  for (const d of PARAMS.filter((d) => d.group === 'printer')) $('printerctl').appendChild(makeField(d));
  // Fine-tuning opens by itself where something in it was changed.
  for (const [tid, { more }] of panes) {
    if (more && PARAMS.some((d) => d.group === tid && d.adv && shownFor(d, params) && params[d.id] !== usual(d))) more.open = true;
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

/** The value a setting goes back to: its default; for the spacing, the usual one for this tube. */
function usual(d) {
  if (d.id === 'pitchX' || d.id === 'pitchY') return resolve({ ...params, autoSpacing: true })[d.id];
  return d.def;
}
const sayValue = (d, v) => (d.type === 'toggle' ? (v ? 'on' : 'off') : d.type === 'select' ? d.options[v]?.label ?? v : `${v}${d.unit ? ' ' + d.unit : ''}`);

// A small rewind arrow: puts a fine-tuning setting back to its usual value.
const RESET_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.1 8.6A5 5 0 1 0 4.6 4.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4.4 1.6v3.1H1.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function makeField(d) {
  const row = buildField(d);
  if (d.adv) {
    const lbl = row.querySelector('.top > label, .top .lbl');
    if (lbl) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'reset';
      b.innerHTML = RESET_ICON;
      // Inside the switch's label it must not also flip the switch.
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        set(d.id, usual(d));
      });
      lbl.after(b);
      resets.set(d.id, { d, b });
    }
  }
  if (EXPLAIN[d.id]) {
    const lbl = row.querySelector('.top > label, .top .lbl');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'info';
    b.textContent = '?';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-label', `Explain: ${EXPLAIN[d.id].title}`);
    b.title = 'Explain this, with a picture';
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (explain && explain.id === d.id) closeExplain();
      else openExplain(d.id);
    });
    lbl.after(b);
    infos.set(d.id, b);
  }
  if (d.id === 'printShape') {
    row.querySelector('.hint')?.insertAdjacentHTML('beforeend', ' <button type="button" class="why" data-intro="teardrop">Why teardrops?</button>');
  }
  return row;
}

function buildField(d) {
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
  // Switching a "usual" setting off starts the hand-set value from the usual one, not from
  // wherever it was left (an old spacing can make the holes overlap at once).
  const from = {};
  if (value === false && ['autoSpacing', 'autoHeight', 'autoBase'].includes(id)) {
    const r = resolve(params);
    if (id === 'autoSpacing') Object.assign(from, { pitchX: r.pitchX, pitchY: r.pitchY });
    if (id === 'autoHeight') Object.assign(from, { height: Math.round(r.height), depth: Math.round(r.depth) });
    if (id === 'autoBase') from.baseD = r.baseD;
  }
  params = sanitize({ ...params, ...from, [id]: value });
  save();
  update();
}

function syncControls() {
  syncStyleCards();
  for (const [id, c] of controls) {
    c.row.hidden = !shownFor(c.d, params);
    c.show(params[id]);
  }
  for (const [id, b] of infos) {
    const w = EXPLAIN[id].when;
    b.hidden = Boolean(w && !w(params));
  }
  for (const [id, { d, b }] of resets) {
    const u = usual(d);
    const changed = params[id] !== u;
    b.disabled = !changed;
    b.classList.toggle('on', changed);
    b.title = changed ? `Back to the usual value: ${sayValue(d, u)}` : 'At the usual value';
    b.setAttribute('aria-label', changed ? `Reset ${d.label} to ${sayValue(d, u)}` : `${d.label}: at the usual value`);
  }
  for (const t of TABS) panes.get(t.id).pane.querySelector('.intro').textContent = typeof t.intro === 'function' ? t.intro(params) : t.intro;
  for (const [tid, { more }] of panes) {
    if (!more) continue;
    const shown = PARAMS.filter((d) => d.group === tid && d.adv && shownFor(d, params));
    const changed = shown.filter((d) => params[d.id] !== usual(d)).length;
    more.hidden = !shown.length;
    more.querySelector('small').textContent = changed ? `${changed} changed` : `${shown.length} settings`;
    more.classList.toggle('changed', changed > 0);
  }
}

// ---------- readouts ----------

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
  if (!built.ways) built.ways = { z: analyse(built.part, 2), y: analyse(built.part, 1) };
  return built.ways;
}

const WAY = { z: 'Upright', y: 'On a long side' };

/** Everything worth knowing about printing it, as short tips; the warnings first. */
function printTips(r) {
  const ways = orientations(r);
  const up = r.printUp;
  const other = up === 'z' ? 'y' : 'z';
  const bed = onBed(r, up);
  const tips = [];
  const cm = (v) => sig(v / 100, 2);
  if (ways) {
    const here = ways[up];
    const there = ways[other];
    if (here.overhang < 20) tips.push(['ok', `Nothing needs support printed ${WAY[up].toLowerCase()}.`]);
    else tips.push([here.overhang > 400 ? 'warn' : '', `${cm(here.overhang)} cm² hangs in the air printed ${WAY[up].toLowerCase()} (flatter than 45° with nothing under it)${here.flat > 0.6 * here.overhang ? '; mostly level faces, which bridge if short' : ''}.`]);
    if (r.printDir !== 'auto' && there.overhang < 0.5 * here.overhang - 20 && onBed(r, other).fits) {
      tips.push(['warn', `${WAY[other]} leaves ${cm(there.overhang)} cm² hanging instead of ${cm(here.overhang)} cm². Set “Way up on the printer” (Print) to Best or to that way up; the holes are then reshaped for it.`]);
    }
    // A narrow strip on the bed under a tall print wants a brim.
    const strip = Math.min(bed.foot[0], bed.foot[1]);
    if (bed.tall > 2.5 * strip || here.contact < 600) tips.push(['', `Little of it touches the bed for its ${mm(bed.tall)} mm height. Print with a brim so it does not come loose.`]);
  }
  if (r.tearOpenings) tips.push(['ok', 'The openings are teardrops with the point up, so their tops print without bridging. The vessel still sits in the round part. <button type="button" class="why" data-intro="teardrop">Why?</button>']);
  else if (up === 'y' && r.v.shape === 'round' && !r.printShape) tips.push(['warn', 'Lying on its side, the round openings sag at the top. Switch on “Printer-friendly holes” (Print › Fine-tuning) for teardrops.']);
  if (up === 'y' && r.v.shape === 'square') tips.push(['', `Each square opening bridges ${mm(r.hole)} mm at its top, which prints cleanly without support.`]);
  if (up === 'y') tips.push(['', 'Layers run along the length, so the end walls are strong where they are pulled.']);
  if (up === 'z' && r.style === 'stand') tips.push(['warn', 'Upright, the top plate has to bridge from wall to wall and will sag or need support. A stand prints far better lying on a long side.']);
  if (r.peakWindows) tips.push(['ok', 'The viewing slots have a 45° peak instead of a flat top, so they print without bridging.']);
  else if (r.hasWindows && up === 'z') tips.push(['', `Each viewing slot bridges ${mm(r.windowW)} mm at its flat top. That usually prints; “Printer-friendly holes” (Print › Fine-tuning) removes the bridge.`]);
  if (r.edgeC > 0.05) {
    tips.push(['ok', `The outer edges have a ${mm(r.edgeC)} mm bevel. On the bed side it hides the squashed first layer; a rounded edge there would hang and print rough.`]);
  } else if (r.edge > 0) tips.push(['', 'There is no room for the edge bevel at this margin or plate thickness; the edges are left sharp.']);
  if (r.style === 'stand') {
    tips.push(r.filletR > 0.2
      ? ['ok', `The joints between plates and end walls have a ${mm(r.filletR)} mm fillet${r.filletR < r.fillet - 0.01 ? ' (held back to clear the openings)' : ''}, which spreads the load where a stand cracks first.`]
      : ['', 'Without a fillet the plates meet the end walls in a sharp corner, where printed stands tend to crack.']);
  }
  if (up === 'y' && r.cornerR > 3) tips.push(['', `Lying on its side, the two rounded corners at the bed start as an overhang. A ${mm(r.cornerR)} mm radius comes out a little rough there; 3 mm or less prints clean.`]);
  if (r.cornerR < 1 && r.style !== 'single') tips.push(['', 'Sharp vertical corners lift off the bed more easily and bulge slightly. A corner radius of 2 mm or more prints cleaner.']);
  if (r.feet === 'stack') tips.push(['', 'Stacking feet fit the pockets in the top of an identical holder, for storing empty racks.']);
  if (r.basePlate) {
    tips.push(['ok', 'The base plate prints flat, beside the stand, and the stand drops into its pocket. It usually stays put; a few drops of glue hold it for good.']);
    tips.push(['', 'In the 3MF the stand and the base plate are two objects, so your slicer can lay the stand on its front and leave the plate flat. In an STL they are one file: use “split to objects” first.']);
  }
  if (up === 'z' && r.style !== 'stand') tips.push(['', 'Openings up gives the roundest, most accurate holes. Put the seam at the back so it does not land inside them.']);
  if (r.style === 'single') {
    if (r.coneTabs) tips.push(['ok', 'The ribs inside have a 45° underside, so the whole stand prints upright without support.']);
    if (r.slots) tips.push(['', 'Springy fingers last longest in PETG or PP; PLA is stiffer and can crack if a tube is forced in often.']);
    if (r.baseRing) tips.push(['', 'The thin base ring has little bed contact; slow the first layer or use a brim if it lifts.']);
  }
  if (built) tips.push(['', `The filament figure assumes ${r.infill} % infill and three wall lines (Print › Fine-tuning); printed solid it would be ${sig(built.volume / 1000)} cm³.`]);
  tips.push(['', 'Not sure the tubes will fit? Print the fit test first: five holes, from tighter to looser, in a few minutes. <button type="button" class="why fittest">Print a fit test</button>']);

  // Warnings stay in view; the rest folds away under "Print tips".
  const li = ([cls, t]) => `<li class="${cls}">${t}</li>`;
  const warns = tips.filter((t) => t[0] === 'warn');
  const rest = tips.filter((t) => t[0] !== 'warn');
  return (warns.length ? `<ul class="checks">${warns.map(li).join('')}</ul>` : '') +
    `<details class="tips"${tipsOpen ? ' open' : ''}><summary><span>Print tips</span><small>${rest.length}</small></summary><ul class="checks">${rest.map(li).join('')}</ul></details>`;
}
let tipsOpen = false;

/** Filament in grams: three wall lines all over, the rest at the chosen infill. */
function filamentGrams(r) {
  const density = PARAMS.find((d) => d.id === 'material').options[r.material].density;
  const shell = Math.min(built.volume, built.area * 3 * r.nozzle);
  return ((shell + (built.volume - shell) * (r.infill / 100)) / 1000) * density;
}

/** How the holder lies on the bed: the way up, and a quarter turn if it only fits along the other side. */
function bedLayout(r) {
  const bed = onBed(r, r.printUp);
  if (!r.basePlate) {
    const [a, b] = bed.foot;
    const turn = !(a <= r.bedX && b <= r.bedY) && b <= r.bedX && a <= r.bedY;
    return { ...bed, turn };
  }
  // With a base plate: the stand and the plate side by side, 10 mm apart, along the bed's depth.
  const W = Math.max(bed.foot[0], r.benchX);
  const D = bed.foot[1] + 10 + r.benchY;
  const flat = W <= r.bedX && D <= r.bedY;
  const turned = D <= r.bedX && W <= r.bedY;
  const plateFits = (r.benchX <= r.bedX && r.benchY <= r.bedY) || (r.benchY <= r.bedX && r.benchX <= r.bedY);
  const together = (flat || turned) && bed.fits;
  return { ...bed, turn: !flat && turned, fits: bed.fits && plateFits, together, both: [W, D] };
}

/** Under the bed picture: does it fit, and if not, what to do. */
function bedFit(r) {
  const bed = bedLayout(r);
  const other = r.printUp === 'z' ? 'y' : 'z';
  const way = r.printUp === 'y' ? 'lying on its side' : 'upright';
  const size = `${mm(bed.foot[0])} × ${mm(bed.foot[1])} mm on the ${r.bedX} × ${r.bedY} mm bed, ${mm(bed.tall)} mm tall`;
  if (r.basePlate && bed.fits) {
    return bed.together
      ? `<b>Fits, both parts at once</b><span>The stand ${way}, the base plate flat beside it: ${mm(bed.both[0])} × ${mm(bed.both[1])} mm on the ${r.bedX} × ${r.bedY} mm bed</span>`
      : `<b>Fits, one part at a time</b><span>The stand (${size}) and the ${mm(r.benchX)} × ${mm(r.benchY)} mm base plate each fit; print them one after the other.</span>`;
  }
  if (bed.fits) return `<b>Fits, ${way}</b><span>${size}${bed.turn ? ', turned a quarter' : ''}</span>`;
  const tooTall = bed.tall > r.bedZ;
  const fix = onBed(r, other).fits
    ? `It fits ${WAY[other].toLowerCase()}: set “Way up on the printer” (Print) to that.`
    : tooTall && bed.foot.every((v, i) => v <= [r.bedX, r.bedY][i] || v <= [r.bedY, r.bedX][i])
      ? `It is taller than the printer’s ${r.bedZ} mm. Make it lower, or pick a bigger printer.`
      : 'Use fewer tubes, a narrower border, or pick a bigger printer above.';
  // Printers in the list it would fit, as printed now.
  const fitsOn = Object.entries(PRINTERS).filter(([k, p]) => p.bed && k !== r.printer &&
    onBed({ ...r, bedX: p.bed[0], bedY: p.bed[1], bedZ: p.bed[2] }, r.printUp).fits).map(([, p]) => p.label);
  const on = fitsOn.length ? ` It fits a ${fitsOn.slice(0, 2).join(' or a ')}.` : '';
  return `<b>Too big for this printer</b><span>${size}. ${fix}${on}</span>`;
}

/** The figures most people look for: what it holds, how big, how much filament, how the tubes sit. */
function summary(r) {
  const tile = (name, num, unit, sub = '', cls = '') =>
    `<div class="${cls}"><span>${name}</span><b>${num}${unit ? `<small>${unit}</small>` : ''}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const tubes = r.style === 'single'
    ? `Base ${mm(r.baseD)} · sleeve ${mm(2 * r.sleeveR)} · shows ${mm(Math.max(0, r.stickOut))}`
    : `Hole ${mm(r.hole)} · spacing ${r.pitchX === r.pitchY ? mm(r.pitchX) : `${mm(r.pitchX)} × ${mm(r.pitchY)}`} · shows ${mm(Math.max(0, r.stickOut))}`;
  const tubesSub = r.style === 'single'
    ? `${r.baseRing ? 'Spoked ring' : 'Solid disc'}; ${r.slots ? `${r.slots} springy fingers` : 'closed sleeve'}${r.coneTabs ? '; rests on its cone' : ''}`
    : `${mm(Math.min(r.gapX, r.rows > 1 ? r.gapY : r.gapX))} mm between holes; sinks ${mm(r.style === 'stand' ? r.height - r.rest : r.depth)} mm in` +
      (r.fitBox && r.boxFits ? `; fills the ${r.boxX} × ${r.boxY} mm box` : '');
  return '<div class="summary">' +
    tile('Holds', r.count, r.count === 1 ? 'place' : 'places', r.style === 'single' ? `One ${r.v.label.toLowerCase()}` : `${r.cols} × ${r.rows}, for ${r.v.label.toLowerCase()}`) +
    tile('Filament', built ? '≈ ' + sig(filamentGrams(r), 2) : '–', 'g', PARAMS.find((d) => d.id === 'material').options[r.material].label) +
    tile('Size', `${mm(r.benchX)} × ${mm(r.benchY)} × ${mm(r.benchZ)}`, 'mm',
      'Width × depth × height' + (r.basePlate ? ', with the base plate' : r.footH ? ', feet included' : ''), 'wide') +
    tile('The tubes', tubes, 'mm', tubesSub, 'wide tubes') +
    '</div>';
}

function renderReadouts(r) {
  const bed = bedLayout(r);
  const fit = $('bedfit');
  fit.className = `bedfit ${bed.fits ? 'good' : 'bad'}`;
  fit.innerHTML = bedFit(r);
  $('values').innerHTML = summary(r) + printTips(r);
  $('values').querySelector('details.tips')?.addEventListener('toggle', (e) => (tipsOpen = e.target.open));
}

function renderIssues(issues) {
  $('issues').innerHTML = issues.map((i) => {
    const on = guide && guide.key === i.key;
    const how = i.fix && i.fix.length ? `<button type="button" class="how${on ? ' on' : ''}" data-key="${esc(i.key)}">${on ? 'Stop the guide' : 'Show me how'}</button>` : '';
    return `<div class="issue ${i.level}"><span>${esc(i.text)}</span>${how}</div>`;
  }).join('');
}

// ---------- explainers: a "?" beside a setting opens a cut through the holder ----------
// A panel beside the settings (a sheet along the bottom on a narrow screen) with a section
// picture of the holder as it is now, drawn to scale and measured (explain.js), a short text,
// and the tube dropping in. It follows every change, so it can stay open while a slider moves;
// the drop plays again a moment after the last change.
const EXPLAIN = {
  depth: { title: 'Hole depth', picture: (r) => depthPicture(r, 'depth'), text: depthText },
  autoHeight: { title: 'Height and hole depth', picture: (r) => depthPicture(r, 'depth'), text: depthText, when: (p) => p.style === 'block' || p.style === 'tray' },
  // The ribs' place is worked out only while they are on: both the picture and the text use the design with them on.
  coneSeat: { title: 'Rest on the cone', picture: () => conePicture(resolve({ ...params, coneSeat: true }), params.coneSeat), text: () => coneText(resolve({ ...params, coneSeat: true })) },
};
function depthText(r) {
  const what = r.v.label.toLowerCase();
  return `<p>How far each ${esc(what)} sinks into its hole. Deeper holds it steadier; shallower leaves more of it to grab. ` +
    `Here it sinks ${mm(r.depth)} mm and ${mm(Math.max(0, r.stickOut))} mm shows above.</p>` +
    `<p>Under each hole a solid floor of ${mm(r.height - r.depth)} mm is left, ${mm(r.gapX)} mm walls stand between the holes, ` +
    `and a ${mm(r.marginX)} mm border runs round the edge. The hole is ${mm(r.hole)} mm across${r.chamferC > 0.05 ? `, with a ${mm(r.chamferC)} mm funnel at the top` : ''}.</p>` +
    (r.autoHeight
      ? (r.style === 'tray'
        ? '<p>With “Usual height” on, a tray takes about a third of the tube, at most 20 mm. Switch it off to set the depth yourself.</p>'
        : `<p>With “Usual height” on, the block is two thirds as tall as the tube, on a ${mm(r.height - r.depth)} mm floor (Fine-tuning); the hole takes the rest. Switch it off to set the depth yourself.</p>`)
      : '');
}
function coneText(r) {
  return '<p>Conical tubes end in a point. Standing on that point, a tube wobbles and leans in its sleeve.</p>' +
    `<p>With this on, small ribs inside the sleeve catch the tube by its cone, ${mm(r.seatZ ?? 0)} mm above the table, ` +
    'so it stands straight with its tip 2 mm off the floor. Their undersides slope at 45°, so the stand still prints upright without support.</p>' +
    (r.pushD ? `<p>The ${mm(r.pushD)} mm hole under the tube is the push-out hole (Extras).</p>` : '');
}

let explain = null; // { id, el, timer }
function openExplain(id) {
  closeExplain();
  const el = document.createElement('aside');
  el.className = 'explainer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'explain-t');
  el.innerHTML = `<div class="xhead"><h2 id="explain-t"></h2><button type="button" class="xclose" aria-label="Close">×</button></div>` +
    '<div class="xpic"></div><div class="xtext"></div>';
  document.body.appendChild(el);
  el.querySelector('.xclose').addEventListener('click', closeExplain);
  explain = { id, el, timer: 0 };
  infos.get(id)?.setAttribute('aria-expanded', 'true');
  renderExplain(true);
  placeExplain();
  el.querySelector('.xclose').focus({ preventScroll: true });
}
function closeExplain() {
  if (!explain) return;
  clearTimeout(explain.timer);
  infos.get(explain.id)?.setAttribute('aria-expanded', 'false');
  explain.el.remove();
  explain = null;
}
function renderExplain(play) {
  if (!explain) return;
  const x = EXPLAIN[explain.id];
  const r = resolve(params);
  explain.el.querySelector('h2').textContent = x.title;
  explain.el.querySelector('.xpic').innerHTML = x.picture(r);
  explain.el.querySelector('.xtext').innerHTML = x.text(r);
  explain.el.classList.toggle('play', play && !reduceMotion());
}
/** Beside the settings panel, level with the setting; a sheet along the bottom when there is no room. */
function placeExplain() {
  if (!explain) return;
  const el = explain.el;
  const row = controls.get(explain.id)?.row;
  const side = $('side').getBoundingClientRect();
  const wide = innerWidth - side.right > 460;
  el.classList.toggle('sheet', !wide);
  if (!wide || !row) {
    el.style.left = el.style.top = '';
    return;
  }
  const at = row.getBoundingClientRect();
  const top = Math.max(64, Math.min(innerHeight - el.offsetHeight - 12, at.top - 24));
  el.style.left = `${side.right + 14}px`;
  el.style.top = `${top}px`;
  el.style.setProperty('--arrow', `${Math.max(18, Math.min(el.offsetHeight - 18, at.top + 10 - top))}px`);
}
/** After a change: redraw at once without the drop, then play it again once things settle. */
function followExplain() {
  if (!explain) return;
  const c = controls.get(explain.id);
  const x = EXPLAIN[explain.id];
  if (!c || c.row.hidden || (x.when && !x.when(params))) return closeExplain();
  renderExplain(false);
  placeExplain();
  clearTimeout(explain.timer);
  explain.timer = setTimeout(() => renderExplain(true), 1200);
}

// ---------- guides: from a problem to the setting that fixes it ----------
// "Show me how" takes the user to the first setting of the problem's fix (validate() in params.js):
// opens its tab and the fine-tuning fold, scrolls to it, rings it and says what to do. When that
// step is done (a switch flipped) it moves on; when the problem is gone it says so and stops.
let guide = null; // { key, from, at }
const shownStep = (s) => controls.has(s.id) && shownFor(controls.get(s.id).d, params);

function startGuide(key) {
  guide = { key, from: 0, at: null };
  runGuide();
  renderIssues(validate(resolve(params)));
}
function stopGuide(message) {
  guide = null;
  for (const row of document.querySelectorAll('.field.guided')) row.classList.remove('guided');
  for (const box of document.querySelectorAll('.coach')) box.remove();
  renderIssues(validate(resolve(params)));
  if (message) toast(message);
}
function runGuide() {
  if (!guide) return;
  const r = resolve(params);
  const issue = validate(r).find((i) => i.key === guide.key);
  if (!issue) return stopGuide('Fixed: that problem is gone.');
  const steps = issue.fix || [];
  let i = steps.findIndex((s, k) => k >= guide.from && shownStep(s) && !(s.done && s.done(params, r)));
  // Everything done or hidden, but the problem stays: keep pointing at the last step that can be seen.
  if (i < 0) i = steps.map((s, k) => (shownStep(s) ? k : -1)).filter((k) => k >= 0).pop() ?? -1;
  if (i < 0) return stopGuide();
  const s = steps[i];
  const c = controls.get(s.id);
  const moved = guide.at !== s.id;
  guide.at = s.id;
  for (const row of document.querySelectorAll('.field.guided')) if (row !== c.row) row.classList.remove('guided');
  for (const box of document.querySelectorAll('.coach')) if (box.parentNode !== c.row) box.remove();
  if (prefs.tab !== c.d.group) showTab(c.d.group);
  const more = panes.get(c.d.group).more;
  if (c.d.adv && more && !more.open) more.open = true;
  c.row.classList.add('guided');

  const another = steps.some((t, k) => k > i && shownStep(t));
  const sig = `${i}|${s.say}|${another}`;
  let box = c.row.querySelector('.coach');
  if (!box) {
    box = document.createElement('div');
    box.className = 'coach';
    box.setAttribute('role', 'status');
    c.row.prepend(box);
  }
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    box.innerHTML =
      `<span class="n">${steps.length > 1 ? `Step ${i + 1} of ${steps.length}` : 'Change this'}</span>` +
      `<span class="say">${esc(s.say)}</span><span class="acts">` +
      (another ? '<button type="button" class="other">Another way</button>' : '') +
      '<button type="button" class="stop">Stop</button></span>';
    box.querySelector('.other')?.addEventListener('click', () => {
      guide.from = i + 1;
      runGuide();
    });
    box.querySelector('.stop').addEventListener('click', () => stopGuide());
  }
  if (moved) {
    c.row.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
    c.row.querySelector('input, select, .segs button.on, .cards .card.on')?.focus({ preventScroll: true });
  }
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
    $('status').textContent = 'Fix the problem above to see the holder. “Show me how” takes you to the setting.';
    renderReadouts(r);
    showOnBed(r);
    return;
  }
  const key = shapeKey(r);
  if (!built || built.key !== key) {
    const t0 = performance.now();
    try {
      const solid = buildHolder(kernel, r);
      let plate = null;
      try {
        // A stand's base plate is its own part; the view shows the two together, the stand in its pocket.
        plate = r.basePlate ? buildBasePlate(kernel, r) : null;
        const part = toMesh(solid);
        const plateMesh = plate ? toMesh(plate) : null;
        built = {
          key, part, plate: plateMesh, mesh: plateMesh ? mergeMeshes(part, plateMesh) : part,
          volume: solidVolume(solid) + (plate ? solidVolume(plate) : 0),
          area: solidArea(solid) + (plate ? solidArea(plate) : 0),
          ms: performance.now() - t0,
        };
      } finally {
        solid.delete();
        if (plate) plate.delete();
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
  showOnBed(r);
}

function update() {
  const r = resolve(params);
  syncControls();
  queueThumbs();
  renderIssues(validate(r));
  renderReadouts(r);
  queueBuild();
  runGuide();
  followExplain();
}

// ---------- export, share, import ----------
function download() {
  if (!kernel || !built) return toast('Fix the highlighted problem first');
  const r = resolve(params);
  const title = `Holder for ${r.count} × ${r.v.label}, ${mm(r.outerX)} × ${mm(r.outerY)} × ${mm(r.outerZ)} mm`;
  const format = $('format').value;
  const solid = buildHolder(kernel, r, 128);
  let plate = null;
  let data;
  try {
    let mesh = toMesh(solid);
    if (r.basePlate) {
      // Two parts: the stand standing on z = 0 again, and the plate flat in front of it.
      plate = buildBasePlate(kernel, r, 128);
      mesh = moveMesh(mesh, [0, 0, -r.footH]);
      const plateMesh = moveMesh(toMesh(plate), [0, -(r.sizeY / 2 + 10 + r.benchY / 2), 0]);
      data = format === 'stl'
        ? stlBuffer(mergeMeshes(mesh, plateMesh), title)
        : threeMf([{ mesh, name: 'Stand' }, { mesh: plateMesh, name: 'Base plate' }], title, params);
    } else {
      data = format === 'stl' ? stlBuffer(mesh, title) : threeMf(mesh, title, params);
    }
  } finally {
    solid.delete();
    if (plate) plate.delete();
  }
  saveFile(data, params.style === 'single' ? `stand_${params.vessel}.${format}` : `holder_${params.vessel}_${r.cols}x${r.rows}_${params.style}.${format}`, format);
}

/** Hands a 3MF or STL to the browser as a download. */
function saveFile(data, name, format) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: format === 'stl' ? 'model/stl' : 'model/3mf' }));
  a.download = name;
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

// ---------- the hole fit test ----------
// A short strip with five holes around the current fit, each with its value printed by it: print it,
// try the tube, type the best value into "Hole fit". Shown in a small window with its picture.
function fitTestFile(t, r, segments) {
  const solid = buildFitTest(kernel, t, r, segments);
  try {
    return { mesh: toMesh(solid), volume: solidVolume(solid), area: solidArea(solid) };
  } finally {
    solid.delete();
  }
}
function openFitTest() {
  if (!kernel) return toast('Still loading the geometry kernel');
  if ($('fittest')) return;
  const t = fitTest(params);
  const r = resolve(params);
  const { mesh, volume, area } = fitTestFile(t, r, 64);
  // As for the holder: three wall lines all over, the rest at the chosen infill.
  const shell = Math.min(volume, area * 3 * r.nozzle);
  const grams = ((shell + (volume - shell) * (r.infill / 100)) / 1000) * PARAMS.find((d) => d.id === 'material').options[r.material].density;
  const pic = thumber ? thumber(mesh, null, [0.25, -1.1, 1.5]) : '';
  const way = t.printUp === 'y'
    ? 'lying on its long side, the numbers facing sideways, the same way up as the holder, so the holes come out the same'
    : 'flat, numbers up';
  const dlg = document.createElement('dialog');
  dlg.id = 'fittest';
  dlg.className = 'fittest';
  dlg.setAttribute('aria-labelledby', 'fittest-t');
  dlg.innerHTML =
    '<h2 id="fittest-t">Hole fit test</h2>' +
    (pic ? `<img alt="The test strip: five holes in a row, each with its fit value printed in front of it" src="${pic}">` : '') +
    `<p>Five holes for your ${esc(r.v.label.replace(/^[A-Z][a-z]/, (c) => c.toLowerCase()))}, from ${t.labels[0]} to ${t.labels[4]} mm, ` +
    `${mm(t.sizeX)} × ${mm(t.sizeY)} × ${t.H} mm, about ${sig(grams, 2)} g. The middle one, underlined, is your current hole fit.</p>` +
    `<ol><li>Print it ${way}.</li><li>Push your tube into each hole: it should slide in with a gentle push and not wobble.</li>` +
    '<li>Type the number printed by the best hole into “Hole fit”.</li></ol>' +
    '<div class="ftbar"><button type="button" class="quiet ftclose">Close</button><button type="button" class="go ftget">Download the test</button></div>';
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('.ftclose').addEventListener('click', () => dlg.close());
  dlg.querySelector('.ftget').addEventListener('click', () => {
    const format = $('format').value;
    const title = `Hole fit test for ${r.v.label}, fits ${t.labels[0]} to ${t.labels[4]} mm`;
    const { mesh: fine } = fitTestFile(t, r, 128);
    saveFile(format === 'stl' ? stlBuffer(fine, title) : threeMf(fine, title, params), `fit-test_${params.vessel}.${format}`, format);
  });
  dlg.showModal();
  dlg.querySelector('.ftget').focus();
}

// ---------- first visit: a short introduction ----------
// Four slides, each with one of the tour's animations (tour.html, embedded), shown once to a new
// visitor and again from the header's "Intro". The second is about the printer's bed, the third explains the teardrop holes.
const INTRO = 'holder-designer.intro.v1';
const SLIDES = [
  { step: 'kinds', title: 'Welcome',
    text: 'Pick a kind of holder and the tube it is for. The tool works out the holes, the spacing and the height for you, and checks that it will print. You can still change every number.' },
  { step: 'print', title: 'Tell it your printer',
    text: 'A holder is only useful if your printer can make it. Pick your printer at the top of the right-hand panel: the tool checks that the holder fits on its bed and shows how it will lie there. If it is too big, it says what to change, or which printer it would fit.' },
  { step: 'teardrop', title: 'Why some holes are pointed',
    text: 'Some holders print best lying on their side. Then every hole is a short tunnel, and the top of a round tunnel would hang in mid-air and sag. So the tool gives each hole a pointed top: its two 45° sides each rest on the layer below, and nothing needs support. The tube only touches the round part, so it fits the same.' },
  { step: 'adapt', title: 'Change anything, safely',
    text: 'Every setting under Fine-tuning has a ↺ arrow that puts it back to the usual value. If something cannot be printed, its message has a “Show me how” button that takes you to the setting that fixes it.' },
];
/** `at`: the slide to open at, by number or by its step (e.g. 'teardrop'). */
function openIntro(at = 0) {
  if ($('welcome')) return;
  const dlg = document.createElement('dialog');
  dlg.id = 'welcome';
  dlg.className = 'welcome';
  dlg.setAttribute('aria-labelledby', 'welcome-t');
  dlg.innerHTML =
    `<div class="welstage"><iframe title="Animation" tabindex="-1" src="tour.html?embed&only=${SLIDES.map((s) => s.step).join(',')}"></iframe></div>` +
    '<div class="weltext"><h2 id="welcome-t"></h2><p class="welbody"></p><div class="welbar">' +
    `<span class="dots" aria-hidden="true">${SLIDES.map(() => '<i></i>').join('')}</span>` +
    '<button type="button" class="quiet wel-skip">Skip</button><button type="button" class="quiet wel-back">Back</button><button type="button" class="go wel-next"></button></div></div>';
  document.body.appendChild(dlg);
  const frame = dlg.querySelector('iframe');
  let i = typeof at === 'string' ? Math.max(0, SLIDES.findIndex((s) => s.step === at)) : at;
  let api = null;
  const show = () => {
    const s = SLIDES[i];
    $('welcome-t').textContent = s.title;
    dlg.querySelector('.welbody').textContent = s.text;
    dlg.querySelectorAll('.dots i').forEach((dot, k) => dot.classList.toggle('on', k === i));
    dlg.querySelector('.wel-back').hidden = i === 0;
    dlg.querySelector('.wel-skip').hidden = i === SLIDES.length - 1;
    dlg.querySelector('.wel-next').textContent = i === SLIDES.length - 1 ? 'Start designing' : `Next (${i + 1} of ${SLIDES.length})`;
    const k = api ? api.steps.findIndex((t) => t.id === s.step) : -1;
    if (k >= 0) api.go(k);
  };
  frame.addEventListener('load', () => {
    try {
      api = frame.contentWindow.holderTour || null;
    } catch {}
    show();
  });
  const seen = () => {
    try {
      store().setItem(INTRO, '1');
    } catch {}
  };
  dlg.addEventListener('cancel', seen);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.querySelector('.wel-skip').addEventListener('click', () => (seen(), dlg.close()));
  dlg.querySelector('.wel-back').addEventListener('click', () => ((i = Math.max(0, i - 1)), show()));
  dlg.querySelector('.wel-next').addEventListener('click', () => {
    if (i < SLIDES.length - 1) return (i++, show());
    seen();
    dlg.close();
  });
  show();
  dlg.showModal();
  dlg.querySelector('.wel-next').focus();
}

// ---------- start ----------
buildControls();
$('issues').addEventListener('click', (e) => {
  const b = e.target.closest('button.how');
  if (!b) return;
  if (guide && guide.key === b.dataset.key) stopGuide();
  else startGuide(b.dataset.key);
});
// "Why teardrops?" links, in the Print tab and in the print advice.
document.addEventListener('click', (e) => {
  if (e.target.closest('button.fittest')) return openFitTest();
  const b = e.target.closest('button.why');
  if (b) openIntro(b.dataset.intro || 0);
});
$('introbtn').addEventListener('click', () => openIntro(0));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && explain && !document.querySelector('dialog[open]')) closeExplain();
});
$('side').addEventListener('scroll', placeExplain, { passive: true });
addEventListener('resize', placeExplain);
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

// A first visit opens with the introduction (not when embedded in another page).
try {
  if (!EMBED && !store().getItem(INTRO)) openIntro(0);
} catch {}

window.holder = { get params() { return params; }, get built() { return built; }, view, importFile };
