/* Three enhancements. Without this file the page is complete: the fermenter
   holds its opening view, the nav has no "you are here" mark, and the
   designer's frame is a link to the tool.

   0. Scroll: tell the fermenter (js/tank.js) where to look.
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

  /* The few numbers here that shape how the page moves. js/tweak.js (local
     only) changes them; nothing else needs to. */
  var SITE = window.SITE = {
    rest: 0.18,      // share of the way between two scenes the camera rests at each end
    hold: 5200       // ms a tour step is held before the tour moves on
  };

  /* Every word this file writes into the page: the status lines under the
     facts and the designer tour. This table is the default; js/tweak.js
     rewrites entries with SITE.say(key, text). The names of the printed
     impellers and racks ('print.kind.1' ..., 'racks.kind.1' ...) come from
     js/tank.js and are added here once the fermenter is up. */
  var WORDS = SITE.words = {
    'print.building': 'Printing now', 'print.run': 'Stirring now',
    'print.still': 'On the shaft', 'print.next': 'Next print',
    'racks.building': 'Printing now', 'racks.next': 'Next print',
    'racks.done': 'Printed, tubes in', 'racks.rest': 'On the bench',
    'tour.phases.label': 'Phases',
    'tour.phases.text': 'Build the feed as a sequence of phases, each with its own rate, temperature and exit condition.',
    'tour.readouts.label': 'Readouts',
    'tour.readouts.text': 'Read off the pump setpoint, the feed used and how many bottles the run needs.',
    'tour.setpoint.label': 'Setpoint',
    'tour.setpoint.text': 'See the pump setpoint across the whole run, phase by phase.',
    'tour.clock.label': 'Clock times',
    'tour.clock.text': 'Every switch gets a time on the wall clock, flagged when it lands outside working hours.',
    'tour.week.label': 'Week',
    'tour.week.text': 'The whole run laid over the week, hour by hour, before anything is inoculated.',
    'tour.try': 'Try it live', 'tour.back': 'Back to the tour',
    'tour.live.mark': 'LIVE',
    'tour.live.text': 'Live: change any value and the schedule updates with it.'
  };
  SITE.wordDefaults = Object.assign({}, WORDS);
  var redraws = [];                 // each block that shows words adds how to show them again
  SITE.say = function (key, text) {
    if (text === null || text === undefined) {
      if (key in SITE.wordDefaults) WORDS[key] = SITE.wordDefaults[key];
    } else WORDS[key] = String(text);
    redraws.forEach(function (fn) { fn(); });
  };

  /* ---------------- 0. scroll drives the camera ----------------
     Every .scene names a shot. A shot is fully reached when its scene's
     middle crosses the middle of the screen; between two scenes the camera
     is blended from one shot to the next, with a rest at each end so a shot
     is held for a while rather than passed through. */
  (function () {
    var scenes = Array.prototype.slice.call(document.querySelectorAll('[data-shot]'));
    if (!scenes.length) return;
    var queued = false;

    function ease(t) {                      // rest, travel, rest
      var rest = Math.min(0.49, Math.max(0, SITE.rest));
      t = Math.min(1, Math.max(0, (t - rest) / (1 - 2 * rest)));
      return t * t * (3 - 2 * t);
    }

    function update() {
      queued = false;
      if (!window.TANK) return;
      var mid = innerHeight / 2;
      var portrait = innerWidth <= 860 || innerWidth < innerHeight;
      var a = scenes[0], b = scenes[0], t = 0;
      for (var i = 0; i < scenes.length; i++) {
        var r = scenes[i].getBoundingClientRect();
        if (!r.height) continue;            // a scene the stylesheet has hidden (narrow screens)
        var c = r.top + r.height / 2;
        if (c <= mid) { a = b = scenes[i]; t = 0; a._c = c; }
        else {
          if (i > 0) { b = scenes[i]; t = (mid - a._c) / (c - a._c); }
          break;
        }
      }
      window.TANK.look(a.dataset.shot, b.dataset.shot, ease(t), portrait);
    }
    function queue() { if (!queued) { queued = true; requestAnimationFrame(update); } }

    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    document.addEventListener('tank:ready', update);
    document.addEventListener('toggle', queue, true);   // a <details> changed the layout
    update();
  })();

  /* ---------------- 1. nav: you are here ---------------- */
  (function () {
    if (!('IntersectionObserver' in window)) return;
    var links = {};
    document.querySelectorAll('.nav__links a[href^="#"]:not(.nav__short)').forEach(function (a) {
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

  /* ---------------- 1b. which panels are in view ----------------
     Marks them .is-in. Only the optional arrival motion in the stylesheet
     (html[data-reveal], off by default) looks at it. */
  (function () {
    var els = document.querySelectorAll('.panel,.snap');
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('is-in', en.isIntersecting); });
    }, { threshold: 0.1 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ---------------- 1c. which impeller is being printed ----------------
     js/tank.js prints the lower impeller over and over while its section is
     on screen and says so in 'tank:print' events (kind, phase). The line in
     the panel names the three kinds and marks the one on the shaft: striped
     while it is being built, solid once it stirs. Without the 3D the line
     stays hidden. */
  (function () {
    var line = document.getElementById('printing');
    if (!line) return;
    var say = line.querySelector('.printing__say');
    var box = line.querySelector('.printing__kinds');
    var kinds = [], last = null;
    function show(d) {
      if (!kinds.length || !d) return;
      last = d;
      var building = d.phase === 'print';
      var on = building || d.phase === 'run' || d.phase === 'still';
      kinds.forEach(function (s, i) {
        s.textContent = WORDS['print.kind.' + (i + 1)];
        s.classList.toggle('is-on', on && i === d.kind);
        s.classList.toggle('is-building', building && i === d.kind);
        s.classList.toggle('is-next', !on && i === (d.next || 0));   // about to be printed
      });
      say.textContent = WORDS[building ? 'print.building' : d.phase === 'run' ? 'print.run'
        : d.phase === 'still' ? 'print.still' : 'print.next'];
    }
    redraws.push(function () { show(last); });
    function build() {
      if (kinds.length || !window.TANK || !window.TANK.impellers) return;
      window.TANK.impellers.forEach(function (name, i) {
        var s = document.createElement('span'), k = 'print.kind.' + (i + 1);
        s.className = 'printing__kind';
        SITE.wordDefaults[k] = name;
        if (!(k in WORDS)) WORDS[k] = name;
        box.appendChild(s);
        kinds.push(s);
      });
      line.hidden = false;
      show(window.TANK.print);
    }
    document.addEventListener('tank:ready', build);
    document.addEventListener('tank:print', function (e) { build(); show(e.detail); });
    build();
  })();

  /* ---------------- 1c2. how far the racks are ----------------
     js/tank.js prints the three racks on the bench once when their section
     arrives and says so in 'tank:racks' events (phase, which are built).
     Same line as the impeller's: a rack is striped while it is being built
     and solid once it stands. Without the 3D the line stays hidden. */
  (function () {
    var line = document.getElementById('racks');
    if (!line) return;
    var say = line.querySelector('.printing__say');
    var box = line.querySelector('.printing__kinds');
    var kinds = [], last = null;
    function show(d) {
      if (!kinds.length || !d) return;
      last = d;
      var printing = d.phase === 'print';
      var gone = d.phase === 'clear';
      kinds.forEach(function (s, i) {
        var built = d.built ? d.built[i] : true;
        s.textContent = WORDS['racks.kind.' + (i + 1)];
        s.classList.toggle('is-on', !gone && built);
        s.classList.toggle('is-building', printing && !built);
        s.classList.toggle('is-next', gone);
      });
      say.textContent = WORDS[printing ? 'racks.building' : gone ? 'racks.next'
        : d.phase === 'done' ? 'racks.done' : 'racks.rest'];
    }
    redraws.push(function () { show(last); });
    function build() {
      if (kinds.length || !window.TANK || !window.TANK.rackNames) return;
      window.TANK.rackNames.forEach(function (name, i) {
        var s = document.createElement('span'), k = 'racks.kind.' + (i + 1);
        s.className = 'printing__kind';
        SITE.wordDefaults[k] = name;
        if (!(k in WORDS)) WORDS[k] = name;
        box.appendChild(s);
        kinds.push(s);
      });
      line.hidden = false;
      show({ phase: window.TANK.racks.phase });
    }
    document.addEventListener('tank:ready', build);
    document.addEventListener('tank:racks', function (e) { build(); show(e.detail); });
    build();
  })();

  /* ---------------- 1d. frames that are simply live ----------------
     A .demo--plain figure holds a tool that needs no tour (the impeller
     designer, the holder designer): its frame is fetched a screen before it
     is needed, shown, and handed straight to the visitor. On a narrow screen the stylesheet
     hides the frame and leaves the link, so nothing is fetched there. */
  (function () {
    var figs = document.querySelectorAll('.demo--plain');
    Array.prototype.forEach.call(figs, function (fig) {
      var frame = fig.querySelector('.demo__iframe');
      if (!frame) return;
      function load() {
        if (frame.getAttribute('src') || getComputedStyle(frame).display === 'none') return;
        frame.addEventListener('load', function () { fig.classList.add('is-ready', 'is-live'); }, { once: true });
        frame.setAttribute('src', frame.getAttribute('data-src'));
      }
      if (!('IntersectionObserver' in window)) { load(); return; }
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) load();
      }, { rootMargin: '900px 0px' }).observe(fig);
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

  /* What the tour shows, in order. The words are in WORDS at the top, under
     'tour.<id>.label' and 'tour.<id>.text'. `sel` is an element inside the
     tool; if the tool is ever restructured and one goes missing, that step
     is skipped. */
  var STEPS = [
    { id: 'phases',   sel: '.phasewrap' },
    { id: 'readouts', sel: '#strip' },
    { id: 'setpoint', sel: '#grid .card' },
    { id: 'clock',    sel: '#sc-miles' },
    { id: 'week',     sel: '.sched .gridwrap' }
  ];

  var win, doc, cur = -1, timer = null;
  var live = false, inView = false, hover = false, manual = false, ready = false;

  fig.style.setProperty('--demo-hold', SITE.hold + 'ms');
  SITE.setHold = function (ms) {
    SITE.hold = ms;
    fig.style.setProperty('--demo-hold', ms + 'ms');
    schedule();
  };

  function playing() {
    return ready && !live && !manual && !hover && inView && !reduce && !document.hidden;
  }

  function schedule() {
    clearTimeout(timer);
    var on = playing();
    fig.classList.toggle('is-playing', on);
    if (on) timer = setTimeout(function () { go((cur + 1) % STEPS.length); }, SITE.hold);
  }

  function ring(el) {
    doc.querySelectorAll('.tour-ring').forEach(function (r) { r.classList.remove('tour-ring'); });
    if (el) el.classList.add('tour-ring');
  }

  function go(i) {
    var step = STEPS[i], el = doc.querySelector(step.sel);
    cur = i;
    capN.textContent = (i + 1) + '/' + STEPS.length;
    capTxt.textContent = WORDS['tour.' + step.id + '.text'];
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
    liveBtn.textContent = WORDS[on ? 'tour.back' : 'tour.try'];
    liveBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    frame.setAttribute('title', on ? 'Feed Profile Designer, live' : 'Feed Profile Designer, guided tour');
    if (on) {
      frame.removeAttribute('tabindex');
      ring(null);
      clearTimeout(timer);
      fig.classList.remove('is-playing');
      capN.textContent = WORDS['tour.live.mark'];
      capTxt.textContent = WORDS['tour.live.text'];
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
      b.textContent = WORDS['tour.' + s.id + '.label'];
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        if (live) setLive(false);
        manual = true;            // a chosen step stays put
        go(i);
      });
      stepsEl.appendChild(b);
    });

    liveBtn.addEventListener('click', function () { setLive(!live); });
    // the words were rewritten (js/tweak.js): show them, without moving the tour
    redraws.push(function () {
      stepsEl.querySelectorAll('button').forEach(function (b, k) {
        b.textContent = WORDS['tour.' + STEPS[k].id + '.label'];
      });
      liveBtn.textContent = WORDS[live ? 'tour.back' : 'tour.try'];
      if (live) { capN.textContent = WORDS['tour.live.mark']; capTxt.textContent = WORDS['tour.live.text']; }
      else if (cur >= 0) capTxt.textContent = WORDS['tour.' + STEPS[cur].id + '.text'];
    });
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
