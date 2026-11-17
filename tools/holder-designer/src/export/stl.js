// Binary STL writer. STL has no units; slicers read these numbers as mm.
export function stlBuffer({ positions, indices }, title = 'impeller') {
  const tris = indices.length / 3;
  const buf = new ArrayBuffer(84 + tris * 50);
  const view = new DataView(buf);
  const head = new TextEncoder().encode(title.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(head);
  view.setUint32(80, tris, true);

  let o = 84;
  for (let t = 0; t < tris; t++) {
    const a = indices[t * 3] * 3;
    const b = indices[t * 3 + 1] * 3;
    const c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    view.setFloat32(o, nx, true);
    view.setFloat32(o + 4, ny, true);
    view.setFloat32(o + 8, nz, true);
    o += 12;
    for (const i of [a, b, c]) {
      view.setFloat32(o, positions[i], true);
      view.setFloat32(o + 4, positions[i + 1], true);
      view.setFloat32(o + 8, positions[i + 2], true);
      o += 12;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}
