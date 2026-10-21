# Sthiti

Stock-market learning tied to live Indian market data, with a topological regime engine.
Every number on the site is read from NSE and BSE at run time. Nothing is seeded or invented.

## Run it

Needs Node 18 or newer (check with `node --version`).

```bash
node server.js
```

Then open **http://localhost:3000**.

The first start downloads about two years of NSE end-of-day files (two to three minutes, roughly
100 MB into `cache/`). Later starts read the cache and only fetch the newest day. Delete `cache/` to
rebuild from scratch.

## Where each number comes from

| Shown on the site | Source | Freshness |
|---|---|---|
| NIFTY 50, sector indices, India VIX, index P/E, advance/decline | NSE `allIndices` | live, 30 s while the market is open |
| Market open/closed | NSE `marketStatus` | live |
| FII / DII net flows | NSE `fiidiiTradeReact` | published daily, after the close |
| Stock price, P/E, EPS, ROE, margins, market cap, 52-week range | BSE quote API | live while the market is open |
| Price history, RSI, ATR, beta, moving averages, scanner, Topo-Screen, backtests | NSE daily bhavcopy + index close files (two years) | end of day |
| NIFTY option chain: strikes, premiums, IV, open interest | NSE `option-chain-v3`, F&O bhavcopy as fallback | live, 30 s while open |
| Sector correlation regime engine | computed from NSE index closes | end of day |

Anything the free feeds don't carry is left out and labelled, rather than filled in:
debt-to-equity and profit growth need the annual report or a paid fundamentals provider.

## Layout

```
server.js        HTTP server and API routes
lib/net.js       fetch helpers, NSE session cookies, BSE calls
lib/eod.js       daily-file downloads, cache, indicators, scanner, regime inputs
lib/live.js      live endpoints with caching and stale fallbacks
lib/ind.js       RSI, ATR, moving averages, beta, double-bottom rule
lib/config.js    stocks shown, sector indices watched, history length
public/          the site: index.html, app.css, app.js
cache/           downloaded daily files (safe to delete)
```

API: `/api/live`, `/api/quotes`, `/api/options`, `/api/eod`, `/api/status`, `/api/topo` (inside `/api/eod`),
`/api/portfolio` (POST), `/api/episode?from=&to=`, `/api/explain` (POST).

## The learning path

**Learn** is twelve lessons in three stages, written for someone who has never bought a share:

- **Stage 1 — Basics:** what you own, reading a price, what makes a business worth something, and
  the market's mood in four numbers.
- **Stage 2 — Method:** moving averages, RSI and its trap, position sizing and stops, and paper
  trading with habit diagnostics.
- **Stage 3 — Advanced:** options, implied volatility and the option chain, market regimes, and
  the barcode explained without mathematics.

Each lesson carries a few minutes of reading, key terms, two fixed questions with explanations,
and one link to the tool that applies it. The questions are written into `public/curriculum.js`
and never change with the market. Progress ticks are kept in the browser's local storage.

Every tool carries the stage it belongs to and a plain-English line saying what it is for, so the
Tools page can be read top to bottom by a beginner.

## The seven patent candidates, as running code

Engine page → **Candidates running**. Each panel computes on the downloaded data and states where
the prototype stops short of the claim.

