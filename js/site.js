/* Two enhancements. Without this file the page is complete: the nav simply has
   no "you are here" mark, and the designer's frame is a link to the tool.

   1. Nav: mark the link of the section on screen.
   2. The designer tour: load the real tool into its frame and walk it from
      panel to panel, like a tutorial video that cannot go out of date.

   The tour reaches into the frame's document, which only works because the
   tool is served from this same site. Nothing in the tool is changed and
   nothing is saved: the tool keeps a working profile in memory and only
   writes to storage when someone presses its own Save button. */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 1. nav: you are here ---------------- */
  (function () {
    if (!('IntersectionObserver' in window)) return;
    var links = {};
    document.querySelectorAll('.nav__links a[href^="#"]').forEach(function (a) {
      links[a.getAttribute('href').slice(1)] = a;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var a = links[en.target.id];
        if (!a) return;
        if (en.isIntersecting) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    // a band across the middle of the screen: whichever section crosses it is "here"
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(links).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  })();

  /* ---------------- 2. the designer tour ---------------- */
  var fig = document.getElementById('demo');
  if (!fig) return;
  var frame = fig.querySelector('.demo__iframe');
  var bar = fig.querySelector('.demo__bar');
  var capN = fig.querySelector('.demo__n');
  var capTxt = fig.querySelector('.demo__txt');
  var stepsEl = fig.querySelector('.demo__steps');
  var liveBtn = fig.querySelector('.demo__live');

  /* What the tour shows, in order. `sel` is an element inside the tool; if the
     tool is ever restructured and one goes missing, that step is skipped. */
  var STEPS = [
    { label: 'Phases',      sel: '.phasewrap',
      text: 'Build the feed as a sequence of phases, each with its own rate, temperature and exit condition.' },
    { label: 'Readouts',    sel: '#strip',
      text: 'Read off the pump setpoint, the feed used and how many bottles the run needs.' },
    { label: 'Setpoint',    sel: '#grid .card',
      text: 'See the pump setpoint across the whole run, phase by phase.' },
    { label: 'Clock times', sel: '#sc-miles',
      text: 'Every switch gets a time on the wall clock, flagged when it lands outside working hours.' },
    { label: 'Week',        sel: '.sched .gridwrap',
      text: 'The whole run laid over the week, hour by hour, before anything is inoculated.' }
  ];
  var HOLD = 5200;                 // ms a step is held before the tour moves on
  var LIVE_TEXT = 'Live: change any value and the schedule updates with it.';

  var win, doc, cur = -1, timer = null;
  var live = false, inView = false, hover = false, manual = false, ready = false;

  fig.style.setProperty('--demo-hold', HOLD + 'ms');

  function playing() {
    return ready && !live && !manual && !hover && inView && !reduce && !document.hidden;
  }

  function schedule() {
    clearTimeout(timer);
    var on = playing();
    fig.classList.toggle('is-playing', on);
    if (on) timer = setTimeout(function () { go((cur + 1) % STEPS.length); }, HOLD);
  }

  function ring(el) {
    doc.querySelectorAll('.tour-ring').forEach(function (r) { r.classList.remove('tour-ring'); });
    if (el) el.classList.add('tour-ring');
  }

  function go(i) {
    var step = STEPS[i], el = doc.querySelector(step.sel);
    cur = i;
    capN.textContent = (i + 1) + '/' + STEPS.length;
    capTxt.textContent = step.text;
    stepsEl.querySelectorAll('button').forEach(function (b, k) {
      b.setAttribute('aria-pressed', k === i ? 'true' : 'false');
    });
    if (el) {
      var r = el.getBoundingClientRect();
      var room = win.innerHeight - r.height;
      // centre a panel that fits; otherwise show its top with a little air
      var y = r.top + win.scrollY - Math.max(20, Math.min(room / 2, 190));
      win.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
      ring(el);
    }
    // restart the progress bar on the active button
    fig.classList.remove('is-playing');
    void fig.offsetWidth;
    schedule();
  }

  function setLive(on) {
    live = on;
    fig.classList.toggle('is-live', on);
    doc.documentElement.classList.toggle('tour', !on);
    liveBtn.textContent = on ? 'Back to the tour' : 'Try it live';
    liveBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    frame.setAttribute('title', on ? 'Feed Profile Designer, live' : 'Feed Profile Designer, guided tour');
    if (on) {
      frame.removeAttribute('tabindex');
      ring(null);
      clearTimeout(timer);
      fig.classList.remove('is-playing');
      capN.textContent = 'LIVE';
      capTxt.textContent = LIVE_TEXT;
      stepsEl.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    } else {
      frame.setAttribute('tabindex', '-1');
      manual = false;
      go(0);
    }
  }

  function init() {
    try {
      win = frame.contentWindow;
      doc = frame.contentDocument;
      if (!doc || !doc.querySelector(STEPS[0].sel)) throw new Error('tool not reachable');
    } catch (e) {
      // Cannot drive it (opened from disk, or the tool changed): show it as a
      // plain live embed instead. Still better than a picture of it.
      fig.classList.add('is-ready', 'is-live');
      frame.removeAttribute('tabindex');
      return;
    }

    STEPS = STEPS.filter(function (s) { return doc.querySelector(s.sel); });

    var css = doc.createElement('style');
    css.textContent =
      'html.tour{scrollbar-width:none}html.tour::-webkit-scrollbar{display:none}' +
      '.tour-ring{outline:3px solid #345ecc!important;outline-offset:5px;border-radius:10px}';
    doc.head.appendChild(css);
    doc.documentElement.classList.add('tour');

    STEPS.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'demo__step';
      b.textContent = s.label;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        if (live) setLive(false);
        manual = true;            // a chosen step stays put
        go(i);
      });
      stepsEl.appendChild(b);
    });

    liveBtn.addEventListener('click', function () { setLive(!live); });
    fig.addEventListener('mouseenter', function () { hover = true; schedule(); });
    fig.addEventListener('mouseleave', function () { hover = false; schedule(); });
    document.addEventListener('visibilitychange', schedule);

    bar.hidden = false;
    ready = true;
    fig.classList.add('is-ready');
    go(0);
  }

  function load() {
    if (frame.getAttribute('src')) return;
    frame.addEventListener('load', function () {
      // the tool lays itself out on load; give it a beat before measuring
      setTimeout(init, 250);
    }, { once: true });
    frame.setAttribute('src', frame.getAttribute('data-src'));
  }

  if ('IntersectionObserver' in window) {
    // fetch the tool a screen before it is needed, not with the page
    var near = new IntersectionObserver(function (en) {
      if (en[0].isIntersecting) { load(); near.disconnect(); }
    }, { rootMargin: '900px 0px' });
    near.observe(fig);

    // only play while the frame is actually being looked at
    new IntersectionObserver(function (en) {
      inView = en[0].isIntersecting;
      schedule();
    }, { threshold: 0.35 }).observe(fig);
  } else {
    inView = true;
    load();
  }
})();
