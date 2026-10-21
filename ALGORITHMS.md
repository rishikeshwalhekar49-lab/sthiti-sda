# Sthiti — every calculation, and where it lives

Every number the site shows is computed from NSE or BSE data by one of the routines below.
Notation: `r_t` is a daily log return, `ρ` a Pearson correlation, `W` a window length in trading
sessions, `n` a count of series. File references are `file.js → function`.

Three kinds of choice appear below, and they are labelled:

- **Standard** — the textbook definition (Wilder's RSI, Pearson correlation, Black–Scholes).
- **Convention** — a widely used practitioner rule with no single authority (the 15% ROE bar).
- **Ours** — a modelling choice this project made. Section 12 lists all of them in one place, because
  those are the ones a reviewer should challenge.

---

## 1. Data layer

`lib/eod.js`, `lib/live.js`, `lib/net.js`

| Quantity | Source | Method |
|---|---|---|
| Daily OHLC + volume, every NSE equity | `BhavCopy_NSE_CM_0_0_0_<YYYYMMDD>_F_0000.csv.zip` | Unzip (`lib/zip.js`, inflate raw), parse CSV, keep rows with `SctySrs == "EQ"`, store `[open, high, low, close, volume]` per symbol |
| Index closes, P/E, % change (146 indices) | `ind_close_all_<DDMMYYYY>.csv` | Parse CSV, store `[close, P/E, %change]` per index name |
| NIFTY option chain, end of day | `BhavCopy_NSE_FO_0_0_0_<YYYYMMDD>_F_0000.csv.zip` | Keep `FinInstrmTp == "IDO"` and `TckrSymb == "NIFTY"`; store strike, type, close, settle, OI, ΔOI, volume, lot size, underlying |
| Live index levels, breadth, index P/E | NSE `/api/allIndices` | 30 s cache while open, 5 min closed |
| Market status | NSE `/api/marketStatus` | **Ours:** the flag is trusted only if the IST clock is Mon–Fri, 09:15–15:40 — NSE reports "Open" outside hours |
| FII / DII net flows | NSE `/api/fiidiiTradeReact` | 10 min cache |
| Live option chain | NSE `/api/option-chain-v3` | Nearest expiry after today; 30 s cache |
| Live quotes, P/E, EPS, ROE, margins, market cap, 52-week range | BSE `getScripHeaderData`, `ComHeadernew`, `StockTrading`, `HighLow` | Consolidated figure preferred over standalone when both are positive |

**Trading-day detection.** Walk back 780 calendar days, skip weekends, request each date; a 404 means
a holiday and is cached as a marker file so it is never requested again. Keep the most recent 500
dates that have both an equity file and an index file.

**Alignment.** A series is indexed by that sorted date list. A symbol missing on a date gets `null`;
indicators are computed on the compacted array of valid sessions, and symbols with fewer than 215
valid sessions are dropped from the scanner.

**Live bar merge.** `app.js → seriesLive`: if the market is open and the last end-of-day date is
before today, the live price is appended as today's bar; if today's file already exists, the live
price replaces its close. Every indicator downstream then reflects the live price.

---

## 2. Core mathematics

### 2.1 Returns and correlation distance — standard

```
r_t = ln(P_t / P_{t-1})
ρ(i,j) = Σ(x−x̄)(y−ȳ) / √(Σ(x−x̄)² · Σ(y−ȳ)²)      Pearson, clamped to [−1, 1]
d(i,j) = √(2 · (1 − ρ(i,j)))                          correlation distance
```

`lib/analytics.js → logRets, corr, dist`; mirrored in `app.js → logRet, corrDist`.
`d` is a metric: identical series are 0 apart, uncorrelated √2, perfectly opposed 2.

### 2.2 Vietoris–Rips persistence — standard

Input: an `n × n` distance matrix. `app.js → persistence`, `lib/patents.js → persistence`.

1. **Edges.** All `n(n−1)/2` pairs sorted ascending by `d`.
2. **H₀ (groups), union-find.** Walk edges in order; an edge joining two components kills the
   younger one, producing a bar `[0, d]`. One component survives with an infinite bar. This is
   Kruskal's algorithm, so H₀ bars are exactly the minimum-spanning-tree edge lengths.
3. **H₁ (loops), matrix reduction over 𝔽₂.** Triangles are ordered by their longest edge. Each
   triangle's boundary is the sorted triple of its edge indices; columns are reduced by repeatedly
   adding (symmetric difference with) the stored column whose pivot matches the current low index.
   A column that survives pairs its pivot edge (birth) with the triangle (death), giving bar
   `[birth, death]`. A bar shorter than 1e-9 is discarded.
4. **Representative cycle.** The reduced column itself is a cycle of edges; its vertices are the
   sectors the loop runs through. Used for attribution (candidate 2).
5. **Landscape L¹ norm.** `Σ (death − birth)² / 4` over H₁ bars, which equals the integral of the
   sum of all persistence-landscape functions.

Cost with 17 sector indices: 136 edges, 680 triangles, about 1 ms per window.

### 2.3 Classical multidimensional scaling — standard

`app.js → mds`. Used only to place dots on screen; the barcode is computed from the true distances.

```
B = −½ · J · D² · J          J = I − (1/n)·11ᵀ  (double centring)
coords = [ v₁√λ₁ , v₂√λ₂ ]   top two eigenvectors by power iteration (120 iterations,
                             second deflated against the first)
```

---

## 3. Indicators

`lib/ind.js`, mirrored for live bars in `app.js`.

| Indicator | Definition | Type |
|---|---|---|
| SMA(n) | Mean of the last `n` closes | Standard |
| RSI(14) | Wilder: seed `g`, `l` as mean gain/loss over the first 14 changes, then `g ← (g·13 + max(Δ,0))/14`, `l ← (l·13 + max(−Δ,0))/14`, `RSI = 100 − 100/(1 + g/l)` | Standard |
| ATR(14) | Wilder on true range `max(hᵢ−lᵢ, |hᵢ−c_{i−1}|, |lᵢ−c_{i−1}|)`, seeded with the first 14-bar mean | Standard |
| Beta | `cov(r_stock, r_nifty) / var(r_nifty)` over the last 250 aligned sessions, minimum 60 pairs | Standard |
| 52-week high/low | Max high / min low over the last 250 sessions | Standard |
| Volume ratio | Today's volume ÷ mean volume of the previous 20 sessions | Convention |
| Rolling SMA / max | Prefix-sum SMA; monotonic-deque rolling maximum, both O(n) — used so the backtest over 500 stocks stays fast | Standard |

**Double bottom** (`lib/ind.js → doubleBottom`) — **ours**, a rule written to be checkable:
within the last 60 closes, find local minima (lowest of a ±3 window); accept a pair `i < j` if
`j − i ≥ 10`, the two lows are within 3% of each other, the highest close between them (the
neckline) is at least 6% above the higher low, and the latest close crosses above that neckline
while the previous close did not.

---

## 4. Regime engine

### 4.1 Regime series

`lib/analytics.js → regimeSeries` (server, W = 60) and `app.js → buildEngineFrom` (client, W = 60,
or the calibrated window when applied).

```
For each session t ≥ W:
    ρ̄_t = mean of ρ(i,j) over all sector pairs, computed on the last W log returns
```

**Ours — regime labels.** Thresholds are the 33rd and 67th percentiles of `ρ̄` over the whole
period loaded (500 sessions): below the 33rd is *calm*, above the 67th is *stress*, between is
*transitional*. Labels are therefore relative to the last two years, and a replayed episode is
scored against the live thresholds, not its own.

### 4.2 What FIG. 1 draws

- Dots: MDS of the window's distance matrix (§2.3).
- Edges: drawn between sectors whose **true** distance is ≤ ε; triangles filled when all three
  edges qualify, filled once as a union path so overlaps do not darken.
- Barcode: H₀ bars sorted by death, then up to 6 H₁ bars with persistence > 0.02.
- β₀ at ε = H₀ bars with `death > ε`; β₁ at ε = H₁ bars with `birth ≤ ε < death`.
- Attribution line: the representative cycle of the longest-lived H₁ bar, its vertices ordered by
  angle around their centroid, translated to sector codes.

---

## 5. The tools

### 5.1 Screener and health scorecard — `app.js → checksFor, peWhy`

Live price, P/E, EPS, ROE, margins and market cap come from BSE; sector P/E is the NSE index P/E
for that stock's sector index; beta, RSI and the 200-DMA distance are computed here (§3).

**Convention — scorecard thresholds:**

| Check | Pass | Watch | Flag |
|---|---|---|---|
| Valuation | P/E ≤ sector P/E | ≤ 1.3 × sector | > 1.3 × sector |
| Profitability | ROE ≥ 15% | ≥ 10% | < 10% |
| Margins | Net margin ≥ 15% | ≥ 8% | < 8% |
| Trend | Close > 200-DMA | — | Close < 200-DMA |
| Volatility | Beta ≤ 1.0 | ≤ 1.3 | > 1.3 |

"Why is the P/E high/low" is a rule-based explanation: if the ratio to sector P/E is above 1.1 it
lists whichever of high ROE (≥ 20%), fat margins (≥ 18%), low beta (< 0.9) and price above the
200-DMA apply; below 0.9 it lists the negatives. With none present it says the premium looks
stretched rather than inventing a reason.

### 5.2 Market mood meter — `app.js → moodModel` — **ours**

```
breadth   b = clamp(50 + 50·ln(A/D) / ln 3, 0, 100)        50 at A/D = 1, 100 at 3, 0 at ⅓
flows     f = clamp(50 + 50·(FII + DII) / 6000, 0, 100)    ±50 at ±₹6,000 crore combined
volatility v = clamp((30 − VIX) / 20 × 100, 0, 100)        100 at VIX 10, 0 at VIX 30
score = 0.35·b + 0.30·f + 0.35·v
```

Zones: < 25 Fear, < 45 Cautious, < 55 Neutral, < 75 Optimistic, else Euphoric. The explanation
text is generated by rules on the signs of FII and DII, the breadth ratio, and VIX bands
(< 13 low, < 20 moderate, < 28 elevated, else high). The panel is read-only: it reports the live
session and has no adjustable inputs.

### 5.3 Position calculator — `app.js → renderPos` — convention (the 1% rule)

```
budget      = capital × risk%              risk per trade, default 1%
riskPerShare = m × ATR(14)                 m default 2
stop        = entry − riskPerShare
target      = entry + R × riskPerShare     R default 2
shares      = min( ⌊budget / riskPerShare⌋ , ⌊capital / entry⌋ )
```

The second term is the capital constraint, reported when it binds. A warning fires when the
position exceeds 25% of capital (**ours**), and the panel always states what the size would be if
ATR doubled, which is the volatility-to-size link the lesson teaches.

### 5.4 Option simulator — `app.js`

- **Normal CDF** — Abramowitz–Stegun 5-term rational approximation (standard).
- **Black–Scholes**, `r = 6.5%` assumed, no dividend:
  `C = S·N(d₁) − K·e^{−rT}·N(d₂)`, `P = K·e^{−rT}·N(−d₂) − S·N(−d₁)`,
  `d₁ = [ln(S/K) + (r + v²/2)T] / (v√T)`, `d₂ = d₁ − v√T`.
- **Legs** are picked from the live chain by index offset from the at-the-money strike (the strike
  nearest the underlying), with "strikes away" as the width control. Premium = the chain's traded
  price; only an untraded strike falls back to a Black–Scholes price at its own IV, and it is
  marked with an asterisk.
- **Payoff at expiry** `Σ side · (max(0, S_T − K) or max(0, K − S_T) − premium) × lot × lots`.
- **Today's curve** the same sum with Black–Scholes values at each leg's own implied volatility.
- **Breakevens, max profit, max loss** — evaluated on a 3,001-point grid from 0 to 3×spot;
  breakevens by linear interpolation at sign changes. Unbounded outcomes are detected from the net
  call count: net long calls → profit unlimited; net short calls → loss unlimited.
- **Max pain** — the strike minimising `Σ_k [ callOI_k · max(0, X − K_k) + putOI_k · max(0, K_k − X) ]`,
  i.e. the expiry level at which option holders' total intrinsic value is smallest (convention).
- **PCR** — total put OI ÷ total call OI.

### 5.5 Scanner — `lib/eod.js` — convention rules, stated exactly

Run over every NIFTY 500 constituent with ≥ 215 valid sessions, on the latest close:

| Signal | Condition |
|---|---|
| Crossed above/below 200-day MA | `close > SMA200` and `prevClose ≤ prevSMA200` (and the mirror) |
| Golden / death cross | `SMA50 > SMA200` and `prevSMA50 ≤ prevSMA200` (and the mirror) |
| New 52-week high / low | `close >` max high of the previous 250 sessions (and the mirror on lows) |
| Double bottom | The rule in §3 |
| RSI crossed 70 / 30 | `RSI_t > 70` and `RSI_{t−1} ≤ 70` (and the mirror at 30) |

Hits are sorted by volume ratio; the page shows the top 25 of the filtered group.

### 5.6 Topo-Screen — `lib/analytics.js → universeMetrics` — **ours**

For each of ~487 NIFTY 500 stocks with enough history:

```
avgCorr  = mean ρ(stock, other) over every other stock, last 30 returns
dist     = √(2(1 − avgCorr))                  distance from the market's centre
corrChg  = avgCorr(last 30) − avgCorr(the 30 before that)
corrMkt  = ρ(stock, NIFTY 50) over the last 30 returns
```

High `dist` means the stock moves independently; a large negative `corrChg` means it has just
broken out of the pack. Cost is O(N² · 30) ≈ 7 million operations, run once per build.

### 5.7 Regime-conditioned backtester — `lib/analytics.js → runBacktests`

Entries and exits both fill at the **next** session's close, so no bar is used before it exists.
Scanning starts at index 205 so the 200-day average exists.

| Strategy | Entry | Exit |
|---|---|---|
| Golden cross | SMA50 crosses above SMA200 | SMA50 < SMA200, or 60 sessions |
| RSI(14) below 30 | RSI crosses below 30 | RSI > 50, or 20 sessions |
| New 52-week high | Close above the previous 250-session high | 20 sessions, or close < 0.92 × entry |

Each trade records its return, holding length, and the **regime label of its entry date** from the
60-session series (§4.1). The panel then computes, for all trades and for each regime:
win rate = winners ÷ trades, average return = mean trade return, average hold in sessions, best and
worst. No costs, slippage or taxes are deducted — stated on the panel.

### 5.8 Portfolio fragility — `lib/analytics.js → portfolioReport`

Weights are rescaled to sum to 1. Correlations use the last 60 returns of each holding.

```
ρ̄        = mean pairwise correlation
effN     = 1 / ( Σᵢ wᵢ² + Σᵢ≠ⱼ wᵢwⱼ ρᵢⱼ )        effective number of independent positions
clusters = single-linkage components at ρ ≥ 0.6
perHolding avgRho = mean ρ of that holding against the rest
```

`effN` equals N for uncorrelated equal weights and 1 when everything is perfectly correlated
(**ours** as a presentation, though it is the standard "effective bets" form). The verdict bands
are `effN/N > 0.55` spread out, `> 0.35` concentrated, else tightly coupled.

### 5.9 Paper trading and diagnostics — `app.js`

Fills are at the live BSE price; the log is kept in browser storage. With at least three closed
trades including a winner and a loser:

```
holdRatio   = mean holding time of losers ÷ mean holding time of winners     flag > 1.5, watch > 1.2
payoffRatio = mean win ÷ mean loss                                           flag < 0.8, watch < 1.2
sizeRatio   = mean size after a loss ÷ mean size otherwise                   flag > 1.4, watch > 1.15
```

Thresholds are **ours**; the three effects (disposition, payoff asymmetry, revenge sizing) are
standard behavioural findings.

### 5.10 Market weather band and Ask the engine

Weather maps the regime label to Clear skies / Choppy / Storm warning and appends the mean sector
correlation and India VIX. `lib/explain.js → facts` assembles: the regime and mean ρ, the change
against 20 windows earlier, the three tightest sector pairs, the four pairs that moved most, the
most isolated and most coupled sectors, plus live index, breadth, VIX and flows. `plainAnswer`
turns those into prose by rules — no model involved. If `ANTHROPIC_API_KEY` and the Anthropic SDK
are present, the same facts (and nothing else) are sent to Claude with instructions to use only
those numbers and give no advice.

---

## 6. Candidate 1 — streaming persistent homology

`app.js → runStreamBench`. Two halves timed separately over the last 120 sessions.

**Rolling correlation update.** Keep per-series sums and per-pair cross sums:

```
Sᵢ = Σ xᵢ,  Qᵢ = Σ xᵢ²,  Pᵢⱼ = Σ xᵢxⱼ        over the window
On a new session (adding t, dropping t−W):
Sᵢ += xᵢ,t − xᵢ,t−W ;  Qᵢ += xᵢ,t² − xᵢ,t−W² ;  Pᵢⱼ += xᵢ,txⱼ,t − xᵢ,t−Wxⱼ,t−W
ρᵢⱼ = (Pᵢⱼ − SᵢSⱼ/W) / √((Qᵢ − Sᵢ²/W)(Qⱼ − Sⱼ²/W))
```

O(n²) per session against O(n²W) for a rebuild, and the window of history need not be stored.

**Reduction reuse.** The pairing (which edge is born, which edge kills it) depends only on the
*order* of the edges, not their values. The benchmark sorts the edges each session and compares the
permutation with the previous one: unchanged means the previous pairing can be reused with new
distances. It also counts how many positions moved, which is the measured result — the order moves
on essentially every session, so the reduction, not the correlation work, is where the claim has to
bite. Vineyard transposition updates are **not** implemented.

---

## 7. Candidate 3 — two-parameter fingerprint

`app.js → renderBifiltration`. Second axis is realised volatility, **ours** (bid-ask spread and
depth are not in a free feed).

```
volᵢ = √( mean((rᵢ − r̄ᵢ)²) × 252 ) × 100         annualised, in percent
rows:    six volatility floors at quantiles of the sector vols
columns: ten values of ε from maxD/10 to maxD
cell(v, ε): Rips persistence on the sub-matrix of sectors with volᵢ ≥ v, then
            β₀ = bars with death > ε ; β₁ = bars with birth ≤ ε < death
```

That grid is the rank invariant (the Hilbert function of the bifiltration), not a complete
multiparameter invariant. Reading: if the high-volatility corner stays fragmented at an ε where the
whole market has merged, the stress is local to volatile sectors rather than a broad correlation
crash.

---

## 8. Candidate 4 — self-calibration

`lib/patents.js → calibrate`, run once per build over windows {20, 30, 40, 60, 80, 100, 120}.

For each candidate window: build the `ρ̄` series and its own 33/67 labels, then

```
drift      = mean over consecutive CALM sessions of W₁(diagramₜ₋₁, diagramₜ)
stability  = 1 / drift
falseAlarm = (sessions labelled non-calm while ≥3 of the 4 neighbouring sessions are calm)
             ÷ (sessions with that calm surrounding)
chosen     = the window with the highest stability among those with falseAlarm ≤ 5%
```

`W₁` here is the 1-Wasserstein distance approximated by sorting the persistence lengths of both
diagrams descending, padding the shorter with zeros, and summing absolute differences (**ours** —
the exact optimal matching is not computed). On the current data the sweep chooses **120 sessions**
with a 1.7% false-alarm rate.

---

## 9. Candidate 5 — the surrogate gate

`lib/patents.js → surrogateTest, shiftTest`. Two nulls, both **standard methods**, combined by our
own gate rule.

**Null A — is there structure at all? Phase randomisation.** For each sector's return series: take
the DFT, keep the amplitude spectrum, replace each phase with a uniform random draw, restore
Hermitian symmetry (`X[n−k] = conj(X[k])`), invert. Each surrogate keeps that sector's own variance
and autocorrelation and destroys the cross-sector structure. 150–200 surrogates; the statistic is
mean sector correlation, and `p = 1 − F_null(observed)`.

**Null B — has it changed? Block bootstrap from the previous window.** Take the *joint* return rows
of the previous W sessions and resample them in blocks of 5 (keeping cross-sectional correlation
intact, destroying time order) to build W synthetic sessions; recompute `ρ̄`. 300–400 draws give a
95% band from the 2.5th and 97.5th percentiles, and a two-sided `p`.

**Gate — ours.** The alert is justified only when Null B rejects at p < 0.05: structure alone is not
news, a *change* in it is. Verdict labels on Null A: p < 0.05 real, < 0.2 weak, else noise.

---

## 10. Candidate 6 — cross-asset contagion

`app.js → renderContagion` over 14–16 indices in five layers (equities, G-Secs, corporate bonds,
REITs, India VIX), all from NSE's daily index file.

- **Coupling series — ours.** For each 60-session window, the mean of `|ρ|` over pairs that cross
  layers and involve an equity index.
- **Network map.** Distance matrix over layers → MDS; edges drawn for the shortest 30% of pairs,
  with cross-layer edges highlighted.
- **Loop tracking — ours, an approximation of zigzag persistence.** Every fifth window, take the
  longest H₁ bar with persistence > 0.05 and its representative cycle's vertex set. Chain it to the
  previous window's loop when the Jaccard overlap of the two vertex sets is ≥ 0.5; otherwise start a
  new chain. The table reports each chain's start, end, maximum persistence and the asset classes it
  spans. Proper zigzag persistence over the union complexes is not computed.

---

## 11. Candidate 7 — IV-surface topology

`lib/patents.js → ivSurface, impliedVol, cubicalH0`.

1. **Implied volatility by inversion** (standard): for each strike within ±8% of the underlying, on
   the out-of-the-money side only (calls above spot, puts below), solve `BS(v) = closing price` by
   bisection on `v ∈ [0.01, 3]`, 60 iterations. Quotes at or below intrinsic + ₹0.05 are rejected,
   as are solutions outside (0.02, 2.9).
2. **Grid**: up to five expiries after the trade date × the strikes that produced a valid IV; gaps
   along an expiry row are filled by linear interpolation between the nearest valid neighbours so
   the complex is connected (**ours**).
3. **Sublevel-set cubical persistence, H₀** (standard): sort cells ascending by IV; insert one at a
   time with 4-neighbour connectivity; a cell with no inserted neighbour starts a component, and
   when two components meet, the *younger* (higher birth) dies at the current value — the elder
   rule. Bars are `[birth, death]` in volatility points; one component never dies.
4. **Reading**: basins = significant bars (persistence > 0.5 volatility points) plus the essential
   one. Several persistent basins mean the market is pricing different stories at different strikes.

---

## 12. Every choice that is ours, in one list

A reviewer should push on these, because none of them is a standard anyone else has validated:

1. Regime labels as the 33/67 percentiles of mean sector correlation over the loaded history.
2. Mean *pairwise sector correlation* as the regime statistic (rather than eigenvalue or entropy measures).
3. Mood-meter weights: 35% breadth, 30% flows, 35% volatility, and each component's mapping.
4. The 25%-of-capital concentration warning, and 2 × ATR as the default stop distance.
5. Topo-Screen's 30-session correlation windows and the "distance from cluster" definition.
6. The double-bottom rule's parameters (±3 bar minima, 10 bars apart, 3% tolerance, 6% neckline).
7. Diagnostic thresholds: 1.5 hold ratio, 0.8 payoff ratio, 1.4 size ratio.
8. Portfolio verdict bands on `effN / N` and the 0.6 clustering threshold.
9. Realised volatility as the second axis of the bifiltration, and the six-by-ten grid.
10. The calibration objective: 1-Wasserstein drift in calm stretches, subject to a 5% false-alarm
    ceiling, with the false-alarm definition given in §8.
11. The gate rule: act only when the block-bootstrap null rejects at p < 0.05.
12. Loop matching by Jaccard ≥ 0.5 as a stand-in for zigzag persistence.
13. Row-wise interpolation of missing IV cells before cubical persistence.
14. `r = 6.5%` as the risk-free rate, and no dividend yield, in every Black–Scholes call.

## 13. What is deliberately not computed

- Vineyard transposition updates (candidate 1).
- A complete multiparameter invariant (candidate 3) — only the rank invariant.
- Embedding dimension and delay calibration (candidate 4) — the pipeline has no delay embedding.
- True zigzag persistence (candidate 6); FX and crypto layers, which NSE's index file lacks.
- H₁ of the IV surface (candidate 7) — H₀ basins only, on one trading day.
- Debt-to-equity and profit growth anywhere — they need annual reports or a paid data provider.
