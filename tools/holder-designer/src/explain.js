// Section pictures for the explainers (the "?" next to a setting): a cut through the holder as
// it is designed now, drawn to scale, with the distances that matter measured out. The tube
// drops in (CSS, styles.css "explainer"). No DOM: each returns an SVG string.

const f1 = (v) => String(Number(v.toFixed(1)));

// Arrow heads for dimension lines; `k` = the setting being explained, in the accent colour.
const DEFS = `<defs>
  <marker id="xa" viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="mk" d="M0.5,1 L7.5,4 L0.5,7z"/></marker>
  <marker id="xk" viewBox="0 0 8 8" refX="7.2" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="mk k" d="M0.5,1 L7.5,4 L0.5,7z"/></marker>
  <pattern id="xh" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hb" width="5" height="5"/><line class="hl" x1="0" y1="0" x2="0" y2="5"/></pattern>
</defs>`;

/** Vertical dimension from y1 to y2 at x, its label to the `side`. */
function dimV(x, y1, y2, label, key = false, side = 'left') {
  const m = key ? 'xk' : 'xa';
  const tx = side === 'left' ? x - 6 : x + 6;
  return `<g class="dim${key ? ' k' : ''}"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" marker-start="url(#${m})" marker-end="url(#${m})"/>` +
    `<text x="${tx}" y="${(y1 + y2) / 2}" text-anchor="${side === 'left' ? 'end' : 'start'}" dominant-baseline="middle">${label}</text></g>`;
}
/** Horizontal dimension from x1 to x2 at y, its label below. */
function dimH(y, x1, x2, label, key = false) {
  const m = key ? 'xk' : 'xa';
  return `<g class="dim${key ? ' k' : ''}"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" marker-start="url(#${m})" marker-end="url(#${m})"/>` +
    `<text x="${(x1 + x2) / 2}" y="${y + 13}" text-anchor="middle">${label}</text></g>`;
}
/** A note with a thin leader line to a point. */
const note = (x, y, tx, ty, text, anchor = 'start') =>
  `<g class="note"><line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}"/><circle cx="${x}" cy="${y}" r="2"/>` +
  `<text x="${tx + (anchor === 'start' ? 4 : -4)}" y="${ty}" text-anchor="${anchor}" dominant-baseline="middle">${text}</text></g>`;
const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** The tube's outline as drawn in the 3D view: a cone to a tip of a quarter radius, a cap on top. */
function tubeOutline(v, cx, rest, X, Y, cut = Infinity) {
  const rb = v.body / 2;
  if (v.shape === 'square') {
    const t = Math.min(rest + v.length, cut);
    return [[cx - rb, rest], [cx + rb, rest], [cx + rb, t], [cx - rb, t]].map(([x, z]) => [X(x), Y(z)]);
  }
  const rt = Math.max(v.top / 2, rb);
  const cap = Math.min(8, v.length * 0.15);
  const tip = v.cone ? rb * 0.25 : rb;
  const right = [[tip, rest], [rb, rest + (v.cone || 0.01)]];
  if (rest + v.length - cap < cut) right.push([rb, rest + v.length - cap], [rt, rest + v.length - cap], [rt, rest + v.length]);
  else right.push([rb, cut]);
  const side = right.filter(([, z]) => z <= cut + 1e-6);
  return [...side.map(([x, z]) => [X(cx + x), Y(z)]), ...side.reverse().map(([x, z]) => [X(cx - x), Y(z)])];
}

/**
 * Block or tray: a cut through the first two holes of a row, from the left edge to the middle
 * of the next wall. Measured: hole depth (the setting), floor, height, what shows above, the
 * wall between holes and the border.
 */
