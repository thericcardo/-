/**
 * Calzino — il motore del timer.
 *
 * Due scelte che tengono in piedi tutto il resto:
 *
 * 1. il tempo si misura con un istante di fine (`endsAt`), non contando i tick:
 *    così il conto resta giusto anche se la scheda va in sottofondo, dove i
 *    browser rallentano i timer, o se il telefono si blocca;
 * 2. lo stato vive in localStorage a ogni cambio, mai a ogni tick: ricaricando
 *    la pagina la sessione riprende dal punto in cui era.
 */
const Timer = (() => {
  "use strict";

  const TICK_MS = 250;

  /** Sotto i cinque minuti una sessione libera non fa calzino: è un'occhiata,
      non del lavoro. Sopra il tetto si chiude da sola. */
  const MINIMO_LIBERA = 5 * 60000;

  const listeners = new Set();
  let ticker = null;
  let audioCtx = null;
  let wakeLock = null;

  let s = {
    modo: "timer",         // timer (conto alla rovescia) | libera (cronometro)
    phase: "focus",        // focus | short | long
    status: "idle",        // idle | running | paused
    endsAt: 0,             // epoch ms, valido solo se status === "running"
    remainingMs: 0,        // valido quando idle o paused
    startedAt: null,       // ISO, inizio della fase corrente
    taskId: null,
    cycle: 0,              // sessioni di concentrazione fatte in questo giro
    escapes: 0             // volte che si è usciti dalla scheda in questa fase
  };

  /** Il tetto di una sessione libera: due ore, sei con il Pro. */
  function limiteLibera() {
    return typeof Licenza !== "undefined" ? Licenza.limiteLibera() : 2 * 3600000;
  }

  /** Quanto dura la fase corrente. In libera il conto sale, ma il tetto resta
      un conto alla rovescia come gli altri: cambia solo come lo si mostra. */
  function totaleMs() {
    if (s.modo === "libera" && s.phase === "focus") return limiteLibera();
    return Store.durationFor(s.phase) * 60000;
  }

  /* ------------------------------------------------------------ ripristino */

  function boot() {
    s.modo = Store.settings().modo === "libera" ? "libera" : "timer";
    const saved = Store.running();
    if (saved && typeof saved === "object" && ["focus", "short", "long"].includes(saved.phase)) {
      s = Object.assign({}, s, saved);
      if (s.status === "running") {
        // Il tempo passato a pagina chiusa conta: è tempo vero.
        if (Date.now() >= s.endsAt) {
          complete(true);
          return;
        }
        startTicker();
      }
    } else {
      s.remainingMs = totaleMs();
    }
    emit();
  }

  function persist() {
    Store.setRunning(s.status === "idle" && s.escapes === 0 && s.cycle === 0 ? null : Object.assign({}, s));
  }

  /* ------------------------------------------------------------- notifiche */

  function on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit(event) {
    const snap = snapshot();
    for (const fn of listeners) {
      try { fn(snap, event || null); } catch (err) { console.error(err); }
    }
  }

  function snapshot() {
    return {
      phase: s.phase,
      status: s.status,
      taskId: s.taskId,
      cycle: s.cycle,
      escapes: s.escapes,
      modo: s.modo,
      totalMs: totaleMs(),
      minimoMs: MINIMO_LIBERA,
      remainingMs: s.status === "running" ? Math.max(0, s.endsAt - Date.now()) : Math.max(0, s.remainingMs)
    };
  }

  /* ---------------------------------------------------------------- motore */

  function startTicker() {
    stopTicker();
    ticker = setInterval(() => {
      if (s.status !== "running") return stopTicker();
      if (Date.now() >= s.endsAt) complete(true);
      else emit();
    }, TICK_MS);
  }

  function stopTicker() {
    if (ticker) clearInterval(ticker);
    ticker = null;
  }

  function setPhase(phase, { keepCycle = true } = {}) {
    if (!["focus", "short", "long"].includes(phase)) return;
    // Cambiare fase a sessione avviata non deve far sparire i minuti già
    // fatti: `reset` li mette nel registro come sessione interrotta.
    if (s.startedAt) reset();
    stopTicker();
    releaseWakeLock();
    // Le pause appartengono al conto alla rovescia: sceglierne una esce dal
    // modo libero invece di lasciare uno stato a metà.
    if (phase !== "focus" && s.modo === "libera") setModo("timer", { silenzioso: true });
    s.phase = phase;
    s.status = "idle";
    s.remainingMs = totaleMs();
    s.startedAt = null;
    s.escapes = 0;
    if (!keepCycle) s.cycle = 0;
    persist();
    emit({ type: "phase" });
  }

  /** Passa fra conto alla rovescia e cronometro. Il modo resta scritto nelle
      impostazioni: riaprendo l'app ci si ritrova dove si era. */
  function setModo(modo, { silenzioso = false } = {}) {
    const nuovo = modo === "libera" ? "libera" : "timer";
    if (nuovo === s.modo) return;
    if (s.startedAt) reset();
    stopTicker();
    releaseWakeLock();
    s.modo = nuovo;
    s.phase = "focus";
    s.status = "idle";
    s.startedAt = null;
    s.escapes = 0;
    s.remainingMs = totaleMs();
    Store.setSetting("modo", nuovo);
    persist();
    if (!silenzioso) emit({ type: "modo" });
  }

  function start() {
    if (s.status === "running") return;
    const total = totaleMs();
    if (s.status === "idle" || s.remainingMs <= 0) {
      s.remainingMs = total;
      s.startedAt = new Date().toISOString();
      s.escapes = 0;
      s.taskId = Store.currentTaskId();
    }
    s.endsAt = Date.now() + s.remainingMs;
    s.status = "running";
    persist();
    startTicker();
    requestWakeLock();
    unlockAudio();
    emit({ type: "start" });
  }

  function pause() {
    if (s.status !== "running") return;
    s.remainingMs = Math.max(0, s.endsAt - Date.now());
    s.status = "paused";
    stopTicker();
    releaseWakeLock();
    persist();
    emit({ type: "pause" });
  }

  function toggle() {
    if (s.status === "running") pause();
    else start();
  }

  /** Azzera la fase corrente. Se c'era del lavoro fatto, lo registra come sessione mozza. */
  function reset() {
    const had = s.startedAt && s.phase === "focus";
    const done = elapsedMinutes();
    stopTicker();
    releaseWakeLock();
    if (had && done >= 1) {
      Store.addSession({
        startedAt: s.startedAt,
        endedAt: new Date().toISOString(),
        minutes: done,
        kind: "focus",
        completed: false,
        taskId: s.taskId,
        escapes: s.escapes
      });
    }
    s.status = "idle";
    s.startedAt = null;
    s.escapes = 0;
    s.remainingMs = totaleMs();
    persist();
    emit({ type: "reset", partial: had && done >= 1 ? done : 0 });
  }

  /** Passa alla fase successiva senza aspettare: niente calzino, ma i minuti fatti restano. */
  function skip() {
    complete(false);
  }

  /** Il Pro raddoppia i calzini; senza licenza (o senza il modulo) resta uno. */
  function moltiplicatore() {
    return typeof Licenza !== "undefined" ? Licenza.moltiplicatore() : 1;
  }

  /** Chiude a mano una sessione libera: il calzino c'è se si è arrivati al
      minimo, altrimenti restano solo i minuti nel registro. */
  function chiudiLibera() {
    if (s.modo !== "libera" || !s.startedAt) return;
    complete(elapsedMs() >= MINIMO_LIBERA);
  }

  function elapsedMs() {
    if (!s.startedAt) return 0;
    const left = s.status === "running" ? Math.max(0, s.endsAt - Date.now()) : Math.max(0, s.remainingMs);
    return Math.max(0, totaleMs() - left);
  }

  function elapsedMinutes() {
    if (!s.startedAt) return 0;
    const total = totaleMs();
    const left = s.status === "running" ? Math.max(0, s.endsAt - Date.now()) : Math.max(0, s.remainingMs);
    return Math.round((total - left) / 60000);
  }

  /**
   * Chiude la fase corrente. `natural` distingue il timer arrivato a zero
   * (calzino finito) dal salto manuale (minuti registrati, nessun calzino).
   */
  function complete(natural) {
    stopTicker();
    releaseWakeLock();
    const wasPhase = s.phase;
    // In libera contano i minuti davvero passati, anche quando il tetto arriva
    // da solo: la sessione è lunga quanto è stata, non quanto poteva essere.
    const minutes = natural && s.modo !== "libera" ? Store.durationFor(wasPhase) : elapsedMinutes();
    let session = null;

    if (s.startedAt && minutes >= 1) {
      session = Store.addSession({
        startedAt: s.startedAt,
        endedAt: new Date().toISOString(),
        minutes,
        kind: wasPhase,
        completed: Boolean(natural),
        taskId: s.taskId,
        escapes: s.escapes,
        // Il moltiplicatore si legge adesso e resta scritto nella sessione:
        // un calzino guadagnato col Pro non sparisce quando il Pro scade.
        calzini: natural && wasPhase === "focus" ? moltiplicatore() : 1
      });
    }

    if (wasPhase === "focus" && natural && s.modo !== "libera") s.cycle += 1;

    const next = s.modo === "libera" ? "focus" : nextPhase(wasPhase);
    s.phase = next;
    s.status = "idle";
    s.startedAt = null;
    s.escapes = 0;
    s.remainingMs = totaleMs();
    if (next === "focus" && wasPhase === "long") s.cycle = 0;
    persist();

    if (natural) {
      chime(wasPhase === "focus");
      notify(wasPhase);
    }
    emit({ type: "complete", natural: Boolean(natural), phase: wasPhase, session });

    // Nel modo libero non c'è una fase dopo da far partire: si riparte a mano.
    const settings = Store.settings();
    const auto = next === "focus" ? settings.autoStartFocus : settings.autoStartBreak;
    if (natural && auto && s.modo !== "libera") start();
  }

  function nextPhase(phase) {
    if (phase !== "focus") return "focus";
    const settings = Store.settings();
    return (s.cycle + 1) % settings.cycles === 0 ? "long" : "short";
  }

  /**
   * Uscita dalla scheda durante la concentrazione. In modalità severa la fase
   * salta: il calzino si disfa e i minuti fatti restano registrati come mozzi.
   */
  function noteEscape() {
    if (s.status !== "running" || s.phase !== "focus") return null;
    s.escapes += 1;
    const strict = Store.settings().strict;
    const result = { escapes: s.escapes, strict, minutes: elapsedMinutes() };
    if (strict) {
      reset();
      emit({ type: "disfatto" });
    } else {
      persist();
      emit({ type: "escape" });
    }
    return result;
  }

  /* ------------------------------------------------------- suono e avvisi */

  function unlockAudio() {
    if (!Store.settings().sound) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (err) {
      audioCtx = null;
    }
  }

  /** Tre note sintetizzate: nessun file audio da scaricare, funziona offline. */
  function chime(bright) {
    if (!Store.settings().sound || !audioCtx) return;
    const notes = bright ? [523.25, 659.25, 783.99] : [440, 349.23];
    notes.forEach((freq, i) => {
      const t0 = audioCtx.currentTime + i * 0.16;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.6);
    });
  }

  function notify(phase) {
    if (!Store.settings().notify) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const testo = phase === "focus"
      ? "Calzino finito. Adesso stacca davvero."
      : "Pausa finita: Mora ha ripreso i ferri.";
    try {
      new Notification("Calzino", { body: testo, icon: "icon.svg", tag: "calzino" });
    } catch (err) {
      /* alcuni browser vietano le notifiche fuori dai service worker: pazienza */
    }
  }

  /* ------------------------------------------------------------- schermo */

  async function requestWakeLock() {
    if (!Store.settings().wakeLock || !("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch (err) {
      wakeLock = null;
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      try { wakeLock.release(); } catch (err) { /* già rilasciato */ }
      wakeLock = null;
    }
  }

  /** Rientrando sulla scheda il lock è perso: se il timer va, si richiede. */
  function refreshWakeLock() {
    if (s.status === "running" && !wakeLock) requestWakeLock();
  }

  /** Cambiare le durate da Impostazioni deve aggiornare un timer fermo. */
  function syncIdleDuration() {
    if (s.status !== "idle") return;
    s.remainingMs = totaleMs();
    emit();
  }

  return {
    MINIMO_LIBERA,
    boot, on, snapshot, setPhase, setModo, start, pause, toggle, reset, skip,
    chiudiLibera, limiteLibera, noteEscape, refreshWakeLock, syncIdleDuration, unlockAudio
  };
})();
