import json

import numpy as np
import pytest

from analog_blindspot_science.export_web import DISPLAY_N, WEB_DATA, normal_map_rgb


def decode(rgb: np.ndarray) -> np.ndarray:
    return rgb.astype(float) / 255 * 2 - 1


def test_normal_map_axes():
    # Rising to the east (+X) -> normal tilts west (-X); flat -> straight up.
    z = np.tile(np.arange(10, dtype=np.float32), (10, 1))
    n = decode(normal_map_rgb(z, 1.0))[5, 5]
    assert n[0] == pytest.approx(-np.sqrt(0.5), abs=0.01) and n[1] == pytest.approx(np.sqrt(0.5), abs=0.01)
    # Rising to the south (row index, +Z) -> normal tilts north (-Z).
    n = decode(normal_map_rgb(z.T.copy(), 1.0))[5, 5]
    assert n[2] < -0.6 and abs(n[0]) < 0.01


def test_normal_map_nodata_is_neutral_not_invented():
    z = np.zeros((5, 5), np.float32)
    z[2, 2] = np.nan
    n = decode(normal_map_rgb(z, 1.0))
    assert np.allclose(n[2, 2], [0, 1, 0], atol=0.01)


SITES = WEB_DATA / "sites.json"


@pytest.mark.data
@pytest.mark.skipif(not SITES.exists(), reason="run `uv run export-web` first")
def test_exported_sites_index():
    idx = json.loads(SITES.read_text())
    sites = {s["id"]: s for s in idx["sites"]}
    moon, earth = sites["moon"], sites["earth"]
    assert [v["resolution_m"] for v in earth["variants"]] == [0.5, 4.0, 10.0, 30.0]
    for s in (moon, earth):
        assert s["subsurface"] == "not measured"
        for v in s["variants"]:
            assert v["heights"]["rows"] == v["heights"]["cols"] == DISPLAY_N
            path = WEB_DATA / (s["id"] if s["id"] == "moon" else f"earth/{v['id']}") / v["heights"]["file"]
            a = np.fromfile(path, dtype="<f4")
            assert a.size == DISPLAY_N**2
            assert int(np.isnan(a).sum()) == v["elevation"]["nan_count"]
            assert v["observed"] or "SIMULATED" in v["label"]
    assert moon["variants"][0]["elevation"]["nan_count"] == 159  # pit gap kept, not filled
