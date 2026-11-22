// The holder as one watertight solid. No DOM. Origin at the centre of the
// footprint, z = 0 on the table, x across (columns), y deep (rows).

/** Centres of all openings, row by row. */
export function positions(r) {
  const out = [];
  for (let j = 0; j < r.rows; j++) {
    for (let i = 0; i < r.cols; i++) out.push([i * r.pitchX - r.spanX / 2, j * r.pitchY - r.spanY / 2]);
  }
  return out;
}

/** A box with rounded vertical edges, standing on z = 0. */
function slab(M, keep, sx, sy, h, rad, segments) {
  if (rad < 0.2) return keep(keep(M.cube([sx, sy, h], true)).translate([0, 0, h / 2]));
  const parts = [
    keep(keep(M.cube([sx - 2 * rad, sy, h], true)).translate([0, 0, h / 2])),
    keep(keep(M.cube([sx, sy - 2 * rad, h], true)).translate([0, 0, h / 2])),
  ];
  const post = keep(M.cylinder(h, rad, rad, segments, false));
  for (const [x, y] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    parts.push(keep(post.translate([x * (sx / 2 - rad), y * (sy / 2 - rad), 0])));
  }
  return keep(M.union(parts));
}

/** A closed solid from vertices and triangles, turned right side out if it was built inside out. */
function closed(kernel, keep, verts, tris) {
  let vol = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t] * 3, tris[t + 1] * 3, tris[t + 2] * 3];
    vol += verts[a] * (verts[b + 1] * verts[c + 2] - verts[b + 2] * verts[c + 1]) -
      verts[a + 1] * (verts[b] * verts[c + 2] - verts[b + 2] * verts[c]) +
      verts[a + 2] * (verts[b] * verts[c + 1] - verts[b + 1] * verts[c]);
  }
  if (vol < 0) for (let t = 0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]];
  return keep(new kernel.Manifold(new kernel.Mesh({ numProp: 3, vertProperties: verts, triVerts: new Uint32Array(tris) })));
}

/**
 * The outer shape with a 45° bevel of size c on its top and bottom edges: a
 * box with rounded vertical edges whose first and last c millimetres taper in.
 */
function bevelled(kernel, keep, sx, sy, h, rad, c, segments) {
  const arc = Math.max(4, Math.round(segments / 4));
  const ring = (inset, z) => {
    const r = Math.max(Math.max(rad, 0.02) - inset, 0.01);
    const out = [];
    [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]].forEach(([qx, qy, start]) => {
      const cx = qx * (sx / 2 - inset - r);
      const cy = qy * (sy / 2 - inset - r);
      for (let i = 0; i <= arc; i++) {
        const a = ((start + (90 * i) / arc) * Math.PI) / 180;
        out.push(cx + r * Math.cos(a), cy + r * Math.sin(a), z);
      }
    });
    return out;
  };
  const rings = [ring(c, 0), ring(0, c), ring(0, h - c), ring(c, h)];
  const n = rings[0].length / 3;
  const verts = new Float32Array(rings.flat());
  const tris = [];
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const b = k * n + ((i + 1) % n);
      tris.push(a, b, b + n, a, b + n, a + n);
    }
  }
  const top = (rings.length - 1) * n;
  for (let i = 1; i < n - 1; i++) {
    tris.push(0, i + 1, i);
    tris.push(top, top + i, top + i + 1);
  }
  return closed(kernel, keep, verts, tris);
}

/**
 * The pointed part of a teardrop hole: a round hole of radius `rad` along z
 * gets a 45° roof on its +y side, cut off at 1.25 radii so the point does not
 * run far into the wall. Printed with +y up, the hole then needs no bridging.
 */
function teardropTip(M, keep, rad, h, cut = 1.25 * rad) {
  // A four-sided cylinder of circumradius rad * sqrt(2) is a diamond whose sides touch the round hole
  // at 45°, at height rad / sqrt(2). Only the part above those two points is the roof: below them the
  // diamond's sides run outside the circle and would leave a straight step on each side of the hole.
  const diamond = keep(M.cylinder(h, rad * Math.SQRT2, rad * Math.SQRT2, 4, false));
  const touch = rad / Math.SQRT2 - 0.01;
  const upper = keep(keep(M.cube([2 * rad, cut - touch, h + 2], false)).translate([-rad, touch, -1]));
  return keep(diamond.intersect(upper));
}

