# Convert .rgb screen grabs (u32 w, u32 h, BGRA pixels) from shots.lua to PNG (2x), optionally tiling them.
import sys, struct
from PIL import Image
out = sys.argv[1]
ims = []
for p in sys.argv[2:]:
    d = open(p, "rb").read()
    w, h = struct.unpack("<II", d[:8])
    ims.append(Image.frombytes("RGB", (w, h), d[8:], "raw", "BGRX"))
w, h = ims[0].size
cols = min(3, len(ims))
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (w * cols, h * rows))
for i, im in enumerate(ims):
    sheet.paste(im, ((i % cols) * w, (i // cols) * h))
sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(out)
