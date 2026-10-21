# The ten tools, line by line

Every tool traced on the data the server holds right now (**NSE/BSE, 1 Oct 2026 close, 500 sessions
of history**), so each step shows the number it actually produced. Code references are
`file.js:line → function`.

Reading order matches the Tools page. For each tool: **what it answers → inputs → the algorithm →
the output → what it cannot do.**

---

## 1. Screener and stock health scorecard (`#tools/t-screen`)

**Answers:** what every number on a stock's row means, and whether the company passes the checks a
course teaches.

### Inputs

| Field | Source | Freshness |
|---|---|---|
| Price, day change | BSE `getScripHeaderData` | live, 20 s cache when open |
| P/E, EPS, ROE, net margin, market cap, 52-week range | BSE `ComHeadernew`, `StockTrading`, `HighLow` | 6 h cache; consolidated preferred over standalone when both are positive |
| Sector P/E | NSE `allIndices`, the stock's mapped sector index (`lib/config.js → SCREENER`) | live |
| Beta, RSI, 50/200-DMA | computed here from NSE end-of-day closes | daily, plus the live bar |

### Algorithm

1. **Assemble the row.** `app.js → COLS` pulls each field through `fund()` (BSE) or `stk()` (computed).
2. **Live-bar merge.** `app.js → seriesLive`: if the market is open and today's end-of-day file does
   not exist yet, append the live price as today's close, then recompute RSI on that series, so the
   RSI column moves intraday.
3. **Cell click → lesson.** `app.js → lessonFor(sym, key)` is a switch over the column: each branch
   writes a sentence from that stock's own numbers (P/E against its sector index, ROE against the
   15% bar, beta as a sensitivity, RSI with the trend caveat).
4. **Scorecard.** `app.js → checksFor(sym)` runs five checks:

| Check | Pass | Watch | Flag |
|---|---|---|---|
| Valuation | P/E ≤ sector P/E | ≤ 1.3 × sector | > 1.3 × sector |
| Profitability | ROE ≥ 15% | ≥ 10% | < 10% |
| Margins | Net margin ≥ 15% | ≥ 8% | < 8% |
| Trend | close > 200-DMA | — | close < 200-DMA |
| Volatility | beta ≤ 1.0 | ≤ 1.3 | > 1.3 |

5. **"Why is the P/E high or low?"** `app.js → peWhy(sym)`: if P/E ÷ sector P/E > 1.1 it lists
   whichever of ROE ≥ 20%, net margin ≥ 18%, beta < 0.9, price above the 200-DMA hold, as the
   reasons investors pay up; below 0.9 it lists the negatives; with none present it says the premium
   looks stretched rather than inventing a reason.

### Traced now — TCS

```
BSE live price 2,079.30 · P/E 15.03 (consolidated) · ROE 59.92% · net margin 22.91%
market cap ₹7,52,309 cr · NSE close 2,075 · RSI 36.1 · beta 0.77
50-DMA 2,276.4 · 200-DMA 2,518.1 · 52-week 1,976.80 – 3,350
sector P/E (NIFTY IT) 17.8
→ Valuation  15.03 ≤ 17.8                    PASS
→ Profitability 59.92 ≥ 15                   PASS
→ Margins 22.91 ≥ 15                         PASS
→ Trend 2,075 < 2,518.1                      FLAG
→ Volatility beta 0.77 ≤ 1.0                 PASS
→ 4 of 5 checks pass; P/E is below sector, and peWhy cites the price below its 200-DMA
```

**Cannot do:** debt-to-equity and profit growth — neither is in a free feed. The scorecard says so
rather than leaving a gap.

---

## 2. Chart with RSI annotations (`#tools/t-chart`)

**Answers:** what this stock's price, trend and momentum have done, and where momentum hit extremes.

### Algorithm — `app.js → renderRSIChart`

1. Take the last 120 sessions of `seriesLive(sym)` (end-of-day closes, live bar appended if open).
2. `rsiSeries(closes, 14)` — Wilder's smoothing, and `sma(closes, 50, i)` at every index.
3. Price scale from min/max of closes and the 50-DMA, padded 7%; RSI scale fixed 0–100.
4. **Shaded runs:** walk the RSI array; any maximal run with RSI > 70 is painted as an overbought
   band across *both* panels, any run < 30 as oversold. The bands are runs, not single days, so the
   duration of an extreme is visible.
5. **Crossing markers:** a dot wherever `RSI_t > 70 and RSI_{t−1} ≤ 70` (and the mirror at 30);
   the most recent of each is labelled.
6. **Hover:** the x-pixel is mapped back to an index; a crosshair plus a tooltip reports that day's
   close, 50-DMA and RSI, with "overbought"/"oversold" appended when applicable.