/**
 * The funnel at the mouth of a teardrop opening: the teardrop widened by 45°,
 * from the plain outline at z = 0 to one grown by c at z = c. Growing the round
 * part, the roof and the cut-off all by c keeps the funnel the same shape as
 * the hole, so the point gets its own sloped lead-in instead of notching a round one.
 */
function teardropFunnel(M, keep, rad, c, segments) {
  // Two thin slices: the plain outline just below z = 0, the grown one just above z = c. Both
  // outlines are convex, so their hull slopes at exactly 45° between z = 0 and z = c; the slivers
  // outside that range lie inside the hole below or in the air above.
  const t = 0.01;
  const ring = (grow, z) => {
    const r = rad + grow;
    return [
      keep(keep(M.cylinder(t, r, r, segments, false)).translate([0, 0, z])),
      keep(teardropTip(M, keep, r, t, 1.25 * rad + grow).translate([0, 0, z])),
    ];
  };
  return keep(M.hull([...ring(0, -t), ...ring(c, c)]));
}

/**
 * One opening as a cutting tool, its mouth at z = top: a straight shaft from
 * `bottom` up through the top, with a funnel at the mouth.
 */
function opening(M, keep, r, bottom, top, segments) {
  const square = r.v.shape === 'square';
  // A four-sided "cylinder" is a square prism standing on a corner; turned 45° it lines up with the grid.
  const prism = (h, sLow, sHigh) =>
    square
      ? keep(keep(M.cylinder(h, sLow / Math.SQRT2, sHigh / Math.SQRT2, 4, false)).rotate([0, 0, 45]))
      : keep(M.cylinder(h, sLow / 2, sHigh / 2, segments, false));
  const parts = [keep(prism(top + 1 - bottom, r.hole, r.hole).translate([0, 0, bottom]))];
  if (r.tearOpenings) parts.push(keep(teardropTip(M, keep, r.hole / 2, top + 1 - bottom).translate([0, 0, bottom])));
  const c = r.chamferC;
  if (c > 0.05) {
    parts.push(r.tearOpenings
      ? keep(teardropFunnel(M, keep, r.hole / 2, c, segments).translate([0, 0, top - c]))
      : keep(prism(c + 0.01, r.hole, r.hole + 2 * c + 0.02).translate([0, 0, top - c])));
  }
  return keep(M.union(parts));
}

/** All openings as one cutting tool. */
function openings(M, keep, r, bottom, top, segments) {
  const one = opening(M, keep, r, bottom, top, segments);
  return keep(M.union(positions(r).map(([x, y]) => keep(one.translate([x, y, 0])))));
}

/**
 * A solid from a convex outline in the x-z plane, pushed through from y0 to y1.
 * Used for the peaked roof of the windows.
 */
function prism(kernel, keep, outline, y0, y1) {
  const n = outline.length;
  const verts = new Float32Array(n * 6);
  outline.forEach(([x, z], i) => {
    verts.set([x, y0, z], i * 3);
    verts.set([x, y1, z], (n + i) * 3);
  });
  const tris = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tris.push(i, j, n + j, i, n + j, n + i);
  }
  for (let i = 1; i < n - 1; i++) {
    tris.push(0, i + 1, i);
    tris.push(n, n + i, n + i + 1);
  }
  // Flip if the outline was given the other way round, so the solid is never inside out.
  let vol = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t] * 3, tris[t + 1] * 3, tris[t + 2] * 3];
    vol += verts[a] * (verts[b + 1] * verts[c + 2] - verts[b + 2] * verts[c + 1]) -
      verts[a + 1] * (verts[b] * verts[c + 2] - verts[b + 2] * verts[c]) +
      verts[a + 2] * (verts[b] * verts[c + 1] - verts[b + 1] * verts[c]);
  }
  if (vol < 0) for (let t = 0; t < tris.length; t += 3) [tris[t + 1], tris[t + 2]] = [tris[t + 2], tris[t + 1]];
  return keep(new kernel.Manifold(new kernel.Mesh({ numProp: 3, vertProperties: verts, triVerts: new Uint32Array(tris) })));
}

