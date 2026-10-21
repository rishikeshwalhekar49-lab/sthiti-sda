/* Sthiti · motion layer
 *
 * Presentation only. GSAP drives the tweens, Lenis the scrolling, and the named
 * effects below are vanilla ports of the React Bits components (CountUp,
 * SplitText, AnimatedContent, SpotlightCard, Marquee, ScrollProgress, plus
 * press ripples, a sliding tab indicator, page transitions, an animated
 * listbox over each <select>, slider bubbles and smooth disclosures) — the
 * site has no React and no build step, and React Bits is a copy-in gallery
 * rather than a runtime dependency, so the effects come across directly.
 *
 * Nothing here reads or writes market state. Two contracts with app.js:
 *   · it listens for the `sthiti:live` event to fill the ticker,
 *   · it exposes window.Motion.scrollTo() so the router scrolls through Lenis.
 * If this file fails to load, or the reader prefers reduced motion, the CSS
 * hidden states never switch on and the site renders exactly as before.
 */
(function () {
  'use strict';

  var gsap = window.gsap, ST = window.ScrollTrigger, Lenis = window.Lenis;
  var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var live = !!(gsap && ST && Lenis) && !reduced;

  /* No libraries, or motion declined: hand the router a native fallback and stop. */
  if (!live) {
    window.Motion = {
      active: false,
      scrollTo: function (t) {
        if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start' });
        else window.scrollTo(0, 0);
      },
      refresh: function () { },
    };
    return;
  }

  gsap.registerPlugin(ST);
  var root = document.documentElement;
  root.classList.add('motion-on');

  var EASE = 'power3.out';
  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* Interactive effects only animate when GSAP's clock is demonstrably running;
     otherwise they jump straight to their end state, so a stalled clock can
     never leave a menu invisible or a page half-faded. */
  function animOK() { return !root.classList.contains('mo-settled') && gsap.ticker.frame > 0; }

  /* ================= Lenis: smooth scroll ================= */

  var lenis = new Lenis({
    duration: 1.05,
    easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
    smoothWheel: true,
    touchMultiplier: 1.6,
  });

  /* One clock for both libraries, so a tween and the scroll never tear. */
  lenis.on('scroll', ST.update);
  gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);

  window.Motion = {
    active: true,
    scrollTo: function (target) {
      if (target) lenis.scrollTo(target, { offset: -84, duration: 0.9 });
      else lenis.scrollTo(0, { immediate: true });
    },
    refresh: function () { lenis.resize(); ST.refresh(); },
  };

  /* ================= ScrollProgress ================= */

  var prog = document.createElement('div');
  prog.className = 'mo-progress';
  prog.setAttribute('aria-hidden', 'true');
  document.body.appendChild(prog);
  gsap.to(prog, {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
  });

  /* ================= AnimatedContent: scroll reveals ================= */

  /* Tag rather than hand-edit 1,100 lines of markup: the hidden state is a
   * class this file adds, so it can never strand content if the file is gone. */
  function prep(els) {
    return els.filter(function (el) {
      if (!el || el.dataset.moReveal) return false;
      el.dataset.moReveal = '1';
      return true;
    });
  }

  function seq(trigger, els, opts) {
    els = prep(els);
    if (!els.length) return;
    gsap.set(els, { opacity: 0, y: (opts && opts.y) || 18 });
    /* `amount` spreads the whole stagger over a fixed span rather than paying
       per item, so a 16-card grid does not crawl in behind the reader. */
    var each = (opts && opts.stagger) || 0.07;
    gsap.to(els, {
      opacity: 1,
      y: 0,
      duration: 0.62,
      ease: EASE,
      stagger: { amount: Math.min(each * els.length, 0.5) },
      scrollTrigger: {
        trigger: trigger,
        start: (opts && opts.start) || 'top 82%',
        once: true,
      },
    });
  }

  var GROUPS = '.layers, .pairs, .feat-grid, .stage-cards, .cards, .gap-grid, .cand-grid, .pillars, .bridge-rows';

  /* A section reads label → heading → intro → its grid, in that order. */
  function revealSection(sec) {
    var items = [];
    var label = sec.querySelector(':scope > .sec-label');
    if (label) items.push(label);
    /* .sec-label is itself a div and comes first, so skip past it. */
    var body = sec.querySelector(':scope > div:not(.sec-label)') || sec;
    all(':scope > h2, :scope > h3, :scope > p.intro, :scope > p.lede', body).forEach(function (el) { items.push(el); });
    var grids = all(GROUPS, body);
    if (grids.length) {
      grids.forEach(function (g) { all(':scope > *', g).forEach(function (c) { items.push(c); }); });
    } else {
      all(':scope > *', body).forEach(function (el) {
        if (items.indexOf(el) < 0 && !el.matches('h2, h3, p.intro, p.lede')) items.push(el);
      });
    }
    seq(sec, items);
  }

  function revealTool(tool) {
    var items = [];
    ['.tool-head', '.tool-plain', '.tool-intro', '.panel'].forEach(function (sel) {
      var el = tool.querySelector(sel);
      if (el) items.push(el);
    });
    seq(tool, items, { stagger: 0.08 });
  }

  /* ================= SplitText: the hero headline ================= */

  function splitWords(el) {
    if (!el || el.dataset.moSplit) return [];
    var text = el.textContent;
    el.dataset.moSplit = '1';
    el.textContent = '';
    var frag = document.createDocumentFragment();
    var out = [];
    text.split(/(\s+)/).forEach(function (chunk) {
      if (!chunk) return;
      if (/^\s+$/.test(chunk)) { frag.appendChild(document.createTextNode(chunk)); return; }
      var mask = document.createElement('span');
      mask.className = 'mo-word';
      var inner = document.createElement('span');
      inner.className = 'mo-word-in';
      inner.textContent = chunk;
      mask.appendChild(inner);
      frag.appendChild(mask);
      out.push(inner);
    });
    el.appendChild(frag);
    return out;
  }

  function heroIn() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    var h1 = hero.querySelector('h1');
    var words = splitWords(h1);
    var rest = prep([
      hero.querySelector('.eyebrow'),
      hero.querySelector('.lede'),
      hero.querySelector('.cta-row'),
      hero.querySelector('.name-note'),
      hero.querySelector('.state'),
    ].filter(Boolean));

    var tl = gsap.timeline({ delay: 0.08 });
    if (words.length) {
      gsap.set(words, { yPercent: 108 });
      tl.to(words, { yPercent: 0, duration: 0.78, ease: 'power4.out', stagger: 0.045 });
    }
    if (rest.length) {
      gsap.set(rest, { opacity: 0, y: 16 });
      tl.to(rest, { opacity: 1, y: 0, duration: 0.6, ease: EASE, stagger: 0.075 }, words.length ? 0.22 : 0);
    }

    /* The weather card sits above the hero and is the first thing read. */
    var w = document.querySelector('.weather-wrap');
    if (w && !w.dataset.moReveal) {
      w.dataset.moReveal = '1';
      gsap.from(w, { opacity: 0, y: -10, duration: 0.5, ease: EASE });
    }
  }

  /* ================= CountUp, plus a flash on later updates ================= */

  var NUM = /-?−?₹?\s?[\d,]*\d(?:\.\d+)?/;

  function fmtLike(sample, value) {
    var dec = (sample.split('.')[1] || '').length;
    var body = sample.indexOf(',') >= 0
      ? Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
      : Math.abs(value).toFixed(dec);
    return (value < 0 ? '−' : '') + body;
  }

  /* Animates the first number in the element and restores the exact markup
   * app.js wrote on completion, so no displayed value is ever invented. */
  function countUp(el) {
    var finalHtml = el.innerHTML;
    var m = el.textContent.match(NUM);
    if (!m) return;
    var token = m[0];
    var digits = token.replace(/[^\d.]/g, '');
    var target = parseFloat(digits);
    if (!isFinite(target) || !digits) return;
    var neg = /[-−]/.test(token);
    if (neg) target = -target;
    var prefix = el.textContent.slice(0, m.index);
    var suffix = el.textContent.slice(m.index + token.length);
    var sample = token.replace(/[^\d.,]/g, '');
    var currency = token.indexOf('₹') >= 0 ? (neg ? '−₹' : '₹') : '';

    var state = { v: target * (Math.abs(target) > 0 ? 0.82 : 0) };
    el.dataset.moBusy = '1';
    gsap.to(state, {
      v: target,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: function () {
        el.textContent = prefix.replace(/[₹\-−\s]*$/, '') + currency + fmtLike(sample, state.v).replace(/^−/, currency ? '' : '−') + suffix;
      },
      onComplete: function () {
        delete el.dataset.moBusy;
        el.innerHTML = finalHtml;
      },
    });
  }

  function flash(el) {
    gsap.fromTo(el, { backgroundColor: 'var(--h0-wash)' }, { backgroundColor: 'rgba(0,0,0,0)', duration: 0.9, ease: 'power2.out', clearProps: 'backgroundColor' });
  }

  function watchCounters() {
    all('[data-countup]').forEach(function (el) {
      var obs = new MutationObserver(function () {
        if (el.dataset.moBusy) return;
        var txt = el.textContent.trim();
        if (!txt || txt === '—') return;
        if (el.dataset.moCounted) { flash(el); return; }
        el.dataset.moCounted = '1';
        countUp(el);
      });
      obs.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  /* Bars arrive as SVG rects with a final width; grow them from nothing once. */
  function watchBars() {
    var svg = $('hsBars');
    if (!svg) return;
    var obs = new MutationObserver(function () {
      if (svg.dataset.moDrawn) return;
      var rects = all('rect', svg);
      if (!rects.length) return;
      svg.dataset.moDrawn = '1';
      rects.forEach(function (r) {
        var w = r.getAttribute('width');
        gsap.fromTo(r, { attr: { width: 0 } }, { attr: { width: w }, duration: 0.7, ease: EASE, delay: 0.05 * all('rect', svg).indexOf(r) });
      });
    });
    obs.observe(svg, { childList: true });
  }

  /* ================= SpotlightCard ================= */

  var SPOT = '.layer, .feat, .stage-card, .cand, .gap, .weather';

  document.addEventListener('pointermove', function (e) {
    var card = e.target.closest && e.target.closest(SPOT);
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    card.classList.add('mo-spot');
  }, { passive: true });

  document.addEventListener('pointerleave', function (e) {
    var card = e.target.closest && e.target.closest(SPOT);
    if (card) card.classList.remove('mo-spot');
  }, true);

  /* ================= Marquee: the index ticker ================= */

  function tickerCell(name, q) {
    var pct = typeof q.pct === 'number' ? q.pct : null;
    var cls = pct === null ? '' : pct >= 0 ? 'pos' : 'neg';
    var val = typeof q.last === 'number' ? q.last.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
    var sign = pct === null ? '' : (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(2) + '%';
    return '<span class="mo-cell"><span class="mo-cell-n">' + name + '</span><span class="mo-cell-v">' + val + '</span>'
      + (sign ? '<span class="mo-cell-p ' + cls + '">' + sign + '</span>' : '') + '</span>';
  }

  var tickerTween = null;

  function buildTicker(body) {
    var host = $('ticker');
    if (!host || !body || !body.indices) return;
    var order = ['NIFTY 50', 'NIFTY BANK', 'NIFTY 500', 'INDIA VIX', 'NIFTY IT', 'NIFTY AUTO', 'NIFTY PHARMA', 'NIFTY FMCG', 'NIFTY METAL', 'NIFTY REALTY', 'NIFTY ENERGY'];
    var cells = order
      .filter(function (k) { return body.indices[k]; })
      .map(function (k) { return tickerCell(k.replace(/^NIFTY /, '').replace('INDIA VIX', 'INDIA VIX'), body.indices[k]); });
    if (cells.length < 3) return;

    var run = cells.join('');
    host.hidden = false;
    host.innerHTML = '<div class="mo-track"><div class="mo-run">' + run + '</div><div class="mo-run" aria-hidden="true">' + run + '</div></div>';

    var trackRun = host.querySelector('.mo-run');
    var width = trackRun.getBoundingClientRect().width;
    if (tickerTween) tickerTween.kill();
    if (!width) return;
    tickerTween = gsap.fromTo(host.querySelector('.mo-track'),
      { x: 0 },
      { x: -width, duration: width / 42, ease: 'none', repeat: -1 });

    host.onpointerenter = function () { if (tickerTween) tickerTween.timeScale(0.15); };
    host.onpointerleave = function () { if (tickerTween) tickerTween.timeScale(1); };
  }

  window.addEventListener('sthiti:live', function (e) { buildTicker(e.detail); });

  /* ================= route changes ================= */

  /* Pages are toggled with [hidden], so the document height jumps and every
   * trigger position is stale; reveal whatever is now on screen and re-measure. */
  function enterPage(initial) {
    var page = document.querySelector('[data-page]:not([hidden])');
    if (!page) return;
    if (!page.dataset.moEntered) {
      page.dataset.moEntered = '1';
      all('.sec', page).forEach(revealSection);
      all('.tool', page).forEach(revealTool);
      if (page.dataset.page === 'home') heroIn();
      else {
        var head = page.querySelector('.hero, .page-head');
        if (head) {
          var items = prep(all(':scope > *, .hero-grid > *', head));
          if (items.length) {
            gsap.set(items, { opacity: 0, y: 16 });
            gsap.to(items, { opacity: 1, y: 0, duration: 0.6, ease: EASE, stagger: 0.07 });
          }
        }
      }
    }
    /* Pages left mid-transition keep inline opacity/transform; clear them. */
    all('[data-page][hidden]').forEach(function (p) { gsap.set(p, { clearProps: 'opacity,transform' }); });
    if (!initial && animOK()) {
      gsap.fromTo(page, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.48, ease: 'power3.out', clearProps: 'opacity,transform' });
    } else {
      gsap.set(page, { clearProps: 'opacity,transform' });
    }
    moveNavInk(initial);
    all('select:not([data-mo-dd])', page).forEach(enhanceSelect);
    all('input[type=range]:not([data-mo-range])', page).forEach(enhanceRange);
    requestAnimationFrame(function () { lenis.resize(); ST.refresh(); });
  }

  window.addEventListener('hashchange', function () { requestAnimationFrame(function () { enterPage(false); }); });

  /* ================= touch: press + ripple ================= */

  /* Everything tappable sinks slightly on press and springs back on release,
     with an ink ripple from the exact touch point. Keyboard activation gets
     the same ripple from the centre. */
  var PRESS = '.btn, .chipbtn, .opt, .play, .nav a, .brand, button, summary, .layer, .feat, .stage-card, .cand, .weather, .state-row';
  var pressed = null;

  function pressScale(el) {
    if (el.matches('summary')) return 0.995;
    if (el.matches('.layer, .feat, .stage-card, .cand, .weather, .state-row')) return 0.985;
    if (el.matches('.nav a, .brand')) return 0.94;
    return 0.95;
  }

  function ripple(host, x, y) {
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var ink = host.querySelector(':scope > .mo-ink');
    if (!ink) {
      ink = document.createElement('span');
      ink.className = 'mo-ink';
      ink.setAttribute('aria-hidden', 'true');
      host.appendChild(ink);
    }
    var r = host.getBoundingClientRect();
    var size = 2 * Math.hypot(Math.max(x - r.left, r.right - x), Math.max(y - r.top, r.bottom - y));
    var dot = document.createElement('span');
    dot.className = 'mo-ink-dot';
    dot.style.width = dot.style.height = size + 'px';
    dot.style.left = (x - r.left - size / 2) + 'px';
    dot.style.top = (y - r.top - size / 2) + 'px';
    ink.appendChild(dot);
    gsap.fromTo(dot, { scale: 0, opacity: 0.3 }, {
      scale: 1, opacity: 0, duration: 0.65, ease: 'power2.out',
      onComplete: function () { if (dot.parentNode) dot.parentNode.removeChild(dot); },
    });
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.button > 0 || !animOK()) return;
    var host = e.target.closest && e.target.closest(PRESS);
    if (!host || host.disabled) return;
    pressed = host;
    gsap.to(host, { scale: pressScale(host), duration: 0.12, ease: 'power2.out', overwrite: 'auto' });
    ripple(host, e.clientX, e.clientY);
  }, { passive: true });

  function release() {
    if (!pressed) return;
    gsap.to(pressed, { scale: 1, duration: 0.55, ease: 'elastic.out(1, 0.45)', overwrite: 'auto', clearProps: 'transform' });
    pressed = null;
  }
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });

  document.addEventListener('click', function (e) {
    if (e.detail !== 0 || !animOK()) return;          /* keyboard or scripted click */
    var host = e.target.closest && e.target.closest(PRESS);
    if (!host) return;
    var r = host.getBoundingClientRect();
    ripple(host, r.left + r.width / 2, r.top + r.height / 2);
  }, true);

  /* ================= tabs: sliding indicator + page transitions ================= */

  var nav = document.querySelector('.nav'), navInk = null, inkAt = null;
  if (nav) {
    navInk = document.createElement('span');
    navInk.className = 'mo-nav-ink';
    navInk.setAttribute('aria-hidden', 'true');
    nav.appendChild(navInk);
  }

  /* The underline stretches across both tabs, then contracts onto the new one. */
  function moveNavInk(instant) {
    if (!navInk) return;
    var a = nav.querySelector('a[aria-current="page"]');
    if (!a) { gsap.set(navInk, { opacity: 0 }); inkAt = null; return; }
    var to = { x: a.offsetLeft, w: a.offsetWidth };
    if (instant || !inkAt || !animOK()) {
      gsap.killTweensOf(navInk);
      gsap.set(navInk, { x: to.x, width: to.w, opacity: 1 });
      inkAt = to;
      return;
    }
    var from = inkAt;
    inkAt = to;
    if (from.x === to.x && from.w === to.w) return;
    var left = Math.min(from.x, to.x), right = Math.max(from.x + from.w, to.x + to.w);
    gsap.killTweensOf(navInk);
    gsap.timeline()
      .to(navInk, { x: left, width: right - left, opacity: 1, duration: 0.18, ease: 'power2.in' })
      .to(navInk, { x: to.x, width: to.w, duration: 0.5, ease: 'expo.out' });
  }

  function pageOf(hash) {
    var h = decodeURIComponent((hash || '').replace(/^#\/?/, '')), first = h.split('/')[0];
    if (!first) return 'home';
    if (document.querySelector('[data-page="' + first + '"]')) return first;
    var el = document.getElementById(first), pg = el && el.closest('[data-page]');
    return pg ? pg.dataset.page : 'home';
  }

  /* A link to another tab first plays the current page out, then navigates;
     the hashchange that follows plays the new page in. Same-page anchors,
     modified clicks and anything another handler cancelled are left alone. */
  var leaving = false;
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.target) return;
    var href = a.getAttribute('href');
    var cur = document.querySelector('[data-page]:not([hidden])');
    if (!cur || href === location.hash || pageOf(href) === cur.dataset.page || !animOK()) return;
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    var go = function () {
      if (!leaving) return;
      leaving = false;
      location.hash = href;
    };
    gsap.to(cur, { opacity: 0, y: -10, duration: 0.2, ease: 'power2.in', onComplete: go });
    setTimeout(go, 360);   /* never let a stalled clock hold navigation hostage */
  });

  window.addEventListener('resize', function () { moveNavInk(true); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveNavInk(true); });

  /* ================= dropdowns: animated listbox ================= */

  /* The OS draws a native <select>'s popup, so it cannot be animated. Each one
     gets a button and listbox in front of it, while the real <select> stays in
     the DOM as the source of truth: app.js still reads .value, still rebuilds
     the options with innerHTML, and still hears 'input' and 'change'. */
  var selValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  var selIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  var openDD = null, ddSeq = 0;

  function enhanceSelect(sel) {
    if (sel.dataset.moDd || sel.multiple || sel.size > 1) return;
    sel.dataset.moDd = '1';
    var id = sel.id || ('mo-sel-' + (++ddSeq));

    var wrap = document.createElement('span');
    wrap.className = 'mo-dd ' + (sel.classList.contains('pick-sel') ? 'mo-dd--pick' : 'mo-dd--field');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mo-dd-btn';
    btn.id = id + '-dd';
    btn.setAttribute('role', 'combobox');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="mo-dd-val"></span>'
      + '<svg class="mo-dd-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" '
      + 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    wrap.appendChild(btn);
    var val = btn.querySelector('.mo-dd-val'), chev = btn.querySelector('.mo-dd-chev');

    sel.classList.add('mo-dd-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    var list = document.createElement('div');
    list.className = 'mo-dd-list';
    list.id = id + '-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('data-lenis-prevent', '');
    list.hidden = true;
    document.body.appendChild(list);
    btn.setAttribute('aria-controls', list.id);

    var lab = sel.id ? document.querySelector('label[for="' + sel.id + '"]') : null;
    if (lab) {
      lab.htmlFor = btn.id;
      if (!lab.id) lab.id = id + '-lab';
      list.setAttribute('aria-labelledby', lab.id);
      btn.setAttribute('aria-labelledby', lab.id + ' ' + btn.id);
    }

    function sync() {
      var o = sel.options[selIndex.get.call(sel)];
      val.textContent = o ? o.textContent : '—';
      btn.disabled = sel.disabled || !sel.options.length;
    }

    /* Catch app.js writing .value / .selectedIndex directly — no event fires. */
    Object.defineProperty(sel, 'value', {
      configurable: true,
      get: function () { return selValue.get.call(sel); },
      set: function (v) { selValue.set.call(sel, v); sync(); },
    });
    Object.defineProperty(sel, 'selectedIndex', {
      configurable: true,
      get: function () { return selIndex.get.call(sel); },
      set: function (v) { selIndex.set.call(sel, v); sync(); },
    });
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'] });
    sel.addEventListener('change', sync);
    sync();

    var active = -1, up = false, scrollAtOpen = 0, typed = '', typedAt = 0;

    function build() {
      list.textContent = '';
      var hl = document.createElement('span');
      hl.className = 'mo-dd-hl';
      hl.setAttribute('aria-hidden', 'true');
      list.appendChild(hl);
      var cur = selIndex.get.call(sel);
      Array.prototype.forEach.call(sel.options, function (o, i) {
        var d = document.createElement('div');
        d.className = 'mo-dd-opt';
        d.id = id + '-o' + i;
        d.setAttribute('role', 'option');
        d.setAttribute('aria-selected', String(i === cur));
        if (o.disabled) d.setAttribute('aria-disabled', 'true');
        d.dataset.i = i;
        d.innerHTML = '<span class="mo-dd-check" aria-hidden="true">✓</span><span class="mo-dd-txt"></span>';
        d.lastChild.textContent = o.textContent;
        list.appendChild(d);
      });
    }

    function place() {
      var r = btn.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
      list.style.minWidth = Math.max(r.width, 180) + 'px';
      list.style.maxWidth = Math.min(460, vw - 16) + 'px';
      var h = Math.min(list.scrollHeight, 300);
      up = (vh - r.bottom < h + 14) && (r.top > vh - r.bottom);
      list.style.left = Math.max(8, Math.min(r.left, vw - list.offsetWidth - 8)) + 'px';
      list.style.top = (up ? r.top - h - 6 : r.bottom + 6) + 'px';
    }

    function setActive(i, instant) {
      var opts = list.querySelectorAll('.mo-dd-opt');
      if (!opts.length) return;
      active = Math.max(0, Math.min(opts.length - 1, i));
      var o = opts[active];
      var prev = list.querySelector('.mo-dd-opt.is-active');
      if (prev) prev.classList.remove('is-active');
      o.classList.add('is-active');
      btn.setAttribute('aria-activedescendant', o.id);
      var hl = list.querySelector('.mo-dd-hl');
      var to = { y: o.offsetTop, height: o.offsetHeight, opacity: 1 };
      if (instant || !animOK()) gsap.set(hl, to);
      else gsap.to(hl, { y: to.y, height: to.height, opacity: 1, duration: 0.22, ease: 'power3.out', overwrite: true });
      if (o.offsetTop < list.scrollTop) list.scrollTop = o.offsetTop - 4;
      else if (o.offsetTop + o.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = o.offsetTop + o.offsetHeight - list.clientHeight + 4;
    }

    function open() {
      if (btn.disabled) return;
      if (openDD && openDD !== api) openDD.close(true);
      build();
      list.hidden = false;
      place();
      openDD = api;
      scrollAtOpen = lenis.scroll;
      btn.setAttribute('aria-expanded', 'true');
      wrap.classList.add('is-open');
      var cur = Math.max(0, selIndex.get.call(sel));
      var selEl = list.querySelectorAll('.mo-dd-opt')[cur];
      if (selEl) list.scrollTop = selEl.offsetTop - list.clientHeight / 2 + selEl.offsetHeight / 2;
      setActive(cur, true);
      var opts = all('.mo-dd-opt', list);
      if (animOK()) {
        gsap.fromTo(list,
          { opacity: 0, y: up ? 8 : -8, scaleY: 0.92, transformOrigin: up ? '50% 100%' : '50% 0%' },
          { opacity: 1, y: 0, scaleY: 1, duration: 0.26, ease: 'power3.out', overwrite: true });
        gsap.fromTo(opts, { opacity: 0, x: -6 },
          { opacity: 1, x: 0, duration: 0.24, ease: 'power2.out', delay: 0.05, stagger: { amount: Math.min(0.03 * opts.length, 0.2) }, overwrite: true });
        gsap.to(chev, { rotate: 180, duration: 0.32, ease: 'back.out(2)' });
      } else {
        gsap.set(list, { opacity: 1, y: 0, scaleY: 1 });
        gsap.set(opts, { opacity: 1, x: 0 });
        gsap.set(chev, { rotate: 180 });
      }
    }

    function close(instant, refocus) {
      if (openDD !== api) return;
      openDD = null;
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('aria-activedescendant');
      wrap.classList.remove('is-open');
      var hide = function () { list.hidden = true; };
      if (instant || !animOK()) {
        gsap.killTweensOf(list);
        gsap.set(chev, { rotate: 0 });
        hide();
      } else {
        gsap.to(list, { opacity: 0, y: up ? 6 : -6, scaleY: 0.96, duration: 0.15, ease: 'power2.in', overwrite: true, onComplete: hide });
        gsap.to(chev, { rotate: 0, duration: 0.28, ease: 'power3.out' });
      }
      if (refocus) btn.focus();
    }

    function choose(i) {
      var o = sel.options[i];
      if (!o || o.disabled) return;
      var changed = selIndex.get.call(sel) !== i;
      selIndex.set.call(sel, i);
      sync();
      close(false, true);
      if (!changed) return;
      if (animOK()) gsap.fromTo(val, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32, ease: 'power3.out', clearProps: 'transform,opacity' });
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function typeahead(ch) {
      var now = Date.now();
      typed = (now - typedAt > 700 ? '' : typed) + ch.toLowerCase();
      typedAt = now;
      var n = sel.options.length, startAt = typed.length > 1 ? active : active + 1;
      for (var k = 0; k < n; k++) {
        var i = (startAt + k + n) % n;
        if (sel.options[i].textContent.trim().toLowerCase().indexOf(typed) === 0) { setActive(i); return; }
      }
    }

    btn.addEventListener('click', function () { if (openDD === api) close(false); else open(); });
    btn.addEventListener('keydown', function (e) {
      var k = e.key, isOpen = openDD === api;
      if (!isOpen) {
        if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); open(); }
        return;
      }
      if (k === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (k === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (k === 'Home') { e.preventDefault(); setActive(0); }
      else if (k === 'End') { e.preventDefault(); setActive(sel.options.length - 1); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active); }
      else if (k === 'Escape') { e.preventDefault(); close(false, true); }
      else if (k === 'Tab') { close(true); }
      else if (k.length === 1 && /\S/.test(k)) { typeahead(k); }
    });
    list.addEventListener('pointermove', function (e) {
      var o = e.target.closest('.mo-dd-opt');
      if (o && +o.dataset.i !== active) setActive(+o.dataset.i);
    });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });   /* keep focus on the button */
    list.addEventListener('click', function (e) {
      var o = e.target.closest('.mo-dd-opt');
      if (o) choose(+o.dataset.i);
    });

    var api = {
      close: close,
      contains: function (t) { return wrap.contains(t) || list.contains(t); },
      scrolledAway: function () { return Math.abs(lenis.scroll - scrollAtOpen) > 6; },
    };
  }

  document.addEventListener('pointerdown', function (e) {
    if (openDD && !openDD.contains(e.target)) openDD.close(false);
  }, true);
  lenis.on('scroll', function () { if (openDD && openDD.scrolledAway()) openDD.close(false); });
  window.addEventListener('resize', function () { if (openDD) openDD.close(true); });
  window.addEventListener('hashchange', function () { if (openDD) openDD.close(true); });

  /* ================= sliders: filled track, spring thumb, value bubble ================= */

  /* The native range input stays (keyboard, screen readers, app.js listeners);
     CSS draws the track and thumb, --pct fills the track, and a bubble above
     the thumb shows the readout app.js already writes into the <output>. */
  var inValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  var inMax = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'max');
  var THUMB = 18;

  function enhanceRange(inp) {
    if (inp.dataset.moRange) return;
    inp.dataset.moRange = '1';
    var host = inp.closest('.ctl') || inp.parentNode;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var out = inp.labels && inp.labels[0] ? inp.labels[0].querySelector('output') : null;
    var bubble = document.createElement('span');
    bubble.className = 'mo-bubble';
    bubble.setAttribute('aria-hidden', 'true');
    host.appendChild(bubble);
    gsap.set(bubble, { xPercent: -50, yPercent: -100, opacity: 0, scale: 0.6, y: 6, transformOrigin: '50% 100%' });

    var dragging = false, idle = null, last = null;

    function frac() {
      var mn = parseFloat(inp.min) || 0, mx = parseFloat(inMax.get.call(inp));
      if (!isFinite(mx)) mx = 100;
      var v = parseFloat(inValue.get.call(inp));
      return mx > mn ? Math.max(0, Math.min(1, (v - mn) / (mx - mn))) : 0;
    }
    function paint() {
      var p = frac();
      inp.style.setProperty('--pct', (p * 100).toFixed(2) + '%');
      bubble.style.left = (inp.offsetLeft + THUMB / 2 + p * (inp.offsetWidth - THUMB)) + 'px';
      bubble.style.top = (inp.offsetTop - 4) + 'px';
      bubble.textContent = out ? out.textContent : inValue.get.call(inp);
    }
    function show() {
      paint();
      if (animOK()) gsap.to(bubble, { opacity: 1, scale: 1, y: 0, duration: 0.34, ease: 'back.out(2.4)', overwrite: true });
      else gsap.set(bubble, { opacity: 1, scale: 1, y: 0 });
    }
    function hide() {
      if (animOK()) gsap.to(bubble, { opacity: 0, scale: 0.6, y: 6, duration: 0.2, ease: 'power2.in', overwrite: true });
      else gsap.set(bubble, { opacity: 0 });
    }
    function tick() {
      if (!out || !animOK()) return;
      gsap.fromTo(out, { scale: 1.18, color: 'var(--h0-text)' },
        { scale: 1, color: 'var(--ink)', duration: 0.4, ease: 'back.out(3)', overwrite: true, clearProps: 'transform,color' });
    }

    Object.defineProperty(inp, 'value', {
      configurable: true,
      get: function () { return inValue.get.call(inp); },
      set: function (v) { inValue.set.call(inp, v); paint(); },
    });
    Object.defineProperty(inp, 'max', {
      configurable: true,
      get: function () { return inMax.get.call(inp); },
      set: function (v) { inMax.set.call(inp, v); paint(); },
    });

    inp.addEventListener('input', function () {
      var v = inValue.get.call(inp);
      paint();
      if (v !== last) { last = v; tick(); }
      if (!dragging) {                       /* keyboard: show briefly */
        show();
        clearTimeout(idle);
        idle = setTimeout(hide, 900);
      }
    });
    inp.addEventListener('pointerdown', function () {
      dragging = true;
      inp.classList.add('mo-drag');
      clearTimeout(idle);
      show();
    });
    var stop = function () {
      if (!dragging) return;
      dragging = false;
      inp.classList.remove('mo-drag');
      hide();
    };
    window.addEventListener('pointerup', stop, { passive: true });
    window.addEventListener('pointercancel', stop, { passive: true });
    inp.addEventListener('blur', function () { clearTimeout(idle); hide(); });
    last = inValue.get.call(inp);
    paint();
  }

  /* ================= disclosures: smooth open and close ================= */

  /* <details> snaps open and shut. Intercept the summary, toggle [open] at the
     right moment, and tween the height between the two natural sizes. */
  function closedHeight(det, sum) {
    var cs = getComputedStyle(det);
    return sum.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    var sum = e.target.closest && e.target.closest('summary');
    var det = sum && sum.parentNode;
    if (!det || det.tagName !== 'DETAILS' || sum !== det.querySelector(':scope > summary') || !animOK()) return;
    e.preventDefault();
    if (det.dataset.moAnim) return;
    det.dataset.moAnim = '1';
    var body = all(':scope > :not(summary)', det);
    var start = det.offsetHeight;
    var done = function () {
      gsap.set(det, { clearProps: 'height,overflow' });
      delete det.dataset.moAnim;
      lenis.resize();
      ST.refresh();
    };
    if (!det.open) {
      det.open = true;
      var end = det.offsetHeight;
      gsap.set(det, { height: start, overflow: 'hidden' });
      gsap.to(det, { height: end, duration: 0.46, ease: 'power3.out', onComplete: done });
      gsap.fromTo(body, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.42, ease: 'power2.out', delay: 0.08, clearProps: 'opacity,transform' });
    } else {
      gsap.set(det, { height: start, overflow: 'hidden' });
      gsap.to(body, { opacity: 0, y: -4, duration: 0.18, ease: 'power1.in' });
      gsap.to(det, {
        height: closedHeight(det, sum), duration: 0.34, ease: 'power3.inOut',
        onComplete: function () { det.open = false; gsap.set(body, { clearProps: 'opacity,transform' }); done(); },
      });
    }
  });

  /* ================= failsafe ================= */

  /* Every reveal starts from opacity 0, so the one unacceptable outcome is a
   * tween that never runs: requestAnimationFrame is paused in a background tab
   * and in some embedded contexts, and GSAP's ticker goes with it. Wall-clock
   * time keeps running, so if the ticker has not advanced a single frame by
   * then, drop the motion styles and show the page as plain HTML. */
  setTimeout(function () {
    if (gsap.ticker.frame > 0) return;
    root.classList.add('mo-settled');
    if (tickerTween) tickerTween.kill();
  }, 2200);

  /* ================= start ================= */

  watchCounters();
  watchBars();
  all('select').forEach(enhanceSelect);
  all('input[type=range]').forEach(enhanceRange);
  enterPage(true);
  window.addEventListener('load', function () { requestAnimationFrame(function () { lenis.resize(); ST.refresh(); }); });
})();
