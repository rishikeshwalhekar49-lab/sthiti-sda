# Sthiti v2: the unified stack

Sthiti rebuilt on the shared stack (Project 2). The original app in `../public`, `../lib` and
`../server.js` is untouched and still runs on its own. This folder is a separate copy with the
same pages, text, numbers and features.

| Layer | Original | v2 |
|---|---|---|
| Frontend | Hand-written JS (`public/app.js`) | React 19 + Vite 8 |
| Motion | GSAP + Lenis from `public/vendor`, hand-rolled effects | GSAP 3.15 with `@gsap/react`, Lenis 1.3, React Bits components |
| Backend | Node `server.js` + `lib/` | Python 3.14, FastAPI, Pydantic, HTTPX, numpy |
| Live updates | Polling every 15–60 s | Server-sent events on `/api/stream`; the option chain is still polled |
| "Ask the engine" | Claude only | Claude, Groq, Gemini, DeepSeek or OpenRouter, whichever is configured |
| Install | — | PWA: web manifest, icons and a service worker |
| Tests | — | pytest: route tests, plus parity tests against the original `lib/` |

## Layout

```
v2/
  backend/            FastAPI app (sthiti/), tests/, its own copy of the NSE/BSE cache (cache/)
  frontend/           React app (src/), static PWA files (public/)
  tools/              html2jsx.py, fill_markup.py: copy the original markup into the components
```

## Run it

Backend (first time: create the virtualenv):

```bash
cd v2/backend && python3.14 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
cd v2/backend && .venv/bin/uvicorn sthiti.app:app --port 8000 --timeout-keep-alive 65
```

Frontend: build it once, and the backend serves it at http://localhost:8000.

```bash
cd v2/frontend && npm install && npm run build
```

For development with hot reload, run `npm run dev` instead and open http://localhost:5173. Vite
proxies `/api` to the backend on port 8000. The service worker is only registered in production
builds.

`.claude/launch.json` has entries for all three servers: `sthiti` (the original, port 3000),
`sthiti-v2-api` (8000) and `sthiti-v2-web` (5173).

## Configuration

All keys are read from the environment only. Nothing is stored in the code.

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude for "Ask the engine" (model `claude-opus-5-5`, with server-side fallback on) |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY` | The other providers |
| `GROQ_MODEL`, `GEMINI_MODEL`, `DEEPSEEK_MODEL`, `OPENROUTER_MODEL` | Override each provider's default model |
| `LLM_ORDER` | Order to try providers in. Default `claude,groq,gemini,deepseek,openrouter`; providers without a key are skipped |
| `STHITI_CACHE` | Where downloaded exchange files are kept (default `backend/cache`) |
| `STHITI_DIST` | Where the built frontend is served from (default `frontend/dist`) |

With no key set, "Ask the engine" still answers from the engine's numbers, as the original did.
When one provider fails, the next is tried; the answer says which one wrote it.

## Tests

```bash
cd v2/backend && .venv/bin/python -m pytest
```

There are 23 tests. `tests/parity/dump.js` runs the original `lib/` on the cached data and writes
`fixtures.json`; `test_parity.py` checks the Python port against it (tolerance 1e-9).
`test_api.py` checks every route offline and checks the provider fallback order.

## How the original content is kept

Components do not retype the original markup. Each one marks where it belongs:

```jsx
// @markup #p4
//   slot p4table children {table}
<>@MARKUP@</>
```

`tools/fill_markup.py` replaces that block with the element from `public/index.html`, converted to
JSX. Only the parts `app.js` used to write by id are rendered by React. The directive comments
explain the slot kinds (`children`, `replace`, `attrs`, `fallback`, `prepend`, and `wrap`).

Verified against the original running side by side at the same viewport:

- **Learn and Engine pages:** rendered text identical at 1200 px. The Engine page is also identical at 375 px, before and after running the gate, the benchmark, Ask and the 2020 replay.
- **Home page:** identical apart from live prices.
- **Tools page:** identical apart from live prices, practice trades saved in each browser, and the original's hidden native `<select>` options, which appear in `innerText`.
- **Engine charts:** six of seven are element-for-element identical. The calibration chart differs only in the 14th digit; see below.
- **Interactions:** FIG. 1 tooltips, slider readouts, Play, episode replays and in-page scroll positions all match.
- **Backend output:** `/api/eod` agrees to about 15 significant digits. numpy sums in a different order from the original's loops, so the last bit differs in some values; every displayed figure is the same.

## Deliberate differences

- **Ask hint:** the "no key" hint names the five provider keys instead of `npm install @anthropic-ai/sdk`, which does not apply to a Python backend.
- **Ask attribution:** an answer from a provider other than Claude is labelled with that provider and its model.
- **Scroll fix:** Lenis 1.3 subtracts CSS `scroll-margin-top` when scrolling to an element, and the original's Lenis 1.1 did not. `MotionProvider.scrollTo` adds it back, so jumps land where they did before.
- **Offline behaviour:** the service worker caches only the app shell and the hashed build files. `/api/*` is never cached, so no stale market number is ever shown as live.

## Third-party code

`frontend/src/motion/reactbits/` contains components from React Bits (https://reactbits.dev):
SplitText, CountUp, AnimatedContent, SpotlightCard and LogoLoop. Each file lists its small
adaptations at the top. They are licensed MIT + Commons Clause (see `LICENSE.md` in that folder).
Using them inside an app is allowed, but selling the components themselves is not.
