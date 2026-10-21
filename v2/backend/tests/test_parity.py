"""The Python port must reproduce the original Node implementation's numbers.

tests/parity/fixtures.json is produced by tests/parity/dump.js, which runs the ORIGINAL
lib/*.js on real cached NSE data. Every output below is compared value by value.
Floating-point results may differ only in the last bits (numpy sums in a different order).
"""
import json
import math
from pathlib import Path

import pytest

from sthiti import analytics as an
from sthiti import ind, patents as pat

FIX = json.loads((Path(__file__).parent / "parity" / "fixtures.json").read_text())
INP, OUT = FIX["inputs"], FIX["outputs"]
TOL = 1e-9


def same(a, b, path="$"):
    """Deep comparison with a float tolerance; reports the first mismatching path."""
    if isinstance(a, bool) or isinstance(b, bool):
        assert a == b, f"{path}: {a!r} != {b!r}"
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)):
        assert math.isclose(a, b, rel_tol=TOL, abs_tol=TOL), f"{path}: {a!r} != {b!r}"
    elif isinstance(a, dict) and isinstance(b, dict):
        assert set(a) == set(b), f"{path}: keys {sorted(set(a) ^ set(b))} differ"
        for k in a:
            same(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        assert len(a) == len(b), f"{path}: length {len(a)} != {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            same(x, y, f"{path}[{i}]")
    else:
        assert a == b, f"{path}: {a!r} != {b!r}"


def clean(a):
    return [v for v in a if v is not None]


@pytest.mark.parametrize("sym", list(INP["stocks"]))
def test_indicators(sym):
    s, want = INP["stocks"][sym], OUT["ind"][sym]
    c, h, l = clean(s["c"]), clean(s["h"]), clean(s["l"])
    same(ind.rsi(c), want["rsi"], "rsi")
    same(ind.atr(h, l, c), want["atr"], "atr")
    same(ind.sma(c, 50), want["sma50"], "sma50")
    same(ind.sma(c, 200), want["sma200"], "sma200")
    same(ind.beta(s["c"], INP["nifty"]), want["beta"], "beta")
    same(ind.double_bottom(c), want["doubleBottom"], "doubleBottom")


def test_regime_series():
    got = an.regime_series(INP["sectors"], INP["dates"])
    want = OUT["regime"]
    same(got["series"], want["series"], "series")
    same(got["p33"], want["p33"], "p33")
    same(got["p67"], want["p67"], "p67")
    same(got["byDate"], want["byDate"], "byDate")


def _universe():
    rets = {u["sym"]: an.log_rets(u["closes"])[-90:] for u in INP["universe"]}
    nifty_rets = an.log_rets(clean(INP["nifty"]))
    return rets, nifty_rets


def test_universe_metrics():
    rets, nifty_rets = _universe()
    got = an.universe_metrics([u["sym"] for u in INP["universe"]], rets, nifty_rets)
    same(got, OUT["universeMetrics"])


def test_backtests():
    regime = an.regime_series(INP["sectors"], INP["dates"])
    same(an.run_backtests(INP["universe"], regime["byDate"]), OUT["backtests"])


def test_portfolio_report():
    rets, _ = _universe()
    same(an.portfolio_report([dict(h) for h in INP["holdings"]], rets, {}), OUT["portfolio"])


def test_corr_matrix_and_persistence():
    R = [an.log_rets(s["c"]) for s in INP["sectors"]]
    cm = pat.corr_matrix(R, len(R[0]) - 1, 60)
    same(cm, OUT["corrMatrix"], "corrMatrix")
    same(pat.persistence(cm["D"]), OUT["persistence"], "persistence")


def test_calibrate():
    same(pat.calibrate(INP["sectors"], INP["dates"]), OUT["calibrate"])


def test_surrogate_gate():
    same(pat.surrogate_test(INP["sectors"], INP["dates"], win=60, n=60), OUT["surrogate"])


def test_shift_test():
    same(pat.shift_test(INP["sectors"], INP["dates"], win=60, n=120), OUT["shift"])


def test_iv_surface():
    same(pat.iv_surface(INP["fo"]), OUT["ivSurface"])
