# Decode Gauntlet mazes from the program image (prog.bin from buildrom.py), following the
# decoder at 0x4ad06. Usage: mazes.py prog.bin
import sys, struct
d = open(sys.argv[1], "rb").read()

def decode(off):
    """Decode the maze whose header starts at raw offset `off`. Returns (header, grid, end)."""
    hdr = d[off:off + 14]
    tab = [hdr[0xA], hdr[0xC], hdr[0xB], hdr[0xD]]  # 904b1a, 904b1e, 904b1c, 904b20 via 0xd800
    grid = [0] * 0x400
    for i in range(32):
        grid[i] = 1  # top wall row
    pos = 0x20
    p = off + 14
    last = hdr[0xB]
    def place(code, n):
        nonlocal pos
        for _ in range(n):
            if pos < 0x400:
                grid[pos] = code
            pos += 1
    def vplace(code, n):
        # 0x44494: a run of `code` going up from the current cell; consumes one cell
        nonlocal pos
        if code:
            for k in range(n):
                if 0 <= pos - 32 * k < 0x400:
                    grid[pos - 32 * k] = code
        pos += 1
    while pos < 0x400:
        b = d[p]; p += 1
        n = b & 0x1F
        cmd = b & 0xC0
        if cmd == 0x00:
            last = b
            place(b & 0x3F, 1)
        elif cmd == 0x40:
            last = tab[(b >> 4) & 3]
            k = (b & 0xF) + 1
            sub = last & 0xC0
            if sub == 0x00:
                if last in (hdr[0xC], hdr[0xD]):
                    vplace(last & 0x3F, k)
                else:
                    place(last & 0x3F, k)
            elif sub == 0x40:
                place(0, k); place(last & 0x3F, 1)
            elif sub == 0x80:
                place(last & 0x3F, 1); place(0, k)
            else:
                place(1, k); place(last & 0x3F, 1)
        elif cmd == 0x80:
            if b & 0x20:
                (vplace if b & 0x10 else place)(1, (b & 0xF) + 1)
            else:
                place(last & 0x3F, n + 1)
        else:
            if b & 0x20:
                place(0, n + 1); place(1, 1)
            else:
                place(0, n + 1)
    return hdr, grid, p, pos

def table(start, count):
    return [struct.unpack(">I", d[start + 4 * i:start + 4 * i + 4])[0] for i in range(count)]

if __name__ == "__main__":
    ptrs = table(0x38032, 114)
    for i, v in enumerate(ptrs):
        res = []
        for bank in range(4):
            off = 0x38000 + bank * 0x2000 + (v & 0x1FFF)
            hdr, grid, end, pos = decode(off)
            res.append((pos == 0x400, end - off, bank))
        print(i + 1, hex(v), [(b, ok, ln) for ok, ln, b in res])
