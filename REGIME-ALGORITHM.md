# The regime engine, line by line

Traced on the data the server is holding right now: **17 NSE sector indices, 500 sessions,
24 Sep 2024 → 1 Oct 2026**. Every step below shows the operation, the formula, the code that runs
it, and the value it produced on this run, so the whole chain can be checked by hand.

A *regime* here means one thing only: **how closely the sector indices have been moving together
over the last W sessions.** Nothing about price level, trend or volatility enters the label.

---

## Part A — Inputs

| Input | Where from | Shape today |
|---|---|---|
| Sector index closes | `ind_close_all_<DDMMYYYY>.csv`, one file per session, parsed in `lib/eod.js → dayIndices` | 17 series × 500 sessions |
| Which 17 | `lib/config.js → SECTORS`, filtered to those with no gap over the period | AUTO, BANK, PSU BANK, FIN SERV, IT, PHARMA, FMCG, METAL, ENERGY, REALTY, MEDIA, INFRA, CONS DUR, OIL & GAS, HEALTH, COMMOD, PVT BANK |
| Window length W | 60 sessions by default; the calibrated value (120) is applied by the button in candidate 4 | 60 |

---

## Part B — The algorithm, step by step

### S1. Build the aligned close matrix
`lib/eod.js → build` keeps only dates that have both an equity file and an index file, takes the
last 500, and reads each index's close per date.

→ `C[i][t]`, i = 1…17, t = 1…500.

### S2. Convert to log returns
`lib/analytics.js:10 → logRets`, client mirror `public/app.js:629 → logRet`

```
r[i][t] = ln( C[i][t] / C[i][t−1] )
```

→ 499 returns per sector. Log returns are used so that joining two periods adds, and so a −50%
and a +100% move are equal and opposite.

### S3. Choose the window
The window is the last W returns ending at index `t`. FIG. 1's slider moves `t`; the newest window
ends at the last session.

→ `t = 498`, W = 60 → returns 439…498.

### S4. Pairwise correlation inside the window
`lib/patents.js:66 → corrMatrix`, which calls `lib/analytics.js:12 → corr`; the client does the same
in `public/app.js:630 → corrDist`.

```
ρ(i,j) = Σ(xₜ−x̄)(yₜ−ȳ) / √( Σ(xₜ−x̄)² · Σ(yₜ−ȳ)² )     clamped to [−1, 1]
```

→ 17 × 16 / 2 = **136 pairs**.

### S5. The regime statistic
Same function, accumulated as it goes:

```
ρ̄ = (1 / 136) · Σ_{i<j} ρ(i,j)
```

→ **ρ̄ = 0.3832** for the window ending 1 Oct 2026.

### S6. Correlation distance matrix
`lib/analytics.js:21 → dist`

```
d(i,j) = √( 2 · (1 − ρ(i,j)) )
```

→ a 17 × 17 matrix; the largest entry today is **1.569** (two sectors that moved almost
independently; √2 ≈ 1.414 is the uncorrelated point, so this pair is mildly *negatively*
correlated).

### S7. Repeat for every window in the history
`lib/analytics.js:24 → regimeSeries` runs S3–S5 for every t from W−1 to the end.

→ **440 windows**, each with its own ρ̄. This series is the line on FIG. 1's timeline.

### S8. Set the thresholds from that series
Same function. The series is sorted and cut at the 33rd and 67th percentiles:

```
p33 = sorted[⌊0.33 · 440⌋]
p67 = sorted[⌊0.67 · 440⌋]
```

→ **p33 = 0.4861, p67 = 0.5719**. These are the only two numbers that define the regime bands, and
they are recomputed from whatever history is loaded — they are not constants.

### S9. Label the window
`lib/analytics.js:35`, client `public/app.js:716 → regimeOf`

```
ρ̄ < p33                 → calm
p33 ≤ ρ̄ < p67            → transitional
ρ̄ ≥ p67                 → stress
```

→ 0.3832 < 0.4861 → **calm**.