**Cannot do:** intraday bars. Everything is daily closes plus the current live bar.

---

## 3. Market mood meter (`#tools/t-mood`)

**Answers:** what the whole market did today, as one reading, with the reasoning in words.

### Inputs — all live
Advance/decline from the NIFTY 500 row of `allIndices`; FII and DII net from `fiidiiTradeReact`;
India VIX from `allIndices`.

### Algorithm — `app.js:259 → moodModel`

```
b = clamp(50 + 50·ln(A/D) / ln 3, 0, 100)          breadth: 50 at A/D 1, 100 at 3, 0 at ⅓
f = clamp(50 + 50·(FII + DII) / 6000, 0, 100)      flows in ₹ crore, ±50 at ±6,000
v = clamp((30 − VIX) / 20 × 100, 0, 100)           100 at VIX 10, 0 at VIX 30
score = 0.35·b + 0.30·f + 0.35·v
zone: <25 Fear · <45 Cautious · <55 Neutral · <75 Optimistic · else Euphoric
```

The sentence under the gauge is rule-based (`app.js → moodText`): a branch on the signs of FII and
DII, a branch on breadth above or below 1, and a VIX band (<13 low, <20 moderate, <28 elevated,
else high), then the psychology line for the zone.

### Traced now

```
advances 110, declines 390 → A/D = 0.282
FII −9,484.22 cr, DII +10,041.84 cr → combined +557.62 cr
India VIX 14.44
b = 50 + 50·ln(0.282)/ln 3 = 50 − 57.6 → clamped to 0
f = 50 + 50·(557.62)/6000 = 54.6
v = (30 − 14.44)/20 × 100 = 77.8
score = 0.35·0 + 0.30·54.6 + 0.35·77.8 = 43.6 → Cautious
```

Breadth clamping at 0 is doing real work today: only 110 of 500 stocks rose, which is the weakest
component by far, and it drags an otherwise calm reading down into Cautious.

**Cannot do:** it has no memory. Each reading is today's session only; there is no trend of the mood
score.

---

## 4. Stop-loss and position calculator (`#tools/t-position`)

**Answers:** how many shares to buy, given your capital and the stock's volatility.

### Algorithm — `app.js:334 → renderPos`

```
budget        = capital × risk%                     default 1%
riskPerShare  = m × ATR(14)                         m default 2
stop          = entry − riskPerShare
target        = entry + R × riskPerShare            R default 2
sharesByRisk  = ⌊budget / riskPerShare⌋
sharesByCash  = ⌊capital / entry⌋
shares        = min(sharesByRisk, sharesByCash)
```

Entry defaults to the live price, ATR to the computed ATR(14). Three messages fire from the result:
capital-limited when `sharesByCash` binds; a concentration warning above 25% of capital; and always
the "if ATR doubled" line, which restates the size with `2m·ATR` to make the volatility-to-size link
explicit.

### Traced now — TCS, ₹5,00,000 capital, 1%, 2 × ATR, 2R

```
budget = 5,000 · riskPerShare = 2 × 58.79 = 117.58
stop = 2,079.30 − 117.58 = 1,961.72 (−5.7%)
target = 2,079.30 + 235.16 = 2,314.46 (+11.3%)
sharesByRisk = ⌊5,000 / 117.58⌋ = 42 · sharesByCash = ⌊500,000 / 2,079.30⌋ = 240
→ 42 shares, position ₹87,331 (17.5% of capital), loss if stopped ₹4,938, gain at target ₹9,877
```

**Cannot do:** it sizes one trade in isolation — no portfolio-level risk, no correlation between open
positions (that is tool 9).

---

## 5. Option strategy simulator (`#tools/t-options`)

**Answers:** what a given option structure pays, at expiry and today, priced at the live market.

### Inputs
NSE `option-chain-v3` for the nearest expiry — strike, traded price, implied volatility, OI, ΔOI,
volume per side — plus the lot size from the F&O bhavcopy.

### Algorithm — `app.js → computeOptions, renderPayoff, renderOI`

1. **ATM strike** = the listed strike nearest the underlying.
2. **Legs** from the strategy table, placed by index offset (the "strikes away" slider):
   long call, long put, bull call spread `[+C(atm), −C(atm+w)]`, bear put spread, long straddle,
   iron condor `[+P(atm−2w), −P(atm−w), −C(atm+w), +P(atm+2w)]`.
3. **Premiums** are the chain's traded prices. Only an untraded strike falls back to Black–Scholes at
   its own IV, and it is marked with an asterisk.
4. **Payoff at expiry** across a price grid:
   `Σ side · (max(0, S_T − K) or max(0, K − S_T) − premium) × lot × lots`.
