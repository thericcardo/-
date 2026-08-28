/* =========================================================
   MONSTER ULTRA WHITE — concept site
   Motion engine: un solo loop rAF, interpolazione su tutto,
   solo transform/opacity. Nessuna dipendenza.
   ========================================================= */
(() => {
  'use strict';

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const mq = m => window.matchMedia(m);
  const reduced = mq('(prefers-reduced-motion: reduce)').matches;
  const fine = mq('(pointer: fine)').matches;

  const lerp  = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const round = (v, d = 2) => Number(v.toFixed(d));

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignora */ } }
  };

  /* =======================================================
     0. Loop centrale — tutti gli effetti scrivono qui dentro
     ======================================================= */
  const tasks = new Set();
  let rafId = null;
  const frame = () => { tasks.forEach(fn => fn()); rafId = requestAnimationFrame(frame); };
  const onFrame = fn => { tasks.add(fn); if (rafId === null) rafId = requestAnimationFrame(frame); };

  /* Stato di scroll condiviso: y reale, sy interpolata, v velocità */
  const S = { y: window.scrollY, sy: window.scrollY, v: 0, vh: innerHeight, vw: innerWidth };

  window.addEventListener('scroll', () => { S.y = window.scrollY; }, { passive: true });
  window.addEventListener('resize', () => {
    S.vh = innerHeight; S.vw = innerWidth; measureAll();
  }, { passive: true });

  onFrame(() => {
    const prev = S.sy;
    S.sy = reduced ? S.y : lerp(S.sy, S.y, 0.14);
    if (Math.abs(S.sy - S.y) < 0.08) S.sy = S.y;
    S.v = S.sy - prev;
  });

  const measurers = [];
  const measureAll = () => measurers.forEach(fn => fn());

  /* =======================================================
     1. Preloader: contatore reale + sipario curvo
     ======================================================= */
  const preloader = $('#preloader');
  const preBar = $('#preBar');
  const preNum = $('#preNum');
  let heroReady = () => {};

  (function boot() {
    if (!preloader) return;
    let p = 0, ready = false, finished = false;
    const t0 = performance.now();

    const markReady = () => { ready = true; };
    window.addEventListener('load', markReady);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(markReady);
    setTimeout(markReady, 2600);            // rete lenta: non bloccare mai la pagina

    const finish = () => {
      if (finished) return;
      finished = true;
      preloader.classList.add('done');
      setTimeout(heroReady, 240);
      setTimeout(() => preloader.remove(), 1600);
    };

    if (reduced) { preloader.style.transition = 'none'; finish(); return; }

    const step = () => {
      const cap = ready ? 100 : Math.min(93, (performance.now() - t0) / 8);
      p = lerp(p, cap, 0.10);
      if (preBar) preBar.style.width = round(p, 1) + '%';
      if (preNum) preNum.textContent = String(Math.round(p));
      if (p > 99.4) { if (preNum) preNum.textContent = '100'; if (preBar) preBar.style.width = '100%'; finish(); }
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })();

  /* =======================================================
     2. Split del testo (parole e caratteri)
     ======================================================= */
  const wrapChunks = (node, mode) => {
    const frag = document.createDocumentFragment();
    const parts = node.nodeValue.split(mode === 'chars' ? '' : /(\s+)/);
    parts.forEach(part => {
      if (part === '') return;
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
      if (mode === 'chars') {
        const ch = document.createElement('span');
        ch.className = 'ch';
        ch.textContent = part;
        frag.appendChild(ch);
      } else {
        const w = document.createElement('span');
        const i = document.createElement('i');
        w.className = 'w';
        i.textContent = part;
        w.appendChild(i);
        frag.appendChild(w);
      }
    });
    return frag;
  };

  const split = (el, mode) => {
    if (!el || el.dataset.splitDone) return [];
    const walk = node => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 3 && child.nodeValue.trim()) {
          node.replaceChild(wrapChunks(child, mode), child);
        } else if (child.nodeType === 1 && !child.classList.contains('w') && !child.classList.contains('ch')) {
          walk(child);
        }
      });
    };
    walk(el);
    el.dataset.splitDone = '1';
    const bits = $$(mode === 'chars' ? '.ch' : '.w > i', el);
    bits.forEach((b, i) => b.style.setProperty('--d', (i * (mode === 'chars' ? 42 : 68)) + 'ms'));
    return bits;
  };

  if (!reduced) {
    $$('[data-split]').forEach(el => split(el, 'words'));

    const heroTitle = $('[data-chars]');
    if (heroTitle) {
      // Le righe con il gradiente metallico non vanno spezzate: background-clip:text
      // non ritaglia il testo dei figli, quindi restano un blocco unico.
      let i = 0;
      $$('.line > span', heroTitle).forEach(line => {
        if (line.classList.contains('text-chrome')) {
          line.classList.add('ch-block');
          line.style.setProperty('--d', i * 42 + 'ms');
          i += 4;
        } else {
          split(line, 'chars').forEach(ch => {
            ch.style.setProperty('--d', i * 42 + 'ms');
            i++;
          });
        }
      });
      heroTitle.classList.add('chars-on');  // non 'split': collide con la utility di layout .split
      heroReady = () => heroTitle.classList.add('on');
    }
  } else {
    $$('[data-split]').forEach(el => el.classList.add('in'));
  }

  /* =======================================================
     3. Reveal allo scroll (+ stagger automatico)
     ======================================================= */
  $$('[data-stagger]').forEach(box => {
    const step = Number(box.dataset.stagger) || 80;
    Array.from(box.children).forEach((child, i) => {
      if (!child.style.getPropertyValue('--d')) child.style.setProperty('--d', i * step + 'ms');
      child.classList.add('reveal');
    });
  });

  const easeOutExpo = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

  const countUp = el => {
    const target = Number(el.dataset.count || 0);
    if (reduced || !target) { el.firstChild.nodeValue = String(target); return; }
    const dur = 1500, t0 = performance.now();
    const tick = now => {
      const p = clamp((now - t0) / dur);
      el.firstChild.nodeValue = String(Math.round(target * easeOutExpo(p)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const revealTargets = $$('.reveal, [data-split]');
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries, o) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        $$('[data-count]', e.target).forEach(countUp);
        o.unobserve(e.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach(el => obs.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('in'));
    $$('[data-count]').forEach(el => { el.firstChild.nodeValue = el.dataset.count; });
  }

  /* =======================================================
     4. Nav: progress, retrazione, sezione attiva, menu
     ======================================================= */
  const nav = $('#nav');
  const progress = $('#progress');
  const navLinks = $('#navLinks');
  const navToggle = $('#navToggle');
  let lastY = 0;

  onFrame(() => {
    const y = S.y;
    nav?.classList.toggle('stuck', y > 8);
    const max = document.documentElement.scrollHeight - S.vh;
    progress?.style.setProperty('--p', (max > 0 ? (y / max) * 100 : 0) + '%');
    if (!navLinks?.classList.contains('open')) {
      const down = y > lastY + 4, up = y < lastY - 4;
      if (down && y > 420) nav?.classList.add('hidden');
      else if (up) nav?.classList.remove('hidden');
    }
    if (Math.abs(y - lastY) > 3) lastY = y;
  });

  const closeMenu = () => {
    navLinks?.classList.remove('open');
    navToggle?.setAttribute('aria-expanded', 'false');
  };
  navToggle?.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
    if (open) nav?.classList.remove('hidden');
  });
  $$('#navLinks a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  // la barra deve tornare se ci arrivi col tab o col puntatore
  nav?.addEventListener('focusin', () => nav.classList.remove('hidden'));
  window.addEventListener('pointermove', e => {
    if (e.clientY < 90) nav?.classList.remove('hidden');
  }, { passive: true });

  const sections = $$('main section[id]');
  if ('IntersectionObserver' in window && sections.length) {
    const navObs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        $$('#navLinks a').forEach(a => a.classList.remove('active'));
        $(`#navLinks a[href="#${e.target.id}"]`)?.classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => navObs.observe(s));
  }

  $$('[data-scroll]').forEach(btn => {
    btn.addEventListener('click', () => {
      $(btn.dataset.scroll)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* =======================================================
     5. Parallasse + uscita dell'hero
     ======================================================= */
  if (!reduced) {
    const pars = $$('[data-par]').map(el => ({ el, k: parseFloat(el.dataset.par) || 0, c: 0, on: true }));
    const measurePar = () => pars.forEach(o => {
      o.el.style.transform = '';
      const r = o.el.getBoundingClientRect();
      o.c = r.top + window.scrollY + r.height / 2;
    });
    measurers.push(measurePar);
    measurePar();

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => {
        const o = pars.find(x => x.el === e.target);
        if (o) o.on = e.isIntersecting;
      }), { rootMargin: '15% 0px 15% 0px' });
      pars.forEach(o => io.observe(o.el));
    }

    onFrame(() => {
      const mid = S.sy + S.vh / 2;
      pars.forEach(o => {
        if (!o.on) return;
        o.el.style.transform = `translate3d(0, ${round((mid - o.c) * o.k)}px, 0)`;
      });
    });

    const heroInner = $('.hero__inner');
    const hint = $('.scroll-hint');
    if (heroInner) {
      onFrame(() => {
        const p = clamp(S.sy / (S.vh * 0.95));
        if (p >= 1 && heroInner.dataset.off === '1') return;
        heroInner.dataset.off = p >= 1 ? '1' : '0';
        heroInner.style.transform = `translate3d(0, ${round(p * -80)}px, 0) scale(${round(1 - p * 0.07, 4)})`;
        heroInner.style.opacity = round(clamp(1 - p * 1.25), 3);
        if (hint) hint.style.opacity = round(clamp(1 - p * 5), 2);
      });
    }
  }

  /* =======================================================
     6. Lattina dell'hero: tilt interpolato + rotazione su scroll
     ======================================================= */
  const can = $('#can');
  const stage = $('#canStage');
  if (!reduced && can && stage) {
    let tx = 0, ty = 0, cx = 0, cy = 0, visible = true;

    window.addEventListener('pointermove', e => {
      const r = stage.getBoundingClientRect();
      tx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width || 1), -1.4, 1.4);
      ty = clamp((e.clientY - (r.top + r.height / 2)) / (r.height || 1), -1.4, 1.4);
    }, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(stage);
    }

    onFrame(() => {
      if (!visible) return;
      cx = lerp(cx, tx, 0.07);
      cy = lerp(cy, ty, 0.07);
      const spin = S.sy * 0.035;
      can.style.transform =
        `rotateY(${round(cx * 15 + spin)}deg) rotateX(${round(-cy * 9)}deg)`;
    });
  }

  /* =======================================================
     7. Anatomia: lattina in sticky guidata dallo scroll
     ======================================================= */
  (function anatomy() {
    const sec = $('#anatomia');
    const canB = $('#canB');
    const scan = $('.anatomy__scan');
    const num = $('#anaNum');
    const steps = $$('.anatomy__step');
    if (!sec || !steps.length) return;

    if (reduced) { steps.forEach(s => s.classList.add('on')); return; }

    let visible = false, current = -1, prog = 0;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(es => { visible = es[0].isIntersecting; },
        { rootMargin: '20% 0px 20% 0px' }).observe(sec);
    } else visible = true;

    onFrame(() => {
      if (!visible) return;
      const r = sec.getBoundingClientRect();
      const span = Math.max(r.height - S.vh * 0.7, 1);
      prog = lerp(prog, clamp((-r.top + S.vh * 0.35) / span), 0.12);

      if (canB) {
        canB.style.transform =
          `translate3d(0, ${round(prog * -26)}px, 0) rotateY(${round(-14 + prog * 28)}deg) scale(${round(1 + prog * 0.06, 3)})`;
      }
      if (scan) scan.style.setProperty('--scan', round(10 + prog * 78, 1) + '%');

      // step più vicino al centro dello schermo
      let best = 0, bestD = Infinity;
      steps.forEach((s, i) => {
        const b = s.getBoundingClientRect();
        const d = Math.abs(b.top + b.height / 2 - S.vh * 0.5);
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best !== current) {
        current = best;
        steps.forEach((s, i) => s.classList.toggle('on', i === best));
        if (num) num.textContent = String(best + 1).padStart(2, '0');
      }
    });
  })();

  /* =======================================================
     8. Marquee infinito, sensibile alla velocità di scroll
     ======================================================= */
  (function marquee() {
    const wrap = $('.marquee');
    const track = $('.marquee__track');
    if (!wrap || !track) return;
    if (reduced) { track.style.transform = 'none'; return; }

    const gap = parseFloat(getComputedStyle(track).columnGap) || 40;
    let unit = 0, x = 0, hover = false;

    const build = () => {
      const first = track.children[0];
      if (!first) return;
      unit = first.getBoundingClientRect().width + gap;
      while (track.children.length * unit < S.vw + unit * 2 && track.children.length < 24) {
        track.appendChild(first.cloneNode(true));
      }
    };
    measurers.push(() => { unit = (track.children[0]?.getBoundingClientRect().width || 0) + gap; build(); });
    build();

    wrap.addEventListener('pointerenter', () => { hover = true; });
    wrap.addEventListener('pointerleave', () => { hover = false; });

    onFrame(() => {
      if (!unit) return;
      const boost = Math.min(Math.abs(S.v) * 0.14, 7);
      x -= (hover ? 0.12 : 0.6) + boost;
      if (x <= -unit) x += unit;
      track.style.transform = `translate3d(${round(x)}px, 0, 0)`;
      wrap.style.transform = `scaleY(${round(1 + Math.min(Math.abs(S.v) * 0.004, 0.12), 3)})`;
    });
  })();

  /* =======================================================
     9. Cursore interpolato
     ======================================================= */
  if (fine && !reduced) {
    const dot = $('#cur1'), ring = $('#cur2');
    if (dot && ring) {
      let mxT = S.vw / 2, myT = S.vh / 2, dx = mxT, dy = myT, rx = mxT, ry = myT;
      window.addEventListener('pointermove', e => {
        mxT = e.clientX; myT = e.clientY;
        document.body.classList.add('has-cursor');
      }, { passive: true });
      document.addEventListener('pointerover', e => {
        const hot = e.target.closest('a, button, input, .flavor, .card, .moment, .acc__btn');
        document.body.classList.toggle('cursor-hot', !!hot);
      });
      window.addEventListener('blur', () => document.body.classList.remove('has-cursor'));

      onFrame(() => {
        dx = lerp(dx, mxT, 0.42); dy = lerp(dy, myT, 0.42);
        rx = lerp(rx, mxT, 0.16); ry = lerp(ry, myT, 0.16);
        dot.style.transform  = `translate3d(${round(dx)}px, ${round(dy)}px, 0)`;
        ring.style.transform = `translate3d(${round(rx)}px, ${round(ry)}px, 0)`;
      });
    }
  }

  /* =======================================================
     10. Bottoni magnetici + tilt delle carte
     ======================================================= */
  if (fine && !reduced) {
    const magnets = $$('.btn, .icon-btn, .flavor').map(el => ({ el, tx: 0, ty: 0, cx: 0, cy: 0, on: false }));
    magnets.forEach(m => {
      m.el.addEventListener('pointerenter', () => { m.on = true; });
      m.el.addEventListener('pointermove', e => {
        const r = m.el.getBoundingClientRect();
        m.tx = (e.clientX - (r.left + r.width / 2)) * 0.32;
        m.ty = (e.clientY - (r.top + r.height / 2)) * 0.4;
        m.el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        m.el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
      m.el.addEventListener('pointerleave', () => { m.on = false; m.tx = 0; m.ty = 0; });
    });
    onFrame(() => {
      magnets.forEach(m => {
        if (!m.on && Math.abs(m.cx) < 0.06 && Math.abs(m.cy) < 0.06) return;
        m.cx = lerp(m.cx, m.tx, 0.16);
        m.cy = lerp(m.cy, m.ty, 0.16);
        m.el.style.transform =
          `translate3d(${round(m.cx)}px, ${round(m.cy - (m.on ? 3 : 0))}px, 0)`;
      });
    });

    $$('.card, .stat, .moment').forEach(el => {
      el.dataset.tilt = '';
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        el.style.transform =
          `perspective(900px) rotateX(${round((0.5 - py) * 5)}deg) rotateY(${round((px - 0.5) * 6)}deg) translate3d(0,-5px,0)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* =======================================================
     11. Accordion
     ======================================================= */
  $$('.acc__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      const group = btn.closest('.acc');
      $$('.acc__btn', group).forEach(b => b.setAttribute('aria-expanded', 'false'));
      btn.setAttribute('aria-expanded', String(!open));
    });
  });

  /* =======================================================
     12. Gusti: variabili animate + onda di colore
     ======================================================= */
  const root = document.documentElement;
  const flavors = $$('.flavor');
  const fName = $('#fName'), fDesc = $('#fDesc');
  const fNotes = $('#fNotes'), fYear = $('#fYear'), fMood = $('#fMood');

  const hexToRgba = (hex, a) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  let washBox = null;
  const wash = (x, y, color) => {
    if (reduced) return;
    if (!washBox) { washBox = document.createElement('div'); washBox.className = 'wash'; document.body.appendChild(washBox); }
    const r = Math.hypot(Math.max(x, S.vw - x), Math.max(y, S.vh - y)) * 2.1;
    const i = document.createElement('i');
    i.style.cssText = `left:${x}px;top:${y}px;width:${r}px;height:${r}px;--w:${color}`;
    washBox.appendChild(i);
    i.addEventListener('animationend', () => i.remove());
  };

  const applyFlavor = (btn, ev) => {
    const d = btn.dataset;
    root.style.setProperty('--accent', d.accent);
    root.style.setProperty('--accent-deep', d.deep);
    root.style.setProperty('--accent-soft', hexToRgba(d.accent, 0.16));
    root.style.setProperty('--glow', hexToRgba(d.accent, 0.55));

    if (fName) fName.textContent = d.name;
    if (fDesc) fDesc.textContent = d.desc;
    if (fNotes) fNotes.textContent = d.notes;
    if (fYear) fYear.textContent = d.year;
    if (fMood) fMood.textContent = d.mood;

    flavors.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));

    const panel = $('#flavorPanel');
    if (panel && !reduced) {
      panel.animate(
        [{ opacity: .3, transform: 'translateY(14px) scale(.985)' }, { opacity: 1, transform: 'none' }],
        { duration: 750, easing: 'cubic-bezier(.16,1,.3,1)' }
      );
    }
    const r = btn.getBoundingClientRect();
    wash(ev ? ev.clientX : r.left + r.width / 2, ev ? ev.clientY : r.top + r.height / 2, d.accent);
  };

  flavors.forEach(btn => btn.addEventListener('click', e => applyFlavor(btn, e)));

  /* =======================================================
     13. Tema con rivelazione circolare
     ======================================================= */
  const themeBtn = $('#themeBtn');
  const saved = store.get('uw-theme');
  if (saved) root.setAttribute('data-theme', saved); else root.removeAttribute('data-theme');

  const currentTheme = () =>
    root.getAttribute('data-theme') || (mq('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  themeBtn?.addEventListener('click', e => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    const swap = () => {
      root.setAttribute('data-theme', next);
      store.set('uw-theme', next);
      $('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0a0b0d' : '#f2f3f5');
    };

    if (reduced || !document.startViewTransition) { swap(); return; }

    const r = themeBtn.getBoundingClientRect();
    const x = e.clientX || r.left + r.width / 2;
    const y = e.clientY || r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, S.vw - x), Math.max(y, S.vh - y));

    document.startViewTransition(swap).ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' }
      );
    });
  });

  /* =======================================================
     14. Form demo + toast
     ======================================================= */
  const toast = $('#toast');
  let toastTimer = null;
  const say = msg => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  };

  $('#form')?.addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#email');
    const value = (input?.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      say('Serve un indirizzo email valido.');
      if (input && !reduced) {
        input.animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }],
          { duration: 380, easing: 'ease-out' }
        );
      }
      input?.focus();
      return;
    }
    input.value = '';
    say('Fatto — ma è una demo: niente è stato inviato.');
  });

  /* ---------- Anno corrente ---------- */
  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