/** Windows, feet and pockets, added to or cut from the finished body. */
function extras(kernel, keep, r, body, segments) {
  const M = kernel.Manifold;
  const H = r.height;
  const add = [];
  const cut = [];

  if (r.hasWindows) {
    // Printed upright, a flat window top would bridge; a 45° peak carries itself.
    const peak = r.peakWindows ? Math.min(r.windowW / 2, r.windowHi - r.windowLo - 1) : 0;
    const straight = r.windowHi - peak - r.windowLo;
    // Front only: the slot runs from the front face to the middle of the back row, so the back wall stays closed.
    const y0 = -r.sizeY / 2 - 1;
    const y1 = r.slotFrontOnly ? r.spanY / 2 : r.sizeY / 2 + 1;
    let slot = keep(keep(M.cube([r.windowW, y1 - y0, straight], false)).translate([-r.windowW / 2, y0, r.windowLo]));
    if (peak > 0) {
      const z = r.windowHi - peak;
      const roof = prism(kernel, keep, [[-r.windowW / 2, z - 0.01], [r.windowW / 2, z - 0.01], [0, z + peak]], y0, y1);
      slot = keep(M.union([slot, roof]));
    }
    for (let i = 0; i < r.cols; i++) cut.push(keep(slot.translate([i * r.pitchX - r.spanX / 2, 0, 0])));
  }

  const corners = (inset) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => [sx * (r.sizeX / 2 - inset), sy * (r.sizeY / 2 - inset)]);
  if (r.feet === 'stack') {
    const foot = keep(keep(M.cylinder(r.footH + 0.5, r.footD / 2, r.footD / 2, 32, false)).translate([0, 0, -r.footH]));
    const pocket = keep(keep(M.cylinder(r.footH + 1.4, r.footD / 2 + 0.4, r.footD / 2 + 0.4, 32, false)).translate([0, 0, H - r.footH - 0.4]));
    for (const [x, y] of corners(r.footInset)) {
      add.push(keep(foot.translate([x, y, 0])));
      cut.push(keep(pocket.translate([x, y, 0])));
    }
  }
  if (r.feet === 'pads') {
    const recess = keep(keep(M.cylinder(2.2, r.padD / 2 + 0.25, r.padD / 2 + 0.25, 48, false)).translate([0, 0, -1]));
    for (const [x, y] of corners(r.padInset)) cut.push(keep(recess.translate([x, y, 0])));
  }

  let out = body;
  if (add.length) out = keep(M.union([out, ...add]));
  if (cut.length) out = keep(out.subtract(keep(M.union(cut))));
  // Feet lift everything, so the finished holder still stands on z = 0.
  return out.translate([0, 0, r.footH]);
}

/** A concave fillet of radius f along y, sitting in the corner at x = 0, z = 0, opening toward +x and +z. */
function filletPiece(M, keep, f, len) {
  const e = 0.02;
  const bar = keep(keep(M.cube([f + e, len, f + e], false)).translate([-e, -len / 2, -e]));
  const round = keep(keep(keep(M.cylinder(len + 2, f, f, 48, true)).rotate([90, 0, 0])).translate([f, 0, f]));
  return keep(bar.subtract(round));
}

