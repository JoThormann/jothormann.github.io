"""
Build svg/chain-phone.svg -- the measurement chain re-laid-out as a portrait strip.

    python scripts/chain-phone.py          (run after animate-chain.py)

Why a second file rather than one responsive drawing: viewBox cannot be changed
by a media query, and the two layouts have different aspect ratios (2.9:1
landscape, about 1:3.4 portrait). So the page inlines both and hides one per
breakpoint. Both are generated from the same chain.src.svg, so there is still
only one drawing to maintain.

What this does to the landscape build:

  * every id gets a "-p" suffix, because both SVGs live in one document and a
    duplicate id would silently steal every url(#...) reference on the page
  * the components are kept exactly as drawn and only translated -- a stage is
    a rigid cluster, so nothing is redrawn by hand
  * the connectors are NOT translated but replaced: the vent line, the three
    signal lines and the USB link all run in a different direction here. The
    replacements keep the ch-sig / ch-flow-usb classes so they keep marching.
  * each label (its box and its text) is wrapped in a group and scaled up, so
    a 15px label still reads at about 13px once the whole strip is squeezed
    into a 341px phone column. Scaling the group rather than the font-size
    keeps the box, the text and the line spacing in proportion for free.

The animation CSS is not copied: it is entirely class-based and lives in the
landscape SVG, which is inlined into the same document, so it applies here too.

The stage bounding boxes below are MEASURED, not parsed -- there is no SVG
geometry library here and Inkscape emits paths this script will not evaluate.
Re-measure them by loading svg/chain.svg in a browser and running:

    [...document.querySelector('svg').children].map(e => {
      const b = e.getBBox();
      return [e.id, Math.round(b.x), Math.round(b.y),
                    Math.round(b.width), Math.round(b.height)];
    })

If an id listed here is missing from the source the build fails rather than
quietly dropping a component.
"""
import io
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "svg", "chain.svg")
OUT = os.path.join(ROOT, "svg", "chain-phone.svg")

SUFFIX = "-p"
NL = chr(10)      # no backslash escapes in this file: see README, "Backslashes"

# ---- the portrait column -------------------------------------------------
# 540 user units wide because the laptop is 493 and must not be shrunk: its
# plot is the payoff of the whole figure. Rendered in a 341px phone column
# that is 0.63x, so a 15px label needs scaling by about 1.37 to land at 13px.
W = 540
MARGIN = 14
CX = W / 2.0
LABEL_SCALE = 1.37
GAP_LABEL = 16      # component to its own label
GAP_LINK = 62       # room for a connector between stages
PAD_BOX = 26        # enclosure wall to the components inside it

# name, geometry ids, label ids, measured union bbox of the GEOMETRY (x,y,w,h)
STAGES = [
    ("vessel",
     ["rect9", "rect10", "rect11", "rect12", "rect13", "rect14",
      "path6", "path7", "path8", "path9", "bubbles"],
     [], (29, 187, 245, 439)),
    ("ysplit",
     ["g42", "path113", "path116", "path115", "path114-9", "path115-8", "path114"],
     ["rect98", "text98"], (356, 155, 167, 165)),
    ("o2",
     ["rect43", "rect44", "rect45", "rect47", "rect48", "path48", "path49",
      "text45", "text46", "text47"],
     ["rect104", "text105"], (392, 320, 96, 146)),
    ("co2",
     ["rect49", "rect50", "rect51", "rect52", "path51", "path52"],
     ["rect106", "text107"], (635, 250, 130, 143)),
    ("bme",
     ["rect53", "rect54", "rect55", "rect56", "path56"],
     ["rect99", "text100", "text101"], (866, 258, 68, 69)),
    ("teensy",
     ["g86"],
     ["rect107", "text108"], (614, 495, 197, 85)),
    ("laptop",
     ["rect88", "rect89", "path96", "plotgroup", "polygon96"],
     ["rect108", "text109"], (1079, 209, 493, 363)),
]

# Measured union of each label's box and its text, same method as above.
LABEL_BB = {
    "ysplit": (358, 265, 180, 30),
    "o2":     (390, 352, 100, 35),
    "co2":    (617, 332, 100, 26),
    "bme":    (805, 335, 252, 52),
    "teensy": (556, 589, 280, 26),
    "laptop": (911, 521, 270, 26),   # "USB serial -> timestamped CSV"
}
ENCLOSURE_BB = (622, 115, 164, 26)

