"""Repository-relative paths shared by all Phase A scripts."""

from pathlib import Path

SCIENTIFIC_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = SCIENTIFIC_DIR.parent
CONFIG_DIR = SCIENTIFIC_DIR / "config"
DATASETS_DIR = REPO_ROOT / "datasets"
RAW_DIR = DATASETS_DIR / "raw"  # large source files, git-ignored
DERIVED_DIR = DATASETS_DIR / "derived"  # cropped/coarsened GeoTIFFs, git-ignored
PREVIEW_DIR = DATASETS_DIR / "previews"  # small reference PNGs, committed
MANIFEST_PATH = DATASETS_DIR / "manifest.json"
