import numpy as np
from affine import Affine

from analog_blindspot_science.phase_e import SPACING_M, clusters, compare, lattice, search_level


def test_lattice_stays_radius_inside_roi():
    tr = Affine(1.0, 0, 1000.0, 0, -1.0, 5000.0)
    pts = np.array(lattice(tr, (300, 300), 30.0))
    assert pts[:, 0].min() >= 1030 and pts[:, 0].max() <= 1270
    assert pts[:, 1].max() <= 4970 and pts[:, 1].min() >= 4730
    assert np.allclose(np.diff(np.unique(pts[:, 0])), SPACING_M)


def test_clusters_join_neighbours_only():
    xy = np.array([[0, 0], [30, 0], [30, 30], [300, 300]], dtype=float)
    out = clusters(xy, np.array([1.0, 5.0, 2.0, 3.0]))
    assert sorted(len(c["members"]) for c in out) == [1, 3]
    big = next(c for c in out if len(c["members"]) == 3)
    assert (big["x"], big["y"], big["relief"]) == (30, 0, 5.0)


def test_compare_separates_offset_from_shape():
    a = np.arange(16, dtype=np.float32).reshape(4, 4)
    c = compare(a + 2.0, a, np.ones_like(a, bool))
    assert c["bias_m"] == 2.0 and c["rmse_m"] == 2.0 and c["rmse_detrended_m"] == 0.0
    assert c["pearson_r"] == 1.0


def test_search_recovers_a_planted_pit_and_reports_chance():
    rng = np.random.default_rng(0)
    z = rng.normal(0, 0.2, (600, 600)).astype(np.float32)
    z[290:310, 290:310] -= 20  # a 20 m deep, 20 m wide pit at the centre
    tr = Affine(1.0, 0, 0.0, 0, -1.0, 600.0)
    lm = [{"utm_x": 300.0, "utm_y": 300.0}]
    lv = search_level(z, np.isfinite(z), tr, lm, 30.0, False, True)
    assert lv["landmarks_recovered"] == 1
    assert lv["random_recovered_fraction"] is not None and lv["random_recovered_fraction"] < 0.5
    for c in lv["candidates"]:
        assert np.hypot(c["x_m"] - 300, c["y_m"] - 300) > 45


def test_holdout_points_far_from_gazetteer_are_scored():
    rng = np.random.default_rng(1)
    z = rng.normal(0, 0.2, (600, 600)).astype(np.float32)
    z[290:310, 290:310] -= 20
    z[90:110, 490:510] -= 20  # a second pit that is not a gazetteer point
    tr = Affine(1.0, 0, 0.0, 0, -1.0, 600.0)
    lm = [{"utm_x": 300.0, "utm_y": 300.0}]
    ho = [{"x": 500.0, "y": 500.0}]
    lv = search_level(z, np.isfinite(z), tr, lm, 30.0, False, True, ho)
    assert lv["holdout_count"] == 1 and lv["holdout_recovered"] == 1
    assert lv["candidates_near_holdout"] >= 1