### S10. Persistence on the distance matrix
`public/app.js:669 → persistence`, server copy `lib/patents.js:29`. This is what turns the matrix
into the barcode. Six sub-steps:

1. **Edges.** All 136 pairs, sorted ascending by `d`.
2. **H₀ by union-find.** Walk the sorted edges; if an edge joins two separate components, the
   younger one dies and a bar `[0, d]` is recorded. → **16 bars** (plus one component that never
   dies). The longest deaths today: 1.220, 1.123, 1.022, 0.998, 0.919 — those are the sectors that
   stayed independent longest.
3. **Triangles.** All 680 triples, each represented by its three edge indices, sorted by the
   longest of the three.
4. **Reduction over 𝔽₂.** Each triangle's column is reduced by adding (symmetric difference with)
   previously stored columns whose pivot matches its current lowest index, until it is empty or
   its pivot is new.
5. **H₁ bars.** A surviving column pairs its pivot edge (birth) with the triangle (death) →
   `[birth, death]`. → **1 bar today: [1.12, 1.12]** — a loop that closes the instant it opens, so
   it is discarded by the 0.02 persistence filter. The market currently has **no loop**.
6. **Landscape L¹** `Σ (death − birth)² / 4` → **0.0000**, consistent with no surviving loop.

### S11. Read the barcode at the chosen ε
`public/app.js:759 → updateEps`

```
β₀(ε) = number of H₀ bars with death > ε          groups still separate at radius ε
β₁(ε) = number of H₁ bars with birth ≤ ε < death   loops open at radius ε
```

The link back to correlation is `ρ = 1 − ε²/2`, which is the line printed under the ε slider.

### S12. Attribution
`public/app.js:753 → cycleSectors`. The reduced column of the longest H₁ bar *is* a cycle of edges;
its vertices are collected, ordered by angle around their centroid, and printed as sector codes —
"the loop runs through AUTO → BANK → REALTY…". With no loop today, the line reads that there is
none.

### S13. Place the dots (display only)
`public/app.js:648 → mds`. Classical MDS: `B = −½ · J · D² · J`, then the top two eigenvectors by
power iteration. The dots are a 2-D shadow of a 17-dimensional object; the barcode in S10 is
computed from the true distances, not from the picture.

### S14. Drive the rest of the page
`public/app.js:722 → selectWindow` writes the label into:

- FIG. 1's regime line and the home page's state card (`updateHomeRegime`),
- the weather band (`updateWeather`),
- the highlighted column in "Regimes → lessons",
- the scanner's regime-check strip,
- and the lesson the site recommends next.

---

## Part C — What each regime is, and what it does

Boundaries in today's terms: **calm ρ̄ < 0.486 · transitional 0.486–0.572 · stress ρ̄ ≥ 0.572.**

### Calm — today, ρ̄ = 0.38

