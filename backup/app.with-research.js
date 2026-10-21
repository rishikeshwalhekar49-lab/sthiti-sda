/* Sthiti — front end. All numbers come from /api/*, which reads NSE and BSE. */
(function () {
  'use strict';

  /* ---------------- helpers ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nIN(v, d) { d = d || 0; return Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function inr(v, d) { return (v < 0 ? '−' : '') + '₹' + nIN(Math.abs(v), d); }
  function sInr(v, d) { return (v > 0 ? '+' : v < 0 ? '−' : '') + '₹' + nIN(Math.abs(v), d); }
  function sNum(v, d) { return (v > 0 ? '+' : v < 0 ? '−' : '') + nIN(Math.abs(v), d); }
  function sPct(v, d) { d = d == null ? 2 : d; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%'; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
  function list(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function f(v, d) { return Number(v).toFixed(d); }
  function niceTicks(a, b, n) { var span = b - a; if (span <= 0) return [a]; var raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag, step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag, t = []; for (var v = Math.ceil(a / step) * step; v <= b + step * 1e-6; v += step) t.push(Math.round(v / step) * step); return t; }
  function shortInr(v) { var a = Math.abs(v), s = v < 0 ? '−' : ''; if (a >= 1e7) return s + '₹' + (a / 1e7).toFixed(1) + 'Cr'; if (a >= 1e5) return s + '₹' + (a / 1e5).toFixed(a >= 1e6 ? 0 : 1) + 'L'; if (a >= 1e3) return s + '₹' + Math.round(a / 1e3) + 'k'; return s + '₹' + Math.round(a); }
  function onResize(el, fn) { var last = -1; if (window.ResizeObserver) { new ResizeObserver(function () { var w = el.clientWidth; if (w && w !== last) { last = w; fn(); } }).observe(el); } else window.addEventListener('resize', fn); }
  function placeTip(tip, host, cx, cy) { var hr = host.getBoundingClientRect(), x = cx - hr.left + 14, y = cy - hr.top + 14, tw = tip.offsetWidth, th = tip.offsetHeight; if (x + tw > hr.width - 4) x = cx - hr.left - tw - 14; if (y + th > hr.height) y = cy - hr.top - th - 12; tip.style.transform = 'translate(' + Math.max(0, x) + 'px,' + Math.max(0, y) + 'px)'; }
  function svgX(svg, W, ev) { var r = svg.getBoundingClientRect(); return (ev.clientX - r.left) * (W / r.width); }
  var PILL = { pass: '✓ Pass', watch: '! Watch', flag: '✕ Flag', na: '– N/A' };
  function pill(st, label) { return '<span class="pill ' + st + '">' + (label || PILL[st]) + '</span>'; }
  function istToday() { var d = new Date(Date.now() + 5.5 * 3600e3); return d.toISOString().slice(0, 10); }
  function fmtDate(iso) { var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; var p = iso.split('-'); return +p[2] + ' ' + M[+p[1] - 1] + (p[0] !== String(new Date().getUTCFullYear()) ? " '" + p[0].slice(2) : ''); }
  function timeIST(ms) { return new Date(ms + 5.5 * 3600e3).toISOString().slice(11, 19) + ' IST'; }

  /* indicators */
  function sma(a, n, i) { i = i == null ? a.length - 1 : i; if (i - n + 1 < 0) return null; var s = 0; for (var j = i - n + 1; j <= i; j++) s += a[j]; return s / n; }
  function rsiSeries(c, n) { n = n || 14; var out = c.map(function () { return null; }), g = 0, l = 0, i; if (c.length <= n) return out; for (i = 1; i <= n; i++) { var d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; } g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l); for (i = n + 1; i < c.length; i++) { var dd = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(dd, 0)) / n; l = (l * (n - 1) + Math.max(-dd, 0)) / n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return out; }

  /* Black–Scholes (for the "today" curve only) */
  function ncdf(x) { var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804 * Math.exp(-x * x / 2), p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return x > 0 ? 1 - p : p; }
  var RATE = 0.065;
  function bs(type, S, K, T, v) { if (T <= 0 || !(v > 0)) return Math.max(0, type === 'C' ? S - K : K - S); var sq = v * Math.sqrt(T), d1 = (Math.log(S / K) + (RATE + v * v / 2) * T) / sq, d2 = d1 - sq; return type === 'C' ? S * ncdf(d1) - K * Math.exp(-RATE * T) * ncdf(d2) : K * Math.exp(-RATE * T) * ncdf(-d2) - S * ncdf(-d1); }

  /* ---------------- state ---------------- */
  var S = { eod: null, live: null, quotes: null, opt: null, errors: [] };
  var currentPage = 'home';

  function getJson(url) { return fetch(url, { cache: 'no-store' }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); }); }

  /* ---------------- status bar ---------------- */
  function renderStatus() {
    var m = S.live && S.live.market, dot = $('stDot');
    var open = m && m.open;
    dot.className = 'dot ' + (S.errors.length ? 'err' : open ? 'on' : 'off');
    $('stMarket').textContent = m ? (open ? 'Market open' : 'Market closed') : 'Connecting…';
    var ix = S.live && S.live.indices && S.live.indices['NIFTY 50'];
    var vix = S.live && S.live.indices && S.live.indices['INDIA VIX'];
    $('stIndex').innerHTML = ix
      ? 'NIFTY 50 <b>' + nIN(ix.last, 2) + '</b> <span class="' + (ix.pct >= 0 ? 'pos' : 'neg') + '">' + sPct(ix.pct) + '</span>' + (vix ? ' · India VIX <b>' + f(vix.last, 2) + '</b>' : '') + ' · ' + (m && m.tradeDate ? esc(m.tradeDate) : '')
      : '';
    $('stEod').innerHTML = S.eod ? 'End-of-day history to <b>' + fmtDate(S.eod.asOf) + '</b> · ' + S.eod.dates.length + ' sessions' : 'Loading end-of-day files…';
    $('stErr').textContent = S.errors.length ? S.errors.slice(0, 2).join(' · ') : '';
  }

  /* ---------------- data helpers ---------------- */
  /* Scrolling goes through the motion layer when it is loaded, so Lenis and
     the native scroll never fight; without it this is scrollIntoView. */
  function moScroll(target) {
    if (window.Motion && window.Motion.scrollTo) return window.Motion.scrollTo(target);
    if (target) target.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
  }
  function marketOpen() { var m = S.live && S.live.market; return !!(m && m.open); }
  function stk(sym) { return S.eod && S.eod.stocks[sym]; }
  function qt(sym) { return S.quotes && S.quotes.stocks && S.quotes.stocks[sym]; }
  function lastPrice(sym) { var q = qt(sym); if (q && q.quote && q.quote.ltp) return q.quote.ltp; var s = stk(sym); return s ? s.c[s.c.length - 1] : null; }
  function dayPct(sym) { var q = qt(sym); if (q && q.quote && Number.isFinite(q.quote.pct)) return q.quote.pct; var s = stk(sym); return s ? (s.c[s.c.length - 1] / s.c[s.c.length - 2] - 1) * 100 : null; }
  function seriesLive(sym) {
    var s = stk(sym); if (!s) return null;
    var c = s.c.slice(), d = s.dates.slice(), lp = lastPrice(sym);
    if (lp && d[d.length - 1] !== istToday() && marketOpen()) { c.push(lp); d.push(istToday()); }
    else if (lp && d[d.length - 1] === istToday()) { c[c.length - 1] = lp; }
    return { c: c, d: d };
  }
  function liveRsi(sym) { var s = seriesLive(sym); if (!s) return null; var r = rsiSeries(s.c); return r[r.length - 1]; }
  function sectorPE(sym) { var s = stk(sym); if (!s || !S.live || !S.live.indices) return null; var ix = S.live.indices[s.sectorIndex]; return ix ? ix.pe : null; }
  function symbols() { return S.eod ? Object.keys(S.eod.stocks) : []; }
  function srcLine(el, text, live) { var e = $(el); if (e) { e.textContent = text; e.className = 'src' + (live ? ' live' : ''); } }

  /* ================= screener + scorecard ================= */
  var COLS = [
    { k: 'price', h: 'Price', f: function (s) { var p = lastPrice(s.sym), c = dayPct(s.sym); return p == null ? '—' : '₹' + nIN(p, 2) + ' <span class="' + (c >= 0 ? 'pos' : 'neg') + '">' + sPct(c) + '</span>'; } },
    { k: 'pe', h: 'P/E', f: function (s) { var v = fund(s.sym, 'pe'); return v ? f(v.value, 1) : '—'; } },
    { k: 'sectorPe', h: 'Sector P/E', f: function (s) { var v = sectorPE(s.sym); return v ? f(v, 1) : '—'; } },
    { k: 'roe', h: 'ROE', f: function (s) { var v = fund(s.sym, 'roe'); return v ? f(v.value, 1) + '%' : '—'; } },
    { k: 'eps', h: 'EPS', f: function (s) { var v = fund(s.sym, 'eps'); return v ? '₹' + nIN(v.value, 2) : '—'; } },
    { k: 'mcap', h: 'Market cap', f: function (s) { var q = qt(s.sym); var v = q && q.fundamentals && q.fundamentals.mcapCr; return v ? '₹' + nIN(v / 1e5, 2) + ' L cr' : '—'; } },
    { k: 'beta', h: 'Beta (1y)', f: function (s) { return s.beta ? f(s.beta, 2) : '—'; } },
    { k: 'rsi', h: 'RSI (14)', f: function (s) { var r = liveRsi(s.sym); return r == null ? '—' : String(Math.round(r)); } },
    { k: 'ma200', h: 'vs 200-DMA', f: function (s) { var p = lastPrice(s.sym); if (!p || !s.sma200) return '—'; var d = (p / s.sma200 - 1) * 100; return '<span class="' + (d >= 0 ? 'pos' : 'neg') + '">' + sPct(d, 1) + '</span>'; } },
  ];
  function fund(sym, key) { var q = qt(sym); return q && q.fundamentals ? q.fundamentals[key] : null; }
  var sel = { sym: null, k: 'pe' };

  function renderScreener() {
    if (!S.eod) return;
    var syms = symbols();
    if (!sel.sym) sel.sym = syms[0];
    var h = '<thead><tr><th scope="col">Stock</th><th scope="col" class="l">Sector</th>' + COLS.map(function (c) { return '<th scope="col">' + c.h + '</th>'; }).join('') + '</tr></thead><tbody>';
    syms.forEach(function (sym) {
      var s = stk(sym);
      h += '<tr' + (sym === sel.sym ? ' class="row-sel"' : '') + '><th scope="row"><b>' + sym + '</b><span>' + esc(s.name) + '</span></th><td class="l">' + esc(s.sector) + '</td>';
      COLS.forEach(function (c) {
        var on = sym === sel.sym && c.k === sel.k;
        h += '<td class="cell"><button type="button" class="cellbtn" data-sym="' + sym + '" data-k="' + c.k + '" aria-pressed="' + on + '"><span>' + c.f(s) + '</span></button></td>';
      });
      h += '</tr>';
    });
    $('screener').innerHTML = h + '</tbody>';
    var q = qt(sel.sym);
    srcLine('screenSrc', (marketOpen() ? 'BSE live quotes · ' : 'BSE last close · ') + (q ? timeIST(q.quoteAt) : '') + ' · fundamentals from BSE · history NSE ' + (S.eod ? fmtDate(S.eod.asOf) : ''), marketOpen());
  }

  function lessonFor(sym, k) {
    var s = stk(sym), q = qt(sym), n = esc(s.name), F = { p: 'Fundamental analysis', h: '#learn/p-fund' };
    var price = lastPrice(sym), pe = fund(sym, 'pe'), spe = sectorPE(sym), roe = fund(sym, 'roe'), eps = fund(sym, 'eps');
    var fd = q && q.fundamentals;
    if (k === 'price') {
      var hi = fd && fd.high52, lo = fd && fd.low52;
      var pos = hi && lo ? (price - lo) / (hi - lo) * 100 : null;
      return { title: 'Price · ₹' + nIN(price, 2), body: '₹' + nIN(price, 2) + ' is ' + n + '’s last traded price' + (marketOpen() ? ' right now' : ' at today’s close') + ', ' + sPct(dayPct(sym)) + ' on the day. ' + (pos != null ? 'Over the last year it has ranged from ₹' + nIN(lo, 2) + ' to ₹' + nIN(hi, 2) + ', so it sits ' + Math.round(pos) + '% up that range. ' : '') + 'Price on its own says nothing about value: a ₹3,000 share can be cheaper than a ₹300 one.', pillar: F.p, href: F.h };
    }
    if (k === 'pe') {
      if (!pe) return { title: 'P/E ratio', body: 'No P/E available for ' + n + ' from this feed right now.', pillar: F.p, href: F.h };
      var rel = spe ? pe.value / spe : null;
      return {
        title: 'P/E ratio · ' + f(pe.value, 1), pillar: F.p, href: F.h,
        body: n + ' trades at ' + f(pe.value, 1) + '× its ' + pe.basis + ' earnings: you pay ₹' + f(pe.value, 1) + ' for every ₹1 it earns in a year. ' +
          (spe ? 'The ' + esc(s.sectorIndex) + ' index trades at ' + f(spe, 1) + '×, so it is priced ' + (rel > 1.1 ? 'above' : rel < 0.9 ? 'below' : 'in line with') + ' its sector. ' : '') +
          (eps ? 'That comes from earnings per share of ₹' + nIN(eps.value, 2) + '.' : ''),
      };
    }
    if (k === 'sectorPe') return { title: 'Sector P/E · ' + (spe ? f(spe, 1) : '—'), body: 'NSE publishes a P/E for every index. ' + esc(s.sectorIndex) + ' is at ' + (spe ? f(spe, 1) : '—') + '×, which is the yardstick courses use before calling a single stock cheap or expensive. Sector medians move: a high P/E in a cheap sector is a different signal from a high P/E in an expensive one.', pillar: F.p, href: F.h };
    if (k === 'roe') return { title: 'Return on equity · ' + (roe ? f(roe.value, 1) + '%' : '—'), body: roe ? n + ' earned ₹' + f(roe.value / 100, 2) + ' last year for every ₹1 of shareholders’ money (' + roe.basis + '). Courses treat 15% or more as strong. ' + (roe.value >= 15 ? 'It clears that bar.' : roe.value >= 10 ? 'It falls a little short.' : 'It falls well short: the business isn’t turning its capital into much profit.') : 'No ROE from this feed.', pillar: F.p, href: F.h };
    if (k === 'eps') return { title: 'Earnings per share · ' + (eps ? '₹' + nIN(eps.value, 2) : '—'), body: eps ? 'Each share earned ₹' + nIN(eps.value, 2) + ' over the trailing twelve months (' + eps.basis + '). Multiply by the number of shares and you have the profit; divide the price by it and you have the P/E of ' + (pe ? f(pe.value, 1) : '—') + '.' : 'No EPS from this feed.', pillar: F.p, href: F.h };
    if (k === 'mcap') { var mc = fd && fd.mcapCr; return { title: 'Market capitalisation', body: mc ? 'At ₹' + nIN(mc, 0) + ' crore, the market values the whole company at that much. Market cap, not share price, tells you the size of the business, and it decides whether a stock is large, mid or small cap.' : 'No market cap from this feed.', pillar: F.p, href: F.h }; }
    if (k === 'beta') return { title: 'Beta · ' + (s.beta ? f(s.beta, 2) : '—'), body: s.beta ? 'Measured over the last year of daily moves against the NIFTY 50: when the index moved 1%, ' + n + ' moved about ' + f(s.beta, 2) + '%. ' + (s.beta > 1.2 ? 'More volatile than the market, so the risk lesson says to size positions smaller.' : s.beta < 0.8 ? 'Steadier than the market, which is why defensive investors like stocks like it.' : 'It moves roughly with the market.') + ' Beta is a tendency from past data, not a promise.' : 'Not enough history for a beta.', pillar: 'Risk management', href: '#learn/p-risk' };
    if (k === 'rsi') { var r = Math.round(liveRsi(sym)); return { title: 'RSI (14) · ' + r, body: (r > 70 ? 'RSI above 70 is the classic overbought line: gains have outpaced losses over the last 14 sessions. In a strong uptrend RSI can stay above 70 for weeks, so courses treat it as a warning, not a sell signal.' : r < 30 ? 'RSI below 30 is the classic oversold line: losses have outpaced gains over the last 14 sessions. Falling stocks can stay oversold, so courses wait for a turn before reading it as a bounce.' : 'RSI between 30 and 70 is neutral: neither buyers nor sellers have dominated the last 14 sessions.') + ' Computed from NSE closes' + (marketOpen() ? ', with today’s live price as the last bar.' : '.'), pillar: 'Technical analysis', href: '#learn/p-tech' }; }
    var d = (price / s.sma200 - 1) * 100;
    return { title: 'Price vs 200-day MA · ' + sPct(d, 1), body: 'The 200-day moving average sits at ₹' + nIN(s.sma200, 2) + '. ' + (d >= 0 ? 'Price is above it, which most courses read as a long-term uptrend.' : 'Price is below it, which most courses read as a long-term downtrend.') + ' The 50-day average is at ₹' + nIN(s.sma50, 2) + '; the two crossing is the “golden cross” or “death cross” the scanner looks for.', pillar: 'Technical analysis', href: '#learn/p-tech' };
  }

  function checksFor(sym) {
    var s = stk(sym), pe = fund(sym, 'pe'), spe = sectorPE(sym), roe = fund(sym, 'roe'), q = qt(sym);
    var price = lastPrice(sym), rel = pe && spe ? pe.value / spe : null;
    var npm = q && q.fundamentals ? q.fundamentals.npm : null;
    var out = [];
    out.push({ name: 'Valuation', val: pe ? 'P/E ' + f(pe.value, 1) + ' vs ' + (spe ? f(spe, 1) : '—') : '—', st: rel == null ? 'na' : rel <= 1 ? 'pass' : rel <= 1.3 ? 'watch' : 'flag', note: rel == null ? 'No sector P/E to compare with' : rel <= 1 ? 'At or below its sector index' : rel <= 1.3 ? 'Up to 30% above its sector index' : 'More than 30% above its sector index' });
    out.push({ name: 'Profitability', val: roe ? 'ROE ' + f(roe.value, 1) + '%' : '—', st: !roe ? 'na' : roe.value >= 15 ? 'pass' : roe.value >= 10 ? 'watch' : 'flag', note: !roe ? 'No ROE in this feed' : roe.value >= 15 ? 'Clears the 15% bar most courses use' : roe.value >= 10 ? 'Below the 15% bar' : 'Well below the 15% bar' });
    out.push({ name: 'Margins', val: npm ? 'Net margin ' + f(npm, 1) + '%' : '—', st: !npm ? 'na' : npm >= 15 ? 'pass' : npm >= 8 ? 'watch' : 'flag', note: !npm ? 'No margin in this feed' : npm >= 15 ? 'Keeps a healthy share of revenue as profit' : npm >= 8 ? 'Moderate margins' : 'Thin margins' });
    out.push({ name: 'Trend', val: price && s.sma200 ? sPct((price / s.sma200 - 1) * 100, 1) + ' vs 200-DMA' : '—', st: !price || !s.sma200 ? 'na' : price > s.sma200 ? 'pass' : 'flag', note: !price || !s.sma200 ? '' : price > s.sma200 ? 'Trading above its long-term average' : 'Trading below its long-term average' });
    out.push({ name: 'Volatility', val: s.beta ? 'Beta ' + f(s.beta, 2) : '—', st: !s.beta ? 'na' : s.beta <= 1 ? 'pass' : s.beta <= 1.3 ? 'watch' : 'flag', note: !s.beta ? '' : s.beta <= 1 ? 'Moves less than the index' : s.beta <= 1.3 ? 'Moves a little more than the index' : 'Swings harder than the index: size down' });
    return out;
  }
  function peWhy(sym) {
    var s = stk(sym), pe = fund(sym, 'pe'), spe = sectorPE(sym), roe = fund(sym, 'roe'), q = qt(sym);
    if (!pe || !spe) return 'Without both a company P/E and a sector P/E there is nothing to compare.';
    var rel = pe.value / spe, npm = q && q.fundamentals ? q.fundamentals.npm : null, r = [];
    var price = lastPrice(sym);
    if (rel > 1.1) {
      if (roe && roe.value >= 20) r.push('a high ROE (' + f(roe.value, 0) + '%)');
      if (npm && npm >= 18) r.push('fat net margins (' + f(npm, 0) + '%)');
      if (s.beta && s.beta < 0.9) r.push('steadier-than-market earnings (beta ' + f(s.beta, 2) + ')');
      if (price && s.sma200 && price > s.sma200) r.push('a price above its 200-day average');
      return r.length ? 'Courses would point to ' + list(r) + ' as reasons investors pay up.' : 'None of the usual reasons (high ROE, fat margins, steady earnings) stand out, so the premium looks stretched.';
    }
    if (rel < 0.9) {
      if (roe && roe.value < 15) r.push('an ROE under 15%');
      if (npm && npm < 10) r.push('thin margins (' + f(npm, 0) + '%)');
      if (s.beta && s.beta > 1.1) r.push('above-market volatility (beta ' + f(s.beta, 2) + ')');
      if (price && s.sma200 && price < s.sma200) r.push('a price below its 200-day average');
      return r.length ? 'Courses would point to ' + list(r) + ' as reasons for the discount.' : 'Nothing in these numbers explains the discount, which is what value investors look for. Read the annual report before trusting it.';
    }
    return 'Its P/E is close to its sector index, so the market prices it like an average peer.';
  }
  function renderLesson() {
    if (!S.eod || !sel.sym) return;
    var L = lessonFor(sel.sym, sel.k);
    $('lesson').innerHTML = '<span class="mono-label">30-second lesson · ' + sel.sym + '</span><h3>' + L.title + '</h3><p>' + L.body + '</p><a class="from" href="' + L.href + '">From: ' + L.pillar + ' →</a>';
  }
  function renderScore() {
    if (!S.eod || !sel.sym) return;
    var s = stk(sel.sym), cs = checksFor(sel.sym), app = cs.filter(function (c) { return c.st !== 'na'; });
    var pass = app.filter(function (c) { return c.st === 'pass'; }).length;
    var pe = fund(sel.sym, 'pe'), spe = sectorPE(sel.sym), rel = pe && spe ? pe.value / spe : null;
    var h = '<span class="mono-label">Stock health scorecard</span><h3>' + sel.sym + ' · ' + esc(s.name) + '</h3><p class="score-sum">' + pass + ' of ' + app.length + ' checks pass · ' + esc(s.sector) + '</p><ul class="checks">';
    cs.forEach(function (c) { h += '<li><span class="cn">' + c.name + '</span><span class="cv">' + c.val + '</span>' + pill(c.st) + '<span class="cnote">' + c.note + '</span></li>'; });
    h += '</ul><p class="pe-why"><b>Why is its P/E ' + (rel == null ? 'where it is' : rel > 1.1 ? 'high' : rel < 0.9 ? 'low' : 'average') + '?</b> ' + peWhy(sel.sym) + '</p>';
    h += '<p class="wide-note">Debt-to-equity and profit growth aren’t in these public feeds; they need the company’s annual report or a paid fundamentals provider.</p>';
    $('scorecard').innerHTML = h;
  }
  $('screener').addEventListener('click', function (e) {
    var b = e.target.closest('.cellbtn'); if (!b) return;
    sel = { sym: b.dataset.sym, k: b.dataset.k };
    renderScreener(); renderLesson(); renderScore();
    var nb = $('screener').querySelector('.cellbtn[aria-pressed="true"]'); if (nb) nb.focus();
  });

  /* ================= price + RSI chart ================= */
  var chartSym = null;
  function renderRSIChart() {
    var el = $('rsiChart'), W = el.clientWidth;
    if (!W || !S.eod || !chartSym) return;
    var ser = seriesLive(chartSym), s = stk(chartSym);
    var N = Math.min(120, ser.c.length), off = ser.c.length - N;
    var rsiAll = rsiSeries(ser.c), smaAll = ser.c.map(function (_, i) { return sma(ser.c, 50, i); });
    var vis = ser.c.slice(off), rv = rsiAll.slice(off), smv = smaAll.slice(off), dts = ser.d.slice(off);
    var left = 6, right = 70, top = 12, H1 = Math.round(clamp(W * 0.34, 170, 250)), gap = 30, H2 = 92, bottom = 26, H = top + H1 + gap + H2 + bottom;
    var pw = W - left - right, step = pw / (N - 1), half = step / 2, xs = function (i) { return left + i * step; };
    var all = vis.concat(smv.filter(function (v) { return v != null; }));
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * 0.07; lo -= pad; hi += pad;
    var yP = function (v) { return top + (1 - (v - lo) / (hi - lo)) * H1; }, r0 = top + H1 + gap, yR = function (v) { return r0 + (1 - v / 100) * H2; };
    var yLast = yP(vis[N - 1]);
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + chartSym + ' daily closes with 50-day moving average and RSI">';
    niceTicks(lo, hi, 4).forEach(function (t) { if (t < lo || t > hi) return; var y = yP(t); out += '<line class="c-grid" x1="' + left + '" x2="' + (W - right) + '" y1="' + y + '" y2="' + y + '"/>'; if (Math.abs(y - yLast) > 13) out += '<text x="' + (W - right + 8) + '" y="' + (y + 3) + '">' + nIN(t) + '</text>'; });
    var i = 0;
    while (i < N) {
      var cls = rv[i] > 70 ? 'z-ob' : rv[i] < 30 ? 'z-os' : null;
      if (!cls) { i++; continue; }
      var j = i; while (j + 1 < N && (cls === 'z-ob' ? rv[j + 1] > 70 : rv[j + 1] < 30)) j++;
      var x0 = Math.max(left, xs(i) - half), x1 = Math.min(W - right, xs(j) + half);
      out += '<rect class="' + cls + '" x="' + x0 + '" y="' + top + '" width="' + (x1 - x0) + '" height="' + H1 + '"/><rect class="' + cls + '" x="' + x0 + '" y="' + r0 + '" width="' + (x1 - x0) + '" height="' + H2 + '"/>';
      i = j + 1;
    }
    [70, 30].forEach(function (v) { out += '<line class="c-band" x1="' + left + '" x2="' + (W - right) + '" y1="' + yR(v) + '" y2="' + yR(v) + '"/><text x="' + (W - right + 8) + '" y="' + (yR(v) + 3) + '">' + v + '</text>'; });
    out += '<line class="c-grid" x1="' + left + '" x2="' + (W - right) + '" y1="' + (r0 + H2) + '" y2="' + (r0 + H2) + '"/><text x="' + left + '" y="' + (r0 - 8) + '">RSI (14)</text>';
    function path(arr, yf) { var d = ''; arr.forEach(function (v, k) { if (v == null) return; d += (d ? 'L' : 'M') + xs(k).toFixed(1) + ' ' + yf(v).toFixed(1); }); return d; }
    out += '<path class="c-sma" d="' + path(smv, yP) + '"/><path class="c-close" d="' + path(vis, yP) + '"/><path class="c-rsi" d="' + path(rv, yR) + '"/>';
    var lastOb = -1, lastOs = -1;
    for (i = 0; i < N; i++) {
      var prev = rsiAll[off + i - 1];
      if (rv[i] > 70 && prev <= 70) { out += '<circle class="m-ob" cx="' + xs(i) + '" cy="' + yP(vis[i]) + '" r="4.5"/>'; lastOb = i; }
      if (rv[i] < 30 && prev >= 30) { out += '<circle class="m-os" cx="' + xs(i) + '" cy="' + yP(vis[i]) + '" r="4.5"/>'; lastOs = i; }
    }
    if (lastOb >= 0) out += '<text class="t-strong" x="' + clamp(xs(lastOb), left + 30, W - right - 30) + '" y="' + (yP(vis[lastOb]) - 11) + '" text-anchor="middle">RSI &gt; 70</text>';
    if (lastOs >= 0) out += '<text class="t-strong" x="' + clamp(xs(lastOs), left + 30, W - right - 30) + '" y="' + (yP(vis[lastOs]) + 19) + '" text-anchor="middle">RSI &lt; 30</text>';
    out += '<circle class="c-dot" cx="' + xs(N - 1) + '" cy="' + yLast + '" r="3.5"/><text class="t-strong" x="' + (W - right + 8) + '" y="' + (yLast + 4) + '">₹' + nIN(vis[N - 1], 2) + '</text>';
    out += '<text class="t-strong" x="' + (W - right + 8) + '" y="' + (yR(rv[N - 1]) + 4) + '">' + Math.round(rv[N - 1]) + '</text>';
    var lastLab = -99;
    for (i = 1; i < N; i++) { if (dts[i].slice(5, 7) !== dts[i - 1].slice(5, 7) && xs(i) - lastLab > 44 && xs(i) < W - right - 10) { out += '<text x="' + xs(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtDate(dts[i]).split(' ')[1] + '</text>'; lastLab = xs(i); } }
    out += '<line class="c-cross" id="rsiX" x1="0" x2="0" y1="' + top + '" y2="' + (r0 + H2) + '" visibility="hidden"/><circle class="c-dot" id="rsiD1" r="3.5" visibility="hidden"/><circle class="c-dot" id="rsiD2" r="3.5" visibility="hidden"/>';
    out += '<rect class="hit" x="' + left + '" y="' + top + '" width="' + pw + '" height="' + (r0 + H2 - top) + '"/></svg>';
    var old = el.querySelector('svg'); if (old) old.remove();
    el.insertAdjacentHTML('afterbegin', out);
    var svg = el.querySelector('svg'), hit = svg.querySelector('.hit'), cx = svg.querySelector('#rsiX'), d1 = svg.querySelector('#rsiD1'), d2 = svg.querySelector('#rsiD2'), tip = $('rsiTip');
    function mv(ev) {
      var k = clamp(Math.round((svgX(svg, W, ev) - left) / step), 0, N - 1), x = xs(k);
      cx.setAttribute('x1', x); cx.setAttribute('x2', x); cx.setAttribute('visibility', 'visible');
      d1.setAttribute('cx', x); d1.setAttribute('cy', yP(vis[k])); d1.setAttribute('visibility', 'visible');
      d2.setAttribute('cx', x); d2.setAttribute('cy', yR(rv[k])); d2.setAttribute('visibility', 'visible');
      var r = Math.round(rv[k]);
      tip.innerHTML = '<b>' + fmtDate(dts[k]) + '</b><br>Close ₹' + nIN(vis[k], 2) + (smv[k] ? '<br>50-day MA ₹' + nIN(smv[k], 2) : '') + '<br>RSI ' + r + (r > 70 ? ' · overbought' : r < 30 ? ' · oversold' : '');
      tip.hidden = false; placeTip(tip, el, ev.clientX, ev.clientY);
    }
    hit.addEventListener('pointermove', mv); hit.addEventListener('pointerdown', mv);
    hit.addEventListener('pointerleave', function () { tip.hidden = true;[cx, d1, d2].forEach(function (n) { n.setAttribute('visibility', 'hidden'); }); });
    srcLine('chartSrc', 'NSE closes to ' + fmtDate(s.dates[s.dates.length - 1]) + (marketOpen() ? ' + live price' : ''), marketOpen());
  }
  onResize($('rsiChart'), renderRSIChart);

  /* ================= mood meter ================= */
  var ZONES = [{ max: 25, name: 'Fear', cls: 'g-z1' }, { max: 45, name: 'Cautious', cls: 'g-z2' }, { max: 55, name: 'Neutral', cls: 'g-z3' }, { max: 75, name: 'Optimistic', cls: 'g-z4' }, { max: 100.5, name: 'Euphoric', cls: 'g-z5' }];
  function zoneOf(s) { for (var i = 0; i < ZONES.length; i++) if (s < ZONES[i].max) return ZONES[i]; return ZONES[ZONES.length - 1]; }
  function moodModel(ad, fii, dii, vix) { var b = clamp(50 + 50 * Math.log(ad) / Math.log(3), 0, 100), fl = clamp(50 + 50 * (fii + dii) / 6000, 0, 100), v = clamp((30 - vix) / 20 * 100, 0, 100); return { b: b, f: fl, v: v, score: 0.35 * b + 0.30 * fl + 0.35 * v }; }
  function gaugeSVG(score, big) {
    var cx = 100, cy = 100, r = 80, sw = big ? 16 : 18;
    function pt(s, rr) { var a = Math.PI * (1 - s / 100); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; }
    var out = '<svg viewBox="0 0 200 ' + (big ? 124 : 106) + '" role="img" aria-label="Mood gauge at ' + Math.round(score) + ' of 100">', prev = 0;
    ZONES.forEach(function (z) { var hiZ = Math.min(100, z.max), p1 = pt(prev + 0.9, r), p2 = pt(hiZ - 0.9, r); out += '<path class="' + z.cls + '" d="M' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + '" fill="none" stroke-width="' + sw + '"/>'; prev = hiZ; });
    var n = pt(clamp(score, 0, 100), r - 24);
    out += '<line class="g-needle" x1="' + cx + '" y1="' + cy + '" x2="' + n[0].toFixed(1) + '" y2="' + n[1].toFixed(1) + '"/><circle class="g-hub" cx="' + cx + '" cy="' + cy + '" r="5"/>';
    if (big) out += '<text class="g-lab" x="' + (cx - r) + '" y="' + (cy + 22) + '" text-anchor="middle">Fear</text><text class="g-lab" x="' + (cx + r) + '" y="' + (cy + 22) + '" text-anchor="middle">Euphoria</text>';
    return out + '</svg>';
  }
  var PSY = {
    Fear: ['This is when panic selling is most tempting. Stick to the stops you set before the day began.', '#learn/p-psych', 'Lesson: panic selling'],
    Cautious: ['Size positions down while breadth is weak, and don’t widen stops to avoid being wrong.', '#tools/t-position', 'Lesson: sizing when breadth weakens'],
    Neutral: ['No strong emotion in the market. A good day to follow the plan rather than the headlines.', '#learn/p-psych', 'Lesson: sticking to a trade plan'],
    Optimistic: ['Momentum is with buyers. Check you’re buying setups, not just rising prices.', '#tools/t-scanner', 'Lesson: confirming a breakout'],
    Euphoric: ['FOMO peaks here. Chasing late entries is the classic mistake in euphoric markets.', '#learn/p-psych', 'Lesson: FOMO'],
  };
  function moodText(ad, fii, dii, vix, z, live) {
    var F = nIN(Math.abs(fii)), D = nIN(Math.abs(dii)), p1;
    if (fii < 0 && dii > 0) { var share = dii / Math.abs(fii); p1 = 'Foreign institutions (FIIs) sold ₹' + F + ' crore while domestic institutions (DIIs) bought ₹' + D + ' crore. ' + (share >= 1 ? 'Domestic funds absorbed all of the foreign selling.' : 'Domestic funds absorbed about ' + Math.round(share * 100) + '% of it; retail and other traders bought the remaining ₹' + nIN(Math.abs(fii) - dii) + ' crore.'); }
    else if (fii >= 0 && dii >= 0) p1 = 'Both FIIs (₹' + F + ' crore) and DIIs (₹' + D + ' crore) were net buyers: broad institutional support.';
    else if (fii < 0 && dii < 0) p1 = 'Both FIIs (₹' + F + ' crore) and DIIs (₹' + D + ' crore) were net sellers. When institutions step back together, retail traders are the ones buying.';
    else p1 = 'FIIs bought ₹' + F + ' crore while DIIs sold ₹' + D + ' crore, which can mean domestic funds are booking profits into foreign demand.';
    var p2 = (ad >= 1 ? 'Breadth is positive: ' + f(ad, 2) + ' stocks rose for every one that fell in the NIFTY 500. ' : 'Breadth is weak: only ' + f(ad, 2) + ' stocks rose for every one that fell in the NIFTY 500, so most of the market slipped even if the index held up. ') +
      (vix < 13 ? 'India VIX at ' + f(vix, 1) + ' is low: traders expect calm, and complacency can creep in.' : vix < 20 ? 'India VIX at ' + f(vix, 1) + ' is moderate.' : vix < 28 ? 'India VIX at ' + f(vix, 1) + ' is elevated: option buyers are paying up for protection.' : 'India VIX at ' + f(vix, 1) + ' is high: the market is pricing in big swings.');
    var ps = PSY[z.name];
    return '<p>' + p1 + '</p><p>' + p2 + '</p><p><b>Psychology:</b> ' + ps[0] + ' <a class="lesson-link" href="' + ps[1] + '">' + ps[2] + ' →</a></p>';
  }
  var moodLive = null;
  function liveMood() {
    if (!S.live || !S.live.indices) return null;
    var ix = S.live.indices['NIFTY 500'] || S.live.indices['NIFTY 50'], vixI = S.live.indices['INDIA VIX'], fl = S.live.flows;
    if (!ix || !vixI) return null;
    var ad = ix.declines ? ix.advances / ix.declines : 1;
    return { ad: ad, fii: fl && fl.fii ? fl.fii.net : 0, dii: fl && fl.dii ? fl.dii.net : 0, vix: vixI.last, date: fl && fl.fii ? fl.fii.date : '' };
  }
  function renderMood() {
    if (!moodLive) return;
    var m = moodLive;
    var model = moodModel(m.ad, m.fii, m.dii, m.vix), sc = Math.round(model.score), z = zoneOf(sc);
    $('mADo').textContent = f(m.ad, 2);
    $('mFIIo').innerHTML = '<span class="' + (m.fii >= 0 ? 'pos' : 'neg') + '">' + sInr(m.fii) + ' cr</span>';
    $('mDIIo').innerHTML = '<span class="' + (m.dii >= 0 ? 'pos' : 'neg') + '">' + sInr(m.dii) + ' cr</span>';
    $('mVIXo').textContent = f(m.vix, 2);
    $('moodGauge').innerHTML = gaugeSVG(model.score, true);
    $('moodScore').textContent = sc;
    $('moodZone').textContent = z.name;
    $('moodText').innerHTML = moodText(m.ad, m.fii, m.dii, m.vix, z, true);
    [['cB', model.b], ['cF', model.f], ['cV', model.v]].forEach(function (c) { $(c[0]).style.width = c[1] + '%'; $(c[0] + 'o').textContent = Math.round(c[1]); });
  }

  /* ================= position calculator ================= */
  function fillStockSelects() {
    var syms = symbols();
    [['pStock', null], ['chartStock', null], ['paperStock', null]].forEach(function (pair) {
      var el = $(pair[0]); if (!el) return;
      var keep = el.value;
      el.innerHTML = syms.map(function (s) { return '<option value="' + s + '">' + s + ' · ' + esc(stk(s).name) + '</option>'; }).join('');
      if (keep && syms.indexOf(keep) >= 0) el.value = keep;
    });
  }
  function loadPosStock() {
    var sym = $('pStock').value, s = stk(sym);
    if (!s) return;
    $('pEntry').value = (lastPrice(sym) || s.c[s.c.length - 1]).toFixed(2);
    $('pATR').value = s.atr.toFixed(2);
    srcLine('posSrc', sym + ' · entry ' + (marketOpen() ? 'live BSE price' : 'last close') + ' · ATR from NSE daily data', marketOpen());
  }
  function renderPos() {
    if (!S.eod) return;
    var cap = +$('pCap').value || 0, rp = +$('pRisk').value, entry = +$('pEntry').value || 0, atr = +$('pATR').value || 0, m = +$('pMult').value, rr = +$('pRR').value;
    $('pRisko').textContent = f(rp, 2) + '%'; $('pMulto').textContent = f(m, 1) + ' × ATR'; $('pRRo').textContent = f(rr, 1) + ' R';
    var note = $('pNote'); note.className = 'note';
    if (cap <= 0 || entry <= 0 || atr <= 0) { $('pShares').innerHTML = '—'; $('pKV').innerHTML = ''; $('pLadder').innerHTML = ''; note.textContent = 'Enter your capital, an entry price and the ATR to size the trade.'; return; }
    var budget = cap * rp / 100, rps = m * atr, stop = entry - rps, target = entry + rr * rps;
    if (stop <= 0) { $('pShares').innerHTML = '—'; $('pKV').innerHTML = ''; $('pLadder').innerHTML = ''; note.className = 'note warn'; note.textContent = 'The stop would fall below zero. Use a smaller ATR multiple.'; return; }
    var byRisk = Math.floor(budget / rps), byCap = Math.floor(cap / entry), shares = Math.min(byRisk, byCap), capLimited = byCap < byRisk;
    var value = shares * entry, pct = cap ? value / cap * 100 : 0, loss = shares * rps, gain = shares * rr * rps, sh2 = Math.min(Math.floor(budget / (2 * rps)), byCap);
    $('pShares').innerHTML = nIN(shares) + '<small>shares</small>';
    $('pKV').innerHTML =
      '<dt>Risk budget (' + f(rp, 2) + '% of capital)</dt><dd>' + inr(budget) + '</dd>' +
      '<dt>Stop-loss</dt><dd class="neg">₹' + nIN(stop, 2) + ' (−' + f(rps / entry * 100, 1) + '%)</dd>' +
      '<dt>Target (' + f(rr, 1) + 'R)</dt><dd class="pos">₹' + nIN(target, 2) + ' (+' + f(rr * rps / entry * 100, 1) + '%)</dd>' +
      '<dt>Position value</dt><dd>' + inr(value) + ' (' + f(pct, 1) + '%)</dd>' +
      '<dt>Loss if stopped out</dt><dd class="neg">−' + inr(loss) + '</dd>' +
      '<dt>Gain at target</dt><dd class="pos">+' + inr(gain) + '</dd>';
    var msg = '';
    if (shares === 0) { note.className = 'note warn'; msg = 'Your risk budget of ' + inr(budget) + ' is smaller than the risk on one share (₹' + nIN(rps, 2) + '). Skip this trade or risk more per trade.'; }
    else if (capLimited) msg = 'Your capital, not your risk budget, limits this trade: you can only afford ' + nIN(byCap) + ' shares. ';
    else if (pct > 25) { note.className = 'note warn'; msg = 'This puts ' + f(pct, 0) + '% of your capital in one stock. The portfolio lesson suggests spreading it out. '; }
    if (shares > 0) msg += 'If ATR doubled to ₹' + nIN(atr * 2, 2) + ', the same ' + inr(budget) + ' of risk would buy only ' + nIN(sh2) + ' shares. That’s how live volatility changes your size.';
    note.textContent = msg;
    var lo = stop - 0.35 * rps, hi = target + 0.35 * rps, y = function (v) { return 14 + (1 - (v - lo) / (hi - lo)) * 192; }, ax = 44, x2 = 168;
    var out = '<svg viewBox="0 0 300 220" role="img" aria-label="Trade plan"><line class="l-axis" x1="' + ax + '" x2="' + ax + '" y1="8" y2="212"/>';
    out += '<rect class="l-reward" x="' + ax + '" y="' + y(target) + '" width="' + (x2 - ax) + '" height="' + (y(entry) - y(target)) + '"/>';
    out += '<rect class="l-risk" x="' + ax + '" y="' + y(entry) + '" width="' + (x2 - ax) + '" height="' + (y(stop) - y(entry)) + '"/>';
    [['l-target', target, 'Target', '+' + f(rr, 1) + 'R'], ['l-entry', entry, 'Entry', '0'], ['l-stop', stop, 'Stop', '−1R']].forEach(function (r) {
      out += '<line class="' + r[0] + '" x1="' + ax + '" x2="' + x2 + '" y1="' + y(r[1]) + '" y2="' + y(r[1]) + '"/>';
      out += '<text x="' + (x2 + 8) + '" y="' + (y(r[1]) + 4) + '"><tspan style="fill:var(--ink)">' + r[2] + '</tspan> ₹' + nIN(r[1], 2) + '</text>';
      out += '<text x="' + (ax - 6) + '" y="' + (y(r[1]) + 4) + '" text-anchor="end">' + r[3] + '</text>';
    });
    if (y(entry) - y(target) > 22) out += '<text x="' + ((ax + x2) / 2) + '" y="' + ((y(entry) + y(target)) / 2 + 4) + '" text-anchor="middle">Reward ' + shortInr(gain) + '</text>';
    if (y(stop) - y(entry) > 22) out += '<text x="' + ((ax + x2) / 2) + '" y="' + ((y(entry) + y(stop)) / 2 + 4) + '" text-anchor="middle">Risk ' + shortInr(loss) + '</text>';
    $('pLadder').innerHTML = out + '</svg>';
  }
  ['pCap', 'pRisk', 'pEntry', 'pATR', 'pMult', 'pRR'].forEach(function (id) { $(id).addEventListener('input', renderPos); });
  $('pStock').addEventListener('change', function () { loadPosStock(); renderPos(); });

  /* ================= options ================= */
  var STRATS = {
    lc: { legs: function (a, w, n) { return [{ s: 1, t: 'C', i: a }]; }, view: '<b>Bullish.</b> Buy the right to buy at the strike. The most you can lose is the premium; the upside is open-ended.' },
    lp: { legs: function (a, w) { return [{ s: 1, t: 'P', i: a }]; }, view: '<b>Bearish.</b> Buy the right to sell at the strike. The most you can lose is the premium; profit grows as the index falls.' },
    bcs: { legs: function (a, w) { return [{ s: 1, t: 'C', i: a }, { s: -1, t: 'C', i: a + w }]; }, view: '<b>Moderately bullish.</b> Buy a call and sell a higher one. The sold call cuts your cost but caps your profit.' },
    bps: { legs: function (a, w) { return [{ s: 1, t: 'P', i: a }, { s: -1, t: 'P', i: a - w }]; }, view: '<b>Moderately bearish.</b> Buy a put and sell a lower one. Cheaper than a plain put, with capped profit.' },
    ls: { legs: function (a, w) { return [{ s: 1, t: 'C', i: a }, { s: 1, t: 'P', i: a }]; }, view: '<b>Expecting a big move either way.</b> Buy a call and a put at the same strike. The move has to beat both premiums.' },
    ic: { legs: function (a, w) { return [{ s: 1, t: 'P', i: a - 2 * w }, { s: -1, t: 'P', i: a - w }, { s: -1, t: 'C', i: a + w }, { s: 1, t: 'C', i: a + 2 * w }]; }, view: '<b>Range-bound.</b> Sell a call spread and a put spread around the index. You keep the credit if it stays between the short strikes; the long wings cap the loss.' },
  };
  var OP = null;
  function expiryDays() {
    if (!S.opt || !S.opt.expiry) return 0;
    var M = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    var p = String(S.opt.expiry).split('-');
    var exp = Date.UTC(+p[2], M[p[1]], +p[0], 10, 0);
    return Math.max(0, (exp - (Date.now() + 5.5 * 3600e3 - 5.5 * 3600e3)) / 864e5);
  }
  function computeOptions() {
    if (!S.opt || !S.opt.strikes || !S.opt.strikes.length) { OP = null; $('oKV').innerHTML = '<dt>Option chain unavailable right now.</dt><dd></dd>'; $('oLegs').innerHTML = ''; return; }
    var chain = S.opt.strikes.filter(function (r) { return r.ce && r.pe; });
    var und = S.opt.und, lot = S.opt.lot || 1, lots = +$('oLots').value, w = +$('oWidth').value, st = $('oStrat').value;
    $('oWidtho').textContent = w; $('oLotso').textContent = lots;
    $('oView').innerHTML = STRATS[st].view;
    var atm = 0, best = Infinity;
    chain.forEach(function (r, i) { var d = Math.abs(r.K - und); if (d < best) { best = d; atm = i; } });
    var ivAtm = (chain[atm].ce.iv || chain[atm].pe.iv || 12) / 100;
    var days = expiryDays(), T = days / 365;
    var legs = STRATS[st].legs(atm, w).map(function (l) {
      var row = chain[clamp(l.i, 0, chain.length - 1)];
      var leg = l.t === 'C' ? row.ce : row.pe;
      var iv = (leg.iv || ivAtm * 100) / 100;
      var prem = leg.ltp > 0 ? leg.ltp : bs(l.t, und, row.K, T, iv);
      return { s: l.s, t: l.t, K: row.K, prem: prem, iv: iv, modelled: !(leg.ltp > 0), oi: leg.oi };
    });
    var qty = lot * lots;
    var exp = function (x) { return legs.reduce(function (a, l) { return a + l.s * (Math.max(0, l.t === 'C' ? x - l.K : l.K - x) - l.prem); }, 0) * qty; };
    var now = function (x) { return legs.reduce(function (a, l) { return a + l.s * (bs(l.t, x, l.K, T, l.iv) - l.prem); }, 0) * qty; };
    var net = legs.reduce(function (a, l) { return a + l.s * l.prem; }, 0) * qty;
    var mx = -Infinity, mn = Infinity, bes = [], prev = null;
    for (var i = 0; i <= 3000; i++) { var x = und * 3 * i / 3000, p = exp(x); if (p > mx) mx = p; if (p < mn) mn = p; if (prev && ((prev.p < 0 && p >= 0) || (prev.p >= 0 && p < 0))) bes.push(prev.x + (0 - prev.p) * (x - prev.x) / (p - prev.p)); prev = { x: x, p: p }; }
    var netCalls = legs.reduce(function (a, l) { return a + (l.t === 'C' ? l.s : 0); }, 0);
    OP = { und: und, legs: legs, exp: exp, now: now, qty: qty };
    $('oKV').innerHTML =
      '<dt>' + (net >= 0 ? 'You pay (debit)' : 'You receive (credit)') + '</dt><dd>' + inr(Math.abs(net)) + '</dd>' +
      '<dt>Max profit</dt><dd class="pos">' + (netCalls > 0 ? 'Unlimited' : sInr(mx)) + '</dd>' +
      '<dt>Max loss</dt><dd class="neg">' + (netCalls < 0 ? 'Unlimited' : (mn < 0 ? '−' + inr(-mn) : '₹0')) + '</dd>' +
      '<dt>Breakeven' + (bes.length > 1 ? 's' : '') + '</dt><dd>' + (bes.length ? bes.map(function (b) { return nIN(b); }).join(' / ') : '—') + '</dd>';
    $('oLegs').innerHTML = '<thead><tr><th>Leg</th><th>Strike</th><th>IV</th><th>Premium</th></tr></thead><tbody>' + legs.map(function (l) {
      return '<tr><td>' + (l.s > 0 ? 'Buy' : 'Sell') + ' ' + (l.t === 'C' ? 'CE' : 'PE') + '</td><td>' + nIN(l.K) + '</td><td>' + f(l.iv * 100, 1) + '%</td><td>₹' + nIN(l.prem, 2) + (l.modelled ? '*' : '') + '</td></tr>';
    }).join('') + '</tbody>';
    $('oNote').innerHTML = 'Premiums are traded prices from the NSE chain' + (legs.some(function (l) { return l.modelled; }) ? '; * marks an untraded strike priced with Black–Scholes at its own implied volatility' : '') + '. Position: ' + lots + ' lot' + (lots > 1 ? 's' : '') + ' × ' + lot + ' = ' + nIN(qty) + ' units. ' + f(days, 1) + ' days to expiry.';
    $('oExpiry').textContent = S.opt.expiry + ' (' + f(days, 1) + ' days)';
    $('oLotSize').textContent = lot + ' per lot';
  }
  function renderPayoff() {
    var el = $('payoff'), W = el.clientWidth;
    var old = el.querySelector('svg'); if (old) old.remove();
    if (!W || !OP) return;
    var H = Math.round(clamp(W * 0.5, 220, 320)), L = 58, Rr = 14, T = 22, B = 36, und = OP.und, lo = und * 0.94, hi = und * 1.06, n = 220, xs = [], ye = [], yt = [], i;
    for (i = 0; i <= n; i++) { var x = lo + (hi - lo) * i / n; xs.push(x); ye.push(OP.exp(x)); yt.push(OP.now(x)); }
    var mn = Math.min(0, Math.min.apply(null, ye), Math.min.apply(null, yt)), mx = Math.max(0, Math.max.apply(null, ye), Math.max.apply(null, yt)), pad = (mx - mn) * 0.1 || 1000; mn -= pad; mx += pad;
    var X = function (v) { return L + (v - lo) / (hi - lo) * (W - L - Rr); }, Y = function (v) { return T + (1 - (v - mn) / (mx - mn)) * (H - T - B); }, y0 = Y(0);
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Payoff diagram">';
    out += '<defs><clipPath id="pcu"><rect x="' + L + '" y="' + T + '" width="' + (W - L - Rr) + '" height="' + Math.max(0, y0 - T) + '"/></clipPath><clipPath id="pcd"><rect x="' + L + '" y="' + y0 + '" width="' + (W - L - Rr) + '" height="' + Math.max(0, H - B - y0) + '"/></clipPath></defs>';
    niceTicks(mn, mx, 5).forEach(function (t) { var y = Y(t); out += '<line class="c-grid" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 8) + '" y="' + (y + 3) + '" text-anchor="end">' + (t === 0 ? '₹0' : shortInr(t)) + '</text>'; });
    niceTicks(lo, hi, W < 520 ? 3 : 5).forEach(function (t) { out += '<text x="' + X(t) + '" y="' + (H - 12) + '" text-anchor="middle">' + nIN(t) + '</text>'; });
    var curve = xs.map(function (x, k) { return X(x).toFixed(1) + ' ' + Y(ye[k]).toFixed(1); }).join(' L');
    var area = 'M' + X(xs[0]) + ' ' + y0 + ' L' + curve + ' L' + X(xs[n]) + ' ' + y0 + ' Z';
    out += '<path class="p-up" clip-path="url(#pcu)" d="' + area + '"/><path class="p-dn" clip-path="url(#pcd)" d="' + area + '"/>';
    out += '<line class="p-zero" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y0 + '" y2="' + y0 + '"/>';
    var sx = X(und); out += '<line class="p-spot" x1="' + sx + '" x2="' + sx + '" y1="' + T + '" y2="' + (H - B) + '"/><text class="t-ink" x="' + sx + '" y="' + (T - 8) + '" text-anchor="middle">NIFTY ' + nIN(und) + '</text>';
    out += '<path class="p-t0" d="M' + xs.map(function (x, k) { return X(x).toFixed(1) + ' ' + Y(yt[k]).toFixed(1); }).join(' L') + '"/>';
    out += '<path class="p-exp" d="M' + curve + '"/>';
    for (i = 1; i <= n; i++) {
      if ((ye[i - 1] < 0 && ye[i] >= 0) || (ye[i - 1] >= 0 && ye[i] < 0)) {
        var bx = xs[i - 1] + (0 - ye[i - 1]) * (xs[i] - xs[i - 1]) / (ye[i] - ye[i - 1]), px = X(bx);
        out += '<circle class="p-be" cx="' + px + '" cy="' + y0 + '" r="4"/><text class="t-strong" x="' + clamp(px, L + 30, W - Rr - 30) + '" y="' + (y0 + (ye[i] >= 0 ? 16 : -9)) + '" text-anchor="middle">BE ' + nIN(bx) + '</text>';
      }
    }
    out += '<line class="c-cross" id="payX" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" visibility="hidden"/><circle class="c-dot" id="payD" r="3.5" visibility="hidden"/>';
    out += '<rect class="hit" x="' + L + '" y="' + T + '" width="' + (W - L - Rr) + '" height="' + (H - B - T) + '"/></svg>';
    el.insertAdjacentHTML('afterbegin', out);
    var svg = el.querySelector('svg'), hit = svg.querySelector('.hit'), cx = svg.querySelector('#payX'), d = svg.querySelector('#payD'), tip = $('payTip');
    function mv(ev) {
      var x = clamp(lo + (svgX(svg, W, ev) - L) / (W - L - Rr) * (hi - lo), lo, hi), e = OP.exp(x), nw = OP.now(x), px = X(x);
      cx.setAttribute('x1', px); cx.setAttribute('x2', px); cx.setAttribute('visibility', 'visible');
      d.setAttribute('cx', px); d.setAttribute('cy', Y(e)); d.setAttribute('visibility', 'visible');
      tip.innerHTML = '<b>NIFTY at ' + nIN(x) + '</b><br>At expiry ' + sInr(e) + '<br>If closed today ' + sInr(nw);
      tip.hidden = false; placeTip(tip, el, ev.clientX, ev.clientY);
    }
    hit.addEventListener('pointermove', mv); hit.addEventListener('pointerdown', mv);
    hit.addEventListener('pointerleave', function () { tip.hidden = true; cx.setAttribute('visibility', 'hidden'); d.setAttribute('visibility', 'hidden'); });
  }
  function updateOptions() { computeOptions(); renderPayoff(); renderOI(); }
  ['oStrat', 'oWidth', 'oLots'].forEach(function (id) { $(id).addEventListener('input', updateOptions); });
  onResize($('payoff'), renderPayoff);

  function renderOI() {
    var el = $('oiChart'), W = el.clientWidth;
    var old = el.querySelector('svg'); if (old) old.remove();
    if (!W || !S.opt || !S.opt.strikes) return;
    var und = S.opt.und;
    var rows = S.opt.strikes.filter(function (r) { return r.ce && r.pe && Math.abs(r.K - und) <= und * 0.05 && (r.ce.oi || r.pe.oi); });
    if (rows.length < 3) rows = S.opt.strikes.filter(function (r) { return r.ce && r.pe; }).slice(0, 25);
    var all = S.opt.strikes.filter(function (r) { return r.ce && r.pe; });
    var pain = all.map(function (x) { return all.reduce(function (a, r) { return a + (r.ce.oi || 0) * Math.max(0, x.K - r.K) + (r.pe.oi || 0) * Math.max(0, r.K - x.K); }, 0); });
    var mp = all[pain.indexOf(Math.min.apply(null, pain))];
    var sumC = all.reduce(function (a, r) { return a + (r.ce.oi || 0); }, 0), sumP = all.reduce(function (a, r) { return a + (r.pe.oi || 0); }, 0);
    var kc = all.reduce(function (a, r) { return (r.ce.oi || 0) > (a.ce.oi || 0) ? r : a; }), kp = all.reduce(function (a, r) { return (r.pe.oi || 0) > (a.pe.oi || 0) ? r : a; });
    var H = 220, L = 44, Rr = 8, T = 26, B = 30, n = rows.length, band = (W - L - Rr) / n, bw = clamp(band * 0.33, 3, 14);
    var maxOi = Math.max.apply(null, rows.map(function (r) { return Math.max(r.ce.oi || 0, r.pe.oi || 0); })) || 1;
    var ticks = niceTicks(0, maxOi / 1000, 4), ymax = Math.max.apply(null, ticks) * 1000;
    var Y = function (v) { return T + (1 - v / ymax) * (H - T - B); }, bx = function (i) { return L + band * (i + 0.5); };
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Open interest by strike">';
    ticks.forEach(function (t) { var y = Y(t * 1000); out += '<line class="c-grid" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + nIN(t) + 'k</text>'; });
    var every = Math.max(1, Math.ceil(52 / band));
    rows.forEach(function (r, i) {
      var c = bx(i);
      out += '<rect class="oi-c" x="' + (c - bw - 1) + '" y="' + Y(r.ce.oi || 0) + '" width="' + bw + '" height="' + (Y(0) - Y(r.ce.oi || 0)) + '" rx="1.5"/>';
      out += '<rect class="oi-p" x="' + (c + 1) + '" y="' + Y(r.pe.oi || 0) + '" width="' + bw + '" height="' + (Y(0) - Y(r.pe.oi || 0)) + '" rx="1.5"/>';
      if (i % every === 0) out += '<text x="' + c + '" y="' + (H - 10) + '" text-anchor="middle">' + nIN(r.K) + '</text>';
    });
    var mpi = rows.map(function (r) { return r.K; }).indexOf(mp.K);
    if (mpi >= 0) out += '<line class="oi-mp" x1="' + bx(mpi) + '" x2="' + bx(mpi) + '" y1="' + (T - 4) + '" y2="' + Y(0) + '"/><text class="t-strong" x="' + clamp(bx(mpi), L + 40, W - Rr - 40) + '" y="' + (T - 10) + '" text-anchor="middle">Max pain ' + nIN(mp.K) + '</text>';
    out += '<line class="c-grid" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/><text x="' + L + '" y="10">Open interest (contracts)</text>';
    out += '<rect class="hit" x="' + L + '" y="' + T + '" width="' + (W - L - Rr) + '" height="' + (H - T - B) + '"/></svg>';
    el.insertAdjacentHTML('afterbegin', out);
    var svg = el.querySelector('svg'), hit = svg.querySelector('.hit'), tip = $('oiTip');
    function mv(ev) { var i = clamp(Math.floor((svgX(svg, W, ev) - L) / band), 0, n - 1), r = rows[i]; tip.innerHTML = '<b>Strike ' + nIN(r.K) + '</b><br>Call OI ' + nIN(r.ce.oi || 0) + (r.ce.chgOi ? ' (' + sNum(r.ce.chgOi) + ')' : '') + '<br>Put OI ' + nIN(r.pe.oi || 0) + (r.pe.chgOi ? ' (' + sNum(r.pe.chgOi) + ')' : '') + '<br>CE ₹' + nIN(r.ce.ltp || 0, 2) + ' · PE ₹' + nIN(r.pe.ltp || 0, 2); tip.hidden = false; placeTip(tip, el, ev.clientX, ev.clientY); }
    hit.addEventListener('pointermove', mv); hit.addEventListener('pointerdown', mv);
    hit.addEventListener('pointerleave', function () { tip.hidden = true; });
    $('oiRead').innerHTML = 'Max pain is <b>' + nIN(mp.K) + '</b>: if the index expired there, option buyers as a group would lose the most. The put-call ratio on open interest is <b>' + f(sumP / (sumC || 1), 2) + '</b>. The biggest call OI sits at <b>' + nIN(kc.K) + '</b> and the biggest put OI at <b>' + nIN(kp.K) + '</b>; many courses read those as resistance and support. Treat all three as context, not a forecast.';
  }
  onResize($('oiChart'), renderOI);

  /* ================= scanner ================= */
  var scanFilter = 'all';
  function sparkSVG(spark) {
    var mn = Math.min.apply(null, spark), mx = Math.max.apply(null, spark), y = function (v) { return 31 - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * 28; };
    return '<svg class="spark" viewBox="0 0 120 34" preserveAspectRatio="none" aria-hidden="true"><polyline class="s-line" points="' + spark.map(function (v, i) { return (i / (spark.length - 1) * 120).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ') + '"/></svg>';
  }
  var REGIME_HINT = { ma: 'Confirm with volume: moving-average crosses fail more often when breadth is thin.', pattern: 'Wait for a close beyond the level, and check the volume column.', rsi: 'In a trend, RSI can stay extreme for weeks. Treat it as a warning, not a signal.' };
  function renderScanner() {
    if (!S.eod) return;
    var rows = S.eod.scan.filter(function (r) { return scanFilter === 'all' || r.group === scanFilter; }).slice(0, 25);
    var h = '<thead><tr><th scope="col">Stock</th><th scope="col" class="l">Signal</th><th scope="col" class="l">Last 60 sessions</th><th scope="col">Close</th><th scope="col">Volume vs 20-day</th><th scope="col" class="l">Learn it</th><th scope="col" class="l">Regime check</th></tr></thead><tbody>';
    if (!rows.length) h += '<tr><td class="l" colspan="7" style="color:var(--muted)">No stock in the NIFTY 500 triggered this signal on ' + fmtDate(S.eod.asOf) + '.</td></tr>';
    rows.forEach(function (r) {
      h += '<tr><th scope="row"><b>' + r.sym + '</b><span>' + esc(r.name) + '</span></th><td class="sig">' + esc(r.sig) + '</td><td class="l">' + sparkSVG(r.spark) + '</td><td>₹' + nIN(r.close, 2) + ' <span class="' + (r.chg >= 0 ? 'pos' : 'neg') + '">' + sPct(r.chg, 1) + '</span></td><td class="vol">' + (r.volRatio ? f(r.volRatio, 1) + '×' : '—') + '</td><td class="l"><a href="#learn/p-tech">' + (r.group === 'rsi' ? 'RSI' : r.group === 'ma' ? 'Moving averages' : 'Chart patterns') + ' →</a></td><td class="l">' + REGIME_HINT[r.group] + '</td></tr>';
    });
    $('scanner').innerHTML = h + '</tbody>';
    srcLine('scanSrc', 'NSE end-of-day ' + fmtDate(S.eod.asOf) + ' · ' + S.eod.scanUniverse + ' stocks scanned · ' + S.eod.scan.length + ' hits', false);
  }
  document.querySelectorAll('#t-scanner .chipbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      scanFilter = b.dataset.f;
      document.querySelectorAll('#t-scanner .chipbtn').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      renderScanner();
    });
  });

  /* ================= paper trading ================= */
  var LS = 'sthiti.paper.v1';
  var PP = { cash: 1000000, pos: null, log: [], hist: [] };
  try { var saved = JSON.parse(localStorage.getItem(LS) || 'null'); if (saved && saved.log) PP = Object.assign(PP, saved, { hist: [] }); } catch (_) { }
  function savePaper() { try { localStorage.setItem(LS, JSON.stringify({ cash: PP.cash, pos: PP.pos, log: PP.log })); } catch (_) { } }
  function paperSym() { return $('paperStock').value; }
  function renderPaper() {
    if (!S.eod) return;
    var sym = paperSym(), p = lastPrice(sym);
    if (!p) return;
    var q = qt(sym), pct = dayPct(sym);
    $('ppPrice').textContent = '₹' + nIN(p, 2);
    var c = $('ppChg'); c.textContent = sPct(pct) + (marketOpen() ? ' today' : ' at the close');
    c.className = pct >= 0 ? 'pos' : 'neg';
    var last = PP.hist[PP.hist.length - 1];
    if (!last || last[0] !== sym || last[1] !== p) PP.hist.push([sym, p]);
    if (PP.hist.length > 80) PP.hist.shift();
    var ticks = PP.hist.filter(function (x) { return x[0] === sym; }).map(function (x) { return x[1]; });
    var h = stk(sym).c.slice(-60).concat(ticks.slice(1));   // 60 sessions, then this session's ticks
    var mn = Math.min.apply(null, h), mx = Math.max.apply(null, h);
    if (PP.pos && PP.pos.sym === sym) { mn = Math.min(mn, PP.pos.avg); mx = Math.max(mx, PP.pos.avg); }
    var pad = (mx - mn) * 0.1 || 1, y = function (v) { return 68 - (v - (mn - pad)) / ((mx + pad) - (mn - pad)) * 64; };
    var out = '<polyline class="s-line" points="' + h.map(function (v, i) { return (i / Math.max(1, h.length - 1) * 300).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ') + '"/>';
    if (PP.pos && PP.pos.sym === sym) out += '<line class="s-avg" x1="0" x2="300" y1="' + y(PP.pos.avg) + '" y2="' + y(PP.pos.avg) + '"/>';
    $('ppSpark').innerHTML = out;
    var pos = PP.pos && PP.pos.sym === sym ? PP.pos : null;
    $('ppPos').textContent = pos ? nIN(pos.qty) + ' @ ₹' + nIN(pos.avg, 2) : (PP.pos ? 'in ' + PP.pos.sym : '0 shares');
    var u = pos ? (p - pos.avg) * pos.qty : 0, ue = $('ppU');
    ue.textContent = sInr(u, 2); ue.className = u > 0 ? 'pos' : u < 0 ? 'neg' : '';
    $('ppCash').textContent = inr(PP.cash, 0);
    var realised = PP.log.reduce(function (a, t) { return a + t.pnl; }, 0), re = $('ppR');
    re.textContent = sInr(realised, 2); re.className = realised > 0 ? 'pos' : realised < 0 ? 'neg' : '';
    srcLine('paperSrc', (marketOpen() ? 'BSE live · ' + (q ? timeIST(q.quoteAt) : '') : 'Market closed · fills at the last traded price'), marketOpen());
  }
  function renderLog() {
    var rows = PP.log.slice(0, 10);
    $('ppLog').innerHTML = rows.length
      ? '<thead><tr><th scope="col" class="l">Stock</th><th scope="col">Qty</th><th scope="col">Entry</th><th scope="col">Exit</th><th scope="col">Held</th><th scope="col">P&amp;L</th></tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td class="l">' + r.sym + '</td><td>' + r.qty + '</td><td>₹' + nIN(r.entry, 2) + '</td><td>₹' + nIN(r.exit, 2) + '</td><td>' + (r.mins < 60 ? Math.max(1, Math.round(r.mins)) + 'm' : (r.mins / 60).toFixed(1) + 'h') + '</td><td class="' + (r.pnl >= 0 ? 'pos' : 'neg') + '">' + sInr(r.pnl, 0) + '</td></tr>';
      }).join('') + '</tbody>'
      : '<tbody><tr><td class="l" style="color:var(--muted)">No closed trades yet. Buy, wait, then sell.</td></tr></tbody>';
  }
  function renderDiag() {
    var T = PP.log.slice().reverse();
    var wins = T.filter(function (t) { return t.pnl > 0; }), losses = T.filter(function (t) { return t.pnl < 0; });
    var net = T.reduce(function (a, t) { return a + t.pnl; }, 0);
    $('dgSum').innerHTML = '<span>Trades <b>' + T.length + '</b></span>' + (T.length ? '<span>Win rate <b>' + Math.round(wins.length / T.length * 100) + '%</b></span><span>Net P&amp;L <b class="' + (net >= 0 ? 'pos' : 'neg') + '">' + sInr(net, 0) + '</b></span>' : '');
    if (T.length < 3 || !wins.length || !losses.length) {
      $('dgList').innerHTML = '<li><p>Diagnostics read your own trade log — nothing is pre-filled. Close at least three trades, including one winner and one loser, and the habits show up here: how long you hold losers against winners, whether your average win covers your average loss, and whether you size up after a loss.</p><p class="wide-note">You have ' + T.length + ' closed trade' + (T.length === 1 ? '' : 's') + ' (' + wins.length + ' winning, ' + losses.length + ' losing).</p></li>';
      return;
    }
    var avgW = mean(wins.map(function (t) { return t.pnl; })), avgL = mean(losses.map(function (t) { return -t.pnl; }));
    var holdW = mean(wins.map(function (t) { return t.mins; })), holdL = mean(losses.map(function (t) { return t.mins; }));
    var after = [], other = [];
    T.forEach(function (t, i) { (i > 0 && T[i - 1].pnl < 0 ? after : other).push(t.qty * t.entry); });
    var hr = holdW ? holdL / holdW : 0, pr = avgL ? avgW / avgL : 0, rv = mean(other) ? mean(after) / mean(other) : 0;
    var fmtMins = function (m) { return m < 60 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' hr'; };
    var items = [
      { t: 'Holding losers too long', st: hr > 1.5 ? 'flag' : hr > 1.2 ? 'watch' : 'pass', p: 'You held losing trades for ' + fmtMins(holdL) + ' on average and winners for ' + fmtMins(holdW) + ' (' + f(hr, 1) + '×). ' + (hr > 1.2 ? 'Waiting for a loser to come back while banking winners quickly is the disposition effect.' : 'Losers aren’t lingering much longer than winners.'), href: '#learn/p-psych', m: 'Module: loss aversion and exit rules' },
      { t: 'Cutting profits early', st: pr < 0.8 ? 'flag' : pr < 1.2 ? 'watch' : 'pass', p: 'Your average win is ' + inr(avgW) + ' and your average loss ' + inr(avgL) + ', a payoff ratio of ' + f(pr, 2) + '. ' + (pr < 1 ? 'Each loss takes back more than a win gives.' : 'Winners are paying for losers.'), href: '#tools/t-position', m: 'Module: risk-to-reward and trailing stops' },
      { t: 'Sizing up after a loss', st: rv > 1.4 ? 'flag' : rv > 1.15 ? 'watch' : 'pass', p: after.length ? 'After a loss, your next position averaged ' + inr(mean(after)) + ' against ' + inr(mean(other)) + ' otherwise (' + f(rv, 1) + '×). ' + (rv > 1.15 ? 'Betting bigger to win it back is revenge trading.' : 'Your size stays steady after losses.') : 'No trade yet followed a loss.', href: '#learn/p-psych', m: 'Module: sticking to a trade plan' },
    ];
    var LBL = { pass: '✓ OK', watch: '! Watch', flag: '✕ Fix' };
    $('dgList').innerHTML = items.map(function (it) { return '<li><div class="diag-top"><b>' + it.t + '</b>' + pill(it.st, LBL[it.st]) + '</div><p>' + it.p + '</p><a href="' + it.href + '">' + it.m + ' →</a></li>'; }).join('');
  }
  function msg(t) { $('ppMsg').textContent = t; }
  $('ppBuy').addEventListener('click', function () {
    var sym = paperSym(), p = lastPrice(sym), q = Math.floor(+$('ppQty').value || 0);
    if (!p) return;
    if (q < 1) return msg('Enter a quantity of 1 or more.');
    if (PP.pos && PP.pos.sym !== sym) return msg('Close your ' + PP.pos.sym + ' position first: this demo holds one stock at a time.');
    var cost = q * p;
    if (cost > PP.cash) return msg('Not enough virtual cash for ' + nIN(q) + ' shares (' + inr(cost) + ').');
    if (!PP.pos) PP.pos = { sym: sym, qty: 0, avg: 0, at: Date.now() };
    PP.pos.avg = (PP.pos.avg * PP.pos.qty + cost) / (PP.pos.qty + q);
    PP.pos.qty += q; PP.cash -= cost;
    msg('Bought ' + nIN(q) + ' ' + sym + ' at ₹' + nIN(p, 2) + '.');
    savePaper(); renderPaper();
  });
  $('ppSell').addEventListener('click', function () {
    var sym = paperSym(), p = lastPrice(sym);
    if (!PP.pos || PP.pos.sym !== sym || PP.pos.qty === 0) return msg('You have no ' + sym + ' shares to sell. This demo is long-only.');
    var q = Math.min(Math.floor(+$('ppQty').value || 0), PP.pos.qty);
    if (q < 1) return msg('Enter a quantity of 1 or more.');
    var pnl = (p - PP.pos.avg) * q;
    PP.cash += q * p;
    PP.log.unshift({ sym: sym, qty: q, entry: PP.pos.avg, exit: p, pnl: pnl, mins: (Date.now() - PP.pos.at) / 60000, at: Date.now() });
    PP.pos.qty -= q;
    if (PP.pos.qty === 0) PP.pos = null;
    msg('Sold ' + nIN(q) + ' ' + sym + ' at ₹' + nIN(p, 2) + ' for ' + sInr(pnl, 2) + '. Diagnostics updated.');
    savePaper(); renderPaper(); renderLog(); renderDiag();
  });
  $('ppClear').addEventListener('click', function () {
    PP = { cash: 1000000, pos: null, log: [], hist: [] };
    savePaper(); renderPaper(); renderLog(); renderDiag(); msg('Log cleared.');
  });
  $('paperStock').addEventListener('change', function () { renderPaper(); });

  /* ================= regime engine ================= */
  var EG = null, LIVE_P = null;
  function logRet(a) { var r = []; for (var i = 1; i < a.length; i++) r.push(Math.log(a[i] / a[i - 1])); return r; }
  function corrDist(R, end, win) {
    var n = R.length, m = [], i, j, k;
    var seg = R.map(function (r) { return r.slice(end - win + 1, end + 1); });
    var mu = seg.map(function (s) { return mean(s); });
    var sd = seg.map(function (s, a) { return Math.sqrt(mean(s.map(function (v) { return (v - mu[a]) * (v - mu[a]); }))); });
    var D = [], rhoSum = 0, cnt = 0;
    for (i = 0; i < n; i++) { D.push(new Array(n).fill(0)); }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var c = 0;
      for (k = 0; k < win; k++) c += (seg[i][k] - mu[i]) * (seg[j][k] - mu[j]);
      c = c / win / ((sd[i] * sd[j]) || 1e-12);
      c = clamp(c, -1, 1);
      D[i][j] = D[j][i] = Math.sqrt(Math.max(0, 2 * (1 - c)));
      rhoSum += c; cnt++;
    }
    return { D: D, rho: rhoSum / cnt };
  }
  // classical MDS to 2-D
  function mds(D) {
    var n = D.length, B = [], i, j;
    var d2 = D.map(function (r) { return r.map(function (v) { return v * v; }); });
    var rowM = d2.map(mean), all = mean(rowM);
    for (i = 0; i < n; i++) { B.push([]); for (j = 0; j < n; j++) B[i].push(-0.5 * (d2[i][j] - rowM[i] - rowM[j] + all)); }
    function power(M, exclude) {
      var v = new Array(n).fill(0).map(function (_, i2) { return Math.sin(i2 * 2.399 + 1); }), it, k2, s;
      for (it = 0; it < 120; it++) {
        var w = new Array(n).fill(0);
        for (k2 = 0; k2 < n; k2++) for (var l = 0; l < n; l++) w[k2] += M[k2][l] * v[l];
        if (exclude) { var dot = 0; for (k2 = 0; k2 < n; k2++) dot += w[k2] * exclude.vec[k2]; for (k2 = 0; k2 < n; k2++) w[k2] -= dot * exclude.vec[k2]; }
        s = Math.sqrt(w.reduce(function (a, b) { return a + b * b; }, 0)) || 1;
        v = w.map(function (x) { return x / s; });
      }
      var lam = 0; for (k2 = 0; k2 < n; k2++) { var row = 0; for (var l2 = 0; l2 < n; l2++) row += M[k2][l2] * v[l2]; lam += row * v[k2]; }
      return { vec: v, lam: Math.max(0, lam) };
    }
    var e1 = power(B, null), e2 = power(B, e1);
    return e1.vec.map(function (v, i2) { return [v * Math.sqrt(e1.lam), e2.vec[i2] * Math.sqrt(e2.lam)]; });
  }
  function symdiff(a, b) { var o = [], i = 0, j = 0; while (i < a.length && j < b.length) { if (a[i] < b[j]) o.push(a[i++]); else if (a[i] > b[j]) o.push(b[j++]); else { i++; j++; } } while (i < a.length) o.push(a[i++]); while (j < b.length) o.push(b[j++]); return o; }
  function persistence(D) {
    var n = D.length, E = [], i, j, k;
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) E.push({ i: i, j: j, d: D[i][j] });
    E.sort(function (a, b) { return a.d - b.d; });
    var eid = new Int32Array(n * n);
    E.forEach(function (e, x) { eid[e.i * n + e.j] = x; eid[e.j * n + e.i] = x; });
    var par = []; for (i = 0; i < n; i++) par.push(i);
    function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    var h0 = [];
    for (k = 0; k < E.length; k++) { var a = find(E[k].i), b = find(E[k].j); if (a !== b) { par[a] = b; h0.push({ dim: 0, b: 0, d: E[k].d, edge: k }); } }
    h0.push({ dim: 0, b: 0, d: Infinity });
    var T = [];
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) for (k = j + 1; k < n; k++) {
      var col = [eid[i * n + j], eid[i * n + k], eid[j * n + k]].sort(function (x, y) { return x - y; });
      T.push({ col: col, v: [i, j, k] });
    }
    T.sort(function (a, b) { return a.col[2] - b.col[2] || a.col[1] - b.col[1] || a.col[0] - b.col[0]; });
    var pivot = new Int32Array(E.length).fill(-1), R = [], h1 = [];
    T.forEach(function (t) {
      var c = t.col, death = E[t.col[2]].d;
      while (c.length) { var p = pivot[c[c.length - 1]]; if (p < 0) break; c = symdiff(c, R[p]); }
      if (c.length) { var low = c[c.length - 1]; pivot[low] = R.length; R.push(c); var birth = E[low].d; if (death - birth > 1e-9) h1.push({ dim: 1, b: birth, d: death, cycle: c }); }
    });
    return { E: E, T: T, h0: h0, h1: h1 };
  }

  var fig = { win: 60, idx: 0, eps: 0, ph: null, pts: null, D: null, rho: 0, hover: null, colors: {}, cxS: { w: 0, h: 0 }, bcS: { w: 0, h: 0 }, rows: [], pitch: 8, h0Rows: [], h1Rows: [], main: null, maxD: 2, anim: null };
  function buildEngine() { buildEngineFrom(S.eod.dates, S.eod.sectors, 'Last two years · NSE sector indices', true); }
  function buildEngineFrom(edates, esectors, label, isLive, winOverride) {
    if (!esectors || !esectors.length) return;
    var R = esectors.map(function (s) { return logRet(s.c); });
    var win = winOverride || 60, first = win - 1, series = [];
    for (var e = first; e < R[0].length; e++) series.push({ end: e, date: edates[e + 1], rho: corrDist(R, e, win).rho });
    var sorted = series.map(function (x) { return x.rho; }).slice().sort(function (a, b) { return a - b; });
    var p33 = sorted[Math.floor(sorted.length * 0.33)], p67 = sorted[Math.floor(sorted.length * 0.67)];
    if (isLive) LIVE_P = { p33: p33, p67: p67 };
    var useP = isLive || !LIVE_P ? { p33: p33, p67: p67 } : LIVE_P;
    EG = { R: R, win: win, series: series, p33: useP.p33, p67: useP.p67, ownP33: p33, ownP67: p67, live: !!isLive, label: label,
      codes: esectors.map(function (s) { return s.code; }), names: esectors.map(function (s) { return s.name; }) };
    srcLine('figSrc', label + ' · ' + esectors.length + ' indices', !!isLive);
    $('win').max = series.length - 1; $('win').value = series.length - 1;
    $('winFirst').textContent = fmtDate(series[0].date); $('winLast').textContent = fmtDate(series[series.length - 1].date);
    $('egSectors').textContent = EG.codes.length;
    if (S.eod) { $('hsSectors').textContent = EG.codes.length; $('hsDays').textContent = S.eod.dates.length; }
    selectWindow(series.length - 1, true);
    renderTimeline();
  }
  function regimeOf(rho) { return rho < EG.p33 ? 'calm' : rho < EG.p67 ? 'trans' : 'stress'; }
  var REG = {
    calm: { name: 'Calm', surf: 'fundamentals and chart patterns, as taught', href: '#tools/t-screen', tool: 'Stock health scorecard', note: 'Sectors are moving apart: stock-specific work pays off.' },
    trans: { name: 'Transitional', surf: 'tighter stops and a breadth check before any breakout', href: '#tools/t-position', tool: 'Position calculator', note: 'Correlations are middling and drifting: confirm breakouts.' },
    stress: { name: 'Stress', surf: 'smaller positions, option hedges and the panic-selling lesson', href: '#tools/t-options', tool: 'Option simulator', note: 'Sectors are moving as one: diversification is not helping today.' },
  };
  function selectWindow(i, resetEps) {
    if (!EG) return;
    fig.idx = clamp(i, 0, EG.series.length - 1);
    var s = EG.series[fig.idx], cd = corrDist(EG.R, s.end, EG.win);
    fig.D = cd.D; fig.rho = cd.rho;
    fig.pts = mds(cd.D);
    fig.ph = persistence(cd.D);
    fig.maxD = Math.max.apply(null, fig.ph.E.map(function (e) { return e.d; }));
    fig.h0Rows = fig.ph.h0.slice().sort(function (a, b) { return b.d - a.d; });
    fig.h1Rows = fig.ph.h1.filter(function (b) { return b.d - b.b > 0.02; }).sort(function (a, b) { return (b.d - b.b) - (a.d - a.b); }).slice(0, 6);
    fig.main = fig.h1Rows.length ? fig.h1Rows[0] : null;
    $('winOut').textContent = fmtDate(s.date);
    $('win').value = fig.idx;
    var L1 = fig.ph.h1.reduce(function (a, b) { return a + (b.d - b.b) * (b.d - b.b) / 4; }, 0);
    $('l1').textContent = L1.toFixed(3);
    $('mrho').textContent = f(fig.rho, 2);
    var key = regimeOf(fig.rho), R = REG[key];
    var band = key === 'calm' ? 'lowest' : key === 'stress' ? 'highest' : 'middle';
    $('figRegime').innerHTML = '<strong>' + R.name + '</strong> — mean sector correlation ' + f(fig.rho, 2) + ', in the ' + band + ' third of ' +
      (EG.live ? 'the last two years' : 'the last two years, so this window is judged against today\u2019s market') + '. Sthiti would surface ' + R.surf + '. <a href="' + R.href + '">' + R.tool + ' →</a>';
    document.querySelectorAll('.regime[data-reg]').forEach(function (n) { n.classList.toggle('now', n.dataset.reg === key); });
    if (resetEps) {
      var e0 = fig.main ? fig.main.b + (fig.main.d - fig.main.b) * 0.45 : fig.maxD * 0.55;
      $('eps').max = Math.ceil(fig.maxD * 100); $('eps').value = Math.round(e0 * 100); fig.eps = e0;
    }
    $('eps').max = Math.ceil(fig.maxD * 100);
    renderBarsTable();
    updateEps();
    if (S.eod && !fig.silent) { renderAttribution(); renderBifiltration(); }
    if (fig.idx === EG.series.length - 1 && EG.live) { updateHomeRegime(key, fig.rho); updateWeather(key, fig.rho); }
  }
  function cycleSectors(bar) {
    var vs = {}; bar.cycle.forEach(function (ei) { vs[fig.ph.E[ei].i] = 1; vs[fig.ph.E[ei].j] = 1; });
    var ids = Object.keys(vs).map(Number), cx = mean(ids.map(function (i) { return fig.pts[i][0]; })), cy = mean(ids.map(function (i) { return fig.pts[i][1]; }));
    ids.sort(function (a, b) { return Math.atan2(fig.pts[b][1] - cy, fig.pts[b][0] - cx) - Math.atan2(fig.pts[a][1] - cy, fig.pts[a][0] - cx); });
    return ids.map(function (i) { return EG.codes[i]; });
  }
  function updateEps() {
    if (!fig.ph) return;
    fig.eps = $('eps').value / 100;
    $('epsOut').textContent = f(fig.eps, 2);
    var rho = 1 - fig.eps * fig.eps / 2;
    $('rhoOut').textContent = 'links sectors with ρ ≥ ' + (rho < 0 ? '−' : '') + Math.abs(rho).toFixed(2);
    $('b0').textContent = fig.h0Rows.filter(function (b) { return b.d > fig.eps; }).length;
    $('b1').textContent = fig.h1Rows.filter(function (b) { return b.b <= fig.eps && fig.eps < b.d; }).length;
    var at = $('attrib');
    if (!fig.main) at.textContent = 'No loop in this window: the correlation structure has no hole at any radius.';
    else {
      var secs = cycleSectors(fig.main), outside = EG.codes.filter(function (c) { return secs.indexOf(c) < 0; });
      if (fig.eps < fig.main.b) at.innerHTML = 'The widest loop opens at ε ' + f(fig.main.b, 2) + '. Drag ε right to see it.';
      else if (fig.eps >= fig.main.d) at.innerHTML = 'The widest loop, through ' + secs.join(' → ') + ', filled in at ε ' + f(fig.main.d, 2) + '.';
      else at.innerHTML = 'Loop alive at this ε runs through <strong>' + secs.join(' → ') + '</strong>' + (outside.length ? '. ' + outside.join(', ') + ' sit outside it.' : '.');
    }
    drawFig();
  }
  function renderBarsTable() {
    var h = '<thead><tr><th>Bar</th><th>Born ε</th><th>Dies ε</th><th>Persistence</th><th>Detail</th></tr></thead><tbody>';
    fig.h1Rows.forEach(function (b) { h += '<tr><td>H₁ loop</td><td>' + f(b.b, 2) + '</td><td>' + f(b.d, 2) + '</td><td>' + f(b.d - b.b, 2) + '</td><td>' + cycleSectors(b).join(', ') + '</td></tr>'; });
    fig.h0Rows.forEach(function (b) {
      if (b.d !== Infinity && b.d < 0.25) return;
      var det = b.d === Infinity ? 'whole market' : EG.codes[fig.ph.E[b.edge].i] + '–' + EG.codes[fig.ph.E[b.edge].j] + ' link';
      h += '<tr><td>H₀ component</td><td>0.00</td><td>' + (b.d === Infinity ? '∞' : f(b.d, 2)) + '</td><td>' + (b.d === Infinity ? '∞' : f(b.d, 2)) + '</td><td>' + det + '</td></tr>';
    });
    $('barsTbl').innerHTML = h + '</tbody>';
  }
  /* canvases */
  function readColors() { var cs = getComputedStyle(document.documentElement); ['ink', 'ink-2', 'muted', 'rule', 'surface', 'h0', 'h1', 'edge', 'tri'].forEach(function (n) { fig.colors[n] = cs.getPropertyValue('--' + n).trim(); }); }
  function fit(canvas, ctx, el, store) {
    var w = el.clientWidth, h = el.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); store.w = w; store.h = h;
  }
  var cxC = $('cx'), bcC = $('bc'), cxCtx = cxC.getContext('2d'), bcCtx = bcC.getContext('2d');
  function drawComplex() {
    var ctx = cxCtx, w = fig.cxS.w, h = fig.cxS.h;
    if (!w || !fig.pts) return;
    ctx.clearRect(0, 0, w, h);
    var xs = fig.pts.map(function (p) { return p[0]; }), ys = fig.pts.map(function (p) { return p[1]; });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    var cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, half = Math.max(maxx - minx, maxy - miny) / 2 * 1.35 || 1;
    var sc = Math.min(w, h) / (2 * half);
    var P = fig.pts.map(function (p) { return [w / 2 + (p[0] - cx) * sc, h / 2 - (p[1] - cy) * sc]; });
    ctx.beginPath();
    for (var k = 0; k < fig.ph.T.length; k++) {
      var tr = fig.ph.T[k];
      if (fig.ph.E[tr.col[2]].d > fig.eps) break;
      var a = P[tr.v[0]], b = P[tr.v[1]], c = P[tr.v[2]];
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) { var t = b; b = c; c = t; }
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.closePath();
    }
    ctx.fillStyle = fig.colors.tri; ctx.fill('nonzero');
    ctx.beginPath();
    for (k = 0; k < fig.ph.E.length; k++) { var e = fig.ph.E[k]; if (e.d > fig.eps) break; ctx.moveTo(P[e.i][0], P[e.i][1]); ctx.lineTo(P[e.j][0], P[e.j][1]); }
    ctx.strokeStyle = fig.colors.edge; ctx.lineWidth = 1; ctx.stroke();
    var hl = fig.hover || (fig.main && fig.eps >= fig.main.b && fig.eps < fig.main.d ? fig.main : null);
    if (hl && hl.dim === 1) {
      ctx.beginPath();
      hl.cycle.forEach(function (ei) { var ee = fig.ph.E[ei]; ctx.moveTo(P[ee.i][0], P[ee.i][1]); ctx.lineTo(P[ee.j][0], P[ee.j][1]); });
      ctx.setLineDash(fig.eps < hl.b || fig.eps >= hl.d ? [4, 4] : []);
      ctx.strokeStyle = fig.colors.h1; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); ctx.setLineDash([]);
    } else if (hl && hl.dim === 0 && hl.edge !== undefined) {
      var he = fig.ph.E[hl.edge];
      ctx.beginPath(); ctx.moveTo(P[he.i][0], P[he.i][1]); ctx.lineTo(P[he.j][0], P[he.j][1]);
      ctx.strokeStyle = fig.colors.h0; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    }
    P.forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 3.6, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = fig.colors.surface; ctx.stroke(); ctx.fillStyle = fig.colors.ink; ctx.fill(); });
    ctx.font = '500 10px "DM Mono", ui-monospace, monospace'; ctx.fillStyle = fig.colors.muted; ctx.textBaseline = 'middle';
    var gx = mean(P.map(function (p) { return p[0]; })), gy = mean(P.map(function (p) { return p[1]; }));
    P.forEach(function (p, i) {
      var dx = p[0] - gx, dy = p[1] - gy, L = Math.hypot(dx, dy) || 1, off = 14;
      ctx.textAlign = dx / L > 0.3 ? 'left' : dx / L < -0.3 ? 'right' : 'center';
      ctx.fillText(EG.codes[i], p[0] + dx / L * off, p[1] + dy / L * off);
    });
  }
  function roundBar(ctx, x0, x1, y, th) { var r = Math.min(th / 2, (x1 - x0) / 2); ctx.beginPath(); ctx.moveTo(x0 + r, y - th / 2); ctx.lineTo(x1 - r, y - th / 2); ctx.arc(x1 - r, y, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x0 + r, y + th / 2); ctx.arc(x0 + r, y, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill(); }
  function drawBarcode() {
    var ctx = bcCtx, w = fig.bcS.w, h = fig.bcS.h;
    if (!w || !fig.ph) return;
    ctx.clearRect(0, 0, w, h);
    var padL = 14, padR = 22, padT = 38, padB = 40, gapMid = 30, XMAX = Math.ceil(fig.maxD * 10) / 10;
    var X = function (v) { return padL + (Math.min(v, XMAX) / XMAX) * (w - padL - padR); };
    var nRows = fig.h0Rows.length + 6, pitch = Math.max(4.5, (h - padT - padB - gapMid) / nRows);
    fig.pitch = pitch;
    var th = Math.max(2.5, Math.min(5, pitch * 0.6));
    ctx.font = '400 10px "DM Mono", ui-monospace, monospace'; ctx.textBaseline = 'alphabetic';
    var ticks = niceTicks(0, XMAX, 4);
    ticks.forEach(function (v, i) {
      var x = X(v), last = i === ticks.length - 1;
      ctx.strokeStyle = fig.colors.rule; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 0.5, padT - 8); ctx.lineTo(x + 0.5, h - padB + 4); ctx.stroke();
      ctx.fillStyle = fig.colors.muted; ctx.textAlign = i === 0 ? 'left' : last ? 'right' : 'center';
      ctx.fillText(v.toFixed(1), i === 0 ? x - 2 : last ? x + 4 : x, h - padB + 17);
    });
    ctx.textAlign = 'center'; ctx.fillText('ε  (correlation distance)', X(XMAX / 2), h - 6);
    fig.rows = [];
    function label(yb, col, txt) { ctx.fillStyle = col; ctx.fillRect(padL, yb - 6, 10, 4); ctx.fillStyle = fig.colors['ink-2']; ctx.textAlign = 'left'; ctx.font = '500 10px "DM Mono", ui-monospace, monospace'; ctx.fillText(txt, padL + 16, yb); }
    label(padT - 10, fig.colors.h0, 'H₀  sector groups');
    var y = padT + pitch / 2;
    fig.h0Rows.forEach(function (b) {
      var alive = b.d > fig.eps;
      ctx.globalAlpha = alive ? 1 : 0.32; ctx.fillStyle = fig.colors.h0;
      var x1 = b.d === Infinity ? X(XMAX) - 6 : X(b.d);
      roundBar(ctx, X(0), Math.max(X(0) + th, x1), y, fig.hover === b ? th + 2 : th);
      if (b.d === Infinity) { ctx.beginPath(); ctx.moveTo(X(XMAX) - 6, y - 4); ctx.lineTo(X(XMAX) + 1, y); ctx.lineTo(X(XMAX) - 6, y + 4); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1; fig.rows.push({ y: y, bar: b }); y += pitch;
    });
    var yEnd = y - pitch / 2;
    label(yEnd + gapMid - 10, fig.colors.h1, 'H₁  loops');
    y = yEnd + gapMid + pitch / 2;
    if (!fig.h1Rows.length) { ctx.fillStyle = fig.colors.muted; ctx.font = '400 11px "DM Mono", ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.fillText('no loops in this window', padL, y + 3); }
    fig.h1Rows.forEach(function (b) {
      var alive = b.b <= fig.eps && fig.eps < b.d;
      ctx.globalAlpha = alive ? 1 : 0.32; ctx.fillStyle = fig.colors.h1;
      roundBar(ctx, X(b.b), Math.max(X(b.b) + th, X(b.d)), y, fig.hover === b ? th + 2 : th);
      ctx.globalAlpha = 1; fig.rows.push({ y: y, bar: b }); y += pitch;
    });
    var ex = Math.round(X(fig.eps)) + 0.5;
    ctx.strokeStyle = fig.colors.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex, 16); ctx.lineTo(ex, h - padB + 4); ctx.stroke();
    ctx.font = '500 10px "DM Mono", ui-monospace, monospace'; ctx.fillStyle = fig.colors.ink;
    var lab = 'ε ' + f(fig.eps, 2), lw = ctx.measureText(lab).width, right = ex + 6 + lw < w - 4;
    ctx.textAlign = right ? 'left' : 'right'; ctx.fillText(lab, right ? ex + 5 : ex - 5, 12);
  }
  function drawFig() { drawComplex(); drawBarcode(); }
  function resizeFig() { fit(cxC, cxCtx, $('cxWrap'), fig.cxS); fit(bcC, bcCtx, $('bcWrap'), fig.bcS); if (fig.ph) drawFig(); }
  if (window.ResizeObserver) { var ro = new ResizeObserver(resizeFig); ro.observe($('cxWrap')); ro.observe($('bcWrap')); }
  window.addEventListener('resize', resizeFig);
  function tipFor(b) {
    if (b.dim === 0) {
      if (b.d === Infinity) return '<b>H₀ · the whole market</b><br>One component that never dies.';
      var e = fig.ph.E[b.edge];
      return '<b>H₀ · two groups merge</b><br>at ε ' + f(b.d, 2) + ' (ρ ' + f(1 - b.d * b.d / 2, 2) + ')<br>via ' + EG.codes[e.i] + '–' + EG.codes[e.j];
    }
    return '<b>H₁ · loop</b><br>opens at ε ' + f(b.b, 2) + ', fills at ' + f(b.d, 2) + '<br>persistence ' + f(b.d - b.b, 2) + '<br>through ' + cycleSectors(b).join(', ');
  }
  function figMove(ev) {
    var rect = bcC.getBoundingClientRect(), py = ev.clientY - rect.top, best = null, bd = Infinity;
    fig.rows.forEach(function (r) { var d = Math.abs(r.y - py); if (d < bd) { bd = d; best = r; } });
    var tip = $('tip');
    if (!best || bd > Math.max(5, fig.pitch / 2 + 1)) { if (fig.hover) { fig.hover = null; tip.hidden = true; drawFig(); } return; }
    if (fig.hover !== best.bar) { fig.hover = best.bar; drawFig(); }
    tip.innerHTML = tipFor(best.bar); tip.hidden = false;
    placeTip(tip, $('plots'), ev.clientX, ev.clientY);
  }
  bcC.addEventListener('pointermove', figMove);
  bcC.addEventListener('pointerdown', figMove);
  bcC.addEventListener('pointerleave', function () { fig.hover = null; $('tip').hidden = true; drawFig(); });
  $('eps').addEventListener('input', function () { stopPlay(); updateEps(); });
  $('win').addEventListener('input', function () { stopPlay(); selectWindow(+$('win').value, false); renderTimeline(); });
  function stopPlay() { if (fig.anim) { cancelAnimationFrame(fig.anim); fig.anim = null; } $('play').textContent = 'Play year'; $('play').setAttribute('aria-pressed', 'false'); }
  $('play').addEventListener('click', function () {
    if (fig.anim) return stopPlay();
    $('play').textContent = 'Pause'; $('play').setAttribute('aria-pressed', 'true');
    var i = fig.idx >= EG.series.length - 1 ? 0 : fig.idx, last = 0;
    function step(ts) {
      if (ts - last > 60) { last = ts; selectWindow(i, false); renderTimeline(); i++; }
      if (i >= EG.series.length) return stopPlay();
      fig.anim = requestAnimationFrame(step);
    }
    fig.anim = requestAnimationFrame(step);
  });

  function renderTimeline() {
    var el = $('timeline'), W = el.clientWidth;
    var old = el.querySelector('svg'); if (old) old.remove();
    if (!W || !EG) return;
    var H = 120, L = 40, Rr = 12, T = 18, B = 26, n = EG.series.length;
    var rhos = EG.series.map(function (s) { return s.rho; });
    var lo = Math.min.apply(null, rhos) - 0.02, hi = Math.max.apply(null, rhos) + 0.02;
    var X = function (i) { return L + i / (n - 1) * (W - L - Rr); }, Y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Mean sector correlation over the last year">';
    out += '<rect class="tl-calm" x="' + L + '" y="' + Y(EG.p33) + '" width="' + (W - L - Rr) + '" height="' + Math.max(0, H - B - Y(EG.p33)) + '"/>';
    out += '<rect class="tl-stress" x="' + L + '" y="' + T + '" width="' + (W - L - Rr) + '" height="' + Math.max(0, Y(EG.p67) - T) + '"/>';
    out += '<rect class="tl-trans" x="' + L + '" y="' + Y(EG.p67) + '" width="' + (W - L - Rr) + '" height="' + Math.max(0, Y(EG.p33) - Y(EG.p67)) + '"/>';
    niceTicks(lo, hi, 3).forEach(function (t) { if (t < lo || t > hi) return; out += '<text x="' + (L - 6) + '" y="' + (Y(t) + 3) + '" text-anchor="end">' + f(t, 2) + '</text>'; });
    out += '<path class="tl-line" d="M' + EG.series.map(function (s, i) { return X(i).toFixed(1) + ' ' + Y(s.rho).toFixed(1); }).join(' L') + '"/>';
    out += '<line class="tl-cursor" x1="' + X(fig.idx) + '" x2="' + X(fig.idx) + '" y1="' + T + '" y2="' + (H - B) + '"/>';
    var lastLab = -99;
    EG.series.forEach(function (s, i) {
      if (i === 0 || s.date.slice(5, 7) === EG.series[i - 1].date.slice(5, 7)) return;
      if (X(i) - lastLab < 52) return;
      lastLab = X(i);
      out += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtDate(s.date).split(' ')[1] + '</text>';
    });
    out += '<text x="' + L + '" y="10">Mean sector correlation · 60-day windows · calm / transitional / stress thirds</text>';
    out += '<rect class="hit" x="' + L + '" y="' + T + '" width="' + (W - L - Rr) + '" height="' + (H - T - B) + '"/></svg>';
    el.insertAdjacentHTML('afterbegin', out);
    var svg = el.querySelector('svg'), hit = svg.querySelector('.hit'), tip = $('tlTip');
    function mv(ev) {
      var i = clamp(Math.round((svgX(svg, W, ev) - L) / (W - L - Rr) * (n - 1)), 0, n - 1), s = EG.series[i];
      tip.innerHTML = '<b>' + fmtDate(s.date) + '</b><br>mean ρ ' + f(s.rho, 2) + '<br>' + REG[regimeOf(s.rho)].name;
      tip.hidden = false; placeTip(tip, el, ev.clientX, ev.clientY);
      if (ev.buttons === 1 || ev.type === 'pointerdown') { stopPlay(); selectWindow(i, false); renderTimeline(); }
    }
    hit.addEventListener('pointermove', mv); hit.addEventListener('pointerdown', mv);
    hit.addEventListener('pointerleave', function () { tip.hidden = true; });
  }
  onResize($('timeline'), renderTimeline);

  /* ================= home card ================= */
  function updateHomeRegime(key, rho) {
    var R = REG[key];
    $('hsRegime').textContent = R.name;
    $('hsRegimeNote').textContent = R.note + ' Mean sector correlation ' + f(rho, 2) + '.';
    $('hsLesson').innerHTML = '<span class="mono-label">Lesson for this state</span>' + R.surf.charAt(0).toUpperCase() + R.surf.slice(1) + ' <span aria-hidden="true">→</span>';
    $('hsLesson').setAttribute('href', R.href);
    var bars = fig.h0Rows.slice(0, 5).map(function (b, i) {
      var w = b.d === Infinity ? 92 : clamp(b.d / fig.maxD * 92, 6, 92);
      return '<rect x="0" y="' + (4 + i * 9) + '" width="' + w.toFixed(0) + '" height="4" rx="2" fill="var(--h0)" opacity="' + (1 - i * 0.14).toFixed(2) + '"/>';
    }).join('');
    if (fig.main) { var b = fig.main; bars += '<rect x="' + (b.b / fig.maxD * 92).toFixed(0) + '" y="54" width="' + clamp((b.d - b.b) / fig.maxD * 92, 4, 92).toFixed(0) + '" height="4" rx="2" fill="var(--h1)"/>'; }
    $('hsBars').innerHTML = bars;
  }
  function updateHomeLive() {
    if (!S.live || !S.live.indices) return;
    var ix = S.live.indices['NIFTY 50'], vix = S.live.indices['INDIA VIX'], m = liveMood();
    if (ix) $('hsNifty').innerHTML = nIN(ix.last, 2) + ' <span class="' + (ix.pct >= 0 ? 'pos' : 'neg') + '" style="font-size:13px">' + sPct(ix.pct) + '</span>';
    if (vix) $('hsVIX').textContent = f(vix.last, 2);
    if (m) {
      $('hsAD').textContent = f(m.ad, 2);
      $('hsFII').innerHTML = '<span class="' + (m.fii >= 0 ? 'pos' : 'neg') + '">' + sInr(m.fii) + ' cr</span>';
      var mm = moodModel(m.ad, m.fii, m.dii, m.vix), sc = Math.round(mm.score);
      $('hsGauge').innerHTML = gaugeSVG(mm.score, false);
      $('hsScore').textContent = sc; $('hsZone').textContent = zoneOf(sc).name;
    }
    srcLine('hsSrc', marketOpen() ? 'NSE · live' : 'NSE · ' + ((S.live.market && S.live.market.tradeDate) || 'last close'), marketOpen());
    var best = null;
    symbols().forEach(function (sym) { var r = liveRsi(sym); if (r == null) return; if (!best || Math.abs(r - 50) > Math.abs(best.r - 50)) best = { sym: sym, r: r }; });
    if (best) {
      $('hsWatch').innerHTML = '<span class="mono-label">On your watchlist</span><b>' + best.sym + '</b> · RSI ' + Math.round(best.r) + ', ' + (best.r > 70 ? 'overbought' : best.r < 30 ? 'oversold' : 'neutral') + '. What that means <span aria-hidden="true">→</span>';
    }
  }


  /* ================= market weather ================= */
  var WEATHER = {
    calm: { icon: '☀︎', label: 'Clear skies', line: 'Sectors are moving apart and volatility is contained. Breakouts behave the way the course describes.' },
    trans: { icon: '☁︎', label: 'Choppy', line: 'Correlations are drifting up. Ranges hold better than breakouts, and stops belong closer.' },
    stress: { icon: '☈', label: 'Storm warning', line: 'Sectors are moving as one, so spreading money across them buys less protection than it looks like. Size down.' },
  };
  function updateWeather(key, rho) {
    var w = WEATHER[key], el = $('weather');
    if (!w || !el) return;
    var vix = S.live && S.live.indices ? S.live.indices['INDIA VIX'] : null;
    el.className = 'weather ' + key;
    $('wIcon').textContent = w.icon;
    $('wLabel').textContent = w.label;
    $('wLine').textContent = w.line + ' Mean sector correlation ' + f(rho, 2) + (vix ? ', India VIX ' + f(vix.last, 2) : '') + '.';
  }

  /* ================= Topo-Screen ================= */
  var topoSort = 'isolated';
  function renderTopo() {
    if (!S.eod || !S.eod.topo) return;
    var q = ($('topoFind').value || '').trim().toUpperCase();
    var rows = S.eod.topo.slice();
    if (q) rows = rows.filter(function (r) { return (r.sym + ' ' + r.name + ' ' + r.industry).toUpperCase().indexOf(q) >= 0; });
    var total = rows.length;
    if (topoSort === 'isolated') rows.sort(function (a, b) { return b.dist - a.dist; });
    else if (topoSort === 'coupled') rows.sort(function (a, b) { return a.dist - b.dist; });
    else if (topoSort === 'breakout') rows.sort(function (a, b) { return a.corrChg - b.corrChg; });
    else rows.sort(function (a, b) { return b.corrChg - a.corrChg; });
    rows = rows.slice(0, 30);
    var h = '<thead><tr><th scope="col">Stock</th><th scope="col" class="l">Industry</th><th scope="col">Close</th><th scope="col">RSI</th><th scope="col">Distance from cluster</th><th scope="col">Avg ρ with market</th><th scope="col">Δ ρ, 30 sessions</th></tr></thead><tbody>';
    if (!rows.length) h += '<tr><td class="l" colspan="7" style="color:var(--muted)">Nothing matches that search.</td></tr>';
    rows.forEach(function (r) {
      h += '<tr><th scope="row"><b>' + r.sym + '</b><span>' + esc(r.name) + '</span></th><td class="l">' + esc(r.industry) + '</td>' +
        '<td>₹' + nIN(r.close, 2) + ' <span class="' + (r.chg >= 0 ? 'pos' : 'neg') + '">' + sPct(r.chg, 1) + '</span></td>' +
        '<td>' + Math.round(r.rsi) + '</td>' +
        '<td>' + f(r.dist, 2) + '</td><td>' + f(r.avgCorr, 2) + '</td>' +
        '<td class="' + (r.corrChg <= 0 ? 'pos' : 'neg') + '">' + (r.corrChg >= 0 ? '+' : '−') + f(Math.abs(r.corrChg), 2) + '</td></tr>';
    });
    $('topoTable').innerHTML = h + '</tbody>';
    $('topoCount').textContent = 'showing ' + rows.length + ' of ' + total + ' stocks';
    srcLine('topoSrc', 'NSE end-of-day ' + fmtDate(S.eod.asOf) + ' · 60-session correlations across ' + S.eod.topo.length + ' stocks', false);
  }
  document.querySelectorAll('#t-topo .chipbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      topoSort = b.dataset.t;
      document.querySelectorAll('#t-topo .chipbtn').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      renderTopo();
    });
  });
  $('topoFind').addEventListener('input', renderTopo);

  /* ================= regime-conditioned backtester ================= */
  var btOn = { calm: true, trans: true, stress: true };
  function btStats(trades) {
    if (!trades.length) return null;
    var wins = trades.filter(function (t) { return t.ret > 0; });
    var rets = trades.map(function (t) { return t.ret; });
    return {
      n: trades.length,
      win: wins.length / trades.length * 100,
      avg: mean(rets),
      hold: mean(trades.map(function (t) { return t.bars; })),
      best: Math.max.apply(null, rets),
      worst: Math.min.apply(null, rets),
    };
  }
  function renderBacktest() {
    if (!S.eod || !S.eod.backtests) return;
    var key = $('btStrat').value, bt = S.eod.backtests[key];
    if (!bt) return;
    var all = btStats(bt.trades);
    var picked = bt.trades.filter(function (t) { return t.regime && btOn[t.regime]; });
    var sel = btStats(picked);
    var byReg = { calm: btStats(bt.trades.filter(function (t) { return t.regime === 'calm'; })), trans: btStats(bt.trades.filter(function (t) { return t.regime === 'trans'; })), stress: btStats(bt.trades.filter(function (t) { return t.regime === 'stress'; })) };
    var names = { calm: 'Calm', trans: 'Transitional', stress: 'Stress' };
    var h = '<div class="bt-head"><span>Trades taken</span><span style="text-align:right">Win rate</span><span style="text-align:right">Avg return</span></div>';
    h += '<div class="bt-row hero-row"><b>Every regime</b><span class="v">' + f(all.win, 1) + '%</span><span class="v">' + sPct(all.avg, 2) + '</span><span class="cnote" style="grid-column:1/-1;color:var(--muted);font-size:13px">' + nIN(all.n) + ' trades · avg hold ' + Math.round(all.hold) + ' sessions</span></div>';
    ['calm', 'trans', 'stress'].forEach(function (k) {
      var st = byReg[k];
      h += '<div class="bt-row"' + (btOn[k] ? '' : ' style="opacity:.45"') + '><b>' + names[k] + '</b><span class="v">' + (st ? f(st.win, 1) + '%' : '—') + '</span><span class="v">' + (st ? sPct(st.avg, 2) : '—') + '</span>' +
        '<span class="cnote" style="grid-column:1/-1;color:var(--muted);font-size:13px">' + (st ? nIN(st.n) + ' trades · best ' + sPct(st.best, 1) + ' · worst ' + sPct(st.worst, 1) : 'no trades') + '</span></div>';
    });
    if (sel) {
      h += '<div class="bt-row hero-row"><b>Your filter</b><span class="v">' + f(sel.win, 1) + '%</span><span class="v">' + sPct(sel.avg, 2) + '</span><span class="cnote" style="grid-column:1/-1;color:var(--muted);font-size:13px">' + nIN(sel.n) + ' of ' + nIN(all.n) + ' trades kept</span></div>';
      var dW = sel.win - all.win, dA = sel.avg - all.avg;
      h += '<p class="bt-delta">Trading this signal only in ' + list(Object.keys(btOn).filter(function (k) { return btOn[k]; }).map(function (k) { return names[k].toLowerCase(); })) +
        ' regimes changes the win rate by <b>' + (dW >= 0 ? '+' : '−') + f(Math.abs(dW), 1) + ' points</b> and the average trade by <b>' + (dA >= 0 ? '+' : '−') + f(Math.abs(dA), 2) + ' points</b>, on ' + nIN(sel.n) + ' trades.</p>';
    } else {
      h += '<p class="bt-delta">No trades left with those regimes unticked.</p>';
    }
    $('btStats').innerHTML = h;
    $('btRule').textContent = bt.name;
    srcLine('btSrc', 'NIFTY 500 · ' + fmtDate(S.eod.dates[0]) + ' to ' + fmtDate(S.eod.asOf) + ' · ' + nIN(all.n) + ' trades', false);
    renderBtChart(byReg, all);
  }
  function renderBtChart(byReg, all) {
    var el = $('btChart'), W = el.clientWidth;
    var old = el.querySelector('svg'); if (old) old.remove();
    if (!W) return;
    var H = 230, L = 42, R = 12, T = 18, gap = 26, panel = (H - T - gap - 26) / 2;
    var groups = [
      { k: 'all', label: 'All', st: all, cls: 'bar-all' },
      { k: 'calm', label: 'Calm', st: byReg.calm, cls: 'bar-calm' },
      { k: 'trans', label: 'Transitional', st: byReg.trans, cls: 'bar-trans' },
      { k: 'stress', label: 'Stress', st: byReg.stress, cls: 'bar-stress' },
    ];
    var bw = (W - L - R) / groups.length, barW = Math.min(46, bw * 0.5);
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Win rate and average return by regime">';
    // win rate panel
    var wMax = Math.max.apply(null, groups.map(function (g) { return g.st ? g.st.win : 0; }).concat([50])) * 1.15;
    var yW = function (v) { return T + (1 - v / wMax) * panel; };
    out += '<text x="' + L + '" y="' + (T - 6) + '">Win rate %</text>';
    [0, 25, 50].concat(wMax > 62 ? [75] : []).forEach(function (t) {
      if (t > wMax) return;
      out += '<line class="c-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yW(t) + '" y2="' + yW(t) + '"/><text x="' + (L - 6) + '" y="' + (yW(t) + 3) + '" text-anchor="end">' + t + '</text>';
    });
    groups.forEach(function (g, i) {
      if (!g.st) return;
      var x = L + bw * i + (bw - barW) / 2;
      out += '<rect class="' + g.cls + (g.k !== 'all' && !btOn[g.k] ? ' bar-off' : '') + '" x="' + x + '" y="' + yW(g.st.win) + '" width="' + barW + '" height="' + Math.max(1, yW(0) - yW(g.st.win)) + '" rx="2"/>';
      out += '<text class="t-strong" x="' + (x + barW / 2) + '" y="' + (yW(g.st.win) - 5) + '" text-anchor="middle">' + f(g.st.win, 0) + '%</text>';
    });
    // average return panel
    var base = T + panel + gap;
    var vals = groups.map(function (g) { return g.st ? g.st.avg : 0; });
    var aMax = Math.max.apply(null, vals.concat([0.5])) * 1.25, aMin = Math.min.apply(null, vals.concat([0])) * 1.25;
    var yA = function (v) { return base + (1 - (v - aMin) / ((aMax - aMin) || 1)) * panel; };
    out += '<text x="' + L + '" y="' + (base - 6) + '">Average return per trade %</text>';
    out += '<line class="p-zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + yA(0) + '" y2="' + yA(0) + '"/>';
    groups.forEach(function (g, i) {
      if (!g.st) return;
      var x = L + bw * i + (bw - barW) / 2, y0 = yA(0), y1 = yA(g.st.avg);
      out += '<rect class="' + g.cls + (g.k !== 'all' && !btOn[g.k] ? ' bar-off' : '') + '" x="' + x + '" y="' + Math.min(y0, y1) + '" width="' + barW + '" height="' + Math.max(1, Math.abs(y1 - y0)) + '" rx="2"/>';
      out += '<text class="t-strong" x="' + (x + barW / 2) + '" y="' + (g.st.avg >= 0 ? Math.min(y0, y1) - 5 : Math.max(y0, y1) + 12) + '" text-anchor="middle">' + sPct(g.st.avg, 2) + '</text>';
      out += '<text x="' + (x + barW / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + g.label + '</text>';
    });
    out += '</svg>';
    el.insertAdjacentHTML('afterbegin', out);
  }
  document.querySelectorAll('#t-backtest .chipbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      btOn[b.dataset.r] = !btOn[b.dataset.r];
      b.setAttribute('aria-pressed', String(btOn[b.dataset.r]));
      renderBacktest();
    });
  });
  $('btStrat').addEventListener('change', renderBacktest);
  onResize($('btChart'), function () { if (S.eod) renderBacktest(); });

  /* ================= portfolio fragility ================= */
  var PF_EXAMPLE = 'HDFCBANK 18\nICICIBANK 14\nTCS 12\nINFY 10\nRELIANCE 14\nITC 8\nMARUTI 8\nSUNPHARMA 8\nTATASTEEL 8';
  function parseHoldings(text) {
    return text.split(/\n+/).map(function (line) {
      var parts = line.split(/[\s,;\t]+/).filter(Boolean);
      if (!parts.length) return null;
      var sym = parts[0].toUpperCase().replace(/[^A-Z0-9&\-]/g, '');
      var w = parts.length > 1 ? parseFloat(parts[1].replace(/[%₹,]/g, '')) : 1;
      if (!sym) return null;
      return { sym: sym, weight: Number.isFinite(w) && w > 0 ? w : 1 };
    }).filter(Boolean);
  }
  function renderPortfolio(rep) {
    var el = $('pfOut');
    if (rep.error) { el.innerHTML = '<p class="note warn">' + esc(rep.error) + (rep.missing && rep.missing.length ? ' Not found: ' + rep.missing.join(', ') + '.' : '') + '</p>'; return; }
    var n = rep.symbols.length;
    var grade = rep.effN / n;
    var verdict = grade > 0.55 ? 'pass' : grade > 0.35 ? 'watch' : 'flag';
    var h = '<div class="pf-score">' +
      '<div><div class="ro-k">Holdings</div><div class="ro-v">' + n + '</div></div>' +
      '<div><div class="ro-k">Effective independent bets</div><div class="ro-v">' + f(rep.effN, 1) + '</div></div>' +
      '<div><div class="ro-k">Mean pairwise ρ</div><div class="ro-v">' + f(rep.meanRho, 2) + '</div></div></div>';
    h += '<p class="note">' + pill(verdict, verdict === 'pass' ? '✓ Spread out' : verdict === 'watch' ? '! Concentrated' : '✕ Tightly coupled') +
      ' Your ' + n + ' holdings behave like about <b>' + f(rep.effN, 1) + '</b> independent positions over the last ' + rep.window + ' sessions. ' +
      (grade > 0.55 ? 'That is a genuinely spread-out book.' : grade > 0.35 ? 'Some of the diversification is cosmetic.' : 'Most of these move together: the book is close to one bet.') + '</p>';
    if (rep.clusters.length) {
      h += '<div style="margin-top:16px"><span class="mono-label">Tightly coupled groups (ρ ≥ 0.6)</span>';
      rep.clusters.forEach(function (c) {
        h += '<div class="cluster"><b>' + f(c.weight * 100, 0) + '% of the book moves as one</b><div class="syms">' + c.members.join(' · ') + '</div>' +
          '<p>Average correlation inside the group ' + f(c.meanRho, 2) + (c.sectors.length > 1 ? '. It spans ' + c.sectors.length + ' industries (' + esc(c.sectors.slice(0, 4).join(', ')) + '), so a sector breakdown would not show this as concentration.' : '.') + '</p></div>';
      });
      h += '</div>';
    } else {
      h += '<p class="note" style="margin-top:14px">No group of holdings is correlated at 0.6 or above.</p>';
    }
    // map of the book
    var pts = mds(rep.D), xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    var W = 320, H = 200, pad = 26;
    var X = function (v) { return pad + (v - minx) / ((maxx - minx) || 1) * (W - 2 * pad); };
    var Y = function (v) { return H - pad - (v - miny) / ((maxy - miny) || 1) * (H - 2 * pad); };
    var inCluster = {};
    rep.clusters.forEach(function (c) { c.members.forEach(function (m) { inCluster[m] = true; }); });
    var g = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Map of the portfolio in correlation space">';
    for (var i = 0; i < rep.symbols.length; i++) for (var j = i + 1; j < rep.symbols.length; j++) {
      if (rep.D[i][j] < 0.9) g += '<line class="pf-edge" x1="' + X(pts[i][0]) + '" y1="' + Y(pts[i][1]) + '" x2="' + X(pts[j][0]) + '" y2="' + Y(pts[j][1]) + '"/>';
    }
    rep.symbols.forEach(function (sym, i) {
      g += '<circle class="pf-dot' + (inCluster[sym] ? ' hot' : '') + '" cx="' + X(pts[i][0]) + '" cy="' + Y(pts[i][1]) + '" r="' + (4 + Math.sqrt(rep.weights[i]) * 8).toFixed(1) + '"/>';
      g += '<text x="' + X(pts[i][0]) + '" y="' + (Y(pts[i][1]) - 9) + '" text-anchor="middle">' + sym + '</text>';
    });
    h += '<div class="pf-map"><span class="mono-label">Your book in correlation space · closer means moving together</span>' + g + '</svg></div>';
    h += '<div style="margin-top:14px"><span class="mono-label">Most coupled holdings</span><div class="tbl-scroll"><table class="data-tbl"><thead><tr><th class="l">Stock</th><th class="l">Industry</th><th>Weight</th><th>Avg ρ with the rest</th></tr></thead><tbody>' +
      rep.perHolding.slice(0, 8).map(function (r) { return '<tr><th scope="row" class="l"><b>' + r.sym + '</b></th><td class="l">' + esc(r.industry) + '</td><td>' + f(r.weight * 100, 1) + '%</td><td>' + f(r.avgRho, 2) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';
    if (rep.missing && rep.missing.length) h += '<p class="note warn">No price history for: ' + rep.missing.join(', ') + '. They were left out.</p>';
    el.innerHTML = h;
    srcLine('pfSrc', 'NSE closes · ' + rep.window + '-session window to ' + fmtDate(S.eod.asOf), false);
  }
  $('pfRun').addEventListener('click', function () {
    var holdings = parseHoldings($('pfText').value);
    if (holdings.length < 2) { $('pfOut').innerHTML = '<p class="note warn">Give at least two holdings, one per line.</p>'; return; }
    $('pfOut').innerHTML = '<p class="note">Scanning ' + holdings.length + ' holdings…</p>';
    fetch('/api/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ holdings: holdings }) })
      .then(function (r) { return r.json(); })
      .then(renderPortfolio)
      .catch(function (e) { $('pfOut').innerHTML = '<p class="note warn">' + esc(String(e.message || e)) + '</p>'; });
  });
  $('pfExample').addEventListener('click', function () { $('pfText').value = PF_EXAMPLE; $('pfRun').click(); });

  /* ================= ask the engine ================= */
  var ASK_SUGGESTIONS = [
    'Why is the market in this regime today?',
    'Which sectors have decoupled in the last month?',
    'What would have to change for the engine to read stress?',
    'Is diversification working right now?',
  ];
  function renderAskSuggestions() {
    $('askSuggest').innerHTML = ASK_SUGGESTIONS.map(function (q) { return '<button type="button" class="chipbtn" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('');
  }
  function askEngine(question) {
    $('askOut').innerHTML = '<p class="note">Reading the engine…</p>';
    fetch('/api/explain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: question }) })
      .then(function (r) { return r.json(); })
      .then(function (a) {
        if (a.error) { $('askOut').innerHTML = '<p class="note warn">' + esc(a.error) + '</p>'; return; }
        var html = '';
        if (a.llm) html += '<div><span class="ask-badge">Answer · written by Claude from the engine’s numbers</span>' + a.llm.split(/\n+/).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</div>';
        html += '<div style="margin-top:' + (a.llm ? '18px' : '0') + '"><span class="ask-badge">' + (a.llm ? 'The underlying read' : 'Answer · from the engine’s numbers') + '</span>' +
          a.plain.split(/\n\n+/).map(function (p) { return '<p>' + esc(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') + '</p>'; }).join('') + '</div>';
        if (!a.llmAvailable) html += '<p class="hint">Set ANTHROPIC_API_KEY and run <code>npm install @anthropic-ai/sdk</code> to have Claude answer free-form questions here; the read above is written from the same numbers either way.</p>';
        if (a.llmError) html += '<p class="hint">Claude could not be reached: ' + esc(a.llmError) + '</p>';
        $('askOut').innerHTML = html;
        srcLine('askSrc', a.llmAvailable ? 'engine facts + Claude' : 'engine facts', false);
      })
      .catch(function (e) { $('askOut').innerHTML = '<p class="note warn">' + esc(String(e.message || e)) + '</p>'; });
  }
  $('askGo').addEventListener('click', function () { askEngine($('askQ').value || ASK_SUGGESTIONS[0]); });
  $('askQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') askEngine($('askQ').value || ASK_SUGGESTIONS[0]); });
  $('askSuggest').addEventListener('click', function (e) { var b = e.target.closest('.chipbtn'); if (!b) return; $('askQ').value = b.dataset.q; askEngine(b.dataset.q); });

  /* ================= crash replay ================= */
  var EPISODES = {
    '2020': { from: '2019-11-01', to: '2020-05-29', label: 'COVID crash · Feb–May 2020' },
    '2018': { from: '2018-05-01', to: '2018-11-30', label: 'IL&FS credit squeeze · 2018' },
    '2013': { from: '2013-02-01', to: '2013-09-30', label: 'Taper tantrum · 2013' },
  };
  function loadEpisode(key) {
    if (key === 'live') {
      buildEngine(); renderTimeline(); resizeFig();
      $('epNote').textContent = 'The figure is showing the last two years of NSE sector indices.';
      srcLine('epSrc', 'live history', true);
      return;
    }
    var ep = EPISODES[key];
    $('epNote').textContent = 'Downloading ' + ep.label + ' from NSE’s index archive…';
    srcLine('epSrc', 'loading…', false);
    getJson('/api/episode?from=' + ep.from + '&to=' + ep.to).then(function (r) {
      var d = r.body;
      if (d.error) { $('epNote').textContent = d.error; return; }
      buildEngineFrom(d.dates, d.sectors, ep.label, false);
      renderTimeline(); resizeFig();
      var first = d.sectors.length;
      $('epNote').innerHTML = 'Replaying <b>' + esc(ep.label) + '</b>: ' + d.dates.length + ' sessions, ' + first + ' sector indices that existed then. Drag the window slider on FIG. 1, or press Play year, and watch the barcode collapse as the crash arrives.';
      srcLine('epSrc', 'NSE index archive · ' + fmtDate(d.from) + ' to ' + fmtDate(d.to), false);
      var fig1 = document.getElementById('fig1');
      if (fig1) moScroll(fig1);
    }).catch(function (e) { $('epNote').textContent = 'Could not load that episode: ' + (e.message || e); });
  }
  document.querySelectorAll('#replay .chipbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#replay .chipbtn').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      loadEpisode(b.dataset.ep);
    });
  });


  /* ================= the seven candidates, running ================= */
  var CAND_STATUS = [
    ['1', 'Streaming persistent homology', 'Rolling correlation sums and pairing reuse, benchmarked below', 'Transposition (vineyard) updates are not implemented: when the edge order moves, it falls back to a full reduction.'],
    ['2', 'Topological regime attribution', 'Ranked sector and stock drivers, with the representative cycle', 'Ranks by correlation movement; a formal contribution decomposition is not implemented.'],
    ['3', 'Two-parameter regime fingerprint', 'Hilbert function over correlation × realised volatility', 'Realised volatility stands in for liquidity: bid-ask spreads are not in a free feed.'],
    ['4', 'Self-calibrating pipeline', 'Window sweep scored on diagram stability and false alarms', 'Calibrates the window only; embedding dimension and delay do not apply to this correlation pipeline.'],
    ['5', 'Surrogate-gated drift detector', 'Phase-randomised and block-bootstrap nulls with a p-value gate', 'The gate reports the action; it does not place orders or retrain a model.'],
    ['6', 'Cross-asset contagion map', 'Equities, G-Secs, corporate bonds, REITs and VIX in one network', 'Loops are matched across windows by overlap, which approximates zigzag persistence; FX and crypto are not in NSE’s index file.'],
    ['7', 'IV-surface topology', 'Sublevel-set persistence on the strike × expiry surface', 'H₀ basins only, on one trading day: a history of surfaces needs more archive days.'],
  ];
  function renderCandStatus() {
    $('candStatus').innerHTML = '<thead><tr><th scope="col">#</th><th scope="col" class="l">Candidate</th><th scope="col" class="l">What runs here</th><th scope="col" class="l">Where the prototype stops</th></tr></thead><tbody>' +
      CAND_STATUS.map(function (r) {
        return '<tr><th scope="row"><a href="#engine/p' + r[0] + '"><b>' + r[0] + '</b></a></th><td class="l">' + esc(r[1]) + '</td><td class="l status-ok">' + esc(r[2]) + '</td><td class="l" style="color:var(--muted)">' + esc(r[3]) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  /* ---- candidate 1: streaming vs rebuild ---- */
  function pairKey(i, j, n) { return i * n + j; }
  function distsFromSums(n, W, S, Q, P) {
    var D = [], i, j;
    for (i = 0; i < n; i++) D.push(new Array(n).fill(0));
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var cov = P[pairKey(i, j, n)] - S[i] * S[j] / W;
      var va = Q[i] - S[i] * S[i] / W, vb = Q[j] - S[j] * S[j] / W;
      var c = va > 0 && vb > 0 ? clamp(cov / Math.sqrt(va * vb), -1, 1) : 0;
      D[i][j] = D[j][i] = Math.sqrt(Math.max(0, 2 * (1 - c)));
    }
    return D;
  }
  function orderOf(D) {
    var n = D.length, keys = [];
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) keys.push([D[i][j], i * n + j]);
    keys.sort(function (a, b) { return a[0] - b[0]; });
    return keys.map(function (k) { return k[1]; });
  }
  function pairingOf(ph, D) {
    // remember which edges carried each bar, so unchanged ordering means unchanged pairing
    var n = D.length;
    var h0 = ph.h0.filter(function (b) { return b.d !== Infinity; }).map(function (b) { return ph.E[b.edge].i * n + ph.E[b.edge].j; });
    var h1 = ph.h1.map(function (b) {
      var born = null, died = null;
      ph.E.forEach(function (e, k) {
        if (Math.abs(e.d - b.b) < 1e-12 && born === null) born = e.i * n + e.j;
        if (Math.abs(e.d - b.d) < 1e-12 && died === null) died = e.i * n + e.j;
      });
      return [born, died];
    });
    return { h0: h0, h1: h1 };
  }
  function runStreamBench() {
    if (!EG) return;
    var R = EG.R, n = R.length, W = EG.win, T = R[0].length;
    var sessions = Math.min(120, T - W - 1);
    var start = T - sessions;
    var i, j, t, u;
    // ---- rolling correlation update (what a tick-driven engine would do) ----
    var S1 = new Array(n).fill(0), Q1 = new Array(n).fill(0), P1 = new Float64Array(n * n);
    for (i = 0; i < n; i++) for (t = start - W; t < start; t++) { S1[i] += R[i][t]; Q1[i] += R[i][t] * R[i][t]; }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) { var p0 = 0; for (t = start - W; t < start; t++) p0 += R[i][t] * R[j][t]; P1[pairKey(i, j, n)] = p0; }
    var tRoll = performance.now();
    var lastD = null;
    for (t = start; t < T; t++) {
      var out = t - W;
      for (i = 0; i < n; i++) { S1[i] += R[i][t] - R[i][out]; Q1[i] += R[i][t] * R[i][t] - R[i][out] * R[i][out]; }
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) P1[pairKey(i, j, n)] += R[i][t] * R[j][t] - R[i][out] * R[j][out];
      lastD = distsFromSums(n, W, S1, Q1, P1);
    }
    var rollMs = (performance.now() - tRoll) / sessions;
    // ---- the same correlations, recomputed from the window each session ----
    var tFull = performance.now();
    for (t = start; t < T; t++) {
      var S2 = new Array(n).fill(0), Q2 = new Array(n).fill(0), P2 = new Float64Array(n * n);
      for (i = 0; i < n; i++) for (u = t - W + 1; u <= t; u++) { S2[i] += R[i][u]; Q2[i] += R[i][u] * R[i][u]; }
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) { var p2 = 0; for (u = t - W + 1; u <= t; u++) p2 += R[i][u] * R[j][u]; P2[pairKey(i, j, n)] = p2; }
      distsFromSums(n, W, S2, Q2, P2);
    }
    var rebuildMs = (performance.now() - tFull) / sessions;
    // ---- the reduction, and how often the edge order actually moves ----
    var tRed = performance.now(), moved = 0, prevOrder = null, transposed = 0;
    for (t = start; t < T; t++) {
      var seg = R.map(function (r) { return r.slice(t - W + 1, t + 1); });
      var D = [];
      for (i = 0; i < n; i++) D.push(new Array(n).fill(0));
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        var c = corrOf(seg[i], seg[j]);
        D[i][j] = D[j][i] = Math.sqrt(Math.max(0, 2 * (1 - c)));
      }
      var ord = orderOf(D);
      if (prevOrder) {
        var diff = 0;
        for (var k = 0; k < ord.length; k++) if (ord[k] !== prevOrder[k]) diff++;
        if (diff) moved++;
        transposed += diff;
      }
      prevOrder = ord;
      persistence(D);
    }
    var redMs = (performance.now() - tRed) / sessions;
    var edges = n * (n - 1) / 2;
    var cells = $('p1out').querySelectorAll('.ro-v');
    cells[0].textContent = f(rollMs, 3) + ' ms';
    cells[1].textContent = f(rebuildMs, 3) + ' ms';
    cells[2].textContent = f(rebuildMs / rollMs, 1) + '×';
    cells[3].textContent = nIN(Math.round(1000 / (rollMs + redMs)));
    $('p1note').innerHTML = 'Replayed <b>' + sessions + '</b> sessions over ' + n + ' sector indices with a ' + W + '-session window, and timed the two halves separately.' +
      '<br><br><b>The correlation half works.</b> Updating rolling sums in place costs <b>' + f(rollMs, 3) + ' ms</b> a session against <b>' + f(rebuildMs, 3) + ' ms</b> to recompute the window from scratch — <b>' + f(rebuildMs / rollMs, 1) + '× cheaper</b>, and the gap grows with the window length, because the rolling form never touches the ' + W + ' stored sessions. Memory is one ' + n + '×' + n + ' matrix of sums (' + nIN(Math.round(n * n * 8 / 1024)) + ' KB), not a window of history.' +
      '<br><br><b>The reduction half does not.</b> It costs <b>' + f(redMs, 3) + ' ms</b> a session, and the ordering of the ' + nIN(edges) + ' edges moved on <b>' + moved + ' of ' + (sessions - 1) + '</b> sessions (about ' + f(transposed / Math.max(1, sessions - 1), 0) + ' positions each time), so a prototype that only reuses the pairing when nothing moved would almost never get to. That is the honest finding: the value in candidate 1 sits in updating the reduction through those transpositions — vineyards — not in avoiding the correlation work.' +
      '<span class="gap">Where it stops: vineyard transposition updates are not implemented here, so every session takes a full reduction. At this size the whole pipeline is well under a millisecond either way; the claim only bites at hundreds of assets and intraday ticks.</span>';
  }
  $('p1run').addEventListener('click', runStreamBench);

  /* ---- candidate 2: ranked attribution ---- */
  function renderAttribution() {
    if (!EG || !fig.D) return;
    var lookback = 20, refIdx = Math.max(0, fig.idx - lookback);
    var cur = corrDist(EG.R, EG.series[fig.idx].end, EG.win);
    var ref = corrDist(EG.R, EG.series[refIdx].end, EG.win);
    var rows = EG.codes.map(function (code, i) {
      var now = 0, then = 0, n = 0;
      for (var j = 0; j < EG.codes.length; j++) {
        if (j === i) continue;
        now += 1 - cur.D[i][j] * cur.D[i][j] / 2;
        then += 1 - ref.D[i][j] * ref.D[i][j] / 2;
        n++;
      }
      return { code: code, now: now / n, then: then / n, chg: (now - then) / n };
    }).sort(function (a, b) { return Math.abs(b.chg) - Math.abs(a.chg); });
    var cyc = fig.main ? cycleSectors(fig.main) : [];
    var h = '<span class="mono-label">Sectors, ranked by how much their coupling moved</span><ul class="checks">';
    rows.slice(0, 6).forEach(function (r) {
      h += '<li><span class="cn">' + r.code + '</span><span class="cv">' + f(r.now, 2) + ' ρ</span>' +
        '<span class="pill ' + (r.chg > 0 ? 'flag' : 'pass') + '">' + (r.chg >= 0 ? '+' : '−') + f(Math.abs(r.chg), 2) + '</span>' +
        '<span class="cnote">was ' + f(r.then, 2) + ' twenty sessions ago' + (cyc.indexOf(r.code) >= 0 ? ' · on the live loop' : '') + '</span></li>';
    });
    h += '</ul><p class="note">' + (rows[0].chg > 0
      ? '<b>' + rows[0].code + '</b> pulled hardest into the pack (+' + f(rows[0].chg, 2) + ' average correlation). Rising coupling is what turns a diversified book into one bet.'
      : '<b>' + rows[0].code + '</b> pulled hardest away from the pack (' + f(rows[0].chg, 2) + '). Falling coupling is where stock-specific work starts paying again.') + '</p>';
    $('p2sectors').innerHTML = h;
    var stocks = (S.eod.topo || []).slice().sort(function (a, b) { return Math.abs(b.corrChg) - Math.abs(a.corrChg); }).slice(0, 8);
    var sh = '<span class="mono-label">Stocks whose coupling moved most (NIFTY 500, 30 sessions)</span><div class="tbl-scroll"><table class="data-tbl"><thead><tr><th class="l">Stock</th><th class="l">Industry</th><th>Avg ρ</th><th>Δ ρ</th></tr></thead><tbody>';
    stocks.forEach(function (r) {
      sh += '<tr><th scope="row" class="l"><b>' + r.sym + '</b></th><td class="l">' + esc(r.industry) + '</td><td>' + f(r.avgCorr, 2) + '</td><td class="' + (r.corrChg > 0 ? 'neg' : 'pos') + '">' + (r.corrChg >= 0 ? '+' : '−') + f(Math.abs(r.corrChg), 2) + '</td></tr>';
    });
    $('p2stocks').innerHTML = sh + '</tbody></table></div><p class="hint">A rising Δ means the stock is joining the crowd; a falling one means it is breaking away.</p>';
    srcLine('p2src', 'window ending ' + fmtDate(EG.series[fig.idx].date) + ' vs ' + fmtDate(EG.series[refIdx].date), false);
  }

  /* ---- candidate 3: bifiltration ---- */
  function renderBifiltration() {
    if (!EG) return;
    var end = EG.series[fig.idx].end, W = EG.win, n = EG.R.length;
    var seg = EG.R.map(function (r) { return r.slice(end - W + 1, end + 1); });
    var vols = seg.map(function (x) { var m = mean(x); return Math.sqrt(mean(x.map(function (v) { return (v - m) * (v - m); })) * 252) * 100; });
    var sortedVol = vols.slice().sort(function (a, b) { return a - b; });
    var levels = [], L = 6;
    for (var q = 0; q < L; q++) levels.push(sortedVol[Math.floor(q / L * (n - 3))]);
    var maxD = fig.maxD, eps = [], E = 10;
    for (var e = 1; e <= E; e++) eps.push(maxD * e / E);
    var grid0 = [], grid1 = [];
    levels.forEach(function (v) {
      var idx = [];
      for (var i = 0; i < n; i++) if (vols[i] >= v) idx.push(i);
      var row0 = [], row1 = [];
      if (idx.length < 3) { eps.forEach(function () { row0.push(null); row1.push(null); }); }
      else {
        var D = idx.map(function (a) { return idx.map(function (b) { return fig.D[a][b]; }); });
        var ph = persistence(D);
        eps.forEach(function (ep) {
          row0.push(ph.h0.filter(function (b) { return b.d === Infinity || b.d > ep; }).length);
          row1.push(ph.h1.filter(function (b) { return b.b <= ep && ep < b.d; }).length);
        });
      }
      grid0.push(row0); grid1.push(row1);
    });
    drawHeatmap('p3b0', grid0, eps, levels, 'β₀', 'p3tip');
    drawHeatmap('p3b1', grid1, eps, levels, 'β₁', 'p3tip');
    var anyLoop = grid1.some(function (row) { return row.some(function (v) { return v; }); });
    var mid = Math.floor(E / 2);
    var lowVol = grid0[0][mid], highVol = grid0[grid0.length - 1][mid];
    $('p3note').innerHTML = 'Each row keeps only the sectors above a realised-volatility floor, each column grows ε. At ε ' + f(eps[mid], 2) +
      ', the whole market sits in <b>' + lowVol + '</b> group' + (lowVol === 1 ? '' : 's') + ', while the most volatile sectors alone sit in <b>' + (highVol == null ? '—' : highVol) + '</b>. ' +
      (anyLoop ? '' : ' β₁ is zero everywhere in this window: there is no loop to find at any radius or volatility floor — drag FIG. 1\u2019s window back, or load the 2020 replay, to see one appear. ') +
      (highVol != null && highVol > lowVol
        ? 'The volatile corner is still fragmented while the market as a whole has merged, which is the signature of a volatility squeeze in part of the market rather than a broad correlation crash.'
        : 'Both merge together, so what is happening is a broad correlation move rather than a volatility squeeze in one corner.') +
      '<span class="gap">Where it stops: the second axis is realised volatility, because bid-ask spreads and depth are not in a free feed. The invariant shown is the rank invariant (β₀ and β₁ on the grid), not a complete multiparameter invariant.</span>';
    srcLine('p3src', EG.codes.length + ' sectors · window ending ' + fmtDate(EG.series[fig.idx].date), false);
  }
  function drawHeatmap(id, grid, cols, rows, label, tipId) {
    var el = $(id), W = el.clientWidth;
    var old = el.querySelector('svg'); if (old) old.remove();
    if (!W) return;
    var L = 46, T = 8, B = 30, Rr = 8, H = 190;
    var cw = (W - L - Rr) / cols.length, ch = (H - T - B) / rows.length;
    var vals = grid.flat().filter(function (v) { return v != null; });
    var mx = Math.max.apply(null, vals) || 1, mn = Math.min.apply(null, vals);
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + label + ' over the bifiltration grid">';
    grid.forEach(function (row, r) {
      row.forEach(function (v, c) {
        var t = v == null ? 0 : (v - mn) / ((mx - mn) || 1);
        var y = T + (rows.length - 1 - r) * ch;
        out += '<rect class="hm-cell" x="' + (L + c * cw) + '" y="' + y + '" width="' + cw + '" height="' + ch + '" style="fill:' + (v == null ? 'var(--rule)' : 'color-mix(in srgb, var(--h0) ' + Math.round(12 + t * 88) + '%, var(--surface))') + '"/>';
        if (cw > 22 && ch > 14 && v != null) out += '<text class="hm-axis" x="' + (L + c * cw + cw / 2) + '" y="' + (y + ch / 2 + 3) + '" text-anchor="middle" style="fill:' + (t > 0.55 ? 'var(--surface)' : 'var(--ink-2)') + '">' + v + '</text>';
      });
    });
    rows.forEach(function (v, r) {
      out += '<text class="hm-axis" x="' + (L - 6) + '" y="' + (T + (rows.length - 1 - r) * ch + ch / 2 + 3) + '" text-anchor="end">' + f(v, 0) + '%</text>';
    });
    cols.forEach(function (v, c) {
      if (c % 2) return;
      out += '<text class="hm-axis" x="' + (L + c * cw + cw / 2) + '" y="' + (H - 14) + '" text-anchor="middle">' + f(v, 1) + '</text>';
    });
    out += '<text class="hm-axis" x="' + L + '" y="' + (H - 2) + '">ε →</text><text class="hm-axis" x="4" y="' + (T + 10) + '">vol ↑</text></svg>';
    el.insertAdjacentHTML('afterbegin', out);
  }

  /* ---- candidate 4: calibration ---- */
  function renderCalibration() {
    var cal = S.eod && S.eod.calibration;
    if (!cal) return;
    var el = $('p4chart'), W = el.clientWidth;
    var old = el.querySelector('svg'); if (old) old.remove();
    if (W) {
      var H = 190, L = 48, Rr = 46, T = 16, B = 30;
      var xs = cal.results.map(function (r) { return r.win; });
      var stab = cal.results.map(function (r) { return r.stability; });
      var fa = cal.results.map(function (r) { return r.falseAlarm * 100; });
      var sMax = Math.max.apply(null, stab) * 1.15, fMax = Math.max(Math.max.apply(null, fa), cal.target * 100) * 1.3;
      var X = function (i) { return L + i / (xs.length - 1) * (W - L - Rr); };
      var Y1 = function (v) { return T + (1 - v / sMax) * (H - T - B); };
      var Y2 = function (v) { return T + (1 - v / fMax) * (H - T - B); };
      var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Stability and false-alarm rate by window length">';
      out += '<path class="sw-line" d="M' + stab.map(function (v, i) { return X(i) + ' ' + Y1(v); }).join(' L') + '"/>';
      out += '<path class="sw-fa" d="M' + fa.map(function (v, i) { return X(i) + ' ' + Y2(v); }).join(' L') + '"/>';
      out += '<line class="sw-fa" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y2(cal.target * 100) + '" y2="' + Y2(cal.target * 100) + '" style="opacity:.5"/>';
      var pick = xs.indexOf(cal.chosen);
      if (pick >= 0) out += '<line class="sw-pick" x1="' + X(pick) + '" x2="' + X(pick) + '" y1="' + T + '" y2="' + (H - B) + '"/>';
      xs.forEach(function (w, i) {
        out += '<circle class="c-dot" cx="' + X(i) + '" cy="' + Y1(stab[i]) + '" r="3"/>';
        out += '<text class="hm-axis" x="' + X(i) + '" y="' + (H - 12) + '" text-anchor="middle">' + w + '</text>';
      });
      out += '<text class="hm-axis" x="' + L + '" y="' + (T - 4) + '">stability (solid) · false alarms % (dashed)</text>';
      out += '<text class="hm-axis" x="' + (W - Rr + 6) + '" y="' + (Y2(cal.target * 100) + 3) + '">target ' + f(cal.target * 100, 0) + '%</text>';
      out += '<text class="hm-axis" x="' + L + '" y="' + (H - 2) + '">window, sessions</text></svg>';
      el.insertAdjacentHTML('afterbegin', out);
    }
    $('p4table').innerHTML = '<thead><tr><th scope="col">Window</th><th scope="col">Diagram drift (calm)</th><th scope="col">Stability</th><th scope="col">False alarms</th><th scope="col" class="l">Verdict</th></tr></thead><tbody>' +
      cal.results.map(function (r) {
        var ok = r.falseAlarm <= cal.target;
        return '<tr' + (r.win === cal.chosen ? ' class="row-sel"' : '') + '><th scope="row">' + r.win + '</th><td>' + f(r.drift, 3) + '</td><td>' + f(r.stability, 2) + '</td><td class="' + (ok ? 'pos' : 'neg') + '">' + f(r.falseAlarm * 100, 1) + '%</td><td class="l">' + (r.win === cal.chosen ? 'chosen' : ok ? 'eligible' : 'too jumpy') + '</td></tr>';
      }).join('') + '</tbody>';
    $('p4pick').textContent = 'Calibrated window: ' + cal.chosen + ' sessions · false alarms ' + f(cal.chosenRow.falseAlarm * 100, 1) + '% under a ' + f(cal.target * 100, 0) + '% ceiling';
    srcLine('p4src', cal.results.length + ' windows swept over ' + S.eod.dates.length + ' sessions', false);
  }
  $('p4apply').addEventListener('click', function () {
    var cal = S.eod && S.eod.calibration;
    if (!cal) return;
    buildEngineFrom(S.eod.dates, S.eod.sectors, 'Last two years · calibrated ' + cal.chosen + '-session window', true, cal.chosen);
    renderTimeline(); resizeFig();
    moScroll(document.getElementById('fig1'));
  });

  /* ---- candidate 5: the gate ---- */
  function runGate() {
    $('p5out').innerHTML = '<p class="note">Running two nulls…</p>';
    getJson('/api/surrogate?n=150').then(function (r) {
      var d = r.body;
      if (d.error) { $('p5out').innerHTML = '<p class="note warn">' + esc(d.error) + '</p>'; return; }
      drawNulls(d);
      var sh = d.shift;
      var act = sh && sh.shifted
        ? 'The gate <b>opens</b>: this window’s structure is outside what the previous window could produce, so a regime alert, a retrain or a de-risking step is justified.'
        : 'The gate <b>stays shut</b>: the reading is inside what the previous window produces by chance, so nothing should fire.';
      $('p5out').innerHTML =
        '<p><b>Is there structure at all?</b> Mean correlation is ' + f(d.observed.rho, 3) + ' against a phase-randomised null of ' + f(d.nullRho.mean, 3) + ' ± ' + f(d.nullRho.sd, 3) + ' (p ' + (d.pRho < 0.005 ? '< 0.005' : f(d.pRho, 3)) + ').</p>' +
        (sh ? '<p><b>Has it changed?</b> The previous ' + d.window + '-session window read ' + f(sh.previous, 3) + '. Resampling blocks of sessions from that window puts 95% of readings between ' + f(sh.nullLo, 3) + ' and ' + f(sh.nullHi, 3) + '; today reads ' + f(sh.observed, 3) + ' (p ' + (sh.p < 0.005 ? '< 0.005' : f(sh.p, 3)) + ').</p>' : '') +
        '<p>' + act + '</p>' +
        '<span class="gap">Where it stops: the gate reports the action and the evidence. Wiring it to a broker, a hedge or a retraining job is the part a product would add.</span>';
    }).catch(function (e) { $('p5out').innerHTML = '<p class="note warn">' + esc(String(e.message || e)) + '</p>'; });
  }
  function drawNulls(d) {
    var el = $('p5chart'), W = el.clientWidth;
    var old = el.querySelector('svg'); if (old) old.remove();
    if (!W) return;
    var H = 210, gap = 26, panelW = (W - gap) / 2, T = 20, B = 26;
    function panel(x0, values, observed, extra, title) {
      var mn = Math.min.apply(null, values.concat([observed, extra == null ? observed : extra])) ;
      var mx = Math.max.apply(null, values.concat([observed, extra == null ? observed : extra]));
      var pad = (mx - mn) * 0.12 || 0.01; mn -= pad; mx += pad;
      var bins = 24, counts = new Array(bins).fill(0);
      values.forEach(function (v) { counts[clamp(Math.floor((v - mn) / (mx - mn) * bins), 0, bins - 1)]++; });
      var cMax = Math.max.apply(null, counts) || 1;
      var X = function (v) { return x0 + (v - mn) / (mx - mn) * panelW; };
      var Y = function (c) { return T + (1 - c / cMax) * (H - T - B); };
      var out = '<text class="hm-axis" x="' + x0 + '" y="' + (T - 6) + '">' + title + '</text>';
      counts.forEach(function (c, i) {
        var x = x0 + i / bins * panelW;
        out += '<rect class="null-bar" x="' + x + '" y="' + Y(c) + '" width="' + (panelW / bins - 1) + '" height="' + Math.max(0, Y(0) - Y(c)) + '"/>';
      });
      out += '<line class="obs-line" x1="' + X(observed) + '" x2="' + X(observed) + '" y1="' + T + '" y2="' + Y(0) + '"/>';
      out += '<text class="hm-axis" x="' + clamp(X(observed), x0 + 24, x0 + panelW - 24) + '" y="' + (T + 10) + '" text-anchor="middle" style="fill:var(--h1-text)">today ' + f(observed, 2) + '</text>';
      if (extra != null) {
        out += '<line class="sw-pick" x1="' + X(extra) + '" x2="' + X(extra) + '" y1="' + T + '" y2="' + Y(0) + '"/>';
        out += '<text class="hm-axis" x="' + clamp(X(extra), x0 + 24, x0 + panelW - 24) + '" y="' + (Y(0) + 14) + '" text-anchor="middle">previous ' + f(extra, 2) + '</text>';
      }
      out += '<line class="c-grid" x1="' + x0 + '" x2="' + (x0 + panelW) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
      return out;
    }
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Null distributions against today’s reading">';
    out += panel(0, d.nullRho.values, d.observed.rho, null, 'phase-randomised null · mean ρ');
    if (d.shift) out += panel(panelW + gap, d.shift.values, d.shift.observed, d.shift.previous, 'previous-window bootstrap · mean ρ');
    $('p5chart').insertAdjacentHTML('afterbegin', out + '</svg>');
  }
  $('p5run').addEventListener('click', runGate);

  /* ---- candidate 6: cross-asset contagion ---- */
  var GROUP_LABEL = { equity: 'Equities', rates: 'G-Secs', credit: 'Corporate bonds', real: 'REITs & InvITs', vol: 'Volatility' };
  function renderContagion() {
    var layers = S.eod && S.eod.layers;
    if (!layers || layers.length < 4) { $('p6note').textContent = 'Not enough cross-asset indices in the archive for this window.'; return; }
    var R = layers.map(function (l) { return logRet(l.c); });
    var W = 60, T = R[0].length;
    var windows = [];
    for (var end = Math.max(W - 1, T - 250); end < T; end++) windows.push(end);
    // cross-asset coupling through time: average |ρ| between equity layers and everything else
    var series = windows.map(function (end) {
      var seg = R.map(function (r) { return r.slice(end - W + 1, end + 1); });
      var sum = 0, n = 0;
      for (var i = 0; i < layers.length; i++) for (var j = i + 1; j < layers.length; j++) {
        if (layers[i].group === layers[j].group) continue;
        if (layers[i].group !== 'equity' && layers[j].group !== 'equity') continue;
        sum += Math.abs(corrOf(seg[i], seg[j])); n++;
      }
      return { date: S.eod.dates[end + 1], v: sum / n };
    });
    // the network right now
    var end2 = T - 1, seg2 = R.map(function (r) { return r.slice(end2 - W + 1, end2 + 1); });
    var D = [], i2, j2;
    for (i2 = 0; i2 < layers.length; i2++) D.push(new Array(layers.length).fill(0));
    for (i2 = 0; i2 < layers.length; i2++) for (j2 = i2 + 1; j2 < layers.length; j2++) {
      var c = corrOf(seg2[i2], seg2[j2]);
      D[i2][j2] = D[j2][i2] = Math.sqrt(Math.max(0, 2 * (1 - c)));
    }
    drawLayerMap(D, layers);
    drawCoupling(series);
    // loop tracking across windows (a practical stand-in for zigzag persistence)
    var chains = [], prev = null;
    windows.filter(function (_, i) { return i % 5 === 0; }).forEach(function (end3) {
      var seg3 = R.map(function (r) { return r.slice(end3 - W + 1, end3 + 1); });
      var D3 = [];
      for (var a = 0; a < layers.length; a++) D3.push(new Array(layers.length).fill(0));
      for (a = 0; a < layers.length; a++) for (var b = a + 1; b < layers.length; b++) {
        var cc = corrOf(seg3[a], seg3[b]);
        D3[a][b] = D3[b][a] = Math.sqrt(Math.max(0, 2 * (1 - cc)));
      }
      var ph = persistence(D3);
      var best = ph.h1.filter(function (x) { return x.d - x.b > 0.05; }).sort(function (x, y) { return (y.d - y.b) - (x.d - x.b); })[0];
      if (!best) { prev = null; return; }
      var nodes = {};
      best.cycle.forEach(function (ei) { nodes[ph.E[ei].i] = 1; nodes[ph.E[ei].j] = 1; });
      var set = Object.keys(nodes).map(Number);
      var date = S.eod.dates[end3 + 1];
      if (prev) {
        var inter = set.filter(function (x) { return prev.set.indexOf(x) >= 0; }).length;
        var uni = new Set(set.concat(prev.set)).size;
        if (inter / uni >= 0.5) { prev.end = date; prev.persist = Math.max(prev.persist, best.d - best.b); prev.set = set; return; }
      }
      prev = { start: date, end: date, set: set, persist: best.d - best.b };
      chains.push(prev);
    });
    var rows = chains.filter(function (c) { return c.start !== c.end; }).slice(-8).reverse();
    $('p6loops').innerHTML = '<thead><tr><th scope="col" class="l">Loop tracked from</th><th scope="col" class="l">to</th><th scope="col">Max persistence</th><th scope="col" class="l">Asset classes it spans</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (c) {
        var groups = [...new Set(c.set.map(function (i) { return GROUP_LABEL[layers[i].group]; }))];
        return '<tr><th scope="row" class="l">' + fmtDate(c.start) + '</th><td class="l">' + fmtDate(c.end) + '</td><td>' + f(c.persist, 2) + '</td><td class="l">' + groups.join(', ') + '</td></tr>';
      }).join('') : '<tr><td class="l" colspan="4" style="color:var(--muted)">No loop survived long enough to track in this stretch.</td></tr>') + '</tbody>';
    var latest = series[series.length - 1], first = series[0];
    $('p6note').innerHTML = 'Average cross-asset coupling — equities against G-Secs, corporate bonds, REITs and the volatility index — reads <b>' + f(latest.v, 2) + '</b> today against ' + f(first.v, 2) + ' a year ago. ' +
      'Orange links in the map are the cross-asset ones: when they shorten, a shock has a path out of equities.' +
      '<span class="gap">Where it stops: loops are matched between windows by how much they overlap, which approximates zigzag persistence rather than computing it; FX and crypto aren’t in NSE’s index file, so those layers are missing.</span>';
    srcLine('p6src', layers.length + ' indices across ' + [...new Set(layers.map(function (l) { return l.group; }))].length + ' asset classes', false);
  }
  function corrOf(a, b) {
    var n = Math.min(a.length, b.length), ma = mean(a), mb = mean(b), cov = 0, va = 0, vb = 0;
    for (var i = 0; i < n; i++) { var x = a[i] - ma, y = b[i] - mb; cov += x * y; va += x * x; vb += y * y; }
    var d = Math.sqrt(va * vb);
    return d ? clamp(cov / d, -1, 1) : 0;
  }
  function drawLayerMap(D, layers) {
    var el = $('p6map'), W = el.clientWidth;
    var old = el.querySelector('svg'); if (old) old.remove();
    if (!W) return;
    var H = 260, pts = mds(D);
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    var pad = 34;
    var X = function (v) { return pad + (v - minx) / ((maxx - minx) || 1) * (W - 2 * pad); };
    var Y = function (v) { return H - pad - (v - miny) / ((maxy - miny) || 1) * (H - 2 * pad); };
    var all = [];
    for (var i = 0; i < D.length; i++) for (var j = i + 1; j < D.length; j++) all.push(D[i][j]);
    all.sort(function (a, b) { return a - b; });
    var thresh = all[Math.floor(all.length * 0.3)];
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Cross-asset network">';
    for (i = 0; i < D.length; i++) for (j = i + 1; j < D.length; j++) {
      if (D[i][j] > thresh) continue;
      var cross = layers[i].group !== layers[j].group;
      out += '<line class="' + (cross ? 'cross-edge' : 'same-edge') + '" x1="' + X(pts[i][0]) + '" y1="' + Y(pts[i][1]) + '" x2="' + X(pts[j][0]) + '" y2="' + Y(pts[j][1]) + '"/>';
    }
    layers.forEach(function (l, k) {
      out += '<circle class="layer-' + l.group + '" cx="' + X(pts[k][0]) + '" cy="' + Y(pts[k][1]) + '" r="5"/>';
      out += '<text class="hm-axis" x="' + X(pts[k][0]) + '" y="' + (Y(pts[k][1]) - 10) + '" text-anchor="middle">' + l.code + '</text>';
    });
    $('p6map').insertAdjacentHTML('afterbegin', out + '</svg>');
  }
  function drawCoupling(series) {
    var el = $('p6time'), W = el.clientWidth;
    var old = el.querySelector('svg'); if (old) old.remove();
    if (!W) return;
    var H = 260, L = 40, Rr = 10, T = 16, B = 26;
    var vals = series.map(function (s) { return s.v; });
    var mn = Math.min.apply(null, vals) - 0.02, mx = Math.max.apply(null, vals) + 0.02;
    var X = function (i) { return L + i / (series.length - 1) * (W - L - Rr); };
    var Y = function (v) { return T + (1 - (v - mn) / (mx - mn)) * (H - T - B); };
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Cross-asset coupling over time">';
    niceTicks(mn, mx, 3).forEach(function (t) { if (t < mn || t > mx) return; out += '<line class="c-grid" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="hm-axis" x="' + (L - 6) + '" y="' + (Y(t) + 3) + '" text-anchor="end">' + f(t, 2) + '</text>'; });
    out += '<path class="tl-line" d="M' + series.map(function (s, i) { return X(i) + ' ' + Y(s.v); }).join(' L') + '"/>';
    var lastLab = -99;
    series.forEach(function (s, i) {
      if (i === 0 || s.date.slice(5, 7) === series[i - 1].date.slice(5, 7)) return;
      if (X(i) - lastLab < 56) return;
      lastLab = X(i);
      out += '<text class="hm-axis" x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtDate(s.date).split(' ')[1] + '</text>';
    });
    $('p6time').insertAdjacentHTML('afterbegin', out + '</svg>');
  }

  /* ---- candidate 7: IV surface ---- */
  function renderIvSurface() {
    var iv = S.eod && S.eod.ivSurface;
    if (!iv) { $('p7read').innerHTML = '<p class="note">No option surface for the latest session.</p>'; return; }
    var el = $('p7map'), W = el.clientWidth;
    var old = el.querySelector('svg'); if (old) old.remove();
    if (W) {
      var rows = iv.grid.length, cols = iv.strikes.length;
      var L = 62, T = 10, B = 34, Rr = 10, H = Math.max(150, rows * 26 + T + B);
      var cw = (W - L - Rr) / cols, ch = (H - T - B) / rows;
      var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Implied volatility surface">';
      iv.grid.forEach(function (row, r) {
        row.forEach(function (v, c) {
          var t = v == null ? null : (v - iv.minIv) / ((iv.maxIv - iv.minIv) || 1);
          out += '<rect class="hm-cell" x="' + (L + c * cw) + '" y="' + (T + r * ch) + '" width="' + Math.max(1, cw) + '" height="' + ch + '" style="fill:' + (t == null ? 'var(--rule)' : 'color-mix(in srgb, var(--h1) ' + Math.round(10 + t * 90) + '%, var(--surface))') + '"/>';
        });
        out += '<text class="hm-axis" x="' + (L - 6) + '" y="' + (T + r * ch + ch / 2 + 3) + '" text-anchor="end">' + iv.days[r] + 'd</text>';
      });
      (iv.essential || []).concat(iv.bars.map(function (b) { return { at: b.at }; })).forEach(function (b) {
        if (!b.at) return;
        out += '<circle cx="' + (L + b.at[1] * cw + cw / 2) + '" cy="' + (T + b.at[0] * ch + ch / 2) + '" r="3.5" style="fill:var(--surface);stroke:var(--ink);stroke-width:1.5"/>';
      });
      iv.strikes.forEach(function (k, c) {
        if (c % Math.ceil(cols / 8) !== 0) return;
        out += '<text class="hm-axis" x="' + (L + c * cw + cw / 2) + '" y="' + (H - 16) + '" text-anchor="middle">' + nIN(k) + '</text>';
      });
      out += '<text class="hm-axis" x="' + L + '" y="' + (H - 3) + '">strike →   ·   rings mark the basins the filtration finds</text>';
      out += '<text class="hm-axis" x="4" y="' + (T + 10) + '">expiry ↓</text></svg>';
      el.insertAdjacentHTML('afterbegin', out);
    }
    $('p7bars').innerHTML = '<span class="mono-label">Basin persistence (H₀ of sublevel sets)</span><div class="tbl-scroll"><table class="data-tbl"><thead><tr><th class="l">Basin at</th><th>Born (IV)</th><th>Merged (IV)</th><th>Persistence</th></tr></thead><tbody>' +
      (iv.essential || []).map(function (b) {
        return '<tr><th scope="row" class="l">' + nIN(iv.strikes[b.at[1]]) + ' · ' + iv.days[b.at[0]] + 'd</th><td>' + f(b.birth * 100, 1) + '%</td><td class="l">never</td><td>—</td></tr>';
      }).concat(iv.bars.slice(0, 6).map(function (b) {
        return '<tr><th scope="row" class="l">' + nIN(iv.strikes[b.at[1]]) + ' · ' + iv.days[b.at[0]] + 'd</th><td>' + f(b.birth * 100, 1) + '%</td><td>' + f(b.death * 100, 1) + '%</td><td>' + f((b.death - b.birth) * 100, 2) + ' pts</td></tr>';
      })).join('') + '</tbody></table></div>';
    var deep = iv.bars[0];
    $('p7read').innerHTML = '<span class="mono-label">Reading</span><p class="note">The ' + iv.expiries.length + '-expiry surface for ' + fmtDate(iv.tradeDate) + ' runs from <b>' + f(iv.minIv * 100, 1) + '%</b> to <b>' + f(iv.maxIv * 100, 1) + '%</b> implied volatility, and sublevel-set persistence finds <b>' + iv.basins + '</b> basin' + (iv.basins === 1 ? '' : 's') + '. ' +
      (deep ? 'The deepest secondary basin sits at strike ' + nIN(iv.strikes[deep.at[1]]) + ', ' + iv.days[deep.at[0]] + ' days out, and survives ' + f((deep.death - deep.birth) * 100, 2) + ' volatility points before it merges into the main one. ' : '') +
      'A surface that breaks into several persistent basins is one where the market prices different stories at different strikes; one basin means a single, smooth story.</p>' +
      '<p class="hint">Underlying ' + nIN(iv.underlying) + ' · implied volatility inverted from NSE closing prices with Black–Scholes, out-of-the-money side only.</p>';
    srcLine('p7src', 'NSE F&O close ' + fmtDate(iv.tradeDate) + ' · ' + iv.expiries.length + ' expiries × ' + iv.strikes.length + ' strikes', false);
  }

  function renderCandidatesLive() {
    renderCandStatus();
    renderAttribution();
    renderBifiltration();
    renderCalibration();
    renderContagion();
    renderIvSurface();
  }
  ['p3b0', 'p3b1', 'p4chart', 'p5chart', 'p6map', 'p6time', 'p7map'].forEach(function (id) {
    onResize($(id), function () { if (S.eod && EG) renderCandidatesLive(); });
  });


  /* ================= learning path ================= */
  var LKEY = 'sthiti.learn.v1';
  var learn = { done: {} };
  try { var saved = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (saved && saved.done) learn = saved; } catch (_) { }
  function saveLearn() { try { localStorage.setItem(LKEY, JSON.stringify(learn)); } catch (_) { } }
  function allModules() { return (window.CURRICULUM || []).reduce(function (a, st) { return a.concat(st.modules.map(function (m) { return { m: m, st: st }; })); }, []); }
  function lessonNumber(id) { var all = allModules(); for (var i = 0; i < all.length; i++) if (all[i].m.id === id) return i + 1; return 0; }
  function nextModule() {
    var all = allModules();
    for (var i = 0; i < all.length; i++) if (!learn.done[all[i].m.id]) return all[i].m;
    return all[all.length - 1].m;
  }

  function renderStageCards(el, link) {
    if (!el) return;
    el.innerHTML = (window.CURRICULUM || []).map(function (st) {
      var done = st.modules.filter(function (m) { return learn.done[m.id]; }).length;
      return '<a class="stage-card" href="#learn/l-' + st.modules[0].id + '">' +
        '<span class="meta">Stage ' + st.stage + ' · ' + st.mins + ' min</span>' +
        '<b>' + esc(st.name) + '</b><p>' + esc(st.blurb) + '</p>' +
        '<span class="meta">' + done + ' of ' + st.modules.length + ' done</span>' +
        '<span class="bar"><span style="width:' + (done / st.modules.length * 100) + '%"></span></span></a>';
    }).join('');
  }

  function renderProgress() {
    var all = allModules(), done = all.filter(function (x) { return learn.done[x.m.id]; }).length;
    if ($('lpDone')) $('lpDone').innerHTML = done + '<small>of ' + all.length + ' lessons</small>';
    if ($('lpFill')) $('lpFill').style.width = (done / all.length * 100) + '%';
    var nx = nextModule(), label = done ? 'Continue: lesson ' + lessonNumber(nx.id) : 'Start with lesson 1';
    ['lpContinue', 'homeContinue'].forEach(function (id) {
      var a = $(id);
      if (!a) return;
      a.setAttribute('href', '#learn/l-' + nx.id);
      a.innerHTML = label + ' <span aria-hidden="true">→</span>';
    });
    renderStageCards($('stageCards'));
    renderStageCards($('homeStages'));
    document.querySelectorAll('.les').forEach(function (d) { d.classList.toggle('done', !!learn.done[d.id.slice(2)]); });
    document.querySelectorAll('.les .tag').forEach(function (t) {
      var id = t.closest('.les').id.slice(2);
      t.textContent = learn.done[id] ? '✓ done' : t.dataset.mins + ' min';
    });
  }

  function renderCurriculum() {
    var host = $('curriculum');
    if (!host || !window.CURRICULUM) return;
    var n = 0;
    host.innerHTML = window.CURRICULUM.map(function (st) {
      var lessons = st.modules.map(function (m) {
        n++;
        return '<details class="les" id="l-' + m.id + '">' +
          '<summary><span class="num">' + n + '</span>' +
          '<span><span class="ttl">' + esc(m.title) + '</span><span class="can">' + esc(m.can) + '</span></span>' +
          '<span class="tag" data-mins="' + m.mins + '">' + m.mins + ' min</span></summary>' +
          '<div class="les-body">' +
          m.body.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
          '<div class="terms">' + m.terms.map(function (t) { return '<span class="term"><b>' + esc(t[0]) + '</b><span>' + esc(t[1]) + '</span></span>'; }).join('') + '</div>' +
          '<div class="check" data-module="' + m.id + '"><span class="mono-label">Check yourself</span>' +
          m.quiz.map(function (q, qi) {
            return '<div class="check-item" data-q="' + qi + '"><p class="check-q">' + esc(q.q) + '</p>' +
              '<div class="quiz-opts">' + q.opts.map(function (o, oi) { return '<button type="button" class="opt" data-opt="' + oi + '">' + esc(o) + '</button>'; }).join('') + '</div>' +
              '<p class="check-why" aria-live="polite"></p></div>';
          }).join('') + '</div>' +
          '<div class="les-foot">' +
          '<a class="btn btn-ghost btn-sm practise" href="' + m.practise.href + '">' + esc(m.practise.label) + ' →</a>' +
          '<button type="button" class="chipbtn mark" data-module="' + m.id + '">Mark as done</button>' +
          '</div></div></details>';
      }).join('');
      var done = st.modules.filter(function (m) { return learn.done[m.id]; }).length;
      return '<div class="stage-head" id="stage' + st.stage + '"><h2>Stage ' + st.stage + ' · ' + esc(st.name) + '</h2>' +
        '<span class="meta">' + done + ' of ' + st.modules.length + ' done · about ' + st.mins + ' minutes</span></div>' +
        '<p class="stage-blurb">' + esc(st.blurb) + '</p>' + lessons;
    }).join('');

    host.addEventListener('click', function (e) {
      var opt = e.target.closest('.opt');
      if (opt) {
        var item = opt.closest('.check-item'), check = opt.closest('.check');
        if (item.dataset.answered) return;
        item.dataset.answered = '1';
        var mod = allModules().filter(function (x) { return x.m.id === check.dataset.module; })[0].m;
        var q = mod.quiz[+item.dataset.q], chosen = +opt.dataset.opt, ok = chosen === q.a;
        item.querySelectorAll('.opt').forEach(function (b, i) {
          b.disabled = true;
          if (i === q.a) { b.classList.add('right'); b.textContent = '✓ ' + b.textContent; }
          else if (i === chosen) { b.classList.add('wrong'); b.textContent = '✕ ' + b.textContent; }
        });
        item.querySelector('.check-why').innerHTML = '<b>' + (ok ? 'Correct.' : 'Not quite.') + '</b> ' + esc(q.why);
        return;
      }
      var mark = e.target.closest('.mark');
      if (mark) {
        var id = mark.dataset.module;
        learn.done[id] = !learn.done[id];
        mark.textContent = learn.done[id] ? 'Done ✓' : 'Mark as done';
        saveLearn();
        renderProgress();
        renderCurriculumHeads();
      }
    });
    document.querySelectorAll('.les .mark').forEach(function (b) { if (learn.done[b.dataset.module]) b.textContent = 'Done ✓'; });
  }
  function renderCurriculumHeads() {
    (window.CURRICULUM || []).forEach(function (st) {
      var head = $('stage' + st.stage);
      if (!head) return;
      var done = st.modules.filter(function (m) { return learn.done[m.id]; }).length;
      head.querySelector('.meta').textContent = done + ' of ' + st.modules.length + ' done · about ' + st.mins + ' minutes';
    });
  }
  if ($('lpReset')) $('lpReset').addEventListener('click', function () {
    learn = { done: {} };
    saveLearn();
    document.querySelectorAll('.les .mark').forEach(function (b) { b.textContent = 'Mark as done'; });
    renderProgress(); renderCurriculumHeads();
  });

  /* tools get the stage they belong to, and a line of plain English */
  var TOOL_LEVELS = {
    't-screen': [1, 'What a company’s numbers mean, one tap at a time.'],
    't-chart': [2, 'Read a price chart, its trend line and its momentum.'],
    't-mood': [1, 'What the whole market did today, in one reading.'],
    't-position': [2, 'Work out how many shares to buy before you buy them.'],
    't-options': [3, 'See what an option trade pays before you place it.'],
    't-scanner': [2, 'Find the stocks doing the things you have just learned.'],
    't-topo': [3, 'Rank stocks by how independently they move.'],
    't-backtest': [3, 'Test a rule, and split the result by the market’s state.'],
    't-portfolio': [3, 'Check your own holdings for concentration a sector list hides.'],
    't-paper': [2, 'Practise with virtual money, then read your own habits.'],
  };
  var LESSON_FOR_TOOL = { 't-screen': 'b3', 't-chart': 'm2', 't-mood': 'b4', 't-position': 'm3', 't-options': 'a1', 't-scanner': 'm1', 't-topo': 'a3', 't-backtest': 'a3', 't-portfolio': 'a3', 't-paper': 'm4' };
  function decorateTools() {
    Object.keys(TOOL_LEVELS).forEach(function (id) {
      var sec = $(id);
      if (!sec || sec.dataset.decorated) return;
      sec.dataset.decorated = '1';
      var level = TOOL_LEVELS[id][0], plain = TOOL_LEVELS[id][1];
      var label = sec.querySelector('.tool-head .mono-label');
      if (label) label.insertAdjacentHTML('afterend', ' <span class="level-badge">Stage ' + level + '</span>');
      var intro = sec.querySelector('.tool-intro');
      if (intro) intro.insertAdjacentHTML('beforebegin', '<p class="tool-plain"><b>In plain words:</b> ' + esc(plain) + ' <a href="#learn/l-' + LESSON_FOR_TOOL[id] + '" class="practise">Read the lesson first →</a></p>');
    });
  }

  /* ================= router ================= */
  var PAGES = ['home', 'learn', 'tools', 'engine', 'research'];
  function route() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, '')), parts = h.split('/'), page = 'home', target = null;
    if (PAGES.indexOf(parts[0]) >= 0) { page = parts[0]; if (parts[1]) target = document.getElementById(parts[1]); }
    else if (parts[0]) { target = document.getElementById(parts[0]); var pg = target && target.closest('[data-page]'); if (pg) page = pg.dataset.page; else target = null; }
    document.querySelectorAll('[data-page]').forEach(function (el) { el.hidden = el.dataset.page !== page; });
    document.querySelectorAll('.nav a').forEach(function (a) { if (a.dataset.route === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    currentPage = page;
    if (page === 'tools') { renderPaper(); }
    if (target) requestAnimationFrame(function () { moScroll(target); }); else moScroll(null);
  }
  window.addEventListener('hashchange', route);

  /* ================= boot ================= */
  function applyLive(body) {
    S.live = body;
    S.errors = (body.errors || []).slice();
    window.dispatchEvent(new CustomEvent('sthiti:live', { detail: body }));
    renderStatus();
    updateHomeLive();
    var lm = liveMood();
    if (lm) moodLive = lm;
    if (moodLive) renderMood();
    srcLine('moodSrc', 'NSE breadth and India VIX ' + (marketOpen() ? 'live' : 'at close') + (S.live.flows && S.live.flows.fii ? ' · FII/DII ' + S.live.flows.fii.date : ''), marketOpen());
  }
  function applyQuotes(body) {
    S.quotes = body;
    if (body.errors && body.errors.length) S.errors = S.errors.concat(body.errors.slice(0, 1));
    if (S.eod) { renderScreener(); renderLesson(); renderScore(); renderPaper(); renderRSIChart(); }
    renderStatus();
  }
  function applyOptions(body) {
    S.opt = body && body.strikes ? body : null;
    if (!S.opt) { srcLine('optSrc', 'option chain unavailable', false); return; }
    $('optHead').textContent = 'NIFTY options · expiry ' + S.opt.expiry;
    srcLine('optSrc', S.opt.source === 'live' ? 'NSE option chain · ' + (S.opt.timestamp || 'live') : 'NSE F&O close · ' + (S.opt.timestamp || ''), S.opt.source === 'live');
    updateOptions();
  }
  function loadEod() {
    return getJson('/api/eod').then(function (r) {
      if (r.status === 202 || (r.body && r.body.building)) {
        var p = r.body.total ? Math.round(r.body.done / r.body.total * 100) : 0;
        $('stEod').innerHTML = 'Downloading a year of NSE end-of-day files… <b>' + (r.body.done || 0) + '/' + (r.body.total || '?') + '</b>';
        return new Promise(function (res) { setTimeout(function () { res(loadEod()); }, 2000); });
      }
      S.eod = r.body;
      chartSym = chartSym || Object.keys(S.eod.stocks)[0];
      sel.sym = sel.sym || chartSym;
      fillStockSelects();
      $('chartStock').value = chartSym;
      renderScreener(); renderLesson(); renderScore();
      renderRSIChart();
      loadPosStock(); renderPos();
      renderScanner();
      renderTopo();
      $('btStrat').innerHTML = Object.keys(S.eod.backtests).map(function (k) { return '<option value="' + k + '">' + esc(S.eod.backtests[k].name) + '</option>'; }).join('');
      renderBacktest();
      renderAskSuggestions();
      renderCandStatus();
      $('pfText').value = $('pfText').value || PF_EXAMPLE;
      buildEngine(); resizeFig();
      renderCandidatesLive();
      renderPaper(); renderLog(); renderDiag();
      renderStatus();
      updateHomeLive();
      var key = EG ? regimeOf(EG.series[EG.series.length - 1].rho) : null;
      if (key) { $('scanRegime').textContent = REG[key].name; $('scanRegimeNote').textContent = REG[key].note; }
      return S.eod;
    });
  }
  $('chartStock').addEventListener('change', function () { chartSym = $('chartStock').value; renderRSIChart(); });

  function poll() {
    Promise.all([
      getJson('/api/live').then(function (r) { applyLive(r.body); }).catch(function () { }),
      getJson('/api/quotes').then(function (r) { applyQuotes(r.body); }).catch(function () { }),
      getJson('/api/options').then(function (r) { applyOptions(r.body); }).catch(function () { }),
    ]).then(function () {
      var open = marketOpen();
      setTimeout(poll, S.errors.length ? 15000 : open ? 30000 : 60000);
    });
  }

  readColors();
  renderCurriculum();
  renderProgress();
  decorateTools();
  if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', function () { readColors(); if (fig.ph) drawFig(); }); }
  route();
  getJson('/api/live').then(function (r) { applyLive(r.body); }).then(loadEod).then(function () {
    return Promise.all([getJson('/api/quotes').then(function (r) { applyQuotes(r.body); }), getJson('/api/options').then(function (r) { applyOptions(r.body); })]);
  }).then(function () { setTimeout(poll, 20000); }).catch(function (e) {
    S.errors = [String(e && e.message || e)];
    renderStatus();
  });
})();
