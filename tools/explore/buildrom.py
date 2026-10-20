# Assemble the 68010 program space (0x00000-0x4ffff) from the Gauntlet ROM files, as MAME loads it.
import sys
src, out = sys.argv[1], sys.argv[2]
mem = bytearray(0x50000)
def load16(name, parts):
    d = open(f"{src}/136037-{name}", "rb").read()
    pos = 0
    for base, odd, length in parts:
        for i in range(length):
            mem[base + odd + i * 2] = d[pos + i]
        pos += length
load16("1307.9a", [(0x8000, 0, 0x4000), (0x0000, 0, 0x4000)])
load16("1308.9b", [(0x8000, 1, 0x4000), (0x0000, 1, 0x4000)])
load16("205.10a", [(0x38000, 0, 0x4000)])
load16("206.10b", [(0x38000, 1, 0x4000)])
load16("1409.7a", [(0x48000, 0, 0x4000), (0x40000, 0, 0x4000)])
load16("1410.7b", [(0x48000, 1, 0x4000), (0x40000, 1, 0x4000)])
open(out, "wb").write(mem)
