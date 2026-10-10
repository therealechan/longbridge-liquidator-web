#!/usr/bin/env bash
# Regenerates the hero background loop ("ledger flow": maths plus the Geist
# Mono font from site/node_modules; nothing is downloaded).
#
#   site/public/video/hero-loop.mp4    H.264 High@4.0, yuv420p, faststart
#   site/public/video/hero-loop.webm   VP9
#   site/public/video/hero-poster.jpg  frame 0 (poster + reduced-motion still)
#
# The renderer is scripts/build_hero_video.py (numpy + scipy + Pillow, then
# two-pass ffmpeg). See its docstring for the scene and why it loops cleanly.
#
#   bash site/scripts/make-hero-video.sh                  # render + encode
#   bash site/scripts/make-hero-video.sh --preview DIR    # 5 stills + contact sheet
#   bash site/scripts/make-hero-video.sh --check-seam     # loop-seam error
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

if ! python3 -c "import numpy, scipy, PIL" 2>/dev/null; then
  echo "needs numpy, scipy and Pillow:  pip3 install --user numpy scipy pillow" >&2
  exit 1
fi
export PATH="$PATH:/opt/homebrew/bin"
exec python3 "$HERE/build_hero_video.py" "$@"
