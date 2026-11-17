/* The stirred tank, in 3D: toon-shaded, with a bubble and foam model in the
   broth. The simulation is lifted from the standalone '500 mL Stirred Tank'
   page; the vessel itself is built in code here (Round 5, it was a CAD
   export before), and the camera is driven by the page through window.TANK. */

/* ======================= operating point ==============================
   Everything below is in SI. The model is in millimetres, so lengths are
   converted at the boundary (MM = 1000).

   300 rpm, 1 vvm, water-like broth. Derived once, not tuned by eye:
     tip speed        0.503 m/s        impeller Re   5100 (transitional)
     Fl_g 0.030 vs Fl_CD 0.143    ->   loaded, the impeller disperses gas
     swirl            12.6 rad/s (40% of impeller, unbaffled tank)
     vortex dip       3.7 mm axis-to-wall, from the free-surface balance
     bubble count     emerges from the gas rate, roughly 115 at steady state
   ==================================================================== */
const MM = 1000;
const RPM = 300;                  // true shaft speed
const TIME_SCALE = 0.12;          // played back slowed, physics unchanged
const VVM = 1;                    // was 0.5: twice the gas, twice the bubbles
/* The free surface, the swirl in the broth and the flow strokes run on their
   own clock: wall time times SHOW_RATE. They are drawing, not simulation, and
   at the simulation's 0.12 the surface looked frozen. */
const SHOW_RATE = 0.5;

/* The tweak bar (js/tweak.js) exists only on a local server or with ?tweak in
   the URL. A few things it can change are built once (the monitor's size and
   place), so those are read here, before the scene is made, from what the
   bar saved. Visitors never have such a record and get the defaults. */
const TWEAKING = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  || /[?&]tweak\b/.test(location.search);
const BOOT = (function () {
  if (!TWEAKING) return {};
  try { return JSON.parse(localStorage.getItem('jt-tweaks-v1') || '{}') || {}; }
  catch (e) { return {}; }
})();
const bootNum = (k, d) => (typeof BOOT[k] === 'number' && isFinite(BOOT[k]) ? BOOT[k] : d);

/* Every word that is drawn inside the scene (the screens, the bottle labels,
   the off-gas chart) or written by this file (the readout in the corner).
   This table is the default. The tweak bar rewrites entries through
   TANK.say(key, text); what it saved (as "text:3d.<key>") is read here, so a
   reload starts with the rewritten words. In `hud`, {rpm} {vvm} {x} are
   filled in with the operating point. */
const WORDS = {
  'hud': '{rpm} rpm \u00b7 {vvm} vvm \u00b7 {x}\u00d7 real time',
  'mon.title': 'Feed Profile Designer', 'mon.phase1': '1  Exponential', 'mon.phase2': '2  Constant',
  'ctrl.unit': 'UNIT 1', 'ctrl.batch': 'BATCH',
  'ctrl.ph': 'pH', 'ctrl.do': 'DO', 'ctrl.temp': 'TEMP', 'ctrl.stir': 'STIR',
  'bottle.1': 'FEED', 'bottle.2': 'BASE', 'bottle.3': 'ACID',
  'chart.title': 'OFF-GAS', 'chart.a': 'OUR', 'chart.b': 'CER', 'chart.x': 'time \u2192'
};
const WORD_DEFAULTS = Object.assign({}, WORDS);
Object.keys(WORDS).forEach(function (k) {
  if (typeof BOOT['text:3d.' + k] === 'string') WORDS[k] = BOOT['text:3d.' + k];
});

const G = 9.81, RHO = 1000, MU = 1.0e-3, SIGMA = 0.072;
const N_REV = RPM / 60;           // rev/s
const D_IMP = 0.032;              // impeller dia, blade tip R16 in the STEP
const R_TANK = 0.036;             // vessel ID/2
const V_LIQ = 2.93e-4;            // working volume, m3
const V_TIP = Math.PI * N_REV * D_IMP;

/* Four baffles at T/10 are now fitted, and that is exactly what baffles are
   for: they convert tangential motion into circulation. Residual swirl drops
   from ~40% of tip speed (unbaffled) to under 10%, which in turn collapses
   the free-surface vortex from 3.7 mm to about 0.15 mm. Set this back to 0.40
   and delete the baffle geometry to see the unbaffled case again. */
const SWIRL_RATIO = 0.08;
const N_BAFFLES = 4;
const BAFFLE_W = 0.0072;          // T/10, standard
const BAFFLE_GAP = 0.00144;       // T/50 clearance off the wall
const BAFFLE_T = 0.0015;          // plate thickness
const R_CORE = D_IMP / 2;
const OMEGA_SWIRL = SWIRL_RATIO * V_TIP / R_CORE;

const Q_GAS = VVM * V_LIQ / 60;   // m3/s
const D32 = 3.0e-3;               // Sauter mean, set by impeller shear
const MAX_BUBBLES = 400;          // performance ceiling, not a physical one
const TURB_LENGTH = 0.004;        // turbulent integral scale, ~0.1 D
const R_SHAFT = 0.002;            // bubbles cannot occupy the shaft

/** Standard normal, Box-Muller. */
function gauss() {
  const u = Math.random() || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}
/* Optional camera sweep about the reactor's vertical axis: total travel in
   degrees, seconds for one there-and-back, and whether it starts on. The
   pre-rendered fallback cannot sweep -- its frames are baked at one angle. */
const SWEEP_DEG = 20;
const SWEEP_SECS = 14;
const SWEEP_ON = true;
const LIGHT = [-0.42, -0.50, 0.76];
const AZ = -20 * Math.PI / 180, EL = 14 * Math.PI / 180;

const DPR = Math.min(devicePixelRatio || 1, 2);
const stage = document.getElementById('stage');
const fallback = document.getElementById('fallback');

/* ---------- fallback path: pre-rendered sprite sheet ---------- */
function useFallback(reason) {
  document.documentElement.classList.add('no3d');
  console.info('3D disabled:', reason);
}

/* ---------- weld coincident vertices so hull outlines stay closed ---------- */
function weld(pos, idx, eps) {
  const map = new Map(), out = [], remap = new Int32Array(pos.length / 3);
  const q = 1 / eps;
  for (let i = 0; i < pos.length; i += 3) {
    const key = `${Math.round(pos[i] * q)},${Math.round(pos[i + 1] * q)},${Math.round(pos[i + 2] * q)}`;
    let hit = map.get(key);
    if (hit === undefined) {
      hit = out.length / 3;
      map.set(key, hit);
      out.push(pos[i], pos[i + 1], pos[i + 2]);
    }
    remap[i / 3] = hit;
  }
  const ni = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) ni[i] = remap[idx[i]];
  return { positions: new Float32Array(out), indices: ni };
}

/* ---------- shaders: three flat bands + screen-space halftone ---------- */
const TOON_VERT = `
  varying vec3 vN;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    vN = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * modelViewMatrix * p;
  }`;

/* Band thresholds are the same 1/3 and 2/3 the still renderer uses, so the
   live shading matches the drawing rather than merely resembling it. */
const TOON_FRAG = `
  uniform vec3 uColor;
  uniform vec3 uLight;
  uniform float uDot;
  uniform float uAlpha;
  varying vec3 vN;
  void main() {
    float s = (dot(normalize(vN), normalize(uLight)) + 1.0) * 0.5;
    vec3 c; float dark = 0.0;
    if (s > 0.6667)      c = uColor * 1.20;
    else if (s > 0.3333) c = uColor;
    else               { c = uColor * 0.80; dark = 1.0; }
    vec2 g = fract(gl_FragCoord.xy / uDot) - 0.5;
    c = mix(c, c * 0.30, dark * step(length(g), 0.31) * 0.5);
    gl_FragColor = vec4(clamp(c, 0.0, 1.0), uAlpha);
  }`;

const OUTLINE_VERT = `
  uniform float uW;
  void main() {
    vec4 p = vec4(position + normal * uW, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * p;
  }`;
const OUTLINE_FRAG = `void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`;

/* Glass. A flat wash reads as fog; real glass is nearly clear face-on and
   turns opaque at grazing angles, where the light path through it is longest.
   The Fresnel-ish term does that: alpha climbs as the surface turns away from
   the eye, so the tint gathers at the curve of the vessel and along the rim.
   Front and back walls are both drawn, so their tints stack at the edges. */