5. **Today's curve** is the same sum with Black–Scholes values (`r = 6.5%`, each leg's own IV,
   `T = days to expiry / 365`), so at the current spot it passes through zero.
6. **Breakevens, max profit, max loss** on a 3,001-point grid from 0 to 3 × spot, with linear
   interpolation at sign changes. Unbounded outcomes come from the net call count: net long calls →
   unlimited profit, net short calls → unlimited loss.
7. **Open interest panel.** Bars per strike for CE and PE; `max pain` = the strike minimising
   `Σ_k [callOI_k · max(0, X − K_k) + putOI_k · max(0, K_k − X)]`; `PCR` = total put OI ÷ total call OI.

### Traced now

```
expiry 06-Oct-2026 · underlying 22,421.95 · lot 65 · 116 strikes · live chain
ATM 22,400 → CE ₹156.95 (IV 12.33%, OI 54,828) · PE ₹103.60 (IV 12.26%, OI 65,164)
max pain 22,550 · PCR 0.69
Bull call spread 22,400/22,700 at these prices: debit ≈ (156.95 − 63) × 65
```

**Cannot do:** Greeks, multi-expiry structures, and margin for short legs. The payoff is cash P&L on
the legs only.

---

## 6. Pattern and breakout scanner (`#tools/t-scanner`)

**Answers:** which NIFTY 500 stocks triggered a course signal on the latest close.

### Algorithm — `lib/eod.js → build` (scanner block)

For every constituent with ≥ 215 valid sessions, using prefix-sum SMAs and a monotonic-deque
rolling max so the whole universe scans in well under a second:

| Signal | Rule |
|---|---|
| Crossed above / below 200-day MA | `close > SMA200 and prevClose ≤ prevSMA200` (and mirror) |
| Golden / death cross | `SMA50 > SMA200 and prevSMA50 ≤ prevSMA200` (and mirror) |
| New 52-week high / low | `close >` max high of the previous 250 sessions (and mirror) |
| Double bottom | two local minima (lowest of a ±3 window), ≥ 10 bars apart, lows within 3%, neckline ≥ 6% above the higher low, latest close crosses it |
| RSI crossed 70 / 30 | `RSI_t > 70 and RSI_{t−1} ≤ 70` (and mirror) |

Each hit carries `volRatio = today's volume ÷ mean of the previous 20 sessions`; the list is sorted
by that ratio, and the page shows the top 25 of the selected group with a 60-close sparkline and a
regime-specific caution line.

### Traced now

```
60 hits from 480 scanned stocks: 13 moving-average, 28 breakouts/patterns, 19 RSI
top by volume: BAJAJ-AUTO crossed below its 200-day MA at 7.0× volume,
               BAJAJ-AUTO RSI crossed below 30 (22) at 7.0×,
               WELSPUNLIV new 52-week high at 5.1×
```

**Cannot do:** intraday scanning, and no pattern beyond the five rules above — each is explicit, so a
hit can always be checked by hand.

---

## 7. Topo-Screen (`#tools/t-topo`)

**Answers:** which stocks are moving independently of the market, and which have just broken away.

### Algorithm — `lib/analytics.js:44 → universeMetrics`

For every stock with ≥ 60 returns, over the last 30 returns, and separately over the 30 before that:

```
avgCorr  = mean ρ(stock, every other stock)        ~480 × 479 pair correlations
dist     = √(2 · (1 − avgCorr))                    distance from the market's centre
corrChg  = avgCorr(last 30) − avgCorr(previous 30)
corrMkt  = ρ(stock, NIFTY 50) over the last 30
```

Sorting by `dist` descending gives the isolated names (hedge and safe-haven candidates); sorting by
`corrChg` ascending gives the ones breaking out of the cluster. Cost is O(N²·30) ≈ 7 million
multiply-adds, run once per build.

### Traced now

```
480 stocks · most isolated: TATACHEM d = 1.52 (avg ρ −0.16)
                            INFY     d = 1.51 (avg ρ −0.14)
                            FSL      d = 1.51 (avg ρ −0.14)
```

Note √2 ≈ 1.414 is the uncorrelated point, so these three are *negatively* correlated with the
average stock over the last 30 sessions.

**Cannot do:** it measures co-movement, not cause. A stock can be isolated because it is quiet, or
because it is reacting to its own news.

---

## 8. Regime-conditioned backtester (`#tools/t-backtest`)

**Answers:** how a course strategy performed, split by the market state it traded in.

### Algorithm — `lib/analytics.js:130 → runBacktests`

1. For each of the 480 stocks and each strategy, walk sessions from index 205 (so the 200-day
   average exists).
