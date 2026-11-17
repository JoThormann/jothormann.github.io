/* toon_materials.js — cel/toon shading system for the bioreactor rig.
 * Owner: shading agent. Do not edit from any other role.
 *
 * Attaches window.ToonMat. Assumes a global THREE (r128) is already loaded.
 * No ES modules, no imports — plain script, matches reactor_template.html's
 * loading model (three.js from cdnjs via a <script> tag).
 *
 * Required API (scene contract):
 *   ToonMat.init({ light:[x,y,z], dpr })   // once
 *   ToonMat.hardware(hexColour, opts)      // steel/plastic/painted: cel bands
 *   ToonMat.glass(hexTint, opts)           // fresnel-ish tinted glass
 *   ToonMat.outline(widthPx)               // inverted-hull material
 *   ToonMat.setView(THREE.Vector3)         // call whenever the camera moves
 *   ToonMat.setTime(seconds)
 *   ToonMat.all                            // array of every material made
 *
 * Bonus exports (additive, not required by the contract, documented in the
 * shading agent's final report):
 *   ToonMat.presets   // named, ready-to-use materials for every part class
 *                      // asked for in SCENE_CONTRACT.md
 *   ToonMat.weld(positions, indices, eps)  // vertex-weld for smooth-normal
 *                      // hull geometry — the inverted-hull outline trick
 *                      // needs welded normals or it tears at sharp edges.
 *                      // Ported from reactor_template.html's weld().
 *
 * Design notes (why it looks the way it does):
 *
 * - Hardware materials use a hard 3-step cel ramp (no smoothstep on the
 *   ramp itself — genuine `if` cuts), a 2-step hard rim/backlight band, and
 *   one hard specular cut. That is three different "hard step" features,
 *   all built the same way, on purpose: consistency is what reads as a
 *   deliberate style instead of a cartoon flatness.
 * - Glass is the one place a smooth curve is correct, not a bug: "nearly
 *   clear face-on, gathers colour at grazing angles" is a Fresnel term by
 *   definition, and the customer's own reference art (new_label_960.png)
 *   shades its glass with a soft gradient while everything else is flat —
 *   so glass gets a continuous pow() falloff, hardware does not.
 * - Outline width is given in CSS pixels and converted to world (mm) units
 *   every frame from the orthographic camera's own projection matrix
 *   (projectionMatrix[1][1] == 1 / halfHeight for an ortho camera) and the
 *   canvas's live CSS height, which this file watches itself via
 *   ResizeObserver — the lead does not need to push anything for outlines
 *   to stay a constant width on screen across zoom/resize/sweep. See the
 *   CRITICAL GOTCHAS note further down for why this does NOT depend on the
 *   view direction, only the outline's own vertex offset does not use uView
 *   at all, unlike the rim and glass terms which do and are updated by
 *   setView() every time the azimuth sweep moves the camera.
 */
