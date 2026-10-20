# Contact sheet of the motion object each maze code draws (tables at c534/c624/c660).
# usage: codesheet.py romdir prog.bin color.bin out.png
import sys, struct
import numpy as np
from PIL import Image, ImageDraw
romdir, progp, colp, out = sys.argv[1:5]
d = open(progp, "rb").read()
names = ["111.1a", "112.1b", "113.1l", "114.1mn", "115.2a", "116.2b", "117.2l", "118.2mn"]
gfx = bytearray()
for n in names:
    gfx += open(f"{romdir}/136037-{n}", "rb").read()
gfx = np.frombuffer(bytes(b ^ 0xFF for b in gfx), dtype=np.uint8)
bits = np.unpackbits(gfx.reshape(4, 0x2000, 8), axis=2).reshape(4, 0x2000, 8, 8)
tiles = ((bits[3] << 3) | (bits[2] << 2) | (bits[1] << 1) | bits[0]).astype(np.int32)
col = list(struct.unpack(">1024H", open(colp, "rb").read()))
# motion object palette straight from ROM (0xf740, loaded to 910200 by 0x413aa)
col[256:512] = struct.unpack(">256H", d[0xF740:0xF940])
zt = [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
# R and B come out swapped relative to MAME's screen with this read; match the screen
pal = np.array([[((c >> s) & 15) * zt[c >> 12] for s in (8, 4, 0)] for c in col], dtype=np.uint8)

def mo(code, yw, xw):
    w, h = ((yw >> 3) & 7) + 1, (yw & 7) + 1
    flip = (yw >> 6) & 1
    color = xw & 15
    c = (code & 0x7FFF) ^ 0x800
    img = np.zeros((h * 8, w * 8, 4), dtype=np.uint8)
    for tx in range(w):
        for ty in range(h):
            t = tiles[(c + ty * w + tx) & 0x1FFF]
            if flip:
                t = t[:, ::-1]
            px = (w - 1 - tx if flip else tx) * 8
            rgb = pal[256 + color * 16 + t]
            img[ty * 8:ty * 8 + 8, px:px + 8, :3] = rgb
            img[ty * 8:ty * 8 + 8, px:px + 8, 3] = np.where(t > 0, 255, 0)
    return img

S = 4
sheet = Image.new("RGB", (16 * 40 * S // 2, 4 * 48 * S // 2), (40, 40, 40))
dr = ImageDraw.Draw(sheet)
for code in range(64):
    pic = struct.unpack(">H", d[0xC534 + 2 * code:0xC536 + 2 * code])[0]
    yw, xw = d[0xC624 + code], d[0xC660 + code]
    im = Image.fromarray(mo(pic, yw, xw), "RGBA")
    im = im.resize((im.width * S // 2 * 2, im.height * S // 2 * 2), Image.NEAREST)
    x, y = (code % 16) * 80, (code // 16) * 96
    sheet.paste(im, (x + 4, y + 14), im)
    dr.text((x + 2, y + 1), f"{code:02x} {pic:04x}", fill=(255, 255, 0))
sheet.save(out)
