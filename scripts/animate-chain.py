"""
Turn svg/chain.src.svg (the Inkscape drawing) into svg/chain.svg (the animated one).

Run this after editing the drawing in Inkscape:

    python scripts/animate-chain.py

Nothing else in the project depends on it — svg/chain.svg is committed, so the site
builds and deploys without ever running this.
"""
import os
import re
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "svg", "chain.src.svg")
OUT = os.path.join(ROOT, "svg", "chain.svg")

# The broth outline, used to clip the rising bubbles so they never leave the vessel.
BROTH = ("M 64.207969,337.3864 H 239.08615 v 217.41471 a 18.40823,15.529622 0 0 1 "
         "-18.40823,15.52962 H 82.616198 A 18.40823,15.529622 0 0 1 64.207969,554.80111 Z")

IMPELLERS = ["rect13", "rect14"]
BUBBLES = ["circle14", "circle15", "circle16", "circle17", "circle18"]
CURVES = ["polyline92", "polyline93"]

OUR = ("M1200,478 L1237,472 L1273,459 L1309,439 L1340,414 L1367,386 L1392,364 "
       "L1413,352 L1431,349 L1449,355 L1468,377 L1486,408 L1504,433")
CER = ("M1200,479 L1237,473 L1273,461 L1309,441 L1340,416 L1367,386 L1392,361 "
       "L1413,346 L1431,336 L1449,338 L1468,355 L1486,383 L1504,408")
PLOT_MATRIX = "matrix(1.0895121,0,0,1.3347733,-140.87984,-191.65269)"

CSS = """
/* ---------------- motion ----------------
   Timed loops. A scroll-driven version was written and then removed: it needs
   animation-duration:auto, which collapses to zero if the timeline fails to
   resolve, so an unverified enhancement can silently stop the figure dead.
   See README, "Scroll-linked motion". */

.ch-sig      { animation: ch-march 1.15s linear infinite; }
.ch-flow-usb { animation: ch-march-usb 1.9s linear infinite; }
.ch-imp      { transform-box: fill-box; transform-origin: 50% 50%;
            vector-effect: non-scaling-stroke; animation: ch-blade .8s infinite; }
.ch-bub      { transform-box: view-box; animation-name: ch-rise;
            animation-timing-function: linear; animation-iteration-count: infinite; }
.ch-b1 { animation-duration: 5.4s; animation-delay: -0.0s; }
.ch-b2 { animation-duration: 6.1s; animation-delay: -2.3s; }
.ch-b3 { animation-duration: 4.8s; animation-delay: -3.6s; }
.ch-b4 { animation-duration: 6.6s; animation-delay: -1.2s; }
.ch-b5 { animation-duration: 5.0s; animation-delay: -4.1s; }
.ch-curve    { stroke-dasharray: 392; stroke-dashoffset: 392;
            animation: ch-draw 9s linear infinite; }

@keyframes ch-march     { to { stroke-dashoffset: -14; } }
@keyframes ch-march-usb { to { stroke-dashoffset: -30; } }
@keyframes ch-blade {
  0%,  24.99% { transform: scaleX(1);   }
  25%, 49.99% { transform: scaleX(.62); }
  50%, 74.99% { transform: scaleX(.30); }
  75%,   100% { transform: scaleX(.62); }
}
@keyframes ch-rise { 0% { transform: translateY(150px); } 100% { transform: translateY(-150px); } }
@keyframes ch-draw { 0% { stroke-dashoffset: 392; } 78%, 100% { stroke-dashoffset: 0; } }


@media (prefers-reduced-motion: reduce) {
  .ch-sig, .ch-flow-usb, .ch-imp, .ch-bub, .ch-curve { animation: none !important; }
  .ch-curve { stroke-dasharray: none; stroke-dashoffset: 0; }
  .ch-flow-usb, .ch-probe { display: none; }
}
"""


# Classes authored in chain.src.svg. An inlined SVG shares one CSS scope with the
# page, and names like .o, .t and .lbl are far too generic to leave loose, so the
# whole set is prefixed here: the stylesheet rules and the class attributes
# together. Renaming only one of the two silently strips the elements' styling.
SOURCE_CLASSES = ["o", "oth", "ohair", "lead", "lbl", "t", "tm", "ts", "tp",
                  "sig", "hi", "hir"]


