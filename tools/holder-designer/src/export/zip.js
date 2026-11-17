// Minimal ZIP: writes uncompressed archives, reads stored or deflated entries.
// Enough for 3MF, which is a ZIP of a few XML files.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

/** @param files [{ name, data: string | Uint8Array }] */
export function zipStore(files) {
  const entries = files.map((f) => {
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    return { name: enc.encode(f.name), data, crc: crc32(data) };
  });
  let size = 22;
  for (const e of entries) size += 30 + e.name.length + e.data.length + 46 + e.name.length;

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  const DATE = 0x5821; // 2024-01-01, fixed so equal designs give equal files
  let o = 0;

  for (const e of entries) {
    e.offset = o;
    view.setUint32(o, 0x04034b50, true);
    view.setUint16(o + 4, 20, true);
    view.setUint16(o + 6, 0x0800, true); // UTF-8 names
    view.setUint16(o + 8, 0, true); // stored
    view.setUint16(o + 10, 0, true);
    view.setUint16(o + 12, DATE, true);
    view.setUint32(o + 14, e.crc, true);
    view.setUint32(o + 18, e.data.length, true);
    view.setUint32(o + 22, e.data.length, true);
    view.setUint16(o + 26, e.name.length, true);
    view.setUint16(o + 28, 0, true);
    out.set(e.name, o + 30);
    out.set(e.data, o + 30 + e.name.length);
    o += 30 + e.name.length + e.data.length;
  }

  const dirStart = o;
  for (const e of entries) {
    view.setUint32(o, 0x02014b50, true);
    view.setUint16(o + 4, 20, true);
    view.setUint16(o + 6, 20, true);
    view.setUint16(o + 8, 0x0800, true);
    view.setUint16(o + 10, 0, true);
    view.setUint16(o + 12, 0, true);
    view.setUint16(o + 14, DATE, true);
    view.setUint32(o + 16, e.crc, true);
    view.setUint32(o + 20, e.data.length, true);
    view.setUint32(o + 24, e.data.length, true);
    view.setUint16(o + 28, e.name.length, true);
    view.setUint32(o + 42, e.offset, true);
    out.set(e.name, o + 46);
    o += 46 + e.name.length;
  }

  view.setUint32(o, 0x06054b50, true);
  view.setUint16(o + 8, entries.length, true);
  view.setUint16(o + 10, entries.length, true);
  view.setUint32(o + 12, o - dirStart, true);
  view.setUint32(o + 16, dirStart, true);
  return out;
}

/** Reads one entry by name. Resolves to a Uint8Array, or null if absent. */
export async function zipRead(buffer, wanted) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Not a ZIP file');
  const count = view.getUint16(end + 10, true);
  let o = view.getUint32(end + 16, true);
  const dec = new TextDecoder();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(o, true) !== 0x02014b50) throw new Error('Damaged ZIP file');
    const method = view.getUint16(o + 10, true);
    const packed = view.getUint32(o + 20, true);
    const nameLen = view.getUint16(o + 28, true);
    const extraLen = view.getUint16(o + 30, true);
    const commentLen = view.getUint16(o + 32, true);
    const local = view.getUint32(o + 42, true);
    const name = dec.decode(bytes.subarray(o + 46, o + 46 + nameLen));
    o += 46 + nameLen + extraLen + commentLen;
    if (name !== wanted) continue;

    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + packed);
    if (method === 0) return data.slice();
    if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    throw new Error('Unsupported ZIP compression');
  }
  return null;
}
