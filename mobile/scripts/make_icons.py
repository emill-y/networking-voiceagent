"""Generate Nomi's app icons from the Cormorant Garamond monogram.

Run from mobile/ after npm ci:  pip install pillow && python3 scripts/make_icons.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = f"{ROOT}/node_modules/@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf"
BG = (23, 26, 29)          # #171A1D
IVORY = (242, 238, 232)    # #F2EEE8
SAND = (201, 183, 156)     # #C9B79C

def monogram(size, bg, fg, ring=True, glyph_scale=0.62, ring_scale=0.74, transparent=False, ss=4):
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0) if transparent else bg + (255,))
    d = ImageDraw.Draw(img)
    if ring:
        r = S * ring_scale / 2
        w = max(2, int(S * 0.006))
        d.ellipse([S/2 - r, S/2 - r, S/2 + r, S/2 + r], outline=SAND + (150,), width=w)
    font = ImageFont.truetype(FONT, int(S * glyph_scale))
    # Center the glyph's ink box, not its text box.
    box = d.textbbox((0, 0), "N", font=font)
    x = (S - (box[2] - box[0])) / 2 - box[0]
    y = (S - (box[3] - box[1])) / 2 - box[1]
    d.text((x, y), "N", font=font, fill=fg + (255,))
    return img.resize((size, size), Image.LANCZOS)

# iOS / universal icon: square, opaque (the App Store rejects transparency).
monogram(1024, BG, IVORY).convert("RGB").save(f"{ROOT}/assets/images/icon.png")
# Splash: the monogram alone on the charcoal splash background.
monogram(1024, BG, IVORY, ring=False, glyph_scale=0.8, transparent=True).save(f"{ROOT}/assets/images/splash-icon.png")
# Android adaptive icon: content kept inside the central safe zone.
Image.new("RGB", (1024, 1024), BG).save(f"{ROOT}/assets/images/android-icon-background.png")
monogram(1024, BG, IVORY, glyph_scale=0.42, ring_scale=0.5, transparent=True).save(f"{ROOT}/assets/images/android-icon-foreground.png")
monogram(1024, BG, (255, 255, 255), ring=False, glyph_scale=0.42, transparent=True).save(f"{ROOT}/assets/images/android-icon-monochrome.png")
monogram(48, BG, IVORY, ring=False, glyph_scale=0.8).convert("RGB").save(f"{ROOT}/assets/images/favicon.png")
print("icons written")
