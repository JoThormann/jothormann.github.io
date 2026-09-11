"""
Split svg/drawings.src.svg into the two drawings the page uses, and add the
draw-and-fill motion to the hero.

    python scripts/build-drawings.py

drawings.src.svg is one Inkscape A4 page holding two drawings: the perfusion
train and the labelled vessel. The page needs them separately and at sensible
weights, so each output keeps only its own layers and is cropped by viewBox.

Like the other scripts here, this is a convenience. Both outputs are committed,
so the site deploys whether or not this is ever run.

--- the motion ---------------------------------------------------------------
The hero shows one draw-and-fill cycle: 3/4 of the growth vessel is drawn off
and the same volume appears in the induction vessel. Both vessels are 29 user
units wide, so equal heights mean equal volumes: growth loses 10.65 units of
height and induction gains exactly that.

Levels move on a *timed loop* here, so the file animates correctly when opened
on its own. When it is inlined into index.html, css/site.css re-points those
same animations at a scroll timeline — see "Scroll-linked motion" in the README.
The page override can only ever change the timing, never switch the motion off,
which is what makes it safe.

Impellers, bubbles and the control-line dashes always run on their own clocks:
the rig is meant to look alive whether or not the reader is scrolling.
"""
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "svg", "drawings.src.svg")

ALL = ["layer1", "layer2", "g14", "layer3", "layer5", "layer6",
       "layer4", "layer7", "layer10", "layer8", "layer9"]
TRAIN = ["layer1", "g14", "layer3", "layer5", "layer4", "layer7", "layer9", "layer8"]
VESSEL = ["layer10", "layer8"]

# --- the parts that move, by the ids Inkscape gave them ------------------------
GROWTH_LIQUID = "path39-1-5"        # bbox y 65.0 - 79.2   (h 14.2)
INDUCT_LIQUID = "path39-1-5-7"      # bbox y 58.6 - 81.5   (h 22.9)

GROWTH_BUBBLES = [
    "path107-1", "path107-1-8", "path107-1-8-0", "path107-1-4", "path107-1-8-7",
    "path107-1-8-0-8", "path107-1-0", "path107-1-8-7-3", "path107-1-8-0-8-4",
    "path107-1-5", "path107-1-8-7-2", "path107-1-8-0-8-0", "path107-1-6",
    "path107-1-8-76", "path107-1-4-7", "path107-1-8-7-1", "path107-1-8-0-8-9",
    "path107-1-8-7-2-6", "path107-1-8-0-8-0-2",
]
INDUCT_BUBBLES = [
    "path107-1-0-5", "path107-1-8-0-8-4-1", "path107-1-6-3", "path107-1-8-76-9",
    "path107-1-8-7-1-5", "path107-1-8-0-8-9-9", "path107-1-0-4", "path107-1-8-0-8-4-4",
    "path107-1-6-4", "path107-1-8-76-2", "path107-1-8-7-1-9", "path107-1-8-0-8-9-2",
    "path107-1-0-7", "path107-1-8-0-8-4-8", "path107-1-6-5", "path107-1-8-76-8",
    "path107-1-8-7-1-2", "path107-1-8-0-8-9-4", "path107-1-0-1", "path107-1-8-0-8-4-0",
    "path107-1-6-6", "path107-1-8-76-4", "path107-1-8-7-1-3", "path107-1-8-0-8-9-0",
]

# Impeller blades. Each impeller is four small rects flanking the shaft, so a
# blade squashes toward the shaft rather than about its own middle.
BLADES_LEFT = ["rect49-1", "rect47", "rect49-1-7", "rect47-7", "rect49-1-2",
               "rect47-2", "rect49-1-7-7", "rect47-7-2", "rect49-1-7-7-5", "rect47-7-2-8"]
BLADES_RIGHT = ["rect49", "rect48", "rect49-9", "rect48-2", "rect49-3",
                "rect48-5", "rect49-9-7", "rect48-2-9", "rect49-9-7-2", "rect48-2-9-3"]

CONTROL_LINES = ["rect15", "path30", "path61"]   # weight control / drain control

