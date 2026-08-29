/*!
 * PanigaleUI — DOM / UI animation layer for the open-source "Ducati Panigale V4" site.
 * ---------------------------------------------------------------------------------
 * Loaded as a CLASSIC script tag. Requires window.gsap (3.12.x) and window.ScrollTrigger
 * to already be present. Assigns exactly one global: window.PanigaleUI.
 *
 *   window.PanigaleUI.init(ctx) -> { refresh(), destroy(), getState() }
 *   window.PanigaleUI.setLoadProgress(0..1)
 *   window.PanigaleUI.hideLoader([callback])
 *
 * This file owns the DOM only. It never touches three.js; it just keeps shouting the
 * current narrative state at ctx.setSceneState() (at most once per rAF tick) so the
 * WebGL layer can follow along.
 *
 * Everything is written defensively: a missing selector means "skip that animation",
 * never "throw".
 */
(function (window, document) {
  'use strict';

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  var NOOP = function () {};
  var CONSOLE = window.console || { warn: NOOP, error: NOOP, log: NOOP };

  /* ------------------------------------------------------------------ *
   * 0. Hard guard — no GSAP, no party (but never break the host page).
   * ------------------------------------------------------------------ */
  if (!gsap) {
    CONSOLE.warn('[PanigaleUI] GSAP not found — the UI layer is inert.');
    window.PanigaleUI = {
      version: '1.0.0',
      init: function () { return { refresh: NOOP, destroy: NOOP, getState: function () { return null; } }; },
      setLoadProgress: NOOP,
      hideLoader: NOOP
    };
    return;
  }
  if (ScrollTrigger && gsap.registerPlugin) gsap.registerPlugin(ScrollTrigger);

  /* ------------------------------------------------------------------ *
   * 1. Micro utilities
   * ------------------------------------------------------------------ */
  function qs(sel, root) { try { return (root || document).querySelector(sel); } catch (e) { return null; } }
  function qsa(sel, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; }
  }
  function num(v, fallback) { var n = parseFloat(v); return isFinite(n) ? n : fallback; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return clamp(v, 0, 1); }
  function round(v, p) { var m = Math.pow(10, p == null ? 4 : p); return Math.round(v * m) / m; }
  function isFn(f) { return typeof f === 'function'; }

  /** Run a feature setup in isolation: one broken widget must not kill the rest. */
  function safe(label, fn) {
    try { return fn(); }
    catch (e) { CONSOLE.warn('[PanigaleUI] "' + label + '" skipped: ' + (e && e.message ? e.message : e)); return null; }
  }

  /** Tiny bookkeeping wrapper so destroy() can unbind everything it bound. */
  function Bus() { this.items = []; }
  Bus.prototype.on = function (target, type, handler, opts) {
    if (!target || !target.addEventListener) return handler;
    target.addEventListener(type, handler, opts);
    this.items.push([target, type, handler, opts]);
    return handler;
  };
  Bus.prototype.off = function () {
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      try { it[0].removeEventListener(it[1], it[2], it[3]); } catch (e) { /* noop */ }
    }
    this.items.length = 0;
  };

  /* ------------------------------------------------------------------ *
   * 2. Runtime stylesheet
   *    One deliverable file, so the handful of structural rules the split
   *    text / marquee / rolling-digit widgets need are injected here.
   *    Purely structural — zero opinions about the host's visual design.
   * ------------------------------------------------------------------ */
  var STYLE_ID = 'panigale-ui-runtime-style';
  var CSS = [
    '.pui-split .word{display:inline-block;overflow:hidden;vertical-align:top;',
    'padding-bottom:.14em;margin-bottom:-.14em}',
    '.pui-split .char{display:inline-block;transform-origin:50% 100%}',
    '.pui-mq{overflow:hidden;position:relative}',
    '.pui-mq-row{display:flex;flex-wrap:nowrap;width:max-content;will-change:transform}',
    '.pui-mq-strip{display:inline-flex;align-items:center;flex:0 0 auto;white-space:nowrap}',
    '.pui-roll{display:inline-flex;align-items:flex-start;line-height:1;font-variant-numeric:tabular-nums}',
    '.pui-roll-col{display:block;overflow:hidden;height:1em}',
    '.pui-roll-strip{display:block;will-change:transform}',
    '.pui-roll-strip>i{display:block;height:1em;line-height:1;font-style:inherit}',
    '.pui-roll-sep{display:block;height:1em;line-height:1}',
    '.pui-cursor-hidden{opacity:0!important}',
    '@media (prefers-reduced-motion: reduce){.pui-mq-row{transform:none!important}}'
  ].join('');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return document.getElementById(STYLE_ID);
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.appendChild(document.createTextNode(CSS));
    (document.head || document.documentElement).appendChild(s);
    return s;
  }
  function removeStyle() {
    var s = document.getElementById(STYLE_ID);
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  /* ------------------------------------------------------------------ *
   * 3. Hand-rolled text splitter (no SplitText — that one costs money)
   *    words -> chars, each word masks its chars with overflow:hidden.
   *    Bails out to a whole-element reveal when the node has element
   *    children we would otherwise destroy.
   * ------------------------------------------------------------------ */
  function canSplit(el) {
    if (!el || !el.childNodes || !el.childNodes.length) return false;
    for (var i = 0; i < el.childNodes.length; i++) {
      // Element children (a <br>, an <em>, an icon) — we refuse to flatten those.
      if (el.childNodes[i].nodeType === 1) return false;
    }
    return (el.textContent || '').trim().length > 0;
  }

  /**
   * @returns {{el:Element, chars:Element[], words:Element[], revert:Function}|null}
   */
  function splitText(el, perChar) {
    if (!canSplit(el)) return null;
    var source = el.textContent;
    var originalHTML = el.innerHTML;
    var hadLabel = el.getAttribute('aria-label');
    var frag = document.createDocumentFragment();
    var words = [];
    var chars = [];
    // Keep the whitespace runs so justified / multi-line headings still break naturally.
    var pieces = source.split(/(\s+)/);

    for (var i = 0; i < pieces.length; i++) {
      var piece = pieces[i];
      if (!piece) continue;
      if (/^\s+$/.test(piece)) { frag.appendChild(document.createTextNode(piece)); continue; }

      var word = document.createElement('span');
      word.className = 'word';
      word.setAttribute('aria-hidden', 'true');

      if (perChar) {
        for (var c = 0; c < piece.length; c++) {
          var ch = document.createElement('span');
          ch.className = 'char';
          ch.textContent = piece.charAt(c);
          word.appendChild(ch);
          chars.push(ch);
        }
      } else {
        // "low" quality: one char span per word — same masking, a sixth of the nodes.
        var whole = document.createElement('span');
        whole.className = 'char';
        whole.textContent = piece;
        word.appendChild(whole);
        chars.push(whole);
      }
      words.push(word);
      frag.appendChild(word);
    }

    if (!chars.length) return null;

    el.textContent = '';
    el.appendChild(frag);
    el.classList.add('pui-split');
    if (!hadLabel) el.setAttribute('aria-label', source.replace(/\s+/g, ' ').trim());

    return {
      el: el,
      chars: chars,
      words: words,
      revert: function () {
        el.innerHTML = originalHTML;
        el.classList.remove('pui-split');
        if (!hadLabel) el.removeAttribute('aria-label');
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 4. Rolling-digit readout (used by the HUD)
   *    Each digit column is a 0-9 strip translated by yPercent.
   * ------------------------------------------------------------------ */
  function makeRoller(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var digits = Math.max(1, opts.digits || 3);
    var originalHTML = el.innerHTML;
    var cols = [];
    var setters = [];
    var lastDigits = [];

    el.innerHTML = '';
    el.classList.add('pui-roll');
    for (var d = 0; d < digits; d++) {
      var col = document.createElement('span');
      col.className = 'pui-roll-col';
      var strip = document.createElement('span');
      strip.className = 'pui-roll-strip';
      for (var n = 0; n <= 9; n++) {
        var cell = document.createElement('i');
        cell.textContent = String(n);
        strip.appendChild(cell);
      }
      col.appendChild(strip);
      el.appendChild(col);
      cols.push(col);
      setters.push(gsap.quickTo(strip, 'yPercent', {
        duration: opts.duration || 0.45,
        ease: opts.ease || 'power3.out'
      }));
      lastDigits.push(-1);
    }
    if (opts.suffix) {
      var sfx = document.createElement('span');
      sfx.className = 'pui-roll-sep';
      sfx.textContent = opts.suffix;
      el.appendChild(sfx);
    }

    var lastValue = null;
    return {
      el: el,
      set: function (value, instant) {
        value = clamp(Math.round(value), 0, Math.pow(10, digits) - 1);
        if (value === lastValue) return;
        lastValue = value;
        var str = String(value);
        while (str.length < digits) str = '0' + str;
        var firstSignificant = digits - String(value).length;
        for (var i = 0; i < digits; i++) {
          var digit = parseInt(str.charAt(i), 10) || 0;
          if (lastDigits[i] !== digit) {
            lastDigits[i] = digit;
            if (instant) gsap.set(cols[i].firstChild, { yPercent: -10 * digit });
            else setters[i](-10 * digit);
          }
          // Blank the leading zeros without reflowing the layout.
          cols[i].style.opacity = (i < firstSignificant && digits > 1) ? '0' : '1';
        }
      },
      revert: function () {
        el.classList.remove('pui-roll');
        el.innerHTML = originalHTML;
      }
    };
  }

  /* ------------------------------------------------------------------ *
   * 5. Loader — usable before init() so the host can pipe its asset
   *    manager straight into it.
   * ------------------------------------------------------------------ */
  var Loader = (function () {
    var shown = true;
    var hidden = false;
    var pct = { v: 0 };
    var displayed = -1;
    var tween = null;

    function els() {
      return { root: qs('#loader'), bar: qs('#loader-bar'), pct: qs('#loader-pct') };
    }

    function paint() {
      var e = els();
      var v = clamp01(pct.v);
      if (e.bar) e.bar.style.width = (v * 100).toFixed(2) + '%';
      if (e.pct) {
        var whole = Math.round(v * 100);
        if (whole !== displayed) { displayed = whole; e.pct.textContent = String(whole); }
      }
    }

    return {
      isHidden: function () { return hidden; },
      setProgress: function (p) {
        p = clamp01(num(p, 0));
        var e = els();
        if (!e.root && !e.bar && !e.pct) return;
        if (tween) tween.kill();
        tween = gsap.to(pct, {
          v: p,
          duration: 0.6,
          ease: 'power2.out',
          overwrite: true,
          onUpdate: paint,
          onComplete: paint
        });
      },
      hide: function (done) {
        var e = els();
        if (hidden) { if (isFn(done)) done(); return; }
        hidden = true;
        shown = false;
        if (!e.root) { pct.v = 1; paint(); if (isFn(done)) done(); return; }
        if (tween) tween.kill();
        var tl = gsap.timeline({
          onComplete: function () {
            if (e.root) { e.root.style.display = 'none'; e.root.setAttribute('aria-hidden', 'true'); }
            if (ScrollTrigger) ScrollTrigger.refresh();
            if (isFn(done)) done();
          }
        });
        tl.to(pct, { v: 1, duration: 0.45, ease: 'power2.inOut', onUpdate: paint });
        if (e.bar) tl.to(e.bar, { opacity: 0, duration: 0.3, ease: 'power2.in' }, '-=0.05');
        tl.to(e.root, { autoAlpha: 0, duration: 0.7, ease: 'expo.inOut' }, '-=0.1');
        return tl;
      },
      reset: function () { hidden = false; shown = true; pct.v = 0; displayed = -1; }
    };
  })();

  /* ------------------------------------------------------------------ *
   * 6. The narrative — pure function of (chapter, progress, time).
   *    Keeping this side-effect free makes the whole scroll story testable
   *    and keeps the 3D layer perfectly deterministic.
   * ------------------------------------------------------------------ */
  var IDLE_RPM = 0.12;
  var SHIFTS = 6;

  function narrative(chapter, p, t) {
    p = clamp01(p);
    var d = { rpm: IDLE_RPM, throttle: 0, speed: 0, exploded: 0, gear: 1 };
    var blip, seg, local, g;

    switch (chapter) {
      // 0 — HERO: the bike breathes. Idle needle wobble, nothing else.
      case 0:
        d.rpm = IDLE_RPM + Math.sin(t * 3.1) * 0.009 + p * 0.05;
        d.throttle = Math.max(0, Math.sin(t * 3.1)) * 0.04;
        d.speed = 0;
        break;

      // 1 — IL CUORE: the Desmosedici Stradale wakes up. Ramp + throttle blips.
      case 1:
        blip = Math.pow(Math.abs(Math.sin(p * Math.PI * 3.5)), 12);
        d.throttle = clamp01(0.1 + 0.9 * blip);
        d.rpm = 0.2 + 0.6 * p + 0.14 * blip;
        d.speed = 0.05 + 0.12 * p;
        d.gear = 1;
        break;

      // 2 — AERODINAMICA: winglets bite, speed climbs.
      case 2:
        d.speed = p * p * (3 - 2 * p);           // smoothstep
        d.rpm = 0.45 + 0.42 * d.speed;
        d.throttle = 0.4 + 0.45 * d.speed;
        d.gear = 2 + Math.floor(d.speed * 3);
        break;

      // 3 — ANATOMIA: exploded view blooms open and closes again.
      case 3:
        d.exploded = Math.sin(Math.PI * p);
        d.rpm = IDLE_RPM + 0.04 * Math.sin(t * 2.0);
        d.throttle = 0;
        d.speed = 0;
        break;

      // 4 — ELETTRONICA: six upshifts. rpm sawtooths 0.60 -> 0.95, snap, repeat.
      case 4:
        seg = clamp(p * SHIFTS, 0, SHIFTS - 0.0001);
        g = Math.floor(seg);
        local = seg - g;
        d.gear = g + 1;
        d.rpm = 0.6 + 0.35 * local;
        d.throttle = 0.7 + 0.28 * local;
        d.speed = 0.18 + 0.8 * (seg / SHIFTS);
        break;

      // 5 — LIVREA: bike on the turntable, engine ticking over.
      case 5:
        d.rpm = 0.18 + 0.05 * Math.sin(t * 1.6);
        d.throttle = 0.06;
        d.speed = 0.04;
        d.gear = 1;
        break;

      // 6 — OUTRO: everything decelerates back to idle.
      case 6:
        d.rpm = IDLE_RPM + 0.3 * (1 - p) * (1 - p);
        d.throttle = 0.15 * (1 - p);
        d.speed = 0.35 * (1 - p) * (1 - p);
        d.gear = Math.max(1, 4 - Math.floor(p * 4));
        break;
    }

    d.rpm = clamp01(d.rpm);
    d.throttle = clamp01(d.throttle);
    d.speed = clamp01(d.speed);
    d.exploded = clamp01(d.exploded);
    d.gear = clamp(Math.round(d.gear), 1, 6);
    return d;
  }

  /* ------------------------------------------------------------------ *
   * 7. init()
   * ------------------------------------------------------------------ */
  function init(ctxIn) {
    /* Raccolte dai blocchi dentro gsap.context() e consumate da playIntro().
       Vanno inizializzate QUI, in cima: il corpo di init esegue quei blocchi
       prima di arrivare a valle, e una `var` più in basso li troverebbe
       `undefined` — il push lancerebbe, safe() lo inghiottirebbe e la pagina
       resterebbe senza un solo elemento rivelato. */
    var heroSplits = [];
    var heroReveals = [];
    var introPlayed = false;
    var ctx = ctxIn || {};
    var bus = new Bus();
    var gctx = null;
    var disposed = false;

    var reduceMotion = ctx.reduceMotion;
    if (typeof reduceMotion !== 'boolean') {
      reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    var quality = ctx.quality === 'low' ? 'low' : 'high';
    var perChar = quality === 'high' && !reduceMotion;

    var setSceneState = isFn(ctx.setSceneState) ? ctx.setSceneState : NOOP;
    var requestSound = isFn(ctx.requestSound) ? ctx.requestSound : NOOP;

    injectStyle();

    /* --- 7a. Scene state + the once-per-rAF flush ------------------- */
    var state = {
      chapter: 0, progress: 0, rpm: IDLE_RPM, throttle: 0,
      speed: 0, exploded: 0, paintColor: null
    };
    var emitted = null;

    function emit() {
      if (!emitted ||
        emitted.chapter !== state.chapter ||
        emitted.paintColor !== state.paintColor ||
        Math.abs(emitted.progress - state.progress) > 0.0005 ||
        Math.abs(emitted.rpm - state.rpm) > 0.0005 ||
        Math.abs(emitted.throttle - state.throttle) > 0.0005 ||
        Math.abs(emitted.speed - state.speed) > 0.0005 ||
        Math.abs(emitted.exploded - state.exploded) > 0.0005) {
        emitted = {
          chapter: state.chapter, progress: state.progress, rpm: state.rpm,
          throttle: state.throttle, speed: state.speed, exploded: state.exploded,
          paintColor: state.paintColor
        };
        try { setSceneState(emitted); }
        catch (e) { CONSOLE.warn('[PanigaleUI] setSceneState threw: ' + (e && e.message)); }
      }
    }

    /* ctx.onScrollProgress(cb): the host registers nothing on its side, so this
       layer owns the subscription list and fires it itself once per frame. The
       host-provided function is treated as a sink too, so it works either way. */
    var progressSubs = [];
    function onScrollProgress(cb) {
      if (isFn(cb) && progressSubs.indexOf(cb) === -1) progressSubs.push(cb);
      return function () {
        var i = progressSubs.indexOf(cb);
        if (i > -1) progressSubs.splice(i, 1);
      };
    }
    if (isFn(ctx.onScrollProgress)) {
      onScrollProgress(function (p) { ctx.onScrollProgress(p); });
    }
    var lastGlobalProgress = -1;

    /* --- 7b. Smooth scroll (desktop + motion-ok + #smooth-content only) --- */
    var smooth = null;
    var scroller = null;         // element scroller when smooth is on, else null (= window)

    function stCfg(cfg) {
      cfg = cfg || {};
      if (scroller) cfg.scroller = scroller;
      return cfg;
    }

    function initSmooth() {
      var content = qs('#smooth-content');
      if (!content || !ScrollTrigger) return null;
      if (reduceMotion) return null;
      if (!(window.matchMedia && window.matchMedia('(min-width: 900px)').matches)) return null;

      var current = window.pageYOffset || 0;
      var target = current;
      var height = 0;
      var prevBodyHeight = document.body.style.height;
      var prevOverflow = document.documentElement.style.overflowX;

      gsap.set(content, { position: 'fixed', top: 0, left: 0, width: '100%', willChange: 'transform' });
      document.documentElement.style.overflowX = 'hidden';

      function measure() {
        height = Math.round(content.getBoundingClientRect().height);
        document.body.style.height = height + 'px';
      }
      measure();

      ScrollTrigger.scrollerProxy(content, {
        scrollTop: function (value) {
          if (arguments.length) {
            target = value;
            current = value;
            window.scrollTo(0, value);
          }
          return current;
        },
        getBoundingClientRect: function () {
          return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
        },
        pinType: 'transform'
      });

      var y = 0;
      function tick() {
        target = window.pageYOffset || document.documentElement.scrollTop || 0;
        var damp = 1 - Math.pow(1 - 0.135, gsap.ticker.deltaRatio());
        current += (target - current) * damp;
        if (Math.abs(target - current) < 0.06) current = target;
        if (y !== current) {
          y = current;
          content.style.transform = 'translate3d(0,' + (-current).toFixed(2) + 'px,0)';
        }
        ScrollTrigger.update();
      }
      gsap.ticker.add(tick, false, true); // prioritised: runs before the state flush

      return {
        el: content,
        tick: tick,
        measure: measure,
        get: function () { return current; },
        jump: function (v) { current = target = v; },
        destroy: function () {
          gsap.ticker.remove(tick);
          content.style.transform = '';
          content.style.willChange = '';
          document.body.style.height = prevBodyHeight;
          document.documentElement.style.overflowX = prevOverflow;
        }
      };
    }

    smooth = safe('smooth-scroll', initSmooth);
    if (smooth) scroller = smooth.el;

    function scrollPos() {
      return smooth ? smooth.get() : (window.pageYOffset || document.documentElement.scrollTop || 0);
    }
    function maxScroll() {
      if (ScrollTrigger && ScrollTrigger.maxScroll) {
        try { return ScrollTrigger.maxScroll(scroller || window) || 0; } catch (e) { /* noop */ }
      }
      return Math.max(0, document.body.scrollHeight - window.innerHeight);
    }

    /** Our own scroll-to (ScrollToPlugin is not guaranteed to be loaded). */
    var scrollTween = null;
    function scrollToY(y, duration) {
      y = clamp(y, 0, maxScroll());
      var proxy = { y: window.pageYOffset || 0 };
      if (scrollTween) scrollTween.kill();
      if (reduceMotion) { window.scrollTo(0, y); if (smooth) smooth.jump(y); return; }
      scrollTween = gsap.to(proxy, {
        y: y,
        duration: duration || clamp(Math.abs(y - proxy.y) / 2200, 0.6, 1.5),
        ease: 'power3.inOut',
        overwrite: true,
        onUpdate: function () { window.scrollTo(0, proxy.y); }
      });
    }

    /* --- 7c. DOM inventory ---------------------------------------- */
    var sections = qsa('section[data-chapter]').sort(function (a, b) {
      return num(a.getAttribute('data-chapter'), 0) - num(b.getAttribute('data-chapter'), 0);
    });
    var canvas = qs('#scene-canvas');
    var hud = qs('#hud');
    var navEl = qs('#nav');
    var cursorEl = qs('#cursor');
    var cursorDot = qs('#cursor-dot');
    var progressFill = qs('#progress-fill');
    var progressRail = qs('#progress-rail');
    var soundBtn = qs('#sound-toggle');
    var explodeBtn = qs('#explode-toggle');

    var chapters = [];         // { el, index, st }
    var splits = [];           // splitter handles, for revert
    var marquees = [];
    var rollers = [];
    var parallaxItems = [];
    var quickSetters = [];
    var activeChapter = 0;
    var explodeManual = { v: 0 };
    var soundOn = false;

    /* --- 7d. Everything that animates, inside one gsap.context ----- */
    gctx = gsap.context(function () {

      /* ---- Chapters: progress triggers + cinematic scrub ---------- */
      safe('chapters', function () {
        if (!ScrollTrigger || !sections.length) return;
        var last = sections.length - 1;

        sections.forEach(function (section, i) {
          var index = num(section.getAttribute('data-chapter'), i);
          var inner = qs('.chapter-inner', section);

          // The narrative window: exactly the span during which this chapter is
          // the one on screen, so `progress` sweeps a full 0 -> 1 while active.
          var st = ScrollTrigger.create(stCfg({
            trigger: section,
            start: i === 0 ? 'top top' : 'top center',
            end: i === last ? 'bottom bottom' : 'bottom center',
            invalidateOnRefresh: true
          }));

          chapters.push({ el: section, index: index, st: st, i: i });

          if (!inner || reduceMotion) return;

          // Cinematic dim/lift as chapters hand over to each other.
          var tl = gsap.timeline(stCfg({
            scrollTrigger: stCfg({
              trigger: section,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 0.6
            })
          }));
          if (i === 0) {
            tl.set(inner, { opacity: 1, yPercent: 0 })
              .to(inner, { opacity: 0.3, yPercent: -6, duration: 1, ease: 'power2.in' });
          } else if (i === last) {
            tl.fromTo(inner, { opacity: 0.3, yPercent: 6 },
              { opacity: 1, yPercent: 0, duration: 0.4, ease: 'power2.out' })
              .to(inner, { opacity: 1, duration: 0.6 });
          } else {
            tl.fromTo(inner, { opacity: 0.3, yPercent: 6 },
              { opacity: 1, yPercent: 0, duration: 0.35, ease: 'power2.out' })
              .to(inner, { opacity: 1, duration: 0.3 })
              .to(inner, { opacity: 0.3, yPercent: -6, duration: 0.35, ease: 'power2.in' });
          }
        });
      });

      /* ---- Global scroll progress + rail --------------------------- */
      safe('progress-rail', function () {
        if (!ScrollTrigger) return;
        var vertical = false;
        if (progressRail) {
          var r = progressRail.getBoundingClientRect();
          vertical = r.height >= r.width;
        }
        if (progressFill) {
          gsap.set(progressFill, {
            transformOrigin: vertical ? '50% 0%' : '0% 50%',
            scaleY: vertical ? 0 : 1,
            scaleX: vertical ? 1 : 0
          });
        }
        ScrollTrigger.create(stCfg({
          start: 0,
          end: 'max',
          onUpdate: function (self) {
            lastGlobalProgress = self.progress;
            if (progressFill) {
              if (vertical) progressFill.style.transform = 'scaleY(' + self.progress.toFixed(4) + ')';
              else progressFill.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')';
            }
          }
        }));
      });

      /* ---- Split headings ----------------------------------------- */
      safe('split-headings', function () {
        var heroSection = sections.length ? sections[0] : null;
        qsa('[data-split]').forEach(function (el) {
          var isHero = !!(heroSection && heroSection.contains(el));

          if (reduceMotion) {
            gsap.set(el, { opacity: 0 });
            var tw = { opacity: 1, duration: 0.5, ease: 'none' };
            if (isHero) heroReveals.push(el);
            else gsap.to(el, gsap.utils.mergeProps ? tw : Object.assign(tw, {
              scrollTrigger: stCfg({ trigger: el, start: 'top 90%', once: true })
            }));
            return;
          }

          var handle = splitText(el, perChar);
          if (!handle) {
            // Element children we refuse to flatten: whole-element reveal instead.
            gsap.set(el, { opacity: 0, y: 24 });
            if (isHero) { heroReveals.push(el); return; }
            gsap.to(el, {
              opacity: 1, y: 0, duration: 1, ease: 'power4.out',
              scrollTrigger: stCfg({ trigger: el, start: 'top 88%', once: true })
            });
            return;
          }
          splits.push(handle);
          gsap.set(handle.chars, { yPercent: 118, opacity: 1, willChange: 'transform' });

          var tweenVars = {
            yPercent: 0,
            duration: 1.15,
            ease: 'expo.out',
            stagger: { each: perChar ? 0.021 : 0.06, from: 'start' },
            onComplete: function () { gsap.set(handle.chars, { willChange: 'auto' }); }
          };
          if (isHero) { heroSplits.push({ handle: handle, vars: tweenVars }); return; }
          tweenVars.scrollTrigger = stCfg({ trigger: el, start: 'top 86%', once: true });
          gsap.to(handle.chars, tweenVars);
        });
      });

      /* ---- Generic reveals ---------------------------------------- */
      safe('reveals', function () {
        var heroSection = sections.length ? sections[0] : null;
        var items = qsa('[data-reveal]').filter(function (el) {
          if (heroSection && heroSection.contains(el)) { heroReveals.push(el); return false; }
          return true;
        });
        var all = items.concat(heroReveals);
        if (!all.length) return;

        if (reduceMotion) gsap.set(all, { opacity: 0 });
        else gsap.set(all, { opacity: 0, y: 30, willChange: 'transform, opacity' });

        if (!items.length || !ScrollTrigger) return;

        ScrollTrigger.batch(items, stCfg({
          start: 'top 88%',
          once: true,
          onEnter: function (batch) {
            batch.forEach(function (el, i) {
              var delay = num(el.getAttribute('data-reveal-delay'), 0) + i * 0.075;
              if (reduceMotion) {
                gsap.to(el, { opacity: 1, duration: 0.45, ease: 'none', delay: delay * 0.4 });
              } else {
                gsap.to(el, {
                  opacity: 1, y: 0, duration: 1.05, ease: 'power4.out', delay: delay,
                  onComplete: function () { el.style.willChange = 'auto'; }
                });
              }
            });
          }
        }));
      });

      /* ---- Counters ------------------------------------------------ */
      safe('counters', function () {
        qsa('[data-counter]').forEach(function (el) {
          var to = num(el.getAttribute('data-counter-to'), num(el.textContent, 0));
          var dec = clamp(Math.round(num(el.getAttribute('data-counter-decimals'), 0)), 0, 4);
          var suffix = el.getAttribute('data-counter-suffix') || '';
          var group = el.getAttribute('data-counter-group');
          var proxy = { v: 0 };

          function render() {
            var s = proxy.v.toFixed(dec);
            if (group) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, group);
            el.textContent = s + suffix;
          }
          el.textContent = (0).toFixed(dec) + suffix;

          gsap.to(proxy, {
            v: to,
            duration: reduceMotion ? 0.6 : clamp(Math.abs(to) / 900 + 1.1, 1.1, 2.6),
            ease: reduceMotion ? 'none' : 'power3.out',
            snap: dec ? { v: 1 / Math.pow(10, dec) } : { v: 1 },
            onUpdate: render,
            onComplete: render,
            scrollTrigger: ScrollTrigger ? stCfg({ trigger: el, start: 'top 88%', once: true }) : undefined
          });
        });
      });

      /* ---- Spec bars ----------------------------------------------- */
      safe('spec-bars', function () {
        var bars = qsa('.spec-bar[data-value]');
        if (!bars.length) return;
        bars.forEach(function (bar) {
          var v = clamp01(num(bar.getAttribute('data-value'), 0) / 100);
          gsap.set(bar, { transformOrigin: '0% 50%', scaleX: 0 });
          gsap.to(bar, {
            scaleX: v,
            duration: reduceMotion ? 0.4 : 1.4,
            ease: reduceMotion ? 'none' : 'expo.out',
            scrollTrigger: ScrollTrigger ? stCfg({ trigger: bar, start: 'top 92%', once: true }) : undefined
          });
        });
      });

      /* ---- Marquees ------------------------------------------------ */
      safe('marquees', function () {
        qsa('[data-marquee]').forEach(function (el) {
          var m = buildMarquee(el);
          if (m) marquees.push(m);
        });
      });

      /* ---- Parallax ------------------------------------------------ */
      safe('parallax', function () {
        qsa('[data-parallax]').forEach(function (el) {
          var depth = clamp(num(el.getAttribute('data-parallax-depth'), 0.15), -1, 1);
          if (!depth || reduceMotion) return;
          parallaxItems.push({
            el: el,
            depth: depth,
            center: 0,
            last: null,
            set: gsap.quickSetter(el, 'y', 'px')
          });
        });
        measureParallax();
      });

      /* ---- HUD ----------------------------------------------------- */
      safe('hud', initHud);

      /* ---- Cursor -------------------------------------------------- */
      safe('cursor', initCursor);

      /* ---- Nav ----------------------------------------------------- */
      safe('nav', initNav);

      /* ---- Paint swatches ------------------------------------------ */
      safe('paint', initPaint);

      /* ---- Sound toggle -------------------------------------------- */
      safe('sound', initSound);

      /* ---- Explode toggle ------------------------------------------ */
      safe('explode', initExplode);

      /* ---- Scroll cue (optional hook) ------------------------------ */
      safe('scroll-cue', function () {
        var cue = qs('[data-scroll-cue]') || qs('.scroll-cue') || qs('#scroll-cue');
        if (!cue) return;
        if (reduceMotion) { gsap.set(cue, { opacity: 1 }); return; }
        gsap.to(cue, {
          y: 12, opacity: 0.35, duration: 1.1, ease: 'sine.inOut',
          repeat: -1, yoyo: true
        });
        if (ScrollTrigger) {
          gsap.to(cue, {
            autoAlpha: 0, duration: 0.4, ease: 'power2.out',
            scrollTrigger: stCfg({ start: 60, end: 'max', toggleActions: 'play none none reverse' })
          });
        }
      });

      /* ---- Canvas: nudge opacity in once we are alive -------------- */
      safe('canvas-fade', function () {
        if (!canvas) return;
        gsap.fromTo(canvas, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: 'power2.out', delay: 0.1 });
      });
    });

    /* --- 7e. Hero intro (collected above, played after the loader) -- */
    function playIntro() {
      if (introPlayed || disposed) return;
      introPlayed = true;
      gctx.add(function () {
        var tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
        heroSplits.forEach(function (s, i) {
          var vars = Object.create(null);
          for (var k in s.vars) if (Object.prototype.hasOwnProperty.call(s.vars, k)) vars[k] = s.vars[k];
          delete vars.scrollTrigger;
          vars.duration = 1.3;
          tl.to(s.handle.chars, vars, i === 0 ? 0.1 : '-=0.95');
        });
        if (heroReveals.length) {
          tl.to(heroReveals, {
            opacity: 1, y: 0, duration: reduceMotion ? 0.5 : 1.1,
            ease: reduceMotion ? 'none' : 'power4.out',
            stagger: 0.09,
            onComplete: function () {
              heroReveals.forEach(function (el) { el.style.willChange = 'auto'; });
            }
          }, heroSplits.length ? '-=0.75' : 0.1);
        }
        if (hud && !reduceMotion) {
          tl.fromTo(hud, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, '-=0.6');
        }
        if (navEl && !reduceMotion) {
          tl.fromTo(navEl, { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.8');
        }
      });
    }
    /* (heroSplits / heroReveals / introPlayed: dichiarate in cima a init) */

    /* ------------------------------------------------------------------ *
     * Feature implementations (declared as functions so the context body
     * above stays readable; they are all invoked from inside gsap.context).
     * ------------------------------------------------------------------ */

    /* ---- Marquee -------------------------------------------------- */
    function buildMarquee(el) {
      var speed = Math.abs(num(el.getAttribute('data-marquee-speed'), 60)) || 60; // px / second
      var dir = num(el.getAttribute('data-marquee-dir'), 1) < 0 ? -1 : 1;
      var originalHTML = el.innerHTML;

      var strip = document.createElement('div');
      strip.className = 'pui-mq-strip';
      while (el.firstChild) strip.appendChild(el.firstChild);
      var row = document.createElement('div');
      row.className = 'pui-mq-row';
      row.appendChild(strip);
      el.appendChild(row);
      el.classList.add('pui-mq');

      var m = {
        el: el, row: row, strip: strip, dir: dir, speed: speed,
        tween: null, copyW: 0, skewTo: null,
        destroy: function () {
          if (m.tween) m.tween.kill();
          el.classList.remove('pui-mq');
          el.innerHTML = originalHTML;
        },
        build: function () {
          if (m.tween) { m.tween.kill(); m.tween = null; }
          var copyW = Math.ceil(strip.getBoundingClientRect().width);
          if (!copyW) return;
          m.copyW = copyW;
          var containerW = el.getBoundingClientRect().width || window.innerWidth;
          var need = Math.max(2, Math.ceil((containerW * 2 + copyW) / copyW));
          var have = row.children.length;
          for (var i = have; i < need; i++) {
            var clone = strip.cloneNode(true);
            clone.setAttribute('aria-hidden', 'true');
            row.appendChild(clone);
          }
          if (reduceMotion) { gsap.set(row, { x: 0 }); return; }
          m.tween = gsap.fromTo(row,
            { x: dir < 0 ? -copyW : 0 },
            { x: dir < 0 ? 0 : -copyW, duration: copyW / speed, ease: 'none', repeat: -1 }
          );
        }
      };
      m.build();
      if (reduceMotion) return m;

      m.skewTo = gsap.quickTo(row, 'skewX', { duration: 0.7, ease: 'power3.out' });

      bus.on(el, 'mouseenter', function () {
        if (m.tween) gsap.to(m.tween, { timeScale: 0.12, duration: 0.6, ease: 'power2.out', overwrite: true });
      });
      bus.on(el, 'mouseleave', function () {
        if (m.tween) gsap.to(m.tween, { timeScale: 1, duration: 0.8, ease: 'power2.out', overwrite: true });
      });
      return m;
    }

    /* ---- Scroll-velocity skew for the marquees -------------------- */
    var velocityTrigger = null;
    var skewTarget = 0;
    function initVelocity() {
      if (!ScrollTrigger || reduceMotion || quality === 'low') return;
      velocityTrigger = ScrollTrigger.create(stCfg({
        start: 0,
        end: 'max',
        onUpdate: function (self) {
          skewTarget = clamp(self.getVelocity() / -420, -14, 14);
        }
      }));
    }

    /* ---- Parallax ------------------------------------------------- */
    function measureParallax() {
      if (!parallaxItems.length) return;
      var s = scrollPos();
      for (var i = 0; i < parallaxItems.length; i++) {
        var p = parallaxItems[i];
        p.el.style.transform = '';                 // measure without our own offset
        var r = p.el.getBoundingClientRect();
        p.center = r.top + s + r.height / 2;
        p.height = r.height;
        p.last = null;
      }
    }
    function updateParallax(scrollY, vh) {
      for (var i = 0; i < parallaxItems.length; i++) {
        var p = parallaxItems[i];
        var rel = (scrollY + vh / 2 - p.center) / (vh + p.height);
        if (rel < -1.2 || rel > 1.2) continue;      // offscreen: don't bother
        var y = round(rel * p.depth * vh * 0.55, 2);
        if (p.last !== y) { p.last = y; p.set(y); }
      }
    }

    /* ---- HUD ------------------------------------------------------ */
    var hudRefs = null;
    var rpmSpring = { x: IDLE_RPM, v: 0 };
    var lastGear = -1;
    var lastArcOffset = -1;

    function initHud() {
      if (!hud) return;
      var arc = qs('#hud-rpm-arc', hud) || qs('#hud-rpm-arc');
      var gearEl = qs('#hud-gear', hud) || qs('#hud-gear');
      var speedEl = qs('#hud-speed', hud) || qs('#hud-speed');
      var rpmValEl = qs('#hud-rpm-value', hud) || qs('#hud-rpm-value');
      var len = 0;
      if (arc && isFn(arc.getTotalLength)) {
        try { len = arc.getTotalLength(); } catch (e) { len = 0; }
      }
      if (!len && arc) len = num(arc.getAttribute('pathLength'), 0) || num(arc.getAttribute('data-length'), 0);
      if (arc && len) {
        arc.style.strokeDasharray = len;
        arc.style.strokeDashoffset = len;
      }

      var rpmRoller = rpmValEl ? makeRoller(rpmValEl, { digits: 5, duration: 0.35 }) : null;
      var speedRoller = speedEl ? makeRoller(speedEl, { digits: 3, duration: 0.4 }) : null;
      if (rpmRoller) rollers.push(rpmRoller);
      if (speedRoller) rollers.push(speedRoller);

      hudRefs = { arc: arc, len: len, gear: gearEl, rpm: rpmRoller, speed: speedRoller, root: hud };

      if (gearEl && !reduceMotion) gsap.set(gearEl, { transformOrigin: '50% 50%' });
    }

    function updateHud(drive, dt) {
      if (!hudRefs) return;
      // Spring the needle: underdamped, a hair of overshoot on every blip.
      var k = 150, c = 2 * Math.sqrt(150) * 0.52;
      var a = k * (state.rpm - rpmSpring.x) - c * rpmSpring.v;
      rpmSpring.v += a * dt;
      rpmSpring.x += rpmSpring.v * dt;
      if (reduceMotion) { rpmSpring.x = state.rpm; rpmSpring.v = 0; }
      var shown = clamp(rpmSpring.x, 0, 1.04);

      if (hudRefs.arc && hudRefs.len) {
        var off = round(hudRefs.len * (1 - clamp01(shown)), 1);
        if (off !== lastArcOffset) {
          lastArcOffset = off;
          hudRefs.arc.style.strokeDashoffset = off;
        }
      }
      if (hudRefs.rpm) hudRefs.rpm.set(clamp01(shown) * 16000);
      if (hudRefs.speed) hudRefs.speed.set(state.speed * 299);

      if (hudRefs.gear && drive.gear !== lastGear) {
        var prev = lastGear;
        lastGear = drive.gear;
        hudRefs.gear.textContent = String(drive.gear);
        if (!reduceMotion) {
          gctx.add(function () {
            gsap.fromTo(hudRefs.gear,
              { yPercent: prev > drive.gear ? -60 : 60, opacity: 0, scale: 0.8 },
              { yPercent: 0, opacity: 1, scale: 1, duration: 0.42, ease: 'back.out(2.2)', overwrite: true });
          });
        }
      }
    }

    /* ---- Magnetic cursor ------------------------------------------ */
    var cursorApi = null;
    function initCursor() {
      if (!cursorEl && !cursorDot) return;
      var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      var touch = ('ontouchstart' in window) && !fine;
      if (!fine || touch) {
        if (cursorEl) gsap.set(cursorEl, { display: 'none' });
        if (cursorDot) gsap.set(cursorDot, { display: 'none' });
        return;
      }

      var base = { position: 'fixed', top: 0, left: 0, pointerEvents: 'none', xPercent: -50, yPercent: -50 };
      if (cursorEl) gsap.set(cursorEl, base);
      if (cursorDot) gsap.set(cursorDot, base);

      var ringX = cursorEl ? gsap.quickTo(cursorEl, 'x', { duration: 0.52, ease: 'power3' }) : NOOP;
      var ringY = cursorEl ? gsap.quickTo(cursorEl, 'y', { duration: 0.52, ease: 'power3' }) : NOOP;
      var dotX = cursorDot ? gsap.quickTo(cursorDot, 'x', { duration: 0.13, ease: 'power2' }) : NOOP;
      var dotY = cursorDot ? gsap.quickTo(cursorDot, 'y', { duration: 0.13, ease: 'power2' }) : NOOP;

      var pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      var hovered = null;
      var hoveredRect = null;
      var magneticSetters = new (window.Map || Object)();
      var visible = false;

      function setterFor(el) {
        if (window.Map && magneticSetters.get(el)) return magneticSetters.get(el);
        var pair = {
          x: gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' }),
          y: gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' })
        };
        if (window.Map) magneticSetters.set(el, pair);
        return pair;
      }

      bus.on(window, 'pointermove', function (e) {
        pointer.x = e.clientX; pointer.y = e.clientY;
        if (!visible) {
          visible = true;
          if (cursorEl) gsap.to(cursorEl, { opacity: 1, duration: 0.3 });
          if (cursorDot) gsap.to(cursorDot, { opacity: 1, duration: 0.3 });
        }
        ringX(pointer.x); ringY(pointer.y);
        dotX(pointer.x); dotY(pointer.y);

        if (hovered && hoveredRect) {
          var s = setterFor(hovered);
          var dx = (pointer.x - (hoveredRect.left + hoveredRect.width / 2));
          var dy = (pointer.y - (hoveredRect.top + hoveredRect.height / 2));
          s.x(dx * 0.28);
          s.y(dy * 0.42);
        }
      }, { passive: true });

      bus.on(document, 'pointerleave', function () {
        visible = false;
        if (cursorEl) gsap.to(cursorEl, { opacity: 0, duration: 0.25 });
        if (cursorDot) gsap.to(cursorDot, { opacity: 0, duration: 0.25 });
      });

      function enter(e) {
        var el = e.currentTarget;
        hovered = el;
        hoveredRect = el.getBoundingClientRect();
        el.style.willChange = 'transform';
        if (cursorEl) {
          gsap.to(cursorEl, {
            scale: num(el.getAttribute('data-magnetic-scale'), 2.3),
            duration: 0.45, ease: 'power3.out', overwrite: 'auto'
          });
          cursorEl.classList.add('is-magnetic');
          cursorEl.style.mixBlendMode = 'difference';
        }
        if (cursorDot) gsap.to(cursorDot, { scale: 0.2, duration: 0.4, ease: 'power3.out', overwrite: 'auto' });
      }
      function leave(e) {
        var el = e.currentTarget;
        var s = setterFor(el);
        s.x(0); s.y(0);
        gsap.delayedCall(0.55, function () { el.style.willChange = 'auto'; });
        hovered = null; hoveredRect = null;
        if (cursorEl) {
          gsap.to(cursorEl, { scale: 1, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
          cursorEl.classList.remove('is-magnetic');
          cursorEl.style.mixBlendMode = '';
        }
        if (cursorDot) gsap.to(cursorDot, { scale: 1, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
      }

      var magnets = qsa('[data-magnetic]');
      magnets.forEach(function (el) {
        bus.on(el, 'pointerenter', enter);
        bus.on(el, 'pointerleave', leave);
      });

      cursorApi = {
        remeasure: function () { if (hovered) hoveredRect = hovered.getBoundingClientRect(); },
        magnets: magnets,
        reset: function () {
          magnets.forEach(function (el) { gsap.set(el, { x: 0, y: 0 }); el.style.willChange = 'auto'; });
        }
      };
    }

    /* ---- Nav ------------------------------------------------------ */
    var navLinks = [];
    function initNav() {
      navLinks = qsa('.nav-link[data-goto]', navEl || document);
      if (!navLinks.length) return;
      navLinks.forEach(function (link) {
        bus.on(link, 'click', function (e) {
          e.preventDefault();
          var idx = Math.round(num(link.getAttribute('data-goto'), 0));
          var target = null;
          for (var i = 0; i < chapters.length; i++) if (chapters[i].index === idx) target = chapters[i];
          if (!target) return;
          var rect = target.el.getBoundingClientRect();
          scrollToY(rect.top + scrollPos());
          if (!reduceMotion) {
            gctx.add(function () {
              gsap.fromTo(link, { scale: 0.92 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
            });
          }
        });
      });
      syncNav(0, true);

      // A wheel / touch gesture cancels a running nav scroll — never fight the user.
      var cancel = function () { if (scrollTween) { scrollTween.kill(); scrollTween = null; } };
      bus.on(window, 'wheel', cancel, { passive: true });
      bus.on(window, 'touchstart', cancel, { passive: true });
    }

    function syncNav(index, instant) {
      if (!navLinks.length) return;
      navLinks.forEach(function (link) {
        var active = Math.round(num(link.getAttribute('data-goto'), -1)) === index;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
        if (instant) gsap.set(link, { opacity: active ? 1 : 0.55 });
        else gsap.to(link, { opacity: active ? 1 : 0.55, duration: 0.45, ease: 'power2.out', overwrite: 'auto' });
      });
    }

    /* ---- Paint swatches -------------------------------------------- */
    var accent = { from: null, to: null, t: 0 };
    function initPaint() {
      var swatches = qsa('[data-paint]');
      if (!swatches.length) return;
      swatches.forEach(function (sw) {
        var color = sw.getAttribute('data-paint-color') || '#ff0000';
        bus.on(sw, 'click', function () {
          setPaint(color, sw, swatches);
        });
        bus.on(sw, 'keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPaint(color, sw, swatches); }
        });
      });
    }

    function setPaint(color, el, all) {
      state.paintColor = color;
      emit();
      if (all) {
        all.forEach(function (s) {
          var on = s === el;
          s.classList.toggle('is-active', on);
          s.setAttribute('aria-pressed', on ? 'true' : 'false');
          if (!reduceMotion) {
            gctx.add(function () {
              gsap.to(s, { scale: on ? 1.18 : 1, duration: 0.55, ease: 'back.out(2.6)', overwrite: 'auto' });
            });
          }
        });
      }
      // Animate the site accent (a CSS custom property) toward the new colour.
      var root = document.documentElement;
      var current = accent.to || getComputedStyle(root).getPropertyValue('--pui-accent').trim() || color;
      accent.from = current;
      accent.to = color;
      if (reduceMotion) { root.style.setProperty('--pui-accent', color); return; }
      gctx.add(function () {
        var prox = { t: 0 };
        gsap.to(prox, {
          t: 1, duration: 0.7, ease: 'power2.inOut', overwrite: true,
          onUpdate: function () {
            var c = color;
            try { c = gsap.utils.interpolate(accent.from, accent.to, prox.t); } catch (e) { c = color; }
            root.style.setProperty('--pui-accent', c);
          },
          onComplete: function () { root.style.setProperty('--pui-accent', color); }
        });
      });
    }

    /* ---- Sound toggle ---------------------------------------------- */
    var soundTween = null;
    function initSound() {
      if (!soundBtn) return;
      var bars = qsa('.bar, span, rect, line', soundBtn);
      if (bars.length) gsap.set(bars, { transformOrigin: '50% 50%', scaleY: 0.3 });
      soundBtn.setAttribute('aria-pressed', 'false');

      bus.on(soundBtn, 'click', function () {
        soundOn = !soundOn;
        soundBtn.classList.toggle('is-on', soundOn);
        soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
        try { requestSound(soundOn); }
        catch (e) { CONSOLE.warn('[PanigaleUI] requestSound threw: ' + (e && e.message)); }

        if (!bars.length) return;
        gctx.add(function () {
          if (soundTween) { soundTween.kill(); soundTween = null; }
          if (soundOn && !reduceMotion) {
            soundTween = gsap.to(bars, {
              scaleY: function () { return 0.55 + Math.random() * 0.65; },
              duration: 0.34, ease: 'sine.inOut', repeat: -1, yoyo: true,
              stagger: { each: 0.07, from: 'center' },
              repeatRefresh: true
            });
          } else {
            gsap.to(bars, { scaleY: soundOn ? 0.8 : 0.3, duration: 0.35, ease: 'power2.out' });
          }
        });
      });
    }

    /* ---- Explode toggle -------------------------------------------- */
    var explodeOn = false;
    function initExplode() {
      if (!explodeBtn) return;
      explodeBtn.setAttribute('aria-pressed', 'false');
      bus.on(explodeBtn, 'click', function () {
        explodeOn = !explodeOn;
        explodeBtn.classList.toggle('is-on', explodeOn);
        explodeBtn.setAttribute('aria-pressed', explodeOn ? 'true' : 'false');
        gctx.add(function () {
          gsap.to(explodeManual, {
            v: explodeOn ? 1 : 0,
            duration: reduceMotion ? 0.3 : 1.25,
            ease: reduceMotion ? 'none' : 'power3.inOut',
            overwrite: true
          });
          if (!reduceMotion) {
            gsap.fromTo(explodeBtn, { rotate: 0 }, { rotate: explodeOn ? 135 : 0, duration: 0.8, ease: 'expo.out' });
          }
        });
      });
    }

    /* --- 7f. The heartbeat: one flush per rAF ---------------------- */
    var lastTime = gsap.ticker.time;

    function heartbeat() {
      if (disposed) return;
      var now = gsap.ticker.time;
      var dt = clamp(now - lastTime, 0.0001, 1 / 20);
      lastTime = now;

      var sY = scrollPos();
      var vh = window.innerHeight || 800;

      /* active chapter: last one whose narrative window has started.
         Monotonic by construction, so `chapter` walks 0 -> 6 cleanly. */
      var idx = chapters.length ? chapters[0].index : 0;
      var prog = 0;
      for (var i = 0; i < chapters.length; i++) {
        var c = chapters[i];
        if (!c.st) continue;
        if (sY >= c.st.start - 1 || i === 0) { idx = c.index; prog = c.st.progress; }
      }
      if (idx !== activeChapter) {
        activeChapter = idx;
        syncNav(idx);
        if (hud) hud.setAttribute('data-chapter', String(idx));
      }

      var drive = narrative(idx, prog, now);

      state.chapter = idx;
      state.progress = round(clamp01(prog));
      state.rpm = round(drive.rpm);
      state.throttle = round(drive.throttle);
      state.speed = round(drive.speed);
      state.exploded = round(clamp01(Math.max(drive.exploded, explodeManual.v)));

      updateHud(drive, dt);
      if (parallaxItems.length) updateParallax(sY, vh);

      // Marquee skew follows scroll velocity, then eases back to zero.
      if (marquees.length && !reduceMotion) {
        skewTarget += (0 - skewTarget) * (1 - Math.pow(1 - 0.12, gsap.ticker.deltaRatio()));
        for (var m = 0; m < marquees.length; m++) {
          if (marquees[m].skewTo) marquees[m].skewTo(round(skewTarget, 2));
        }
      }

      if (progressSubs.length && lastGlobalProgress >= 0) {
        var gp = round(lastGlobalProgress);
        if (gp !== lastEmittedGlobal) {
          lastEmittedGlobal = gp;
          for (var s = 0; s < progressSubs.length; s++) {
            try { progressSubs[s](gp); } catch (e) { /* a bad subscriber must not stop the loop */ }
          }
        }
      }

      emit();
    }
    var lastEmittedGlobal = -1;

    safe('velocity', initVelocity);
    gsap.ticker.add(heartbeat);

    /* --- 7g. Resize / refresh -------------------------------------- */
    var resizeTimer = null;
    function onResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        refresh();
      }, 160);
    }
    bus.on(window, 'resize', onResize);
    bus.on(window, 'orientationchange', onResize);

    var ro = null;
    if (smooth && window.ResizeObserver) {
      ro = new window.ResizeObserver(function () {
        if (disposed) return;
        smooth.measure();
        if (ScrollTrigger) ScrollTrigger.refresh();
      });
      try { ro.observe(smooth.el); } catch (e) { ro = null; }
    }

    if (ScrollTrigger) {
      ScrollTrigger.addEventListener('refresh', measureParallax);
    }

    function refresh() {
      if (disposed) return;
      safe('refresh', function () {
        if (smooth) smooth.measure();
        for (var i = 0; i < marquees.length; i++) marquees[i].build();
        if (cursorApi) cursorApi.remeasure();
        if (ScrollTrigger) ScrollTrigger.refresh();
        measureParallax();
      });
    }

    /* --- 7h. Kick off ---------------------------------------------- */
    // Initial state so the 3D layer has something coherent from frame one.
    emit();
    if (Loader.isHidden() || !qs('#loader')) playIntro();
    else pendingIntro.push(playIntro);

    if (ScrollTrigger) {
      // Fonts/images landing later change every measurement.
      if (document.fonts && document.fonts.ready && isFn(document.fonts.ready.then)) {
        document.fonts.ready.then(function () { if (!disposed) refresh(); });
      }
      bus.on(window, 'load', function () { if (!disposed) refresh(); });
    }

    /* --- 7i. Teardown ---------------------------------------------- */
    function destroy() {
      if (disposed) return;
      disposed = true;
      gsap.ticker.remove(heartbeat);
      if (resizeTimer) clearTimeout(resizeTimer);
      bus.off();
      if (ro) { try { ro.disconnect(); } catch (e) { /* noop */ } }
      if (ScrollTrigger) {
        try { ScrollTrigger.removeEventListener('refresh', measureParallax); } catch (e) { /* noop */ }
      }
      if (velocityTrigger) velocityTrigger.kill();
      if (scrollTween) scrollTween.kill();
      if (cursorApi) cursorApi.reset();
      for (var i = 0; i < marquees.length; i++) safe('marquee-destroy', marquees[i].destroy);
      for (var r = 0; r < rollers.length; r++) safe('roller-destroy', rollers[r].revert);
      for (var s = 0; s < splits.length; s++) safe('split-revert', splits[s].revert);
      if (gctx) gctx.revert();          // kills every tween + ScrollTrigger made inside
      if (smooth) smooth.destroy();
      if (ScrollTrigger) ScrollTrigger.refresh();
      removeStyle();
      var i2 = instances.indexOf(handle);
      if (i2 > -1) instances.splice(i2, 1);
    }

    var handle = {
      refresh: refresh,
      destroy: destroy,
      getState: function () { return emitted; },
      onScrollProgress: onScrollProgress,
      playIntro: playIntro
    };
    instances.push(handle);
    return handle;
  }

  /* ------------------------------------------------------------------ *
   * 8. Public surface
   * ------------------------------------------------------------------ */
  var instances = [];
  var pendingIntro = [];

  window.PanigaleUI = {
    version: '1.0.0',
    init: function (ctx) {
      var h = safe('init', function () { return init(ctx); });
      return h || { refresh: NOOP, destroy: NOOP, getState: function () { return null; } };
    },
    setLoadProgress: function (p) { safe('setLoadProgress', function () { Loader.setProgress(p); }); },
    hideLoader: function (done) {
      safe('hideLoader', function () {
        Loader.hide(function () {
          while (pendingIntro.length) {
            var fn = pendingIntro.shift();
            safe('intro', fn);
          }
          if (isFn(done)) done();
        });
      });
    }
  };

})(window, document);
