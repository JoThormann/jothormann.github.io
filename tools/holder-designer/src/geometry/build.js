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
function teardropTip(M, keep, rad, h) {
  // A four-sided cylinder of circumradius rad * sqrt(2) is a diamond whose sides touch the round hole.
  const diamond = keep(M.cylinder(h, rad * Math.SQRT2, rad * Math.SQRT2, 4, false));
  const upper = keep(keep(M.cube([2 * rad, 1.25 * rad, h + 2], false)).translate([-rad, 0, -1]));
  return keep(diamond.intersect(upper));
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
  if (r.chamfer > 0.05) {
    const c = Math.min(r.chamfer, (top - bottom) * 0.8);
    parts.push(keep(prism(c + 0.01, r.hole, r.hole + 2 * c + 0.02).translate([0, 0, top - c])));
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
 * Used for the grip lips, whose sloped underside prints without support.
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

/** Handles, windows, feet and pockets, added to or cut from the finished body. */
function extras(kernel, keep, r, body, segments) {
  const M = kernel.Manifold;
  const H = r.height;
  const add = [];
  const cut = [];

  if (r.hasWindows) {
    // Printed upright, a flat window top would bridge; a 45° peak carries itself.
    const peak = r.peakWindows ? Math.min(r.windowW / 2, r.windowHi - r.windowLo - 1) : 0;
    const straight = r.windowHi - peak - r.windowLo;
    let slot = keep(keep(M.cube([r.windowW, r.sizeY + 2, straight], true)).translate([0, 0, r.windowLo + straight / 2]));
    if (peak > 0) {
      const z = r.windowHi - peak;
      const roof = prism(kernel, keep, [[-r.windowW / 2, z - 0.01], [r.windowW / 2, z - 0.01], [0, z + (peak * r.windowW) / (2 * peak) * (2 * peak / r.windowW)]], -r.sizeY / 2 - 1, r.sizeY / 2 + 1);
      slot = keep(M.union([slot, roof]));
    }
    for (let i = 0; i < r.cols; i++) cut.push(keep(slot.translate([i * r.pitchX - r.spanX / 2, 0, 0])));
  }

  const flatY = r.sizeY / 2 - r.cornerR; // the straight part of each end
  if (r.handles === 'lip' && flatY > 1) {
    // A flat grip at the top with a 45° underside.
    const t = 3;
    const x0 = r.sizeX / 2 - 0.5;
    const x1 = r.sizeX / 2 + r.handleLen;
    const lip = prism(kernel, keep, [[x0, H], [x1, H], [x1, H - t], [x0, Math.max(0, H - t - (x1 - x0))]], -flatY, flatY);
    add.push(lip, keep(lip.mirror([1, 0, 0])));
  }
  if (r.handles === 'loop' && flatY > 1) {
    // A ring lying along the depth of the holder, sunk 2 mm into each end.
    const len = 2 * flatY;
    const holeR = r.loopR - 3.2;
    let hole = keep(M.cylinder(len + 2, holeR, holeR, segments, true));
    // Printed upright the loop's hole lies on its side: give it a teardrop point (it ends up facing +z after the turn below).
    if (r.tearLoops) hole = keep(M.union([hole, keep(teardropTip(M, keep, holeR, len + 2).translate([0, 0, -(len + 2) / 2]))]));
    const ring = keep(keep(M.cylinder(len, r.loopR, r.loopR, segments, true)).subtract(hole));
    const placed = keep(keep(ring.rotate([90, 0, 0])).translate([r.sizeX / 2 + r.loopR - 2, 0, Math.max(H - r.loopR, r.loopR)]));
    add.push(placed, keep(placed.mirror([1, 0, 0])));
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
    if (r.filletR > 0.2) {
      // A concave fillet along each joint of a plate with an end wall: a square bar with a round bar cut out of it.
      const f = r.filletR;
      const e = 0.02;
      const bar = keep(keep(M.cube([f + e, r.sizeY, f + e], false)).translate([-e, -r.sizeY / 2, -e]));
      const round = keep(keep(keep(M.cylinder(r.sizeY + 2, f, f, 48, true)).rotate([90, 0, 0])).translate([f, 0, f]));
      const piece = keep(bar.subtract(round)); // sits in the corner at x = 0, z = 0, opening toward +x and +z
      const xw = r.sizeX / 2 - r.wallT;
      const joints = [[H - r.plateT, -1]];
      if (r.standFloor) joints.push([r.plateT, 1]);
      if (r.guide) joints.push([guideZ, -1], [guideZ + r.plateT, 1]);
      for (const [z, dir] of joints) {
        const up = dir > 0 ? piece : keep(piece.mirror([0, 0, 1]));
        parts.push(keep(up.translate([-xw, 0, z])), keep(keep(up.mirror([1, 0, 0])).translate([xw, 0, z])));
      }
    }
    const frame = keep(keep(M.union(parts)).intersect(outline));
    return extras(kernel, keep, r, keep(frame.subtract(openings(M, keep, r, r.standFloor ? r.plateT + 0.01 : -1, H, segments))), segments);
  } finally {
    for (const m of bin) m.delete();
  }
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