# The drawing's own idiom, copied so the new runs match the old ones:
# a gas tube is a black stroke with an ochre one laid over it, a signal is a
# marching dash, and the USB lead is black under grey under a moving dash.
TUBE = [("#000", 11), ("#e3d184", 7.4)]
USB = [("#000000", 10), ("#515151", 5.54506)]

# Inside the 3D-printed enclosure in the original drawing.
IN_ENCLOSURE = {"ysplit", "o2", "co2", "bme", "teensy"}
ENCLOSURE_LABEL = ["rect102", "text103"]

# Landscape-only: the run of the chain, not the things it connects.
DROP = ["rect1", "rect2", "rect3", "g31",
        "polygon31", "polygon32", "polygon33", "polygon34",
        "circle3", "circle4", "circle5", "circle6",
        "path57", "path58", "path59", "path87", "path88", "flowusb"]

SVG_NS = "http://www.w3.org/2000/svg"


def main():
    raw = io.open(SRC, encoding="utf-8").read()
    ET.register_namespace("", SVG_NS)
    root = ET.fromstring(raw)

    kids = {el.get("id"): el for el in root if el.get("id")}

    known = set(DROP) | set(ENCLOSURE_LABEL)
    for _, geom, lbl, _ in STAGES:
        known |= set(geom) | set(lbl)
    missing = [i for i in known if i not in kids]
    if missing:
        sys.exit("these ids are in the layout table but not in chain.svg: %s\n"
                 "re-measure after editing the drawing (see this file's docstring)"
                 % ", ".join(sorted(missing)))

    # Anything neither placed nor explicitly dropped is a component that would
    # vanish without anyone noticing. Refuse instead.
    structural = {"defs111", "namedview111", "style1", "defs", "style",
                  "animdefs"}   # holds brothClip, carried over suffixed
    loose = [i for i in kids
             if i not in known and i not in structural
             and not i.startswith("clip")]
    if loose:
        sys.exit("unplaced elements -- add them to a stage or to DROP: %s"
                 % ", ".join(sorted(loose)))

    geom_bb = {n: bb for n, _, _, bb in STAGES}
    geom_ids = {n: g for n, g, _, _ in STAGES}
    label_ids = {n: l for n, _, l, _ in STAGES}

    out = []          # (transform, [element ids])  in paint order
    cursor = float(MARGIN)

    def put_geom(name, cx=CX, top=None):
        """Translate a stage so its measured bbox lands centred at cx, top at y."""
        x, y, w, h = geom_bb[name]
        t = top if top is not None else cursor
        out.append(("translate(%.2f,%.2f)" % (cx - (x + w / 2.0), t - y),
                    geom_ids[name]))
        return {"cx": cx, "top": t, "bottom": t + h, "w": w, "h": h,
                "left": cx - w / 2.0, "right": cx + w / 2.0}

    def put_label(ids, bb, cx, top, k=LABEL_SCALE):
        """Scale a label about its own centre and drop it in centred at cx.

        Scaling the whole group rather than the font-size keeps the box, the
        text and the line spacing in proportion without re-flowing anything."""
        x, y, w, h = bb
        out.append(("translate(%.2f,%.2f) scale(%.4f) translate(%.2f,%.2f)"
                    % (cx, top + h * k / 2.0, k, -(x + w / 2.0), -(y + h / 2.0)),
                    ids))
        return h * k

    # ---- the strip, top to bottom -------------------------------------
    vessel = put_geom("vessel")
    cursor = vessel["bottom"] + GAP_LINK

    enc_top = cursor
    cursor += PAD_BOX
    put_label(ENCLOSURE_LABEL, ENCLOSURE_BB,
              MARGIN + 6 + ENCLOSURE_BB[2] * LABEL_SCALE / 2.0,
              enc_top - ENCLOSURE_BB[3] * LABEL_SCALE / 2.0)
    cursor += 26

    ysplit = put_geom("ysplit", CX, cursor)
    cursor = ysplit["bottom"] + GAP_LABEL
    cursor += put_label(label_ids["ysplit"], LABEL_BB["ysplit"], CX, cursor)
    cursor += GAP_LINK

    # The splitter feeds the two cells in parallel, so they sit side by side.
    o2_cx = CX - 108
    co2_cx = CX + 108
    row_top = cursor
    o2 = put_geom("o2", o2_cx, row_top)
    co2 = put_geom("co2", co2_cx, row_top)
    # The two outlets meet above the labels and leave as one tube down the
    # gap between them, so no run ever crosses a label.
    row_bottom = max(o2["bottom"], co2["bottom"])
    jog_y = row_bottom + 24
    lab_top = row_bottom + 48
    h1 = put_label(label_ids["o2"], LABEL_BB["o2"], o2_cx, lab_top)
    h2 = put_label(label_ids["co2"], LABEL_BB["co2"], co2_cx, lab_top)
    cursor = lab_top + max(h1, h2) + GAP_LINK

    bme = put_geom("bme", CX, cursor)
    cursor = bme["bottom"] + GAP_LABEL
    cursor += put_label(label_ids["bme"], LABEL_BB["bme"], CX, cursor)
    cursor += GAP_LINK

    teensy = put_geom("teensy", CX, cursor)
    cursor = teensy["bottom"] + GAP_LABEL
    cursor += put_label(label_ids["teensy"], LABEL_BB["teensy"], CX, cursor)

    cursor += PAD_BOX
    enc_bottom = cursor
    cursor += GAP_LINK

    cursor += put_label(label_ids["laptop"], LABEL_BB["laptop"], CX, cursor) + 18
    laptop = put_geom("laptop", CX, cursor)
    cursor = laptop["bottom"] + MARGIN

    total_h = cursor
    marks = {"jog_y": jog_y, "vessel": vessel, "ysplit": ysplit, "o2": o2, "co2": co2,
             "bme": bme, "teensy": teensy, "laptop": laptop,
             "enc_top": enc_top, "enc_bottom": enc_bottom}
    emit(raw, kids, out, marks, total_h)


