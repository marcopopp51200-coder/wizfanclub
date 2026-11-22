# Baut beim Erstellen der .exe runde Kommandanten-Bilder (aus icons/comander der Website) + Namens-Zuordnung.
import glob, json, os, re, sys
from PIL import Image, ImageDraw

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "app", "heroicons")
S = 64
os.makedirs(OUT, exist_ok=True)
n = 0
for sub, ring in (("comander", (224, 169, 27, 255)), ("comanderexpertise", (245, 197, 66, 255))):
    for f in glob.glob(os.path.join(ROOT, "icons", sub, "*.*")):
        stem, ext = os.path.splitext(os.path.basename(f))
        if ext.lower() not in (".webp", ".png", ".jpg", ".jpeg"):
            continue
        try:
            im = Image.open(f).convert("RGBA")
        except Exception:
            continue
        w, h = im.size
        side = min(w, h)
        im = im.crop(((w - side) // 2, 0, (w - side) // 2 + side, side)).resize((S * 4, S * 4), Image.LANCZOS)
        mask = Image.new("L", im.size, 0)
        ImageDraw.Draw(mask).ellipse((6, 6, S * 4 - 6, S * 4 - 6), fill=255)
        out = Image.new("RGBA", im.size, (0, 0, 0, 0))
        out.paste(im, (0, 0), mask)
        ImageDraw.Draw(out).ellipse((4, 4, S * 4 - 4, S * 4 - 4), outline=ring, width=10)
        out = out.resize((S, S), Image.LANCZOS)
        name = ("x_" if sub == "comanderexpertise" else "") + stem.lower()
        out.save(os.path.join(OUT, name + ".png"))
        n += 1
# Namen -> Bild (aus battles.js, wie auf der Website)
mp = {}
try:
    src = open(os.path.join(ROOT, "battles.js"), encoding="utf-8").read()
    m = re.search(r"var HM_ICON = (\{.*?\});", src)
    if m:
        mp = json.loads(m.group(1))
except Exception as e:
    print("map:", e)
json.dump(mp, open(os.path.join(OUT, "map.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("Kommandanten-Bilder:", n, "Namen:", len(mp))
