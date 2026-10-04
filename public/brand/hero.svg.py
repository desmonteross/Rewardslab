"""
Draw an apartment block at dusk, as vector geometry.

Not a photograph and not pretending to be one: flat layered silhouettes, the
way an architectural print reads. Depth comes from each layer sitting a step
lighter than the one behind it, and life comes from the lit windows — dealt
out pseudo-randomly from a fixed seed so the picture is the same every build.
"""
import random

random.seed(20260925)

W, H = 1600, 900
out = []
def add(s): out.append(s)

# --- palette, all sitting on the app's panel green -------------------------
SKY_TOP   = '#04150f'
SKY_MID   = '#0b2a1d'
GLOW      = '#2d7d52'
EMBER     = '#c98a3e'
FAR       = '#0b2519'
MID       = '#0f3526'
NEAR      = '#14432f'
FRONT     = '#193f2e'
SLAB      = '#1d5a3f'
RAIL      = '#7fc9a1'
FOLIAGE   = '#071c13'
LIT_WARM  = '#f0c46d'
LIT_LIME  = '#d0f05c'
DARKGLASS = '#0a2a1d'

add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
    f'role="img" aria-label="Illustration of an apartment block at dusk">')
add('<defs>')
add(f'''<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="{SKY_TOP}"/>
  <stop offset="46%" stop-color="{SKY_MID}"/>
  <stop offset="78%" stop-color="{GLOW}" stop-opacity="0.50"/>
  <stop offset="100%" stop-color="{EMBER}" stop-opacity="0.30"/>
</linearGradient>''')
add(f'''<radialGradient id="sun" cx="0.70" cy="0.68" r="0.48">
  <stop offset="0%" stop-color="{EMBER}" stop-opacity="0.55"/>
  <stop offset="40%" stop-color="{EMBER}" stop-opacity="0.16"/>
  <stop offset="100%" stop-color="{EMBER}" stop-opacity="0"/>
</radialGradient>''')
add('''<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#0a2a1e" stop-opacity="0"/>
  <stop offset="100%" stop-color="#04150f" stop-opacity="0.9"/>
</linearGradient>''')
add('<filter id="soft"><feGaussianBlur stdDeviation="9"/></filter>')
add('</defs>')

# --- sky -------------------------------------------------------------------
add(f'<rect width="{W}" height="{H}" fill="url(#sky)"/>')
add(f'<rect width="{W}" height="{H}" fill="url(#sun)"/>')

# a low sun, mostly hidden behind the skyline
add(f'<circle cx="{int(W*0.70)}" cy="{int(H*0.665)}" r="62" fill="{EMBER}" opacity="0.40" filter="url(#soft)"/>')

