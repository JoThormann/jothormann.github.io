/* Drawings that draw themselves: the off-gas chain, the first time it
   scrolls into view. (The hero did too, briefly; it now has paper depth.)

   The one piece of JavaScript on the page, and it is an enhancement only:
   without it, or with reduced motion asked for, every drawing is simply shown.
   CSS alone cannot do this. A scroll-driven animation can only scrub with the
   scroll, forwards and back, and the brief is "each thing moves once": the
   lines trace in the first time the figure arrives, then the drawing holds.

   How: every stroked shape without a dash pattern of its own gets a dash as
   long as itself, offset by its full length, so it starts invisible and draws
   in as the offset runs to zero. Its fill waits and fades in behind the ink.
   Anything that already has a dash pattern -- the marching signal and USB
   lines, the plot trace -- is left alone and just fades in, because giving it
   a new dash would break the pattern it is animating. Afterwards the inline
   dash is removed again, so the finished drawing is byte-for-byte what it was. */
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var SHAPES = 'path,rect,circle,ellipse,line,polyline,polygon,text,image,use';
  var DONE_AFTER = 2800;   // ms: the longest transition in site.css, plus margin

  function arm(svg) {
    var els = svg.querySelectorAll(SHAPES);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('defs,clipPath,mask,marker,pattern,symbol')) continue;
      var cs = getComputedStyle(el);
      var stroked = cs.stroke !== 'none' && parseFloat(cs.strokeWidth) > 0;
      var ownDash = cs.strokeDasharray !== 'none';
      var len = 0;
      if (stroked && !ownDash && typeof el.getTotalLength === 'function') {
        try { len = el.getTotalLength(); } catch (e) { len = 0; }
      }
      if (len > 0) {
        el.dataset.dwDash = el.style.strokeDasharray;   // restore exactly afterwards
        el.style.strokeDasharray = len;
        el.style.setProperty('--dw-len', len);
        el.classList.add('dw-s');
      } else {
        el.classList.add('dw-f');
      }
    }
    svg.classList.add('dw-armed');
  }

  function draw(svg) {
    svg.classList.add('dw-go');
    // Flush style so the armed values are the transition's starting point,
    // then release them. A forced read rather than requestAnimationFrame:
    // rAF is paused in a background tab, and this must not depend on painting.
    var first = svg.querySelector('.dw-s,.dw-f');
    if (first) void getComputedStyle(first).opacity;
    svg.classList.remove('dw-armed');
    setTimeout(function () {
      var s = svg.querySelectorAll('.dw-s');
      for (var i = 0; i < s.length; i++) {
        s[i].style.strokeDasharray = s[i].dataset.dwDash || '';
        s[i].style.removeProperty('--dw-len');
        delete s[i].dataset.dwDash;
      }
      svg.classList.remove('dw-go');
    }, DONE_AFTER);
  }

  var figs = document.querySelectorAll('.fig--draw');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      // a figure can hold two drawings (landscape and portrait); only one is
      // ever displayed, but both are drawn so a resize never finds one armed
      en.target.querySelectorAll('svg').forEach(draw);
      io.unobserve(en.target);
    });
  // Start as soon as the top edge is a little way up the screen. A fraction of
  // the figure's own height is the wrong trigger: on a phone the portrait
  // chain is ~1280px tall, and 25% of it meant 320px of empty frame first.
  }, { threshold: 0, rootMargin: '0px 0px -15% 0px' });

  figs.forEach(function (fig) {
    fig.querySelectorAll('svg').forEach(arm);
    fig.classList.add('dw-ready');   // armed: the pre-paint hiding can lift
    io.observe(fig);
  });
})();
