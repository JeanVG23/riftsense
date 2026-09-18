#!/usr/bin/env python3
"""Traite des assets Targon vers une palette éditoriale ivoire / encre / or.

Usage:
  python3 scripts/process_targon_assets.py
"""

from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "web/cf/public/images/targon"

# Palette
PAPER = "#f7f4ed"
INK = "#141718"
GOLD = "#b98f53"
GOLD_DEEP = "#7e6134"
COSMIC = "#0e1b2a"
COSMIC_MID = "#335a75"

def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]

def process(
    source: Path,
    target: Path,
    *,
    max_width: int = 1920,
    paper_amount: float = 0.68,
    contrast: float = 1.10,
    color: float = 0.94,
    brightness: float = 1.00,
    gold_mid: str = GOLD,
    dark: str = INK,
    light: str = PAPER,
) -> None:
    """Crée une version éditoriale contrastée, légèrement désaturée et teintée."""
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")

    if image.width > max_width:
        height = round(image.height * max_width / image.width)
        image = image.resize((max_width, height), Image.Resampling.LANCZOS)

    grayscale = image.convert("L")
    tinted = ImageOps.colorize(
        grayscale,
        black=hex_rgb(dark),
        white=hex_rgb(light),
        mid=hex_rgb(gold_mid),
        blackpoint=0,
        midpoint=118,
        whitepoint=255,
    )
    image = Image.blend(image, tinted, paper_amount)
    image = ImageEnhance.Color(image).enhance(color)
    image = ImageEnhance.Contrast(image).enhance(contrast)
    image = ImageEnhance.Brightness(image).enhance(brightness)
    image = ImageEnhance.Sharpness(image).enhance(1.08)

    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "JPEG", quality=86, optimize=True, progressive=True, subsampling=1)
    print(f"{source.relative_to(ROOT)} -> {target.relative_to(ROOT)}")

def main() -> None:
    jobs = [
        # Hero : garde la signature cosmique, accent or discret.
        {
            "source": ROOT / "assets_graphique/ascension/event_rare.jpg",
            "target": OUTPUT_DIR / "hero-ascension.jpg",
            "max_width": 1920,
            "paper_amount": 0.58,
            "contrast": 1.08,
            "color": 0.96,
            "brightness": 1.00,
            "gold_mid": GOLD,
            "dark": COSMIC,
            "light": PAPER,
        },
        # Illustrations éditoriales : dominante ivoire / or.
        {
            "source": ROOT / "assets_graphique/ascension/ascension_montagne.jpg",
            "target": OUTPUT_DIR / "ascension-montagne.jpg",
            "max_width": 1600,
            "paper_amount": 0.76,
            "contrast": 1.10,
            "color": 0.90,
            "brightness": 1.04,
            "gold_mid": GOLD,
            "dark": INK,
            "light": PAPER,
        },
        {
            "source": ROOT / "assets_graphique/paysages/route_sinueuse.jpg",
            "target": OUTPUT_DIR / "route-sinueuse.jpg",
            "max_width": 1600,
            "paper_amount": 0.74,
            "contrast": 1.10,
            "color": 0.88,
            "brightness": 1.03,
            "gold_mid": GOLD,
            "dark": INK,
            "light": PAPER,
        },
        {
            "source": ROOT / "assets_graphique/peuples_et_cultes/sanctuaire_solaris.jpg",
            "target": OUTPUT_DIR / "sanctuaire-solaris.jpg",
            "max_width": 1600,
            "paper_amount": 0.74,
            "contrast": 1.09,
            "color": 0.92,
            "brightness": 1.03,
            "gold_mid": GOLD_DEEP,
            "dark": INK,
            "light": PAPER,
        },
        # Artefact : gold accent sur fond ivoire.
        {
            "source": ROOT / "assets_graphique/vie_humaine_et_artefacts/astrolabe_or.jpg",
            "target": OUTPUT_DIR / "astrolabe-or.jpg",
            "max_width": 1400,
            "paper_amount": 0.80,
            "contrast": 1.08,
            "color": 0.94,
            "brightness": 1.03,
            "gold_mid": GOLD,
            "dark": INK,
            "light": PAPER,
        },
        # Motif vertical, utile en side panel / éditorial.
        {
            "source": ROOT / "assets_graphique/ascension/motif_des_morts.jpg",
            "target": OUTPUT_DIR / "motif-des-morts.jpg",
            "max_width": 1200,
            "paper_amount": 0.76,
            "contrast": 1.08,
            "color": 0.88,
            "brightness": 1.02,
            "gold_mid": GOLD,
            "dark": INK,
            "light": PAPER,
        },
    ]
    for job in jobs:
        process(**job)

if __name__ == "__main__":
    main()
