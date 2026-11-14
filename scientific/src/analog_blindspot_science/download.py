"""Resumable, integrity-checked downloads of primary source products.

Every completed file gets a ``<name>.download.json`` sidecar recording the
source URL, final URL after redirects, HTTP validators, byte size and SHA-256,
so the manifest can cite exactly which bytes were analysed.
"""

from __future__ import annotations

import hashlib
import json
import sys
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import requests

CHUNK = 1 << 20
USER_AGENT = "analog-blindspot-science/0.1 (scientific data validation)"


class DownloadError(RuntimeError):
    """Raised when a source product cannot be retrieved or fails integrity checks."""


@dataclass(frozen=True)
class DownloadRecord:
    url: str
    final_url: str
    path: str
    size_bytes: int
    sha256: str
    http_etag: str | None
    http_last_modified: str | None
    retrieved_utc: str


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def sidecar_path(path: Path) -> Path:
    return path.with_name(path.name + ".download.json")


def load_record(path: Path) -> DownloadRecord | None:
    side = sidecar_path(path)
    if not (path.exists() and side.exists()):
        return None
    rec = DownloadRecord(**json.loads(side.read_text()))
    if path.stat().st_size != rec.size_bytes:
        return None
    return rec


def _remote_head(session: requests.Session, url: str) -> requests.Response:
    resp = session.head(url, allow_redirects=True, timeout=60)
    if resp.status_code != 200:
        raise DownloadError(f"HEAD {url} -> HTTP {resp.status_code}")
    return resp


def fetch(url: str, dest: Path, *, expected_size: int | None = None, retries: int = 5) -> DownloadRecord:
    """Download ``url`` to ``dest`` with HTTP range resume and integrity checks.

    The remote Content-Length must match ``expected_size`` (when given) and the
    final local size must equal the remote Content-Length.
    """
    existing = load_record(dest)
    if existing is not None and (expected_size is None or existing.size_bytes == expected_size):
        return existing

    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    # Byte counts must match Content-Length, so refuse transfer compression.
    session.headers["Accept-Encoding"] = "identity"

    head = _remote_head(session, url)
    remote_size = int(head.headers.get("Content-Length", "-1"))
    if remote_size <= 0:
        raise DownloadError(f"{url}: server did not report Content-Length")
    if expected_size is not None and remote_size != expected_size:
        raise DownloadError(f"{url}: remote size {remote_size} != expected {expected_size}")
    final_url = head.url

    for attempt in range(1, retries + 1):
        offset = part.stat().st_size if part.exists() else 0
        if offset > remote_size:
            part.unlink()
            offset = 0
        if offset == remote_size:
            break
        headers = {"Range": f"bytes={offset}-"} if offset else {}
        try:
            with session.get(final_url, headers=headers, stream=True, timeout=120) as resp:
                if offset and resp.status_code != 206:
                    part.unlink(missing_ok=True)
                    continue
                if resp.status_code not in (200, 206):
                    raise DownloadError(f"GET {final_url} -> HTTP {resp.status_code}")
                done = offset
                last = time.monotonic()
                with part.open("ab") as fh:
                    for block in resp.iter_content(CHUNK):
                        fh.write(block)
                        done += len(block)
                        if time.monotonic() - last > 10:
                            pct = 100 * done / remote_size
                            print(
                                f"  {dest.name}: {done / 1e6:,.1f}/{remote_size / 1e6:,.1f} MB ({pct:.1f}%)",
                                file=sys.stderr,
                                flush=True,
                            )
                            last = time.monotonic()
        except (requests.RequestException, OSError) as exc:
            print(f"  {dest.name}: attempt {attempt} failed: {exc}", file=sys.stderr)
            time.sleep(min(30, 2**attempt))
    else:
        raise DownloadError(f"{url}: gave up after {retries} attempts")

    size = part.stat().st_size
    if size != remote_size:
        raise DownloadError(f"{url}: downloaded {size} bytes, expected {remote_size}")
    part.replace(dest)

    rec = DownloadRecord(
        url=url,
        final_url=final_url,
        path=dest.name,
        size_bytes=size,
        sha256=sha256_file(dest),
        http_etag=head.headers.get("ETag"),
        http_last_modified=head.headers.get("Last-Modified"),
        retrieved_utc=datetime.now(UTC).isoformat(timespec="seconds"),
    )
    sidecar_path(dest).write_text(json.dumps(asdict(rec), indent=2) + "\n")
    return rec
