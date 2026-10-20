-- Find the code that builds a level: log PCs that read the maze ROM region and write the
-- playfield / work RAM, around the start of a game.
local OUT = os.getenv("OUT") or "/tmp/taps.txt"
local cpu = manager.machine.devices[":maincpu"]
local sp = cpu.spaces["program"]
local function setin(name, v)
  for _, port in pairs(manager.machine.ioport.ports) do
    if port.fields[name] then port.fields[name]:set_value(v) end
  end
end
local counts = {}
local active = false
local function bump(kind, addr)
  local pc = cpu.state["PC"].value
  local k = string.format("%s %06x", kind, pc)
  local c = counts[k]
  if not c then c = { n = 0, lo = addr, hi = addr }; counts[k] = c end
  c.n = c.n + 1
  if addr < c.lo then c.lo = addr end
  if addr > c.hi then c.hi = addr end
end
TAP1 = sp:install_read_tap(0x038000, 0x03ffff, "mazerom", function(o, d, m) if active then bump("R38", o) end end)
TAP2 = sp:install_write_tap(0x900000, 0x901fff, "pf", function(o, d, m) if active then bump("Wpf", o) end end)
TAP3 = sp:install_write_tap(0x902000, 0x903fff, "mo", function(o, d, m) if active then bump("Wmo", o) end end)
local frame = 0
emu.register_frame_done(function()
  frame = frame + 1
  if frame == 600 then setin("Coin 1", 1) end
  if frame == 606 then setin("Coin 1", 0) end
  if frame == 590 then active = true end
  if frame == 700 then setin("P1 Button 2", 1) end
  if frame == 706 then setin("P1 Button 2", 0) end
  if frame == 1000 then
    active = false
    local f = io.open(OUT, "w")
    for k, c in pairs(counts) do f:write(string.format("%s n=%d %06x-%06x\n", k, c.n, c.lo, c.hi)) end
    f:close()
    manager.machine:exit()
  end
end)