| # | Candidate | What actually runs | Where it stops |
|---|---|---|---|
| 1 | Streaming persistent homology | Rolling correlation sums vs full rebuild, timed in the browser; counts how often the edge order moves | Vineyard transposition updates are not implemented, so every session still takes a full reduction |
| 2 | Regime attribution | Sectors ranked by how far their coupling moved, plus the stocks whose correlation moved most, plus the live representative cycle | Ranking by correlation movement, not a formal contribution decomposition |
| 3 | Two-parameter fingerprint | β₀ and β₁ over a grid of correlation distance × realised volatility | Realised volatility stands in for liquidity; the rank invariant, not a complete multiparameter invariant |
| 4 | Self-calibrating pipeline | Sweeps seven window lengths, scores diagram stability in calm stretches against a false-alarm ceiling, and can re-run FIG. 1 at the winner | Calibrates the window only |
| 5 | Surrogate-gated drift detector | Two nulls — phase-randomised sectors, and block-resampling from the previous window — with p-values and a gate verdict | Reports the action; does not place orders or retrain anything |
| 6 | Cross-asset contagion map | A network over equities, G-Secs, corporate bonds, REITs and India VIX, cross-asset coupling through time, and loops matched across windows | Loop matching approximates zigzag persistence; FX and crypto aren't in NSE's index file |
| 7 | IV-surface topology | Implied volatility inverted from NSE closing option prices across five expiries, then sublevel-set (cubical) persistence to find the surface's basins | H₀ basins on one trading day |

What the prototypes measured, as of the current data:

- **Candidate 1's honest result:** rolling correlation updates are about 4–5× cheaper than
  recomputing the window, but the edge ordering moves on essentially every session, so the
  reduction — not the correlation work — is where the claim has to bite.
- **Candidate 4** chose a 120-session window: the most stable diagrams, with a 1.7% false-alarm
  rate against a 5% ceiling.
- **Candidate 5** opened the gate: mean sector correlation of 0.48 sits outside the 0.54–0.70 band
  the previous window produces by resampling.
- **Candidate 7** found four basins in the strike × expiry surface.

## The six newer features

| Feature | Where | What it runs on |
|---|---|---|
| Market weather band | top of the home page | the engine's regime plus India VIX |
| Ask the engine | Regime engine → Ask why | the window's own numbers, written as sentences; optionally answered by Claude |
| Crash replay | Regime engine → Crash replay | NSE index archives for 2013, 2018 and 2020, replayed through the same filtration |
| Topo-Screen | Tools → Topo-Screen | 60-session correlation distance for ~490 NIFTY 500 stocks |
| Regime backtester | Tools → Regime backtester | two years of closes; every trade tagged with the regime on its entry day |
| Portfolio fragility | Tools → Portfolio fragility | your pasted holdings, correlated against each other |

NSE's index archive does not serve files old enough for 2008, so that episode isn't offered.

### Optional: let Claude answer free-form questions

"Ask the engine" always answers from the numbers with a written explanation. To also get a
model-written answer to arbitrary questions:

```bash
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY=sk-ant-...
node server.js
```

The server sends only the engine's computed facts (correlations, sector names, regime, VIX, flows)
and instructs the model to use nothing else and to give no investment advice. Without the key the
feature simply stays on the written explanation.

## Before this goes beyond a demo

- **Data licensing.** This reads NSE's public site endpoints and archive files and BSE's public
  quote API. Their terms don't license redistribution, and both throttle automated access. A
  product needs a licensed feed (NSE Data & Analytics or an authorised vendor) or a broker API
  with each user's own login.
- **SEBI rules.** Under SEBI's 2024–25 rules on unregistered finfluencers, people engaged only
  in education are exempt if they avoid market price data from the preceding three months, and
  regulated entities such as brokers can't associate with unregistered advisers. A platform
  built on live prices may need Research Analyst registration. Confirm with a securities lawyer.
- **Nothing here is advice.** The tools explain numbers; they don't recommend trades.

## Notes

- Paper trades live in the browser's local storage. "Clear log" resets them.
- The mood-meter weights (35% breadth, 30% flows, 35% volatility) are this project's own
  starting point, not a published standard.
- The regime thresholds are the lowest and highest third of mean sector correlation over the last
  two years, so "calm" and "stress" are relative to that window. Replayed episodes are judged
  against the same present-day thresholds.
- The backtester reports what the data says, including when that contradicts the pitch: on this
  sample the golden cross did better in stress regimes than in calm ones. Check each strategy
  before quoting a number.
