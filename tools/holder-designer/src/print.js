// What a print orientation costs: how much surface hangs in the air, how tall
// the print is and how much of it touches the bed. Pure functions on mesh arrays.

/**
 * @param mesh { positions, indices }
 * @param axis which model axis points up on the printer: 2 = as modelled (openings up), 1 = lying on a long side
 * @param overhangDeg faces flatter than this from horizontal, facing down, count as overhang (45° is the usual FDM limit)
 * @returns areas in mm²: `overhang` (needs support or bridging), `flat` (the level part of it), `contact` (on the bed);
 *          `flags` marks the overhanging triangles; `height` is the print height
 */
export function analyse({ positions, indices }, axis = 2, overhangDeg = 45) {
  const tris = indices.length / 3;
  const flags = new Uint8Array(tris);
  const limit = Math.cos((overhangDeg * Math.PI) / 180) + 1e-6;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = axis; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i]);
    hi = Math.max(hi, positions[i]);
  }
  let overhang = 0;
  let flat = 0;
  let contact = 0;
  for (let t = 0; t < tris; t++) {
    const a = indices[t * 3] * 3;
    const b = indices[t * 3 + 1] * 3;
    const c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (!len) continue;
    const area = len / 2;
    const down = -n[axis] / len; // 1 = facing straight down
    if (down <= limit) continue;
    const onBed = Math.abs(positions[a + axis] - lo) < 0.02 && Math.abs(positions[b + axis] - lo) < 0.02 && Math.abs(positions[c + axis] - lo) < 0.02;
    if (onBed) {
      contact += area;
      continue;
    }
    flags[t] = 1;
    overhang += area;
    if (down > 0.985) flat += area;
  }
  return { flags, overhang, flat, contact, height: hi - lo };
}
