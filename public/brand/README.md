# Brand assets

## The header band and the sign-in panel

Both bands paint two layers and let CSS pick:

```
bg-[image:url('/brand/hero.jpg'),url('/brand/hero.svg')]
```

CSS paints the **first** URL that resolves on top, so `hero.jpg` wins and
`hero.svg` is the fallback.

| File | What it is | Used by |
|---|---|---|
| `hero.jpg` | 1840×825 photograph — towers seen from street level | the dashboard and portal bands |
| `hero-portrait.jpg` | 736×1104, the same photograph uncropped | the sign-in panel, which is a tall column |
| `hero.svg` | a drawn skyline, in the brand palette | the fallback if a photograph is ever removed |

`hero.jpg` is a deliberate crop of the lower third of the original, not a
centre crop. The band is wide and short, so most of a portrait photograph is
thrown away either way — and the lower third is where the towers converge and
where the left side is darkest, which is where the greeting sits. A centre
crop would have put white text over open sky.

The scrim is darkest on the left, under the text, and eases towards the right.
The date chip is tinted dark rather than light, so it holds up over whatever
part of a photograph ends up behind it.

### Replacing the photograph

Save over `hero.jpg` and `hero-portrait.jpg`. No code change. What works:

- **Landscape and wide for `hero.jpg`** — 1800px or wider. The source used here
  was only 736px wide, so it is upscaled and a little soft at full width; a
  larger original would be sharper.
- **Detail on the right**, because the left is under the scrim.
- **Under about 400 KB** each, so first paint is not waiting on them.
- Use a photograph you own or have licensed. Keep a note of where it came from
  — a login page is the most-screenshotted surface you have.

### Regenerating the drawn fallback

`hero.svg.py` drew `hero.svg`. It is deterministic — a fixed seed — so
re-running reproduces the same picture; change the seed or the palette
constants at the top for a different one. Adjust the output path at the foot of
the script before running it.

## login-hero.jpg — the sign-in page

The sign-in page uses its own photograph, `login-hero.jpg`, and nothing else
does. It is tinted towards the brand green with a multiply layer and then
darkened vertically under the text, so the headline stays readable over the
bright part of the sky rather than relying on the tint alone.

It is only shown from the `lg` breakpoint up, because below that the form
takes the whole screen.

Replacing it is a matter of saving a new file at that path. Portrait suits
this column — it is tall and narrow. Aim for around 1600×2400 so it stays
sharp on a high-density screen; the panel is about 720 CSS pixels wide, which
is 1440 real pixels on a retina display.

## rentrewards-logo.png

The original supplied artwork. The interface does not use it: the mark is
drawn as vector geometry in `src/components/brand.tsx`, so it stays sharp at
any size and takes its colour from the theme.
