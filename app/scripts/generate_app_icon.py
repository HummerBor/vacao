"""Generate symmetric scan-themed app icon for Vacao. Output: src-tauri/icons/app-icon-source.png"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
OUT = Path(__file__).resolve().parents[1] / "src-tauri" / "icons" / "app-icon-source.png"

# Match app UI
BG = (26, 29, 35)  # #1a1d23
BG_INNER = (37, 42, 51)  # #252a33
RING = (100, 116, 139)  # #64748b
RING_DIM = (71, 85, 105)  # #475569
ACCENT = (45, 212, 191)  # #2dd4bf
ACCENT_CORE = (94, 234, 212)  # #5eead4
WHITE = (255, 255, 255)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def rounded_rect_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_scan_icon() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    cx, cy = SIZE // 2, SIZE // 2

    # Squircle background
    bg = Image.new("RGBA", (SIZE, SIZE), BG + (255,))
    inner = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    idraw = ImageDraw.Draw(inner)
    pad = 48
    idraw.rounded_rectangle(
        (pad, pad, SIZE - pad, SIZE - pad),
        radius=200,
        fill=BG_INNER + (255,),
    )
    bg = Image.alpha_composite(bg, inner)

    # Subtle vignette rings (decorative, symmetric)
    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for r, alpha in [(430, 18), (380, 12)]:
        od.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            outline=RING_DIM + (alpha,),
            width=2,
        )
    bg = Image.alpha_composite(bg, overlay)

    draw = ImageDraw.Draw(bg)

    # Concentric scan rings
    for r, w, color in [
        (300, 3, RING),
        (210, 2, RING_DIM),
        (120, 2, RING_DIM),
    ]:
        draw.ellipse(
            (cx - r, cy - r, cx + r, cy + r),
            outline=color + (220,),
            width=w,
        )

    # Crosshair
    arm = 318
    for w in (2,):
        draw.line((cx - arm, cy, cx + arm, cy), fill=RING + (140,), width=w)
        draw.line((cx, cy - arm, cx, cy + arm), fill=RING + (140,), width=w)

    # Symmetric horizontal scan beam (soft band)
    beam = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bd = ImageDraw.Draw(beam)
    beam_h = 56
    for y in range(cy - beam_h, cy + beam_h):
        t = 1.0 - abs(y - cy) / beam_h
        alpha = int(lerp(0, 110, t**1.6))
        bd.line((cx - 305, y, cx + 305, y), fill=ACCENT + (alpha,))
    # Bright core line
    bd.line((cx - 280, cy, cx + 280, cy), fill=ACCENT_CORE + (200,), width=2)
    bg = Image.alpha_composite(bg, beam)

    draw = ImageDraw.Draw(bg)

    # Cardinal blips (symmetric)
    blip_r = 340
    for angle in (0, 90, 180, 270):
        rad = math.radians(angle)
        bx = cx + blip_r * math.cos(rad)
        by = cy - blip_r * math.sin(rad)
        draw.ellipse((bx - 7, by - 7, bx + 7, by + 7), fill=ACCENT + (230,))

    # Center hub
    draw.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=ACCENT_CORE + (255,))
    draw.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=WHITE + (255,))

    # Corner brackets (symmetric scan frame)
    bracket = 248
    gap = 72
    leg = 36
    lw = 3
    corners = [
        (cx - bracket, cy - bracket),
        (cx + bracket, cy - bracket),
        (cx - bracket, cy + bracket),
        (cx + bracket, cy + bracket),
    ]
    for i, (x, y) in enumerate(corners):
        hx = 1 if x > cx else -1
        hy = 1 if y > cy else -1
        draw.line((x, y, x + hx * leg, y), fill=ACCENT + (180,), width=lw)
        draw.line((x, y, x, y + hy * leg), fill=ACCENT + (180,), width=lw)

    # Apply outer squircle mask
    mask = rounded_rect_mask(SIZE, 224)
    final = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    final.paste(bg, (0, 0), mask)
    return final.convert("RGB")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    icon = draw_scan_icon()
    icon.save(OUT, "PNG")
    print(f"Wrote {OUT} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
