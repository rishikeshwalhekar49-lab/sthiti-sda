""""Why did the regime shift?" - facts from the engine, a rule-written answer, and an
optional model-written answer. Port of lib/explain.js; the model call moved to llm.py,
which can use Claude, Groq, Gemini, DeepSeek or OpenRouter."""
from . import analytics as an
from .jsnum import in_grouping, js_round, to_fixed as f


def facts(eod, live):
    """Everything the explainer is allowed to talk about, pulled from real data."""
    sectors, dates = eod["sectors"], eod["dates"]
    R = [an.log_rets(s["c"]) for s in sectors]
    last = len(R[0]) - 1

    def at(end):
        seg = [r[end - an.WIN + 1:end + 1] for r in R]
        pairs, total = [], 0.0
        for i in range(len(seg)):
            for j in range(i + 1, len(seg)):
                c = an.corr(seg[i], seg[j])
                pairs.append({"a": sectors[i]["code"], "b": sectors[j]["code"], "rho": c})
                total += c
        return {"pairs": pairs, "rho": total / len(pairs)}

    now, prev = at(last), at(max(an.WIN - 1, last - 20))
    by_pair = {p["a"] + "|" + p["b"]: p["rho"] for p in prev["pairs"]}
    moved = [{**p, "chg": p["rho"] - by_pair.get(p["a"] + "|" + p["b"], p["rho"])} for p in now["pairs"]]
    moved.sort(key=lambda x: -abs(x["chg"]))
    avg_by_sector = {}
    for s in sectors:
        vals = [p["rho"] for p in now["pairs"] if p["a"] == s["code"] or p["b"] == s["code"]]
        avg_by_sector[s["code"]] = sum(vals) / len(vals)
    ranked = sorted(avg_by_sector.items(), key=lambda kv: kv[1])
    regime = an.regime_series(sectors, dates)
    ix = (live or {}).get("indices") or {}
    n50, n500, vix = ix.get("NIFTY 50") or {}, ix.get("NIFTY 500") or {}, ix.get("INDIA VIX") or {}
    flows = (live or {}).get("flows") or {}
    adv, dec = n500.get("advances"), n500.get("declines")
    return {
        "asOf": eod["asOf"],
        "regime": regime["label"](now["rho"]),
        "meanRho": now["rho"],
        "meanRhoChange": now["rho"] - prev["rho"],
        "windowDays": an.WIN,
        "sectorsWatched": len(sectors),
        "tightestPairs": sorted(now["pairs"], key=lambda p: -p["rho"])[:3],
        "biggestMoves": moved[:4],
        "mostIsolated": [{"code": c, "rho": r} for c, r in ranked[:2]],
        "mostCoupled": [{"code": c, "rho": r} for c, r in reversed(ranked[-2:])],
        "nifty": {"last": n50.get("last"), "pct": n50.get("pct")},
        "breadth": {"advances": adv, "declines": dec, "ratio": adv / dec} if adv and dec else None,
        "vix": vix.get("last"),
        "flows": {"fii": flows.get("fii"), "dii": flows.get("dii")},
        "scannerHits": len(eod.get("scan") or []),
        "thresholds": {"calmBelow": regime["p33"], "stressAbove": regime["p67"]},
    }


NAMES = {"calm": "Calm", "trans": "Transitional", "stress": "Stress"}


def _crore(net):
    return "₹" + in_grouping(abs(js_round(net))) + " crore"


def plain_answer(x):
    """Written from the numbers, with no model involved; always available."""
    ch = x["meanRhoChange"]
    direction = "risen" if ch > 0.02 else ("fallen" if ch < -0.02 else "held steady")
    lines = [
        f"The engine reads **{NAMES[x['regime']]}** for {x['asOf']}. Average correlation between the {x['sectorsWatched']} NSE sector "
        f"indices over the last {x['windowDays']} sessions is {f(x['meanRho'], 2)}, and it has {direction} "
        f"({'+' if ch >= 0 else '−'}{f(abs(ch), 2)}) over the last month. Below {f(x['thresholds']['calmBelow'], 2)} counts as calm "
        f"for the past year, above {f(x['thresholds']['stressAbove'], 2)} as stress."
    ]
    if x["biggestMoves"]:
        mv, tp, iso = x["biggestMoves"][0], x["tightestPairs"][0], x["mostIsolated"][0]
        lines.append(
            f"The biggest change in the structure is {mv['a']} and {mv['b']}, whose correlation {'rose' if mv['chg'] >= 0 else 'fell'} "
            f"to {f(mv['rho'], 2)} ({'+' if mv['chg'] >= 0 else '−'}{f(abs(mv['chg']), 2)}). "
            f"The tightest pair right now is {tp['a']}–{tp['b']} at {f(tp['rho'], 2)}; {iso['code']} sits furthest from everything "
            f"else at an average {f(iso['rho'], 2)}."
        )
    bits = []
    if x["vix"]:
        bits.append(f"India VIX at {f(x['vix'], 2)}")
    if x["breadth"]:
        bits.append(f"{f(x['breadth']['ratio'], 2)} stocks rising for every one falling")
    fii, dii = x["flows"]["fii"], x["flows"]["dii"]
    if fii:
        bits.append(f"FIIs {'bought' if fii['net'] >= 0 else 'sold'} {_crore(fii['net'])}")
    if dii:
        bits.append(f"DIIs {'bought' if dii['net'] >= 0 else 'sold'} {_crore(dii['net'])}")
    if bits:
        lines.append(f"Alongside: {', '.join(bits)}.")
    if x["regime"] == "stress":
        lines.append("While sectors move together, spreading money across them buys less protection than it looks like. "
                     "Size positions down, and treat breakout signals with suspicion.")
    elif x["regime"] == "trans":
        lines.append("The structure is drifting. Tighten stops, check breadth before trusting a breakout, and watch whether correlations keep rising.")
    else:
        lines.append("Sectors are moving apart, so stock-specific work pays off and normal chart rules apply.")
    return "\n\n".join(lines)