// Stroke font for position numbers: centre lines on a 2 x 4 grid, read from the front.
const DIGITS = {
  0: [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]]],
  1: [[[0.4, 3.2], [1.2, 4], [1.2, 0]]],
  2: [[[0, 4], [2, 4], [2, 2], [0, 2], [0, 0], [2, 0]]],
  3: [[[0, 4], [2, 4], [2, 0], [0, 0]], [[0.6, 2], [2, 2]]],
  4: [[[0, 4], [0, 2], [2, 2]], [[2, 4], [2, 0]]],
  5: [[[2, 4], [0, 4], [0, 2], [2, 2], [2, 0], [0, 0]]],
  6: [[[2, 4], [0, 4], [0, 0], [2, 0], [2, 2], [0, 2]]],
  7: [[[0, 4], [2, 4], [0.8, 0]]],
  8: [[[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]], [[0, 2], [2, 2]]],
  9: [[[2, 2], [0, 2], [0, 4], [2, 4], [2, 0], [0, 0]]],
  // For fit values on the test strip: a dot is one unit wide, the rest two.
  '+': [[[0, 2], [2, 2]], [[1, 1], [1, 3]]],
  '-': [[[0, 2], [2, 2]]],
  '.': [[[0.5, 0], [0.5, 0.02]]],
};

/**
 * Text as a cutting tool in a top face (z = zTop, `depth` deep), read from the front: centred on
 * cx, cy, `h` tall, strokes `w` wide. A dot takes half the room of the other glyphs.
 */
function textCutTop(M, keep, text, cx, cy, h, w, zTop, depth) {
  const u = h / 4;
  const adv = (ch) => (ch === '.' ? 1 : 2) * u;
  const width = [...text].reduce((s, ch) => s + adv(ch), 0) + 0.9 * u * (text.length - 1);
  let x0 = cx - width / 2;
  const y0 = cy - h / 2;
  const bars = [];
  for (const ch of text) {
    for (const line of DIGITS[ch]) {
      for (let k = 0; k < line.length - 1; k++) {
        const [ax, ay] = [x0 + line[k][0] * u, y0 + line[k][1] * u];
        const [bx, by] = [x0 + line[k + 1][0] * u, y0 + line[k + 1][1] * u];
        const len = Math.hypot(bx - ax, by - ay);
        const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
        bars.push(keep(keep(keep(M.cube([len + w, w, depth + 0.5], true)).rotate([0, 0, deg]))
          .translate([(ax + bx) / 2, (ay + by) / 2, zTop - (depth - 0.5) / 2])));
      }
    }
    x0 += adv(ch) + 0.9 * u;
  }
  return keep(M.union(bars));
}

/**
 * A number as a cutting tool in the front face (y = yFace, cutting toward +y by `depth`),
 * centred on x = cx, z = cz, `h` tall, strokes `w` wide.
 */
function numberCut(M, keep, text, cx, cz, h, w, yFace, depth) {
  const u = h / 4;
  const width = text.length * 2 * u + (text.length - 1) * 0.9 * u;
  const strokes = [];
  [...text].forEach((ch, i) => {
    const x0 = cx - width / 2 + i * 2.9 * u;
    const z0 = cz - h / 2;
    for (const line of DIGITS[ch]) {
      for (let k = 0; k < line.length - 1; k++) {
        const [ax, az] = [x0 + line[k][0] * u, z0 + line[k][1] * u];
        const [bx, bz] = [x0 + line[k + 1][0] * u, z0 + line[k + 1][1] * u];
        const len = Math.hypot(bx - ax, bz - az);
        const deg = (Math.atan2(bz - az, bx - ax) * 180) / Math.PI;
        // Square ends, w longer than the stroke, so neighbouring strokes meet without a gap.
        const bar = keep(keep(keep(M.cube([len + w, depth + 0.5, w], true)).rotate([0, -deg, 0]))
          .translate([(ax + bx) / 2, yFace + (depth - 0.5) / 2, (az + bz) / 2]));
        strokes.push(bar);
      }
    }
  });
  return keep(M.union(strokes));
}

/**
 * The single stand: a sleeve on a spoked ring or a disc, a 45° collar at the joint, slots that
 * turn the sleeve into springy fingers, ribs inside that catch a conical tube, and a push-out hole.
 */
