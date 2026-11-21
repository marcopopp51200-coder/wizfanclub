# Erzeugt das App-Icon (icon.ico) beim Bauen – Gold auf Dunkel wie die Website.
import sys
from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1] if len(sys.argv) > 1 else "icon.ico"
S = 256
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([8, 8, S - 8, S - 8], radius=52, fill=(11, 14, 22, 255), outline=(224, 169, 27, 255), width=10)
d.rounded_rectangle([30, 30, S - 30, S - 30], radius=36, outline=(58, 47, 18, 255), width=4)
font = None
for f in ("C:/Windows/Fonts/georgiab.ttf", "C:/Windows/Fonts/timesbd.ttf", "DejaVuSerif-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"):
    try:
        font = ImageFont.truetype(f, 150); break
    except OSError:
        pass
font = font or ImageFont.load_default()
box = d.textbbox((0, 0), "W", font=font)
w, h = box[2] - box[0], box[3] - box[1]
x, y = (S - w) / 2 - box[0], (S - h) / 2 - box[1]
d.text((x + 4, y + 6), "W", font=font, fill=(60, 38, 4, 255))
d.text((x, y), "W", font=font, fill=(245, 197, 66, 255))
img.save(out, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
img.save(out.rsplit(".", 1)[0] + ".png")
print("Icon geschrieben:", out)
