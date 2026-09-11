"""
Split svg/drawings.src.svg into the two drawings the page uses.

    python scripts/build-drawings.py

drawings.src.svg is one Inkscape A4 page holding two drawings: the perfusion
train and the labelled vessel. The page needs them separately and at sensible
weights, so each output keeps only its own layers and is cropped by viewBox.

Like the other script here, this is a convenience. Both outputs are committed,
so the site deploys whether or not this is ever run.

Neither output is animated. See README, "The hero is static".
"""
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "svg", "drawings.src.svg")

# Which Inkscape layers belong to which drawing. "lablels" (sic) carries the
# labels for both, so each output keeps it and lets its viewBox do the cropping.
ALL = ["layer1", "layer2", "g14", "layer3", "layer5", "layer6",
       "layer4", "layer7", "layer10", "layer8", "layer9"]
TRAIN = ["layer1", "g14", "layer3", "layer5", "layer4", "layer7", "layer9", "layer8"]
VESSEL = ["layer10", "layer8"]

JOBS = [
    ("perfusion-train.svg", TRAIN, "0.4 9.6 209.3 104.0", "train", "Perfusion train",
     "A draw-and-fill semi-continuous fermentation train: a medium vessel on a balance, a "
     "medium pump feeding a growth bioreactor under weight control, and a drain pump "
     "transferring broth to an induction bioreactor with its own feed bottles."),
    ("vessel.svg", VESSEL, "64.4 138.6 84.4 66.4", "vessel", "Instrumented bioreactor",
     "A glass stirred-tank bioreactor in cross-section, labelled: foam probe, pH probe, "
     "impeller, sparger, filter, condenser, temperature probe and DO probe."),
]


def drop_layer(text, gid):
    """Remove a top-level <g id=gid> and everything inside it."""
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


def clean(text, viewbox, tid, title, desc):
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
    text = re.sub(r'<svg\b[^>]*?>', head, text, count=1)
    text = re.sub(r'>\s+<', '><', text)
    return re.sub(r'[ \t]{2,}', ' ', text).strip()


def main():
    if not os.path.exists(SRC):
        sys.exit("missing %s" % SRC)
    src = open(SRC, encoding="utf-8").read()

    for fname, keep, viewbox, tid, title, desc in JOBS:
        text = src
        for layer in ALL:
            if layer not in keep:
                text = drop_layer(text, layer)
        text = clean(text, viewbox, tid, title, desc)
        try:
            ET.fromstring(text)
        except ET.ParseError as exc:
            sys.exit("%s is not well-formed: %s" % (fname, exc))
        out = os.path.join(ROOT, "svg", fname)
        open(out, "w", encoding="utf-8").write(text)
        print("wrote svg/%-22s %3d KB" % (fname, os.path.getsize(out) // 1024))


if __name__ == "__main__":
    main()