/* Liquid volume. vW is world position in model millimetres. */
const LIQUID_VERT = `
  attribute float aUnder;       // mm below the waterline (skirt only; else far)
  varying vec3 vW;
  varying vec3 vN;
  varying float vUnder;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vUnder = aUnder;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

/* How far a point inside the broth is from the glass, along the line of
   sight: 0 at the wall nearest the eye. Bubbles, flow strokes and droplets
   are drawn over the broth's haze and tint themselves by this instead, so
   what is near the glass is crisp and what is deep sinks into the colour. */
const BROTH_FOG = `
  uniform vec3 uFogView;
  uniform float uFogR, uFogK;
  float brothFog(vec3 p) {
    vec3 v = normalize(uFogView);
    float a = v.x * v.x + v.y * v.y;
    float b = 2.0 * (p.x * v.x + p.y * v.y);
    float c = p.x * p.x + p.y * p.y - uFogR * uFogR;
    float s = (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / max(2.0 * a, 1e-6);
    return 1.0 - exp(-uFogK * max(s, 0.0));
  }`;

const LIQUID_FRAG = `
  uniform vec3 uView, uShallow, uDeep, uLight;
  uniform float uR, uFloorZ, uK, uHaze, uHazeMax, uCaustic, uT, uSpec, uLevelZ;
  uniform float uSwirl, uUnder;
  varying vec3 vW;
  varying vec3 vN;
  varying float vUnder;
  void main() {
    vec3 d = -normalize(uView);                 // eye -> into the scene
    // ray/cylinder: how much broth lies beyond this fragment
    float a = d.x * d.x + d.y * d.y;
    float b = 2.0 * (vW.x * d.x + vW.y * d.y);
    float c = vW.x * vW.x + vW.y * vW.y - uR * uR;
    float disc = max(b * b - 4.0 * a * c, 0.0);
    float tCyl = (-b + sqrt(disc)) / max(2.0 * a, 1e-6);
    float tFloor = d.z < -1e-6 ? (uFloorZ - vW.z) / d.z : 1.0e9;
    float thick = max(min(tCyl, tFloor), 0.0);

    // Beer-Lambert, then posterised: the reference shows its floor through
    // the water in flat steps, not a gradient
    float f = 1.0 - exp(-uK * thick);
    vec3 col = mix(uShallow, uDeep, floor(f * 3.0 + 0.5) / 3.0);

    /* The stir, as flat shapes: two helical lobes of lighter and darker
       broth winding round the axis in the direction the impeller turns, with
       a faster, finer set breaking their edges. Hard steps, no gradient. The
       flow strokes (see "flow strokes") carry the real circulation; this is
       the body of the liquid turning underneath them. */
    float th = atan(vW.y, vW.x);
    float sw = sin(th * 2.0 - uT * 1.9 + vW.z * 0.085)
             + 0.42 * sin(th * 5.0 - uT * 3.1 - vW.z * 0.19);
    if (sw > 1.12)       col = mix(col, uShallow, min(0.34 * uSwirl, 1.0));
    else if (sw < -1.15) col = mix(col, uDeep, min(0.30 * uSwirl, 1.0));

    // a band of light just under the waterline, following the wave
    if (vUnder < 2.6 && uHaze < 0.5) col = mix(col, vec3(1.0, 0.98, 0.88), uUnder);

    // stepped band where light enters the volume
    float lit = max(dot(normalize(vN), normalize(uLight)), 0.0);
    if (lit > 0.55) col += vec3(0.09, 0.08, 0.05);

    // refracted glints gathering on the floor
    if (uCaustic > 0.5) {
      float g = sin(vW.x * 0.55 + uT * 1.7) * sin(vW.y * 0.48 - uT * 1.3)
              + 0.6 * sin((vW.x + vW.y) * 0.31 + uT * 2.1);
      col += vec3(0.16, 0.15, 0.10) * pow(max(g, 0.0), 4.0);
    }

    // specular on the wave crests: with an ortho camera the eye vector is
    // constant, so a half-vector highlight is one dot product
    if (uSpec > 0.0) {
      vec3 h = normalize(normalize(uLight) + normalize(uView));
      col += vec3(1.0, 0.99, 0.94) * uSpec
           * pow(max(dot(normalize(vN), h), 0.0), 52.0);
    }
    gl_FragColor = vec4(col, uHaze > 0.5 ? clamp(f * uHazeMax, 0.0, uHazeMax) : 1.0);
  }`;

/* Bubbles. A gas bubble is not a shaded ball: it is a thin film, so it is
   brightest at the rim where you look through the most film, carries a hard
   specular dot, and passes a lens-like bright patch on the side away from the
   light. Instance-varying phase drives the wobble. */
const BUBBLE_VERT = `
  attribute float aPhase;
  varying vec3 vN;
  varying vec3 vW;
  varying float vPhase;
  uniform float uT, uWob;
  void main() {
    vPhase = aPhase;
    // ellipsoidal wobble: rising bubbles are never spheres
    float w = uT * 5.5 + aPhase * 6.283;
    vec3 sc = vec3(1.0 + uWob * sin(w), 1.0 + uWob * sin(w + 2.1),
                   1.0 - 0.8 * uWob * sin(w));
    vec3 p = position * sc;
    vec3 n = normalize(normal / sc);
    #ifdef USE_INSTANCING
      p = (instanceMatrix * vec4(p, 1.0)).xyz;
      n = mat3(instanceMatrix) * n;
    #endif
    vN = normalize(mat3(modelMatrix) * n);
    vW = (modelMatrix * vec4(p, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

/* Drawn the way a comic draws a bubble: a pale disc, a darker crescent on
   the side away from the light, a white rim and one hard white dot. The ink
   ring round it comes from the ink pass. Alpha is not transparency here (the
   material does not blend): it is how much ink the pass may put on it, so a
   bubble deep in the broth gets a fainter line as well as a duller fill. */
const BUBBLE_FRAG = `
  uniform vec3 uView, uLight, uTint, uBroth;
  varying vec3 vN;
  varying vec3 vW;
  varying float vPhase;
  ${BROTH_FOG}
  void main() {
    vec3 N = normalize(vN), Vd = normalize(uView), L = normalize(uLight);
    float facing = abs(dot(N, Vd));
    float rim = pow(1.0 - facing, 2.4);          // film thickness toward the edge
    float lambert = dot(N, L);

    // two flat tones, a hard rim band, one hard highlight dot: cel, not lit
    vec3 col = lambert > -0.05 ? uTint : uTint * vec3(0.80, 0.83, 0.86);
    if (rim > 0.50) col = vec3(1.0, 0.995, 0.96);

    vec3 h = normalize(L + Vd);
    if (dot(N, h) > 0.94) col = vec3(1.0);

    float fog = brothFog(vW);
    col = mix(col, uBroth, fog * 0.66);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0 - fog * 0.72);
  }`;

/* Toon water surface. Everything here is stepped: no smooth_step, no soft
   falloff. Rings come from one phase function whose angular terms deliberately
   distort the circles, so the band edges tear like brush strokes instead of
   reading as computed contours. Foam is a density texture thresholded against
   the same distortion, which is what gives it a painted edge. */
const SURF_FRAG = `
  uniform vec3 uView, uLight, uShallow, uDeep, uCrest, uBand;
  uniform float uR, uT, uLambda, uSpeed, uInkA;
  uniform vec4 uRings[10];
  uniform sampler2D uFoam;
  varying vec3 vW;
  varying vec3 vN;

  float phase(float r, float th) {
    return r / uLambda - uT * (uSpeed / uLambda)
         + 0.34 * sin(th * 7.0 + r * 0.14)
         + 0.20 * sin(th * 13.0 - uT * 0.8);
  }

  void main() {
    float r = length(vW.xy);
    float th = atan(vW.y, vW.x);
    float rn = clamp(r / uR, 0.0, 1.0);

    // body tone, posterised into four depth steps
    float depth = 1.0 - rn * 0.55;
    vec3 col = mix(uShallow, uDeep, floor(depth * 4.0) / 4.0);

    // concentric bands radiating from the shaft
    float f = fract(phase(r, th));
    if (f < 0.10)      col = uCrest;
    else if (f < 0.20) col = uBand;
    else if (f > 0.76 && f < 0.84) col = mix(col, uBand, 0.55);

    // expanding rings from bubbles that broke through
    for (int k = 0; k < 10; k++) {
      if (uRings[k].w < 0.5) continue;
      float age = uT - uRings[k].z;
      if (age < 0.0 || age > 1.6) continue;
      float d = length(vW.xy - uRings[k].xy);
      float rr = age * 34.0
               + 0.8 * sin(atan(vW.y - uRings[k].y, vW.x - uRings[k].x) * 6.0);
      float w = 1.1;
      float fade = 1.0 - age / 1.6;
      if (abs(d - rr) < w) col = mix(col, uCrest, 0.85 * fade);
      else if (abs(d - rr) < w * 2.2) col = mix(col, uBand, 0.5 * fade);
    }

    // painted foam: density thresholded against the ripple distortion
    float fo = texture2D(uFoam, vec2(th / 6.2832, rn)).r;
    float tear = 0.5 + 0.32 * sin(th * 23.0 + r * 0.7)
                     + 0.18 * sin(th * 41.0 - uT * 1.3);
    if (fo > tear * 0.55) col = vec3(0.99, 0.98, 0.94);
    else if (fo > tear * 0.34) col = mix(col, vec3(0.97, 0.96, 0.90), 0.6);

    // one hard specular step, no falloff
    vec3 h = normalize(normalize(uLight) + normalize(uView));
    if (dot(normalize(vN), h) > 0.985) col = vec3(1.0);

    // alpha is the ink mask (see the ink pass): the ripples are modelled, and
    // inked at full strength every facet of them would be a line. Thinned,
    // they read as water; the waterline round the edge keeps its full line.
    gl_FragColor = vec4(col, uInkA);
  }`;

const GLASS_VERT = `
  varying vec3 vN;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const GLASS_FRAG = `
  uniform vec3 uTint, uView;
  uniform float uBase, uRim;
  varying vec3 vN;
  void main() {
    float grazing = 1.0 - abs(dot(normalize(vN), normalize(uView)));
    gl_FragColor = vec4(uTint, uBase + uRim * pow(grazing, 2.2));
  }`;

/* ---------- the ink pass ----------
   The scene is drawn into a target with a depth texture, and one full-screen
   pass inks it from that depth alone. The camera is orthographic, so depth
   is linear in millimetres and a flat face, however steep, has a second
   difference of exactly zero: what is left is creases (a fine line) and
   steps in depth (a bold line, put on the far side of the step only, so it
   sits round the nearer object like a brush outline and never eats into
   it). Line weight therefore follows the drawing rule: the further apart
   two things are, the heavier the line between them.

   The colour target's alpha is the ink mask (see ToonMat.inkMask): glass,
   broth haze and the off-gas caption thin whatever ink lies under them.
   Last, a little paper tooth, so flat colour reads as print. */
const POST_VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = `
  uniform sampler2D tColor, tDepth;
  uniform vec2 uPx;        // one device pixel, in uv
  uniform float uMm;       // model mm per device pixel
  uniform float uRange;    // camera far - near, mm
  uniform float uDpr;
  uniform vec3 uInk;
  // the knobs (see P and the tweak bar)
  uniform float uFineW, uBoldW, uCrease, uStep, uFineGain, uInkGain;
  uniform float uGrain, uBoil, uBoilT, uMisreg, uSat, uCon;
  varying vec2 vUv;
  vec2 gUv;
  float D(vec2 o) { return texture2D(tDepth, gUv + o * uPx).x * uRange; }
  float A(vec2 o) { return texture2D(tColor, gUv + o * uPx).a; }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    gUv = vUv;
    if (uBoil > 0.0) {
      // line boil: the whole drawing shivers a hair, redrawn a few times a
      // second, as hand-drawn animation does
      vec2 q = gl_FragCoord.xy / (70.0 * uDpr);
      float ph = uBoilT * 17.0;
      gUv += vec2(sin(q.y * 6.283 + ph) + sin(q.x * 3.7 + ph * 1.3),
                  cos(q.x * 6.283 - ph) + cos(q.y * 4.1 + ph * 0.7))
             * uBoil * uPx * uDpr * 0.5;
    }
    vec4 col = texture2D(tColor, gUv);
    if (uMisreg > 0.0) {
      // plates printed slightly out of register
      col.r = texture2D(tColor, gUv + vec2(uMisreg, 0.0) * uPx * uDpr).r;
      col.b = texture2D(tColor, gUv - vec2(uMisreg * 0.6, uMisreg * 0.8) * uPx * uDpr).b;
    }
    float dc = D(vec2(0.0));
    float r1 = max(1.0, uFineW * uDpr);
    float r2 = max(1.6, uBoldW * uDpr);

    // creases and every edge, both sides, fine
    float lx = D(vec2(r1, 0.0)) + D(vec2(-r1, 0.0)) - 2.0 * dc;
    float ly = D(vec2(0.0, r1)) + D(vec2(0.0, -r1)) - 2.0 * dc;
    float fine = smoothstep(uCrease, uCrease * 2.0, (abs(lx) + abs(ly)) / (r1 * uMm));

    // steps in depth, far side only, bold; averaged round a ring so the
    // line has a soft edge instead of a staircase
    float bold = 0.0;
    float d7 = r2 * 0.7071;
    // a step counts from a few mm; scaled with the zoom so a steep inside
    // corner seen from far away is not taken for one
    float t0 = max(uStep, 8.0 * r2 * uMm), t1 = t0 * 3.0;
    vec2 o;
    o = vec2(r2, 0.0);   bold += smoothstep(t0, t1, 2.0 * dc - D(o) - D(-o));
    o = vec2(0.0, r2);   bold += smoothstep(t0, t1, 2.0 * dc - D(o) - D(-o));
    o = vec2(d7, d7);    bold += smoothstep(t0, t1, 2.0 * dc - D(o) - D(-o));
    o = vec2(d7, -d7);   bold += smoothstep(t0, t1, 2.0 * dc - D(o) - D(-o));
    bold = smoothstep(0.10, 0.52, bold * 0.25);

    float mask = max(col.a, max(max(A(vec2(r2, 0.0)), A(vec2(-r2, 0.0))),
                                max(A(vec2(0.0, r2)), A(vec2(0.0, -r2)))));
    float ink = clamp(max(fine * uFineGain, bold) * mask * uInkGain, 0.0, 1.0);

    vec3 c = mix(col.rgb, uInk, ink);
    c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uSat);
    c = (c - 0.5) * uCon + 0.5;
    // paper tooth: fixed to the sheet, not to the model
    c *= 1.0 - 0.5 * uGrain + uGrain * hash(floor(gl_FragCoord.xy / max(1.0, uDpr)));
    gl_FragColor = vec4(c, 1.0);
  }`;

/** Merge geometries into one non-indexed BufferGeometry (positions and
    normals), each placed by its own matrix. Many small parts of one colour
    then cost one draw call instead of one each. */
function mergeGeos(list) {
  let n = 0;
  const parts = list.map(function (it) {
    const g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(it.m);
    n += g.attributes.position.count;
    return g;
  });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
/** Normals for a non-indexed geometry: smooth across faces that meet at less
    than `deg`, hard across the rest. The CAD props arrive as bare triangles,
    and flat face normals put a toon band boundary on every facet of a round
    part; this gives a cap or a pump rotor one clean band edge instead. */
function creaseNormals(geo, deg) {
  const pos = geo.attributes.position.array, nf = pos.length / 9;
  const fa = new Float32Array(nf * 3), fu = new Float32Array(nf * 3);
  const at = new Map();
  const key = (i) => Math.round(pos[i] * 400) + ',' + Math.round(pos[i + 1] * 400) + ',' + Math.round(pos[i + 2] * 400);
  for (let f = 0; f < nf; f++) {
    const i = f * 9;
    const ax = pos[i + 3] - pos[i], ay = pos[i + 4] - pos[i + 1], az = pos[i + 5] - pos[i + 2];
    const bx = pos[i + 6] - pos[i], by = pos[i + 7] - pos[i + 1], bz = pos[i + 8] - pos[i + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    fa[f * 3] = nx; fa[f * 3 + 1] = ny; fa[f * 3 + 2] = nz;          // area-weighted
    fu[f * 3] = nx / l; fu[f * 3 + 1] = ny / l; fu[f * 3 + 2] = nz / l;
    for (let v = 0; v < 3; v++) {
      const k = key(i + v * 3);
      let list = at.get(k);
      if (!list) { list = []; at.set(k, list); }
      list.push(f);
    }
  }
  const cosT = Math.cos(deg * Math.PI / 180);
  const out = new Float32Array(pos.length);
  for (let f = 0; f < nf; f++) {
    const ux = fu[f * 3], uy = fu[f * 3 + 1], uz = fu[f * 3 + 2];
    for (let v = 0; v < 3; v++) {
      const i = f * 9 + v * 3;
      let x = 0, y = 0, z = 0;
      for (const g of at.get(key(i))) {
        if (fu[g * 3] * ux + fu[g * 3 + 1] * uy + fu[g * 3 + 2] * uz < cosT) continue;
        x += fa[g * 3]; y += fa[g * 3 + 1]; z += fa[g * 3 + 2];
      }
      const l = Math.hypot(x, y, z) || 1;
      out[i] = x / l; out[i + 1] = y / l; out[i + 2] = z / l;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geo;
}
/** Matrix for a part at (x, y, z), Euler rotation rot, uniform scale s. */
function placeM(x, y, z, rot, s) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      rot ? rot[0] || 0 : 0, rot ? rot[1] || 0 : 0, rot ? rot[2] || 0 : 0)),
    new THREE.Vector3(s || 1, s || 1, s || 1));
}

function boot() {
  // ?fallback in the URL forces the pre-rendered path, for testing it
  if (location.search.indexOf('fallback') >= 0)
    return useFallback('forced by query string');
  /* The ink pass needs a multisampled target with a depth texture, which is
     WebGL 2. Without it (or with ?nopost) the scene is drawn straight to the
     canvas and every part gets the older treatment instead: a hull outline
     and edge lines. POST says which of the two this is. */
  let POST = location.search.indexOf('nopost') < 0 && !!THREE.WebGLMultisampleRenderTarget;
  if (POST) {
    try { POST = !!document.createElement('canvas').getContext('webgl2'); }
    catch (e) { POST = false; }
  }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !POST, alpha: false });
  } catch (e) { return useFallback('WebGL unavailable'); }
  if (!renderer.getContext()) return useFallback('no WebGL context');
  if (!renderer.capabilities.isWebGL2) POST = false;
  /* The target the scene is drawn into (see "the ink pass"). Made and tried
     here, before anything is built, because the scene is built differently
     without it: if this GPU will not resolve a multisampled depth buffer
     into a depth texture, fall back now rather than draw a black page. */
  let target = null;
  if (POST) {
    try {
      const depthTex = new THREE.DepthTexture(4, 4);
      depthTex.type = THREE.UnsignedIntType;
      depthTex.minFilter = depthTex.magFilter = THREE.NearestFilter;
      target = new THREE.WebGLMultisampleRenderTarget(4, 4, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, depthTexture: depthTex, stencilBuffer: false,
      });
      target.samples = 4;
      target.texture.generateMipmaps = false;
      const gl = renderer.getContext();
      while (gl.getError() !== gl.NO_ERROR) { /* start clean */ }
      renderer.setRenderTarget(target);
      renderer.render(new THREE.Scene(), new THREE.Camera());
      renderer.setRenderTarget(null);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('target not usable');
    } catch (e) {
      if (target) target.dispose();
      target = null;
      POST = false;
      console.info('ink pass off:', e.message);
    }
  }
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- the knobs ----------
     Every number here can be changed while the page runs: TANK.set(key, v)
     writes P[key] and calls ON[key] if the change has to be pushed somewhere
     (a uniform, a colour). The code below reads P directly. The values here
     are the defaults; js/tweak.js (local only) is what turns them. Camera
     shots ('shot.hero.zoom') and part colours ('pal.#939b9b') go through
     TANK.set too, see the end of boot(). */
  const _L = Math.hypot(LIGHT[0], LIGHT[1], LIGHT[2]);
  const P = {
    // clocks
    timeScale: TIME_SCALE, showRate: SHOW_RATE, rpm: RPM, paused: 0,
    // camera
    sway: 3.5, swayPeriod: SWEEP_SECS, camEase: 5, mirror: 0, openMin: 0,
    monAlways: 0, gasAlways: 0, monLoop: 9, gasLoop: 9, gasSpeed: 0.16,
    // gas
    vvm: VVM, bubbleSize: D32 * MM, bubbleWobble: 0.16, bubblesOn: 1, bubbleTint: '#fffbea',
    splashOn: 1, splashPower: 1, fizzOn: 1, fizzSize: 0.55, fizzAlpha: 0.42,
    // free surface
    slosh: 4.4, sloshPeriod: 3.1, chop: 1, ripple: 1.25, ripLambda: 14, ripSpeed: 26,
    breathe: 1.2, dip: 3.0, foamDecay: 1.3, foamGain: 1, surfInk: 0.28,
    surfShallow: '#fcefb8', surfDeep: '#e3b948', surfCrest: '#fffbe9', surfBand: '#f1d67c',
    // broth
    brothShallow: '#fff4c2', brothDeep: '#dda21f', brothMid: '#f0cb5c',
    density: 1, hazeOpen: 0.26, hazeClosed: 0.76, swirl: 1, underBand: 0.62,
    fogOpen: 0.014, fogClosed: 0.044,
    // flow strokes
    strokes: 90, strokeW: 0.68, strokeLen: 1, strokeTurb: 1, strokeFade: 0.8, strokeColor: '#fffdf0',
    // ink pass
    ink: 1, inkFine: 0.72, inkBold: 1.75, inkCrease: 1.15, inkStep: 4, inkFineGain: 0.9,
    inkColor: '#17140f', grain: 0.03, boil: 0, boilRate: 8, misreg: 0, sat: 1, contrast: 1,
    // shading (pushed to ToonMat's shared uniforms)
    dotScale: 1, dotDark: 0.66, dotMin: 0.15, dotGrow: 0.40, dotAngle: 45,
    shadeCool: 1, shadeDepth: 1, hiLift: 1, rim: 1, spec: 1, bandBias: 0, flat: 0,
    glassStreak: 1, glassAlpha: 1, jacketColor: '#4f93cf', vesselGlass: '#a8cfe4',
    // light
    lightAz: Math.atan2(LIGHT[1], LIGHT[0]) * 180 / Math.PI,
    lightEl: Math.asin(LIGHT[2] / _L) * 180 / Math.PI,
    // cast shadows
    shadowsOn: 1, shadowDark: 0.86, shadowDots: 0.78, shadowDot: 6, shadowLen: 1,
    // the printed impeller (the `imp` shot): seconds to build one, seconds it
    // then stirs, seconds the old one takes to go, layer height in mm
    printAlways: 0, printSecs: 4.0, printHold: 3.4, printClear: 0.9, printLayer: 0.5,
    printColor: '#22a085', printHot: '#f4fff9', printCore: '#8fe0c9',
    // the printed racks by the monitor (the `rack` shot): seconds to build
    // the tallest, seconds the old ones take to go, layer height in real mm
    // (drawn coarse so the layers read), seconds one tube takes to drop in
    rackAlways: 0, rackSecs: 5.5, rackClear: 0.7, rackLayer: 2, rackDrop: 0.5,
    rackColor: '#e8703a', rackHot: '#fff8ef', rackCore: '#f7bd95',
    // renderer
    dpr: DPR, msaa: 4,
  };
  const ON = {};
  let dprNow = DPR;
  const stir = () => P.rpm / RPM;       // everything the impeller drives scales with it

  renderer.setPixelRatio(DPR);
  stage.appendChild(renderer.domElement);
  ToonMat.init({ light: LIGHT, dpr: DPR });

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000);
  camera.up.set(0, 0, 1);                       // model is Z-up, three is Y-up

  const rotor = new THREE.Group();
  scene.add(rotor);

  const outlines = [], glassMats = [];
  /* Hardware shading comes from toon_materials.js. The finish per palette
     colour is the point: the template's own shader used one identical 3-band
     recipe for everything and had no specular term at all, so a steel
     cylinder, a charcoal instrument and a blue pump case all read as the same
     material in different colours. */
  const FINISH = {
    '#939b9b': 'metal', '#c0c5c5': 'metal', '#6f7777': 'metal',
    '#515151': 'matte', '#d8d8d8': 'matte', '#cdc4a0': 'matte',
    '#d6cdaa': 'matte', '#345ecc': 'glossy', '#dfebeb': 'glossy',
    '#e3d184': 'glossy',
  };
  const PAL = {};                // palette colour -> the materials painted with it
  const toonMat = (hex, alpha = 1) => {
    const o = { alpha };
    const f = FINISH[String(hex).toLowerCase()];
    if (f) o[f] = true;
    const m = ToonMat.hardware(hex, o);
    const k = String(hex).toLowerCase();
    (PAL[k] = PAL[k] || []).push(m);
    return m;
  };

  /* Camera framing box: the vessel from flange to motor top. Fixed numbers
     (they were the CAD export's bounds) so the SHOTS keep their meaning. */
  const box = new THREE.Box3(new THREE.Vector3(-40, -40, -130), new THREE.Vector3(40, 40, 44));

  /* ---------- broth: static wall, rippling surface ----------
     Drawn first and without depth so it never hides the internals, matching
     how the still drawing paints the liquid behind everything. */
  const backdrop = (m, order) => {
    m.material.depthWrite = false;
    m.material.depthTest = false;
    m.renderOrder = order;
    return m;
  };

  /* The vessel's own numbers, which the simulation reads (Round 5: no CAD).
     Glass ID 72, wall 3, an elliptical dished bottom DISH deep (vertical
     tangent where it meets the wall), level at -55. floorZ is the lowest
     point inside, on the axis. */
  const V = { innerR: 36, outerR: 39, floorZ: -127, topZ: -5, levelZ: -55, dish: 12 };
  /** Height of the inner glass floor at radius r (mm). */
  const dishZ = (r) => V.floorZ + V.dish * (1 - Math.sqrt(Math.max(0,
    1 - Math.pow(Math.min(r, V.innerR) / V.innerR, 2))));
  /** Same, in metres, for the particle models. */
  const floorAtM = (rM) => dishZ(rM * MM) / MM;

  /* ---------- the broth as a translucent volume ----------
     Not a flat fill. Under an orthographic camera the ray direction is the
     same for every pixel, so the chord through the liquid can be solved in
     closed form: intersect the ray with the vessel cylinder, clip it against
     the floor, and Beer-Lambert the result. The broth then darkens with the
     distance light actually travels through it -- deep in the middle, bright
     where the wall thins it out -- which is what makes it read as a volume
     rather than a silhouette. No render target needed.

     It is drawn twice. Once as a backdrop behind everything, which supplies
     the body colour, and once more afterwards as a thin haze whose alpha
     follows the same thickness, so parts sitting deeper in the broth get more
     of it over them. That second pass is what puts the impellers *inside* the
     liquid instead of in front of it. */
  const BROTH = { shallow: '#fff4c2', deep: '#dda21f', mid: '#f0cb5c' };
  const liquidUniforms = () => ({
    uView:    { value: new THREE.Vector3(1, 0, 0) },
    uLight:   { value: new THREE.Vector3(...LIGHT) },
    uShallow: { value: new THREE.Color(BROTH.shallow) },
    uDeep:    { value: new THREE.Color(BROTH.deep) },
    uR:       { value: V.innerR },
    uFloorZ:  { value: V.floorZ },
    uLevelZ:  { value: V.levelZ },
    uK:       { value: 0.019 },        // 1/mm; ~0.75 extinction over a full chord
    uHaze:    { value: 0 },
    uHazeMax: { value: 0.26 },
    uCaustic: { value: 0 },
    uSwirl:   { value: P.swirl },
    uUnder:   { value: P.underBand },
    uSpec:    { value: 0 },
    uT:       { value: 0 },
  });

  /* Shared by everything drawn over the haze (bubbles, flow strokes): the
     line of sight, the vessel radius, and how fast the broth swallows what
     is in it (setOpen() thins this for the close-up). */
  const FOG = {
    uFogView: { value: new THREE.Vector3(1, 0, 0) },
    uFogR:    { value: V.innerR },
    uFogK:    { value: 0.04 },
  };

  const liquidMats = [];
  function liquidMat(haze, caustic, spec = 0) {
    const m = new THREE.ShaderMaterial({
      vertexShader: LIQUID_VERT, fragmentShader: LIQUID_FRAG,
      uniforms: liquidUniforms(),
      transparent: !!haze, depthWrite: false,
    });
    m.uniforms.uHaze.value = haze ? 1 : 0;
    m.uniforms.uCaustic.value = caustic ? 1 : 0;
    m.uniforms.uSpec.value = spec;
    if (haze) ToonMat.inkMask(m);      // ink under the haze thins with it
    liquidMats.push(m);
    return m;
  }

  /* The liquid body is a skirt built by hand rather than a CylinderGeometry,
     because its top edge has to track the sloshing surface exactly. A fixed
     cylinder would either gap above the waterline on the high side or poke
     through it on the low side. Same geometry feeds the haze pass. */
  const SKIRT_N = 120;
  const skirtGeo = new THREE.BufferGeometry();
  {
    const pos = new Float32Array((SKIRT_N + 1) * 2 * 3);
    const idx = [];
    for (let i = 0; i <= SKIRT_N; i++) {
      const th = i / SKIRT_N * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      pos[i * 6]     = V.innerR * c;  pos[i * 6 + 1] = V.innerR * sn;
      pos[i * 6 + 2] = V.levelZ;                              // top, moves
      pos[i * 6 + 3] = V.innerR * c;  pos[i * 6 + 4] = V.innerR * sn;
      pos[i * 6 + 5] = V.floorZ + V.dish;                              // bottom, fixed
      if (i < SKIRT_N) {
        const a = i * 2, b = i * 2 + 1, c2 = i * 2 + 2, d = i * 2 + 3;
        idx.push(a, b, c2, b, d, c2);
      }
    }
    skirtGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    skirtGeo.setAttribute('aUnder', new THREE.BufferAttribute(new Float32Array((SKIRT_N + 1) * 2), 1));
    skirtGeo.setIndex(idx);
    skirtGeo.computeVertexNormals();
  }
  const skirtPos = skirtGeo.attributes.position;
  const skirtUnder = skirtGeo.attributes.aUnder;

  function writeSkirt(t) {
    const z0 = V.floorZ + V.dish;
    for (let i = 0; i <= SKIRT_N; i++) {
      const th = i / SKIRT_N * Math.PI * 2;
      const z = V.levelZ + surfaceH(V.innerR, th, t);
      skirtPos.setZ(i * 2, z);
      skirtUnder.setX(i * 2 + 1, z - z0);      // top stays 0: mm under the wave
    }
    skirtPos.needsUpdate = true;
    skirtUnder.needsUpdate = true;
  }

  // the floor follows the dished bottom: a lathe of dishZ()
  const floorGeo = (function () {
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const r = V.innerR * Math.sin(k / 16 * Math.PI / 2);
      pts.push(new THREE.Vector2(r, dishZ(r)));
    }
    const g = new THREE.LatheGeometry(pts, 96);
    g.setAttribute('aUnder', new THREE.BufferAttribute(
      new Float32Array(g.attributes.position.count).fill(999), 1));
    return g;
  })();

  const wall = new THREE.Mesh(skirtGeo, liquidMat(false, false));
  backdrop(wall, -3);
  scene.add(wall);

  const floorM = new THREE.Mesh(floorGeo, liquidMat(false, true));
  floorM.rotation.x = Math.PI / 2;
  floorM.position.z = 0.2;
  floorM.material.side = THREE.DoubleSide;

  /* Depth-only occluder: the BACK faces of the liquid volume, drawn first.
     The broth backdrop writes no depth (so the internals show through it),
     which would let anything standing behind the vessel (the back rod, the
     cable bundle, the base plate) paint over the broth. Back faces sit
     behind every internal part, so those still pass. */
  {
    const om = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.BackSide });
    const wallZ0 = V.floorZ + V.dish;
    // the skirt itself, so the occluder's top edge is the moving waterline
    const w = new THREE.Mesh(skirtGeo, om);
    w.frustumCulled = false;
    const d = new THREE.Mesh(new THREE.SphereGeometry(V.innerR, 48, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), om);
    d.rotation.x = Math.PI / 2;
    d.scale.set(1, V.dish / V.innerR, 1);
    d.position.z = wallZ0;
    [w, d].forEach(function (m) { m.renderOrder = -10; scene.add(m); });
  }
  backdrop(floorM, -4);
  scene.add(floorM);

  // the haze pass: same volume, drawn last, alpha from thickness
  const hazeWall = new THREE.Mesh(skirtGeo, liquidMat(true, false));
  hazeWall.renderOrder = 6;
  scene.add(hazeWall);

  /* Free-surface offset that conserves volume: the paraboloid removes liquid
     from the middle and piles it at the wall, so the profile has to be
     shifted until its area-weighted mean is back at the nominal level. */
  const surfaceZ = (r) => {
    const w2 = OMEGA_SWIRL * OMEGA_SWIRL;
    return r <= R_CORE
      ? w2 * r * r / (2 * G)
      : w2 * R_CORE * R_CORE / G
        - w2 * Math.pow(R_CORE, 4) / (2 * G * r * r);
  };
  // area-weighted mean height: (2/R^2) * integral of z(r) * r dr, midpoint rule
  const STEPS = 400, dR = R_TANK / STEPS;
  let acc = 0;
  for (let i = 0; i < STEPS; i++) {
    const r = (i + 0.5) * dR;
    acc += surfaceZ(r) * r * dR;
  }
  const surfMean = 2 / (R_TANK * R_TANK) * acc;
  const DIP_MM = (surfaceZ(R_TANK) - surfaceZ(0)) * MM;

  /* ---------- free surface: toon water ----------
     Procedural, not solved. The wave-equation version was physically honest
     and visually quiet; this trades that for control and for the look in the
     reference: hard concentric bands with torn edges, painted foam, stepped
     tone. No solver, so no polar-grid stability problem either.

     One phase function drives everything, so all three channels agree:
       - hard bright bands in the fragment shader (the rings)
       - a geometric displacement of the surface mesh
       - the waterline itself, rebuilt each frame

     That third one matters most here. At 14 degrees elevation the surface is
     nearly edge-on and ring patterns foreshorten almost to nothing, but an
     undulating line where the broth meets the glass is unmissable. */
  const SURF_NR = 26, SURF_NT = 120;
  const RIP_LAMBDA = 14.0;       // mm between crests
  const RIP_SPEED = 26.0;        // mm/s outward
  const RIP_AMP = 1.25;          // mm

  /** Shared by shader and geometry. r, th in model mm / radians. */
  function ripplePhase(r, th, t) {
    return r / P.ripLambda - t * (P.ripSpeed / P.ripLambda)
         + 0.34 * Math.sin(th * 7.0 + r * 0.14)
         + 0.20 * Math.sin(th * 13.0 - t * 0.8);
  }
  const rippleH = (r, th, t) =>
    P.ripple * Math.sin(Math.PI * 2 * ripplePhase(r, th, t));

  /* ---------- slosh ----------
     The fundamental sloshing mode in a cylinder tilts the whole surface, and
     that tilt direction precesses around the axis. Amplitude grows with
     radius (zero on the axis, maximum at the wall), which is why the
     waterline is where you actually see it: at 14 degrees elevation the
     surface is nearly edge-on, but the line where broth meets glass swings
     up and down around the circumference and that is unmissable.

     A slower axisymmetric mode rides underneath so the whole level breathes
     slightly, and the fine ripple sits on top of both. Three scales of
     motion is what stops it reading as one mechanical oscillation. */
  const SLOSH_AMP = 4.4;                       // mm at the wall
  const SLOSH_PERIOD = 3.1;   // in show time (see SHOW_RATE)
  const SLOSH_W = Math.PI * 2 / SLOSH_PERIOD;
  const BREATHE_AMP = 1.2;                     // mm, axisymmetric

  /* t is show time. On top of the slow tilt: a chop of three and five lobes
     running round the wall in opposite directions (what makes the waterline
     an undulating line rather than a tilting one), and the dimple the shaft
     pulls, a little larger than the 0.15 mm the baffled tank really has. */
  function surfaceH(r, th, t) {
    const x = Math.min(r / V.innerR, 1);
    const dir = t * Math.PI * 2 / P.sloshPeriod;
    // first antisymmetric mode: linear in r, tilt precessing
    const slosh = P.slosh * x * Math.cos(th - dir);
    // second harmonic, a touch of saddle so it is not a clean plane
    const saddle = 0.45 * P.slosh * x * x * Math.cos(2 * (th - dir * 0.6));
    const chop = P.chop * x * x * (1.9 * Math.cos(3 * th + t * 4.6)
                        + 1.2 * Math.cos(5 * th - t * 6.4 + 1.3));
    const breathe = P.breathe * Math.sin(t * 1.7) * (1 - x * x);
    const dip = -P.dip * Math.exp(-r * r / 70);
    return slosh + saddle + chop + breathe + dip + rippleH(r, th, t);
  }
  /** The moving surface over (r, a), in metres, for the particle models:
      bubbles burst on it and nothing rides above it. */
  const levelAtM = (rM, a) => LEVEL_M + surfaceH(rM * MM, a, simTimeRef.t) / MM;

  /* Burst rings. Each bubble that breaks the surface starts one expanding
     circle, exactly as the falling stream does in the reference. */
  const MAX_RINGS = 10;
  const ringData = new Float32Array(MAX_RINGS * 4);   // x, y, t0, live
  let ringSlot = 0;
  function addRing(x, y, t) {
    const k = (ringSlot++ % MAX_RINGS) * 4;
    ringData[k] = x; ringData[k + 1] = y; ringData[k + 2] = t; ringData[k + 3] = 1;
  }

  /* Foam as a painted field, not particles. A coarse polar density grid fed
     by bursts and decaying, uploaded as a texture the surface shader samples
     and thresholds against noise, which is what gives the torn edge. */
  const FOAM_NT = 64, FOAM_NR = 24;
  const foamData = new Uint8Array(FOAM_NT * FOAM_NR * 4);
  const foamTex = new THREE.DataTexture(foamData, FOAM_NT, FOAM_NR,
                                        THREE.RGBAFormat);
  foamTex.wrapS = THREE.RepeatWrapping;
  foamTex.needsUpdate = true;
  const foamLevel = new Float32Array(FOAM_NT * FOAM_NR);

  function addFoamAt(r, a) {
    const jr = Math.min(FOAM_NR - 1, Math.max(0,
      Math.floor(r / R_TANK * FOAM_NR)));
    let ia = Math.floor(((a / (Math.PI * 2)) % 1 + 1) % 1 * FOAM_NT);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const j = jr + dj; if (j < 0 || j >= FOAM_NR) continue;
        const i = ((ia + di) % FOAM_NT + FOAM_NT) % FOAM_NT;
        foamLevel[j * FOAM_NT + i] += (dj === 0 && di === 0 ? 0.20 : 0.07) * P.foamGain;
      }
  }

  function stepFoamField(dtSim) {
    const keep = Math.exp(-dtSim * P.foamDecay);     // drains, so it stays a raft
    for (let k = 0; k < foamLevel.length; k++) {
      foamLevel[k] *= keep;
      // creep outward: foam rafts collect against the wall
      foamLevel[k] = Math.min(foamLevel[k], 1.2);
      foamData[k * 4] = Math.min(255, foamLevel[k] * 255) | 0;
    }
    foamTex.needsUpdate = true;
  }

  const surfMat = new THREE.ShaderMaterial({
    vertexShader: LIQUID_VERT, fragmentShader: SURF_FRAG,
    uniforms: {
      uView:    { value: new THREE.Vector3(1, 0, 0) },
      uLight:   { value: new THREE.Vector3(...LIGHT) },
      uShallow: { value: new THREE.Color('#fcefb8') },
      uDeep:    { value: new THREE.Color('#e3b948') },
      uCrest:   { value: new THREE.Color('#fffbe9') },
      uBand:    { value: new THREE.Color('#f1d67c') },
      uR:       { value: V.innerR },
      uT:       { value: 0 },
      uLambda:  { value: P.ripLambda },
      uSpeed:   { value: P.ripSpeed },
      uInkA:    { value: P.surfInk },
      uRings:   { value: ringData },
      uFoam:    { value: foamTex },
    },
  });
  liquidMats.push(surfMat);
  ON.ripLambda = (v) => { surfMat.uniforms.uLambda.value = v; };
  ON.ripSpeed = (v) => { surfMat.uniforms.uSpeed.value = v; };
  ON.surfInk = (v) => { surfMat.uniforms.uInkA.value = v; };
  ON.surfShallow = (v) => surfMat.uniforms.uShallow.value.set(v);
  ON.surfDeep = (v) => surfMat.uniforms.uDeep.value.set(v);
  ON.surfCrest = (v) => surfMat.uniforms.uCrest.value.set(v);
  ON.surfBand = (v) => surfMat.uniforms.uBand.value.set(v);
  ON.brothShallow = (v) => { for (const lm of liquidMats) if (lm !== surfMat) lm.uniforms.uShallow.value.set(v); };
  ON.brothDeep = (v) => { for (const lm of liquidMats) if (lm !== surfMat) lm.uniforms.uDeep.value.set(v); };
  ON.swirl = (v) => { for (const lm of liquidMats) if (lm.uniforms.uSwirl) lm.uniforms.uSwirl.value = v; };
  ON.underBand = (v) => { for (const lm of liquidMats) if (lm.uniforms.uUnder) lm.uniforms.uUnder.value = v; };

  const surfGeo = new THREE.RingGeometry(0, V.innerR, SURF_NT, SURF_NR);
  const surfPos = surfGeo.attributes.position;
  const surfNrm = surfGeo.attributes.normal;
  /* The surface is a real surface: it writes depth, so the shaft, probes
     and baffles pierce it, it hides what lies under it, and the ink pass
     finds its waterline (bold in front, where it stands against the far
     wall; fine at the back, where it meets it). */
  const surface = new THREE.Mesh(surfGeo, surfMat);
  surface.position.z = V.levelZ;
  surface.renderOrder = -2;
  surface.frustumCulled = false;
  scene.add(surface);

  /** Displace the surface and rebuild its normals from the ripple. */
  function writeSurface(t) {
    const eps = 0.35;
    for (let j = 0; j <= SURF_NR; j++) {
      const r = j / SURF_NR * V.innerR;
      for (let i = 0; i <= SURF_NT; i++) {
        const vi = j * (SURF_NT + 1) + i;
        const th = i / SURF_NT * Math.PI * 2;
        surfPos.setZ(vi, surfaceH(r, th, t));
        const hr = (surfaceH(r + eps, th, t) - surfaceH(r - eps, th, t)) / (2 * eps);
        const ht = r > 0.5
          ? (surfaceH(r, th + eps / r, t) - surfaceH(r, th - eps / r, t)) / (2 * eps)
          : 0;
        const ca = Math.cos(th), sa = Math.sin(th);
        const nx = -(ca * hr - sa * ht), ny = -(sa * hr + ca * ht);
        const inv = 1 / Math.hypot(nx, ny, 1);
        surfNrm.setXYZ(vi, nx * inv, ny * inv, inv);
      }
    }
    surfPos.needsUpdate = true;
    surfNrm.needsUpdate = true;
  }

  /* The waterline. Rebuilt every frame from the same ripple, because from
     this camera it is the clearest evidence the surface is moving at all. */
  const RIM_N = 200;
  const rimArr = new Float32Array((RIM_N + 1) * 3);
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.BufferAttribute(rimArr, 3));
  const rim = new THREE.Line(rimGeo, new THREE.LineBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.6 }));
  rim.renderOrder = -1;
  rim.visible = !POST;          // the ink pass draws the waterline itself
  scene.add(rim);

  function writeRim(t) {
    for (let i = 0; i <= RIM_N; i++) {
      const th = i / RIM_N * Math.PI * 2;
      rimArr[i * 3]     = V.innerR * Math.cos(th);
      rimArr[i * 3 + 1] = V.innerR * Math.sin(th);
      rimArr[i * 3 + 2] = V.levelZ + surfaceH(V.innerR, th, t);
    }
    rimGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- baffles ----------
     Not in the STEP: four plates at the standard T/10 width with a T/50 wall
     gap, running the liquid depth. Built here so they can be deleted in one
     block if you would rather see the vessel as modelled. */
  /* Plates from BAF_Z0 to just above the level, hung from the head plate
     on thin rods (a real baffle cage); all four merged into one mesh. */
  const BAF_Z0 = -113, BAF_Z1 = -40;
  const baffleGrp = new THREE.Group();
  {
    const h = BAF_Z1 - BAF_Z0;
    const rMid = (R_TANK - BAFFLE_GAP - BAFFLE_W / 2) * MM;
    const plate = new THREE.BoxGeometry(BAFFLE_W * MM, BAFFLE_T * MM, h);
    const hang = new THREE.CylinderGeometry(0.8, 0.8, V.topZ - BAF_Z1, 8);
    const list = [];
    for (let i = 0; i < N_BAFFLES; i++) {
      const ang = i * Math.PI * 2 / N_BAFFLES + AZ + Math.PI / 4;
      const x = rMid * Math.cos(ang), y = rMid * Math.sin(ang);
      list.push({ geo: plate, m: placeM(x, y, BAF_Z0 + h / 2, [0, 0, ang]) });
      list.push({ geo: hang, m: placeM(x, y, (BAF_Z1 + V.topZ) / 2, [Math.PI / 2, 0, 0]) });
    }
    const geo = mergeGeos(list);
    baffleGrp.add(new THREE.Mesh(geo, toonMat('#c0c5c5')));
    if (!POST) {
      const om = new THREE.ShaderMaterial({
        vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG,
        uniforms: { uW: { value: 0.3 } }, side: THREE.BackSide,
      });
      outlines.push({ m: om, k: 2.4 });
      baffleGrp.add(new THREE.Mesh(geo, om));
      baffleGrp.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 26),
        new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 })));
    }
  }
  scene.add(baffleGrp);
  const BAFFLE_ANGLES = Array.from({ length: N_BAFFLES },
    (_, i) => i * Math.PI * 2 / N_BAFFLES + AZ + Math.PI / 4);
  const BAFFLE_R0 = R_TANK - BAFFLE_GAP - BAFFLE_W;
  const BAFFLE_HALF_ANG = 0.055;   // angular half-width used for deflection

  /** Push a particle out of a baffle it has wandered into. */
  function dodgeBaffle(pt) {
    if (pt.r < BAFFLE_R0) return;
    for (const ba of BAFFLE_ANGLES) {
      let d = pt.a - ba;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < BAFFLE_HALF_ANG)
        pt.a = ba + (d >= 0 ? BAFFLE_HALF_ANG : -BAFFLE_HALF_ANG);
    }
  }

  /* ===================== flow field =====================================
     A Rushton turbine throws a thin radial jet off the blade tips. The jet
     hits the wall and splits, giving one recirculation loop above and one
     below each impeller. Rather than prescribe velocities directly, the
     field comes from a Stokes stream function:

         u_r = -(1/r) dPsi/dz        u_z = (1/r) dPsi/dr

     Any Psi at all yields a divergence-free field, so the flow conserves
     mass exactly and bubbles cannot collect at invented sources or sinks.
     Prescribing u_r and u_z separately does not give you that for free.

     Psi = sum over impellers of A * phi(r) * zeta(z), with
       phi(r)  = (r/R)^2 * (1 - r/R)      zero at the axis and the wall
       zeta(z) = -tanh((z-z_i)/w) * E(z)  steep sign change at the impeller
       E(z)    = sin(pi * (z-floor)/depth)  zero at floor and free surface

     phi ~ r^2 near the axis keeps phi'/r finite there, so u_z stays bounded.
     The two impellers are only 0.94 D apart, well inside the ~1.5 D at which
     discharge streams merge, and superposing their stream functions
     reproduces that merging without it having to be asserted.
     ==================================================================== */
  const IMP_Z_M = [-0.080, -0.110];       // turbine mid-heights, SI

  /* Two Rushtons closer than about 1.5 D do not each keep their own pair of
     loops: the discharge streams merge into a single radial stream. Here the
     spacing is 0.94 D, so they merge. Superposing two separate stream
     functions does NOT reproduce that -- impeller 1's upper loop cancels
     impeller 2's lower loop and leaves a stagnant plane between them -- so
     the pair is collapsed into one thicker jet at the mid-height instead.
     Widen the spacing past 1.5 D in CAD and this splits back into two. */
  const JETS = (() => {
    const span = Math.abs(IMP_Z_M[0] - IMP_Z_M[1]);
    if (IMP_Z_M.length === 2 && span < 1.5 * D_IMP)
      return [{ z: (IMP_Z_M[0] + IMP_Z_M[1]) / 2, w: 0.009 }];
    return IMP_Z_M.map((z) => ({ z, w: D_IMP / 8 }));
  })();
  const FLOOR_M = V.floorZ / MM, LEVEL_M = V.levelZ / MM;
  const DEPTH_M = LEVEL_M - FLOOR_M;
  /* Stream-function scale from the impeller pumping capacity rather than a
     fitted constant: Q_p = Fl_p * N * D^3 per turbine (Fl_p ~ 0.75 for a
     Rushton), and for an axisymmetric field the circulating flow is
     Q = 2*pi*dPsi, so Psi_max = Q_total / (2*pi*max(phi)). max(phi) for
     x^2(1-x) is 4/27. */
  const FLOW_NUM = 0.75;
  const Q_PUMP = FLOW_NUM * N_REV * Math.pow(D_IMP, 3) * IMP_Z_M.length;
  const PHI_MAX = 4 / 27;
  const PSI_A = Q_PUMP / (2 * Math.PI * PHI_MAX);

  const phi  = (r) => { const x = r / R_TANK; return x * x * (1 - x); };
  const dphi = (r) => (2 * r / (R_TANK * R_TANK))
                    - (3 * r * r / (R_TANK * R_TANK * R_TANK));
  const env  = (z) => Math.sin(Math.PI * (z - FLOOR_M) / DEPTH_M);
  const denv = (z) => Math.PI / DEPTH_M
                    * Math.cos(Math.PI * (z - FLOOR_M) / DEPTH_M);

  /** Liquid velocity at (r, z) in m/s: {ur, uz, ut}. */
  function flow(r, z) {
    const rs = Math.max(r, 1e-4);
    let dPdz = 0, dPdr = 0;
    for (const j of JETS) {
      const t = Math.tanh((z - j.z) / j.w);
      const zeta = -t * env(z);
      const dzeta = -((1 - t * t) / j.w) * env(z) - t * denv(z);
      dPdz += PSI_A * phi(rs) * dzeta;
      dPdr += PSI_A * dphi(rs) * zeta;
    }
    // Rankine swirl, decaying away from the impeller band
    const band = Math.exp(-Math.pow((z - JETS[0].z) / (2.2 * D_IMP), 2));
    const ut = (rs <= R_CORE ? OMEGA_SWIRL * rs
                             : OMEGA_SWIRL * R_CORE * R_CORE / rs)
             * (0.45 + 0.55 * band);
    const k = stir();
    return { ur: -dPdz / rs * k, uz: dPdr / rs * k, ut: ut * k };
  }

  /* Terminal slip velocity for an air bubble in water. Mendelson's wave
     analogy above 1.5 mm, where surface tension and buoyancy compete and
     the curve is famously flat near 0.25 m/s; a fitted power law below,
     since Mendelson diverges as d -> 0. */
  function slip(d) {
    if (d >= 1.5e-3)
      return Math.min(Math.sqrt(2 * SIGMA / (RHO * d) + G * d / 2), 0.26);
    return 0.20 * Math.pow(d / 1.5e-3, 0.9);
  }

  /* Log-normal-ish spread about the Sauter mean. */
  function sampleDiameter() {
    const u = Math.random(), v = Math.random();
    const g1 = Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.cos(2 * Math.PI * v);
    const d = P.bubbleSize / MM;
    return Math.min(2 * d, Math.max(0.27 * d, d * Math.exp(0.32 * g1)));
  }

  /* ---------- bubbles ---------- */
  // detail 2, because these are lit and rimmed now rather than outlined, and
  // faceting shows up in the highlight
  const bubbleGeo = new THREE.IcosahedronGeometry(1, 2);
  {
    const ph = new Float32Array(MAX_BUBBLES);
    for (let i = 0; i < MAX_BUBBLES; i++) ph[i] = Math.random();
    bubbleGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
  }
  const bubbleMat = new THREE.ShaderMaterial({
    vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG,
    uniforms: {
      uView:  { value: new THREE.Vector3(1, 0, 0) },
      uLight: { value: new THREE.Vector3(...LIGHT) },
      uTint:  { value: new THREE.Color(P.bubbleTint) },
      uBroth: { value: new THREE.Color(BROTH.mid) },
      uT:     { value: 0 },
      uWob:   { value: P.bubbleWobble },
      uFogView: FOG.uFogView, uFogR: FOG.uFogR, uFogK: FOG.uFogK,
    },
    /* In the transparent queue only so that it is drawn after the broth's
       haze; it does not blend (see BUBBLE_FRAG on what its alpha is). */
    transparent: true, blending: THREE.NoBlending, depthWrite: true,
  });
  const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, MAX_BUBBLES);
  bubbles.count = 0;
  bubbles.renderOrder = 6.5;
  bubbles.frustumCulled = false;
  scene.add(bubbles);
  ON.bubbleTint = (v) => bubbleMat.uniforms.uTint.value.set(v);
  ON.bubbleWobble = (v) => { bubbleMat.uniforms.uWob.value = v; };
  ON.bubblesOn = (v) => { bubbles.visible = !!v; };

  /* No outline on the bubbles any more. A drawn rim reads as a solid ball;
     the shader's own bright edge is what makes them look like gas. */

  const SPARGER_R_M = 0.012, SPARGER_Z_M = -0.117;
  const simTimeRef = { t: 0 };   // stepBubbles stamps burst rings
  const B = [];
  let spawnDebt = 0;

  /* Single constructor for a bubble. Everything that creates one goes
     through here: a literal that forgets the turbulent-velocity fields makes
     them undefined, and undefined * number is NaN, which then spreads. */
  const makeBubble = (r, a, z, d) => ({ r, a, z, d, ut: slip(d), ur: 0, uz: 0 });

  function emit() {
    const d = sampleDiameter();
    B.push(makeBubble(
      SPARGER_R_M + (Math.random() - 0.5) * 0.002,      // on the ring
      Math.random() * Math.PI * 2,
      SPARGER_Z_M + 0.001 + Math.random() * 0.002, d));
  }

  const m4 = new THREE.Matrix4(), sv = new THREE.Vector3();
  function stepBubbles(dtSim) {
    // Emission rate follows from the gas rate, so the population and the
    // hold-up are consequences of 0.5 vvm rather than numbers I picked.
    const d32 = P.bubbleSize / MM;
    spawnDebt += (P.vvm * V_LIQ / 60) / (Math.PI / 6 * d32 * d32 * d32) * dtSim;
    while (spawnDebt >= 1 && B.length < MAX_BUBBLES) { emit(); spawnDebt -= 1; }
    if (B.length >= MAX_BUBBLES) spawnDebt = 0;

    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      const f = flow(b.r, b.z);

      /* Buoyant slip along minus the APPARENT gravity. Swirl adds a
         centrifugal term, and because the bubble is lighter than the liquid
         it slips down that pressure gradient -- inward, toward the vortex
         core. At 300 rpm the centrifugal term is about a quarter of g, so
         the drift is visible but does not dominate. */
      const cent = f.ut * f.ut / Math.max(b.r, 1e-3);
      const gMag = Math.sqrt(cent * cent + G * G);
      const scale = b.ut * Math.sqrt(gMag / G) / gMag;
      const slipR = -cent * scale;          // inward
      const slipZ = G * scale;              // upward

      /* Turbulent dispersion, strongest in the impeller discharge where the
         energy dissipation is concentrated. */
      /* Turbulent dispersion as an Ornstein-Uhlenbeck process rather than an
         independent kick per frame. Real turbulent velocity stays correlated
         over an eddy lifetime tau = L/sigma; drawing fresh white noise every
         frame is what made the bubbles look like they were vibrating. The
         net diffusivity is the same, sigma^2 * tau = sigma * L, so the gas
         still disperses exactly as before -- it just moves smoothly. */
      let uPrime = 0.08;
      for (const zi of IMP_Z_M)
        uPrime += 0.22 * Math.exp(-Math.pow((b.z - zi) / (0.6 * D_IMP), 2));
      const sigma = uPrime * V_TIP * stir();
      const tau = TURB_LENGTH / Math.max(sigma, 1e-6);
      const decay = Math.min(dtSim / tau, 1);
      const drive = Math.sqrt(2 * sigma * sigma * decay);
      b.ur = b.ur * (1 - decay) + drive * gauss();
      b.uz = b.uz * (1 - decay) + drive * gauss();

      b.r += (f.ur + slipR + b.ur) * dtSim;
      b.z += (f.uz + slipZ + b.uz) * dtSim;
      b.a += (f.ut / Math.max(b.r, 1e-3)) * dtSim;
      dodgeBaffle(b);

      /* Breakup: a bubble is unstable once the turbulent Weber number
         exceeds order unity. Only the impeller region is energetic enough
         here, which is why gas coming off the sparger is coarse and gets
         chopped as it passes each turbine. */
      for (const zi of IMP_Z_M) {
        if (Math.abs(b.z - zi) < 0.006 && b.d > 2.2e-3 && Math.random() < 8.0 * dtSim) {
          b.d *= 0.72;
          b.ut = slip(b.d);
          if (B.length < MAX_BUBBLES)
            B.push(makeBubble(b.r, b.a + 0.4, b.z, b.d));
        }
      }

      if (b.r < R_SHAFT + b.d / 2) b.r = R_SHAFT + b.d / 2;
      if (b.r > R_TANK - b.d / 2) b.r = R_TANK - b.d / 2;
      { const fz = floorAtM(b.r) + b.d / 2; if (b.z < fz) b.z = fz; }   // dished floor
      if (b.z > levelAtM(b.r, b.a) - b.d / 4) {         // bursts
        addFoamAt(b.r, b.a);
        addRing(b.r * MM * Math.cos(b.a), b.r * MM * Math.sin(b.a),
                simTimeRef.t);
        splash(b.r, b.a, b.d);
        B.splice(i, 1);
        continue;
      }
    }

    const n = Math.min(B.length, MAX_BUBBLES);
    for (let i = 0; i < n; i++) {
      const b = B[i];
      const rad = b.d / 2 * MM;
      m4.makeTranslation(b.r * MM * Math.cos(b.a), b.r * MM * Math.sin(b.a),
                         b.z * MM);
      m4.scale(sv.set(rad, rad, rad));
      bubbles.setMatrixAt(i, m4);
    }
    bubbles.count = n;
    bubbles.instanceMatrix.needsUpdate = true;
  }

  /* ---------- fizz ----------
     Hundreds of medium bubbles stay legible, but on their own a vessel never
     looks properly gassed. This is the density layer: thousands of sub-
     millimetre bubbles as points, too small to follow individually, riding
     the same flow field. Cheap -- one draw call, no geometry. */
  const N_FIZZ = 2400;
  const fizzPos = new Float32Array(N_FIZZ * 3);
  const fizzSize = new Float32Array(N_FIZZ);
  const Fz = [];
  for (let i = 0; i < N_FIZZ; i++) {
    Fz.push({
      r: Math.sqrt(Math.random()) * (R_TANK - 0.003),
      a: Math.random() * Math.PI * 2,
      z: FLOOR_M + 0.002 + Math.random() * (LEVEL_M - FLOOR_M - 0.004),
      ut: 0.035 + Math.random() * 0.055,      // small bubbles rise slowly
      ur: 0, uz: 0,
    });
    fizzSize[i] = 0.5 + Math.random() * 1.1;
  }
  const fizzGeo = new THREE.BufferGeometry();
  fizzGeo.setAttribute('position', new THREE.BufferAttribute(fizzPos, 3));
  fizzGeo.setAttribute('aSize', new THREE.BufferAttribute(fizzSize, 1));
  const fizzMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `
      attribute float aSize;
      uniform float uScale;
      varying float vS;
      void main() {
        vS = aSize;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale;
      }`,
    fragmentShader: `
      varying float vS;
      uniform float uA;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float d = length(q);
        if (d > 0.5) discard;
        // bright ring, soft centre: a tiny bubble seen against broth
        float ring = smoothstep(0.5, 0.30, d) * 0.35
                   + smoothstep(0.30, 0.50, d) * 0.75;
        gl_FragColor = vec4(vec3(1.0, 0.99, 0.92), ring * uA);
      }`,
    uniforms: { uScale: { value: 3.0 }, uA: { value: P.fizzAlpha } },
  });
  const fizz = new THREE.Points(fizzGeo, fizzMat);
  fizz.renderOrder = 4;
  scene.add(fizz);
  ON.fizzOn = (v) => { fizz.visible = !!v; };
  ON.fizzAlpha = (v) => { fizzMat.uniforms.uA.value = v; };
  ON.fizzSize = () => applyZoom();

  function stepFizz(dtSim) {
    for (let i = 0; i < N_FIZZ; i++) {
      const t = Fz[i];
      const f = flow(t.r, t.z);
      const sigma = 0.10 * V_TIP * stir();
      const decay = Math.min(dtSim * sigma / TURB_LENGTH, 1);
      const drive = Math.sqrt(2 * sigma * sigma * decay);
      t.ur = t.ur * (1 - decay) + drive * gauss();
      t.uz = t.uz * (1 - decay) + drive * gauss();
      t.r += (f.ur + t.ur) * dtSim;
      t.z += (f.uz + t.uz + t.ut) * dtSim;
      t.a += (f.ut / Math.max(t.r, 1e-3)) * dtSim;
      dodgeBaffle(t);
      if (t.z > LEVEL_M - 0.006 && t.z > levelAtM(t.r, t.a) - 0.001) t.z = 9;   // through the surface
      if (t.z > 1 || t.r > R_TANK - 0.001 || t.r < 0.0022 || t.z < floorAtM(t.r)) {
        t.r = SPARGER_R_M + (Math.random() - 0.5) * 0.016;
        t.a = Math.random() * Math.PI * 2;
        t.z = SPARGER_Z_M + Math.random() * 0.004;
        t.ur = t.uz = 0;
      }
      fizzPos[i * 3]     = t.r * MM * Math.cos(t.a);
      fizzPos[i * 3 + 1] = t.r * MM * Math.sin(t.a);
      fizzPos[i * 3 + 2] = t.z * MM;
    }
    fizzGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- flow strokes ----------
     What makes the liquid itself visibly move. Tracers with no buoyancy ride
     the flow field (the same one the bubbles feel, with a calmer share of
     its turbulence) and each drags a short tapered ribbon of its own recent
     path behind it: a comic speed line, drawn by the circulation. Fast water
     off the impeller tips makes long strokes, slow water short ones, and
     together they trace the two loops of a Rushton pair without those having
     to be drawn. The ribbons are turned to face the eye every frame, drawn
     over the haze, and sink into the broth colour with depth (BROTH_FOG).
     They write no depth, so the ink pass leaves them as bare brush marks. */
  const N_TR = 240, TR_N = 22, TR_DT = 0.05;      // N_TR is the most; P.strokes are drawn
  const TR = [];
  function seedTracer(t, warm) {
    t.r = 0.004 + Math.sqrt(Math.random()) * (R_TANK - 0.008);
    t.a = Math.random() * Math.PI * 2;
    t.z = FLOOR_M + 0.008 + Math.random() * (LEVEL_M - FLOOR_M - 0.018);
    t.ur = t.uz = 0;
    t.life = 3.5 + Math.random() * 4;            // wall seconds
    t.age = warm ? Math.random() * t.life * 0.8 : 0;
    t.n = 0;                                     // samples of path held
  }
  for (let i = 0; i < N_TR; i++) {
    const t = { h: new Float32Array(TR_N * 3) };
    seedTracer(t, true);
    TR.push(t);
  }
  const strokeGeo = new THREE.BufferGeometry();
  const strokePos = new Float32Array(N_TR * TR_N * 2 * 3);
  {
    const idx = [];
    for (let i = 0; i < N_TR; i++)
      for (let k = 0; k < TR_N - 1; k++) {
        const a = (i * TR_N + k) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    strokeGeo.setAttribute('position', new THREE.BufferAttribute(strokePos, 3));
    strokeGeo.setIndex(idx);
  }
  const strokeMat = new THREE.ShaderMaterial({
    uniforms: {
      uCol:   { value: new THREE.Color(P.strokeColor) },
      uBroth: { value: new THREE.Color(BROTH.mid) },
      uFade:  { value: P.strokeFade },
      uFogView: FOG.uFogView, uFogR: FOG.uFogR, uFogK: FOG.uFogK,
    },
    vertexShader: `
      varying float vFog;
      ${BROTH_FOG}
      void main() {
        vFog = brothFog(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uCol, uBroth;
      uniform float uFade;
      varying float vFog;
      void main() {
        // flat steps of fade, not a gradient
        float f = floor(clamp(vFog * uFade, 0.0, 1.0) * 3.0 + 0.5) / 3.0;
        gl_FragColor = vec4(mix(uCol, uBroth, f * 0.55), 1.0 - f * 0.85);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  ToonMat.inkMask(strokeMat);
  const strokes = new THREE.Mesh(strokeGeo, strokeMat);
  strokes.renderOrder = 6.4;
  strokes.frustumCulled = false;
  scene.add(strokes);
  let TRA = TR;                              // the tracers in use
  ON.strokes = (v) => {
    const n = Math.max(0, Math.min(N_TR, Math.round(v)));
    TRA = TR.slice(0, n);
    strokeGeo.setDrawRange(0, n * (TR_N - 1) * 6);
  };
  ON.strokes(P.strokes);
  ON.strokeColor = (v) => strokeMat.uniforms.uCol.value.set(v);
  ON.strokeFade = (v) => { strokeMat.uniforms.uFade.value = v; };
  ON.brothMid = (v) => { strokeMat.uniforms.uBroth.value.set(v); bubbleMat.uniforms.uBroth.value.set(v); };

  let trClock = 0;
  /** Move the tracers (dtSim, the slowed clock) and age them (dt, wall). */
  function stepTracers(dtSim, dt) {
    trClock += dt;
    const sample = trClock >= TR_DT * P.strokeLen;
    if (sample) trClock = 0;
    for (const t of TRA) {
      const f = flow(t.r, t.z);
      let uPrime = 0.03 * P.strokeTurb;
      for (const zi of IMP_Z_M)
        uPrime += 0.08 * P.strokeTurb * Math.exp(-Math.pow((t.z - zi) / (0.6 * D_IMP), 2));
      const sigma = uPrime * V_TIP * stir();
      const decay = Math.min(dtSim * sigma / TURB_LENGTH, 1);
      const drive = Math.sqrt(2 * sigma * sigma * decay);
      t.ur = t.ur * (1 - decay) + drive * gauss();
      t.uz = t.uz * (1 - decay) + drive * gauss();
      t.r += (f.ur + t.ur) * dtSim;
      t.z += (f.uz + t.uz) * dtSim;
      t.a += (f.ut / Math.max(t.r, 1e-3)) * dtSim;
      dodgeBaffle(t);
      if (t.r < 0.0035) t.r = 0.0035;
      if (t.r > R_TANK - 0.002) t.r = R_TANK - 0.002;
      { const fz = floorAtM(t.r) + 0.002; if (t.z < fz) t.z = fz; }
      { const top = levelAtM(t.r, t.a) - 0.003; if (t.z > top) t.z = top; }
      t.age += dt;
      if (t.age > t.life) { seedTracer(t, false); continue; }
      if (sample) {
        t.h.copyWithin(3, 0, (TR_N - 1) * 3);
        t.h[0] = t.r * MM * Math.cos(t.a);
        t.h[1] = t.r * MM * Math.sin(t.a);
        t.h[2] = t.z * MM;
        if (t.n < TR_N) t.n++;
      }
    }
  }
  /** Rebuild every ribbon, turned to face the eye (view = toward the eye). */
  function writeStrokes(view) {
    const vx = view.x, vy = view.y, vz = view.z;
    let o = 0;
    for (const t of TRA) {
      const h = t.h, n = t.n, last = Math.max(n - 1, 0) * 3;
      let len = 0;
      for (let k = 0; k + 1 < n; k++)
        len += Math.hypot(h[k * 3] - h[k * 3 + 3], h[k * 3 + 1] - h[k * 3 + 4], h[k * 3 + 2] - h[k * 3 + 5]);
      // fade in and out over the life; a stroke too short to read is not drawn
      const fin = Math.min(1, t.age / 0.7), fout = Math.min(1, (t.life - t.age) / 0.7);
      const env = n < 3 ? 0 : fin * fout * Math.min(1, Math.max(0, (len - 3) / 6));
      for (let k = 0; k < TR_N; k++) {
        const kk = Math.min(k * 3, last);
        const ka = Math.max(kk - 3, 0), kb = Math.min(kk + 3, last);
        const tx = h[ka] - h[kb], ty = h[ka + 1] - h[kb + 1], tz = h[ka + 2] - h[kb + 2];
        let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
        const sl = Math.hypot(sx, sy, sz);
        // widest a third of the way back from the head, tapering both ways
        const u = Math.pow(k / (TR_N - 1), 0.62);
        const w = sl > 1e-6 ? P.strokeW * env * Math.pow(Math.sin(Math.PI * u), 0.75) / sl : 0;
        sx *= w; sy *= w; sz *= w;
        strokePos[o++] = h[kk] + sx; strokePos[o++] = h[kk + 1] + sy; strokePos[o++] = h[kk + 2] + sz;
        strokePos[o++] = h[kk] - sx; strokePos[o++] = h[kk + 1] - sy; strokePos[o++] = h[kk + 2] - sz;
      }
    }
    strokeGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- splash ----------
     A bubble that breaks the surface throws a droplet or two, which hop a
     few millimetres and fall back. Ballistic, on the simulation clock like
     the bubbles; inked by the ink pass like any solid thing. */
  const MAX_DROPS = 48;
  const dropMat = ToonMat.hardware('#fffaf0', { glossy: true });
  const drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), dropMat, MAX_DROPS);
  drops.count = 0;
  drops.frustumCulled = false;
  scene.add(drops);
  const DR = [];
  function splash(r, a, d) {
    if (!P.splashOn) return;
    const n = d > 2.6e-3 ? 2 : 1;
    for (let k = 0; k < n && DR.length < MAX_DROPS; k++) {
      const dir = Math.random() * Math.PI * 2, out = 0.03 + Math.random() * 0.06;
      DR.push({
        x: r * Math.cos(a), y: r * Math.sin(a), z: levelAtM(r, a) + 0.0005,
        vx: out * Math.cos(dir) * P.splashPower, vy: out * Math.sin(dir) * P.splashPower,
        vz: (0.22 + Math.random() * 0.22) * P.splashPower,
        s: (0.42 + Math.random() * 0.4) * Math.min(1.3, d / 2.6e-3),
      });
    }
  }
  const m4d = new THREE.Matrix4(), svd = new THREE.Vector3();
  function stepDrops(dtSim) {
    for (let i = DR.length - 1; i >= 0; i--) {
      const q = DR[i];
      q.vz -= G * dtSim;
      q.x += q.vx * dtSim; q.y += q.vy * dtSim; q.z += q.vz * dtSim;
      const r = Math.hypot(q.x, q.y);
      if (r > R_TANK - 0.002 || (q.vz < 0 && q.z < levelAtM(Math.min(r, R_TANK), Math.atan2(q.y, q.x)))) {
        if (r <= R_TANK - 0.002) addRing(q.x * MM, q.y * MM, simTimeRef.t);
        DR.splice(i, 1);
      }
    }
    for (let i = 0; i < DR.length; i++) {
      const q = DR[i];
      // stretched along the fall, as a drop is drawn
      const st = 1 + Math.min(Math.abs(q.vz) * 1.6, 0.7);
      m4d.makeTranslation(q.x * MM, q.y * MM, q.z * MM);
      m4d.scale(svd.set(q.s / Math.sqrt(st), q.s / Math.sqrt(st), q.s * st));
      drops.setMatrixAt(i, m4d);
    }
    drops.count = DR.length;
    drops.instanceMatrix.needsUpdate = true;
  }

  /* ================= the rig ==============================================
     Everything here is invented and built procedurally as primitives rather
     than exported from CAD. A jacket shell, a pump stack, bottles, tubing and
     cables are all cylinders, boxes and swept curves, so pushing them through
     CadQuery into mesh.json would cost payload for nothing.

     Layout follows the customer's own rig drawing, references/new_label_960.png
     -- charcoal pump tower with blue heads, bottles with blue caps and dip
     tubes, a balance under the vessel, khaki tubing in rounded right angles.

     None of it is added to the framing box, so the camera stays fitted to the
     vessel and these props sit behind it and crop at the frame edge. That is
     deliberate: the vessel stays the hero. */
  const rigGrp = new THREE.Group();
  scene.add(rigGrp);

  /* Compose in camera space, not world space. At azimuth -20 the world -x
     axis projects to screen RIGHT, so "behind and to the left" in world
     coordinates put the pump stack beside the vessel filling the frame. These
     three vectors are the screen basis; atScreen(u, v, d) means u mm right,
     v mm up, d mm further from the eye (negative = behind the vessel). */
  const _view = new THREE.Vector3(
    Math.cos(EL) * Math.cos(AZ), Math.cos(EL) * Math.sin(AZ), Math.sin(EL));
  const _right = new THREE.Vector3().crossVectors(
    new THREE.Vector3(0, 0, 1), _view).normalize();
  const _up = new THREE.Vector3().crossVectors(_view, _right);
  const atScreen = (u, v, d) => new THREE.Vector3()
    .addScaledVector(_right, u).addScaledVector(_up, v).addScaledVector(_view, d);

  const inkLine = () => new THREE.LineBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.55 });

  /* Cast shadows, the printed kind. Every static part is drawn a second
     time with shadowMat, whose vertex shader lays it flat on the bench mat
     along the light (so the shadow is the part's own geometry, with nothing
     to keep in step), and whose fragment shader fills it with the mat's
     colour a step darker under a dot screen, and stops at the mat's edge.
     Made once the mat exists (see "bench mat"); null until then, and null
     for good without the ink pass (that path is for weak devices). */
  let shadowMat = null;
  const MAT_HEX = '#d6cdaa';

  /** Solid body plus inked edges plus a hull outline: the house treatment.
      `parent` defaults to rigGrp; inside a scaled group (pumpGrp) the
      coordinates are that group's own and the outline is widened to match. */
  function prop(geo, hex, x, y, z, rot, parent, noEdges) {
    const host = parent || rigGrp;
    const add = (obj) => {
      obj.position.set(x, y, z);
      if (rot) obj.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
      host.add(obj);
      return obj;
    };
    const body = add(new THREE.Mesh(geo, toonMat(hex)));
    // (not the mat itself, which is what the shadows fall on)
    if (shadowMat && host !== rotor && String(hex).toLowerCase() !== MAT_HEX)
      add(new THREE.Mesh(geo, shadowMat)).frustumCulled = false;
    // with the ink pass on, that is all there is: two draw calls, not three
    if (POST) return body;
    const om = new THREE.ShaderMaterial({
      vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG,
      uniforms: { uW: { value: 0.3 } }, side: THREE.BackSide,
    });
    outlines.push({ m: om, k: 2.0 / (host.scale.x || 1) });
    add(new THREE.Mesh(geo, om));
    if (!noEdges) add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), inkLine()));
    return body;
  }

  /* ---------- the kit: merged static parts (Round 5) ----------
     Every static rig part goes through K(geo, hex, x, y, z, rot, parent):
     it is only collected here, and kitFlush() (called once, after the rig
     is built) merges each colour per parent group into ONE prop, i.e. three
     draw calls (body, outline, ink edges) per colour instead of three per
     part. KM() takes a ready Matrix4. Tubes pass noEdges. */
  const KIT = new Map();
  function KM(geo, hex, m, parent, noEdges) {
    const host = parent || rigGrp;
    const key = String(hex).toLowerCase() + '|' + host.uuid + (noEdges ? '|n' : '');
    let e = KIT.get(key);
    if (!e) { e = { hex: hex, host: host, noEdges: !!noEdges, list: [] }; KIT.set(key, e); }
    e.list.push({ geo: geo, m: m });
  }
  function K(geo, hex, x, y, z, rot, parent, noEdges) {
    KM(geo, hex, placeM(x, y, z, rot), parent, noEdges);
  }
  function kitFlush() {
    KIT.forEach(function (e) {
      if (!e.list.length) return;
      prop(mergeGeos(e.list), e.hex, 0, 0, 0, null, e.host, e.noEdges);
      e.list = [];
    });
  }

  /* ---------- CAD props ----------
     Detailed geometry from props.json, placed by the anchors it ships with.
     Each entry there is a separate solid tagged with a `prop` group, so one
     call instantiates a whole assembly and transforms it as a unit. */
  const PROP_CACHE = {};
  function propGeo(part) {
    if (PROP_CACHE[part.name]) return PROP_CACHE[part.name];
    const b64 = (str, T) => {
      const bin = atob(str), buf = new ArrayBuffer(bin.length);
      const v = new Uint8Array(buf);
      for (let i = 0; i < bin.length; i++) v[i] = bin.charCodeAt(i);
      return new T(buf);
    };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(
      b64(part.positions, Float32Array), 3));
    g.setIndex(new THREE.BufferAttribute(b64(part.indices, Uint32Array), 1));
    const flat = creaseNormals(g.toNonIndexed(), 38);
    PROP_CACHE[part.name] = { flat, indexed: g };
    return PROP_CACHE[part.name];
  }

  /** Instantiate every part of one prop group: glass parts as their own
      meshes, the rest into the kit (merged per colour at kitFlush()). */
  function addProp(group, pos, rotZ, scale, parent) {
    if (typeof PROPS === 'undefined' || !PROPS) return null;
    const host = parent || rigGrp;
    const m = placeM(pos.x, pos.y, pos.z, [0, 0, rotZ || 0], scale || 1);
    for (const part of PROPS.parts) {
      if (part.prop !== group) continue;
      const geo = propGeo(part);
      if (part.group === 'glass') {
        const g = new THREE.Mesh(geo.flat, ToonMat.glass(part.colour, { thin: true }));
        g.renderOrder = 7;
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo.indexed, 24), inkLine());
        [g, e].forEach(function (o) { o.applyMatrix4(m); host.add(o); });
        if (shadowMat) {
          const sh = new THREE.Mesh(geo.flat, shadowMat);
          sh.frustumCulled = false;
          sh.applyMatrix4(m);
          host.add(sh);
        }
        continue;
      }
      KM(geo.flat, part.colour, m, host);
    }
    return null;
  }

  /* ================= the vessel, built as code (Round 5) =================
     Replaces the CAD export. A 5 L benchtop glass stirred tank after the
     owner's own vessel and references/my drawing.png. Hierarchy is the
     design rule: a few large calm shapes from afar (glass, blue jacket,
     plate and clamp ring, dark drive), the fine work (knurling, seal
     housing, thread rings, sparger holes, Rushton blades, condenser fins)
     only pays off in the close shots. Tall things stand at the back of the
     plate, low things at the front. Small parts go through K(), so each
     colour is one merged mesh. Dimensions in VS; the simulation's own
     numbers (inner radius, floor, level, impellers, sparger) are in V and
     the constants at the top of the file, and everything here matches them. */
  const DEGR = Math.PI / 180;
  const UP = [Math.PI / 2, 0, 0];                  // cylinder axis onto Z
  const polar = (deg, r) => [r * Math.cos(deg * DEGR), r * Math.sin(deg * DEGR)];
  /** Cylinder, bottom radius r, top radius r2 (default r), axis Y. */
  const cyl = (r, h, seg, r2) => new THREE.CylinderGeometry(r2 === undefined ? r : r2, r, h, seg || 20);

  const VS = {
    flangeZ: -9.5, flangeR: 46,                    // glass flange under the plate
    plateR: 46, plateZ0: V.topZ, plateZ1: 1,       // head plate
    jacketR: 49, jacketZ0: -113, jacketZ1: -28,    // jacket, fused at both ends
    rods: [70, -110, 160], rodR: 54, baseZ: -133,  // frame: rods at the two silhouette edges and the back
    ringRi: 40.5, ringZ1: 5,                       // clamp ring on the plate rim
  };
  /** Outer glass floor at radius r (wall 3 mm, so 15 mm deep over 39). */
  const outerDish = (r) => -130 + 15 * (1 - Math.sqrt(Math.max(0, 1 - (r / V.outerR) * (r / V.outerR))));

  /** A lathed glass shell, plus its rim lines (seam welded first, or the
      lathe seam draws as a line down the glass). */
  function glassShell(profile, seg, mat, order) {
    const g = new THREE.LatheGeometry(profile, seg);
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = Math.PI / 2;
    if (order !== undefined) m.renderOrder = order;
    rigGrp.add(m);
    const w = weld(g.attributes.position.array, g.index.array, 1e-3);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(w.positions, 3));
    wg.setIndex(new THREE.BufferAttribute(w.indices, 1));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(wg, 20),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8 }));
    e.rotation.x = Math.PI / 2;
    rigGrp.add(e);
    return m;
  }

  // ---- glass vessel: outside up from the dish to the flange, back down inside
  {
    const P = [], v2 = (r, z) => P.push(new THREE.Vector2(r, z));
    for (let k = 0; k <= 14; k++) { const r = V.outerR * Math.sin(k / 14 * Math.PI / 2); v2(r, outerDish(r)); }
    v2(V.outerR, VS.flangeZ - 3);
    v2(V.outerR + 2.2, VS.flangeZ);
    v2(VS.flangeR, VS.flangeZ);
    v2(VS.flangeR, V.topZ);
    v2(V.innerR, V.topZ);
    for (let k = 14; k >= 0; k--) { const r = V.innerR * Math.sin(k / 14 * Math.PI / 2); v2(r, dishZ(r)); }
    const gm = ToonMat.glass('#a8cfe4');
    glassMats.push(gm);
    glassShell(P, 72, gm);
    ON.vesselGlass = (v) => gm.uniforms.uTint.value.set(v);
  }

  /* ---- jacket: a second skin, clearly bluer and denser than the vessel
     wall, with rounded shoulders where it is fused back on, an inked ring
     at each fuse line, and (SIL, drawn in aim()) ink on its silhouette. */
  /* Thin face-on, dense at the edge: the blue gathers on the silhouette and
     the gold of the broth comes through the middle unmuddied. */
  const jacketMat = ToonMat.glass('#4f93cf', { base: 0.10, rim: 0.80, fresPower: 1.7, spec: 0.7 });
  jacketMat.userData.closeGain = 0.06;
  ON.jacketColor = (v) => jacketMat.uniforms.uTint.value.set(v);
  glassMats.push(jacketMat);
  {
    const P = [], v2 = (r, z) => P.push(new THREE.Vector2(r, z));
    const r0 = V.outerR + 0.3, R = VS.jacketR, s = 8;
    for (let k = 0; k <= 8; k++) { const t = k / 8 * Math.PI / 2; v2(r0 + (R - r0) * Math.sin(t), VS.jacketZ0 + s * (1 - Math.cos(t))); }
    for (let k = 0; k <= 8; k++) { const t = k / 8 * Math.PI / 2; v2(r0 + (R - r0) * Math.cos(t), VS.jacketZ1 - s + s * Math.sin(t)); }
    glassShell(P, 72, jacketMat, 7);
    [VS.jacketZ0 + 0.6, VS.jacketZ1 - 0.6].forEach(function (z) {
      K(new THREE.TorusGeometry(r0 + 0.4, 0.9, 8, 72), '#9cc6e4', 0, 0, z);
    });
  }
  /* Silhouette ink for the two glass cylinders. A glass wall has no edge for
     EdgesGeometry to find, so these thin strips are turned to face the camera
     and put on the left and right silhouette every frame (aim()). */
  const SIL = [];
  {
    const silMat = new THREE.MeshBasicMaterial({ color: 0x17140f });
    const silGeo = new THREE.PlaneGeometry(1, 1);
    [[V.outerR, -114, VS.flangeZ - 3, 1.4], [VS.jacketR, VS.jacketZ0 + 8, VS.jacketZ1 - 8, 2.2]]
      .forEach(function (s) {
        [-1, 1].forEach(function (side) {
          const m = new THREE.Mesh(silGeo, silMat);
          rigGrp.add(m);
          SIL.push({ m: m, r: s[0] * side, z0: s[1], z1: s[2], px: s[3] });
        });
      });
  }

  /* ---- jacket ports: low inlet, high outlet, front-left so the hoses run
     straight off to the left. Glass tube, glass thread, knurled blue GL
     cap, white hose barb. */
  const JP = { ang: -55, z: [-96, -42], r0: 47, r1: 62 };
  const JPORTS = JP.z.map(function (z) {
    const a = JP.ang * DEGR, c = Math.cos(a), s = Math.sin(a);
    const rot = [0, 0, a - Math.PI / 2];            // cylinder axis radial
    const g = new THREE.CylinderGeometry(4, 4, JP.r1 - JP.r0, 20, 1, true);
    const tube = new THREE.Mesh(g, jacketMat);
    tube.position.set(c * (JP.r0 + JP.r1) / 2, s * (JP.r0 + JP.r1) / 2, z);
    tube.rotation.set(rot[0], rot[1], rot[2]);
    tube.renderOrder = 7;
    rigGrp.add(tube);
    K(cyl(4.7, 3, 24), '#c9dbe6', c * (JP.r1 - 4), s * (JP.r1 - 4), z, rot);     // glass thread
    K(cyl(6, 6, 12), '#345ecc', c * (JP.r1 + 1), s * (JP.r1 + 1), z, rot);       // GL cap, knurled
    K(cyl(2.7, 9, 14, 2.0), '#f5f7f8', c * (JP.r1 + 8.5), s * (JP.r1 + 8.5), z, rot);  // barb
    return { z: z, dx: c, dy: s, r: JP.r1 + 12 };
  });

  /* ---- steel frame: lobed base plate on the balance, a rubber cradle the
     dish sits in, three rods, a lobed clamp ring on the plate rim, knurled
     knobs. Rods sit at the two silhouette edges of the opening view and at
     the back, so none crosses the glass from the front. */
  const lobeR = (th, base, lobe, p) => {
    let r = base;
    for (const d of VS.rods) {
      const c = Math.cos(th - d * DEGR);
      if (c > 0) r = Math.max(r, base + (lobe - base) * Math.pow(c, p));
    }
    return r;
  };
  function lobedShape(base, lobe, p, hole) {
    const sh = new THREE.Shape();
    for (let k = 0; k <= 144; k++) {
      const th = k / 144 * Math.PI * 2, r = lobeR(th, base, lobe, p);
      if (k) sh.lineTo(r * Math.cos(th), r * Math.sin(th)); else sh.moveTo(r * Math.cos(th), r * Math.sin(th));
    }
    if (hole) { const h = new THREE.Path(); h.absarc(0, 0, hole, 0, Math.PI * 2, true); sh.holes.push(h); }
    return sh;
  }
  K(new THREE.ExtrudeGeometry(lobedShape(44, VS.rodR + 7, 10), { depth: 4, bevelEnabled: false }),
    '#939b9b', 0, 0, VS.baseZ - 4);
  // cradle: fills the gap between the base plate (top at baseZ) and the dish
  // (outer glass at r 24 is at -126.8), touching both
  K(new THREE.TorusGeometry(24, 3.05, 10, 48), '#3d3d3d', 0, 0, -129.95);
  VS.rods.forEach(function (d) {
    const [x, y] = polar(d, VS.rodR);
    const len = VS.ringZ1 - VS.baseZ;
    K(cyl(2.2, len, 12), '#c0c5c5', x, y, VS.baseZ + len / 2, UP);
    K(cyl(4.2, 0.9, 20), '#c0c5c5', x, y, VS.ringZ1 + 0.45, UP);               // washer
    K(cyl(6.2, 6, 10), '#3d3d3d', x, y, VS.ringZ1 + 0.9 + 3, UP);              // knob: 10 facets = knurl
    K(cyl(3.6, 2.2, 16, 2.4), '#3d3d3d', x, y, VS.ringZ1 + 6.9 + 1.1, UP);     // crown
    K(cyl(1.6, 2.4, 10), '#c0c5c5', x, y, VS.ringZ1 + 9.1 + 1.2, UP);          // rod end
  });
  K(new THREE.ExtrudeGeometry(lobedShape(49.5, VS.rodR + 6.5, 12, VS.ringRi),
      { depth: VS.ringZ1 - VS.plateZ1, bevelEnabled: false, curveSegments: 48 }),
    '#939b9b', 0, 0, VS.plateZ1);

  // ---- head plate and the gasket line under it
  K(cyl(VS.plateR, VS.plateZ1 - VS.plateZ0, 72), '#c0c5c5', 0, 0, (VS.plateZ0 + VS.plateZ1) / 2, UP);
  K(cyl(VS.flangeR + 0.4, 0.9, 72), '#3d3d3d', 0, 0, VS.plateZ0 - 0.2, UP);

  // ---- drive: flange with bolts, bearing/seal housing, coupling, motor
  {
    const z1 = VS.plateZ1;
    K(cyl(12.5, 2.2, 32), '#939b9b', 0, 0, z1 + 1.1, UP);
    for (let k = 0; k < 6; k++) { const [x, y] = polar(k * 60 + 30, 10.3); K(cyl(1.1, 1.4, 6), '#6f7777', x, y, z1 + 2.9, UP); }
    K(cyl(8.5, 8, 32), '#c0c5c5', 0, 0, z1 + 6.2, UP);
    K(cyl(8.9, 1, 32), '#6f7777', 0, 0, z1 + 6.2, UP);             // seal groove
    K(cyl(5.2, 6, 20), '#6f7777', 0, 0, z1 + 13.2, UP);            // coupling
    const m0 = z1 + 16.2, m1 = m0 + 32;
    K(cyl(12, m1 - m0, 40), '#3d3d3d', 0, 0, (m0 + m1) / 2, UP);
    for (let z = m0 + 4; z < m1 - 8; z += 4) K(cyl(12.5, 1, 40), '#515151', 0, 0, z, UP);   // cooling ribs
    K(cyl(12.4, 3, 40), '#345ecc', 0, 0, m1 - 5, UP);              // badge band
    K(cyl(12, 3, 40, 9.5), '#515151', 0, 0, m1 + 1.5, UP);         // top cap
  }

  /* ---- ports: a limited set, each a different shape. Angles keep them off
     the baffles (25, 115, -155, -65 deg) and put the tall ones at the back. */
  const PORT = {
    ph:   { ang: 145, r: 27 },        // pH: glass shaft, white head, VP cap
    do:   { ang: -175, r: 27 },       // DO: steel body, knurled head
    tw:   { ang: -140, r: 27 },       // thermowell: thin tube, Pt100 plug
    vent: { ang: 105, r: 26 },        // exhaust condenser + exhaust filter
    add:  { ang: 50, r: 24 },         // multi-inlet addition port, feed lines
    spg:  { ang: 15, r: 27 },         // sparger inlet + air filter
    smp:  { ang: -45, r: 25 },        // sampling tube
  };
  for (const k in PORT) { const p = PORT[k]; const xy = polar(p.ang, p.r); p.x = xy[0]; p.y = xy[1]; }
  const nut = (p, R) => {
    K(cyl(R, 3, 6), '#939b9b', p.x, p.y, VS.plateZ1 + 1.5, UP);           // hex nut
    K(cyl(R * 0.72, 1.6, 20), '#c0c5c5', p.x, p.y, VS.plateZ1 + 3.8, UP); // collar
  };
  // pH probe
  {
    const p = PORT.ph; nut(p, 4);
    K(cyl(1.9, 100, 16), '#dfebeb', p.x, p.y, -45, UP);                    // glass shaft -95..5
    K(new THREE.SphereGeometry(2.2, 12, 8), '#dfebeb', p.x, p.y, -95);      // bulb
    K(cyl(2.6, 9, 20), '#f5f7f8', p.x, p.y, 9.5, UP);
    K(cyl(2.9, 5, 12), '#3d3d3d', p.x, p.y, 16.5, UP);                      // VP connector
  }
  // DO probe
  {
    const p = PORT.do; nut(p, 4.4);
    K(cyl(2.5, 96, 16), '#c0c5c5', p.x, p.y, -44, UP);                     // body -92..4
    K(cyl(2.8, 3, 16), '#3d3d3d', p.x, p.y, -92, UP);                      // membrane cap
    K(cyl(3.3, 11, 20), '#939b9b', p.x, p.y, 9.5, UP);
    K(cyl(3.7, 3, 10), '#6f7777', p.x, p.y, 8, UP);                        // knurled grip
    K(cyl(2.6, 4, 12), '#3d3d3d', p.x, p.y, 17, UP);
  }
  // thermowell
  {
    const p = PORT.tw; nut(p, 3.4);
    K(cyl(1.6, 104, 12), '#c0c5c5', p.x, p.y, -48, UP);                    // -100..4
    K(cyl(2.6, 4, 6), '#939b9b', p.x, p.y, 6, UP);
    K(cyl(2, 5, 12), '#3d3d3d', p.x, p.y, 10.5, UP);                       // Pt100 plug
  }
  // sparger: ring under the lower impeller, dip pipe, air filter on top
  const SPG_IN = [0, 0, 0];
  {
    const p = PORT.spg, a = p.ang * DEGR, zs = SPARGER_Z_M * MM, rs = SPARGER_R_M * MM;
    nut(p, 3.6);
    K(new THREE.TorusGeometry(rs, 1.1, 10, 48), '#939b9b', 0, 0, zs);
    for (let k = 0; k < 12; k++) {                                         // holes, on the ring's crown
      const [x, y] = polar(k * 30 + 7.5, rs);
      K(cyl(0.45, 0.5, 6), '#17140f', x, y, zs + 1.05, UP);
    }
    K(cyl(1.5, VS.plateZ1 - zs, 14), '#939b9b', p.x, p.y, (VS.plateZ1 + zs) / 2, UP);
    K(cyl(1.5, p.r - rs, 14), '#939b9b', Math.cos(a) * (p.r + rs) / 2, Math.sin(a) * (p.r + rs) / 2, zs, [0, 0, a - Math.PI / 2]);
    K(new THREE.SphereGeometry(1.5, 10, 8), '#939b9b', p.x, p.y, zs);
    K(cyl(1.2, 5, 12), '#c0c5c5', p.x, p.y, 7, UP);                        // stem
    K(cyl(5.2, 3, 24), '#f5f7f8', p.x, p.y, 11, UP);                       // PTFE disc filter
    K(cyl(5.4, 0.7, 24), '#345ecc', p.x, p.y, 11, UP);                     // housing seam
    K(cyl(1.1, 4, 10, 0.8), '#f5f7f8', p.x, p.y, 14.5, UP);                // inlet nipple
    SPG_IN[0] = p.x; SPG_IN[1] = p.y; SPG_IN[2] = 16.5;
  }
  // addition port: boss, septum cap, three inlet needles, short dip tube
  const NEEDLES = [];
  {
    const p = PORT.add;
    K(cyl(5.5, 5, 24), '#939b9b', p.x, p.y, VS.plateZ1 + 2.5, UP);
    K(cyl(4.6, 1.6, 24), '#3d3d3d', p.x, p.y, VS.plateZ1 + 5.8, UP);
    K(cyl(1.4, 41, 12), '#c0c5c5', p.x, p.y, -19.5, UP);                   // dip -40..1
    for (let k = 0; k < 3; k++) {
      const a = (p.ang + 90 + k * 120) * DEGR;
      const x = p.x + 2.6 * Math.cos(a), y = p.y + 2.6 * Math.sin(a);
      K(cyl(0.75, 6, 10), '#c0c5c5', x, y, VS.plateZ1 + 9.6, UP);
      NEEDLES.push([x, y, VS.plateZ1 + 12.6]);
    }
  }
  // sampling tube: dip to the bottom, short steel riser, silicone line with
  // a pinch clamp and a luer cap hanging off the front
  {
    const p = PORT.smp; nut(p, 3.6);
    K(cyl(1.3, 119, 14), '#c0c5c5', p.x, p.y, -50.5, UP);                  // -110..9
    const o = [Math.cos(p.ang * DEGR), Math.sin(p.ang * DEGR)];
    const cv = inkedTube([
      [p.x, p.y, 8.5], [p.x, p.y, 13], [p.x + o[0] * 8, p.y + o[1] * 8, 16],
      [o[0] * 58, o[1] * 58, 10], [o[0] * 64, o[1] * 64, -6], [o[0] * 65, o[1] * 65, -16],
    ], 1.0, '#e9e4d0', true);
    bandAt(cv, 0.62, 2.1, '#f5f7f8', 3);                                   // pinch clamp
    bandAt(cv, 0.985, 1.6, '#345ecc', 3.6);                                // luer cap
  }

  // ---- rotor: shaft and two six-blade Rushton turbines (D 32: disc 24,
  // blades 8 long x 7 high, on the IMP_Z_M heights the flow model uses)
  K(cyl(R_SHAFT * MM, 133, 16), '#c0c5c5', 0, 0, (-115 + 18) / 2, UP, rotor);
  // the upper turbine is part of the kit; the lower one is the printed
  // impeller below (see "the printed impeller"), a mesh of its own
  {
    const z = IMP_Z_M[0] * MM;
    K(cyl(3.6, 8, 20), '#939b9b', 0, 0, z, UP, rotor);                     // hub
    K(cyl(D_IMP * MM * 0.375, 1, 48), '#c0c5c5', 0, 0, z, UP, rotor);      // disc, 3/4 D
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, rc = D_IMP * MM * 0.375;
      K(new THREE.BoxGeometry(D_IMP * MM / 4, 0.9, 7), '#c0c5c5', rc * Math.cos(a), rc * Math.sin(a), z, [0, 0, a], rotor);
    }
  }
  K(cyl(2.6, 2, 6), '#939b9b', 0, 0, -115, UP, rotor);                     // shaft end nut

  /* ---------- the printed impeller ----------
     The lower impeller is the one the Impeller Designer section is about.
     Three of the tool's five families are built here, to the same 32 mm tip
     diameter and on the same hub: a Rushton (as the upper one), a
     concave-blade disc turbine (half-pipe blades, hollow side leading) and a
     three-blade hydrofoil (the tool's own section maths, src/geometry/foil.js
     there: a cambered section whose chord and pitch change along the radius,
     each station wrapped onto its own cylinder).

     One mesh, one material. The material is a hardware toon material with
     three things added: everything above uCut (mm above the impeller's
     mid-plane) is discarded, so raising uCut builds the part layer by layer;
     faces seen from inside (the open cut) are painted flat, which reads as
     the solid's cross-section; and the newest layer is drawn hot. stepPrint()
     runs the loop while CAM.print is up (the `imp` shot). At rest the mesh
     is the steel Rushton the vessel has everywhere else on the page. */
  const IMP_KINDS = (function () {
    const R = D_IMP * MM / 2;                       // 16
    const hub = (r, h) => ({ geo: cyl(r, h, 24), m: placeM(0, 0, 0, UP) });
    const disc = () => ({ geo: cyl(R * 0.75, 1, 48), m: placeM(0, 0, 0, UP) });

    function rushton() {
      const list = [hub(3.6, 8), disc()];
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3, rc = R * 0.75;
        list.push({ geo: new THREE.BoxGeometry(R / 2, 0.9, 7), m: placeM(rc * Math.cos(a), rc * Math.sin(a), 0, [0, 0, a]) });
      }
      return mergeGeos(list);
    }

    function concave() {
      // a half pipe 7 high (outer radius 3.5), wall 0.9, from r 8 to the tip
      const ro = 3.5, ri = 2.6, len = R / 2;
      const sh = new THREE.Shape();
      sh.absarc(0, 0, ro, -Math.PI / 2, Math.PI / 2, false);     // the bulge, toward shape +X
      sh.absarc(0, 0, ri, Math.PI / 2, -Math.PI / 2, true);
      const pipe = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, curveSegments: 14 });
      const list = [hub(3.6, 8), disc()];
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
        // shape X (the bulge) trails, so the hollow leads; extrusion runs outward
        const m = new THREE.Matrix4().makeBasis(
          new THREE.Vector3(s, -c, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(c, s, 0));
        m.setPosition(c * (R - len), s * (R - len), 0);
        list.push({ geo: pipe, m: m });
      }
      return mergeGeos(list);
    }

    function hydrofoil() {
      // the designer's defaults, in % of D and degrees: root, middle, tip
      const CHORD = [27, 34, 22], PITCH = [38, 25, 16], CAMBER = 0.04, THICK = 0.12, TE = 0.5;
      const hubR = 4.2, r0 = hubR * 0.8, D = 2 * R, KS = 8, ST = 14, n = 2 * KS + 1, BLADES = 3;
      const quad3 = (a, b, c, s) => a * 2 * (s - 0.5) * (s - 1) - b * 4 * s * (s - 1) + c * 2 * s * (s - 0.5);
      const pos = [], idx = [];
      for (let b = 0; b < BLADES; b++) {
        const base = pos.length / 3;
        for (let i = 0; i < ST; i++) {
          const rho = r0 + (R - r0) * i / (ST - 1);
          const s = Math.min(1, Math.max(0, (rho - hubR) / (R - hubR)));
          const chord = quad3(CHORD[0], CHORD[1], CHORD[2], s) / 100 * D;
          const pitch = quad3(PITCH[0], PITCH[1], PITCH[2], s) * DEGR;
          const te = Math.min(0.5, TE / chord), cp = Math.cos(pitch), sp = Math.sin(pitch);
          const at = function (j, upper) {
            const x = 0.5 * (1 - Math.cos(Math.PI * j / KS));
            const yt = 5 * THICK * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x
              + 0.2843 * x * x * x - 0.1036 * x * x * x * x) + te / 2 * x;
            const yc = x < 0.4 ? CAMBER / 0.16 * (0.8 * x - x * x) : CAMBER / 0.36 * (0.2 + 0.8 * x - x * x);
            const xi = (0.5 - x) * chord, eta = (yc + (upper ? yt : -yt)) * chord;
            const u = xi * cp - eta * sp, v = xi * sp + eta * cp;      // leading edge high: pumps down
            const ang = u / rho + b * Math.PI * 2 / BLADES;
            pos.push(rho * Math.cos(ang), rho * Math.sin(ang), v);
          };
          for (let j = KS; j >= 0; j--) at(j, true);
          for (let j = 1; j <= KS; j++) at(j, false);
        }
        for (let i = 0; i < ST - 1; i++) {
          for (let j = 0; j < n; j++) {
            const a = base + i * n + j, bb = base + i * n + (j + 1) % n, c = a + n, d = bb + n;
            idx.push(a, d, bb, a, c, d);
          }
        }
        const cap = function (o, outward) {
          const t = (a, b2, c) => (outward ? idx.push(o + a, o + b2, o + c) : idx.push(o + a, o + c, o + b2));
          const U = (j) => KS - j, L = (j) => KS + j;
          t(U(0), U(1), L(1));
          for (let j = 1; j < KS; j++) { t(U(j), U(j + 1), L(j + 1)); t(U(j), L(j + 1), L(j)); }
        };
        cap(base, false);
        cap(base + (ST - 1) * n, true);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setIndex(idx);
      const blades = creaseNormals(g.toNonIndexed(), 50);
      return mergeGeos([hub(hubR, 9), { geo: blades, m: new THREE.Matrix4() }]);
    }

    return [['Rushton', rushton()], ['Concave-blade disc', concave()], ['Hydrofoil', hydrofoil()]]
      .map(function (k) {
        k[1].computeBoundingBox();
        return { name: k[0], geo: k[1], z0: k[1].boundingBox.min.z, z1: k[1].boundingBox.max.z };
      });
  })();
  const STEEL = '#c0c5c5';
  /** Turn a hardware toon material into one that can be printed: uCut (in the
      mesh's own z) is the height built so far. The racks on the bench use it
      too (see "the printed racks"). */
  function printable(m) {
    m.side = THREE.DoubleSide;
    m.uniforms.uCut = { value: 1e3 };
    m.uniforms.uLayerH = { value: 0.5 };
    m.uniforms.uLines = { value: 0 };
    m.uniforms.uHot = { value: new THREE.Color('#ffffff') };
    m.uniforms.uCore = { value: new THREE.Color('#ffffff') };
    m.vertexShader = m.vertexShader
      .replace('varying vec3 vN;', 'varying vec3 vN;\nvarying float vH;')
      .replace('vN = normalize', 'vH = position.z;\n  vN = normalize');
    m.fragmentShader = m.fragmentShader
      .replace('varying vec3 vN;',
        'varying vec3 vN;\nvarying float vH;\nuniform float uCut, uLayerH, uLines;\nuniform vec3 uHot, uCore;')
      .replace('void main() {', 'void main() {\n  if (vH > uCut) discard;')
      .replace('gl_FragColor = vec4(clamp(c, 0.0, 1.0), uAlpha);', [
        '// the open cut shows the inside of the solid: paint it as a section',
        '  if (!gl_FrontFacing) c = uCore;',
        '  // the newest layer, hot; the layers under it as fine lines',
        '  else if (uCut - vH < uLayerH * 1.5) c = uHot;',
        '  else if (abs(N.z) < 0.9 && fract(vH / uLayerH) < 0.26) c *= 1.0 - 0.22 * uLines;',
        '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), uAlpha);'].join('\n'));
    return m;
  }
  const printMat = printable(toonMat(STEEL));
  printMat.uniforms.uHot.value.set(P.printHot);
  printMat.uniforms.uCore.value.set(P.printCore);
  const impMesh = new THREE.Mesh(IMP_KINDS[0].geo, printMat);
  impMesh.position.z = IMP_Z_M[1] * MM;
  rotor.add(impMesh);

  /* The loop, while the section is on screen (amount = CAM.print):
       stop   the shaft runs down
       clear  the impeller on the shaft goes, top layer first
       print  the next kind is built from the bottom, one layer at a time
       run    the shaft runs up and it stirs; then the next kind
     Rushton, concave-blade disc, hydrofoil, and round again. PRINT.spin
     (0..1) scales the shaft speed. Away from the section the steel Rushton
     is back, whole. Under reduced motion there is no loop: the finished
     hydrofoil stands still. Each change of phase is announced as a
     'tank:print' event, which js/site.js shows in the panel. */
  const PRINT = { kind: 0, next: 0, phase: 'rest', t: 0, spin: 1,
                  rim0: printMat.uniforms.uRimStrength.value, spec0: printMat.uniforms.uSpecStrength.value };
  const printSay = () => document.dispatchEvent(new CustomEvent('tank:print',
    { detail: { kind: PRINT.kind, next: PRINT.next, name: IMP_KINDS[PRINT.kind].name, phase: PRINT.phase } }));
  function printShow(kind, printed) {
    PRINT.kind = kind;
    impMesh.geometry = IMP_KINDS[kind].geo;
    printMat.uniforms.uColor.value.set(printed ? P.printColor : STEEL);
    // steel keeps the metal finish; the printed part is plastic, and without
    // the strong rim light a flat blade seen edge-on does not bleach out
    printMat.uniforms.uRimStrength.value = printed ? 0.3 : PRINT.rim0;
    printMat.uniforms.uSpecStrength.value = printed ? 0.6 : PRINT.spec0;
  }
  function printPhase(ph) { PRINT.phase = ph; PRINT.t = 0; printSay(); }
  function stepPrint(dt, amount) {
    const U = printMat.uniforms, k = IMP_KINDS[PRINT.kind];
    if (amount < 0.02) {
      if (PRINT.phase !== 'rest') {
        printShow(0, false); U.uCut.value = 1e3; U.uLines.value = 0;
        printPhase('rest');
      }
      PRINT.spin += (1 - PRINT.spin) * Math.min(1, dt * 4);
      return;
    }
    if (REDUCED) {
      if (PRINT.phase !== 'still') {
        printShow(IMP_KINDS.length - 1, true); U.uCut.value = 1e3; U.uLines.value = 0.4;
        printPhase('still');
      }
      return;
    }
    if (PRINT.phase === 'rest' || PRINT.phase === 'still') { PRINT.next = 0; printPhase('stop'); }
    PRINT.t += dt;
    let spinTo = 0;
    if (PRINT.phase === 'stop') {
      if (PRINT.t > 0.7) printPhase('clear');
    } else if (PRINT.phase === 'clear') {
      const q = Math.min(1, PRINT.t / Math.max(P.printClear, 0.05));
      U.uCut.value = k.z1 + (k.z0 - 0.4 - k.z1) * q;
      if (q >= 1) {
        printShow(PRINT.next, true);
        U.uLines.value = 1;
        U.uCut.value = IMP_KINDS[PRINT.kind].z0 - 0.4;
        printPhase('print');
      }
    } else if (PRINT.phase === 'print') {
      const q = Math.min(1, PRINT.t / Math.max(P.printSecs, 0.05));
      const h = Math.max(P.printLayer, 0.05), n = Math.ceil((k.z1 - k.z0) / h);
      U.uLayerH.value = h;
      U.uCut.value = k.z0 + Math.floor(q * n + 1e-6) * h;      // whole layers
      if (q >= 1) { U.uCut.value = 1e3; printPhase('run'); }
    } else if (PRINT.phase === 'run') {
      spinTo = 1;
      U.uLines.value += (0.4 - U.uLines.value) * Math.min(1, dt * 0.8);
      if (PRINT.t > P.printHold) {
        PRINT.next = (PRINT.kind + 1) % IMP_KINDS.length;
        printPhase('stop');
      }
    }
    PRINT.spin += (spinTo - PRINT.spin) * Math.min(1, dt * 3.5);
  }
  ON.printColor = (v) => { if (PRINT.phase !== 'rest') printMat.uniforms.uColor.value.set(v); };
  ON.printHot = (v) => printMat.uniforms.uHot.value.set(v);
  ON.printCore = (v) => printMat.uniforms.uCore.value.set(v);

  /* ---------- balance under the vessel ---------- */
  /* The vessel is shown as a 5 L one. Its geometry and the broth model are
     500 mL numbers, so instead of scaling the vessel up (and the simulation
     with it), everything around it is scaled down: RIG is the size of the
     rig relative to the vessel. The balance pan sits under the frame's base
     plate (BAL.z), turned square to the opening view; GZ is bench level. */
  const RIG = 0.6;
  const BAL = { s: 0.85, z: VS.baseZ - 4 - 3 * 0.85 };
  const GZ = BAL.z - 22 * BAL.s;
  addProp('balance', new THREE.Vector3(0, 0, BAL.z), AZ + Math.PI / 2, BAL.s);

  /* ---------- bench mat ----------
     One flat inked slab under the whole rig, so the balance, controller,
     bottles and monitor stand on something instead of floating on paper.
     Laid out in the opening view's screen basis: MAT.u is the span along
     screen-right, MAT.f the span toward the eye (horizontal), both mm. */
  const MAT = { u: [-120, 344], f: [-215, 92], t: 2.5, corner: 14 };
  {
    const fx = _view.x, fy = _view.y, fl = Math.hypot(fx, fy);
    const F = new THREE.Vector3(fx / fl, fy / fl, 0);
    const w = MAT.u[1] - MAT.u[0], d = MAT.f[1] - MAT.f[0], rc = MAT.corner;
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + rc, -d / 2);
    sh.lineTo(w / 2 - rc, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + rc);
    sh.lineTo(w / 2, d / 2 - rc);  sh.quadraticCurveTo(w / 2, d / 2, w / 2 - rc, d / 2);
    sh.lineTo(-w / 2 + rc, d / 2); sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - rc);
    sh.lineTo(-w / 2, -d / 2 + rc); sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + rc, -d / 2);
    const g = new THREE.ExtrudeGeometry(sh, { depth: MAT.t, bevelEnabled: false, curveSegments: 6 });
    const cu = (MAT.u[0] + MAT.u[1]) / 2, cf = (MAT.f[0] + MAT.f[1]) / 2;
    const ctr = new THREE.Vector3().addScaledVector(_right, cu).addScaledVector(F, cf);
    // shape x runs along screen-right, shape y toward the eye
    K(g, MAT_HEX, ctr.x, ctr.y, GZ - MAT.t, [0, 0, Math.atan2(_right.y, _right.x)]);

    if (POST) shadowMat = new THREE.ShaderMaterial({
      uniforms: {
        uCol:  { value: new THREE.Color(MAT_HEX).multiplyScalar(1.10 * 0.86) },
        uDot:  { value: P.shadowDot * DPR },
        uDark: { value: P.shadowDots },
        uSlip: { value: new THREE.Vector2(LIGHT[0] / LIGHT[2], LIGHT[1] / LIGHT[2]) },
        uZ:    { value: GZ + 0.08 },
        uCtr:  { value: new THREE.Vector2(ctr.x, ctr.y) },
        uU:    { value: new THREE.Vector2(_right.x, _right.y).normalize() },
        uF:    { value: new THREE.Vector2(F.x, F.y) },
        uHalf: { value: new THREE.Vector2(w / 2, d / 2) },
        uRc:   { value: rc },
      },
      vertexShader: `
        uniform vec2 uSlip;
        uniform float uZ;
        varying vec2 vXY;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          w.xy -= uSlip * max(w.z - uZ, 0.0);
          w.z = uZ;
          vXY = w.xy;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform vec3 uCol;
        uniform float uDot, uRc, uDark;
        uniform vec2 uCtr, uU, uF, uHalf;
        varying vec2 vXY;
        void main() {
          vec2 r = vXY - uCtr;
          vec2 q = abs(vec2(dot(r, uU), dot(r, uF))) - (uHalf - uRc);
          if (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRc > -1.2) discard;
          vec2 g = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / uDot;
          float aa = 0.75 / uDot;
          float k = 1.0 - smoothstep(0.27 - aa, 0.27 + aa, length(fract(g) - 0.5));
          gl_FragColor = vec4(mix(uCol, uCol * uDark, k), 1.0);
        }`,
      side: THREE.DoubleSide,
    });
    // the glass vessel and its broth cast one too: a plain cylinder stands in
    if (shadowMat) {
      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(47, 47, 116, 40), shadowMat);
      proxy.rotation.x = Math.PI / 2;
      proxy.position.z = -70;
      proxy.frustumCulled = false;
      rigGrp.add(proxy);
    }
  }

  /* ---------- pump stack ----------
     Charcoal tower, four blue-cased heads (one per line) with pale rotors,
     and the thin blue indicator strip from the reference drawing. */
  /* SIDE: which side of the vessel the pump and bottles stand on, as seen
     in the opening view. +1 is screen-right, clear of the text panels. */
  const SIDE = 1;
  /* Where the tower stands. Its front-left corner (lowest pump head, tubing
     clip, the feed riser) points at the balance's back-right corner, so it
     has to stand right of and behind that corner with room to spare: at
     105, -80 the lowest head and the riser were inside the balance. */
  const _pump = atScreen(SIDE * 128, 0, -104);
  const PX = _pump.x, PY = _pump.y, PZ = GZ;

  /* Rotate the tower so its recessed face (+Y local) turns partly toward the
     eye. Pointing it straight at the camera shows the heads face-on and flat;
     blending the view direction with screen-right gives a three-quarter read. */
  const _face = _view.clone().addScaledVector(_right, -0.5 * SIDE).setZ(0).normalize();
  const PUMP_ROT = Math.atan2(-_face.x, _face.y);
  const pumpGrp = new THREE.Group();
  pumpGrp.position.set(PX, PY, PZ);
  pumpGrp.rotation.z = PUMP_ROT;
  pumpGrp.scale.setScalar(RIG);
  rigGrp.add(pumpGrp);
  addProp('pump_stack', new THREE.Vector3(0, 0, 0), 0, 1, pumpGrp);

  /* Three recesses, not four: three-channel heads are what the reference
     drawing shows, so the fourth line has no head of its own. */
  const RECESS = [[0, 33, 33], [0, 33, 82], [0, 33, 131]];
  RECESS.forEach(function (r) {
    addProp('pump_head', new THREE.Vector3(r[0], r[1], r[2]), 0, 1, pumpGrp);
  });
  const PUMP_TOP = 158;                       // tower height in its own frame
  const _cos = Math.cos(PUMP_ROT), _sin = Math.sin(PUMP_ROT);

  /* ---------- the controller ----------
     The tower is restyled as a bioreactor controller (the owner's BioFlo 120
     has its touchscreen top-front, pumps below, connectors on the side). The
     pump heads fill the tower's face, so the screen sits in a head section
     added on top: CTRL_H tall, in pump-frame mm like everything in pumpGrp.
     Front is +Y, the connector side is +X (SIDE), where the probe cables
     already arrive. */
  const CTRL_H = 58;
  const CTRL_TOP = PUMP_TOP + CTRL_H;
  {
    const zc = PUMP_TOP + CTRL_H / 2;
    K(new THREE.BoxGeometry(74, 106, CTRL_H), '#515151', 0, 0, zc, null, pumpGrp);
    // a lighter seam band where the head section meets the tower
    K(new THREE.BoxGeometry(76, 108, 4), '#6f7777', 0, 0, PUMP_TOP + 1, null, pumpGrp);
    // screen bezel, proud of the front face
    K(new THREE.BoxGeometry(64, 3, 44), '#3d3d3d', 0, 54.2, zc + 1, null, pumpGrp);
    // a row of three status keys under the screen
    [-14, 0, 14].forEach(function (x, i) {
      K(new THREE.BoxGeometry(9, 2, 3.2), i === 0 ? '#345ecc' : '#c0c5c5',
           x, 54.2, PUMP_TOP + 6.5, null, pumpGrp);
    });
    // the blue indicator strip, moved out beside the heads where it shows
    K(new THREE.BoxGeometry(3.2, 1.6, 136), '#345ecc', -SIDE * 32.6, 53.4, 82, null, pumpGrp);
    K(new THREE.BoxGeometry(3.2, 1.6, 40), '#345ecc', -SIDE * 32.6, 53.4, zc, null, pumpGrp);
  }
  /* The touchscreen: a CanvasTexture like the monitor's, showing the process
     values. drawCtrlScreen() redraws the numbers; the frame loop calls it
     every couple of seconds so the readings drift a little. */
  const ctrlCv = document.createElement('canvas');
  ctrlCv.width = 512; ctrlCv.height = 352;
  const ctrlTex = new THREE.CanvasTexture(ctrlCv);
  ctrlTex.anisotropy = 4;
  function drawCtrlScreen(t) {
    const c = ctrlCv.getContext('2d');
    const INK = '#17140f', PAPER = '#faf8f4', OCHRE = '#e3d184', BLUE = '#345ecc';
    c.fillStyle = PAPER; c.fillRect(0, 0, 512, 352);
    c.fillStyle = OCHRE; c.fillRect(0, 0, 512, 56);
    c.fillStyle = INK; c.fillRect(0, 56, 512, 5);
    c.textBaseline = 'middle';
    c.font = '800 30px "Archivo", system-ui, sans-serif';
    c.fillText(WORDS['ctrl.unit'], 20, 30);
    c.font = '600 22px "Plex Mono", ui-monospace, monospace';
    c.textAlign = 'right';
    const hrs = 18 + Math.floor(t / 20) % 6;
    c.fillText(WORDS['ctrl.batch'] + '  ' + hrs + ' h', 492, 30);
    c.textAlign = 'left';
    const w = (k) => Math.sin(t * (0.7 + k * 0.31) + k * 1.7);
    const vals = [
      [WORDS['ctrl.ph'], (7.02 + 0.01 * w(0)).toFixed(2), ''],
      [WORDS['ctrl.do'], (41 + 2 * w(1)).toFixed(0), '%'],
      [WORDS['ctrl.temp'], (37.0 + 0.05 * w(2)).toFixed(1), '°C'],
      [WORDS['ctrl.stir'], '300', 'rpm'],
    ];
    vals.forEach(function (v, i) {
      const x = 14 + (i % 2) * 250, y = 74 + Math.floor(i / 2) * 136;
      c.fillStyle = INK; c.fillRect(x, y, 234, 124);
      c.fillStyle = PAPER; c.fillRect(x + 4, y + 4, 226, 116);
      c.fillStyle = INK; c.font = '700 22px "Plex Mono", ui-monospace, monospace';
      c.fillText(v[0], x + 16, y + 26);
      c.fillStyle = BLUE; c.font = '800 58px "Archivo", system-ui, sans-serif';
      c.fillText(v[1], x + 16, y + 80);
      const vw = c.measureText(v[1]).width;
      c.fillStyle = INK; c.font = '600 24px "Plex Mono", ui-monospace, monospace';
      c.fillText(v[2], x + 24 + vw, y + 90);
    });
    ctrlTex.needsUpdate = true;
  }
  drawCtrlScreen(0);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawCtrlScreen(0); });
  {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(58, 39.9),
                               new THREE.MeshBasicMaterial({ map: ctrlTex }));
    scr.rotation.set(Math.PI / 2, Math.PI, 0);   // face +Y, texture upright
    scr.position.set(0, 55.8, PUMP_TOP + CTRL_H / 2 + 1);
    pumpGrp.add(scr);
  }

  /* Connectors on the side of the tower the camera sees (CONN_S = -SIDE): a
     row of round sockets, the pH, DO, temperature and motor cables plugged
     into the first four (they come round the back), the last capped. */
  const CONN_S = -SIDE, CONN_Z = 118, CONN_X = CONN_S * 37;   // the side the camera sees
  const CONN_Y = [-38, -26, -14, -2, 10];
  CONN_Y.forEach(function (y, i) {
    const rot = [0, 0, -Math.PI / 2];           // cylinder axis along local X
    K(new THREE.CylinderGeometry(4.2, 4.2, 2, 6), '#6f7777',
         CONN_X + CONN_S * 1, y, CONN_Z, rot, pumpGrp);
    K(new THREE.CylinderGeometry(3.0, 3.0, 4, 14), i < 4 ? '#939b9b' : '#345ecc',
         CONN_X + CONN_S * 3.5, y, CONN_Z, rot, pumpGrp);
  });
  // a printed label strip over the sockets
  K(new THREE.BoxGeometry(1, 60, 6), '#f5f7f8', CONN_X + CONN_S * 0.4, -14, CONN_Z + 10, null, pumpGrp);
  // mains inlet low on the back (on the connector side its cable crossed the
  // suction hoses and ended inside the FEED bottle)
  const MAINS = { x: CONN_S * 18, y: -54, z: 24 };
  K(new THREE.BoxGeometry(16, 2, 12), '#3d3d3d', MAINS.x, MAINS.y, MAINS.z, null, pumpGrp);
  /** A point given in the pump's own frame (mm, before scaling), in the world. */
  function pumpPt(x, y, z) {
    return [PX + RIG * (x * _cos - y * _sin),
            PY + RIG * (x * _sin + y * _cos),
            PZ + RIG * z];
  }

  /* ---------- four feed bottles ---------- */
  /* Three, one per pump head, standing back and to the left of the pump:
     background, and off the edge of most framings. */
  const bottleTops = [];
  const bottleInks = [];            // one redraw per label, for TANK.say
  for (let i = 0; i < 3; i++) {
    const bp = atScreen(SIDE * (184 + 46 * i), 0, -150 - 16 * i);
    addProp('bottle', new THREE.Vector3(bp.x, bp.y, GZ), 0, RIG);
    // dip_tube_top anchor: where the tube clears the cap
    bottleTops.push([bp.x + 6 * RIG, bp.y, GZ + 132 * RIG]);
    bottleLabel(bp, i);
  }

  /* A paper label wrapped round the front of a bottle: an open cylinder
     segment facing the camera, the text drawn on a small canvas. */
  function bottleLabel(bp, i) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#17140f'; c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#faf8f4'; c.fillRect(6, 6, 244, 116);
    c.fillStyle = i === 0 ? '#e3d184' : '#345ecc'; c.fillRect(6, 6, 244, 26);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 54px "Archivo", system-ui, sans-serif';
    const tex = new THREE.CanvasTexture(cv);
    const ink = function () {
      const text = WORDS['bottle.' + (i + 1)];
      c.fillStyle = '#faf8f4'; c.fillRect(6, 40, 244, 80);
      // a longer word is squeezed to the label's width rather than cut off
      c.fillStyle = '#17140f'; c.fillText(text, 128, 80, 228);
      tex.needsUpdate = true;
    };
    ink();
    bottleInks.push(ink);
    // the web font may land after the first drawing
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ink);
    const R = 33 * RIG + 0.25, H = 30 * RIG, L = 1.6;   // radians of wrap
    const thc = AZ + Math.PI / 2;
    const g = new THREE.CylinderGeometry(R, R, H, 24, 1, true, thc - L / 2, L);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2;
    m.position.set(bp.x, bp.y, GZ + 52 * RIG);
    rigGrp.add(m);
  }

  /* ---------- tubing ----------
     Bottle cap, up, across, down into the port. Rounded right angles like the
     reference rather than free curves. Drawn as a fatter black tube behind a
     thinner khaki one, which is how the customer's own drawings ink tubing. */
  function inkedTube(pts, radius, hex, soft) {
    const curve = new THREE.CatmullRomCurve3(
      pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }),
      false, soft ? 'centripetal' : 'catmullrom', 0.12);
    const geo = new THREE.TubeGeometry(curve, soft ? 140 : 84, radius, 12, false);
    // merged per colour at kitFlush(), outline only (no edge lines)
    KM(geo, hex, new THREE.Matrix4(), rigGrp, true);
    return curve;
  }

  /** A narrow band around a hose or cable at u (0..1) along its curve:
      cable ties and hose clamps. */
  function bandAt(curve, u, r, hex, w) {
    const p = curve.getPointAt(u), tg = curve.getTangentAt(u);
    const geo = new THREE.CylinderGeometry(r, r, w || 1.4, 14);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), tg);
    const e = new THREE.Euler().setFromQuaternion(q);
    K(geo, hex, p.x, p.y, p.z, [e.x, e.y, e.z]);
  }

  /* Feed lines and the air line as one bundle (Round 5): out of the heads,
     up a riser on the vessel side of the tower, over to the vessel in a
     single arc, and apart only above the head plate: the three feed lines
     into the addition port's needles (head 1, 2, 3 = FEED, BASE, ACID),
     the air line (pale grey, from the controller's gas outlet) into the
     sparger's air filter. Clips at the riser and at the top of the arc.
     The suction side (bottle -> head) stays one loose loop per bottle. */
  const HOSE = 1.25;
  const BUND = { x: SIDE * 50, y: 64, top: 206, gap: 2.7 };
  /** A clip sleeve round a bundle: centre p, along direction t, radius r. */
  function clipAt(p, t, r, hex) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.clone().normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    K(new THREE.CylinderGeometry(r, r, 2.6, 18), hex || '#3d3d3d', p.x, p.y, p.z, [e.x, e.y, e.z]);
  }
  {
    const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const arr = (v) => [v.x, v.y, v.z];
    const ad = new THREE.Vector3(PORT.add.x, PORT.add.y, 0);
    const rTop = v3(pumpPt(BUND.x, BUND.y, BUND.top));
    const run = new THREE.Vector3(ad.x - rTop.x, ad.y - rTop.y, 0).normalize();
    const lat = new THREE.Vector3(-run.y, run.x, 0);
    const off = (i) => lat.clone().multiplyScalar((i - 1.5) * BUND.gap);
    const R = (z, i) => v3(pumpPt(BUND.x, BUND.y, z)).add(off(i));
    const B = (i) => rTop.clone().lerp(ad, 0.42).setZ(44).add(off(i));
    const C = (i) => ad.clone().multiplyScalar(1.75).setZ(28).add(off(i));
    const ends = NEEDLES.concat([SPG_IN]);
    RECESS.forEach(function (r, i) {
      const out = pumpPt(SIDE * 27, 52, r[2]), outF = pumpPt(SIDE * 42, 64, r[2] - 2);
      const e = ends[i];
      inkedTube([out, outF, arr(R(r[2] + 9, i)), arr(R(BUND.top - 12, i)), arr(R(BUND.top, i)),
                 arr(B(i)), arr(C(i)), [e[0], e[1], e[2] + 8], e], HOSE, '#e3d184', true);

      // suction side: from the bottle, sagging to the bench, up into the head
      const inn = pumpPt(-SIDE * 27, 52, r[2]), innF = pumpPt(-SIDE * 48, 74, r[2] - 7);
      const top = bottleTops[i];
      const sag = Math.max(GZ + 6, Math.min(innF[2], top[2]) - 26 - i * 7);
      inkedTube([
        inn, innF,
        [innF[0] * 0.55 + top[0] * 0.45, innF[1] * 0.55 + top[1] * 0.45, sag],
        [innF[0] * 0.12 + top[0] * 0.88, innF[1] * 0.12 + top[1] * 0.88, top[2] + 10],
        [top[0], top[1], top[2] + 15],
        [top[0], top[1], top[2]],
      ], HOSE, '#e3d184', true);
    });
    // air line: from a barb on the controller head into the top of the riser
    const gas = pumpPt(SIDE * 39, 34, 192), gasF = pumpPt(SIDE * 46, 46, 194);
    K(new THREE.CylinderGeometry(2.4, 3, 6, 12), '#939b9b', SIDE * 39.5, 34, 192, [0, 0, -Math.PI / 2], pumpGrp);
    inkedTube([gas, gasF, arr(R(BUND.top - 6, 3)), arr(R(BUND.top, 3)), arr(B(3)), arr(C(3)),
               [SPG_IN[0], SPG_IN[1], SPG_IN[2] + 8], SPG_IN], HOSE, '#d8d8d8', true);
    // clips: two on the riser, one at the top of the arc
    const cr = 1.5 * BUND.gap + HOSE + 0.9;
    clipAt(R(150, 1.5), new THREE.Vector3(0, 0, 1), cr);
    clipAt(R(BUND.top - 3, 1.5), new THREE.Vector3(0, 0, 1), cr);
    clipAt(B(1.5), C(1.5).sub(R(BUND.top, 1.5)), cr);
  }

  /* pump-head tubing clips: a white latch where each line enters a head */
  RECESS.forEach(function (r) {
    [-1, 1].forEach(function (s) {
      K(new THREE.BoxGeometry(7, 6, 8), '#f5f7f8', s * 31.5, 57, r[2] - 1.5, null, pumpGrp);
    });
  });

  /* ---------- the off-gas sensor (invented geometry, like the rig) ----------
     Its printed enclosure sits on top of the controller. The vent leaves the
     head plate through a condenser, then an exhaust filter, and only then
     goes by hose to the sensor: it reads the exhaust. A short tail leaves
     the other side of the box to atmosphere. */
  const _sb = pumpPt(0, -4, CTRL_TOP);
  const SBOX = new THREE.Vector3(_sb[0], _sb[1], _sb[2] + 9);
  K(new THREE.BoxGeometry(36, 25, 17), '#f1eee6',
       SBOX.x, SBOX.y, SBOX.z, [0, 0, PUMP_ROT]);
  // lid seam and four screw heads: it is a printed box, closed
  K(new THREE.BoxGeometry(37, 26, 1.2), '#e3ddcc',
       SBOX.x, SBOX.y, SBOX.z + 5.2, [0, 0, PUMP_ROT]);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(function (q) {
    const lx = q[0] * 15, ly = q[1] * 9.5;
    K(new THREE.CylinderGeometry(1.1, 1.1, 0.8, 8), '#939b9b',
         SBOX.x + lx * _cos - ly * _sin, SBOX.y + lx * _sin + ly * _cos, SBOX.z + 8.7,
         [Math.PI / 2, 0, 0]);
  });
  [-1, 1].forEach(function (side) {                      // hose barbs
    K(new THREE.CylinderGeometry(2.1, 2.1, 9, 12), '#f1eee6',
         SBOX.x + _cos * 21 * side, SBOX.y + _sin * 21 * side, SBOX.z + 2,
         [0, 0, PUMP_ROT + Math.PI / 2]);
  });

  /* Exhaust condenser and exhaust filter on the vent port (PORT.vent), as in
     my drawing.png. The condenser is drawn air-cooled (a finned tube), so it
     needs no water lines of its own; a short ochre line goes over the top
     to the filter hanging off it, and the vent hose to the sensor leaves
     from the filter's nozzle. VENT is the port; FILTER the filter's centre. */
  const VENT = { ang: PORT.vent.ang, r: PORT.vent.r, x: PORT.vent.x, y: PORT.vent.y };
  let VENT_CURVE = null;
  {
    const vx = VENT.x, vy = VENT.y;
    const V3 = (z) => [vx, vy, z];
    const CZ = VENT.top = 46;
    nut(PORT.vent, 4.6);
    K(cyl(3, CZ - 4, 20), '#c0c5c5', vx, vy, (CZ + 4) / 2, UP);            // core
    for (let z = 12; z <= 40; z += 4) K(cyl(6, 0.7, 28), '#939b9b', vx, vy, z, UP);   // fins
    K(cyl(2.6, 3, 16, 1.9), '#939b9b', vx, vy, CZ + 1.5, UP);              // reducer
    // toward the sensor box, in plan
    const bx = SBOX.x - vx, by = SBOX.y - vy, bl = Math.hypot(bx, by);
    const dx = bx / bl, dy = by / bl;
    const FILTER = new THREE.Vector3(vx + dx * 13, vy + dy * 13, CZ - 2);
    inkedTube([
      V3(CZ + 2.5), V3(CZ + 6), [vx + dx * 4, vy + dy * 4, CZ + 10],
      [FILTER.x - dx * 2, FILTER.y - dy * 2, CZ + 10], [FILTER.x, FILTER.y, FILTER.z + 8.4],
    ], 1.0, '#e3d184', true);
    // the filter: cone, body, cone, nozzle (cream, like the drawing)
    const F = FILTER;
    K(cyl(4.4, 3.4, 20, 1.4), '#efe8cf', F.x, F.y, F.z + 6.2, UP);
    K(cyl(4.4, 6.0, 20), '#efe8cf', F.x, F.y, F.z + 1.5, UP);
    K(cyl(1.6, 3.0, 20, 4.4), '#efe8cf', F.x, F.y, F.z - 3.0, UP);
    K(cyl(1.0, 3.0, 10), '#efe8cf', F.x, F.y, F.z - 5.6, UP);
    K(new THREE.TorusGeometry(4.45, 0.5, 6, 24), '#345ecc', F.x, F.y, F.z + 4.4);    // housing seam

    // vent hose: filter nozzle down, across, into the box barb
    const tx = _cos * SIDE, ty = _sin * SIDE;      // from the box toward the vessel
    const ix = SBOX.x + tx * 25, iy = SBOX.y + ty * 25, iz = SBOX.z + 2;
    const fz = F.z - 7;
    VENT_CURVE = inkedTube([
      [F.x, F.y, fz],
      [F.x + dx * 2, F.y + dy * 2, fz - 9],
      [F.x * 0.55 + ix * 0.45, F.y * 0.55 + iy * 0.45, Math.min(fz, iz) - 18],
      [ix + tx * 20, iy + ty * 20, iz - 5],
      [ix + tx * 9, iy + ty * 9, iz - 1],
      [ix, iy, iz],
    ], HOSE, '#e3d184', true);
    bandAt(VENT_CURVE, 0.035, HOSE + 0.55, '#939b9b', 1.6);     // hose clamps
    bandAt(VENT_CURVE, 0.975, HOSE + 0.55, '#939b9b', 1.6);
    const ox2 = SBOX.x - tx * 25, oy2 = SBOX.y - ty * 25;
    inkedTube([
      [ox2, oy2, iz],
      [ox2 - tx * 10, oy2 - ty * 10, iz + 1],
      [ox2 - tx * 19, oy2 - ty * 19, iz + 9],
      [ox2 - tx * 21, oy2 - ty * 21, iz + 24],
    ], HOSE, '#e3d184', true);
  }

  /* ---------- jacket water hoses ----------
     Thicker than the feed lines and blue. Both leave their barbs, drop side
     by side to the bench clear of the balance, are clipped together and run
     off to the left to a thermostat out of frame. */
  {
    const away = atScreen(-320, 0, 40);
    const pts = JPORTS.map(function (jp, i) {
      const x0 = jp.dx * jp.r, y0 = jp.dy * jp.r;
      const sx = -jp.dy * (i - 0.5) * 5.6, sy = jp.dx * (i - 0.5) * 5.6;   // side by side
      const d = [x0 + jp.dx * 22 + sx, y0 + jp.dy * 22 + sy];
      inkedTube([
        [x0 - jp.dx * 4, y0 - jp.dy * 4, jp.z],
        [x0 + jp.dx * 8, y0 + jp.dy * 8, jp.z - 1],
        [d[0], d[1], jp.z - 16],
        [d[0], d[1], GZ + 16],
        [d[0] * 0.75 + away.x * 0.25 + sx, d[1] * 0.75 + away.y * 0.25 + sy, GZ + 2.6],
        [away.x + sx, away.y + sy, GZ + 2.6],
      ], 2.3, '#6f9fd0', true);
      return d;
    });
    const mz = (GZ + 16 + JPORTS[0].z - 16) / 2;
    clipAt(new THREE.Vector3((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, Math.min(mz, GZ + 30)),
           new THREE.Vector3(0, 0, 1), 6.6);
  }

  /* ---------- the monitor (invented geometry) ----------
     A panel display on its own stand in front of the pump, running the Feed
     Profile Designer. It stays where it stands. The feed section brings the
     camera to it (SHOTS.feed) and wakes the screen: with CAM.mon up, the
     setpoint curve draws itself across the run and a cursor walks the week
     (stepMon). At rest the screen shows the finished plan, still. The
     picture is drawn here, on a canvas, in the tool's own colours. */
  const MONV = { w: bootNum('boot.monW', 104), h: bootNum('boot.monW', 104) * 0.625, d: 5, stand: 17 };
  const monCv = document.createElement('canvas');
  monCv.width = 960; monCv.height = 550;
  const monTex = new THREE.CanvasTexture(monCv);
  monTex.anisotropy = 4;
  let MON;
  {
    const mp = atScreen(SIDE * bootNum('boot.monU', 182), 0, bootNum('boot.monD', 38));
    const W = MONV.w, H = MONV.h, D = MONV.d;
    const MZ = GZ + 3 + MONV.stand + H / 2;
    const mf = _view.clone().addScaledVector(_right, -bootNum('boot.monTurn', 0.32) * SIDE).setZ(0).normalize();
    const monGrp = new THREE.Group();
    monGrp.position.set(mp.x, mp.y, MZ);
    monGrp.rotation.z = Math.atan2(-mf.x, mf.y);      // local +Y faces the reader
    rigGrp.add(monGrp);
    const zb = -H / 2 - MONV.stand;                   // top of the foot
    K(new THREE.BoxGeometry(W, D, H), '#3d3d3d', 0, 0, 0, null, monGrp);                        // shell
    K(new THREE.BoxGeometry(W * 0.56, 4.5, H * 0.56), '#515151', 0, -D / 2 - 2.25, -2, null, monGrp);   // back
    K(new THREE.BoxGeometry(9, 3.6, -6 - zb), '#515151', 0, -D / 2 - 6.3, (zb - 6) / 2, null, monGrp);  // neck
    K(new THREE.CylinderGeometry(20, 24, 3, 36), '#515151', 0, -5, zb - 1.5, [Math.PI / 2, 0, 0], monGrp);  // foot
    K(new THREE.BoxGeometry(4, 0.8, 1.6), '#345ecc', W / 2 - 9, D / 2 + 0.2, -H / 2 + 2.6, null, monGrp);   // power light
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 7, H - 9.5),
                                new THREE.MeshBasicMaterial({ map: monTex }));
    face.rotation.x = Math.PI / 2;            // stand the plane up
    const turn = new THREE.Group();
    turn.rotation.z = Math.PI;                // and face it out of the front
    turn.position.set(0, D / 2 + 0.25, 1.25);
    turn.add(face);
    monGrp.add(turn);
    MON = new THREE.Vector3(mp.x, mp.y, MZ);
  }
  /** The designer's screen with the run drawn up to p (0..1). */
  function drawMonScreen(p) {
    const c = monCv.getContext('2d');
    c.setTransform(1.5, 0, 0, 1.5, 0, 0);    // drawn on a 640 x 366 grid
    const INK = '#191d17', BLUE = '#2a78d6', ORANGE = '#e07b39';
    const X0 = 40, X1 = 600, Y0 = 268, Y1 = 152, RAMP0 = 150, RAMP1 = 270;
    const xp = X0 + (X1 - X0) * p;
    const phase = xp < X0 + RAMP0 ? 0 : xp < X0 + RAMP1 ? 1 : 2;
    c.fillStyle = '#f4f6f3'; c.fillRect(0, 0, 640, 367);
    c.fillStyle = INK; c.font = '600 27px "Plex Mono", ui-monospace, monospace';
    c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillText(WORDS['mon.title'], 24, 30, 592);
    // two phases; the one being run is lit
    [[BLUE, WORDS['mon.phase1'], 'rgba(42,120,214,.22)'], [ORANGE, WORDS['mon.phase2'], 'rgba(224,123,57,.24)']]
      .forEach(function (ph, i) {
        const y = 52 + i * 36;
        c.fillStyle = (p < 1 && phase === i + 1) ? ph[2] : '#e3e7e2'; c.fillRect(24, y, 592, 29);
        c.fillStyle = ph[0]; c.fillRect(32, y + 5, 10, 19);
        c.fillStyle = INK; c.font = '600 19px "Plex Sans", system-ui, sans-serif';
        c.fillText(ph[1], 54, y + 15);
      });
    // setpoint chart: flat batch, exponential ramp, constant hold
    const yAt = function (x) {
      if (x <= X0 + RAMP0) return Y0 - 3;
      if (x >= X0 + RAMP1) return Y1 + 8;
      const u = (x - X0 - RAMP0) / (RAMP1 - RAMP0);
      return Y0 - 14 - (Math.exp(2.6 * u) - 1) / (Math.exp(2.6) - 1) * (Y0 - Y1 - 22);
    };
    c.fillStyle = '#fbfcfa'; c.fillRect(24, 134, 592, 148);
    c.fillStyle = 'rgba(42,120,214,.16)'; c.fillRect(X0 + RAMP0, Y1 - 8, RAMP1 - RAMP0, Y0 - Y1 + 8);
    c.fillStyle = 'rgba(224,123,57,.16)'; c.fillRect(X0 + RAMP1, Y1 - 8, X1 - X0 - RAMP1, Y0 - Y1 + 8);
    c.strokeStyle = '#c6ccc3'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X0, Y0); c.lineTo(X1, Y0); c.stroke();
    c.strokeStyle = BLUE; c.lineWidth = 6; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(X0, yAt(X0));
    for (let x = X0 + 4; x < xp; x += 4) c.lineTo(x, yAt(x));
    c.lineTo(xp, yAt(xp)); c.stroke();
    if (p > 0 && p < 1) {                     // the pen
      c.fillStyle = INK; c.beginPath(); c.arc(xp, yAt(xp), 9, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(xp, yAt(xp), 4.5, 0, Math.PI * 2); c.fill();
    }
    // the week: one row of hours, working hours light, the run in blue
    const now = Math.min(27, Math.floor(p * 28));
    for (let k = 0; k < 28; k++) {
      const night = (k % 7) < 2 || (k % 7) > 5;
      const run = k > 7 && k < 22 && (p >= 1 || k <= now);
      c.fillStyle = run ? (k < 12 ? '#9ec5f4' : '#256abf') : (night ? '#dde2db' : '#eceff0');
      c.fillRect(26 + k * 21, 300, 18, 36);
    }
    c.strokeStyle = INK; c.lineWidth = 4;
    c.strokeRect(26 + (p >= 1 ? 12 : now) * 21 - 1, 299, 20, 38);
    // an ink line round the picture, where the glass meets the bezel
    c.lineWidth = 5; c.strokeRect(2.5, 2.5, 635, 361.6);
    monTex.needsUpdate = true;
  }
  drawMonScreen(1);
  let monClock = 0, monDrawn = 1;
  // the web fonts may land after the first drawing
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { monDrawn = -1; });
  function stepMon(dt, mon) {
    if (REDUCED || mon < 0.02) {
      monClock = 0;
      if (monDrawn !== 1) { drawMonScreen(1); monDrawn = 1; }
      return;
    }
    monClock += dt;
    // draw the run over most of the loop, hold the finished plan, start again
    const ph = (monClock % P.monLoop) / P.monLoop;
    const q = Math.round(Math.min(ph / 0.78, 1) * 96) / 96;
    if (q !== monDrawn) { drawMonScreen(q); monDrawn = q; }
  }

  /* ---------- probe and motor cables (Round 5) ----------
     One bundle. pH, DO, thermowell and motor cables each leave their head
     toward the back rod (VS.rods[2]), are clipped to it, run down it to the
     base, cross the bench behind the tower and climb its back to the
     connector row (CONN_Y), each with a strain-relief sleeve at the plug.
     Behind the vessel from the front, so the head plate stays calm. */
  const connEnd = (i) => pumpPt(CONN_X + CONN_S * 5.5, CONN_Y[i], CONN_Z);
  const connOut = (i) => pumpPt(CONN_X + CONN_S * 15, CONN_Y[i], CONN_Z - 5);
  {
    const ra = VS.rods[2] * DEGR;
    const ox = Math.cos(ra), oy = Math.sin(ra), tx = -oy, ty = ox;
    const rx = VS.rodR * ox, ry = VS.rodR * oy;
    const mz = VS.plateZ1 + 30;
    const srcs = [
      [PORT.ph.x, PORT.ph.y, 19, '#515151'],
      [PORT.do.x, PORT.do.y, 19, '#6f7777'],
      [PORT.tw.x, PORT.tw.y, 13, '#3d3d3d'],
      [12.2 * ox, 12.2 * oy, mz, '#17140f'],          // motor, from its side
    ];
    const at = (i, r, z) => { const o = (i - 1.5) * 2.5; return [rx + ox * r + tx * o, ry + oy * r + ty * o, z]; };
    srcs.forEach(function (s, i) {
      const co = connOut(i);
      // straight across the plate toward the rod, low, then down the rod
      const top = at(i, 5, 10);
      const ux = top[0] - s[0], uy = top[1] - s[1], ul = Math.hypot(ux, uy);
      const cv = inkedTube([
        [s[0], s[1], s[2]],
        [s[0] + ux / ul * 4, s[1] + uy / ul * 4, s[2] + 2.5],
        [(s[0] + top[0]) / 2, (s[1] + top[1]) / 2, Math.max(13, s[2] - 4)],
        // down the rod, then off it above the base plate: the plate's lobe
        // reaches r 61 here and the balance lies under it, so the bundle
        // swings out past both before it drops to the bench
        top, at(i, 5, 0), at(i, 5, -40), at(i, 5, -104),
        at(i, 13, -124), at(i, 17, VS.baseZ - 10), at(i, 19, GZ + 4),
        pumpPt(SIDE * 30, -80 - i * 2.5, 3),
        pumpPt(0, -68 - i * 3, 40),
        pumpPt(CONN_S * 46, -50, 92 + i * 2),
        [co[0], co[1], co[2] - 14],
        co, connEnd(i),
      ], i === 3 ? 1.3 : 1.15, s[3], true);
      bandAt(cv, 0.985, i === 3 ? 1.9 : 1.75, '#17140f', 3.2);
    });
    // clips: the bundle to the rod, top and bottom
    [-6, -100].forEach(function (z) {
      clipAt(new THREE.Vector3(rx + ox * 3, ry + oy * 3, z), new THREE.Vector3(0, 0, 1), 7.4);
    });
  }
  // mains cable off the inlet, onto the bench and straight off the back of
  // the mat, between the tower and the bottles and behind the probe cables
  inkedTube([
    pumpPt(MAINS.x, MAINS.y - 2, MAINS.z),
    pumpPt(MAINS.x, MAINS.y - 12, MAINS.z - 5),
    pumpPt(MAINS.x + 6, MAINS.y - 26, 4),
    pumpPt(31, -115, 3),
    pumpPt(85, -200, 3),
  ], 1.2, '#17140f', true);

  // everything given to K() above becomes one merged mesh per colour here
  kitFlush();

  /* ---------- the printed racks (the Holder Designer's section) ----------
     Three holders stand on the bench to the right of the monitor, each one
     of the tool's three styles at the sizes its own resolve() gives:
       a solid block for 2 ml tubes, 4 x 2       79.5 x 39.5 x 33
       an open stand for 50 ml tubes, 3 x 1     135.5 x 37.5 x 96
       a tray for cuvettes, 5 x 2                  81 x 36 x 18
     The stand's openings are teardrops, as the tool makes them for a part
     that prints on its side. Each rack is built in real millimetres in its
     own group and shown at RK. The tubes in it are three merged meshes per
     rack (clear bodies, liquid, caps) plus one shadow.

     Away from the section they simply stand there, tubes in. When the `rack`
     shot arrives (CAM.rack), stepRacks() clears the bench and prints all
     three at once, like one job on one bed: one cut height rises through
     them a layer at a time (the printable() material the impeller uses), so
     the tray is done first and the stand last. As each is finished its tubes
     drop in one after the other: every tube vertex carries its hole and its
     turn (aTube), and the vertex shader lets it fall and grow from uDrop.
     Then nothing moves until the section has been left and found again.
     Liberty taken: the stand is built standing up, though the tool would
     print it lying on a long side. */
  const RK = 0.5;
  const RACK_AT = new THREE.Vector3();          // middle of the three, on the bench
  const RACKS = { phase: 'rest', t: 0, cut: 1e3, list: [], names: [] };
  {
    const Fh = new THREE.Vector3(_view.x, _view.y, 0).normalize();   // toward the eye, level
    const bench = (u, f) => new THREE.Vector3().addScaledVector(_right, SIDE * u).addScaledVector(Fh, f);
    const along = Math.atan2(_right.y, _right.x);                    // a rack's long side along screen-right
    const TAU = Math.PI * 2;

    const rrect = function (w, d, r) {
      const s = new THREE.Shape();
      s.moveTo(-w / 2 + r, -d / 2);
      s.lineTo(w / 2 - r, -d / 2); s.absarc(w / 2 - r, -d / 2 + r, r, -Math.PI / 2, 0, false);
      s.lineTo(w / 2, d / 2 - r);  s.absarc(w / 2 - r, d / 2 - r, r, 0, Math.PI / 2, false);
      s.lineTo(-w / 2 + r, d / 2); s.absarc(-w / 2 + r, d / 2 - r, r, Math.PI / 2, Math.PI, false);
      s.lineTo(-w / 2, -d / 2 + r); s.absarc(-w / 2 + r, -d / 2 + r, r, Math.PI, Math.PI * 1.5, false);
      return s;
    };
    const slab = (shape, z0, z1) => ({
      geo: new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 10 }),
      m: placeM(0, 0, z0) });
    const round = (x, y, r) => new THREE.Path().absarc(x, y, r, 0, TAU, true);
    const square = function (x, y, s) {
      const p = new THREE.Path(), h = s / 2;
      p.moveTo(x - h, y - h); p.lineTo(x - h, y + h); p.lineTo(x + h, y + h); p.lineTo(x + h, y - h); p.closePath();
      return p;
    };
    // a round hole with a 45 degree roof on its +y side, cut off at 1.25 radii
    const teardrop = function (x, y, r) {
      const p = new THREE.Path(), q = r * Math.SQRT1_2, top = 1.25 * r, w = r * Math.SQRT2 - top;
      p.moveTo(x + q, y + q);
      p.absarc(x, y, r, Math.PI / 4, Math.PI * 3 / 4 - TAU, true);
      p.lineTo(x - w, y + top); p.lineTo(x + w, y + top); p.closePath();
      return p;
    };
    const grid = function (cols, rows, pitch) {
      const out = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
        out.push([(i - (cols - 1) / 2) * pitch, (j - (rows - 1) / 2) * pitch]);
      return out;
    };
    const lathe = (pts) => ({
      geo: new THREE.LatheGeometry(pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 20),
      m: null });

    /* The vessels, in real mm, standing on z = 0 at the origin. Each returns
       { glass, liquid, cap }: lists for mergeGeos, `fill` is the liquid level. */
    const VESSEL = {
      t20: function (fill, turn) {
        return {
          glass: [lathe([[0, 0], [2.2, 0.3], [4.2, 2.2], [5.4, 6], [5.4, 35], [6.4, 35], [6.4, 37.5]])],
          liquid: [lathe([[0, 0.9], [1.8, 1.1], [3.5, 2.8], [4.5, 6.2], [4.5, fill], [0, fill]])],
          cap: [{ geo: cyl(6.7, 3.5, 20), m: placeM(0, 0, 39.25, UP) },
                { geo: new THREE.BoxGeometry(4, 3.4, 1.3),
                  m: placeM(7.6 * Math.cos(turn), 7.6 * Math.sin(turn), 40.3, [0, 0, turn + Math.PI / 2]) }],
        };
      },
      f50: function (fill) {
        return {
          glass: [lathe([[0, 0], [3, 0], [14.5, 15], [14.5, 101], [13.4, 101], [13.4, 103]])],
          liquid: [lathe([[0, 0.9], [2.4, 0.9], [13.3, 15.4], [13.3, fill], [0, fill]])],
          cap: [{ geo: cyl(17.25, 11, 28), m: placeM(0, 0, 107.5, UP) },
                { geo: cyl(17.25, 2, 28, 15.6), m: placeM(0, 0, 114, UP) }],
        };
      },
      cuvette: function (fill) {
        return {
          glass: [{ geo: new THREE.BoxGeometry(12.5, 12.5, 45), m: placeM(0, 0, 22.5) }],
          liquid: [{ geo: new THREE.BoxGeometry(10.3, 10.3, fill - 1.4), m: placeM(0, 0, 1.4 + (fill - 1.4) / 2) }],
          cap: [],
        };
      },
    };

    const A_HOLES = grid(4, 2, 20), B_HOLES = grid(3, 1, 45), C_HOLES = grid(5, 2, 15);
    const blockTop = rrect(79.5, 39.5, 4);
    A_HOLES.forEach(function (h) { blockTop.holes.push(round(h[0], h[1], 5.75)); });
    const standTop = rrect(135.5, 37.5, 4);
    B_HOLES.forEach(function (h) { standTop.holes.push(teardrop(h[0], h[1], 14.75)); });
    const standWall = function (side) {            // an end wall: the outline's last 4 mm
      const s = new THREE.Shape(), x1 = 67.75, x0 = x1 - 4, d = 18.75, r = 4;
      s.moveTo(x0, -d); s.lineTo(x1 - r, -d); s.absarc(x1 - r, -d + r, r, -Math.PI / 2, 0, false);
      s.lineTo(x1, d - r); s.absarc(x1 - r, d - r, r, 0, Math.PI / 2, false); s.lineTo(x0, d); s.closePath();
      const it = slab(s, 4, 92);
      if (side < 0) it.m = placeM(0, 0, 4, [0, 0, Math.PI]);
      return it;
    };
    const trayTop = rrect(81, 36, 4);
    C_HOLES.forEach(function (h) { trayTop.holes.push(square(h[0], h[1], 13)); });

    /* name, where it stands (mm right of the vessel, mm toward the eye), its
       turn, the solid, its height, then the tubes: which vessel, the level
       they stand on, which openings are taken and how full each one is. */
    const DEFS = [
      { name: '2 ml block', u: 262, f: 60, turn: 9, h: 33,
        parts: [slab(rrect(79.5, 39.5, 4), 0, 12), slab(blockTop, 12, 33)],
        vessel: 't20', seat: 12, holes: A_HOLES, take: [0, 1, 3, 4, 6, 7], fill: [24, 17, 27, 21, 14, 25],
        liquid: '#dda21f', cap: '#dfebeb', fall: 70 },
      { name: '50 ml stand', u: 290, f: 20, turn: -7, h: 96,
        parts: [slab(rrect(135.5, 37.5, 4), 0, 4), slab(standTop, 92, 96), standWall(1), standWall(-1)],
        vessel: 'f50', seat: 4, holes: B_HOLES, take: [0, 1], fill: [72, 46],
        liquid: '#dda21f', cap: '#345ecc', fall: 120 },
      { name: 'Cuvette tray', u: 312, f: 64, turn: -12, h: 18,
        parts: [slab(rrect(81, 36, 4), 0, 2), slab(trayTop, 2, 18)],
        vessel: 'cuvette', seat: 2, holes: C_HOLES, take: [0, 1, 2, 4, 5, 8], fill: [31, 28, 33, 30, 26, 32],
        liquid: '#345ecc', cap: null, fall: 70 },
    ];

    // the shadow material again, for a part that is being printed or dropped
    const shadowKin = [];
    const shadowLike = function (extra, vert, frag) {
      if (!shadowMat) return null;
      const m = new THREE.ShaderMaterial({
        uniforms: Object.assign({}, shadowMat.uniforms, extra),
        vertexShader: vert(shadowMat.vertexShader), fragmentShader: frag(shadowMat.fragmentShader),
        side: THREE.DoubleSide });
      shadowKin.push(m);
      return m;
    };
    RACKS.shadows = shadowKin;

    // a tube falls into its opening and grows to size on the way: aTube is
    // its opening (x, y) and its turn in the queue
    const DROP_HEAD = 'attribute vec3 aTube;\nuniform float uDrop, uFall, uSeat;\n';
    const DROP_BODY = [
      'float dq = clamp(uDrop - aTube.z * 0.3, 0.0, 1.0);',
      '  float ds = min(dq * 3.0, 1.0);',
      '  vec3 dp = vec3(aTube.xy, uSeat) + (position - vec3(aTube.xy, uSeat)) * ds;',
      '  dp.z += uFall * (1.0 - dq * dq);'].join('\n');
    const dropping = function (m, U) {
      Object.assign(m.uniforms, U);
      m.vertexShader = DROP_HEAD + m.vertexShader
        .replace('vec4 p = vec4(position, 1.0);', DROP_BODY + '\n  vec4 p = vec4(dp, 1.0);');
      return m;
    };

    DEFS.forEach(function (d) {
      const at = bench(d.u, d.f);
      const grp = new THREE.Group();
      grp.position.set(at.x, at.y, GZ);
      grp.rotation.z = along + d.turn * DEGR;
      grp.scale.setScalar(RK);
      rigGrp.add(grp);
      RACK_AT.add(at);

      // the rack itself
      const mat = printable(ToonMat.hardware(P.rackColor, { rim: 0.3, spec: 0.6 }));
      mat.uniforms.uHot.value.set(P.rackHot);
      mat.uniforms.uCore.value.set(P.rackCore);
      mat.uniforms.uLines.value = 0.4;
      mat.uniforms.uLayerH.value = Math.max(P.rackLayer, 0.2);
      const geo = creaseNormals(mergeGeos(d.parts), 38);
      grp.add(new THREE.Mesh(geo, mat));
      const cut = mat.uniforms.uCut;
      const sh = shadowLike({ uCut: cut },
        (v) => v.replace('varying vec2 vXY;', 'varying vec2 vXY;\nvarying float vH;')
                .replace('void main() {', 'void main() {\n  vH = position.z;'),
        (f) => f.replace('varying vec2 vXY;', 'varying vec2 vXY;\nvarying float vH;\nuniform float uCut;')
                .replace('void main() {', 'void main() {\n  if (vH > uCut) discard;'));
      if (sh) grp.add(new THREE.Mesh(geo, sh)).frustumCulled = false;

      // its tubes: one merged mesh per material, every vertex knowing its tube
      const lists = { glass: [], liquid: [], cap: [] }, tags = { glass: [], liquid: [], cap: [] };
      d.take.forEach(function (hole, k) {
        const x = d.holes[hole][0], y = d.holes[hole][1];
        const v = VESSEL[d.vessel](d.fill[k], 0.6 + k * 2.1);
        const here = placeM(x, y, d.seat);
        Object.keys(lists).forEach(function (key) {
          v[key].forEach(function (it) {
            const m = it.m ? here.clone().multiply(it.m) : here.clone().multiply(placeM(0, 0, 0, UP));
            lists[key].push({ geo: it.geo, m: m });
            tags[key].push([x, y, k]);
          });
        });
      });
      const U = { uDrop: { value: 1e3 }, uFall: { value: d.fall }, uSeat: { value: d.seat } };
      const tubeGeo = function (key) {
        if (!lists[key].length) return null;
        // merge one by one so each part's vertices can be tagged
        const parts = lists[key].map(function (it) { return mergeGeos([it]); });
        let n = 0;
        parts.forEach(function (g) { n += g.attributes.position.count; });
        const tag = new Float32Array(n * 3);
        let o = 0;
        parts.forEach(function (g, i) {
          for (let j = 0; j < g.attributes.position.count; j++) tag.set(tags[key][i], (o + j) * 3);
          o += g.attributes.position.count;
        });
        const g = creaseNormals(mergeGeos(parts.map(function (p) { return { geo: p, m: new THREE.Matrix4() }; })), 38);
        g.setAttribute('aTube', new THREE.BufferAttribute(tag, 3));
        return g;
      };
      const meshes = [];
      const gGlass = tubeGeo('glass'), gLiquid = tubeGeo('liquid'), gCap = tubeGeo('cap');
      const glass = new THREE.Mesh(gGlass, dropping(
        ToonMat.glass('#bcd9e6', { base: 0.16, rim: 0.62, fresPower: 1.9, spec: 0.7, streak: 0.7 }), U));
      glass.renderOrder = 7;
      glass.material.depthWrite = true;       // so the ink pass draws the tubes' outlines
      meshes.push(glass, new THREE.Mesh(gLiquid, dropping(toonMat(d.liquid), U)));
      if (gCap) meshes.push(new THREE.Mesh(gCap, dropping(toonMat(d.cap), U)));
      const tsh = shadowLike(U,
        (v) => DROP_HEAD + v.replace('vec4(position, 1.0)', 'vec4(dp, 1.0)')
                            .replace('void main() {', 'void main() {\n  ' + DROP_BODY),
        (f) => f);
      if (tsh) [gGlass, gCap].forEach(function (g) { if (g) meshes.push(new THREE.Mesh(g, tsh)); });
      meshes.forEach(function (m) { m.frustumCulled = false; grp.add(m); });

      RACKS.list.push({ name: d.name, h: d.h, n: d.take.length, mat: mat, drop: U.uDrop, built: true, at: 0 });
      RACKS.names.push(d.name);
    });
    RACK_AT.multiplyScalar(1 / DEFS.length).setZ(GZ);
  }

  /* The job, while the section is on screen (amount = CAM.rack):
       clear  the tubes lift out and the racks go, top layer first
       print  one cut height rises through all three; a rack that is
              finished gets its tubes, one after the other
       done   nothing moves
     It runs once per visit: `rest` (everything whole) comes back only when
     the section is left, and the job starts when the camera is most of the
     way there. Reduced motion: whole and still. Each change is announced as
     a 'tank:racks' event, which js/site.js shows in the panel. */
  const RACK_H = Math.max.apply(null, RACKS.list.map(function (r) { return r.h; }));
  const racksSay = () => document.dispatchEvent(new CustomEvent('tank:racks', { detail: {
    phase: RACKS.phase, built: RACKS.list.map(function (r) { return r.built; }) } }));
  function racksWhole() {
    RACKS.cut = 1e3;
    RACKS.list.forEach(function (r) { r.mat.uniforms.uCut.value = 1e3; r.drop.value = 1e3; r.built = true; });
  }
  function racksPhase(ph) { RACKS.phase = ph; RACKS.t = 0; racksSay(); }
  function stepRacks(dt, amount) {
    if (amount < 0.02 || REDUCED) {
      const want = amount < 0.02 ? 'rest' : 'still';
      if (RACKS.phase !== want) { racksWhole(); racksPhase(want); }
      return;
    }
    if (RACKS.phase === 'rest' || RACKS.phase === 'still') {
      if (amount < 0.6) return;
      racksPhase('clear');
    }
    RACKS.t += dt;
    const h = Math.max(P.rackLayer, 0.2);
    if (RACKS.phase === 'clear') {
      const q = Math.min(1, RACKS.t / Math.max(P.rackClear, 0.05));
      RACKS.list.forEach(function (r) {
        r.drop.value = Math.max(0, 1 - q * 3) * (1 + 0.3 * r.n);       // the tubes first
        r.mat.uniforms.uCut.value = q < 0.3 ? 1e3 : r.h * (1 - (q - 0.3) / 0.7) - 0.01;
        r.mat.uniforms.uLayerH.value = h;
      });
      if (q >= 1) {
        RACKS.list.forEach(function (r) { r.built = false; r.drop.value = 0; r.mat.uniforms.uLines.value = 1; });
        racksPhase('print');
      }
    } else if (RACKS.phase === 'print') {
      const q = Math.min(1, RACKS.t / Math.max(P.rackSecs, 0.05));
      RACKS.cut = Math.floor(q * Math.ceil(RACK_H / h) + 1e-6) * h;     // whole layers
      let moving = false;
      RACKS.list.forEach(function (r) {
        if (!r.built && RACKS.cut >= r.h) { r.built = true; r.at = RACKS.t; racksSay(); }
        r.mat.uniforms.uCut.value = r.built ? 1e3 : RACKS.cut - 0.01;
        r.mat.uniforms.uLayerH.value = h;
        if (r.built) {
          r.mat.uniforms.uLines.value += (0.4 - r.mat.uniforms.uLines.value) * Math.min(1, dt * 0.8);
          r.drop.value = (RACKS.t - r.at) / Math.max(P.rackDrop, 0.05);
          if (r.drop.value < 1 + 0.3 * r.n) moving = true;
        } else moving = true;
      });
      if (!moving) { racksWhole(); racksPhase('done'); }
    }
  }
  ON.rackLayer = (v) => RACKS.list.forEach(function (r) { r.mat.uniforms.uLayerH.value = Math.max(v, 0.2); });
  ON.rackColor = (v) => RACKS.list.forEach(function (r) { r.mat.uniforms.uColor.value.set(v); });
  ON.rackHot = (v) => RACKS.list.forEach(function (r) { r.mat.uniforms.uHot.value.set(v); });
  ON.rackCore = (v) => RACKS.list.forEach(function (r) { r.mat.uniforms.uCore.value.set(v); });

  /* ---------- off-gas: puffs in the vent hose, live OUR/CER plot ----------
     Only while the sensor section is on screen. CAM.gas (0..1, blended from
     the shots like `open`) scales the puffs and fades the chart; at 0 both
     are hidden and cost nothing. Under REDUCED the chart is drawn complete
     and still, and there are no puffs. */
  const GAS = { n: 7, speed: 0.16, loop: 9.0, grow: 0.78 };
  const puffs = [];
  {
    const g = new THREE.SphereGeometry(1.9, 14, 10);
    for (let i = 0; i < GAS.n; i++) {
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(g, toonMat('#faf8f4')));
      if (!POST) {
        const om = new THREE.ShaderMaterial({
          vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG,
          uniforms: { uW: { value: 0.3 } }, side: THREE.BackSide,
        });
        outlines.push({ m: om, k: 1.6 });
        grp.add(new THREE.Mesh(g, om));
      }
      grp.visible = false;
      rigGrp.add(grp);
      puffs.push(grp);
    }
  }

  const gasCv = document.createElement('canvas');
  gasCv.width = 512; gasCv.height = 336;
  const gasTex = new THREE.CanvasTexture(gasCv);
  gasTex.anisotropy = 4;
  // seen small: no mip blur, or the ink thins to grey
  gasTex.generateMipmaps = false;
  gasTex.minFilter = THREE.LinearFilter;
  /** OUR rises with growth then levels; CER follows a little behind, RQ ~0.9. */
  const ourAt = (u) => 0.08 + 0.84 / (1 + Math.exp(-9 * (u - 0.48)));
  const cerAt = (u) => 0.06 + 0.76 / (1 + Math.exp(-9 * (u - 0.53)));
  let gasDrawn = -1;
  function drawGasChart(p) {
    const c = gasCv.getContext('2d');
    const INK = '#17140f', PAPER = '#faf8f4', OCHRE = '#e3d184', BLUE = '#345ecc';
    c.clearRect(0, 0, 512, 336);
    // comic panel: hard ink shadow, ink frame, paper
    c.fillStyle = INK; c.fillRect(16, 16, 490, 314);
    c.fillRect(4, 4, 490, 314);
    c.fillStyle = PAPER; c.fillRect(10, 10, 478, 302);
    c.fillStyle = INK; c.textBaseline = 'middle';
    c.font = '800 30px "Archivo", system-ui, sans-serif';
    c.fillText(WORDS['chart.title'], 26, 38, 214);
    // legend
    c.font = '700 24px "Plex Mono", ui-monospace, monospace';
    c.fillStyle = BLUE; c.fillRect(250, 28, 26, 10);
    c.fillStyle = INK; c.fillText(WORDS['chart.a'], 284, 34, 68);
    c.fillStyle = INK; c.fillRect(358, 26, 30, 14);
    c.fillStyle = OCHRE; c.fillRect(360, 28, 26, 10);
    c.fillStyle = INK; c.fillText(WORDS['chart.b'], 396, 34, 84);
    // axes
    const X0 = 40, X1 = 470, Y0 = 290, Y1 = 74;
    c.strokeStyle = INK; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(X0, Y1); c.lineTo(X0, Y0); c.lineTo(X1, Y0); c.stroke();
    c.lineWidth = 2;
    for (let k = 1; k <= 3; k++) {
      const y = Y0 - (Y0 - Y1) * k / 4;
      c.beginPath(); c.moveTo(X0 - 6, y); c.lineTo(X0, y); c.stroke();
    }
    const curve = (fn, w, col) => {
      const n = Math.max(1, Math.round(60 * p));
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath();
      for (let k = 0; k <= n; k++) {
        const u = k / 60;
        const x = X0 + (X1 - X0) * u, y = Y0 - (Y0 - Y1) * fn(u);
        if (k) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.stroke();
    };
    curve(cerAt, 13, INK); curve(cerAt, 7, OCHRE);
    curve(ourAt, 7, BLUE);
    // the pen: a dot on each curve at the current reading
    if (p > 0 && p < 1) {
      [[ourAt, BLUE], [cerAt, OCHRE]].forEach(function (d) {
        const x = X0 + (X1 - X0) * p, y = Y0 - (Y0 - Y1) * d[0](p);
        c.fillStyle = INK; c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill();
        c.fillStyle = d[1]; c.beginPath(); c.arc(x, y, 5.5, 0, Math.PI * 2); c.fill();
      });
    }
    c.fillStyle = INK; c.font = '600 18px "Plex Mono", ui-monospace, monospace';
    c.textAlign = 'right'; c.fillText(WORDS['chart.x'], X1, Y0 + 18); c.textAlign = 'left';
    gasTex.needsUpdate = true;
  }
  const gasMat = new THREE.MeshBasicMaterial({ map: gasTex, transparent: true,
                                               opacity: 0, depthWrite: false,
                                               depthTest: false });   // a caption, drawn over the hoses
  ToonMat.inkMask(gasMat);      // and no ink from the hoses behind it shows through
  const GAS_W = 62, GAS_H = GAS_W * 336 / 512;
  const gasChart = new THREE.Mesh(new THREE.PlaneGeometry(GAS_W, GAS_H), gasMat);
  gasChart.renderOrder = 9;
  gasChart.visible = false;
  // floats above the box, its centre this far over the lid
  const GAS_AT = new THREE.Vector3(SBOX.x, SBOX.y, SBOX.z + 8.5 + 6 + GAS_H / 2);
  gasChart.position.copy(GAS_AT);
  rigGrp.add(gasChart);
  // an ink leader from the lid up to the chart
  const gasLeadGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(SBOX.x, SBOX.y, SBOX.z + 8.6),
    new THREE.Vector3(SBOX.x, SBOX.y, SBOX.z + 8.5 + 6.5)]);
  const gasLeadMat = new THREE.LineBasicMaterial({ color: 0x17140f, transparent: true, opacity: 0 });
  const gasLead = new THREE.Line(gasLeadGeo, gasLeadMat);
  gasLead.visible = false;
  rigGrp.add(gasLead);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { gasDrawn = -1; });

  let gasClock = 0;
  function stepGas(dt, gas) {
    const on = gas > 0.01 && VENT_CURVE;
    gasChart.visible = gasLead.visible = !!on;
    for (const pf of puffs) pf.visible = false;
    if (!on) { gasClock = 0; return; }
    gasMat.opacity = gas; gasLeadMat.opacity = gas;
    gasChart.quaternion.copy(camera.quaternion);       // always faces the reader
    if (REDUCED) {
      if (gasDrawn !== 1) { drawGasChart(1); gasDrawn = 1; }
      return;
    }
    gasClock += dt;
    // grow over GAS.grow of the loop, hold the finished plot, start again
    const ph = (gasClock % P.gasLoop) / P.gasLoop;
    const p = Math.min(ph / GAS.grow, 1);
    const q = Math.round(p * 120) / 120;
    if (q !== gasDrawn) { drawGasChart(q); gasDrawn = q; }
    for (let i = 0; i < GAS.n; i++) {
      const u = ((gasClock * P.gasSpeed + i / GAS.n) % 1 + 1) % 1;
      // swell in after the filter, shrink into the box barb
      const s = gas * Math.min(1, u / 0.06, (1 - u) / 0.06);
      if (s < 0.02) continue;
      const pf = puffs[i];
      pf.position.copy(VENT_CURVE.getPointAt(u));
      pf.scale.setScalar(s * (0.85 + 0.15 * Math.sin(gasClock * 5 + i)));
      pf.visible = true;
    }
  }

  /* ---------- camera: locked view, optional sweep about the vertical axis --------- */
  const centre = box.getCenter(new THREE.Vector3());
  const corners = [];
  for (let i = 0; i < 8; i++)
    corners.push(new THREE.Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z).sub(centre));

  const WORLD_UP = new THREE.Vector3(0, 0, 1);

  /* ---------- camera state ----------
     The page drives the camera. CAM is where it is, GOAL where it is headed;
     driveCamera() eases one toward the other every frame.
       az, el   view angles, radians
       zoom     1 = the vessel fills the stage height
       sx, sy   where the focus sits on screen, in half-stage units
                (+sx right, +sy up), so a text panel can have the other half
       focus    the world point being looked at, mm */
  const _tgt = new THREE.Vector3();
  const VIEW_NOW = new THREE.Vector3(1, 0, 0);     // toward the eye, this frame
  const BASE = { vw: 1, vh: 1, h: 1 };
  const CAM = { az: AZ, el: EL, zoom: 1, sx: 0, sy: 0, open: 0, gas: 0, mon: 0, print: 0, rack: 0, vw: 1, vh: 1,
                focus: centre.clone() };
  const GOAL = { az: AZ, el: EL, zoom: 1, sx: 0, sy: 0, open: 0, gas: 0, mon: 0, print: 0, rack: 0, focus: centre.clone() };
  const DEG = Math.PI / 180;

  /* Named shots. `p` overrides for a portrait screen, where the model sits in
     the upper part and the text panel comes up from below. */
  const SHOTS = {
    // the whole rig, the opening
    hero:  { az: AZ, el: EL, zoom: 0.76, sx: 0.44, sy: 0.02,
             focus: [centre.x + PX * 0.30, centre.y + PY * 0.30, centre.z - 2],
             p: { zoom: 0.66, sx: 0, sy: 0.34 } },
    // into the broth: the one view where the vessel opens up
    broth: { az: AZ + 10 * DEG, el: 7 * DEG, zoom: 2.3, sx: 0, sy: 0, open: 1,
             focus: [0, 0, V.levelZ - 34],
             p: { zoom: 1.15, sx: 0, sy: 0.25 } },
    // the feed line: over to the monitor where it stands, the pump heads
    // and their hoses beside it. mon: 1 wakes the screen (stepMon)
    feed:  { az: AZ - 9 * DEG, el: 13 * DEG, zoom: 1.05, sx: 0.56, sy: 0.0, mon: 1,
             focus: [MON.x, MON.y, MON.z + 2],
             p: { zoom: 0.88, sx: 0.0, sy: 0.55, focus: [MON.x, MON.y, MON.z] } },
    // the lower impeller, close, the vessel opened up as for the broth. Seen
    // straight down the opening azimuth: the two front baffles then stand
    // either side of it. print: 1 runs the print loop (stepPrint)
    imp:   { az: AZ, el: 22 * DEG, zoom: 3.8, sx: 0.46, sy: 0.10, open: 1, print: 1,
             focus: [0, 0, IMP_Z_M[1] * MM],
             p: { zoom: 2.2, sx: 0, sy: 0.42 } },
    // the racks on the bench right of the monitor, seen from a little above
    // and further round, so the three stand apart. rack: 1 runs the print
    // job once (stepRacks)
    rack:  { az: AZ - 14 * DEG, el: 26 * DEG, zoom: 1.5, sx: 0.48, sy: -0.04, rack: 1,
             focus: [RACK_AT.x, RACK_AT.y, RACK_AT.z + 20],
             p: { zoom: 1.0, sx: 0, sy: 0.46 } },
    // the vent line, seen from the vessel's right so the hose from the
    // exhaust filter to the sensor box runs across the picture.
    // gas: 1 shows the puffs in the vent hose and the OUR/CER plot (stepGas)
    vent:  { az: AZ + 46 * DEG, el: 20 * DEG, zoom: 1.04, sx: 0.42, sy: -0.06, gas: 1,
             focus: [(SBOX.x + VENT.x) / 2, (SBOX.y + VENT.y) / 2, 34],
             p: { zoom: 0.64, sx: 0.0, sy: 0.50,
                  focus: [(SBOX.x + VENT.x) / 2, (SBOX.y + VENT.y) / 2, 40] } },
  };
  // the page ends where it began: the opening view, now beside the About panel
  SHOTS.about = SHOTS.hero;

  const _fa = new THREE.Vector3(), _fb = new THREE.Vector3();
  function shotValue(s, k, portrait) {
    return portrait && s.p && s.p[k] !== undefined ? s.p[k] : s[k];
  }
  /** Point the camera somewhere between shot `a` and shot `b` (t 0..1). */
  function look(a, b, t, portrait) {
    const A = SHOTS[a] || SHOTS.hero, B = SHOTS[b] || A;
    ['az', 'el', 'zoom', 'sx', 'sy', 'open', 'gas', 'mon', 'print', 'rack'].forEach(function (k) {
      const x = shotValue(A, k, portrait) || 0, y = shotValue(B, k, portrait) || 0;
      // zoom blends in log space, or the far end of a zoom rushes past
      GOAL[k] = k === 'zoom' ? Math.exp(Math.log(x) + (Math.log(y) - Math.log(x)) * t)
                             : x + (y - x) * t;
    });
    // a portrait override may move the focus too (p.focus)
    GOAL.focus.copy(_fa.fromArray(shotValue(A, 'focus', portrait)))
              .lerp(_fb.fromArray(shotValue(B, 'focus', portrait)), t);
  }

  /* From a distance the vessel is a solid object: dense broth right out to
     the wall, glass with some body to it, the internals sunk in the liquid.
     Only a shot that asks for it (open: 1, the close-up) thins the broth and
     clears the glass so the impellers and bubbles can be read. */
  let openNow = -1;
  function setOpen(o) {
    if (Math.abs(o - openNow) < 0.002) return;
    openNow = o;
    const closed = 1 - o;
    for (const lm of liquidMats) {
      // the surface shader shares this list but has no body terms
      if (lm.uniforms.uK) lm.uniforms.uK.value = (0.019 + closed * 0.075) * P.density;
      if (lm.uniforms.uHazeMax) lm.uniforms.uHazeMax.value = P.hazeOpen + closed * (P.hazeClosed - P.hazeOpen);
    }
    FOG.uFogK.value = P.fogOpen + closed * (P.fogClosed - P.fogOpen);
    for (const gm of glassMats) {
      if (!gm.uniforms.uBase) continue;
      if (gm.userData.base0 === undefined) gm.userData.base0 = gm.uniforms.uBase.value;
      gm.uniforms.uBase.value = gm.userData.base0
        + closed * (gm.userData.closeGain === undefined ? 0.13 : gm.userData.closeGain);
    }
  }

  ON.density = ON.hazeOpen = ON.hazeClosed = ON.fogOpen = ON.fogClosed = () => { openNow = -1; };

  let camStarted = false;
  function driveCamera(now, dt) {
    const k = (REDUCED || !camStarted) ? 1 : 1 - Math.exp(-dt * P.camEase);
    camStarted = true;
    CAM.az += (GOAL.az - CAM.az) * k;
    CAM.el += (GOAL.el - CAM.el) * k;
    CAM.zoom += (GOAL.zoom - CAM.zoom) * k;
    CAM.sx += (GOAL.sx - CAM.sx) * k;
    CAM.sy += (GOAL.sy - CAM.sy) * k;
    CAM.open += (GOAL.open - CAM.open) * k;
    CAM.gas += (GOAL.gas - CAM.gas) * k;
    CAM.mon += (GOAL.mon - CAM.mon) * k;
    CAM.print += (GOAL.print - CAM.print) * k;
    CAM.rack += (GOAL.rack - CAM.rack) * k;
    CAM.focus.lerp(GOAL.focus, k);
    applyZoom();
    setOpen(Math.max(CAM.open, P.openMin));
    // a slow breath of a sweep, so a still page is never a still picture
    const sway = REDUCED ? 0
      : Math.sin(now / 1000 * Math.PI * 2 / Math.max(P.swayPeriod, 0.5)) * P.sway * DEG;
    aim(CAM.az + sway, CAM.el);
  }

  /** Camera basis for one azimuth. Same construction as the still renderer. */
  function basis(azRad, elRad) {
    const el = elRad === undefined ? EL : elRad;
    const view = new THREE.Vector3(Math.cos(el) * Math.cos(azRad),
                                   Math.cos(el) * Math.sin(azRad),
                                   Math.sin(el));
    const right = new THREE.Vector3().crossVectors(WORLD_UP, view).normalize();
    const up = new THREE.Vector3().crossVectors(view, right);
    return { view, right, up };
  }

  function aim(azRad, elRad) {
    const b = basis(azRad, elRad);
    ToonMat.setView(b.view);
    for (const gm of glassMats) gm.uniforms.uView.value.copy(b.view);
    for (const lm of liquidMats) lm.uniforms.uView.value.copy(b.view);
    if (typeof bubbleMat !== 'undefined')
      bubbleMat.uniforms.uView.value.copy(b.view);
    FOG.uFogView.value.copy(b.view);
    VIEW_NOW.copy(b.view);
    // foam is painted into the surface shader now, which is in liquidMats
    _tgt.copy(CAM.focus)
        .addScaledVector(b.right, -CAM.sx * (P.mirror ? -1 : 1) * CAM.vw)
        .addScaledVector(b.up, -CAM.sy * CAM.vh);
    camera.position.copy(_tgt).addScaledVector(b.view, 600);
    camera.up.copy(WORLD_UP);
    camera.lookAt(_tgt);
    camera.updateMatrixWorld();
    // glass silhouette ink (SIL): face the camera, sit on the silhouette
    const mmPerPx = (CAM.vh * 2) / BASE.h, ce = Math.cos(elRad === undefined ? EL : elRad);
    for (const sl of SIL) {
      sl.m.quaternion.copy(camera.quaternion);
      sl.m.position.set(b.right.x * sl.r, b.right.y * sl.r, (sl.z0 + sl.z1) / 2);
      sl.m.scale.set(sl.px * mmPerPx, (sl.z1 - sl.z0) * ce, 1);
    }
  }

  /* The ink pass (see POST_FRAG): the scene goes into `target`, one
     triangle over the whole canvas inks it. */
  let postMat = null, postScene = null;
  const postCam = new THREE.Camera();
  const _size = new THREE.Vector2();
  if (POST) {
    postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG,
      depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: target.texture },
        tDepth: { value: target.depthTexture },
        uPx:    { value: new THREE.Vector2(1, 1) },
        uMm:    { value: 1 },
        uRange: { value: camera.far - camera.near },
        uDpr:   { value: DPR },
        uInk:   { value: new THREE.Color(P.inkColor) },
        uFineW: { value: P.inkFine }, uBoldW: { value: P.inkBold },
        uCrease: { value: P.inkCrease }, uStep: { value: P.inkStep },
        uFineGain: { value: P.inkFineGain }, uInkGain: { value: P.ink },
        uGrain: { value: P.grain }, uBoil: { value: P.boil }, uBoilT: { value: 0 },
        uMisreg: { value: P.misreg }, uSat: { value: P.sat }, uCon: { value: P.contrast },
      },
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    const quad = new THREE.Mesh(tri, postMat);
    quad.frustumCulled = false;
    postScene = new THREE.Scene();
    postScene.add(quad);
    renderer.info.autoReset = false;      // so info.render counts the scene, not the pass
  }

  function fit() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    if (POST) {
      renderer.getDrawingBufferSize(_size);
      target.setSize(_size.x, _size.y);
      postMat.uniforms.uPx.value.set(1 / _size.x, 1 / _size.y);
    }

    // Fit across BOTH sweep extremes as well as the centre. Fitting only the
    // current angle would make the reactor swell and clip as it turns.
    const half = SWEEP_DEG / 2 * Math.PI / 180;
    let halfW = 0, halfH = 0;
    for (const d of [-half, 0, half]) {
      const { right, up } = basis(AZ + d);
      let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
      for (const p of corners) {
        const x = p.dot(right), y = p.dot(up);
        mnx = Math.min(mnx, x); mxx = Math.max(mxx, x);
        mny = Math.min(mny, y); mxy = Math.max(mxy, y);
      }
      halfW = Math.max(halfW, (mxx - mnx) / 2);
      halfH = Math.max(halfH, (mxy - mny) / 2);
    }
    const pad = 1.24;   // vessel dominant; the rig crops at the edges
    halfW *= pad; halfH *= pad;

    const aspect = w / h;
    let vh = halfH, vw = halfH * aspect;
    if (vw < halfW) { vw = halfW; vh = halfW / aspect; }
    BASE.vw = vw; BASE.vh = vh; BASE.h = h;
    applyZoom();
  }

  function applyZoom() {
    const vw = BASE.vw / CAM.zoom, vh = BASE.vh / CAM.zoom;
    CAM.vw = vw; CAM.vh = vh;
    camera.left = -vw; camera.right = vw;
    camera.top = vh; camera.bottom = -vh;
    camera.updateProjectionMatrix();

    // constant screen-space outline: mm per pixel under an ortho camera
    const mmPerPx = (vh * 2) / BASE.h;
    for (const o of outlines) o.m.uniforms.uW.value = o.k * mmPerPx;
    fizzMat.uniforms.uScale.value = (1 / mmPerPx) * dprNow * P.fizzSize;
    if (postMat) postMat.uniforms.uMm.value = mmPerPx / dprNow;
  }

  function syncTheme() {
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue('--canvas-bg').trim() || '#f6f8f8';
    renderer.setClearColor(new THREE.Color(bg), 1);
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
  new MutationObserver(syncTheme).observe(document.documentElement,
    { attributes: true, attributeFilter: ['data-theme'] });

  /* Run the gas phase to steady state before the first frame. The mean
     residence is 0.33 s, so ~1.2 s of simulated time is plenty. Without
     this the visitor watches an empty vessel fill for the first three
     seconds of wall clock. */
  for (let i = 0; i < 600; i++) {
    stepBubbles(TIME_SCALE / 60);
    stepTracers(TIME_SCALE / 60, 1 / 60);
    stepFizz(TIME_SCALE / 60);
    stepFoamField(TIME_SCALE / 60);
  }
  // the warm-up aged the tracers by ten seconds; give each a fresh span of
  // life with its trail kept, and clear the droplets it threw
  for (const t of TR) { t.life = 3.5 + Math.random() * 4; t.age = Math.random() * t.life * 0.7; }
  DR.length = 0;
  writeSurface(0); writeRim(0); writeSkirt(0);

  // say the operating point and that the clock, not the physics, is slowed
  const hud = () => {
    document.getElementById('rpm').textContent = WORDS.hud
      .replace('{rpm}', Math.round(P.rpm)).replace('{vvm}', +(+P.vvm).toFixed(2))
      .replace('{x}', +(+P.timeScale).toFixed(2));
  };
  hud();
  ON.rpm = ON.vvm = ON.timeScale = hud;

  /* ---- the rest of the knobs' wiring: things that only exist by now ---- */
  const setLight = () => {
    const az = P.lightAz * DEG, el = P.lightEl * DEG;
    const v = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el));
    ToonMat.setLight(v);
    for (const lm of liquidMats) if (lm.uniforms.uLight) lm.uniforms.uLight.value.copy(v);
    bubbleMat.uniforms.uLight.value.copy(v);
    if (shadowMat) shadowMat.uniforms.uSlip.value.set(v.x / Math.max(v.z, 0.05), v.y / Math.max(v.z, 0.05))
      .multiplyScalar(P.shadowLen);
  };
  ON.lightAz = ON.lightEl = ON.shadowLen = setLight;
  const shadowTone = () => {
    if (!shadowMat || !PAL[MAT_HEX]) return;
    shadowMat.uniforms.uCol.value.copy(PAL[MAT_HEX][0].uniforms.uColor.value).multiplyScalar(1.10 * P.shadowDark);
  };
  ON.shadowDark = shadowTone;
  ON.shadowsOn = (v) => { if (shadowMat) shadowMat.visible = !!v; RACKS.shadows.forEach(function (m) { m.visible = !!v; }); };
  ON.shadowDots = (v) => { if (shadowMat) shadowMat.uniforms.uDark.value = v; };
  ON.shadowDot = (v) => { if (shadowMat) shadowMat.uniforms.uDot.value = v * dprNow; };

  const TG = ToonMat.setGlobal;
  const dots = () => TG('uDotK', P.dotScale * dprNow / DPR);
  ON.dotScale = dots;
  ON.dotDark = (v) => TG('uDotDark', v);
  ON.dotMin = (v) => TG('uDotMin', v);
  ON.dotGrow = (v) => TG('uDotGrow', v);
  ON.dotAngle = (v) => TG('uDotRot', [Math.cos(v * DEG), Math.sin(v * DEG)]);
  ON.shadeCool = (v) => TG('uShadeTint', [1 - 0.06 * v, 1 - 0.04 * v, 1 + 0.05 * v]);
  ON.shadeDepth = (v) => TG('uShadeK', v);
  ON.hiLift = (v) => TG('uHiK', v);
  ON.rim = (v) => TG('uRimK', v);
  ON.spec = (v) => TG('uSpecK', v);
  ON.bandBias = (v) => TG('uBias', v);
  ON.flat = (v) => TG('uFlat', v);
  ON.glassStreak = (v) => TG('uStreakK', v);
  ON.glassAlpha = (v) => TG('uAlphaK', v);

  if (postMat) {
    const U = postMat.uniforms;
    ON.ink = (v) => { U.uInkGain.value = v; };
    ON.inkFine = (v) => { U.uFineW.value = v; };
    ON.inkBold = (v) => { U.uBoldW.value = v; };
    ON.inkCrease = (v) => { U.uCrease.value = v; };
    ON.inkStep = (v) => { U.uStep.value = v; };
    ON.inkFineGain = (v) => { U.uFineGain.value = v; };
    ON.inkColor = (v) => U.uInk.value.set(v);
    ON.grain = (v) => { U.uGrain.value = v; };
    ON.boil = (v) => { U.uBoil.value = v; };
    ON.misreg = (v) => { U.uMisreg.value = v; };
    ON.sat = (v) => { U.uSat.value = v; };
    ON.contrast = (v) => { U.uCon.value = v; };
  }
  ON.dpr = (v) => {
    dprNow = Math.max(0.25, Math.min(4, +v || DPR));
    renderer.setPixelRatio(dprNow);
    if (postMat) postMat.uniforms.uDpr.value = dprNow;
    dots();
    ON.shadowDot(P.shadowDot);
    fit();
  };
  ON.msaa = (v) => { if (target) { target.samples = Math.max(0, Math.round(v)); target.dispose(); } };

  aim(AZ); fit(); syncTheme();
  addEventListener('resize', fit);

  /* Camera shots and part colours, by name. 'shot.<name>.<az|el|zoom|sx|sy>'
     (angles in degrees) and 'shot.<name>.p.<zoom|sx|sy>' for the portrait
     overrides; 'pal.<hex as built>' repaints every part of that colour. */
  const SHOT_NAMES = ['hero', 'broth', 'feed', 'imp', 'rack', 'vent'];
  const ANG = { az: 1, el: 1 };
  const defaults = Object.assign({}, P);
  SHOT_NAMES.forEach(function (n) {
    const sh = SHOTS[n];
    ['az', 'el', 'zoom', 'sx', 'sy'].forEach(function (k) {
      defaults['shot.' + n + '.' + k] = ANG[k] ? sh[k] / DEG : sh[k];
      if (sh.p && sh.p[k] !== undefined) defaults['shot.' + n + '.p.' + k] = ANG[k] ? sh.p[k] / DEG : sh.p[k];
    });
  });
  Object.keys(PAL).forEach(function (hex) { defaults['pal.' + hex] = hex; });
  const relook = () => window.dispatchEvent(new Event('scroll'));   // js/site.js looks again
  function set(key, v) {
    if (key.indexOf('shot.') === 0) {
      const q = key.split('.'), sh = SHOTS[q[1]];
      if (!sh) return;
      const k = q[q.length - 1], val = ANG[k] ? v * DEG : +v;
      if (q[2] === 'p') { sh.p = sh.p || {}; sh.p[k] = val; } else sh[k] = val;
      relook();
      return;
    }
    if (key.indexOf('pal.') === 0) {
      const hex = key.slice(4);
      (PAL[hex] || []).forEach(function (m) { m.uniforms.uColor.value.set(v); });
      if (hex === MAT_HEX) shadowTone();
      return;
    }
    if (!(key in P)) return;
    P[key] = v;
    if (ON[key]) ON[key](v);
  }

  /** Rewrite one of the words drawn in the scene (see WORDS) and draw it again. */
  function say(key, text) {
    if (!(key in WORDS)) return;
    WORDS[key] = text === null || text === undefined ? WORD_DEFAULTS[key] : String(text);
    hud();
    drawCtrlScreen(performance.now() / 1000);
    bottleInks.forEach(function (ink) { ink(); });
    monDrawn = -1;                                   // stepMon draws again on the next frame
    if (gasDrawn >= 0) drawGasChart(gasDrawn);
  }

  window.TANK = { look: look, shots: SHOTS, cam: CAM, goal: GOAL, info: renderer.info, camera: camera,
                  say: say, words: WORDS, wordDefaults: WORD_DEFAULTS,
                  at: { sbox: SBOX, mon: MON, pump: [PX, PY, PZ], vent: VENT, chart: GAS_AT, ventCurve: VENT_CURVE, racks: RACK_AT },
                  print: PRINT, impellers: IMP_KINDS.map(function (k) { return k.name; }),
                  racks: RACKS, rackNames: RACKS.names,
                  set: set, params: P, defaults: defaults, palette: Object.keys(PAL),
                  syncTheme: syncTheme, post: POST, reduced: REDUCED,
                  stats: { ms: 0, fps: 0, bubbles: 0 } };
  document.documentElement.classList.add('has3d');
  document.dispatchEvent(new Event('tank:ready'));

  /* The shaft turns at the true 300 rpm in simulated time; only the clock is
     slowed. Physics and picture therefore stay consistent -- the impeller
     really is doing 300 rpm relative to the fluid it is stirring. */
  const omega = N_REV * Math.PI * 2;
  const halfSweep = SWEEP_DEG / 2 * Math.PI / 180;
  let last = performance.now(), simTime = 0, showTime = 0, ctrlDrawn = last;
  (function frame(now) {
    /* Clamp BOTH ends. A negative frame delta -- clock skew, a tab resuming,
       or a headless virtual clock disagreeing with performance.now() -- puts
       a negative dt into sqrt(2*Dt*dt) in the dispersion term, which yields
       NaN and then poisons every bubble position permanently. */
    const t0 = performance.now();
    const dtReal = Math.max(0, Math.min((now - last) / 1000, 0.05));
    // paused: the camera still follows the scroll, everything else holds
    const dt = P.paused ? 0 : dtReal;
    if (now > last) TANK.stats.fps += (1000 / (now - last) - TANK.stats.fps) * 0.08;
    last = now;
    const dtSim = REDUCED ? 0 : dt * P.timeScale;
    simTime += dtSim;
    // the surface, the swirl and the burst rings run on show time
    showTime += REDUCED ? 0 : dt * P.showRate;
    simTimeRef.t = showTime;
    driveCamera(now, dtReal);
    stepPrint(dt, Math.max(CAM.print, P.printAlways ? 1 : 0));
    rotor.rotation.z += omega * dtSim * stir() * PRINT.spin;
    stepBubbles(dtSim);
    stepDrops(dtSim);
    stepTracers(dtSim, REDUCED ? 0 : dt);
    writeStrokes(VIEW_NOW);
    stepFizz(dtSim);
    stepFoamField(dtSim);
    writeSurface(showTime);
    if (!POST) writeRim(showTime);
    writeSkirt(showTime);
    surfMat.uniforms.uT.value = showTime;
    ToonMat.setTime(simTime);
    bubbleMat.uniforms.uT.value = simTime;
    stepGas(dt, Math.max(CAM.gas, P.gasAlways ? 1 : 0));
    stepMon(dt, Math.max(CAM.mon, P.monAlways ? 1 : 0));
    stepRacks(dt, Math.max(CAM.rack, P.rackAlways ? 1 : 0));
    if (postMat && P.boil > 0) postMat.uniforms.uBoilT.value = Math.floor(now / 1000 * P.boilRate);
    // the controller's readings drift a little, redrawn every 2 s
    if (!REDUCED && now - ctrlDrawn > 2000) { ctrlDrawn = now; drawCtrlScreen(now / 1000); }
    for (const lm of liquidMats) lm.uniforms.uT.value = showTime;
    if (POST) {
      renderer.info.reset();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    } else {
      renderer.render(scene, camera);
    }
    TANK.stats.ms += (performance.now() - t0 - TANK.stats.ms) * 0.08;
    TANK.stats.bubbles = B.length;
    requestAnimationFrame(frame);
  })(last);
}

boot();
