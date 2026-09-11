"""
Build _motion-check.html: the real page with a readout pinned to the top.

    python scripts/make-motion-check.py

Open the result in a real browser and scroll slowly down and back up. Each row
says MOVES or stuck. It exists because neither headless Chrome nor an embedded
preview can be trusted to run a slow animation: headless fast-forwards virtual
time and samples one arbitrary frame, and the preview pane pins its document
clock at zero. This is gitignored and never ships.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
NL = chr(10)

TARGETS = [
    ("growth level",    "#path39-1-5",     "transform"),
    ("induction level", "#path39-1-5-7",   "transform"),
    ("growth clip",     "#clipGrowthRect", "y"),
    ("train impeller",  "#rect47",         "transform"),
    ("train bubble",    "#path107-1",      "transform"),
    ("control dashes",  "#rect15",         "strokeDashoffset"),
    ("chain impeller",  "#rect13",         "transform"),
    ("chain bubble",    "#circle14",       "transform"),
    ("chain plot",      ".ch-curve",          "strokeDashoffset"),
    ("chain signal",    ".ch-sig",            "strokeDashoffset"),
]

STYLE = """
<style id="mc-style">
  #mc{position:fixed;top:0;left:0;right:0;z-index:99;background:#000;color:#0f0;
      padding:12px 16px;font:13px/1.6 ui-monospace,Menlo,Consolas,monospace;
      border-bottom:3px solid #0f0}
  #mc b{color:#fff}
  #mc .no{color:#f66}
  body{padding-top:210px}
</style>
<div id="mc">starting...</div>
"""

# Built with no backslash escapes anywhere: rows are joined with <br>, which
# innerHTML renders as line breaks, so nothing here depends on "\\n" surviving.
SCRIPT = """
<script>
(function(){
  var targets = TARGETS_JSON;
  var seen = {};
  function pad(s){ while (s.length < 17) { s = s + "."; } return s + " "; }
  function sample(){
    var ua = navigator.userAgent.match(/Chrome[/][0-9.]+/);
    var rows = ["<b>" + (ua ? ua[0] : "browser?") +
                "   scroll timelines: " + CSS.supports("animation-timeline", "view()") + "</b>"];
    for (var i = 0; i < targets.length; i++){
      var label = targets[i][0], sel = targets[i][1], prop = targets[i][2];
      var el = document.querySelector(sel);
      if (!el){ rows.push(pad(label) + "<span class=no>MISSING</span>"); continue; }
      var v = String(getComputedStyle(el)[prop]);
      if (!seen[label]) { seen[label] = []; }
      if (seen[label].indexOf(v) < 0) { seen[label].push(v); }
      var moved = seen[label].length > 2;
      rows.push(pad(label) + (moved ? "MOVES" : "<span class=no>stuck</span>") +
                "   " + v.slice(0, 30));
    }
    document.getElementById("mc").innerHTML = rows.join("<br>");
  }
  addEventListener("scroll", sample, {passive:true});
  setInterval(sample, 150);
  sample();
})();
</script>
"""


def main():
    page = os.path.join(ROOT, "index.html")
    html = open(page, encoding="utf-8").read()

    rows = ",".join(
        '["%s","%s","%s"]' % (label, sel, prop) for label, sel, prop in TARGETS
    )
    script = SCRIPT.replace("TARGETS_JSON", "[" + rows + "]")

    out = html.replace("</body>", STYLE + script + "</body>", 1)
    dest = os.path.join(ROOT, "_motion-check.html")
    open(dest, "w", encoding="utf-8").write(out)

    # a parse check the cheap way: no stray line breaks inside string literals
    for line in script.splitlines():
        if line.count('"') % 2:
            raise SystemExit("unbalanced quote in generated script: " + line)
    print("wrote _motion-check.html (%d KB)" % (os.path.getsize(dest) // 1024))
    print("open it in a real browser and scroll slowly down, then back up")


if __name__ == "__main__":
    main()
