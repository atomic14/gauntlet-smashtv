# Render a Gauntlet playfield RAM dump (+ colour RAM dump) to PNG, with the spr_tiles ROMs.
# usage: renderpf.py <romdir-with-136037-1xx files> <pf.bin> <color.bin> <bank> <out.png>
import sys, struct
import numpy as np
from PIL import Image

romdir, pfp, colp, bank, out = sys.argv[1:6]
bank = int(bank)
names = ["111.1a", "112.1b", "113.1l", "114.1mn", "115.2a", "116.2b", "117.2l", "118.2mn"]
gfx = bytearray()
for n in names:
    gfx += open(f"{romdir}/136037-{n}", "rb").read()
gfx = np.frombuffer(bytes(b ^ 0xFF for b in gfx), dtype=np.uint8)
planes = gfx.reshape(4, 0x2000, 8)  # plane, tile, row
bits = np.unpackbits(planes, axis=2).reshape(4, 0x2000, 8, 8)
tiles = (bits[3] << 3) | (bits[2] << 2) | (bits[1] << 1) | bits[0]  # last plane is the MSB

col = struct.unpack(">1024H", open(colp, "rb").read())
zt = [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
pal = np.array([[((c >> s) & 15) * zt[c >> 12] for s in (8, 4, 0)] for c in col], dtype=np.uint8)

pf = struct.unpack(">4096H", open(pfp, "rb").read())
img = np.zeros((512, 512, 3), dtype=np.uint8)
for i, d in enumerate(pf):
    cx, cy = i // 64, i % 64  # column-major
    code = ((bank * 0x1000) + (d & 0xFFF)) ^ 0x800
    color = 0x10 + 8 + ((d >> 12) & 7)
    t = tiles[code]
    if d >> 15:
        t = t[:, ::-1]
    img[cy * 8:cy * 8 + 8, cx * 8:cx * 8 + 8] = pal[256 + color * 16 + t.astype(np.int32)]
Image.fromarray(img).resize((1024, 1024), Image.NEAREST).save(out)

# overlay motion objects if a mo dump is given (902000-903fff)
if len(sys.argv) > 6:
    mo = struct.unpack(">4096H", open(sys.argv[6], "rb").read())
    big = np.array(Image.open(out).resize((512, 512), Image.NEAREST))
    n = 0
    for i in range(1024):
        code, xw, yw, link = mo[i], mo[0x400 + i], mo[0x800 + i], mo[0xC00 + i]
        if code == 0 and xw == 0 and yw == 0:
            continue
        x, y = xw >> 7, yw >> 7
        color = xw & 15
        w, h = ((yw >> 3) & 7) + 1, (yw & 7) + 1
        flip = (yw >> 6) & 1
        c = (code & 0x7FFF) ^ 0x800
        n += 1
        for tx in range(w):
            for ty in range(h):
                t = tiles[(c + ty * w + tx) & 0x1FFF]
                if flip:
                    t = t[:, ::-1]
                px = (x + (w - 1 - tx if flip else tx) * 8) % 512
                py = (y + ty * 8) % 512
                for yy in range(8):
                    for xx in range(8):
                        p = int(t[yy, xx])
                        if p:
                            big[(py + yy) % 512, (px + xx) % 512] = pal[256 + color * 16 + p]
    print("mos", n)
    Image.fromarray(big).resize((1024, 1024), Image.NEAREST).save(out)
