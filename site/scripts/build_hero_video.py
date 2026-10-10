#!/usr/bin/env python3
"""Render the landing page's looping hero background video. HAND-RUN.

Adapted from the QM Screener hero renderer (same author), re-toned for
LB Liquidator's monochrome design system.

What it draws
-------------
A perspective floor grid drifting toward the viewer under a horizon glow; a
holographic candlestick chart hanging over it on the right, trending up into
the distance with a pulse of light running along its average; thin data
pillars at the horizon that rise out of the floor and sink back; a light
sweep that crosses the floor once per loop; drifting dust and a sparse star
field. Every line and box is box-filtered against its own pixel footprint, so
the far grid resolves into haze instead of moire.

Rules, taken from the product's design system (DESIGN_GUIDELINE.md):

* **Monochrome.** Greys and white do the structure. The only hue is a faint
  red on the chart's light (the pulse and the air around the candles):
  red is the product's "sell" colour and its one accent on the landing page.
  Up and down candles differ by *filled vs hollow*, never by colour.
* **The copy owns the left.** The headline, lede and buttons sit in the left
  ~60% of a 1240px column, so everything bright lives right of it, and a
  screen-space mask (``Static.calm``) holds the floor under the text down.
  The page fades the video's bottom away and lays the product screenshot over
  it, so nothing worth seeing sits in the bottom third.
* **No text, no tickers, no numbers.** It is decoration.
* **Same background as the page.** ``BG`` is the dark ``--background``
  (#0a0a0a); the page lays the video over itself with ``mix-blend-mode:
  lighten`` and masks its bottom edge, so the two must match.

Why it loops without a seam
---------------------------
Every motion is periodic in the loop: the floor travels exactly ``TRAVEL``
grid cells; the skyline is floor-locked and ``TRAVEL`` rows deep; the chart's
pulse runs off both ends at the seam; dust motes fade at both ends of their
slab; stars and the horizon breathe at integer multiples of the loop
frequency; the camera sway is one closed ellipse. ``--check-seam`` measures it.

Usage
-----
    python3 site/scripts/build_hero_video.py               # -> site/public/video/hero-loop.*
    python3 site/scripts/build_hero_video.py --preview DIR # five stills + a contact sheet
    python3 site/scripts/build_hero_video.py --check-seam  # print the loop-seam error

Outputs: ``hero-loop.mp4`` (H.264 High@4.0, faststart), ``hero-loop.webm``
(VP9) and ``hero-poster.jpg`` (frame 0, so poster -> video has no jump).
Needs numpy, scipy, Pillow and ffmpeg with libx264 and libvpx-vp9.
Deterministic: fixed seed, no wall-clock input.
"""
from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
import tempfile
from multiprocessing import get_context
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom

SITE_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = SITE_ROOT
OUT_DIR = SITE_ROOT / "public" / "video"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"

# ---------------------------------------------------------------- the format
W, H = 1600, 900
FPS = 24
SECONDS = 10
FRAMES = FPS * SECONDS
SEED = int(os.environ.get("HERO_SEED", "42"))

# ---------------------------------------------------------------- the camera
# A pinhole with lens shift: the optical axis stays level, so every vertical
# edge projects vertical and a candle is an axis-aligned box, and the
# principal point is moved right and up to put the vanishing point where the
# copy is not.
FOCAL = 1100.0                  # px
VP_X = 0.71 * W                 # vanishing point, x
# 0.352 puts the horizon, at 1440 wide, in the gap between the Chinese page's
# two-line headline and its lede; the English headline runs four lines and
# covers that height only left of x~850, where the horizon has faded out.
HORIZON_Y = 0.352 * H           # vanishing point, y
CAM_Y = 1.2                     # eye height, in grid cells
TRAVEL = 8                      # grid cells the floor covers per loop
FOG = 20.0                      # e-folding distance of the fog, in cells

# The chart: a straight run of candles from a near-left point to a far-right
# one (camera-relative X, Z in cells), trending up into the distance.
CHART_N = 30
CHART_A = (-0.55, 5.4)
CHART_B = (5.30, 16.0)
CHART_LO, CHART_HI = 1.30, 3.55   # price band, as height above the floor
CANDLE_W = 0.17

# The skyline: floor-locked pillars in columns of X, inside a depth window
# that is exactly TRAVEL deep.
SKY_NEAR = 13.0
SKY_COLS = range(-2, 15)
SKY_FILL = 0.42