export function depthPicture(r, key = 'depth') {
  const W = 400;
  const H = 270;
  const M = r.marginX;
  const h = r.hole;
  const g = r.gapX;
  const fh = r.footH || 0;
  const seat = r.height - r.depth;
  const c = r.chamferC || 0;
  const span = M + h + g + h + g / 2;
  const top = Math.max(fh + r.height, fh + seat + r.v.length);
  // Room on the left for the depth and floor labels, on the right for the height.
  const x0 = 128;
  const s = Math.min((W - x0 - 96) / span, (H - 52) / top);
  const X = (x) => x0 + x * s;
  const Y = (z) => H - 34 - z * s;

  // The material, with a zigzag where the cut ends on the right; the holes are cut out of it.
  const zig = [];
  for (let k = 0; k <= 6; k++) zig.push([X(span) + (k % 2 ? 4 : -2), Y(fh + (r.height * k) / 6)]);
  let mat = `M${X(0)},${Y(fh)} ${zig.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${X(0)},${Y(fh + r.height)} Z`;
  const holes = [0, 1].map((i) => M + i * (h + g));
  for (const a of holes) {
    const hole = [[a, fh + seat], [a + h, fh + seat], [a + h, fh + r.height - c], [a + h + c, fh + r.height], [a - c, fh + r.height], [a, fh + r.height - c]];
    mat += ` M${pts(hole.map(([x, z]) => [X(x), Y(z)]))} Z`;
  }
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Cut through the holder: holes ${f1(r.depth)} mm deep, a ${f1(seat)} mm floor, ${f1(g)} mm walls between holes and a ${f1(M)} mm border.">${DEFS}`;
  svg += `<path class="mat" fill-rule="evenodd" d="${mat}"/>`;
  if (fh > 0) svg += `<rect class="mat" x="${X(1)}" y="${Y(fh)}" width="${6 * s}" height="${fh * s}"/>`;
  svg += `<line class="table" x1="20" x2="${W - 20}" y1="${Y(0)}" y2="${Y(0)}"/>`;

  // The tubes, dropping in.
  const drop = Math.min(60, Y(0) * 0.35);
  svg += `<g class="drop" style="--drop:${drop.toFixed(0)}px">` +
    holes.map((a) => `<polygon class="tube" points="${pts(tubeOutline(r.v, a + h / 2, fh + seat, X, Y))}"/>`).join('') + '</g>';

  // Left: hole depth (the setting) on top of the floor. Right: height, then what shows above.
  svg += dimV(X(0) - 14, Y(fh + seat), Y(fh + r.height), `Hole depth ${f1(r.depth)} mm`, key === 'depth');
  svg += dimV(X(0) - 14, Y(fh), Y(fh + seat), `Floor ${f1(seat)} mm`, key === 'floor');
  const xr = X(span) + 16;
  svg += dimV(xr, Y(0), Y(fh + r.height), `Height ${f1(r.height + fh)} mm`, key === 'height', 'right');
  if (r.stickOut > 0.5) svg += dimV(xr, Y(fh + r.height), Y(fh + seat + r.v.length), `Shows ${f1(r.stickOut)} mm`, false, 'right');
  // Below: the border and the wall between the holes.
  svg += dimH(Y(0) + 12, X(0), X(M), `Border ${f1(M)}`);
  svg += dimH(Y(0) + 12, X(M + h), X(M + h + g), `Wall ${f1(g)} mm`);
  return svg + '</svg>';
}

/**
 * Single stand: two cuts through the sleeve's axis, without and with the cone ribs. Without,
 * the tube drops onto its point and wobbles; with, it lands on the ribs and stands straight,
 * its tip 2 mm above the floor. `on` = which one is the current setting.
 */