function singleStand(kernel, keep, r, segments) {
  const M = kernel.Manifold;
  const H = r.height;
  const bT = r.baseT;
  const Rs = r.sleeveR;
  const Rb = r.baseD / 2;
  const seg = Math.max(segments, 48);
  const cyl = (h, r1, r2 = r1, z = 0) => keep(keep(M.cylinder(h, r1, r2, seg, false)).translate([0, 0, z]));

  const parts = [];
  if (r.baseRing) {
    parts.push(keep(cyl(bT, Rb).subtract(cyl(bT + 2, Rb - r.ringW, Rb - r.ringW, -1))), cyl(bT, r.hubR));
    const spoke = keep(keep(M.cube([Rb - r.ringW / 2, r.spokeW, bT], false)).translate([0, -r.spokeW / 2, 0]));
    for (let k = 0; k < 4; k++) parts.push(keep(spoke.rotate([0, 0, 45 + 90 * k])));
  } else {
    parts.push(cyl(bT, Rb));
  }
  if (r.collar > 0.3) parts.push(cyl(r.collar, Rs + r.collar, Rs, bT - 0.01));
  parts.push(cyl(H, Rs));
  let body = keep(M.union(parts));
  body = keep(body.subtract(opening(M, keep, r, bT, H, segments)));

  if (r.slots) {
    const slot = keep(keep(M.cube([Rs + 2, r.slotW, H - r.slotLo + 1], false)).translate([0, -r.slotW / 2, r.slotLo]));
    const cuts = [];
    for (let k = 0; k < r.slots; k++) cuts.push(keep(slot.rotate([0, 0, (k * 360) / r.slots])));
    body = keep(body.subtract(keep(M.union(cuts))));
  }

  if (r.coneTabs) {
    // Ribs from the wall in to tabR, flat on top at seatZ, a 45° underside that prints without support.
    // They sit in the middle of the fingers (every other finger with six), clear of the slots.
    const rin = r.hole / 2 + 0.4;
    const z1 = r.seatZ;
    const low = Math.max(0.1, z1 - 0.8 - (rin - r.tabR));
    const tw = Math.max(1.6, 4 * r.nozzle);
    const rib = prism(kernel, keep, [[r.tabR, z1], [rin, z1], [rin, low], [r.tabR, z1 - 0.8]], -tw / 2, tw / 2);
    const n = r.slots || 4;
    const step = n > 4 ? 2 : 1;
    const ribs = [];
    for (let k = 0; k < n; k += step) ribs.push(keep(rib.rotate([0, 0, (k * 360) / n + 180 / n])));
    body = keep(M.union([body, ...ribs]));
  }
  if (r.pushD > 0) body = keep(body.subtract(cyl(bT + 2, r.pushD / 2, r.pushD / 2, -1)));
  return body;
}

/**
 * @param kernel loaded Manifold module
 * @param r resolved, validated design (params.js resolve)
 * @param segments facets per full circle
 * @returns a Manifold; the caller must call .delete() on it
 */
