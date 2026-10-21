# Presentation scripts

Four scripts: one full walkthrough, and three thirty-second versions for different rooms.

**Before you present:** start the server, then run `node brief.js`. It prints every number in these
scripts as it stands today. The figures below are from **7 Oct 2026** — they will have moved, so
re-read them off the brief and speak the current ones.

---

# 1 · The full walkthrough — about 8 minutes

Stage directions in **bold brackets**. Everything else is spoken.

### 0:00 — Hook  *(20 s)*

**[Home page, full screen]**

"Everything on this screen is live. Not a mock-up, not a screenshot — this machine pulled it from
the NSE and the BSE a few seconds ago. NIFTY at 22,603, India VIX at 13.93, and for every 100
stocks that rose today, 230 fell."

### 0:20 — The problem  *(40 s)*

"Two things exist in India today. Courses — paid academies, free platforms — that teach five
pillars: fundamentals, technicals, derivatives, risk, psychology. And screeners that throw numbers
at you: P/E 35, beta 1.4.

Neither helps a beginner. The course teaches P/E with a textbook example; the screener shows a P/E
with no meaning attached. And both pretend the market always behaves the same way. It doesn't.

Sthiti joins the two, and adds a third thing nobody sells: an engine that tells you what state the
market is in before you apply any of it."

### 1:00 — Learn  *(60 s)*

**[Click Learn]**

"Twelve lessons, three stages. Stage one assumes you've never bought a share — what you actually
own, how to read a price, what makes a business worth something.

**[Open lesson 1]**

Each one is a few minutes of reading, the key terms, two questions, and one link to the single tool
that applies it. The questions never change — they're written into the project, not generated — so
every student gets the same lesson.

**[Click an answer, show the explanation]**

And the path knows where you are. Stage two is method: moving averages, RSI, position sizing. Stage
three is options, implied volatility, and the regime engine itself — explained without a single
equation."

### 2:00 — Tools  *(90 s)*

**[Click Tools, scroll to the screener]**

"Every lesson ends on a live number. Here's the screener.

**[Tap the P/E cell for TCS]**

Tap any number and it explains that number for that stock, right now: TCS at 15 times earnings,
against its own sector index at 17.8. Below its sector, not above — and the scorecard tells you
which four of five checks pass.

**[Scroll to the mood meter]**

The mood meter takes three real numbers — breadth, institutional flows, India VIX — and says what
they mean in English: foreign investors sold ₹6,121 crore, domestic funds bought ₹4,597 crore, so
Indian institutions absorbed the foreign selling.

**[Scroll to the position calculator]**

Risk management is arithmetic, so we do the arithmetic: your capital, one percent risk, a stop two
ATRs below entry — and it tells you the number of shares. Change nothing but the stock's volatility
and the position size halves. That's the lesson, enforced.

**[Scroll to the option simulator]**

And the live NIFTY option chain, as a payoff graph. Real strikes, real premiums, real implied
volatility, with max pain and the put-call ratio computed from today's open interest."

### 3:30 — The regime engine  *(90 s)*

**[Click Regime engine]**

"Now the part that is ours.

Picture every sector as a dot, placed so that sectors that move together sit close. That's the
shape of the market. We grow a radius around each dot and record when groups merge and when loops
open and close. That record is the barcode on the right.

**[Drag the ε slider]**

Watch it: at a small radius every sector is its own island. Grow it and they join. Each bar is one
group, and it ends where that group merges.

**[Drag the window slider back through the year]**

And here's the point. Drag the window back through the last two years and the shape changes. When
correlations rise, groups merge earlier and the bars get short.

Today the average correlation between our seventeen sector indices is 0.37, which sits in the
lowest third of the last two years. The engine calls that **calm**.

**[Click the 2020 crash replay]**

This is the same calculation on February to May 2020. Mean correlation 0.81. Everything merges
almost immediately — the shape collapses. That's what a crisis looks like topologically, and the
structure starts warping before the index does."

### 5:00 — Proof  *(45 s)*

**[Tools → Regime backtester]**

"Does the state actually matter? We ran three course strategies across all 500 NIFTY stocks, two
years, and tagged every trade with the regime on the day it opened.

The golden cross: 29% win rate in calm markets, losing 3.2% a trade. In stress regimes, 52% and
plus 3.6%.

I'll be honest — that's the opposite of what we expected. We assumed you'd filter stress out. The
data says the signal worked better there. It's 314 trades with no costs deducted, so it's a finding,
not a strategy. But it's the kind of finding you can only get by conditioning on regime, which is
exactly the claim."

### 5:45 — The seven candidates  *(60 s)*

**[Regime engine → Candidates running]**

"Seven patent candidates, and each one runs here, on real data.

**[Point to the status table]**