def tube(d):
    return "".join(
        '<path d="%s" stroke="%s" stroke-width="%s" fill="none" stroke-linecap="butt"/>'
        % (d, col, wid) for col, wid in TUBE)


def usb(d):
    out = "".join('<path d="%s" stroke="%s" stroke-width="%s" fill="none"/>'
                  % (d, col, wid) for col, wid in USB)
    return out + ('<path class="ch-flow-usb" d="%s" fill="none" stroke="#a9aba7" '
                  'stroke-width="2.6" stroke-dasharray="12 18"/>' % d)


def arrow(x, y, size=13):
    """Downward arrowhead, the same solid triangle the landscape run uses."""
    return ('<polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="#000"/>'
            % (x - size, y, x + size, y, x, y + size * 1.9))


def connectors(m):
    """The run of the chain. Not translated from the landscape build: every
    one of these goes in a different direction here, so they are re-authored."""
    cx = CX
    v, ys, o2, co2, bme, tee, lap = (m["vessel"], m["ysplit"], m["o2"],
                                     m["co2"], m["bme"], m["teensy"], m["laptop"])
    p = []

    # vessel headspace -> up, across, down the right, into the enclosure and
    # down to the splitter. The landscape drawing runs the vent over the box
    # and drops into it the same way.
    take_x, take_y = cx + 36.5, v["top"] + 21
    right = W - MARGIN - 22
    bus_y = m["enc_top"] - 30
    p.append(tube("M%.1f %.1f V%.1f H%.1f V%.1f H%.1f V%.1f"
                  % (take_x, take_y, take_y - 26, right, bus_y, cx, ys["top"] - 4)))
    p.append(arrow(cx, ys["top"] - 30))

    # splitter -> the two cells, in parallel
    for cell in (o2, co2):
        p.append(tube("M%.1f %.1f V%.1f H%.1f V%.1f"
                      % (cx, ys["bottom"] + 4, ys["bottom"] + 26,
                         cell["cx"], cell["top"] - 4)))
        p.append(arrow(cell["cx"], cell["top"] - 30))

    # both cells -> one tube, which drops down the clear lane between the two
    # labels to the BME280 that dries the reading
    jog = m["jog_y"]
    for cell in (o2, co2):
        p.append(tube("M%.1f %.1f V%.1f H%.1f"
                      % (cell["cx"], cell["bottom"] + 4, jog, cx)))
    p.append(tube("M%.1f %.1f V%.1f" % (cx, jog, bme["top"] - 4)))
    p.append(arrow(cx, bme["top"] - 30))

    # I2C. Two lanes -- the O2 cell takes the left, because a straight run from
    # it to the right-hand lane would cross the CO2 cell -- and both turn in and
    # drop into the top of the Teensy. Running them into its sides instead drew
    # a dashed rectangle around the BME280 that read as a container.
    right_x = W - MARGIN - 26
    left_x = MARGIN + 26
    turn_y = tee["top"] - 26
    for part in (co2, bme):
        p.append('<path class="ch-sig" d="M%.1f %.1f H%.1f"/>'
                 % (part["right"] + 4, part["top"] + part["h"] / 2.0, right_x))
    p.append('<path class="ch-sig" d="M%.1f %.1f V%.1f H%.1f V%.1f"/>'
             % (right_x, co2["top"] + co2["h"] / 2.0, turn_y,
                cx + 44, tee["top"] - 2))
    p.append('<path class="ch-sig" d="M%.1f %.1f H%.1f V%.1f H%.1f V%.1f"/>'
             % (o2["left"] - 4, o2["top"] + o2["h"] / 2.0, left_x, turn_y,
                cx - 44, tee["top"] - 2))

    # USB out of the box to the laptop
    p.append(usb("M%.1f %.1f V%.1f" % (cx, tee["bottom"] + 4, lap["top"] - 6)))
    return "".join(p)


