"""
Shoot the page at a series of scroll positions and assemble a contact sheet.

    python scripts/scroll-sweep.py [--width 1440] [--height 900] [--shots 12]

Why this exists: a scroll page has no single state, and the two obvious
failures are both invisible to a normal screenshot.

1. A full-page screenshot uses a viewport as tall as the page, so every `vh`
   unit explodes. The hero's 220vh scroller became 15,400px the first time it
   was shot that way.
2. Sticky elements only reveal themselves in motion. A still of the top of the
   page cannot show whether a chapter head sticks, releases, or is covered.

So this shoots a real 1440x900 viewport at N scroll offsets, which is the only
way to see either. It needs a local server running; it does not start one.

Writes lab/sweep/NN.png plus lab/sweep/sheet.png.
"""
import argparse
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

# Scrolling with JS and then screenshotting does not work: headless Chrome
# under --virtual-time-budget captures without repainting after a scripted
# scroll, and returns a blank frame while the DOM is demonstrably correct.
# Anchors are scrolled natively during load, before first paint, so they
# capture properly. One invisible marker per offset.
MARKERS = """
<style>.sweep-y{position:absolute;left:0;width:1px;height:1px;pointer-events:none}</style>
%s
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=1440)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--shots", type=int, default=12)
    ap.add_argument("--port", type=int, default=8804)
    ap.add_argument("--page-height", type=int, default=0,
                    help="total document height; measured by hand if omitted")
    args = ap.parse_args()

    if not os.path.exists(CHROME):
        sys.exit("Chrome not found at %s" % CHROME)

    page = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

    out = os.path.join(ROOT, "lab", "sweep")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out, exist_ok=True)

    total = args.page_height or (args.height * 14)
    step = max(1, (total - args.height) // (args.shots - 1))
    offsets = [i * step for i in range(args.shots)]

    marks = "".join('<div class="sweep-y" id="y%d" style="top:%dpx"></div>' % (y, y)
                    for y in offsets)
    sweep = os.path.join(ROOT, "_sweep.html")
    open(sweep, "w", encoding="utf-8").write(
        page.replace("</body>", (MARKERS % marks) + "</body>", 1))

    for i, y in enumerate(offsets):
        subprocess.run([
            CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--virtual-time-budget=3500",
            "--window-size=%d,%d" % (args.width, args.height),
            "--screenshot=%s" % os.path.join(out, "%02d.png" % i),
            "http://localhost:%d/_sweep.html#y%d" % (args.port, y),
        ], capture_output=True)

    os.remove(sweep)

    try:
        from PIL import Image, ImageDraw
    except ImportError:
        sys.exit("Pillow needed for the contact sheet")

    shots = [os.path.join(out, "%02d.png" % i) for i in range(len(offsets))]
    shots = [p for p in shots if os.path.exists(p)]
    if not shots:
        sys.exit("no shots were written -- is the server running on port %d?" % args.port)

    cols = 4
    tw = 360
    th = round(args.height * tw / args.width)
    rows = (len(shots) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * 8, rows * (th + 22) + 8), "white")
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(shots):
        im = Image.open(p).convert("RGB").resize((tw, th), Image.LANCZOS)
        x = 8 + (i % cols) * (tw + 8)
        y = 8 + (i // cols) * (th + 22)
        sheet.paste(im, (x, y))
        d.text((x + 2, y + th + 4), "y = %d" % offsets[i], fill=(0, 0, 0))
    sheet.save(os.path.join(out, "sheet.png"))
    print("wrote %d shots + sheet.png to lab/sweep (step %dpx, total assumed %dpx)"
          % (len(shots), step, total))


if __name__ == "__main__":
    main()
