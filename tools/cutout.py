"""Make a sticker's white background transparent.

Flood-fills near-white pixels connected to the image border, so white fur inside the dark outline
(Mittens) stays. Edge pixels get partial alpha by how white they are, to avoid a halo.
Usage: python3 tools/cutout.py in.png out.png
"""
import sys
from collections import deque
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
w, h = im.size
px = im.load()

def whiteness(p):
    return min(p[0], p[1], p[2])

bg = bytearray(w * h)
q = deque()
for x in range(w):
    q.append((x, 0)); q.append((x, h - 1))
for y in range(h):
    q.append((0, y)); q.append((w - 1, y))
while q:
    x, y = q.popleft()
    i = y * w + x
    if bg[i] or whiteness(px[x, y]) < 225:
        continue
    bg[i] = 1
    if x > 0: q.append((x - 1, y))
    if x < w - 1: q.append((x + 1, y))
    if y > 0: q.append((x, y - 1))
    if y < h - 1: q.append((x, y + 1))

mask = Image.new('L', (w, h), 255)
mp = mask.load()
for y in range(h):
    for x in range(w):
        if bg[y * w + x]:
            mp[x, y] = 0
mask = mask.filter(ImageFilter.GaussianBlur(1.2))
im.putalpha(mask)
bbox = mask.point(lambda a: 255 if a > 8 else 0).getbbox()
if bbox:
    pad = 8
    im = im.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad)))
im.save(dst)
