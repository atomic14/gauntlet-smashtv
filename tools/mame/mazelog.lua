-- Log the bytes the maze decoder (PC 04ad06-04aff6) reads, with the maze number/pointer.
local OUT = os.getenv("OUT") or "/tmp/mazelog.txt"
local cpu = manager.machine.devices[":maincpu"]
local sp = cpu.spaces["program"]
local log = io.open(OUT, "w")
local function setin(name, v)
  for _, port in pairs(manager.machine.ioport.ports) do
    if port.fields[name] then port.fields[name]:set_value(v) end
  end
end
local last = -1
TAPM = sp:install_read_tap(0x038000, 0x03ffff, "maze", function(o, d, m)
  local pc = cpu.state["PC"].value
  if pc >= 0x4ad06 and pc < 0x4aff6 then
    if pc ~= last then end
    log:write(string.format("%06x %06x %04x %04x\n", pc, o, d, m))
  end
end)
local frame = 0
emu.register_frame_done(function()
  frame = frame + 1
  if frame == 600 then setin("Coin 1", 1) end
  if frame == 606 then setin("Coin 1", 0) end
  if frame == 700 then setin("P1 Button 2", 1) end
  if frame == 706 then setin("P1 Button 2", 0) end
  if frame % 50 == 0 then
    log:write(string.format("F %d maze=%04x ptr=%08x lvl=%04x %04x\n", frame, sp:read_u16(0x9049c4),
      sp:read_u32(0x9049c0), sp:read_u16(0x904000), sp:read_u16(0x904004)))
  end
  if frame == 800 then log:close(); manager.machine:exit() end
end)
