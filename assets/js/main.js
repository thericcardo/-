/* =========================================================
   MONSTER ULTRA WHITE — concept site
   Vanilla JS, nessuna dipendenza.
   ========================================================= */
(() => {
  'use strict';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- storage a prova di browser blindato ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignora */ } }
  };

  /* ---------- 1. Preloader ---------- */
  const preloader = $('#preloader');
  const hidePreloader = () => preloader && preloader.classList.add('done');
  window.addEventListener('load', () => setTimeout(hidePreloader, reduced ? 0 : 650));
  setTimeout(hidePreloader, 3000); // rete lenta: non bloccare mai la pagina

  /* ---------- 2. Tema ---------- */
  const root = document.documentElement;
  const themeBtn = $('#themeBtn');
  const saved = store.get('uw-theme');

  if (saved) {
    root.setAttribute('data-theme', saved);
  } else {
    root.removeAttribute('data-theme'); // segue il sistema
  }

  const currentTheme = () => {
    const attr = root.getAttribute('data-theme');
    if (attr) return attr;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  themeBtn?.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    store.set('uw-theme', next);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'dark' ? '#0a0b0d' : '#f2f3f5');
  });

  /* ---------- 3. Nav: sticky, progress, menu mobile ---------- */
  const nav = $('#nav');
  const progress = $('#progress');
  const navLinks = $('#navLinks');
  const navToggle = $('#navToggle');

  let ticking = false;
  const onScroll = () => {
    const y = window.scrollY;
    nav?.classList.toggle('stuck', y > 8);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.setProperty('--p', (max > 0 ? (y / max) * 100 : 0) + '%');
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  const closeMenu = () => {
    navLinks?.classList.remove('open');
    navToggle?.setAttribute('aria-expanded', 'false');
  };
  navToggle?.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  $$('#navLinks a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  /* Link attivo in base alla sezione visibile */
  const sections = $$('main section[id]');
  const linkFor = id => $(`#navLinks a[href="#${id}"]`);
  if ('IntersectionObserver' in window && sections.length) {
    const navObs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        $$('#navLinks a').forEach(a => a.classList.remove('active'));
        linkFor(entry.target.id)?.classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(s => navObs.observe(s));
  }

  /* ---------- 4. Scroll fluido dai bottoni ---------- */
  $$('[data-scroll]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = $(btn.dataset.scroll);
      target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ---------- 5. Reveal + contatori ---------- */
  const countUp = el => {
    const target = Number(el.dataset.count || 0);
    if (reduced || !target) { el.firstChild.nodeValue = String(target); return; }
    const dur = 1200;
    const t0 = performance.now();
    const tick = now => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.firstChild.nodeValue = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if ('IntersectionObserver' in window) {
    const revealObs = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        $$('[data-count]', entry.target).forEach(countUp);
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(el => revealObs.observe(el));
  } else {
    $$('.reveal').forEach(el => el.classList.add('in'));
    $$('[data-count]').forEach(el => { el.firstChild.nodeValue = el.dataset.count; });
  }

  /* ---------- 6. Accordion ---------- */
  $$('.acc__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      // un pannello aperto per volta, all'interno dello stesso accordion
      const group = btn.closest('.acc');
      $$('.acc__btn', group).forEach(b => b.setAttribute('aria-expanded', 'false'));
      btn.setAttribute('aria-expanded', String(!open));
    });
  });

  /* ---------- 7. Selettore gusti ---------- */
  const flavors = $$('.flavor');
  const fName = $('#fName'), fDesc = $('#fDesc');
  const fNotes = $('#fNotes'), fYear = $('#fYear'), fMood = $('#fMood');

  const hexToRgba = (hex, a) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };

  const applyFlavor = btn => {
    const { accent, deep, name, desc, notes, year, mood } = btn.dataset;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-deep', deep);
    root.style.setProperty('--accent-soft', hexToRgba(accent, 0.16));
    root.style.setProperty('--glow', hexToRgba(accent, 0.55));

    if (fName) fName.textContent = name;
    if (fDesc) fDesc.textContent = desc;
    if (fNotes) fNotes.textContent = notes;
    if (fYear) fYear.textContent = year;
    if (fMood) fMood.textContent = mood;

    flavors.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  };

  flavors.forEach(btn => btn.addEventListener('click', () => applyFlavor(btn)));

  /* ---------- 8. Hero: luce, parallasse lattina, magnetismo bottoni ---------- */
  const spot = $('#spot');
  const can = $('#can');
  const stage = $('#canStage');

  if (!reduced && spot && stage) {
    let raf = null, mx = 0, my = 0;
    const move = e => {
      mx = e.clientX; my = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        spot.style.setProperty('--x', mx + 'px');
        spot.style.setProperty('--y', (my + window.scrollY) + 'px');

        const r = stage.getBoundingClientRect();
        const dx = (mx - (r.left + r.width / 2)) / r.width;
        const dy = (my - (r.top + r.height / 2)) / r.height;
        if (can) {
          can.style.transform =
            `rotateY(${(dx * 14).toFixed(2)}deg) rotateX(${(-dy * 9).toFixed(2)}deg) translateZ(0)`;
        }
        raf = null;
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
  }

  $$('.btn').forEach(btn => {
    btn.addEventListener('pointermove', e => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      btn.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* ---------- 9. Particelle di freddo ---------- */
  if (!reduced && stage) {
    const N = 14;
    for (let i = 0; i < N; i++) {
      const p = document.createElement('i');
      p.className = 'frost';
      const size = 3 + Math.random() * 5;
      p.style.width = p.style.height = size.toFixed(1) + 'px';
      p.style.left = (10 + Math.random() * 80).toFixed(1) + '%';
      p.style.bottom = (Math.random() * 30).toFixed(1) + '%';
      p.style.animationDuration = (5 + Math.random() * 6).toFixed(1) + 's';
      p.style.animationDelay = (Math.random() * 6).toFixed(1) + 's';
      p.style.opacity = (0.25 + Math.random() * 0.4).toFixed(2);
      stage.appendChild(p);
    }
  }

  /* ---------- 10. Form demo + toast ---------- */
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
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
    if (!ok) { say('Serve un indirizzo email valido.'); input?.focus(); return; }
    input.value = '';
    say('Fatto — ma è una demo: niente è stato inviato.');
  });

  /* ---------- 11. Anno corrente ---------- */
  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
