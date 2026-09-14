"""
Splice the two animated drawings into index.html.

    python scripts/inline-figures.py

Both figures have to be *inline* SVG rather than <img>, because their motion is
scroll-driven: an SVG inside an <img> is a separate document and cannot see the
page scrolling past it.

This script is a convenience, not a build step. index.html is committed with the
figures already inlined, so the site deploys whether or not this is ever run, and
nothing in CI checks whether the inlined copy is current. Run it after you edit a
drawing; forgetting to run it can never break a deploy.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PAGE = os.path.join(ROOT, "index.html")

FIGURES = {
    "train": os.path.join(ROOT, "svg", "perfusion-train.svg"),
    "chain": os.path.join(ROOT, "svg", "chain.svg"),
    # the same drawing, re-laid-out as a portrait strip for phones
    "chainphone": os.path.join(ROOT, "svg", "chain-phone.svg"),
}


def main():
    html = open(PAGE, encoding="utf-8").read()

    for key, path in FIGURES.items():
        if not os.path.exists(path):
            sys.exit("missing drawing: %s" % path)
        svg = open(path, encoding="utf-8").read().strip()
        svg = re.sub(r"^<\?xml[^>]*\?>\s*", "", svg)

        start, end = "<!-- fig:%s:start -->" % key, "<!-- fig:%s:end -->" % key
        i, j = html.find(start), html.find(end)
        if i < 0 or j < 0:
            sys.exit("markers for %r not found in index.html" % key)

        html = html[: i + len(start)] + "\n" + svg + "\n        " + html[j:]
        print("inlined %-20s %5d KB" % (os.path.basename(path), len(svg) // 1024))

    open(PAGE, "w", encoding="utf-8").write(html)
    print("index.html now %d KB" % (os.path.getsize(PAGE) // 1024))


if __name__ == "__main__":
    main()
