/* ═══════════════════════════════════════════════════════════════════════════
   main.js — avvio e cablaggio
   ---------------------------------------------------------------------------
   Tiene insieme i tre mondi che non si conoscono fra loro:
     PanigaleUI     (DOM, scroll, GSAP)  →  emette stato
     PanigaleScene  (WebGL)              →  consuma stato
     PanigaleAudio  (Web Audio)          →  consuma stato, solo dopo un gesto

   Ogni pezzo è opzionale: se un modulo manca o esplode, la pagina resta
   leggibile e gli altri continuano a funzionare.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global, doc) {
  'use strict';

  var html = doc.documentElement;

  /* ─────────────────────────── Ambiente ─────────────────────────── */

  var reduceMotion = global.matchMedia
    ? global.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  /* Euristica di qualità: niente benchmark all'avvio, solo segnali economici.
     Il degrado vero avviene a runtime in scene.js misurando gli fps. */
  function pickQuality() {
    var mem = global.navigator && global.navigator.deviceMemory;
    var cores = global.navigator && global.navigator.hardwareConcurrency;
    var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
    var narrow = (global.innerWidth || 1280) < 820;
    if (reduceMotion) return 'low';
    if (mem && mem <= 4) return 'low';
    if (cores && cores <= 4) return 'low';
    if (coarse && narrow) return 'low';
    return 'high';
  }

  var quality = pickQuality();

  /* ─────────────────────────── Stato condiviso ─────────────────────────── */

  var scene = null;
  var audio = null;
  var ui = null;
  var audioWanted = false;
  var lastState = { chapter: 0, progress: 0, rpm: 0.12, throttle: 0, speed: 0, exploded: 0 };

  function applyState(s) {
    if (!s) return;
    lastState = s;
    if (scene) {
      try { scene.setState(s); } catch (e) { /* la scena non deve poter uccidere la pagina */ }
    }
    if (audio && audio.isRunning()) {
      try {
        if (typeof s.rpm === 'number') audio.setRPM(s.rpm);
        if (typeof s.throttle === 'number') audio.setThrottle(s.throttle);
      } catch (e) { /* idem per l'audio */ }
    }
  }

  /* ─────────────────────────── Audio ───────────────────────────
     L'AudioContext nasce solo dentro un gesto utente: è un requisito dei
     browser, non una scelta stilistica. */

  function toggleAudio(on) {
    audioWanted = !!on;
    if (!global.PanigaleAudio || !global.PanigaleAudio.isSupported()) return false;

    if (audioWanted) {
      if (!audio) {
        try {
          audio = global.PanigaleAudio.create({ masterVolume: 0.55 });
        } catch (e) { audio = null; return false; }
      }
      try {
        var p = audio.start();
        if (p && p.then) p.catch(function () { /* bloccato dal browser */ });
        audio.setRPM(lastState.rpm || 0.12);
        audio.setThrottle(lastState.throttle || 0);
      } catch (e) { return false; }
    } else if (audio) {
      try { audio.stop(); } catch (e) { /* niente */ }
    }
    return true;
  }

  /* ─────────────────────────── Avvio ─────────────────────────── */

  function bootUI() {
    if (!global.PanigaleUI || !global.gsap) {
      html.classList.add('js-off');
      return null;
    }
    try {
      return global.PanigaleUI.init({
        setSceneState: applyState,
        requestSound: toggleAudio,
        reduceMotion: reduceMotion,
        quality: quality
      });
    } catch (e) {
      html.classList.add('js-off');
      if (global.console) console.error('[main] UI non inizializzata:', e);
      return null;
    }
  }

  function setProgress(p, label) {
    if (global.PanigaleUI && global.PanigaleUI.setLoadProgress) {
      global.PanigaleUI.setLoadProgress(p);
    }
    var msg = doc.getElementById('loader-msg');
    if (msg && label) msg.textContent = label;
  }

  function finishLoading() {
    html.classList.add('anim-ready');
    if (global.PanigaleUI && global.PanigaleUI.hideLoader) {
      global.PanigaleUI.hideLoader(function () {
        if (ui && ui.refresh) ui.refresh();
      });
    } else {
      var l = doc.getElementById('loader');
      if (l) l.hidden = true;
    }
  }

  function bootScene() {
    var canvas = doc.getElementById('scene-canvas');
    var fallback = doc.getElementById('scene-fallback');

    if (!canvas || !global.THREE || !global.PanigaleScene || !global.PanigaleScene.isSupported()) {
      if (canvas) canvas.hidden = true;
      if (fallback) fallback.hidden = false;
      setProgress(1, 'Modalità testo');
      setTimeout(finishLoading, 300);
      return;
    }

    try {
      scene = global.PanigaleScene.create(canvas, {
        quality: quality,
        onProgress: function (p, label) { setProgress(p * 0.98, label); }
      });
    } catch (e) {
      if (global.console) console.error('[main] renderer non creato:', e);
      canvas.hidden = true;
      if (fallback) fallback.hidden = false;
      setProgress(1, 'Modalità testo');
      setTimeout(finishLoading, 300);
      return;
    }

    scene.build()
      .then(function () {
        scene.start();
        applyState(lastState);
        setProgress(1, 'Pronta');
        /* Un respiro prima di scoprire la scena: il primo frame reale deve
           essere già a schermo quando il preloader se ne va. */
        setTimeout(finishLoading, 260);
      })
      .catch(function (err) {
        if (global.console) console.error('[main] costruzione fallita:', err);
        canvas.hidden = true;
        if (fallback) fallback.hidden = false;
        setProgress(1, 'Modalità testo');
        setTimeout(finishLoading, 300);
      });
  }

  /* Il canvas è dietro a tutto e non riceve eventi: la rotellina va sempre
     alla pagina. Nessun listener da aggiungere, ma la classe del cursore sì. */
  function enableCursor() {
    if (global.matchMedia && global.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      doc.body.classList.add('cursor-ready');
    }
  }

  function boot() {
    enableCursor();
    ui = bootUI();
    setProgress(0.04, 'Accensione impianto');
    bootScene();

    /* Mette in pausa il rendering quando la scheda è nascosta: nessun motivo
       di far girare una GPU per una pagina che nessuno guarda. */
    doc.addEventListener('visibilitychange', function () {
      if (!scene) return;
      if (doc.hidden) {
        scene.stop();
        if (audio && audio.isRunning()) audio.stop();
      } else {
        scene.start();
        if (audioWanted && audio) toggleAudio(true);
      }
    });

    /* Diagnostica a portata di console, senza inquinare la UI. */
    global.__panigale = {
      info: function () { return scene ? scene.getInfo() : null; },
      state: function () { return lastState; },
      quality: quality
    };
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window, document);