export function buildHolder(kernel, r, segments = 64) {
  const M = kernel.Manifold;
  const bin = [];
  const keep = (m) => {
    bin.push(m);
    return m;
  };
  try {
    const H = r.height;
    if (r.style === 'single') return singleStand(kernel, keep, r, segments).translate([0, 0, 0]);
    const outline = r.edgeC > 0.05
      ? bevelled(kernel, keep, r.sizeX, r.sizeY, H, r.cornerR, r.edgeC, segments)
      : slab(M, keep, r.sizeX, r.sizeY, H, r.cornerR, segments);

    if (r.style !== 'stand') {
      return extras(kernel, keep, r, keep(outline.subtract(openings(M, keep, r, H - r.depth, H, segments))), segments);
    }

    // Stand: a top plate with the openings, two end walls, optionally a bottom
    // plate to stand the vessels on and a guide plate half-way down.
    const plate = (z) => keep(keep(M.cube([r.sizeX, r.sizeY, r.plateT], true)).translate([0, 0, z + r.plateT / 2]));
    const parts = [plate(H - r.plateT)];
    for (const side of [-1, 1]) {
      parts.push(keep(keep(M.cube([r.wallT, r.sizeY, H], true)).translate([side * (r.sizeX / 2 - r.wallT / 2), 0, H / 2])));
    }
    if (r.standFloor) parts.push(plate(0));
    const guideZ = Math.round((H - r.plateT) / 2);
    if (r.guide) parts.push(plate(guideZ));
    // Dividers: inner walls in the middle of the gap after every n-th column.
    for (const x of r.divXs) parts.push(keep(keep(M.cube([r.wallT, r.sizeY, H], true)).translate([x, 0, H / 2])));

    // Concave fillets along each joint of a plate with a wall. The top joint at the end walls follows
    // the rounded frame corner when there is one, so the bend keeps its thickness.
    const joints = [[H - r.plateT, -1]];
    if (r.standFloor) joints.push([r.plateT, 1]);
    if (r.guide) joints.push([guideZ, -1], [guideZ + r.plateT, 1]);
    const pieces = new Map();
    const piece = (f, dir) => {
      const key = f + '/' + dir;
      if (!pieces.has(key)) {
        const up = filletPiece(M, keep, f, r.sizeY);
        pieces.set(key, dir > 0 ? up : keep(up.mirror([0, 0, 1])));
      }
      return pieces.get(key);
    };
    const xw = r.sizeX / 2 - r.wallT;
    for (const [z, dir] of joints) {
      const f = z === H - r.plateT && dir < 0 ? r.topFilletR : r.filletR;
      if (f > 0.2) {
        const pc = piece(f, dir);
        parts.push(keep(pc.translate([-xw, 0, z])), keep(keep(pc.mirror([1, 0, 0])).translate([xw, 0, z])));
      }
      if (r.divFilletR > 0.2) {
        const pc = piece(r.divFilletR, dir);
        for (const x of r.divXs) {
          parts.push(keep(pc.translate([x + r.wallT / 2, 0, z])), keep(keep(pc.mirror([1, 0, 0])).translate([x - r.wallT / 2, 0, z])));
        }
      }
    }

    // Number pads: discs standing on the front edge of the bottom plate, flush with the front face.
    const at = positions(r).slice(0, r.cols).map(([x]) => x);
    if (r.labelsOn && r.labelT >= 1.2) {
      const disc = keep(keep(keep(M.cylinder(r.labelT, r.labelD / 2, r.labelD / 2, 48, false)).rotate([90, 0, 0]))
        .translate([0, -r.sizeY / 2 + r.labelT, r.labelD / 2]));
      for (const x of at) parts.push(keep(disc.translate([x, 0, 0])));
    }
    let frame = keep(keep(M.union(parts)).intersect(outline));
    if (r.frameRC > 0.2) {
      // Round the two top corners seen from the front: keep only what lies inside a rounded profile.
      const R = r.frameRC;
      const X = r.sizeX / 2 - R;
      const len = r.sizeY + 2;
      const profile = keep(M.union([
        keep(keep(M.cube([r.sizeX + 2, len, H - R + 1], false)).translate([-r.sizeX / 2 - 1, -len / 2, -1])),
        keep(keep(M.cube([2 * X, len, H + 1], false)).translate([-X, -len / 2, -1])),
        ...[-1, 1].map((sx) => keep(keep(keep(M.cylinder(len, R, R, Math.max(segments, 64), true)).rotate([90, 0, 0])).translate([sx * X, 0, H - R]))),
      ]));
      frame = keep(frame.intersect(profile));
    }
    if (r.labelsOn && r.labelT >= 1.2 && r.labels === 'digits' && r.digitH >= 2) {
      const depth = Math.min(0.6, r.labelT - 0.6);
      const cuts = at.map((x, i) => numberCut(M, keep, String(i + 1), x, r.labelD / 2, r.digitH, r.digitW, -r.sizeY / 2, depth));
      frame = keep(frame.subtract(keep(M.union(cuts))));
    }
    return extras(kernel, keep, r, keep(frame.subtract(openings(M, keep, r, r.standFloor ? r.plateT + 0.01 : -1, H, segments))), segments);
  } finally {
    for (const m of bin) m.delete();
  }
}

/**
 * The separate base plate of a stand (r.basePlate): a flat plate reaching out in front and behind
 * by plateReach and plateRim at the ends, with a pocket the stand's footprint drops into
 * (plateFit all round, plate's floor under it). Flat on z = 0, centred; the caller deletes it.
 */
