# Contact sheet of the first frame of each Smash T.V. animation (from the smashtv port's assets).
# usage: animsheet.py assets_dir out.png [filter]
import sys, json
from PIL import Image, ImageDraw
a = sys.argv[1]
flt = sys.argv[3] if len(sys.argv) > 3 else ""
sp = json.load(open(f"{a}/sprites.json"))
an = json.load(open(f"{a}/anims.json"))["anims"]
pages = [Image.open(f"{a}/sprites-{i}.png").convert("RGBA") for i in range(sp["pages"])]
items = []
for name, frames in sorted(an.items()):
    if flt and not any(f in name for f in flt.split(",")):
        continue
    key, flip = frames[0]
    p, x, y, w, h, xo, yo = sp["frames"][key]
    im = pages[p].crop((x, y, x + w, y + h))
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    items.append((f"{name} {w}x{h} n{len(frames)}", im))
cw, ch = 130, 90
cols = 10
rows = (len(items) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cw, rows * ch), (50, 50, 60))
d = ImageDraw.Draw(sheet)
for i, (label, im) in enumerate(items):
    x, y = (i % cols) * cw, (i // cols) * ch
    im.thumbnail((cw - 4, ch - 14))
    sheet.paste(im, (x + 2, y + 12), im)
    d.text((x + 2, y), label[:24], fill=(255, 255, 0))
sheet.save(sys.argv[2])