Attribution names the sectors behind a shift. The two-parameter fingerprint separates a volatility
squeeze from a correlation crash. Self-calibration sweeps seven window lengths and picks 120
sessions on stability, with false alarms under two percent.

**[Click Run the gate]**

This one gates the alert: a phase-randomised null asks whether there's structure at all, and a
bootstrap from the previous window asks whether it has actually changed. Only the second one opens
the gate.

And the last column of that table is what each prototype *can't* do — vineyard updates aren't
implemented, zigzag persistence is approximated. We'd rather say that than oversell it."

### 6:45 — Research and regulation, spoken  *(60 s)*

**[Leave the candidates table on screen and turn to the room — this part is yours, not the site's]**

"Where does this sit against what already exists?

Academically, the basic idea is taken. Six lines of research show that persistent homology picks up
market stress — Gidea and Katz on US indices around 2000 and 2008, early-warning work in Singapore
and Malaysia, correlation-network diagrams compared by Wasserstein distance, and three studies from
the last two years. They share three limits: one variable at a time, mostly US and East Asian data,
and the signal read after the fact. None of them names the sectors behind a shift.

Commercially, the market is split in two. Topology is sold as a general platform — Ayasdi, or
open-source libraries like giotto-tda. Regime detection is sold as statistics — State Street, Two
Sigma, retail indicator scripts. Nobody sells the two together as a live, explainable engine. That
gap is what the seven candidates are written for.

Two things we'd flag before this becomes a product. The data is read from NSE and BSE public
endpoints — a real product needs a licensed feed. And SEBI's finfluencer rules restrict educators
using recent price data, so the live-data teaching model may need Research Analyst registration.
That's a lawyer's question, and we've written it into the plan rather than discovering it later."

### 7:45 — Close  *(20 s)*

**[Back to Home]**

"So: a learning path a beginner can actually start, tools that read a live Indian market, and an
engine that says which lessons apply today. Seven candidates, all running, with their limits stated.

Happy to take it apart wherever you want to push."

---

# 2 · Thirty seconds — "What is it?"  *(the default opener)*

> "Indian stock-market courses teach five things — fundamentals, charts, options, risk, psychology
> — and then leave you in front of a screener full of numbers with no meaning attached.
>
> Sthiti ties every lesson to a live NSE number, so a P/E or an RSI arrives explained. And
> underneath it, a topological engine reads how closely sectors are moving together and tells you
> which state the market is in — because the same signal behaves differently in a calm market and a
> falling one.
>
> It's running live right now, on real exchange data."

*≈ 80 words. If they only hear one sentence, make it the third.*

---

# 3 · Thirty seconds — "What's new about it?"  *(for the IP or research reviewer)*

> "Topological data analysis in finance isn't new — there's a decade of papers. But the published
> work reads the signal after the fact, on one variable, mostly on US data, and nobody names what
> caused the shift.
>
> We have seven patent candidates running on live Indian data. The strongest: a streaming engine
> that updates instead of rebuilding, and attribution that names the sectors behind a shift rather
> than reporting that a norm spiked.
>
> Indian markets are the open field — NIFTY 500, F&O, G-secs are barely touched in the literature."

*≈ 85 words. Expect "what's actually implemented?" — answer: all seven, with their limits written
into the page.*

---

# 4 · Thirty seconds — "Does it work?"  *(for the sceptic)*

> "We tested it. Three textbook strategies, all 500 NIFTY stocks, two years, every trade tagged with
> the market regime on the day it opened.
>
> The golden cross wins 29% of the time in calm markets and loses money. In high-correlation
> regimes: 52% and plus three-point-six percent a trade.
>
> That's the opposite of what we assumed, and we left it on the screen. 314 trades, no costs
> deducted — so it's a finding, not a strategy. The point is that the regime changes the answer,
> and nothing else on the market tells you the regime."

*≈ 90 words. Trim the last sentence if you're tight.*

---

## Demo notes

- **Market closed?** Say so first — "this is Tuesday's close" — and nothing else changes. The
  engine, scanner, backtester and option chain all work on the last session.
- **If the status bar shows a timeout:** NSE throttles automated access; the page keeps the last
  good values and recovers on the next poll. Say that plainly if asked — it's one of the reasons a
  real product needs a licensed feed.
- **Fastest recovery if something hangs:** reload the page. The server keeps everything cached, so a
  reload costs a second or two, not the two-minute history download.
- **Keep the brief open** in a terminal beside the browser: `node brief.js`.
- **There is no Research tab.** Prior art, gaps and regulation are spoken at 6:45, not shown. If
  someone asks to see the prior art, it is in the Annexure of the invention disclosure form.
- **Two questions you will get.** *"Is this investment advice?"* No — every tool explains a number
  and names the lesson; nothing recommends a trade. *"Where does the data come from?"* NSE's public
  endpoints and daily archive files, BSE's quote API; all of it listed in `README.md`.
