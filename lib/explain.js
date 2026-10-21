'use strict';
// "Why did the regime shift?" — facts from the engine, a written answer, and an
// optional Claude-written answer when ANTHROPIC_API_KEY and the SDK are present.

const an = require('./analytics');

const f = (v, d) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(d));

// Everything the explainer is allowed to talk about, pulled from real data.
function facts(eod, live) {
  const sectors = eod.sectors;
  const dates = eod.dates;
  const R = sectors.map((s) => an.logRets(s.c));
  const last = R[0].length - 1;
  const at = (end) => {
    const seg = R.map((r) => r.slice(end - an.WIN + 1, end + 1));
    const pairs = [];
    let sum = 0;
    for (let i = 0; i < seg.length; i++) for (let j = i + 1; j < seg.length; j++) {
      const c = an.corr(seg[i], seg[j]);
      pairs.push({ a: sectors[i].code, b: sectors[j].code, rho: c });
      sum += c;
    }
    return { pairs, rho: sum / pairs.length };
  };
  const now = at(last), prev = at(Math.max(an.WIN - 1, last - 20));
  const byPair = new Map(prev.pairs.map((p) => [p.a + '|' + p.b, p.rho]));
  const moved = now.pairs
    .map((p) => ({ ...p, chg: p.rho - (byPair.get(p.a + '|' + p.b) ?? p.rho) }))
    .sort((x, y) => Math.abs(y.chg) - Math.abs(x.chg));
  const avgBySector = {};
  sectors.forEach((s, i) => {
    let sum = 0, n = 0;
    now.pairs.forEach((p) => { if (p.a === s.code || p.b === s.code) { sum += p.rho; n++; } });
    avgBySector[s.code] = sum / n;
  });
  const ranked = Object.entries(avgBySector).sort((a, b) => a[1] - b[1]);
  const regime = an.regimeSeries(sectors, dates);
  const label = regime.label(now.rho);
  const ix = (live && live.indices) || {};
  const n50 = ix['NIFTY 50'] || {}, n500 = ix['NIFTY 500'] || {}, vix = ix['INDIA VIX'] || {};
  const flows = (live && live.flows) || {};
  return {
    asOf: eod.asOf,
    regime: label,
    meanRho: now.rho,
    meanRhoChange: now.rho - prev.rho,
    windowDays: an.WIN,
    sectorsWatched: sectors.length,
    tightestPairs: now.pairs.slice().sort((a, b) => b.rho - a.rho).slice(0, 3),
    biggestMoves: moved.slice(0, 4),
    mostIsolated: ranked.slice(0, 2).map(([code, rho]) => ({ code, rho })),
    mostCoupled: ranked.slice(-2).reverse().map(([code, rho]) => ({ code, rho })),
    nifty: { last: n50.last, pct: n50.pct },
    breadth: n500.advances && n500.declines ? { advances: n500.advances, declines: n500.declines, ratio: n500.advances / n500.declines } : null,
    vix: vix.last,
    flows: { fii: flows.fii || null, dii: flows.dii || null },
    scannerHits: (eod.scan || []).length,
    thresholds: { calmBelow: regime.p33, stressAbove: regime.p67 },
  };
}

const NAMES = { calm: 'Calm', trans: 'Transitional', stress: 'Stress' };

// Written from the numbers, with no model involved — this is always available.
function plainAnswer(x) {
  const dir = x.meanRhoChange > 0.02 ? 'risen' : x.meanRhoChange < -0.02 ? 'fallen' : 'held steady';
  const lines = [];
  lines.push(
    `The engine reads **${NAMES[x.regime]}** for ${x.asOf}. Average correlation between the ${x.sectorsWatched} NSE sector indices over the last ${x.windowDays} sessions is ${f(x.meanRho, 2)}, and it has ${dir} (${x.meanRhoChange >= 0 ? '+' : '−'}${f(Math.abs(x.meanRhoChange), 2)}) over the last month. Below ${f(x.thresholds.calmBelow, 2)} counts as calm for the past year, above ${f(x.thresholds.stressAbove, 2)} as stress.`
  );
  const mv = x.biggestMoves[0];
  if (mv) {
    lines.push(
      `The biggest change in the structure is ${mv.a} and ${mv.b}, whose correlation ${mv.chg >= 0 ? 'rose' : 'fell'} to ${f(mv.rho, 2)} (${mv.chg >= 0 ? '+' : '−'}${f(Math.abs(mv.chg), 2)}). ` +
      `The tightest pair right now is ${x.tightestPairs[0].a}–${x.tightestPairs[0].b} at ${f(x.tightestPairs[0].rho, 2)}; ${x.mostIsolated[0].code} sits furthest from everything else at an average ${f(x.mostIsolated[0].rho, 2)}.`
    );
  }
  const bits = [];
  if (x.vix) bits.push(`India VIX at ${f(x.vix, 2)}`);
  if (x.breadth) bits.push(`${f(x.breadth.ratio, 2)} stocks rising for every one falling`);
  if (x.flows.fii) bits.push(`FIIs ${x.flows.fii.net >= 0 ? 'bought' : 'sold'} ₹${Math.abs(Math.round(x.flows.fii.net)).toLocaleString('en-IN')} crore`);
  if (x.flows.dii) bits.push(`DIIs ${x.flows.dii.net >= 0 ? 'bought' : 'sold'} ₹${Math.abs(Math.round(x.flows.dii.net)).toLocaleString('en-IN')} crore`);
  if (bits.length) lines.push(`Alongside: ${bits.join(', ')}.`);
  lines.push(
    x.regime === 'stress'
      ? 'While sectors move together, spreading money across them buys less protection than it looks like. Size positions down, and treat breakout signals with suspicion.'
      : x.regime === 'trans'
        ? 'The structure is drifting. Tighten stops, check breadth before trusting a breakout, and watch whether correlations keep rising.'
        : 'Sectors are moving apart, so stock-specific work pays off and normal chart rules apply.'
  );
  return lines.join('\n\n');
}

/* ---------- optional Claude answer ---------- */
function sdk() {
  try { return require('@anthropic-ai/sdk'); } catch (_) { return null; }
}
function llmAvailable() { return Boolean(process.env.ANTHROPIC_API_KEY && sdk()); }

async function llmAnswer(question, x) {
  const Anthropic = sdk();
  if (!Anthropic || !process.env.ANTHROPIC_API_KEY) return null;
  const client = new (Anthropic.default || Anthropic)();
  const res = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 700,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system:
      'You explain topological data analysis of Indian stock-market data to people who are not quants. ' +
      'Answer in at most four sentences, in plain English, using only the numbers in the JSON given to you. ' +
      'Never invent a number, a stock or an event. If the JSON does not answer the question, say so. ' +
      'Do not give investment advice or tell anyone to buy or sell.',
    messages: [{
      role: 'user',
      content: `Engine output (JSON):\n${JSON.stringify(x)}\n\nQuestion: ${question}`,
    }],
  });
  if (res.stop_reason === 'refusal') return null;
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || null;
}

module.exports = { facts, plainAnswer, llmAnswer, llmAvailable };