# a scatter of early stars, thinning towards the horizon
for _ in range(46):
    x = random.uniform(0, W)
    y = random.uniform(0, H * 0.42)
    r = random.choice([0.9, 1.1, 1.4])
    o = 0.10 + 0.32 * (1 - y / (H * 0.42))
    add(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="#ffffff" opacity="{o:.2f}"/>')

def windows(x, y, w, h, cols, rows, fill_ratio, base_opacity=1.0, pad=9, gap=7):
    """A grid of windows, some lit. Returns the SVG for one facade."""
    parts = []
    cw = (w - pad * 2 - gap * (cols - 1)) / cols
    ch = (h - pad * 2 - gap * (rows - 1)) / rows
    if cw <= 1 or ch <= 1:
        return ''
    for r in range(rows):
        for c in range(cols):
            wx = x + pad + c * (cw + gap)
            wy = y + pad + r * (ch + gap)
            roll = random.random()
            if roll < fill_ratio:
                colour = LIT_LIME if random.random() < 0.13 else LIT_WARM
                op = (0.30 + random.random() * 0.55) * base_opacity
            else:
                colour = DARKGLASS
                op = 0.55 * base_opacity
            parts.append(f'<rect x="{wx:.1f}" y="{wy:.1f}" width="{cw:.1f}" height="{ch:.1f}" '
                         f'rx="1.5" fill="{colour}" opacity="{op:.2f}"/>')
    return ''.join(parts)

# --- far skyline -----------------------------------------------------------
add('<g>')
x = -40
while x < W + 60:
    w = random.randint(52, 104)
    h = random.randint(120, 300)
    y = int(H * 0.60) - h
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h + 400}" fill="{FAR}"/>')
    add(windows(x, y, w, h, max(2, w // 26), max(3, h // 34), 0.16, 0.5))
    # the odd rooftop tank
    if random.random() < 0.3:
        tw = random.randint(10, 16)
        add(f'<rect x="{x + w//2 - tw//2}" y="{y - 14}" width="{tw}" height="14" rx="2" fill="{FAR}"/>')
    x += w + random.randint(6, 22)
add('</g>')

# --- middle band -----------------------------------------------------------
add('<g>')
x = -60
while x < W + 60:
    w = random.randint(84, 170)
    h = random.randint(170, 330)
    y = int(H * 0.72) - h
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h + 340}" fill="{MID}"/>')
    add(windows(x, y, w, h, max(3, w // 30), max(4, h // 36), 0.26, 0.75))
    x += w + random.randint(10, 30)
add('</g>')

# --- the subject: a residential block, right of centre ---------------------
BX, BY, BW, BH = 900, 250, 520, 560
add(f'<g>')
add(f'<rect x="{BX}" y="{BY}" width="{BW}" height="{BH}" fill="{NEAR}"/>')
# roof parapet and two water tanks
add(f'<rect x="{BX - 12}" y="{BY - 16}" width="{BW + 24}" height="16" rx="3" fill="{SLAB}" opacity="0.65"/>')
for tx in (BX + 90, BX + 330):
    add(f'<rect x="{tx}" y="{BY - 52}" width="46" height="36" rx="4" fill="{NEAR}"/>')
    add(f'<rect x="{tx + 6}" y="{BY - 58}" width="34" height="8" rx="3" fill="{SLAB}" opacity="0.8"/>')

# eight storeys of balconies: a slab, then a recessed glazed bay per flat
FLOORS, BAYS = 8, 4
fh = BH / FLOORS
bw = BW / BAYS
for f in range(FLOORS):
    fy = BY + f * fh
    # the slab that reads as the balcony floor
    add(f'<rect x="{BX - 10}" y="{fy + fh - 12:.1f}" width="{BW + 20}" height="9" rx="2" '
        f'fill="{SLAB}" opacity="0.5"/>')
    for b in range(BAYS):
        bx = BX + b * bw
        # glazing
        gx, gy = bx + 14, fy + 10
        gw, gh = bw - 28, fh - 30
        lit = random.random() < 0.52
        colour = (LIT_LIME if random.random() < 0.12 else LIT_WARM) if lit else DARKGLASS
        op = (0.34 + random.random() * 0.46) if lit else 0.5
        add(f'<rect x="{gx:.1f}" y="{gy:.1f}" width="{gw:.1f}" height="{gh:.1f}" rx="2" '
            f'fill="{colour}" opacity="{op:.2f}"/>')
        # mullion
        add(f'<rect x="{gx + gw/2 - 1:.1f}" y="{gy:.1f}" width="2" height="{gh:.1f}" '
            f'fill="{NEAR}" opacity="0.8"/>')
        # balustrade: a dark panel, a bright handrail, and rails you can count
        by = fy + fh - 32
        add(f'<rect x="{bx + 8:.1f}" y="{by:.1f}" width="{bw - 16:.1f}" height="20" rx="2" '
            f'fill="{FOLIAGE}" opacity="0.72"/>')
        for i in range(1, 9):
            rx_ = bx + 8 + (bw - 16) * i / 9
            add(f'<rect x="{rx_:.1f}" y="{by + 3:.1f}" width="1.6" height="17" '
                f'fill="{RAIL}" opacity="0.30"/>')
        add(f'<rect x="{bx + 6:.1f}" y="{by - 2:.1f}" width="{bw - 12:.1f}" height="3.4" rx="1.7" '
            f'fill="{RAIL}" opacity="0.62"/>')
add('</g>')

# --- a nearer, lower wing on the left --------------------------------------
LX, LY, LW, LH = 120, 470, 430, 340
add(f'<rect x="{LX}" y="{LY}" width="{LW}" height="{LH}" fill="{FRONT}"/>')
add(f'<rect x="{LX - 10}" y="{LY - 14}" width="{LW + 20}" height="14" rx="3" fill="{SLAB}" opacity="0.55"/>')
for f in range(5):
    fy = LY + f * (LH / 5)
    add(f'<rect x="{LX - 8}" y="{fy + LH/5 - 10:.1f}" width="{LW + 16}" height="7" rx="2" '
        f'fill="{SLAB}" opacity="0.4"/>')
add(windows(LX, LY, LW, LH - 24, 9, 6, 0.42, 1.0, pad=18, gap=9))

# --- ground haze and foliage ----------------------------------------------
add(f'<rect x="0" y="{int(H*0.62)}" width="{W}" height="{int(H*0.38)}" fill="url(#haze)" opacity="0.55"/>')

# A tree line in three layers. One row of ellipses reads as lumps; three
# rows at different tones and heights reads as planting in front of a block.
def canopy(cx, cy, r, fill, opacity):
    """A rounded crown built from overlapping lobes, so the edge is not a circle."""
    parts = [f'<ellipse cx="{cx:.0f}" cy="{cy:.0f}" rx="{r:.0f}" ry="{r*0.74:.0f}" '
             f'fill="{fill}" opacity="{opacity}"/>']
    for dx, dy, s in ((-r*0.6, r*0.16, 0.66), (r*0.58, r*0.20, 0.62),
                      (-r*0.22, -r*0.34, 0.58), (r*0.26, -r*0.30, 0.54)):
        parts.append(f'<ellipse cx="{cx+dx:.0f}" cy="{cy+dy:.0f}" rx="{r*s:.0f}" '
                     f'ry="{r*s*0.78:.0f}" fill="{fill}" opacity="{opacity}"/>')
    return ''.join(parts)

for depth, (tone, op, base, lo, hi, step) in enumerate((
        ('#0d2c1f', '0.85', H - 52, 40, 66, 120),
        ('#092217', '0.92', H - 26, 52, 84, 150),
        (FOLIAGE,   '1',    H + 6,  62, 104, 180))):
    add('<g>')
    x = -60
    while x < W + 80:
        r = random.randint(lo, hi)
        add(canopy(x, base - r * 0.2, r, tone, op))
        x += random.randint(int(step * 0.55), step)
    add('</g>')

# two palms, because this is Nairobi and not a stock skyline
def palm(px, py, scale, opacity):
    frond = []
    frond.append(f'<rect x="{px-3*scale:.1f}" y="{py:.1f}" width="{6*scale:.1f}" '
                 f'height="{150*scale:.1f}" rx="{3*scale:.1f}" fill="{FOLIAGE}" opacity="{opacity}"/>')
    for angle in (-72, -40, -12, 12, 40, 72):
        import math
        a = math.radians(angle - 90)
        ex = px + math.cos(a) * 86 * scale
        ey = py + math.sin(a) * 86 * scale
        cx = px + math.cos(a) * 46 * scale
        cy = py + math.sin(a) * 46 * scale - 26 * scale
        frond.append(f'<path d="M{px:.1f},{py:.1f} Q{cx:.1f},{cy:.1f} {ex:.1f},{ey:.1f}" '
                     f'stroke="{FOLIAGE}" stroke-width="{11*scale:.1f}" fill="none" '
                     f'stroke-linecap="round" opacity="{opacity}"/>')
    return ''.join(frond)

add(palm(118, H - 128, 1.15, '1'))
add(palm(640, H - 96, 0.78, '1'))

add('</svg>')

svg = '\n'.join(out)
open('/home/claude/art/hero.svg', 'w').write(svg)
print('bytes', len(svg))
