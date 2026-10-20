-- Start a one-player game and save screenshots every SHOT_EVERY frames.
local OUT = os.getenv("OUT") or "/tmp/gshots"
local LAST = tonumber(os.getenv("LAST") or "2400")
local EVERY = tonumber(os.getenv("SHOT_EVERY") or "300")
local scr = manager.machine.screens[":screen"]
local function setin(name, v)
  for _, port in pairs(manager.machine.ioport.ports) do
    if port.fields[name] then port.fields[name]:set_value(v) end
  end
end
local frame = 0
emu.register_frame_done(function()
  frame = frame + 1
  if frame == 600 then setin("Coin 1", 1) end
  if frame == 606 then setin("Coin 1", 0) end
  if frame == 700 then setin("P1 Button 2", 1) end
  if frame == 706 then setin("P1 Button 2", 0) end
  if frame % EVERY == 0 then
    local w, h = scr.width, scr.height
    local px = scr:pixels()
    local f = io.open(string.format("%s/f%05d.rgb", OUT, frame), "wb")
    f:write(string.pack("<I4I4", w, h)); f:write(px); f:close()
  end
  if frame >= LAST then manager.machine:exit() end
end)
