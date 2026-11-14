import hashlib
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import pytest

from analog_blindspot_science.download import DownloadError, fetch, sidecar_path


@pytest.fixture
def server(tmp_path):
    root = tmp_path / "srv"
    root.mkdir()
    (root / "a.bin").write_bytes(b"x" * 5000)
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def test_fetch_records_hash_and_size(server, tmp_path):
    dest = tmp_path / "out" / "a.bin"
    rec = fetch(f"{server}/a.bin", dest, expected_size=5000)
    assert rec.sha256 == hashlib.sha256(b"x" * 5000).hexdigest()
    assert json.loads(sidecar_path(dest).read_text())["size_bytes"] == 5000
    # second call reuses the verified file
    assert fetch(f"{server}/a.bin", dest, expected_size=5000) == rec


def test_fetch_rejects_unexpected_size(server, tmp_path):
    with pytest.raises(DownloadError):
        fetch(f"{server}/a.bin", tmp_path / "b.bin", expected_size=4999)


def test_fetch_reports_missing_file(server, tmp_path):
    with pytest.raises(DownloadError):
        fetch(f"{server}/missing.bin", tmp_path / "c.bin")
