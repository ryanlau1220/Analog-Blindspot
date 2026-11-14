"""Download every product listed in ``config/sources.toml`` into ``datasets/raw``.

Usage: ``uv run fetch-sources`` (from ``scientific/``). Failures are collected
and written to ``datasets/raw/fetch_report.json`` instead of being hidden.
"""

from __future__ import annotations

import json
import sys
import tomllib
from datetime import UTC, datetime

from .download import DownloadError, fetch
from .paths import CONFIG_DIR, RAW_DIR


def load_sources() -> list[dict]:
    with (CONFIG_DIR / "sources.toml").open("rb") as fh:
        return tomllib.load(fh)["product"]


def main() -> int:
    report = {"run_utc": datetime.now(UTC).isoformat(timespec="seconds"), "ok": [], "failed": []}
    for src in load_sources():
        dest = RAW_DIR / src["id"] / src["filename"]
        print(f"[fetch] {src['id']}/{src['filename']}", file=sys.stderr, flush=True)
        try:
            rec = fetch(src["url"], dest, expected_size=src.get("expected_size"))
            report["ok"].append(
                {"id": src["id"], "asset": src["asset"], "sha256": rec.sha256, "size_bytes": rec.size_bytes}
            )
        except DownloadError as exc:
            print(f"[fetch] FAILED: {exc}", file=sys.stderr)
            report["failed"].append({"id": src["id"], "asset": src["asset"], "url": src["url"], "error": str(exc)})
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / "fetch_report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(f"[fetch] ok={len(report['ok'])} failed={len(report['failed'])}", file=sys.stderr)
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
