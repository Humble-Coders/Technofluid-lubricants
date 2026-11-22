"""
Makes the Windows installer artwork from the app icon (resources/icon.png):

  build/icon.ico                 app + shortcut + installer icon (16–256 px)
  build/installerSidebar.bmp     welcome / finish page of the setup (164 x 314)
  build/uninstallerSidebar.bmp   same, for the uninstaller
  build/installerHeader.bmp      top strip of the other setup pages (150 x 57)

Safe to re-run; run from office/desktop:  python3 build-assets/make-installer-art.py
Needs Pillow. NSIS wants 24-bit BMPs (no transparency), so the art is flattened.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent.parent
SRC = HERE / "resources" / "icon.png"
OUT = HERE / "build"
OUT.mkdir(exist_ok=True)

ORANGE = (243, 112, 33)
RED = (200, 16, 30)
CREAM = (255, 247, 240)
INK = (40, 30, 25)


def font(size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
    for path in (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def mark() -> Image.Image:
    """The icon cropped to its drawing, then centred on a square with a small margin."""
    img = Image.open(SRC).convert("RGBA")
    box = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    art = img.crop(box)
    side = int(max(art.size) * 1.08)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(art, ((side - art.width) // 2, (side - art.height) // 2), art)
    return square


def gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    w, h = size
    g = Image.new("RGB", size)
    d = ImageDraw.Draw(g)
    for y in range(h):
        t = y / max(h - 1, 1)
        d.line([(0, y), (w, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return g


def centred(d: ImageDraw.ImageDraw, y: int, text: str, f: ImageFont.FreeTypeFont, fill, width: int) -> int:
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    d.text(((width - (r - l)) // 2 - l, y - t), text, font=f, fill=fill)
    return y + (b - t)


m = mark()

# Icon: every size Windows asks for, from the cropped mark (sharper at 16/32 px).
m.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# Sidebar (welcome / finish pages): warm gradient, the mark on a white disc, the name.
W, H = 164, 314
side = gradient((W, H), ORANGE, RED)
d = ImageDraw.Draw(side)
disc = 104
dx, dy = (W - disc) // 2, 46
d.ellipse([dx, dy, dx + disc, dy + disc], fill=(255, 255, 255))
logo = m.resize((88, 88), Image.LANCZOS)
side.paste(logo, ((W - 88) // 2, dy + (disc - 88) // 2), logo)
y = centred(d, dy + disc + 22, "Technofluid", font(19), (255, 255, 255), W)
y = centred(d, y + 6, "Office", font(19), (255, 255, 255), W)
y = centred(d, y + 14, "Stock · Sales · Accounts", font(10, bold=False), CREAM, W)
d.line([(40, H - 34), (W - 40, H - 34)], fill=(255, 220, 200), width=1)
centred(d, H - 26, "Technofluid Lubricants", font(9, bold=False), CREAM, W)
side.save(OUT / "installerSidebar.bmp")
side.save(OUT / "uninstallerSidebar.bmp")

# Header strip (other pages): white, a thin brand line, the mark on the right.
HW, HH = 150, 57
head = Image.new("RGB", (HW, HH), (255, 255, 255))
hd = ImageDraw.Draw(head)
hd.rectangle([0, HH - 3, HW, HH], fill=ORANGE)
small = m.resize((42, 42), Image.LANCZOS)
head.paste(small, (HW - 48, 5), small)
hd.text((8, 14), "Technofluid", font=font(13), fill=INK)
hd.text((8, 31), "Office", font=font(11, bold=False), fill=ORANGE)
head.save(OUT / "installerHeader.bmp")

print("Made:", ", ".join(p.name for p in sorted(OUT.iterdir())))