def namespace_source_classes(svg):
    for name in sorted(SOURCE_CLASSES, key=len, reverse=True):
        svg = re.sub(r"\.%s(?=[\s,{])" % re.escape(name), ".ch-" + name, svg)

    def remap(m):
        tokens = m.group(1).split()
        out = ["ch-" + t if t in SOURCE_CLASSES else t for t in tokens]
        return 'class="%s"' % " ".join(out)

    svg = re.sub(r'class="([^"]*)"', remap, svg)

    # Checked here, while the stylesheet is still only the source's: if a rule
    # was renamed in Inkscape, its elements would keep a class with no rule
    # behind it and lose their styling silently. That once left the signal lines
    # with no stroke, no dash pattern and fill:none gone.
    block = re.search(r"<style[^>]*>(.*?)</style>", svg, re.S)
    defined = set(re.findall(r"\.([A-Za-z][\w-]*)\s*[,{]", block.group(1))) if block else set()
    lost = sorted(n for n in SOURCE_CLASSES if ("ch-" + n) not in defined)
    if lost:
        sys.exit("source classes have no rule after namespacing: %s "
                 "(renamed in chain.src.svg? update SOURCE_CLASSES)" % ", ".join(lost))
    return svg


def add_class(svg, element_id, extra):
    m = re.search(r'<[a-zA-Z]+\b[^>]*?id="%s"[^>]*?/>' % re.escape(element_id), svg, re.S)
    if not m:
        sys.exit("could not find element id=%s in %s" % (element_id, SRC))
    el = m.group(0)
    if 'class="' in el:
        new = re.sub(r'class="([^"]*)"', lambda z: 'class="%s %s"' % (z.group(1), extra), el, count=1)
    else:
        new = el[:-2] + ' class="%s"/>' % extra
    return svg.replace(el, new, 1)


def main():
    svg = open(SRC, encoding="utf-8").read()
    svg = namespace_source_classes(svg)

    svg = svg.replace("</style>", CSS + "</style>", 1)
    svg = svg.replace(
        "<defs",
        '<defs id="animdefs"><clipPath id="brothClip"><path d="%s"/></clipPath></defs>\n  <defs' % BROTH,
        1,
    )

    for eid in IMPELLERS:
        svg = add_class(svg, eid, "ch-imp")
    for i, eid in enumerate(BUBBLES, start=1):
        svg = add_class(svg, eid, "ch-bub ch-b%d" % i)
    for eid in CURVES:
        svg = add_class(svg, eid, "ch-curve")

    # wrap the bubbles in one clipped group
    i = svg.index('id="%s"' % BUBBLES[0])
    i = svg.rindex("<ellipse", 0, i)
    j = svg.index('id="%s"' % BUBBLES[-1])
    j = svg.index("/>", j) + 2
    svg = svg[:i] + '<g clip-path="url(#brothClip)" id="bubbles">\n  ' + svg[i:j] + "\n  </g>" + svg[j:]

    # a marching overlay on the USB cable, so the data direction reads
    m = re.search(r'<path[^>]*id="path88"[^>]*/>', svg, re.S)
    svg = svg[: m.end()] + (
        '\n  <path class="ch-flow-usb" d="m 811,537 h 250" fill="none" stroke="#a9aba7" '
        'stroke-width="2.6" stroke-dasharray="12 18" id="flowusb"/>'
    ) + svg[m.end():]

    # leading probe dots on the two traces
    dots = """
  <g transform="{mat}" class="ch-probe" id="probes">
    <circle r="4" cx="0" cy="0" fill="#345ecc" stroke="#fff" stroke-width="1.2">
      <animateMotion dur="9s" repeatCount="indefinite" calcMode="linear"
                     keyPoints="0;1;1" keyTimes="0;0.78;1" path="{our}"/>
    </circle>
    <circle r="4" cx="0" cy="0" fill="#c8781e" stroke="#fff" stroke-width="1.2">
      <animateMotion dur="9s" repeatCount="indefinite" calcMode="linear"
                     keyPoints="0;1;1" keyTimes="0;0.78;1" path="{cer}"/>
    </circle>
  </g>
""".format(mat=PLOT_MATRIX, our=OUR, cer=CER)
    m = re.search(r'<polyline[^>]*id="%s"[^>]*/>' % CURVES[1], svg, re.S)
    svg = svg[: m.end()] + dots + svg[m.end():]

    try:
        ET.fromstring(svg)
    except ET.ParseError as exc:
        sys.exit("generated SVG is not well-formed: %s" % exc)

    # Everything must end up namespaced, and nothing may use a rule that
    # does not exist.
    block = re.search(r"<style[^>]*>(.*?)</style>", svg, re.S)
    defined = set(re.findall(r"\.([A-Za-z][\w-]*)\s*[,{]", block.group(1))) if block else set()
    used = set(t for attr in re.findall(r'class="([^"]*)"', svg) for t in attr.split())
    loose = sorted(c for c in used if not c.startswith("ch-"))
    if loose:
        sys.exit("classes not namespaced: %s" % ", ".join(loose))
    orphan = sorted(used - defined)
    if orphan:
        sys.exit("classes used but never defined: %s" % ", ".join(orphan))

    open(OUT, "w", encoding="utf-8").write(svg)
    print("wrote %s (%d KB)" % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) // 1024))


if __name__ == "__main__":
    main()
