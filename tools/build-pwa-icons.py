"""Builds the icons of the installable app (PWA) from the logo, src/img/ocarina_title.png.

Usage (from the project root):   python tools/build-pwa-icons.py        (needs Pillow: pip install pillow)

An installed app needs its icon in a few sizes: 192 and 512 pixels, a "maskable" one (the phone may cut it to
a circle or a rounded square, so the picture is kept small in the middle over the theme colour) and, for the
iPhone, an "apple touch icon" on a solid background. The logo is 128 pixels wide, so the bigger sizes are
enlarged from it: for sharper icons, replace src/img/ocarina_title.png with a bigger logo and run this again.
"""

import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SOURCE = os.path.join(ROOT, "src", "img", "ocarina_title.png")
OUT = os.path.join(ROOT, "src", "img")
BACKGROUND = (58, 42, 28, 255)          # #3a2a1c, the theme colour of the page (see the manifest)

logo = Image.open(SOURCE).convert("RGBA")


def scaled(size):
    return logo.resize((size, size), Image.LANCZOS)


def on_background(canvas, fraction):
    """The logo, `fraction` of the canvas wide, centred on the theme colour."""
    picture = Image.new("RGBA", (canvas, canvas), BACKGROUND)
    size = round(canvas * fraction)
    mark = scaled(size)
    at = (canvas - size) // 2
    picture.alpha_composite(mark, (at, at))
    return picture


scaled(192).save(os.path.join(OUT, "icon-192.png"))
scaled(512).save(os.path.join(OUT, "icon-512.png"))
on_background(512, 0.62).save(os.path.join(OUT, "icon-maskable-512.png"))
on_background(180, 0.78).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"))
print("icons written to src/img: icon-192, icon-512, icon-maskable-512, apple-touch-icon")