# ---------------------------------------------------------------- the palette
# Linear-light RGB. The background is the site's dark `--background`
# (src/layouts/Layout.astro): the page lays the video over itself with `lighten` and
# masks its bottom edge away, so the two must be the same colour or the edge
# of the frame shows.
def _lin(hexcode: str) -> np.ndarray:
    c = np.array([int(hexcode[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


# Greys stand in for QM's blues at roughly the same luminance, a touch cool so
# the glow does not read as warm smoke; the chart's light carries the red.
BRAND = _lin("#5a5b60")         # dim glow (was the brand blue)
ACCENT = _lin("#8c8d94")        # grid, edges, haze
ICE = _lin("#ececef")           # hot cores, rolls toward white
EMBER = _lin("#6a3a37")         # air around the chart: red, barely
SELL = _lin("#ffb0a8")          # the pulse running through the candles

BG = _lin("#0a0a0a")            # --background (dark)
GRAIN = 1.5                     # fixed grain, in 8-bit levels (std)


# ------------------------------------------------------------- small helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def filtered_lines(u, w, a):
    """Box-filtered pulse train: lines of width ``a`` (in periods) centred
    on the integers, averaged over a pixel footprint ``w`` (in periods).

    The integral of a pulse train is a staircase plus a ramp, so the box
    filter is exact and costs two evaluations — which is what lets the grid
    run to the horizon without aliasing into moire.
    """
    w = np.maximum(w, 1e-4)
    s = u + a / 2

    def F(x):
        return np.floor(x) * a + np.minimum(x - np.floor(x), a)

    return np.clip((F(s + w / 2) - F(s - w / 2)) / w, 0.0, 1.0)


def phase(t, k=1):
    return 2 * math.pi * k * t


class Canvas:
    """A float layer with anti-aliased boxes and line segments."""

    def __init__(self, w=W, h=H):
        self.a = np.zeros((h, w), np.float32)
        self.w, self.h = w, h

    def box(self, x0, x1, y0, y1, amt):
        """Exact pixel coverage of an axis-aligned box, times ``amt``."""
        if x1 <= x0 or y1 <= y0 or amt <= 0:
            return
        i0, i1 = max(int(math.floor(x0)), 0), min(int(math.ceil(x1)) + 1, self.w)
        j0, j1 = max(int(math.floor(y0)), 0), min(int(math.ceil(y1)) + 1, self.h)
        if i1 <= i0 or j1 <= j0:
            return
        xc = np.arange(i0, i1, dtype=np.float32) + 0.5
        yc = np.arange(j0, j1, dtype=np.float32) + 0.5
        cx = np.clip(np.minimum(xc + 0.5, x1) - np.maximum(xc - 0.5, x0), 0, 1)
        cy = np.clip(np.minimum(yc + 0.5, y1) - np.maximum(yc - 0.5, y0), 0, 1)
        self.a[j0:j1, i0:i1] += amt * np.outer(cy, cx)

    def frame(self, x0, x1, y0, y1, sw, amt):
        self.box(x0, x1, y0, y0 + sw, amt)
        self.box(x0, x1, y1 - sw, y1, amt)
        self.box(x0, x0 + sw, y0 + sw, y1 - sw, amt)
        self.box(x1 - sw, x1, y0 + sw, y1 - sw, amt)

    def segment(self, x0, y0, x1, y1, width, amt0, amt1=None):
        """A line of ``width`` px, its brightness ramping amt0 -> amt1."""
        amt1 = amt0 if amt1 is None else amt1
        if max(amt0, amt1) <= 1e-4:
            return
        pad = int(width) + 3
        i0, i1 = max(int(min(x0, x1)) - pad, 0), min(int(max(x0, x1)) + pad, self.w)
        j0, j1 = max(int(min(y0, y1)) - pad, 0), min(int(max(y0, y1)) + pad, self.h)
        if i1 <= i0 or j1 <= j0:
            return
        px = (np.arange(i0, i1, dtype=np.float32) + 0.5)[None, :]
        py = (np.arange(j0, j1, dtype=np.float32) + 0.5)[:, None]
        vx, vy = x1 - x0, y1 - y0
        L2 = vx * vx + vy * vy + 1e-6
        u = np.clip(((px - x0) * vx + (py - y0) * vy) / L2, 0, 1)
        d = np.hypot(px - (x0 + u * vx), py - (y0 + u * vy))
        cov = np.clip(width / 2 + 0.5 - d, 0, 1)
        sub = self.a[j0:j1, i0:i1]
        np.maximum(sub, cov * (amt0 + (amt1 - amt0) * u), out=sub)


# ------------------------------------------------------------- static scene
class Static:
    """Everything that does not depend on time, computed once per worker."""

    def __init__(self):
        rng = np.random.default_rng(SEED)
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        self.xs, self.ys = xs + 0.5, ys + 0.5
        nx = self.xs / W
        ny = self.ys / H

        # The composition mask: calm where the copy sits (left, upper-middle),
        # full strength right of it and around the vanishing point.
        right = smoothstep(0.42, 0.80, nx)
        self.calm = (0.10 + 0.90 * right).astype(np.float32)
        # The sweep and other full-width effects take the mask twice: a
        # band of light crossing under the lede would pull the eye off it.
        self.calm2 = (self.calm ** 2).astype(np.float32)

        dx = (self.xs - VP_X) / W
        dy = (self.ys - HORIZON_Y) / H
        # Every horizon light leans right: its falloff toward the copy is
        # twice as fast as toward the frame edge.
        dxl = np.where(dx < 0, dx * 2.0, dx)
        # The horizon is at the height of the lede on a laptop (on the
        # Chinese page, whose headline is two lines, it runs straight through
        # it), so the thin hot line and its haze fall off fastest of all
        # toward the copy.
        dxh = np.where(dx < 0, dx * 7.0, dx)
        self.glow_wide = np.exp(-(dxl / 0.30) ** 2 - (dy / 0.16) ** 2)
        self.glow_core = np.exp(-(dxl / 0.09) ** 2 - (dy / 0.030) ** 2)
        self.horizon_line = (np.exp(-((self.ys - HORIZON_Y) / 1.0) ** 2)
                             * np.exp(-(dxh / 0.22) ** 2))
        self.horizon_haze = (np.exp(-((self.ys - HORIZON_Y) / 8.0) ** 2)
                             * np.exp(-(dxh / 0.30) ** 2))
        # A faint lift of the sky toward the horizon, right of the copy.
        self.sky = (smoothstep(0.0, HORIZON_Y / H, ny) ** 3
                    * (ny < HORIZON_Y / H) * right)

        # The floor: camera-relative depth per pixel row and its footprint.
        below = self.ys > HORIZON_Y + 0.5
        self.floor = below
        dyp = np.where(below, self.ys - HORIZON_Y, 1.0)
        self.Z = np.where(below, FOCAL * CAM_Y / dyp, 1e6).astype(np.float32)
        self.dZdy = (self.Z ** 2 / (FOCAL * CAM_Y)).astype(np.float32)

        # Stars: static positions above the horizon, each twinkling at an
        # integer multiple of the loop frequency so the loop closes.
        n = 300
        sx = rng.uniform(0, W, n)
        sy = rng.uniform(0, HORIZON_Y - 10, n)
        keep = rng.uniform(0, 1, n) < (0.18 + 0.82 * smoothstep(0.40, 0.85, sx / W))
        self.stars = dict(x=sx[keep], y=sy[keep],
                          b=rng.uniform(0.15, 1.0, keep.sum()) ** 2.4,
                          k=rng.integers(1, 4, keep.sum()),
                          ph=rng.uniform(0, 2 * math.pi, keep.sum()))

        # Dust: each mote drifts toward the viewer through its own slab once
        # per loop, fading in and out at the slab's ends.
        n = 900
        self.dust = dict(
            x=rng.uniform(-6, 12, n),
            y=rng.uniform(0.05, 4.2, n),
            z0=rng.uniform(3.0, 34.0, n),
            d=rng.uniform(2.0, 6.0, n),
            u=rng.uniform(0, 1, n),
            b=rng.uniform(0.2, 1.0, n) ** 2,
            k=rng.integers(1, 3, n),
        )

        # The chart: a walk with an upward drift and two pullbacks, so it
        # reads as a trend with a structure rather than a ramp or noise.
        j = np.arange(CHART_N)
        steps = rng.normal(0.0, 1.0, CHART_N) * 0.55 + 0.42
        steps[9:12] -= 1.0
        steps[19:21] -= 1.1
        walk = np.cumsum(steps)
        walk = (walk - walk.min()) / (np.ptp(walk) + 1e-6)
        close = CHART_LO + (CHART_HI - CHART_LO) * walk
        open_ = np.concatenate([[close[0] - 0.05], close[:-1]])
        open_ += rng.normal(0, 0.03, CHART_N)
        body = np.abs(close - open_)
        high = np.maximum(open_, close) + rng.uniform(0.03, 0.12, CHART_N) + 0.3 * body
        low = np.minimum(open_, close) - rng.uniform(0.03, 0.12, CHART_N) - 0.3 * body
        ema = np.empty(CHART_N)
        ema[0] = close[0]
        for i in range(1, CHART_N):
            ema[i] = ema[i - 1] + 0.28 * (close[i] - ema[i - 1])
        s = j / (CHART_N - 1)
        self.chart = dict(
            s=s, open=open_, close=close, high=high, low=low, ema=ema,
            x=CHART_A[0] + (CHART_B[0] - CHART_A[0]) * s,
            z=CHART_A[1] + (CHART_B[1] - CHART_A[1]) * s,
            ph=rng.uniform(0, 2 * math.pi, CHART_N),
        )

        # The skyline: a per-(column, row) pillar, TRAVEL rows deep so it
        # repeats exactly once per loop of floor travel.
        cols = list(SKY_COLS)
        occ = rng.uniform(0, 1, (len(cols), TRAVEL)) < SKY_FILL
        self.sky_cells = [
            dict(x=c + 0.5 + rng.uniform(-0.25, 0.25), row=k + rng.uniform(0.2, 0.8),
                 h=0.25 + 1.6 * rng.uniform(0, 1) ** 2.0, b=rng.uniform(0.4, 1.0))
            for ci, c in enumerate(cols) for k in range(TRAVEL) if occ[ci, k]
        ]

        # Grain: a fixed screen-space field (temporally static grain costs the
        # encoder nothing), plus a light per-frame dither at quantisation.
        g = gaussian_filter(rng.normal(0, 1, (H, W)).astype(np.float32), 0.6)
        self.grain = g / (g.std() + 1e-6)


_STATIC: "Static | None" = None


def static() -> Static:
    global _STATIC
    if _STATIC is None:
        _STATIC = Static()
    return _STATIC


# ------------------------------------------------------------- one frame
def camera(t):
    """The camera's sway at loop time t in [0, 1): one slow closed ellipse,
    so near and far layers shift against each other. Its forward travel is
    the floor's offset, ``TRAVEL * t``, applied only to floor-locked things."""
    return 0.14 * math.sin(phase(t)), CAM_Y + 0.04 * math.sin(phase(t, 2) + 0.6)


def project(X, Y, Zr, cam):
    """Screen position of a point at camera-relative depth ``Zr``."""
    cx, cy = cam
    return VP_X + FOCAL * (X - cx) / Zr, HORIZON_Y - FOCAL * (Y - cy) / Zr


def sweep_z(t):
    """Camera-relative depth of the light sweep: born in the fog at the
    horizon, gone below the frame by the end of the loop."""
    return 80.0 * (2.0 / 80.0) ** t


def render_layers(t: float):
    """Return the scene as named intensity layers, each paired with its tint.

    Kept as named layers so a balance pass can weigh one against another
    without touching the geometry that made it.
    """
    S = static()
    cam = camera(t)
    cx, cy = cam
    cz = TRAVEL * t
    calm = S.calm
    layers = []

    # --- sky, glow, horizon ------------------------------------------------
    breathe = 1.0 + 0.10 * math.sin(phase(t) + 1.3)
    layers.append(("sky", 0.012 * S.sky, BRAND))
    layers.append(("glow", (0.030 * S.glow_wide + 0.075 * S.glow_core) * breathe, BRAND))
    layers.append(("haze", 0.07 * S.horizon_haze * breathe, ACCENT))
    layers.append(("hline", 0.40 * S.horizon_line * breathe, ICE))

    # --- floor grid --------------------------------------------------------
    fl = S.floor
    # The eye height sways, so the floor's depth per row does too.
    Zr = S.Z * (cy / CAM_Y)
    dZdy = S.dZdy * (cy / CAM_Y)
    Xr = (S.xs - VP_X) * Zr / FOCAL
    # Half a major cell sideways: with a major line straight under the eye,
    # the brightest stroke in the frame ran from the vanishing point down
    # through the end of the lede. Offset, the two nearest majors land two
    # cells either side — one under the copy, where the mask holds it down.
    Xw = Xr + cx + 2.0
    Zw = Zr + cz
    wz = dZdy                                   # cells per pixel, along Z
    wx = np.sqrt((Zr / FOCAL) ** 2 + (Xr / Zr * dZdy) ** 2)
    fog = np.exp(-Zr / FOG)
    near_fade = smoothstep(2.0, 6.0, Zr)

    def grid(period, a, gain):
        out = 1.0
        for u, w in ((Zw, wz), (Xw, wx)):
            wp = w / period
            drawn = np.maximum(a, 0.9 * wp)
            g = filtered_lines(u / period, wp, drawn)
            # A line thinner than a pixel is dimmer, not wider.
            g *= np.minimum(1.0, a / np.maximum(0.9 * wp, 1e-6)) ** 0.6
            # Lines closer together than ~2.5 px have become texture.
            g *= smoothstep(0.42, 0.10, wp)
            out = out * (1 - g)
        return gain * (1 - out)

    floor_amt = np.where(fl, (grid(1.0, 0.010, 0.45) + grid(4.0, 0.005, 0.55))
                         * fog * near_fade, 0.0)

    # The sweep: a band of light crossing the floor from the horizon toward
    # the viewer, its width proportional to depth so it reads as one band.
    zs = sweep_z(t)
    life = smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.80, t)
    band = np.exp(-((Zr - zs) / (0.09 * zs)) ** 2) * life
    trail = np.exp(-np.maximum(Zr - zs, 0) / (0.5 * zs)) * (Zr > zs) * life
    floor_lit = floor_amt * (1.0 + (2.6 * band + 0.45 * trail) * S.calm2)
    sweep_soft = np.where(fl, (0.08 * band + 0.018 * trail) * fog ** 0.5, 0.0)

    # The floor picks up the horizon glow near the vanishing point.
    reflect = np.exp(-((S.xs - VP_X) / (0.25 * W)) ** 2) * fog ** 0.6
    layers.append(("floor", 0.13 * floor_lit * (0.35 + 1.0 * reflect) * calm, ACCENT))
    layers.append(("floor_hot", 0.04 * floor_lit * reflect * calm, ICE))
    layers.append(("sheen", np.where(fl, 0.006 * reflect * fog, 0.0) * calm, BRAND))
    layers.append(("sweep", sweep_soft * S.calm2, ACCENT))

    # --- skyline: floor-locked pillars that rise and sink ------------------
    pil = Canvas()
    cap = Canvas()
    for p in S.sky_cells:
        zr = (p["row"] - cz - SKY_NEAR) % TRAVEL + SKY_NEAR
        u = (zr - SKY_NEAR) / TRAVEL           # 0 at the near edge, 1 at the far
        env = math.sin(math.pi * u) ** 2       # rises from the floor, sinks back
        if env < 1e-3:
            continue
        amt = env * p["b"] * math.exp(-zr / FOG)
        hgt = p["h"] * env ** 0.7
        x0, yf = project(p["x"] - 0.04, 0.0, zr, cam)
        x1, yt = project(p["x"] + 0.04, hgt, zr, cam)
        lit = math.exp(-((zr - zs) / (0.09 * zs)) ** 2) * life
        # A pillar is brightest at its top and fades into the floor.
        n_seg = 5
        for k in range(n_seg):
            y0 = yt + (yf - yt) * k / n_seg
            y1 = yt + (yf - yt) * (k + 1) / n_seg
            pil.box(x0, x1, y0, y1, amt * 0.40 * (1 - 0.8 * k / n_seg) * (1 + 2.0 * lit))
        cap.box(x0, x1, yt, yt + max(1.0, (yf - yt) * 0.08), amt * (1 + 1.5 * lit))
    layers.append(("pillar", 0.26 * pil.a * calm, ACCENT))
    layers.append(("pillar_cap", 0.28 * cap.a * calm, ICE))

    # --- the chart ---------------------------------------------------------
    C = S.chart
    fill, edge, hot, stem, curve = (Canvas() for _ in range(5))
    pulse_s = -0.2 + 1.4 * t                    # off both ends at the seam
    xs_c, ye_c, ze_c, al_c = [], [], [], []
    for j in range(CHART_N):
        zr = C["z"][j]
        s = C["s"][j]
        alpha = smoothstep(0.0, 0.22, s) * math.exp(-zr / (FOG * 1.6))
        alpha *= 0.90 + 0.10 * math.sin(phase(t) + C["ph"][j])
        o, c, hi, lo = C["open"][j], C["close"][j], C["high"][j], C["low"][j]
        X = C["x"][j]
        xl, yo = project(X - CANDLE_W / 2, o, zr, cam)
        xr, yc = project(X + CANDLE_W / 2, c, zr, cam)
        xm, yh = project(X, hi, zr, cam)
        _, yl = project(X, lo, zr, cam)
        _, yf = project(X, 0.0, zr, cam)
        _, ye = project(X, C["ema"][j], zr, cam)
        top, bot = min(yo, yc), max(yo, yc)
        bot = max(bot, top + 1.0)
        px = FOCAL / zr
        sw = max(1.0, 0.016 * px)
        ww = max(1.0, 0.011 * px)
        lit = math.exp(-((s - pulse_s) / 0.05) ** 2)
        up = c >= o
        # Up candles are filled, down candles hollow: direction without hue.
        fill.box(xl, xr, top, bot, alpha * (0.55 if up else 0.07))
        edge.frame(xl, xr, top, bot, sw, alpha)
        edge.box(xm - ww / 2, xm + ww / 2, yh, top, alpha * 0.8)
        edge.box(xm - ww / 2, xm + ww / 2, bot, yl, alpha * 0.8)
        hot.box(xl, xr, top, bot, alpha * lit)
        # The projection: a hairline down to the floor, fading as it falls.
        n_seg = 4
        for k in range(n_seg):
            y0 = yl + (yf - yl) * k / n_seg
            y1 = yl + (yf - yl) * (k + 1) / n_seg
            stem.box(xm - 0.5, xm + 0.5, y0, y1, alpha * 0.11 * (1 - k / n_seg))
        xs_c.append(xm)
        ye_c.append(ye)
        ze_c.append(zr)
        al_c.append(alpha)
    # The average, through the candles, with the pulse riding on it.
    for j in range(CHART_N - 1):
        a0, a1 = al_c[j], al_c[j + 1]
        s0, s1 = C["s"][j], C["s"][j + 1]
        l0 = math.exp(-((s0 - pulse_s) / 0.045) ** 2)
        l1 = math.exp(-((s1 - pulse_s) / 0.045) ** 2)
        wdt = max(1.2, 0.02 * FOCAL / ze_c[j])
        curve.segment(xs_c[j], ye_c[j], xs_c[j + 1], ye_c[j + 1], wdt,
                      a0 * (0.55 + 1.6 * l0), a1 * (0.55 + 1.6 * l1))

    layers.append(("c_fill", 0.42 * fill.a * calm, BRAND))
    layers.append(("c_edge", 0.65 * edge.a * calm, ACCENT))
    layers.append(("c_hot", 0.70 * hot.a * calm, SELL))
    layers.append(("c_stem", 0.45 * stem.a * calm, ACCENT))
    layers.append(("c_curve", 0.60 * curve.a * calm, ICE))
    # A backlight: the hologram lights the air around it, which is what
    # separates it from the stars behind instead of sitting on them.
    aura = gaussian_filter(edge.a[::4, ::4] + fill.a[::4, ::4], 7.0)
    aura = zoom(aura, 4, order=1)[:H, :W]
    layers.append(("c_aura", 0.55 * aura * calm, EMBER))

    # --- dust and stars ----------------------------------------------------
    pts = Canvas()
    soft = Canvas(W // 4, H // 4)               # out-of-focus near motes
    D = S.dust
    f = (D["u"] + t * D["k"]) % 1.0
    zr = D["z0"] + D["d"] * (1.0 - f)
    a = np.sin(math.pi * f) ** 2 * D["b"] * np.exp(-zr / FOG)
    x = VP_X + FOCAL * (D["x"] - cx) / zr
    y = HORIZON_Y - FOCAL * (D["y"] - cy) / zr
    for xi, yi, ai, zi in zip(x, y, a, zr):
        if not (-20 < xi < W + 20 and -20 < yi < H + 20) or ai < 2e-3:
            continue
        if zi < 6.0:
            soft.box(xi / 4 - 0.75, xi / 4 + 0.75, yi / 4 - 0.75, yi / 4 + 0.75, ai * 0.6)
        else:
            r_ = max(0.55, min(1.5, 9.0 / zi))
            pts.box(xi - r_, xi + r_, yi - r_, yi + r_, ai / (r_ * r_) ** 0.35)
    soft_up = zoom(gaussian_filter(soft.a, 1.6), 4, order=1)[:H, :W]
    layers.append(("dust", 0.50 * pts.a * (0.25 + 0.75 * calm), ICE))
    layers.append(("dust_soft", 0.30 * soft_up * (0.2 + 0.8 * calm), ACCENT))

    st = S.stars
    tw = 0.65 + 0.35 * np.sin(phase(t) * st["k"] + st["ph"])
    sp = Canvas()
    for xi, yi, bi in zip(st["x"], st["y"], st["b"] * tw):
        sp.box(xi - 0.6, xi + 0.6, yi - 0.6, yi + 0.6, bi)
    layers.append(("stars", 0.32 * sp.a, ICE))
    return layers


def _bloom(img: np.ndarray) -> np.ndarray:
    """Three-radius bloom of the bright parts, computed at half resolution.

    Only what is bright blooms: the grid's thousands of faint lines would
    otherwise blur into a blue fog over the whole frame — including the part
    the headline sits on.
    """
    lum = img.mean(axis=-1, keepdims=True)
    hot = img * smoothstep(0.015, 0.25, lum)
    lo = hot.reshape(H // 2, 2, W // 2, 2, 3).mean(axis=(1, 3))
    out = np.zeros_like(lo)
    for sigma, wgt in ((3.0, 0.45), (12.0, 0.30), (40.0, 0.16)):
        out += wgt * gaussian_filter(lo, (sigma / 2, sigma / 2, 0))
    return zoom(out, (2, 2, 1), order=1)[:H, :W]


def render_frame(i: int) -> np.ndarray:
    t = (i % FRAMES) / FRAMES
    E = np.zeros((H, W, 3), np.float32)
    for _name, amt, tint in render_layers(t):
        E += amt[..., None] * tint[None, None, :]
    E += _bloom(E)
    bg = BG[None, None, :]
    # Light adds to the page and rolls off into white instead of clipping, so
    # the hottest cores go ice-white while their halo stays brand blue.
    out = bg + (1.0 - np.exp(-E * 2.2)) * (1.0 - bg)
    srgb = np.where(out <= 0.0031308, out * 12.92,
                    1.055 * np.power(np.maximum(out, 0), 1 / 2.4) - 0.055)
    rng = np.random.default_rng(SEED + i % FRAMES)
    dither = rng.random((H, W, 1), np.float32) - rng.random((H, W, 1), np.float32)
    v = srgb * 255.0 + static().grain[..., None] * GRAIN + dither * 0.8
    return np.clip(np.rint(v), 0, 255).astype(np.uint8)


# ------------------------------------------------------------- outputs
def _frames_to_dir(frames, outdir: Path, procs: int) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    frames = list(frames)
    with get_context("fork").Pool(procs) as pool:
        for i, arr in zip(frames, pool.imap(render_frame, frames, chunksize=2)):
            Image.fromarray(arr).save(outdir / f"f{i:04d}.png", compress_level=1)


def _ffmpeg(*args: str) -> None:
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args],
                   check=True)


def encode(frame_dir: Path, mp4_kbps: int, webm_kbps: int) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    src = ["-framerate", str(FPS), "-i", str(frame_dir / "f%04d.png")]
    # Tagged BT.709, the matrix the scaler converts with, so a browser does
    # not guess — an untagged file can be read as BT.601 and land a shade off
    # the page background it is masked into.
    tags = ["-colorspace", "bt709", "-color_primaries", "bt709",
            "-color_trc", "bt709", "-color_range", "tv"]
    vf = ("scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,"
          "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv")
    mp4 = OUT_DIR / "hero-loop.mp4"
    webm = OUT_DIR / "hero-loop.webm"
    with tempfile.TemporaryDirectory() as tmp:
        log = str(Path(tmp) / "x264")
        common = [*src, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryslow",
                  # High@4.0 matches the `avc1.640028` codecs string in the page's <source type>
                  # (avc1.640028); a browser may refuse a file whose stream
                  # claims more than its `type` promised.
                  "-profile:v", "high", "-level:v", "4.0", "-b:v", f"{mp4_kbps}k",
                  "-x264-params", "aq-mode=3:aq-strength=1.0:deblock=-1,-1",
                  "-g", str(FRAMES), *tags, "-passlogfile", log]
        _ffmpeg(*common, "-pass", "1", "-f", "mp4", os.devnull)
        _ffmpeg(*common, "-pass", "2", "-movflags", "+faststart", str(mp4))
        log = str(Path(tmp) / "vp9")
        common = [*src, "-vf", vf, "-an", "-c:v", "libvpx-vp9", "-b:v", f"{webm_kbps}k",
                  "-deadline", "good", "-cpu-used", "1", "-row-mt", "1",
                  "-auto-alt-ref", "1", "-lag-in-frames", "25", "-aq-mode", "0",
                  "-g", str(FRAMES), *tags, "-passlogfile", log]
        _ffmpeg(*common, "-pass", "1", "-f", "webm", os.devnull)
        _ffmpeg(*common, "-pass", "2", str(webm))
    # The poster is frame 0, which is also the frame playback starts on, so
    # the hand-over from poster to video has nothing to cross-fade.
    poster = OUT_DIR / "hero-poster.jpg"
    Image.open(frame_dir / "f0000.png").convert("RGB").save(
        poster, "JPEG", quality=84, optimize=True, progressive=True)


def contact_sheet(paths, dest: Path, cols: int = 3) -> None:
    ims = [Image.open(p) for p in paths]
    tw, th = W // 3, H // 3
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * 8, rows * th + (rows + 1) * 8),
                      (40, 40, 40))
    for k, im in enumerate(ims):
        r, c = divmod(k, cols)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (8 + c * (tw + 8), 8 + r * (th + 8)))
    sheet.save(dest)