2. **Entries and exits both fill at the next session's close** — nothing uses a bar before it exists.

| Strategy | Entry | Exit |
|---|---|---|
| Golden cross | SMA50 crosses above SMA200 | SMA50 < SMA200, or 60 sessions |
| RSI below 30 | RSI crosses below 30 | RSI > 50, or 20 sessions |
| New 52-week high | close above the previous 250-session high | 20 sessions, or close < 0.92 × entry |

3. Each trade records return %, holding length, and **the regime label of its entry date**, taken
   from the 60-session mean-correlation series (`regimeSeries`, see REGIME-ALGORITHM.md).
4. The panel computes per group: win rate = winners ÷ trades, mean return, mean hold, best, worst —
   then the difference between "your filter" and "every regime".

### Traced now — golden cross, 317 trades

| Regime at entry | Trades | Win rate | Average return |
|---|---|---|---|
| Calm | 107 | 28.0% | −3.10% |
| Transitional | 96 | 41.7% | −0.79% |
| Stress | 114 | 51.8% | **+3.64%** |

The result contradicts the intuition that stress regimes should be avoided: over these two years a
golden cross worked *better* when correlations were high. State this as a finding, not a strategy —
one signal over 500 sessions is a small sample, and no costs are deducted.

**Cannot do:** no brokerage, slippage, taxes or position sizing; every trade is equal-weighted.

---

## 9. Portfolio fragility scanner (`#tools/t-portfolio`)

**Answers:** whether a basket that looks diversified actually is.

### Algorithm — `lib/analytics.js:145 → portfolioReport`

1. Parse the pasted holdings; rescale weights to sum to 1.
2. Correlation matrix over the last 60 returns of each holding, and `d = √(2(1−ρ))` alongside it.
3. **Effective number of independent positions**

```
effN = 1 / ( Σᵢ wᵢ² + Σᵢ≠ⱼ wᵢ wⱼ ρᵢⱼ )
```

   which equals N for uncorrelated equal weights and 1 when everything moves as one.
4. **Clusters:** single-linkage union-find joining any pair with ρ ≥ 0.6; groups of 2+ are reported
   with their combined weight, their internal mean ρ, and the industries they span — the point being
   that a cluster spanning several industries is concentration a sector breakdown would miss.
5. **Per holding:** mean ρ against the rest, sorted — the most coupled names first.
6. The map is MDS of that distance matrix; dot size is weight, red marks cluster membership.
7. Verdict bands on `effN / N`: > 0.55 spread out, > 0.35 concentrated, else tightly coupled.

### Traced now — the example basket of nine

```
mean pairwise ρ = 0.111 · effN = 4.52 of 9 → 0.50 → "concentrated"
one cluster at ρ ≥ 0.6: TCS + INFY, 22% of the book, internal ρ 0.65
most coupled holdings: RELIANCE 0.19, INFY 0.14, MARUTI 0.13
```

Nine holdings behaving like 4.5 independent ones, with the two IT names the only tight pair.

**Cannot do:** only NIFTY 500 names with history; no mutual funds, bonds or unlisted holdings.

---

## 10. Paper trading and post-trade diagnostics (`#tools/t-paper`)

**Answers:** how you behave under pressure, read from your own trades.

### Algorithm — `app.js → ppBuy/ppSell, renderDiag`

1. Fills at the live BSE price; one stock at a time; virtual cash ₹10,00,000. Each closed trade
   stores symbol, quantity, average entry, exit, P&L, and holding time in minutes.
2. The log lives in browser storage — nothing is seeded, so the panel stays empty until you have
   three closed trades including at least one winner and one loser.
3. Three diagnostics:

```
holdRatio   = mean holding time of losers ÷ mean holding time of winners    flag > 1.5, watch > 1.2
payoffRatio = mean win ÷ mean loss                                          flag < 0.8, watch < 1.2
sizeRatio   = mean position size after a loss ÷ mean size otherwise         flag > 1.4, watch > 1.15
```

   The first is the disposition effect, the second says whether a high win rate is actually paying,
   the third is revenge sizing. Each verdict links to the lesson that addresses it.

**Cannot do:** it cannot judge entries. It measures only what the log contains — timing, size and
outcome.

---

## What the ten share

- **One data layer.** Everything reads the same cached end-of-day history and the same live
  endpoints; no tool fetches on its own.
- **One live-bar rule.** The current price is appended as today's bar only when the market is open
  and today's file does not exist, so no session is counted twice.
- **Every threshold is in `ALGORITHMS.md` §12**, and each is labelled standard, convention, or ours.
- **No tool recommends a trade.** They report numbers and name the lesson that explains them.
