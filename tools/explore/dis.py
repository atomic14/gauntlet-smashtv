# Disassemble 68000 code from prog.bin: dis.py prog.bin start end
import sys, capstone
d = open(sys.argv[1], "rb").read()
a, b = int(sys.argv[2], 16), int(sys.argv[3], 16)
md = capstone.Cs(capstone.CS_ARCH_M68K, capstone.CS_MODE_BIG_ENDIAN | capstone.CS_MODE_M68K_010)
pc = a
while pc < b:
    got = False
    for ins in md.disasm(d[pc:b], pc):
        print(f"{ins.address:06x}  {ins.bytes.hex():<20} {ins.mnemonic} {ins.op_str}")
        pc = ins.address + ins.size
        got = True
    if pc < b:
        print(f"{pc:06x}  {d[pc:pc+2].hex():<20} dc.w")
        pc += 2