MOTION_CSS = """
<style>
/* ---- levels: one draw-and-fill cycle -------------------------------------
   3/4 out of growth, the same volume into induction. Both vessels are 29 units
   wide, so equal heights are equal volumes. Timed here; the page re-points
   these at the reader's scroll. */
.lvl{ transform-box: fill-box; transform-origin: 50% 100%; }
#GROWTH{ animation: growthLevel 9s linear infinite alternate; }
#INDUCT{ animation: inductLevel 9s linear infinite alternate; }
#clipGrowthRect{ animation: growthClip 9s linear infinite alternate; }
#clipInductRect{ animation: inductClip 9s linear infinite alternate; }

@keyframes growthLevel{ from{ transform: scaleY(1); } to{ transform: scaleY(.25); } }
@keyframes inductLevel{ from{ transform: scaleY(1); } to{ transform: scaleY(1.46); } }
@keyframes growthClip { from{ y: 64.5; height: 15.5; } to{ y: 75.65; height: 4.35; } }
@keyframes inductClip { from{ y: 58.1; height: 23.9; } to{ y: 47.60; height: 34.4; } }

/* ---- bubbles: always rising, clipped to their own vessel's liquid -------- */
.bub{ transform-box: view-box; animation-name: rise;
      animation-timing-function: linear; animation-iteration-count: infinite; }
@keyframes rise{ from{ transform: translateY(7px); } to{ transform: translateY(-15px); } }

/* ---- impellers: flat blades seen edge-on, four drawn positions ----------- */
.blade{ transform-box: fill-box; vector-effect: non-scaling-stroke;
        animation: blade .9s infinite; }
.blade-l{ transform-origin: 100% 50%; }
.blade-r{ transform-origin: 0% 50%; }
@keyframes blade{
  0%,  24.99% { transform: scaleX(1);   }
  25%, 49.99% { transform: scaleX(.62); }
  50%, 74.99% { transform: scaleX(.26); }
  75%,   100% { transform: scaleX(.62); }
}

/* ---- control lines: dashes march toward what they control --------------- */
.ctrl{ animation: march 1.4s linear infinite; }
@keyframes march{ to{ stroke-dashoffset: -3.7; } }

@media (prefers-reduced-motion: reduce){
  #GROWTH, #INDUCT, #clipGrowthRect, #clipInductRect,
  .bub, .blade, .ctrl { animation: none !important; }
}
</style>
""".replace("GROWTH", GROWTH_LIQUID).replace("INDUCT", INDUCT_LIQUID)

CLIPS = ("""<defs id="motiondefs">
<clipPath id="clipGrowth"><rect id="clipGrowthRect" x="82" y="64.5" width="31" height="15.5"/></clipPath>
<clipPath id="clipInduct"><rect id="clipInductRect" x="138.8" y="58.1" width="31" height="23.9"/></clipPath>
</defs>""")

JOBS = [
    ("perfusion-train.svg", TRAIN, "0.4 9.6 209.3 104.0", "train", "Perfusion train",
     "A draw-and-fill semi-continuous fermentation train: a medium vessel on a balance, a "
     "medium pump feeding a growth bioreactor under weight control, and a drain pump "
     "transferring broth to an induction bioreactor with its own feed bottles.", True),
    ("vessel.svg", VESSEL, "64.4 138.6 84.4 66.4", "vessel", "Instrumented bioreactor",
     "A glass stirred-tank bioreactor in cross-section, labelled: foam probe, pH probe, "
     "impeller, sparger, filter, condenser, temperature probe and DO probe.", False),
]


def drop_layer(text, gid):
    m = re.search(r'<g\b[^>]*?id="%s"[^>]*?(/?)>' % gid, text)
    if not m:
        return text
    if m.group(1) == "/":
        return text[: m.start()] + text[m.end():]
    i, depth = m.end(), 1
    for mm in re.finditer(r'<g\b[^>]*?(/?)>|</g>', text[i:]):
        if mm.group(0) == "</g>":
            depth -= 1
        elif mm.group(1) != "/":
            depth += 1
        if depth == 0:
            return text[: m.start()] + text[i + mm.end():]
    return text


def add_class(text, eid, extra):
    m = re.search(r'<[a-zA-Z]+\b[^>]*?id="%s"[^>]*?/>' % re.escape(eid), text, re.S)
    if not m:
        sys.exit("element id=%s not found — the drawing changed" % eid)
    el = m.group(0)
    if 'class="' in el:
        new = re.sub(r'class="([^"]*)"', lambda z: 'class="%s %s"' % (z.group(1), extra), el, count=1)
    else:
        new = el[:-2] + ' class="%s"/>' % extra
    return text.replace(el, new, 1)


