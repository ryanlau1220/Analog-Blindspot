import numpy as np
import pytest

from analog_blindspot_science.terrain import annulus_offsets, block_mean, disk_offsets, hillshade, slope_deg


def test_block_mean_exact_values():
    a = np.arange(16, dtype=np.float32).reshape(4, 4)
    out, ok = block_mean(a, np.ones_like(a, bool), 2, 0.5)
    assert ok.all()
    np.testing.assert_allclose(out, [[2.5, 4.5], [10.5, 12.5]])


def test_block_mean_ignores_nodata_and_applies_min_valid_fraction():
    a = np.array([[1, 3, 5, 5], [-9999, -9999, 5, 5]], dtype=np.float32)
    v = a != -9999
    out, ok = block_mean(np.vstack([a, a]), np.vstack([v, v]), 2, 0.5)
    # left block: 2 of 4 valid (=0.5) -> mean of valid only, never mixing in -9999
    assert ok.all()
    np.testing.assert_allclose(out[0], [2.0, 5.0])
    out, ok = block_mean(np.vstack([a, a]), np.vstack([v, v]), 2, 0.75)
    assert not ok[0, 0] and np.isnan(out[0, 0]) and ok[0, 1]


def test_block_mean_preserves_mean_of_full_grid():
    rng = np.random.default_rng(0)
    a = rng.normal(1500, 5, (120, 120)).astype(np.float32)
    for f in (4, 8, 20, 60, 120):
        out, _ = block_mean(a, np.ones_like(a, bool), f, 0.5)
        assert out.shape == (120 // f, 120 // f)
        assert out.mean() == pytest.approx(a.mean(), abs=1e-3)


def test_block_mean_rejects_non_divisible_shape():
    with pytest.raises(ValueError):
        block_mean(np.zeros((10, 10)), np.ones((10, 10), bool), 3, 0.5)


def test_slope_of_known_plane():
    x = np.arange(20) * 2.0  # 2 m cells, z = x -> 45 degrees
    z = np.tile(x, (20, 1))
    s = slope_deg(z, 2.0)
    np.testing.assert_allclose(s[5:-5, 5:-5], 45.0, atol=1e-4)


def test_hillshade_orientation():
    # Surface rising to the east faces west: lit by a western sun, dark under an eastern sun.
    z = np.tile(np.arange(20, dtype=float), (20, 1))
    assert hillshade(z, 1.0, azimuth_deg=270)[10, 10] > hillshade(z, 1.0, azimuth_deg=90)[10, 10]
    # Rows run north->south: surface rising to the north (z larger at row 0) faces south.
    zn = np.tile(np.arange(20, dtype=float)[::-1, None], (1, 20))
    assert hillshade(zn, 1.0, azimuth_deg=180)[10, 10] > hillshade(zn, 1.0, azimuth_deg=0)[10, 10]


def test_hillshade_propagates_nodata():
    z = np.ones((9, 9))
    z[4, 4] = np.nan
    hs = hillshade(z, 1.0)
    assert np.isnan(hs[4, 4]) and np.isfinite(hs[0, 0])


def test_disk_and_annulus_offsets():
    dy, dx = disk_offsets(2.0)
    assert len(dy) == 13 and (dy**2 + dx**2 <= 4).all()
    ry, rx = annulus_offsets(1.5, 2.0)
    d2 = ry**2 + rx**2
    assert ((d2 >= 2.25) & (d2 <= 4)).all()