def check_seam() -> None:
    """Print the seam: frame 0 against the frame after the last (identical
    by construction, so a non-zero here is a motion that is not periodic),
    and the last->first step against an ordinary step (the per-frame dither
    alone makes both non-zero; they should match)."""
    first = render_frame(0).astype(np.float32)
    after_last = render_frame(FRAMES).astype(np.float32)
    last = render_frame(FRAMES - 1).astype(np.float32)
    second = render_frame(1).astype(np.float32)
    print(f"frame 0 vs frame {FRAMES} (the one after the last): "
          f"max abs diff {np.abs(after_last - first).max():.1f}")
    print(f"mean abs step last->first {np.abs(first - last).mean():.3f}, "
          f"0->1 {np.abs(second - first).mean():.3f}")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--preview", metavar="DIR", help="render five stills + a contact sheet")
    p.add_argument("--frames", metavar="LIST",
                   help="with --preview: comma-separated frame numbers to render")
    p.add_argument("--check-seam", action="store_true")
    p.add_argument("--procs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    p.add_argument("--keep-frames", metavar="DIR",
                   help="keep the rendered PNG sequence here instead of a temp dir")
    p.add_argument("--mp4-kbps", type=int, default=1050)
    p.add_argument("--webm-kbps", type=int, default=850)
    a = p.parse_args(argv)

    if a.check_seam:
        check_seam()
        return 0
    if a.preview:
        d = Path(a.preview)
        idx = ([int(x) for x in a.frames.split(",")] if a.frames else
               [0, FRAMES // 4, FRAMES // 2, 3 * FRAMES // 4, FRAMES - 1])
        _frames_to_dir(idx, d, a.procs)
        contact_sheet([d / f"f{i:04d}.png" for i in idx], d / "contact.png")
        print(f"stills in {d}")
        return 0
    if not Path(FFMPEG).exists() and shutil.which(FFMPEG) is None:
        print("ffmpeg not found on PATH", file=sys.stderr)
        return 1
    if a.keep_frames:
        _frames_to_dir(range(FRAMES), Path(a.keep_frames), a.procs)
        encode(Path(a.keep_frames), a.mp4_kbps, a.webm_kbps)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            _frames_to_dir(range(FRAMES), Path(tmp), a.procs)
            encode(Path(tmp), a.mp4_kbps, a.webm_kbps)
    for name in ("hero-loop.mp4", "hero-loop.webm", "hero-poster.jpg"):
        f = OUT_DIR / name
        print(f"{f.relative_to(REPO_ROOT)}  {f.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