export function conePicture(r, on) {
  const W = 400;
  const H = 290;
  const v = r.v;
  const rb = v.body / 2;
  const Rs = r.sleeveR;
  const bore = r.hole / 2;
  const reach = Rs + 7;
  const tabR = r.tabR ?? rb * 0.55;
  const seatZ = r.seatZ ?? r.baseT + 2 + (v.cone * 0.3) / 0.75;
  const rest = r.baseT + 2;
  const zTop = Math.min(r.height, seatZ + 24);
  const s = Math.min((W / 2 - 24) / (2 * reach), (H - 70) / (zTop + 8));
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Two cuts through the sleeve: without ribs the tube stands on its point; with ribs it rests on its cone, its tip 2 mm above the floor.">${DEFS}`;

  const panel = (px, withRibs) => {
    const cx = px + W / 4;
    const X = (x) => cx + x * s;
    const Y = (z) => H - 40 - z * s;
    let out = '';
    if (withRibs === on) out += `<rect class="mine" x="${px + 6}" y="6" width="${W / 2 - 12}" height="${H - 12}" rx="10"/><text class="minet" x="${px + W / 4}" y="${H - 12}" text-anchor="middle">Your setting</text>`;
    out += `<text class="ptitle" x="${cx}" y="24" text-anchor="middle">${withRibs ? 'With ribs' : 'Without ribs'}</text>`;
    // Base (with the push-out hole), the collar and the two walls of the sleeve.
    const hole = r.pushD ? r.pushD / 2 : 0;
    const parts = [];
    parts.push([[-reach, 0], [-hole, 0], [-hole, r.baseT], [-reach, r.baseT]]);
    parts.push([[hole, 0], [reach, 0], [reach, r.baseT], [hole, r.baseT]]);
    for (const sx of [-1, 1]) {
      parts.push([[sx * bore, r.baseT - 0.01], [sx * Rs, r.baseT - 0.01], [sx * Rs, zTop], [sx * bore, zTop]]);
      if (r.collar > 0.3) parts.push([[sx * Rs, r.baseT - 0.01], [sx * (Rs + r.collar), r.baseT - 0.01], [sx * Rs, r.baseT + r.collar]]);
      if (withRibs) {
        const low = Math.max(r.baseT + 0.1, seatZ - 0.8 - (bore - tabR));
        parts.push([[sx * tabR, seatZ], [sx * bore, seatZ], [sx * bore, low], [sx * tabR, seatZ - 0.8]]);
      }
    }
    // The tube, behind the cut material as in a section drawing: dropping in; without ribs it
    // lands on its point and rocks.
    const z0 = withRibs ? rest : r.baseT;
    const tipY = Y(z0);
    out += `<g class="drop" style="--drop:${(Y(0) * 0.32).toFixed(0)}px"><g class="${withRibs ? '' : 'rock'}" style="transform-origin:${cx}px ${tipY}px">` +
      `<polygon class="tube" points="${pts(tubeOutline(v, 0, z0, X, Y, zTop + 6))}"/></g></g>`;
    out += parts.map((p) => `<polygon class="mat" points="${pts(p.map(([x, z]) => [X(x), Y(z)]))}"/>`).join('');
    out += `<line class="table" x1="${px + 14}" x2="${px + W / 2 - 14}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    // Break marks where the sleeve is cut off at the top.
    for (const sx of [-1, 1]) out += `<path class="brk" d="M${X(sx * bore) - 2},${Y(zTop) + 3} l${(Rs - bore) * s * 0.5 + 2},-6 l${(Rs - bore) * s * 0.5 + 2},6"/>`;

    if (withRibs) {
      out += note(X(-(tabR + bore) / 2), Y(seatZ - 0.5), px + 12, Y(seatZ + 10), 'Rib');
      out += note(X(0), Y(rest - 1), X(Rs + 2.5), Y(r.baseT + 9.5), `Tip ${f1(rest - r.baseT)} mm up`);
      out += dimH(Y(zTop - 5), X(bore), X(Rs), `Wall ${f1(Rs - bore)}`);
      out += dimV(X(reach) - 6, Y(0), Y(r.baseT), `Base ${f1(r.baseT)}`, false, 'left');
    } else {
      out += note(X(0), Y(r.baseT + 0.5), X(Rs + 2.5), Y(r.baseT + 9.5), 'On its point');
    }
    return out;
  };
  svg += panel(0, false) + panel(W / 2, true);
  return svg + '</svg>';
}