(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    console.error('ToonMat: THREE is not loaded — include three.js before toon_materials.js.');
    return;
  }

  /* ---------------------------------------------------------------------
   * Shared uniform objects. Every material that needs the light direction,
   * view direction, sim time, or the outline pixel->world scale points its
   * uniform at the SAME object reference below, so setView()/setTime() only
   * ever mutate one object each and every material sees the update on its
   * very next frame — no per-material loop needed at call time.
   * ------------------------------------------------------------------- */
  var lightUniform = { value: new THREE.Vector3(-0.42, -0.50, 0.76).normalize() };
  var viewUniform = { value: new THREE.Vector3(1, 0, 0) };
  var timeUniform = { value: 0 };
  var viewportHUniform = { value: (typeof window !== 'undefined' && window.innerHeight) || 1000 };

  var DPR = 1;
  var watchedCanvas = null;

  /** Find the page's WebGL canvas and keep viewportHUniform in sync with its
   *  live CSS height, so outline width stays correct across resize without
   *  the lead having to call anything. Safe to call repeatedly — no-ops once
   *  a canvas is found. Assumes the first <canvas> in the document is the
   *  three.js output canvas (true for this rig's single-canvas pages). */
  function watchCanvas() {
    if (watchedCanvas || typeof document === 'undefined') return;
    var canvas = document.querySelector('canvas');
    if (!canvas) return;
    watchedCanvas = canvas;
    var update = function () {
      viewportHUniform.value = canvas.clientHeight || viewportHUniform.value;
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(update).observe(canvas);
    } else if (typeof window !== 'undefined') {
      window.addEventListener('resize', update);
    }
  }

  /* ---------------------------------------------------------------------
   * Vertex-weld: coincident vertices merged so a hull built from `normal`
   * offsets stays watertight at sharp edges. Same algorithm as the working
   * helper in reactor_template.html (harvested, not reinvented) — the
   * inverted-hull outline trick tears open at hard edges without this.
   * ------------------------------------------------------------------- */
  function weld(pos, idx, eps) {
    eps = eps || 1e-3;
    var map = new Map();
    var out = [];
    var remap = new Int32Array(pos.length / 3);
    var q = 1 / eps;
    for (var i = 0; i < pos.length; i += 3) {
      var key = Math.round(pos[i] * q) + ',' + Math.round(pos[i + 1] * q) + ',' + Math.round(pos[i + 2] * q);
      var hit = map.get(key);
      if (hit === undefined) {
        hit = out.length / 3;
        map.set(key, hit);
        out.push(pos[i], pos[i + 1], pos[i + 2]);
      }
      remap[i / 3] = hit;
    }
    var ni = new Uint32Array(idx.length);
    for (var j = 0; j < idx.length; j++) ni[j] = remap[idx[j]];
    return { positions: new Float32Array(out), indices: ni };
  }

  /* =======================================================================
   * Shaders
   * ===================================================================== */

  /* ---- hardware: cel bands + hard rim + hard specular + shadow screentone.
   * USE_INSTANCING guarded exactly like reactor_template.html's TOON_VERT —
   * a raw ShaderMaterial on an InstancedMesh must apply instanceMatrix
   * itself or every instance draws at the origin. */
  var TOON_VERT = [
    'varying vec3 vN;',
    'void main() {',
    '  vec3 n = normal;',
    '  vec4 p = vec4(position, 1.0);',
    '  #ifdef USE_INSTANCING',
    '    p = instanceMatrix * p;',
    '    n = mat3(instanceMatrix) * n;',
    '  #endif',
    '  vN = normalize(mat3(modelMatrix) * n);',
    '  gl_Position = projectionMatrix * modelViewMatrix * p;',
    '}',
  ].join('\n');

  var TOON_FRAG = [
    'uniform vec3 uColor;',
    'uniform vec3 uLight;',
    'uniform vec3 uView;',
    'uniform float uAlpha;',
    'uniform float uDot;',
    'uniform float uRimStrength;',
    'uniform float uSpecStrength;',
    'uniform float uHiCut, uLoCut;',
    'uniform float uHiGain, uLoGain;',
    'uniform float uEmissive;',
    'uniform float uTime;',
    '// shared by every hardware material (ToonMat.globals): the look as a whole',
    'uniform float uDotK, uDotDark, uDotMin, uDotGrow, uShadeK, uHiK, uRimK, uSpecK, uBias, uFlat;',
    'uniform vec2 uDotRot;',
    'uniform vec3 uShadeTint;',
    'varying vec3 vN;',
    '',
    'void main() {',
    '  vec3 N = normalize(vN);',
    '  vec3 L = normalize(uLight);',
    '  vec3 V = normalize(uView);',
    '',
    '  // three flat tone steps, hard boundaries — no smoothstep on the ramp',
    '  float s = dot(N, L) * 0.5 + 0.5 + uBias;',
    '  vec3 c;',
    '  if (s > uHiCut)      c = uColor * (1.0 + (uHiGain - 1.0) * uHiK);',
    '  else if (s > uLoCut) c = uColor;',
    '  else {',
    '    // The shadow band is printed, not painted: a cool flat tone under a',
    '    // Ben-Day screen on a 45 degree grid whose dots GROW with depth into',
    '    // the shadow, so the tone deepens the way a printed gradient does',
    '    // (small dots at the terminator, merging toward the dark side).',
    '    // gl_FragCoord is DEVICE pixels, so uDot is pre-scaled by DPR in JS.',
    '    vec3 shade = uColor * (1.0 - (1.0 - uLoGain) * uShadeK) * uShadeTint;',
    '    float depth = clamp((uLoCut - s) / max(uLoCut, 1e-3), 0.0, 1.0);',
    '    float pitch = max(uDot * uDotK, 1.5);',
    '    vec2 q = mat2(uDotRot.x, -uDotRot.y, uDotRot.y, uDotRot.x) * gl_FragCoord.xy / pitch;',
    '    float d = length(fract(q) - 0.5);',
    '    float rad = uDotMin + uDotGrow * depth;',
    '    float aa = 0.75 / pitch;',
    '    float ink = 1.0 - smoothstep(rad - aa, rad + aa, d);',
    '    c = mix(shade, shade * uDotDark, ink);',
    '  }',
    '  c = mix(c, uColor, uFlat);',
    '',
    '  // rim / backlight so silhouettes separate from the background —',
    '  // two hard steps, same rule as the tone ramp, not a soft pow falloff',
    '  float rim = 1.0 - abs(dot(N, V));',
    '  if (rim > 0.82)      c = mix(c, vec3(1.0), min(0.55 * uRimStrength * uRimK, 1.0));',
    '  else if (rim > 0.60) c = mix(c, vec3(1.0), min(0.22 * uRimStrength * uRimK, 1.0));',
    '',
    '  // one hard specular cut, not a pow() falloff',
    '  if (uSpecStrength * uSpecK > 0.0) {',
    '    vec3 H = normalize(L + V);',
    '    if (dot(N, H) > 0.965) c = mix(c, vec3(1.0), min(uSpecStrength * uSpecK, 1.0));',
    '  }',
    '',
    '  // optional LED-style emissive breathing glow (a light source, not a',
    '  // shading tone — this is the one deliberately smooth term in the',
    '  // whole hardware shader, and it is what setTime() drives).',
    '  if (uEmissive > 0.0) {',
    '    float pulse = 0.5 + 0.5 * sin(uTime * 2.4);',
    '    c += uColor * uEmissive * pulse;',
    '  }',
    '',
    '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), uAlpha);',
    '}',
  ].join('\n');

  /* ---- outline: inverted hull, offset along the (smooth, welded) normal by
   * a world-space width computed fresh every frame from widthPx so it stays
   * a constant number of screen pixels regardless of ortho zoom. Never uses
   * view direction — that is what makes the inverted-hull trick work at all
   * (the offset has to be the same seen from any azimuth). */
  var OUTLINE_VERT = [
    'uniform float uWidthPx;',
    'uniform float uViewportH;',
    'void main() {',
    '  vec3 n = normal;',
    '  vec4 p = vec4(position, 1.0);',
    '  #ifdef USE_INSTANCING',
    '    p = instanceMatrix * p;',
    '    n = mat3(instanceMatrix) * n;',
    '  #endif',
    '  // orthographic camera only: projectionMatrix[1][1] == 2/(top-bottom)',
    '  float halfHeight = 1.0 / projectionMatrix[1][1];',
    '  float worldPerPx = (2.0 * halfHeight) / max(uViewportH, 1.0);',
    '  p.xyz += normalize(n) * (uWidthPx * worldPerPx);',
    '  gl_Position = projectionMatrix * modelViewMatrix * p;',
    '}',
  ].join('\n');

  var OUTLINE_FRAG = 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }';

  /* ---- glass: Fresnel-ish. Nearly clear face-on, gathers tint + opacity at
   * grazing angles, one hard specular glint. DoubleSide so the front and
   * back wall of the same shell both draw and their tints stack at the rim,
   * matching reactor_template.html's working GLASS_FRAG approach. */
  var GLASS_VERT = [
    'varying vec3 vN;',
    'varying float vZ;',
    'void main() {',
    '  vec3 n = normal;',
    '  vec4 p = vec4(position, 1.0);',
    '  #ifdef USE_INSTANCING',
    '    p = instanceMatrix * p;',
    '    n = mat3(instanceMatrix) * n;',
    '  #endif',
    '  vN = normalize(mat3(modelMatrix) * n);',
    '  vZ = (modelMatrix * p).z;',
    '  gl_Position = projectionMatrix * modelViewMatrix * p;',
    '}',
  ].join('\n');

  var GLASS_FRAG = [
    'uniform vec3 uTint;',
    'uniform vec3 uLight;',
    'uniform vec3 uView;',
    'uniform float uBase, uRim, uFres, uSpec, uStreak, uStreakK, uAlphaK;',
    'varying vec3 vN;',
    'varying float vZ;',
    '',
    'void main() {',
    '  vec3 N = normalize(vN);',
    '  vec3 V = normalize(uView);',
    '  vec3 L = normalize(uLight);',
    '',
    '  float grazing = 1.0 - abs(dot(N, V));',
    '  float fres = pow(clamp(grazing, 0.0, 1.0), uFres);',
    '',
    '  // face-on: lightened, not bleached — enough tint survives that the',
    '  // wall still reads against a pale backdrop; grazing: full tint',
    '  vec3 faceTint = mix(vec3(1.0), uTint, 0.55);',
    '  vec3 col = mix(faceTint, uTint, fres);',
    '  float alpha = clamp((uBase + uRim * fres) * uAlphaK, 0.0, 1.0);',
    '',
    '  // one hard specular glint — same rule as the hardware shader, this is',
    '  // what keeps glass from reading as flat tinted fog',
    '  vec3 H = normalize(L + V);',
    '  if (uSpec > 0.0 && dot(N, H) > 0.975) {',
    '    col = vec3(1.0);',
    '    alpha = max(alpha, 0.85);',
    '  }',
    '',
    '  // The comic shorthand for glass: a hard white window streak down an',
    '  // upright wall, with a thin companion line beside it and a break in',
    '  // it. Placed where the wall turns toward the half-vector, wall facing',
    '  // the eye only, so it rides round the vessel as the camera moves.',
    '  if (uStreak * uStreakK > 0.0 && abs(N.z) < 0.35 && dot(N, V) > 0.0) {',
    '    vec2 n2 = normalize(N.xy + vec2(1e-5));',
    '    vec2 h2 = normalize(H.xy + vec2(1e-5));',
    '    float along = dot(n2, h2);',
    '    float side = n2.x * h2.y - n2.y * h2.x;',
    '    float gap = step(0.10, fract(vZ * 0.0125 + 0.42));',
    '    bool wide = abs(side) < 0.085 && gap > 0.5;',
    '    bool thin = side > 0.150 && side < 0.185;',
    '    if (along > 0.0 && (wide || thin)) {',
    '      col = vec3(1.0);',
    '      alpha = max(alpha, min(uStreak * uStreakK, 1.0));',
    '    }',
    '  }',
    '',
    '  gl_FragColor = vec4(col, alpha);',
    '}',
  ].join('\n');

  /* =======================================================================
   * Material finishes — the personality knobs behind ToonMat.hardware().
   * Same shader for every hardware class; these presets are what make steel
   * read as metal and a painted charcoal box read as painted.
   * ===================================================================== */
  var FINISHES = {
    metal:   { rim: 1.00, spec: 1.00, hiCut: 0.72,   loCut: 0.34,   hiGain: 1.28, loGain: 0.74, dot: 5.0 },
    matte:   { rim: 0.45, spec: 0.35, hiCut: 0.64,   loCut: 0.30,   hiGain: 1.10, loGain: 0.88, dot: 6.0 },
    glossy:  { rim: 0.80, spec: 0.90, hiCut: 0.66,   loCut: 0.32,   hiGain: 1.22, loGain: 0.80, dot: 5.5 },
    default: { rim: 0.70, spec: 0.55, hiCut: 0.6667, loCut: 0.3333, hiGain: 1.18, loGain: 0.84, dot: 5.5 },
  };

  function pickFinish(opts) {
    if (opts.metal) return FINISHES.metal;
    if (opts.matte) return FINISHES.matte;
    if (opts.glossy) return FINISHES.glossy;
    return FINISHES.default;
  }

  function pick(v, fallback) { return v === undefined ? fallback : v; }

  /* =======================================================================
   * Public API
   * ===================================================================== */
  /* The look as a whole: one set of uniform objects shared by every material,
   * so one call restyles the lot. Multipliers on what each finish sets
   * (1 = as the finish says), the dot screen's geometry, the shadow tint.
   * js/tank.js exposes these as knobs; nothing else needs to touch them. */
  var G = {
    uDotK: { value: 1 },            // dot pitch, times
    uDotDark: { value: 0.66 },      // how dark a dot prints
    uDotMin: { value: 0.15 },       // dot radius at the terminator (cell = 1)
    uDotGrow: { value: 0.40 },      // and how much it grows into the shadow
    uDotRot: { value: new THREE.Vector2(0.7071, 0.7071) },   // screen angle: cos, sin
    uShadeTint: { value: new THREE.Vector3(0.94, 0.96, 1.05) },
    uShadeK: { value: 1 },          // depth of the shadow tone, times
    uHiK: { value: 1 },             // lift of the light tone, times
    uRimK: { value: 1 },
    uSpecK: { value: 1 },
    uBias: { value: 0 },            // slides both band edges: more or less shadow
    uFlat: { value: 0 },            // 1 = no shading at all, flat colour
    uStreakK: { value: 1 },         // glass: window streaks, times
    uAlphaK: { value: 1 },          // glass: body, times
  };

  var ToonMat = { all: [], presets: {}, weld: weld, globals: G };

  /** Set one shared uniform: a number, or an array for a vector. */
  ToonMat.setGlobal = function (name, v) {
    var u = G[name];
    if (!u) return;
    if (Array.isArray(v)) u.value.fromArray(v);
    else u.value = v;
  };
  ToonMat.setLight = function (v) {
    lightUniform.value.copy(v).normalize();
  };

  ToonMat.init = function (opts) {
    opts = opts || {};
    if (opts.light) {
      if (Array.isArray(opts.light)) lightUniform.value.set(opts.light[0], opts.light[1], opts.light[2]);
      else lightUniform.value.copy(opts.light);
      lightUniform.value.normalize();
    }
    DPR = opts.dpr || (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    ToonMat.all.length = 0;
    watchCanvas();
    buildPresets();
    return ToonMat;
  };

  /** Steel / plastic / painted hardware: hard 3-step cel bands.
   *  opts: { alpha, metal, matte, glossy, rim, spec, hiCut, loCut, hiGain,
   *          loGain, dot, emissive, side } — all optional. */
  ToonMat.hardware = function (hex, opts) {
    opts = opts || {};
    var f = pickFinish(opts);
    var alpha = pick(opts.alpha, 1);
    var mat = new THREE.ShaderMaterial({
      vertexShader: TOON_VERT,
      fragmentShader: TOON_FRAG,
      transparent: alpha < 1,
      side: opts.side || THREE.FrontSide,
      uniforms: {
        uColor: { value: new THREE.Color(hex) },
        uLight: lightUniform,
        uView: viewUniform,
        uTime: timeUniform,
        uAlpha: { value: alpha },
        uDot: { value: pick(opts.dot, f.dot) * DPR },
        uRimStrength: { value: pick(opts.rim, f.rim) },
        uSpecStrength: { value: pick(opts.spec, f.spec) },
        uHiCut: { value: pick(opts.hiCut, f.hiCut) },
        uLoCut: { value: pick(opts.loCut, f.loCut) },
        uHiGain: { value: pick(opts.hiGain, f.hiGain) },
        uLoGain: { value: pick(opts.loGain, f.loGain) },
        uEmissive: { value: pick(opts.emissive, 0) },
        uDotK: G.uDotK, uDotDark: G.uDotDark, uDotMin: G.uDotMin, uDotGrow: G.uDotGrow,
        uDotRot: G.uDotRot, uShadeTint: G.uShadeTint, uShadeK: G.uShadeK, uHiK: G.uHiK,
        uRimK: G.uRimK, uSpecK: G.uSpecK, uBias: G.uBias, uFlat: G.uFlat,
      },
    });
    ToonMat.all.push(mat);
    return mat;
  };

  /** Fresnel-ish tinted glass. opts: { thin, base, rim, fresPower, spec }.
   *  `thin: true` gives the weaker jacket variant so two stacked shells
   *  (vessel glass inside jacket glass) do not double up into fog. */
  ToonMat.glass = function (hex, opts) {
    opts = opts || {};
    var thin = !!opts.thin;
    var mat = new THREE.ShaderMaterial({
      vertexShader: GLASS_VERT,
      fragmentShader: GLASS_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTint: { value: new THREE.Color(hex) },
        uLight: lightUniform,
        uView: viewUniform,
        uBase: { value: pick(opts.base, thin ? 0.045 : 0.09) },
        uRim: { value: pick(opts.rim, thin ? 0.32 : 0.58) },
        uFres: { value: pick(opts.fresPower, thin ? 2.4 : 2.2) },
        uSpec: { value: pick(opts.spec, thin ? 0.5 : 0.85) },
        uStreak: { value: pick(opts.streak, thin ? 0.55 : 0.8) },
        uStreakK: G.uStreakK, uAlphaK: G.uAlphaK,
      },
    });
    ToonMat.inkMask(mat);
    ToonMat.all.push(mat);
    return mat;
  };

  /** Colour blends as usual; the ALPHA written to the framebuffer is the
   *  running product of (1 - coverage). js/tank.js reads that channel in its
   *  ink pass, so a line seen through glass or broth is thinned by exactly as
   *  much as the colour behind it is covered. Harmless on an opaque canvas. */
  ToonMat.inkMask = function (mat) {
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.SrcAlphaFactor;
    mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    mat.blendSrcAlpha = THREE.ZeroFactor;
    mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    return mat;
  };

  /** Inverted-hull outline material, widthPx CSS pixels wide on screen no
   *  matter the ortho zoom. Apply to a BackSide mesh built from WELDED
   *  (smooth-normal) geometry — use ToonMat.weld() to build it — or the
   *  hull tears open at sharp edges. */
  ToonMat.outline = function (widthPx) {
    var mat = new THREE.ShaderMaterial({
      vertexShader: OUTLINE_VERT,
      fragmentShader: OUTLINE_FRAG,
      side: THREE.BackSide,
      uniforms: {
        uWidthPx: { value: pick(widthPx, 2.0) },
        uViewportH: viewportHUniform,
      },
    });
    ToonMat.all.push(mat);
    watchCanvas();
    return mat;
  };

  /** Call whenever the camera moves (the +/-10 degree azimuth sweep
   *  included) — updates rim/specular/Fresnel on every material made so
   *  far. Accepts a THREE.Vector3 or a plain [x,y,z] array. */
  ToonMat.setView = function (v) {
    if (Array.isArray(v)) viewUniform.value.set(v[0], v[1], v[2]);
    else viewUniform.value.copy(v);
    viewUniform.value.normalize();
  };

  /** Drives the optional LED emissive pulse; harmless if nothing uses it. */
  ToonMat.setTime = function (seconds) {
    timeUniform.value = seconds;
    watchCanvas(); // self-heal if the canvas appeared after init()
  };

  /* -----------------------------------------------------------------------
   * Named presets for every part class SCENE_CONTRACT.md asks for. Built
   * once, at init(), off the palette in the contract (no invented hues).
   * --------------------------------------------------------------------- */
  function buildPresets() {
    var P = ToonMat.presets;
    P.steelMid = ToonMat.hardware('#939b9b', { metal: true });
    P.steelLight = ToonMat.hardware('#c0c5c5', { metal: true });
    P.steelDark = ToonMat.hardware('#6f7777', { metal: true });
    P.plastic = ToonMat.hardware('#d8d8d8', {});
    P.instrument = ToonMat.hardware('#515151', { matte: true }); // painted charcoal tower
    P.pumpCase = ToonMat.hardware('#345ecc', { glossy: true }); // blue pump head case
    P.ledStrip = ToonMat.hardware('#345ecc', { glossy: true, emissive: 0.8 }); // pump-stack LED
    P.tubing = ToonMat.hardware('#e3d184', { matte: true }); // khaki dip tubes / lines
    P.vesselGlass = ToonMat.glass('#a8cfe4', {}); // 3mm borosilicate, full strength
    P.jacketGlass = ToonMat.glass('#a8cfe4', { thin: true }); // stacks over vesselGlass
    P.bottleGlass = ToonMat.glass('#a8cfe4', { base: 0.05, rim: 0.45 }); // thinner lab-bottle wall
    P.outline = ToonMat.outline(2.0);
    P.outlineFine = ToonMat.outline(1.2); // tubing, fasteners, small parts
  }

  window.ToonMat = ToonMat;
})();
