// Formatting helpers, unchanged from the original public/app.js so every displayed
// figure is produced by the same code.

export function nIN(v, d) { d = d || 0; return Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }); }
export function inr(v, d) { return (v < 0 ? '−' : '') + '₹' + nIN(Math.abs(v), d); }
export function sInr(v, d) { return (v > 0 ? '+' : v < 0 ? '−' : '') + '₹' + nIN(Math.abs(v), d); }
export function sNum(v, d) { return (v > 0 ? '+' : v < 0 ? '−' : '') + nIN(Math.abs(v), d); }
export function sPct(v, d) { d = d == null ? 2 : d; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%'; }
export function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
export function mean(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
export function list(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
export function f(v, d) { return Number(v).toFixed(d); }
export function niceTicks(a, b, n) { var span = b - a; if (span <= 0) return [a]; var raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag, step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag, t = []; for (var v = Math.ceil(a / step) * step; v <= b + step * 1e-6; v += step) t.push(Math.round(v / step) * step); return t; }
export function shortInr(v) { var a = Math.abs(v), s = v < 0 ? '−' : ''; if (a >= 1e7) return s + '₹' + (a / 1e7).toFixed(1) + 'Cr'; if (a >= 1e5) return s + '₹' + (a / 1e5).toFixed(a >= 1e6 ? 0 : 1) + 'L'; if (a >= 1e3) return s + '₹' + Math.round(a / 1e3) + 'k'; return s + '₹' + Math.round(a); }
export function istToday() { var d = new Date(Date.now() + 5.5 * 3600e3); return d.toISOString().slice(0, 10); }
export function fmtDate(iso) { var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; var p = iso.split('-'); return +p[2] + ' ' + M[+p[1] - 1] + (p[0] !== String(new Date().getUTCFullYear()) ? " '" + p[0].slice(2) : ''); }
export function timeIST(ms) { return new Date(ms + 5.5 * 3600e3).toISOString().slice(11, 19) + ' IST'; }
export const PILL = { pass: '✓ Pass', watch: '! Watch', flag: '✕ Flag', na: '– N/A' };
export function svgX(svg, W, ev) { var r = svg.getBoundingClientRect(); return (ev.clientX - r.left) * (W / r.width); }
export function placeTip(tip, host, cx, cy) { var hr = host.getBoundingClientRect(), x = cx - hr.left + 14, y = cy - hr.top + 14, tw = tip.offsetWidth, th = tip.offsetHeight; if (x + tw > hr.width - 4) x = cx - hr.left - tw - 14; if (y + th > hr.height) y = cy - hr.top - th - 12; tip.style.transform = 'translate(' + Math.max(0, x) + 'px,' + Math.max(0, y) + 'px)'; }
