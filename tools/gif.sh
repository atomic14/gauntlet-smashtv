#!/usr/bin/env bash
# Turn work/shots/gif/f*.png (from tests/demo-gif.js) into docs/demo.gif: the playfield
# only, at the game's own resolution, 10 frames a second.
set -euo pipefail
ffmpeg -v error -y -framerate 20 -start_number 60 -i work/shots/gif/f%04d.png -frames:v 120 \
  -vf "crop=1280:864:0:0,scale=640:432:flags=neighbor,fps=10,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
  docs/demo.gif
ls -la docs/demo.gif
