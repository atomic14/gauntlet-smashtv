-- Exploration: list inputs, start a one-player game and dump RAM + screenshots.
local OUT = os.getenv("OUT") or "/tmp/gprobe"
local cpu = manager.machine.devices[":maincpu"]
local sp = cpu.spaces["program"]
for tag, port in pairs(manager.machine.ioport.ports) do
  for name, f in pairs(port.fields) do print("PORT", tag, name) end
end
local function setin(name, v)
  for _, port in pairs(manager.machine.ioport.ports) do
    if port.fields[name] then port.fields[name]:set_value(v) end
  end
end
local function dump(name, a, b)
  local f = io.open(OUT .. "/" .. name .. ".bin", "wb")
  for x = a, b - 1 do f:write(string.char(sp:read_u8(x))) end
  f:close()
end
local frame = 0
emu.register_frame_done(function()
  frame = frame + 1
  if frame == 600 then setin("Coin 1", 1) end
  if frame == 606 then setin("Coin 1", 0) end
  if frame == 700 then setin("P1 Button 2", 1) end
  if frame == 706 then setin("P1 Button 2", 0) end
  if frame % 300 == 0 then
    manager.machine.video:snapshot()
    print("FRAME", frame)
  end
  if frame == 1500 or frame == 1800 then
    local t = tostring(frame)
    dump("ram800_" .. t, 0x800000, 0x802000)
    dump("pf_" .. t, 0x900000, 0x902000)
    dump("mo_" .. t, 0x902000, 0x904000)
    dump("spare_" .. t, 0x904000, 0x905000)
    dump("alpha_" .. t, 0x905000, 0x906000)
    dump("color_" .. t, 0x910000, 0x910800)
  end
  if frame == 1810 then manager.machine:exit() end
end)
