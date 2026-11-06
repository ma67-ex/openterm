"""Makes the white background of downloaded logos transparent (flood fill from the corners).
Only touches logos whose corner pixel is opaque near-white. Safe to re-run. Usage: python3 scripts/clean-logos.py"""
import glob
from PIL import Image, ImageDraw

done = 0
for f in glob.glob('public/logos/*.png'):
    im = Image.open(f).convert('RGBA')
    w, h = im.size
    c = im.getpixel((0, 0))
    if c[3] < 200 or min(c[:3]) < 235:
        continue
    for pt in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if im.getpixel(pt)[3] > 200 and min(im.getpixel(pt)[:3]) > 235:
            ImageDraw.floodfill(im, pt, (255, 255, 255, 0), thresh=28)
    im.save(f, optimize=True)
    done += 1
print('cleaned', done)