def group_bubbles(text):
    """Move the bubbles into two clipped groups, one per vessel.

    They are siblings in one layer and do not overlap each other, so reordering
    them is safe; it is the only way to clip each vessel's set separately.
    """
    first = text.index('<path', text.index('id="%s"' % GROWTH_BUBBLES[0]) - 400)
    last_id = text.rindex('id="path107')
    last = text.index("/>", last_id) + 2
    span = text[first:last]

    found = re.findall(r'<path\b[^>]*?/>', span, re.S)
    ids = [re.search(r'id="([^"]+)"', p) for p in found]
    if any(i is None or not i.group(1).startswith("path107") for i in ids):
        sys.exit("something other than a bubble sits between the bubbles — aborting")

    by_id = {re.search(r'id="([^"]+)"', p).group(1): p for p in found}
    missing = [b for b in GROWTH_BUBBLES + INDUCT_BUBBLES if b not in by_id]
    if missing:
        sys.exit("bubbles not found: %s" % ", ".join(missing[:5]))

    def wrap(ids_, clip, phase0):
        out = ['<g clip-path="url(#%s)">' % clip]
        for n, bid in enumerate(ids_):
            dur = 4.6 + (n % 5) * 0.7
            delay = -((n * 1.37 + phase0) % dur)
            css = "animation-duration:%.2fs;animation-delay:%.2fs" % (dur, delay)
            el = by_id[bid]
            if 'style="' in el:                      # merge, never add a second style
                el = re.sub(r'style="([^"]*)"', lambda z: 'style="%s;%s"' % (z.group(1).rstrip(';'), css), el, count=1)
                el = el.replace("/>", ' class="bub"/>')
            else:
                el = el.replace("/>", ' class="bub" style="%s"/>' % css)
            out.append(el)
        out.append("</g>")
        return "".join(out)

    return text[:first] + wrap(GROWTH_BUBBLES, "clipGrowth", 0.0) \
                        + wrap(INDUCT_BUBBLES, "clipInduct", 2.1) + text[last:]


def add_motion(text):
    text = group_bubbles(text)
    text = add_class(text, GROWTH_LIQUID, "lvl")
    text = add_class(text, INDUCT_LIQUID, "lvl")
    for b in BLADES_LEFT:
        text = add_class(text, b, "blade blade-l")
    for b in BLADES_RIGHT:
        text = add_class(text, b, "blade blade-r")
    for c in CONTROL_LINES:
        text = add_class(text, c, "ctrl")
    return text


def clean(text, viewbox, tid, title, desc, motion):
    text = re.sub(r'<sodipodi:namedview\b[^>]*?/>', '', text, flags=re.S)
    text = re.sub(r'<sodipodi:namedview\b.*?</sodipodi:namedview>', '', text, flags=re.S)
    text = re.sub(r'<metadata\b[^>]*?/>', '', text, flags=re.S)
    text = re.sub(r'<metadata\b.*?</metadata>', '', text, flags=re.S)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    text = re.sub(r'<\?xml[^>]*\?>\s*', '', text)
    text = re.sub(r'\s(?:inkscape|sodipodi):[\w-]+="[^"]*"', '', text)
    if '<svg:' not in text:
        text = re.sub(r'\sxmlns:svg="[^"]*"', '', text)
    text = re.sub(r'\sxmlns:(?:inkscape|sodipodi)="[^"]*"', '', text)

    def round_nums(m):
        return re.sub(r'-?\d+\.\d{3,}',
                      lambda n: (f"{float(n.group(0)):.2f}".rstrip('0').rstrip('.')) or "0",
                      m.group(0))

    text = re.sub(r'\s(?:d|transform)="[^"]*"', round_nums, text)
    head = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" role="img" '
            'aria-labelledby="%s-t %s-d"><title id="%s-t">%s</title>'
            '<desc id="%s-d">%s</desc>' % (viewbox, tid, tid, tid, title, tid, desc))
    if motion:
        head += CLIPS + MOTION_CSS
    text = re.sub(r'<svg\b[^>]*?>', head, text, count=1)
    text = re.sub(r'>\s+<', '><', text)
    return re.sub(r'[ \t]{2,}', ' ', text).strip()


def main():
    if not os.path.exists(SRC):
        sys.exit("missing %s" % SRC)
    src = open(SRC, encoding="utf-8").read()

    for fname, keep, viewbox, tid, title, desc, motion in JOBS:
        text = src
        for layer in ALL:
            if layer not in keep:
                text = drop_layer(text, layer)
        if motion:
            text = add_motion(text)
        text = clean(text, viewbox, tid, title, desc, motion)
        try:
            ET.fromstring(text)
        except ET.ParseError as exc:
            sys.exit("%s is not well-formed: %s" % (fname, exc))
        out = os.path.join(ROOT, "svg", fname)
        open(out, "w", encoding="utf-8").write(text)
        print("wrote svg/%-22s %3d KB%s" % (fname, os.path.getsize(out) // 1024,
                                            "   (animated)" if motion else ""))


if __name__ == "__main__":
    main()