def emit(raw, kids, out, m, total_h):
    import xml.etree.ElementTree as ET

    def ser(el):
        return ET.tostring(el, encoding="unicode")

    enc = ('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="16" '
           'fill="#eef2f4" class="ch-o"/>'
           % (MARGIN, m["enc_top"], W - 2 * MARGIN, m["enc_bottom"] - m["enc_top"]))

    groups = []
    for transform, ids in out:
        inner = "".join(ser(kids[i]) for i in ids)
        groups.append('<g transform="%s">%s</g>' % (transform, inner))

    defs = ser(kids["animdefs"]) if "animdefs" in kids else ""
    style = ser(kids["style1"]) if "style1" in kids else ""

    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %.0f" '
        'font-family="Helvetica, Arial, sans-serif" '
        'role="img" aria-labelledby="chp-title chp-desc">' % (W, total_h),
        '<title id="chp-title">The measurement chain, vent line to CSV</title>',
        '<desc id="chp-desc">A bioreactor vents into a 3D printed enclosure. '
        'A Y-splitter feeds an oxygen cell and a carbon dioxide cell in parallel, '
        'a BME280 corrects both to dry gas, and a Teensy 4.0 sends all three over '
        'USB to a laptop plotting OUR and CER.</desc>',
        style, defs, enc, connectors(m),
    ] + groups + ["</svg>", ""]
    doc = NL.join(parts)

    # One document, two drawings: an unsuffixed duplicate id silently captures
    # every url(#...) reference on the page. Same failure mode as the class
    # collision that broke the signal lines -- see README.
    #
    # Every id in the subtree, not just the top-level ones: the first version of
    # this suffixed only the children of <svg>, which left brothClip and the
    # whole plot group (polyline92, text93...) colliding with the landscape copy.
    def rename(name):
        return name if name.startswith("chp-") else name + SUFFIX

    doc = re.sub(r'id="([^"]+)"',
                 lambda m: 'id="%s"' % rename(m.group(1)), doc)
    doc = re.sub(r'url\(#([^)]+)\)',
                 lambda m: "url(#%s)" % rename(m.group(1)), doc)
    doc = re.sub(r'href="#([^"]+)"',
                 lambda m: 'href="#%s"' % rename(m.group(1)), doc)

    ET.fromstring(doc)          # refuse to write something that will not parse
    io.open(OUT, "w", encoding="utf-8", newline="").write(doc)
    print("wrote %s  %dx%.0f  (%.1f KB)"
          % (os.path.relpath(OUT, ROOT), W, total_h, os.path.getsize(OUT) / 1024.0))
    print("renders %dpx tall in a 341px phone column"
          % round(total_h * 341.0 / W))


if __name__ == "__main__":
    main()