| | |
|---|---|
| What it means | Sectors are going their own way. Average pairwise correlation sits in the lowest third of the last two years. |
| In the barcode | Long H₀ bars (groups stay separate as ε grows — today's longest runs to 1.22), and loops can survive. |
| What the site surfaces | Fundamentals and chart patterns "as taught": the stock health scorecard, normal scanner output. |
| Why | When sectors disperse, a stock's own numbers explain more of its move, so stock-specific work pays. |
| Where it is set | `REG.calm` in `public/app.js:717` |

### Transitional — ρ̄ between 0.486 and 0.572

| | |
|---|---|
| What it means | Correlations are middling and drifting. The structure is neither dispersed nor collapsed. |
| In the barcode | H₀ bars shorten — groups merge at smaller ε — and loops die younger. |
| What the site surfaces | Tighter stops and a breadth check before trusting a breakout; the position calculator. |
| Why | Breakouts in a drifting market are as likely to be the market moving as the stock. |
| Where it is set | `REG.trans` |

### Stress — ρ̄ ≥ 0.572

| | |
|---|---|
| What it means | Sectors are moving as one. Correlation is in the top third of the last two years. |
| In the barcode | Everything merges at small ε, H₀ bars are short, H₁ usually empty: the shape has collapsed to a blob. |
| What the site surfaces | Smaller positions, option hedges, and the psychology lesson on panic selling. |
| Why | Diversification is a function of holdings moving differently. At high ρ̄, twenty stocks behave like one position. |
| Where it is set | `REG.stress` |

For reference, the COVID replay (April 2020) reads ρ̄ ≈ 0.81 against today's 0.38 — far above the
0.572 line, which is why it is labelled stress when judged against present-day thresholds.

---

## Part D — Deciding whether a regime *change* is real

A label flip on its own is not evidence. Candidate 5 runs two nulls (`lib/patents.js:183` and
`:334`), and the gate opens only on the second.

**Null A — is there structure at all? (phase randomisation)**
1. Take each sector's W returns and compute its DFT.
2. Keep the amplitude at every frequency; replace each phase with a uniform random draw.
3. Restore Hermitian symmetry `X[n−k] = conj(X[k])` so the inverse is real.
4. Invert → a surrogate series with the same variance and autocorrelation, no cross-sector links.
5. Recompute ρ̄ on the surrogate set. Repeat 150–200 times.
6. `p = 1 − F_null(ρ̄_observed)`.

**Null B — has the structure changed? (block bootstrap from the previous window)**
1. Take the **joint** return rows of the previous W sessions — one row per session, all 17 sectors.
2. Draw rows in blocks of 5, with replacement, until W synthetic sessions exist. Sampling whole
   rows keeps that window's correlation structure; the blocks keep short-run autocorrelation.
3. Recompute ρ̄. Repeat 300–400 times.
4. The 2.5th and 97.5th percentiles give a 95% band; `p` is two-sided.

**The gate:** act only when Null B rejects at p < 0.05. Structure alone is not news; a change in it
is. On the last run of this test, the current window read 0.476 against a previous-window band of
0.537–0.697 — outside it, so the gate opened.

---

## Part E — Where W = 60 comes from, and what the sweep says

`lib/patents.js:93 → calibrate` reruns the whole of Part B for W ∈ {20, 30, 40, 60, 80, 100, 120}
and scores each:

```
drift      = mean 1-Wasserstein distance between consecutive persistence diagrams,
             over CALM sessions only
stability  = 1 / drift
falseAlarm = sessions labelled non-calm while ≥3 of their 4 neighbours are calm,
             divided by the number of such sessions
choose the highest stability with falseAlarm ≤ 5%
```

This run:

| W | False alarms | Stability |
|---|---|---|
| 20 | 2.2% | 2.0 |
| 30 | 3.5% | 2.9 |
| 40 | 5.4% | 3.9 (fails the ceiling) |
| 60 | 3.7% | 5.5 |
| 80 | 0.8% | 7.1 |
| 100 | 0.0% | 8.0 |
| **120** | **1.7%** | **8.9 — chosen** |

Longer windows are steadier, as expected; the ceiling is there to stop the sweep choosing a window
so long that it never reacts. **FIG. 1 still runs at 60 by default** — the calibrated 120 is applied
only when you press the button in candidate 4, and the backtester's regime tags use the 60-session
series. That gap is deliberate (60 reacts fast enough to watch), and worth stating in a review.

---

## Part F — Edge cases built into the code

- **Replayed episodes** (2013, 2018, 2020) are labelled against the *live* thresholds, not their
  own, so "stress" means the same thing in every view. `buildEngineFrom(..., isLive=false)` keeps
  `LIVE_P`.
- **Older episodes carry fewer sectors** — indices such as Nifty Chemicals did not exist in 2013 —
  so the engine drops any sector without full coverage for that range and reports the count it used.
- **Zero-length H₁ bars** (birth = death, as today) are filtered at 0.02 persistence, so a loop that
  opens and closes at the same radius is never reported as structure.
- **A missing session** anywhere in a sector's history disqualifies that sector from the set, rather
  than being interpolated.
- **The live price** is appended as the current bar only when the market is open and the day's
  end-of-day file does not exist yet, so the newest window never double-counts a session.