export function buildBasePlate(kernel, r, segments = 64) {
  const M = kernel.Manifold;
  const bin = [];
  const keep = (m) => {
    bin.push(m);
    return m;
  };
  try {
    const X = r.sizeX + 2 * r.plateRim;
    const Y = r.sizeY + 2 * r.plateReach;
    const T = r.basePlateT;
    const rad = Math.min(r.cornerR + r.plateRim, X / 2 - 0.1, Y / 2 - 0.1);
    const c = Math.min(r.edgeC, 1);
    const plate = c > 0.05 ? bevelled(kernel, keep, X, Y, T, rad, c, segments) : slab(M, keep, X, Y, T, rad, segments);
    const f = r.plateFit;
    const pocket = keep(slab(M, keep, r.sizeX + 2 * f, r.sizeY + 2 * f, r.pocket + 1, Math.max(0.2, r.cornerR + f), segments).translate([0, 0, T - r.pocket]));
    return plate.subtract(pocket);
  } finally {
    for (const m of bin) m.delete();
  }
}

/**
 * The hole fit test strip (params.js fitTest): a bar with five through-holes of the holder's own
 * kind, its fit value cut into the top in front of each, the current one underlined.
 * @param t fitTest(params); r the resolved design (for the vessel and the hole shape)
 */
export function buildFitTest(kernel, t, r, segments = 64) {
  const M = kernel.Manifold;
  const bin = [];
  const keep = (m) => {
    bin.push(m);
    return m;
  };
  try {
    const bar = bevelled(kernel, keep, t.sizeX, t.sizeY, t.H, 2, 0.6, segments);
    const cuts = t.holes.map((hole, i) =>
      keep(opening(M, keep, { ...r, hole, chamferC: t.chamferC, tearOpenings: t.tear }, -1, t.H, segments).translate([t.xs[i], t.holeY, 0])));
    const depth = 0.6;
    t.labels.forEach((text, i) => cuts.push(textCutTop(M, keep, text, t.xs[i], t.labelY[i], t.digitH, t.digitW, t.H, depth)));
    // The current fit, underlined.
    const line = Math.min(t.pitch - 2, t.digitH * 2.2);
    cuts.push(keep(keep(M.cube([line, t.digitW, depth + 0.5], true)).translate([t.xs[2], t.labelY[2] - t.digitH / 2 - 0.9, t.H - (depth - 0.5) / 2])));
    return bar.subtract(keep(M.union(cuts)));
  } finally {
    for (const m of bin) m.delete();
  }
}

/** Two meshes as one (no boolean: they may touch); `shift` moves the second. */
export function mergeMeshes(a, b, shift = [0, 0, 0]) {
  const positions = new Float32Array(a.positions.length + b.positions.length);
  positions.set(a.positions);
  for (let i = 0; i < b.positions.length; i++) positions[a.positions.length + i] = b.positions[i] + shift[i % 3];
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices);
  const n = a.positions.length / 3;
  for (let i = 0; i < b.indices.length; i++) indices[a.indices.length + i] = b.indices[i] + n;
  return { positions, indices };
}

/** A mesh moved by `shift`. */
export function moveMesh(m, shift) {
  const positions = new Float32Array(m.positions.length);
  for (let i = 0; i < positions.length; i++) positions[i] = m.positions[i] + shift[i % 3];
  return { positions, indices: m.indices };
}

export function toMesh(solid) {
  const mesh = solid.getMesh();
  const n = mesh.numProp;
  let pos = mesh.vertProperties;
  if (n !== 3) {
    const count = pos.length / n;
    const packed = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) packed.set(pos.subarray(i * n, i * n + 3), i * 3);
    pos = packed;
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(mesh.triVerts) };
}

export const solidVolume = (s) => (typeof s.volume === 'function' ? s.volume() : s.getProperties().volume);
export const solidArea = (s) => (typeof s.surfaceArea === 'function' ? s.surfaceArea() : s.getProperties().surfaceArea);
