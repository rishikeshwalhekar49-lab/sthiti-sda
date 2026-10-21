"""JavaScript number semantics, so the port produces byte-for-byte the same figures.

The original computed everything in JavaScript. Three of its behaviours differ from
Python's defaults and would change displayed numbers if not reproduced:
  * Math.round rounds halves towards +infinity; Python's round() rounds half to even.
  * Number.prototype.toFixed rounds the exact binary value half-up; format() rounds half-even.
  * parseFloat reads a leading number and ignores trailing text; float() raises.
"""
import math
import re
from decimal import Decimal, ROUND_HALF_UP

_LEADING = re.compile(r"^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?")


def js_round(x):
    """Math.round."""
    return math.floor(x + 0.5)


def to_fixed(x, d):
    """Number.prototype.toFixed; '—' for missing values, as the original's f() helper did."""
    if x is None or not math.isfinite(x):
        return "—"
    q = Decimal(1).scaleb(-d) if d else Decimal(1)
    return str(Decimal(x).quantize(q, rounding=ROUND_HALF_UP))


def parse_float(v):
    """parseFloat, returning None where JavaScript would give NaN."""
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        f = float(v)
        return f if math.isfinite(f) else None
    m = _LEADING.match(str(v))
    if not m:
        return None
    f = float(m.group(0))
    return f if math.isfinite(f) else None


def parse_float_or_none(v):
    """`parseFloat(v) || null` — zero also becomes None, as in the original."""
    f = parse_float(v)
    return f if f else None


def parse_int_or_none(v):
    """`parseInt(v, 10) || null`."""
    if v is None:
        return None
    m = re.match(r"^\s*[+-]?\d+", str(v))
    if not m:
        return None
    i = int(m.group(0))
    return i if i else None


def num(v):
    """eod.js num(): strip thousands separators, parse, None if not a finite number."""
    if v is None:
        return None
    return parse_float(str(v).replace(",", ""))


def in_grouping(n):
    """toLocaleString('en-IN') for an integer: 1,23,45,678."""
    s = str(abs(int(n)))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts + [tail])
    return ("-" if n < 0 else "") + s


def clean(o):
    """JSON.stringify turns NaN and Infinity into null; do the same before serialising."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    return o
