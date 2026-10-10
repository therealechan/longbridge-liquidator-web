#!/usr/bin/env python3
"""Render the landing page's looping hero background video. HAND-RUN.

"Ledger flow": the product's story, one position at a time.

What it draws
-------------
A tall ledger of positions — ticker, quantity, price, market value, in Geist
Mono — drifting slowly upward in three columns at three depths. The far
columns are smaller, dimmer and out of focus; the near one is sharp. Every
~1.7 s the near-column row crossing the "fill line" (a little above the
middle) is sold: a faint red highlight sweeps across it, a tiny
``SELL · FILLED`` mark appears at its end, then the row dissolves into grain
and drifts off, and the rows below step up to close the gap. Prices tick now
and then; a very soft horizontal sheen passes down the frame once a loop.

Rules, taken from the product's design system (DESIGN_GUIDELINE.md):

* **Monochrome.** Greys and white only, never above ~70 % white. The single
  hue is a faint red, and only on a fill — red is the product's "sell"
  colour and its one accent on the landing page.
* **The copy owns the left.** The headline, lede and buttons sit in the left
  ~60 % of a 1240 px column, so the ledger lives right of it and fades out
  toward the left. The page fades the video's bottom away and lays the
  product screenshot over it, so the ledger dims toward the bottom too.
* **Texture, not copy.** The text is small and slightly soft; it should read
  as a ledger, not be read.
* **Same background as the page.** ``BG`` is the dark ``--background``
  (#0a0a0a); the page lays the video over itself with ``mix-blend-mode:
  lighten`` and masks its bottom edge, so the two must match.

Why it loops without a seam
---------------------------
Each column is a list of rows ``m`` whose content repeats every ``P`` rows.
Above the fill line a column moves exactly ``RHO`` rows per loop. In the
near column every third row is sold (``P = RHO + EVENTS``), and a row's
position is ``survivors_above(m) - RHO * t + (sales above it still to
close)``; one loop later row ``m + P`` stands exactly where row ``m`` stood,
with the same content, mid-way through the same event. Price ticks and the
dissolve grain are functions of a row's position and identity, the sheen
crosses the frame once per loop off-screen at both ends. ``--check-seam``
renders t = 1.0 *without* wrapping it to 0 and compares it with frame 0.

Usage
-----
    python3 site/scripts/build_hero_video.py               # -> site/public/video/hero-loop.*
    python3 site/scripts/build_hero_video.py --preview DIR # five stills + a contact sheet
    python3 site/scripts/build_hero_video.py --check-seam  # print the loop-seam error

Outputs: ``hero-loop.mp4`` (H.264 High@4.0, faststart), ``hero-loop.webm``
(VP9) and ``hero-poster.jpg`` (frame 0, so poster -> video has no jump).
Needs numpy, scipy, Pillow (with FreeType) and ffmpeg with libx264 and
libvpx-vp9; the font is Geist Mono from ``site/node_modules/@fontsource``.
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
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter, zoom

SITE_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = SITE_ROOT
OUT_DIR = SITE_ROOT / "public" / "video"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FONT_DIR = SITE_ROOT / "node_modules" / "@fontsource" / "geist-mono" / "files"

# ---------------------------------------------------------------- the format
W, H = 1600, 900
FPS = 24
SECONDS = 10
FRAMES = FPS * SECONDS
SEED = int(os.environ.get("HERO_SEED", "7"))

# ---------------------------------------------------------------- the palette
def _lin(hexcode: str) -> np.ndarray:
    c = np.array([int(hexcode[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


BG = _lin("#0a0a0a")            # --background (dark)
INK = _lin("#d4d4d8")           # ledger text: a light, very slightly cool grey
RED = _lin("#ef4444")           # the sell colour, used faintly
GRAIN = 1.4                     # fixed grain, in 8-bit levels (std)

# ---------------------------------------------------------------- the ledger
# Each column: where it sits, how big, how fast (RHO rows per loop above the
# fill line), how soft, how bright. ``events`` sells every third row.
EVENTS = 6                      # sales per loop, near column only
FILL_Y = 0.43 * H               # the fill line
COLUMNS = [
    # far, left of the near column, fading out toward the copy
    dict(name="far", x0=912, size=10, weight=300, pitch=15.0, rho=10,
         blur=1.7, gain=0.075, events=False, fields=3),
    # mid, right of the near column, cut by the frame edge
    dict(name="mid", x0=1546, size=12, weight=300, pitch=17.5, rho=11,
         blur=1.1, gain=0.11, events=False, fields=4),
    # near, sharp, where the sales happen
    dict(name="near", x0=1084, size=15, weight=400, pitch=20.0, rho=12,
         blur=0.55, gain=0.25, events=True, fields=4),
]
VARIANTS = 5                    # price ticks pre-rendered per row
TICK_ROWS = 3.0                 # a row's price may tick every 3 rows of travel

# Event timing, in seconds after the sold row reaches the fill line.
SWEEP = (0.00, 0.42)            # red highlight sweeps left -> right
MARK = (0.34, 0.52)             # "SELL · FILLED" fades in
FADE = (0.62, 1.30)             # row (and highlight) dissolve
CLOSE = (0.98, 1.58)            # rows below step up into the gap
# Frame 0 (the poster) lands mid-sale: highlight drawn, mark appearing.
EVENT_LEAD = 0.48

TICKERS = [
    ("AAPL.US", 228.0, 10), ("00700.HK", 512.0, 100), ("TSLA.US", 251.0, 10),
    ("NVDA.US", 131.0, 50), ("9988.HK", 98.4, 100), ("META.US", 583.0, 5),
    ("TSM.US", 188.0, 20), ("ASML.US", 812.0, 5), ("MSFT.US", 418.0, 5),
    ("AMZN.US", 186.0, 20), ("3690.HK", 162.3, 100), ("GOOGL.US", 165.0, 20),
    ("1810.HK", 25.85, 200), ("AMD.US", 159.0, 20), ("NFLX.US", 721.0, 5),
    ("0388.HK", 342.6, 100), ("AVGO.US", 172.0, 20), ("PDD.US", 141.0, 20),
    ("COIN.US", 204.0, 10), ("2318.HK", 49.6, 500), ("ORCL.US", 171.0, 10),
    ("0005.HK", 68.9, 400), ("JPM.US", 214.0, 10), ("1211.HK", 278.0, 100),
    ("PLTR.US", 41.2, 100), ("0941.HK", 72.1, 500), ("BABA.US", 102.0, 50),
    ("9618.HK", 147.5, 100), ("SHOP.US", 79.8, 50), ("V.US", 279.0, 10),
    ("0883.HK", 18.6, 1000), ("ARM.US", 147.0, 20), ("UBER.US", 74.3, 50),
    ("1299.HK", 66.4, 200), ("CRM.US", 286.0, 10), ("SMCI.US", 43.7, 100),
]


# ------------------------------------------------------------- small helpers
def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def sstep(e0, e1, x: float) -> float:
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def ease(e0, e1, x: float) -> float:
    """Smootherstep: zero velocity *and* acceleration at both ends."""
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * t * (t * (6 * t - 15) + 10)


def phase(t, k=1):
    return 2 * math.pi * k * t


def _font(size: int, weight: int) -> ImageFont.FreeTypeFont:
    for ext in ("woff2", "woff"):
        f = FONT_DIR / f"geist-mono-latin-{weight}-normal.{ext}"
        if f.exists():
            try:
                return ImageFont.truetype(str(f), size)
            except OSError:
                pass
    sys.exit(f"Geist Mono not found or unreadable in {FONT_DIR} (run npm ci in site/)")


def _text(font, s: str, w: int, h: int, x: float = 0, y: float = 0) -> np.ndarray:
    im = Image.new("L", (w, h), 0)
    ImageDraw.Draw(im).text((x, y), s, fill=255, font=font)
    return np.asarray(im, np.float32) / 255.0


class Canvas:
    """A float layer that sprites are added into at sub-pixel y."""

    def __init__(self, w=W, h=H):
        self.a = np.zeros((h, w), np.float32)
        self.w, self.h = w, h

    def blit(self, spr: np.ndarray, x: int, y: float, amt: float) -> None:
        if amt <= 1e-4:
            return
        h, w = spr.shape
        iy = math.floor(y)
        f = y - iy
        # Two-tap vertical resample: rows glide instead of stepping a pixel.
        p = np.zeros((h + 1, w), np.float32)
        p[:h] += (1 - f) * spr
        p[1:] += f * spr
        y0, y1 = iy, iy + h + 1
        x0, x1 = x, x + w
        sy0, sx0 = max(0, -y0), max(0, -x0)
        y0, x0 = max(y0, 0), max(x0, 0)
        y1, x1 = min(y1, self.h), min(x1, self.w)
        if y1 <= y0 or x1 <= x0:
            return
        self.a[y0:y1, x0:x1] += amt * p[sy0:sy0 + (y1 - y0), sx0:sx0 + (x1 - x0)]

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


# ------------------------------------------------------------- static scene
def _fmt_qty(q: int) -> str:
    return f"{q:,}"


def _fmt_px(p: float) -> str:
    return f"{p:,.3f}" if p < 10 else f"{p:,.2f}"


class Column:
    """One column's rows: content, pre-rendered sprites, layout."""

    def __init__(self, spec: dict, rng: np.random.Generator):
        self.__dict__.update(spec)
        self.P = self.rho + (EVENTS if self.events else 0)
        font = _font(self.size, self.weight)
        cw = font.getlength("0")
        self.cw = cw
        asc, desc = font.getmetrics()
        self.sh = int(asc + desc + 2)
        # Field layout, in characters: ticker | qty | price | value.
        self.cols = (0, 9, 16, 26)               # start char of each field
        self.widths = (9, 6, 9, 12)              # right edges for right-aligned
        self.chars = 38 if self.fields == 4 else 25
        self.sw = int(math.ceil(cw * self.chars)) + 2
        picks = rng.permutation(len(TICKERS))
        self.rows = []
        for k in range(self.P):
            sym, px, lot = TICKERS[picks[k % len(TICKERS)]]
            qty = int(lot * rng.integers(1, 40 if lot < 100 else 20))
            px = px * float(np.exp(rng.normal(0, 0.06)))
            # Price variants: small random walk, so a tick moves the last
            # digits and occasionally the value's thousands.
            walk = np.cumsum(rng.normal(0, 0.0016, VARIANTS))
            walk -= walk[0]
            vs = [px * (1 + w) for w in walk]
            self.rows.append(dict(sym=sym, qty=qty, px=vs,
                                  tick_off=float(rng.uniform(0, 1)),
                                  b=float(rng.uniform(0.80, 1.0))))
        self.sprites = []
        for r in self.rows:
            per = []
            for v in range(VARIANTS):
                per.append(self._render(font, r["sym"], r["qty"], r["px"][v]))
            self.sprites.append(per)

    def _render(self, font, sym, qty, px):
        cw, sw, sh = self.cw, self.sw, self.sh
        q, p, val = _fmt_qty(qty), _fmt_px(px), f"{qty * px:,.2f}"
        out = np.zeros((sh, sw), np.float32)
        # The ticker is the brightest field, the numbers a step down.
        out += 1.00 * _text(font, sym, sw, sh, 0, 0)
        out += 0.72 * _text(font, q, sw, sh, cw * (self.cols[1] + self.widths[1] - len(q)), 0)
        out += 0.72 * _text(font, p, sw, sh, cw * (self.cols[2] + self.widths[2] - len(p)), 0)
        if self.fields == 4:
            out += 0.62 * _text(font, val, sw, sh, cw * (self.cols[3] + self.widths[3] - len(val)), 0)
        return out

    # The layout ------------------------------------------------------------
    def doomed(self, m: int) -> bool:
        return self.events and m % 3 == 2

    def survivors_before(self, m: int) -> int:
        return m - (m // 3) if self.events else m

    def event_time(self, d: int) -> float:
        """Loop time at which sold row ``d`` reaches the fill line."""
        return self.survivors_before(d) / self.rho

    def layout(self, t: float):
        """Yield (m, u, event_age_seconds|None) for rows that can be on
        screen; ``u`` is the row's offset from the fill line in pitches."""
        top = -FILL_Y / self.pitch - 3
        bot = (H - FILL_Y) / self.pitch + 3
        if not self.events:
            m0 = math.floor(self.rho * t + top)
            for m in range(m0, m0 + int(bot - top) + 3):
                yield m, m - self.rho * t, None
            return
        # Start well above the screen, where every earlier sale has closed.
        m = math.floor(1.5 * (self.rho * t + top)) - 9
        pending = 0.0
        while True:
            u = self.survivors_before(m) - self.rho * t + pending
            if u > bot:
                break
            age = None
            if self.doomed(m):
                age = (t - self.event_time(m)) * SECONDS + EVENT_LEAD
                pending += 1.0 - ease(*CLOSE, age)
            if u >= top:
                yield m, u, age
            m += 1


class Static:
    """Everything that does not depend on time, computed once per worker."""

    def __init__(self):
        rng = np.random.default_rng(SEED)
        self.columns = [Column(c, rng) for c in COLUMNS]
        self.near = self.columns[-1]

        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        nx, ny = (xs + 0.5) / W, (ys + 0.5) / H
        # Composition: dark under the copy, full right of it; dim toward the
        # bottom (the page fades it away there anyway) and the top edge.
        self.mask = (smoothstep(0.55, 0.72, nx) * smoothstep(1.03, 0.94, nx)
                     * (1.0 - 0.72 * smoothstep(0.42, 0.98, ny))
                     * smoothstep(0.00, 0.16, ny)).astype(np.float32)
        # The near column is in focus around the fill line.
        self.focus = (0.20 + 0.80 * np.exp(-((ys - FILL_Y) / (0.19 * H)) ** 2)).astype(np.float32)
        self.sharp = np.exp(-((ys - FILL_Y) / (0.17 * H)) ** 2).astype(np.float32)
        self.ys = ys

        # "SELL · FILLED", tiny, letter-spaced.
        f = _font(10, 500)
        im = Image.new("L", (110, 16), 0)
        d = ImageDraw.Draw(im)
        x = 0.0
        for word in ("SELL", None, "FILLED"):
            if word is None:            # the middle dot: the subset lacks it
                d.rectangle((x + 3, 7, x + 4, 8), fill=255)
                x += 9.0
                continue
            for ch in word:
                d.text((x, 1), ch, fill=255, font=f)
                x += f.getlength(ch) + 1.2
        self.mark = np.asarray(im, np.float32)[:, :int(x) + 2] / 255.0

        # Dissolve noise: coarse-ish grain the row breaks up into.
        n = rng.random((64, 800)).astype(np.float32)
        n = gaussian_filter(n, 0.7)
        self.dnoise = (n - n.min()) / (np.ptp(n) + 1e-6)
        # Specks shed by a dissolving row, per sale (indexed by m mod P).
        self.specks = [dict(x=rng.uniform(0, 1, 26), y=rng.uniform(0, 1, 26),
                            rise=rng.uniform(8, 34, 26), b=rng.uniform(0.3, 1, 26),
                            lag=rng.uniform(0, 0.35, 26))
                       for _ in range(self.near.P)]

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
def sheen_y(t: float) -> float:
    """The sheen's centre: above the frame at t=0, below it at t=1."""
    return -250 + (H + 500) * t


def render_layers(t: float):
    S = static()
    ink, red, glow = Canvas(), Canvas(), Canvas()
    ys_sheen = sheen_y(t)
    for col in S.columns:
        lay = Canvas()
        for m, u, age in col.layout(t):
            rid = m % col.P
            row = col.rows[rid]
            y = FILL_Y + u * col.pitch - col.sh * 0.62
            # Price ticks: a function of identity and position only.
            ph = u / TICK_ROWS + row["tick_off"]
            k = math.floor(ph)
            var = (k * 7 + rid * 3) % VARIANTS
            since = ph - k                        # 0 just after a tick
            amt = col.gain * row["b"] * (1.0 + 0.35 * math.exp(-since / 0.06))
            spr = col.sprites[rid][var]
            if age is None:
                lay.blit(spr, col.x0, y, amt)
                continue
            # --- a sale -------------------------------------------------
            fade = sstep(*FADE, age)
            if age < SWEEP[0] - 0.05:
                lay.blit(spr, col.x0, y, amt)
                continue
            lift = 9.0 * sstep(FADE[0], FADE[1] + 0.3, age)
            hot = sstep(-0.05, 0.10, age) * (1 - fade)
            if 0 < fade < 1:
                hgt, wid = spr.shape
                n = S.dnoise[(m * 13) % 40:(m * 13) % 40 + hgt, :wid]
                keep = smoothstep(fade - 0.18, fade + 0.02, n) * (1 - 0.6 * fade)
                spr = spr * keep
            if fade < 1:
                lay.blit(spr, col.x0, y - lift, amt * (1.0 + 0.55 * hot))
            # The highlight: a band behind the row, its leading edge hot.
            x_l = col.x0 - 10
            x_r = col.x0 + col.cw * col.chars + 8
            sw = ease(*SWEEP, age)
            if SWEEP[0] <= age and fade < 1:
                xe = x_l + (x_r - x_l) * sw
                yc = FILL_Y + u * col.pitch - lift
                y0, y1 = yc - col.pitch * 0.46, yc + col.pitch * 0.46
                band = (1 - fade) ** 1.5
                red.box(x_l, xe, y0, y1, 0.024 * band)
                edge = math.sin(math.pi * sw) if sw < 1 else 0.0
                red.box(xe - 1.5, xe + 0.5, y0, y1, 0.55 * edge * band)
                glow.box(xe - 3, xe + 1, y0, y1, 0.35 * edge * band)
                # A hairline under the sold row, as on a ruled ledger.
                red.box(x_l, xe, y1 - 1, y1, 0.10 * band)
                mk = sstep(*MARK, age) * (1 - fade)
                if mk > 0:
                    mh, mw = S.mark.shape
                    red.blit(S.mark, int(x_r + 10), yc - mh * 0.55, 0.42 * mk)
            # Specks: the row's grain drifting up as it goes.
            if FADE[0] < age < FADE[1] + 0.8:
                sp = S.specks[rid]
                for sx, sy, rise, b, lag in zip(sp["x"], sp["y"], sp["rise"], sp["b"], sp["lag"]):
                    p = sstep(FADE[0] + lag, FADE[1] + 0.35 + lag, age)
                    if p <= 0 or p >= 1:
                        continue
                    px_ = col.x0 + sx * col.cw * col.chars
                    py_ = y + sy * col.sh - lift - rise * p
                    glow.box(px_ - 0.6, px_ + 0.6, py_ - 0.6, py_ + 0.6,
                             0.22 * b * math.sin(math.pi * p))
        # Depth of field. The near column is racked to the fill line: sharp
        # there, softening and dimming above and below it.
        a = gaussian_filter(lay.a, col.blur)
        if col.events:
            soft = gaussian_filter(lay.a, 2.3)
            a = (a * S.sharp + soft * (1 - S.sharp)) * S.focus
        ink.a += a
    # The sheen: a soft horizontal band passing down once a loop, lifting the
    # ink it crosses, with a hairline at its centre.
    dy = S.ys - ys_sheen
    # Cut off at 3.3 sigma, so it is exactly nothing at the seam.
    band = np.exp(-(dy / 70.0) ** 2) * (np.abs(dy) < 230)
    line = np.exp(-(dy / 0.9) ** 2)
    ink.a *= 1.0 + 0.55 * band
    return [
        ("ink", ink.a * S.mask, INK),
        ("sheen", (0.0035 * band + 0.012 * line) * S.mask, INK),
        ("red", red.a * S.mask, RED),
        ("glow", glow.a * S.mask, INK),
    ]


def _bloom(img: np.ndarray) -> np.ndarray:
    """Three-radius bloom of what is fed in, computed at half resolution."""
    lo = img.reshape(H // 2, 2, W // 2, 2, 3).mean(axis=(1, 3))
    out = np.zeros_like(lo)
    for sigma, wgt in ((3.0, 0.55), (12.0, 0.35), (40.0, 0.20)):
        out += wgt * gaussian_filter(lo, (sigma / 2, sigma / 2, 0))
    return zoom(out, (2, 2, 1), order=1)[:H, :W]


def frame_linear(t: float) -> np.ndarray:
    E = np.zeros((H, W, 3), np.float32)
    B = np.zeros((H, W, 3), np.float32)
    for name, amt, tint in render_layers(t):
        c = amt[..., None] * tint[None, None, :]
        E += c
        # Only the sale blooms; the ink would haze the whole column.
        if name in ("red", "glow"):
            B += c
        elif name == "ink":
            B += 0.08 * c
    return E + _bloom(B)


def render_frame(i: int, wrap: bool = True) -> np.ndarray:
    t = ((i % FRAMES) if wrap else i) / FRAMES
    E = frame_linear(t)
    bg = BG[None, None, :]
    # Light adds to the page and rolls off instead of clipping.
    out = bg + (1.0 - np.exp(-E * 1.15)) * (1.0 - bg)
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
                  # High@4.0 matches the `avc1.640028` codecs string in the
                  # page's <source type>; a browser may refuse a file whose
                  # stream claims more than its `type` promised.
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
    """Print the seam: frame 0 against t = 1.0 rendered *unwrapped* (so a
    non-zero here is a motion that is not periodic), and the last->first
    step against an ordinary step (they should be alike)."""
    first = render_frame(0).astype(np.float32)
    after_last = render_frame(FRAMES, wrap=False).astype(np.float32)
    last = render_frame(FRAMES - 1).astype(np.float32)
    second = render_frame(1).astype(np.float32)
    print(f"frame 0 vs t=1.0 (unwrapped, the one after the last): "
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
