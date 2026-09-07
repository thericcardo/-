/**
 * Calzino — interfaccia.
 *
 * Nessuna dipendenza e nessuna compilazione: si modifica il file e si ricarica
 * la pagina. Il timer sta in timer.js, i dati in storage.js; qui c'è solo il
 * disegno di quello che i due dicono.
 */
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const PHASE_LABEL = { focus: "Concentrazione", short: "Pausa breve", long: "Pausa lunga" };

  /* Sagoma del calzino: un solo tracciato, così il contorno non ha cuciture
     interne quando lo si riempie di colore. */
  const SAGOMA = "M43 8h14a9 9 0 0 1 9 9v56a9 9 0 0 1-9 9h-30a15 15 0 0 1 0-30h7v-35a9 9 0 0 1 9-9z";

  const ACCESSORI = [
    { id: "cappello", nome: "Cappellino" },
    { id: "occhiali", nome: "Occhiali" },
    { id: "grembiule", nome: "Grembiule" },
    { id: "ditale", nome: "Ditale" }
  ];

  /* Traguardi: si accendono da soli guardando le sessioni. Non c'è nulla da
     comprare, nulla da riscattare e nessun premio che vada più veloce. */
  const TRAGUARDI = [
    { id: "primo",     nome: "Primo calzino",     detto: "Una sessione portata a termine",   test: (d) => d.calzini >= 1 },
    { id: "paio",      nome: "Primo paio",        detto: "Due calzini uguali nel cassetto",  test: (d) => d.paia >= 1 },
    { id: "dieci",     nome: "Dieci calzini",     detto: "Dieci sessioni intere",            test: (d) => d.calzini >= 10 },
    { id: "cassetto",  nome: "Cassetto pieno",    detto: "Sei paia messe via",               test: (d) => d.paia >= 6 },
    { id: "cinqueore", nome: "Cinque ore",        detto: "300 minuti di concentrazione",     test: (d) => d.minuti >= 300 },
    { id: "ventiore",  nome: "Venti ore",         detto: "1200 minuti in totale",            test: (d) => d.minuti >= 1200 },
    { id: "tregiorni", nome: "Tre giorni di fila",detto: "Striscia di 3 giorni",             test: (d) => d.striscia >= 3 },
    { id: "settimana", nome: "Sette giorni",      detto: "Striscia di 7 giorni",             test: (d) => d.striscia >= 7 },
    { id: "lunga",     nome: "Fiato lungo",       detto: "Una sessione da almeno 50 minuti", test: (d) => d.piuLunga >= 50 },
    { id: "alba",      nome: "All'alba",          detto: "Un calzino finito prima delle 9",  test: (d) => d.alba },
    { id: "notte",     nome: "A notte fonda",     detto: "Un calzino finito dopo le 22",     test: (d) => d.notte },
    { id: "pulite",    nome: "Cinque puliti",     detto: "5 calzini di fila senza uscire",   test: (d) => d.pulite >= 5 },
    { id: "varie",     nome: "Tre mestieri",      detto: "Sessioni su tre attività diverse", test: (d) => d.attivita >= 3 }
  ];

  /** Quanto si aspetta prima di contare un'uscita: sotto, è un rimbalzo. */
  const ATTESA_FUGA = 500;

  let lastEscapeInfo = null;
  let escapeTimer = null;
  let toastTimer = null;

  /* ------------------------------------------------------------- utilità */

  const pad = (n) => String(n).padStart(2, "0");

  function mmss(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  }

  function oreMinuti(min) {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} h ${pad(m)}` : `${h} h`;
  }

  const dayKey = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const dataBreve = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function toast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  /* --------------------------------------------------------- tema e colori */

  function applyLook() {
    const s = Store.settings();
    const root = document.documentElement;
    root.dataset.palette = s.palette;
    if (s.theme === "auto") root.removeAttribute("data-theme");
    else root.dataset.theme = s.theme;
    const pal = Store.PALETTES.find((p) => p.id === s.palette);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && pal) meta.setAttribute("content", pal.scuro);
    const scene = $("#scene");
    for (const a of ACCESSORI) scene.classList.toggle("has-" + a.id, Boolean(s.outfit[a.id]));
  }

  /* ------------------------------------------------------------- sezioni */

  function showView(name) {
    $$(".tab").forEach((t) => {
      const on = t.dataset.view === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", String(on));
    });
    $$(".view").forEach((v) => { v.hidden = v.id !== "view-" + name; });
    if (name === "cassetto") renderCassetto();
    if (name === "statistiche") renderStats();
    if (name === "impostazioni") renderSettings();
  }

  /* --------------------------------------------------------------- timer */

  function renderTimer(snap) {
    const scene = $("#scene");
    const isBreak = snap.phase !== "focus";
    scene.dataset.state = snap.status === "running"
      ? (isBreak ? "break" : "running")
      : (snap.status === "paused" ? "paused" : (isBreak ? "break" : "idle"));

    $("#clock").textContent = mmss(snap.remainingMs);
    document.title = snap.status === "running"
      ? `${mmss(snap.remainingMs)} · ${PHASE_LABEL[snap.phase]}`
      : "Calzino";

    const minuti = Math.round(snap.totalMs / 60000);
    $("#clock-note").textContent = snap.phase === "focus"
      ? `Sessione da ${minuti} minuti` + (snap.escapes ? ` · ${snap.escapes} uscite` : "")
      : `${PHASE_LABEL[snap.phase]} da ${minuti} minuti`;

    $$(".phase").forEach((b) => b.classList.toggle("is-active", b.dataset.phase === snap.phase));

    const start = $("#btn-start");
    start.textContent = snap.status === "running" ? "Pausa" : (snap.status === "paused" ? "Riprendi" : "Avvia");

    // pallini del giro
    const cycles = Store.settings().cycles;
    const done = snap.cycle % cycles;
    $("#cycles").innerHTML = Array.from({ length: cycles }, (_, i) =>
      `<span class="${i < done ? "done" : ""}"></span>`).join("");

    // La lana sale dal fondo del calzino man mano che la sessione va avanti.
    // La sagoma vive fra y=8 e y=90 del suo viewBox: il riempimento si muove
    // dentro quella fascia, altrimenti il primo quarto di sessione non si vede.
    const frazione = snap.totalMs > 0 ? 1 - snap.remainingMs / snap.totalMs : 0;
    $("#calzino-lana").setAttribute("y", String(Math.round(90 - frazione * 82)));

    $("#top-sub").textContent = subtitle(snap);
  }

  function subtitle(snap) {
    if (snap.status === "running") {
      return snap.phase === "focus" ? "Mora sta sferruzzando." : "Pausa: Mora ha posato i ferri.";
    }
    if (snap.status === "paused") return "In pausa. I ferri sono fermi a mezz'aria.";
    const oggi = statsForToday();
    if (oggi.calzini > 0) return `Oggi: ${oggi.calzini} ${oggi.calzini === 1 ? "calzino" : "calzini"} · ${oreMinuti(oggi.minuti)}`;
    return "Mora è pronta a sferruzzare.";
  }

  /* ------------------------------------------------------------ attività */

  function renderTasks() {
    const box = $("#task-chips");
    const tasks = Store.tasks();
    const corrente = Store.currentTaskId();
    const pezzi = [`<button type="button" class="chip ${corrente ? "" : "is-active"}" data-task="">Senza attività</button>`];
    for (const t of tasks) {
      pezzi.push(
        `<span class="chip ${t.id === corrente ? "is-active" : ""}">` +
        `<i class="dot" style="background:${t.color}"></i>` +
        `<button type="button" class="as-text" data-task="${t.id}">${esc(t.name)}</button>` +
        `<button type="button" class="x" data-archive="${t.id}" aria-label="Togli ${esc(t.name)}">×</button>` +
        `</span>`
      );
    }
    box.innerHTML = pezzi.join("");
  }

  /* ---------------------------------------------------------- statistiche */

  function focusSessions() {
    return Store.sessions().filter((s) => s.kind === "focus");
  }

  function statsForToday() {
    const oggi = dayKey(new Date().toISOString());
    const dellaGiornata = focusSessions().filter((s) => dayKey(s.endedAt) === oggi);
    return {
      minuti: dellaGiornata.reduce((a, s) => a + s.minutes, 0),
      calzini: dellaGiornata.filter((s) => s.completed).length
    };
  }

  function strisciaGiorni() {
    const giorni = new Set(focusSessions().filter((s) => s.completed).map((s) => dayKey(s.endedAt)));
    if (!giorni.size) return 0;
    const cursore = new Date();
    let n = 0;
    // Se oggi non c'è ancora nulla, la striscia può reggersi su ieri.
    if (!giorni.has(dayKey(cursore.toISOString()))) cursore.setDate(cursore.getDate() - 1);
    while (giorni.has(dayKey(cursore.toISOString()))) {
      n++;
      cursore.setDate(cursore.getDate() - 1);
    }
    return n;
  }

  function datiTraguardi() {
    const complete = focusSessions().filter((s) => s.completed);
    let diFila = 0;
    let record = 0;
    for (const s of complete) {
      diFila = s.escapes === 0 ? diFila + 1 : 0;
      record = Math.max(record, diFila);
    }
    return {
      calzini: complete.length,
      paia: Math.floor(complete.length / Store.CALZINI_PER_PAIO),
      minuti: focusSessions().reduce((a, s) => a + s.minutes, 0),
      striscia: strisciaGiorni(),
      piuLunga: complete.reduce((a, s) => Math.max(a, s.minutes), 0),
      alba: complete.some((s) => new Date(s.endedAt).getHours() < 9),
      notte: complete.some((s) => new Date(s.endedAt).getHours() >= 22),
      pulite: record,
      attivita: new Set(complete.map((s) => s.taskId).filter(Boolean)).size
    };
  }

  const tile = (valore, etichetta) => `<div class="stat"><b>${esc(valore)}</b><span>${esc(etichetta)}</span></div>`;

  function renderToday() {
    const oggi = statsForToday();
    const striscia = strisciaGiorni();
    $("#today-stats").innerHTML = [
      tile(oggi.calzini, oggi.calzini === 1 ? "calzino oggi" : "calzini oggi"),
      tile(oreMinuti(oggi.minuti), "concentrazione"),
      tile(striscia, striscia === 1 ? "giorno di fila" : "giorni di fila")
    ].join("");

    const goal = Store.settings().goalMin;
    const perc = Math.min(100, Math.round((oggi.minuti / goal) * 100));
    $("#goal-fill").style.width = perc + "%";
    $("#goal-note").textContent = oggi.minuti >= goal
      ? `Obiettivo di ${goal} minuti raggiunto.`
      : `${oggi.minuti} di ${goal} minuti — ne mancano ${goal - oggi.minuti}.`;
  }

  function renderStats() {
    const d = datiTraguardi();
    const tutte = focusSessions();
    $("#stats-row").innerHTML = [
      tile(d.calzini, "calzini"),
      tile(d.paia, "paia"),
      tile(oreMinuti(d.minuti), "in totale"),
      tile(d.striscia, "giorni di fila"),
      tile(oreMinuti(d.piuLunga), "sessione più lunga")
    ].join("");

    // grafico degli ultimi 14 giorni
    const giorni = [];
    for (let i = 13; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const k = dayKey(dt.toISOString());
      giorni.push({
        etichetta: dt.getDate(),
        minuti: tutte.filter((s) => dayKey(s.endedAt) === k).reduce((a, s) => a + s.minutes, 0)
      });
    }
    const max = Math.max(30, ...giorni.map((g) => g.minuti));
    $("#chart").innerHTML = giorni.map((g) => {
      const h = Math.round((g.minuti / max) * 100);
      return `<div class="col" title="${g.minuti} min"><div class="bar ${g.minuti ? "has" : ""}" style="height:${Math.max(3, h)}%"></div><div class="lab">${g.etichetta}</div></div>`;
    }).join("");

    // ripartizione per attività
    const perTask = new Map();
    for (const s of tutte) {
      const key = s.taskId || "—";
      perTask.set(key, (perTask.get(key) || 0) + s.minutes);
    }
    const righe = Array.from(perTask.entries()).sort((a, b) => b[1] - a[1]);
    const totale = righe.reduce((a, r) => a + r[1], 0) || 1;
    $("#breakdown").innerHTML = righe.map(([id, min]) => {
      const t = id === "—" ? null : Store.getTask(id);
      const nome = t ? t.name : "Senza attività";
      const colore = t ? t.color : "var(--muted)";
      const perc = Math.round((min / totale) * 100);
      return `<div class="bd-row"><span>${esc(nome)}</span><span>${oreMinuti(min)} · ${perc}%</span>` +
             `<div class="bd-bar"><i style="width:${perc}%;background:${colore}"></i></div></div>`;
    }).join("");
    $("#breakdown-empty").hidden = righe.length > 0;

    // registro
    const ultime = Store.sessions().slice().sort((a, b) => String(b.endedAt).localeCompare(String(a.endedAt))).slice(0, 30);
    $("#sessions-count").textContent = String(Store.sessions().length);
    $("#log").innerHTML = ultime.map((s) => {
      const t = s.taskId ? Store.getTask(s.taskId) : null;
      const colore = t ? t.color : "var(--muted)";
      const nome = s.kind === "focus" ? (t ? t.name : "Concentrazione") : PHASE_LABEL[s.kind];
      const quando = new Date(s.endedAt);
      const mozza = s.kind === "focus" && !s.completed ? '<span class="torn">interrotta</span>' : "";
      return `<li><i class="dot" style="background:${colore}"></i><span>${esc(nome)} · ${s.minutes} min</span>${mozza}` +
             `<span class="when">${dataBreve(quando)} ${pad(quando.getHours())}:${pad(quando.getMinutes())}</span></li>`;
    }).join("");
    $("#log-empty").hidden = ultime.length > 0;
  }

  /* -------------------------------------------------------------- cassetto */

  function svgCalzino(colore) {
    return `<svg viewBox="0 0 100 110" aria-hidden="true">` +
      `<path class="corpo" d="${SAGOMA}" fill="${colore}"/>` +
      `<path class="bordo" d="M37 22h26"/></svg>`;
  }

  function renderCassetto() {
    const calzini = Store.socks();
    const per = Store.CALZINI_PER_PAIO;
    const paia = Math.floor(calzini.length / per);
    const spaiati = calzini.length % per;

    $("#paia-count").textContent = `${paia} ${paia === 1 ? "paio" : "paia"}`;
    $("#cassetto-lede").textContent = calzini.length
      ? `${calzini.length} calzini in tutto: ${paia} ${paia === 1 ? "paio" : "paia"}` +
        (spaiati ? ` e uno spaiato — un'altra sessione e diventa un paio.` : `, tutti appaiati.`)
      : "Un calzino per sessione finita, sempre uno: due fanno un paio.";
    $("#cassetto-empty").hidden = calzini.length > 0;

    const gruppi = [];
    for (let i = 0; i < calzini.length; i += per) gruppi.push(calzini.slice(i, i + per));
    gruppi.reverse(); // il paio più recente in cima

    $("#cassetto").innerHTML = gruppi.map((gruppo) => {
      const pieno = gruppo.length === per;
      const numero = Math.floor(calzini.indexOf(gruppo[0]) / per) + 1;
      const celle = [];
      for (let i = 0; i < per; i++) {
        const c = gruppo[i];
        celle.push(c
          ? `<button type="button" class="calzino" data-sock="${c.session.id}" aria-label="Calzino del ${dataBreve(new Date(c.session.endedAt))}">${svgCalzino(c.color)}</button>`
          : `<span class="calzino vuoto">${svgCalzino("none")}</span>`);
      }
      return `<div class="paio ${pieno ? "is-full" : ""}">${celle.join("")}<small>${pieno ? "paio " + numero : "in corso"}</small></div>`;
    }).join("");

    const d = datiTraguardi();
    $("#badges").innerHTML = TRAGUARDI.map((t) => {
      const on = t.test(d);
      return `<div class="badge ${on ? "on" : ""}"><b>${esc(t.nome)}</b><span>${esc(t.detto)}</span></div>`;
    }).join("");
  }

  function showCalzino(id) {
    const s = Store.sessions().find((x) => x.id === id);
    if (!s) return;
    const t = s.taskId ? Store.getTask(s.taskId) : null;
    const d = new Date(s.endedAt);
    $("#calzino-detail").innerHTML = [
      ["Attività", t ? t.name : "Senza attività"],
      ["Durata", `${s.minutes} minuti`],
      ["Finito il", `${dataBreve(d)}/${d.getFullYear()} alle ${pad(d.getHours())}:${pad(d.getMinutes())}`],
      ["Uscite dalla scheda", String(s.escapes)]
    ].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    $("#sheet-calzino").hidden = false;
  }

  /* ----------------------------------------------------------- impostazioni */

  function renderSettings() {
    const s = Store.settings();
    $("#s-focus").value = s.focusMin;
    $("#s-short").value = s.shortMin;
    $("#s-long").value = s.longMin;
    $("#s-cycles").value = s.cycles;
    $("#s-goal").value = s.goalMin;
    $("#s-auto-break").checked = s.autoStartBreak;
    $("#s-auto-focus").checked = s.autoStartFocus;
    $("#s-sound").checked = s.sound;
    $("#s-notify").checked = s.notify;
    $("#s-wake").checked = s.wakeLock;
    $("#s-strict").checked = s.strict;

    $("#notify-note").textContent = typeof Notification === "undefined"
      ? "Questo browser non offre le notifiche di sistema."
      : (Notification.permission === "denied"
        ? "Le notifiche sono state bloccate nelle impostazioni del browser."
        : "Il suono funziona sempre; la notifica solo se il browser dà il permesso.");

    $("#palettes").innerHTML = Store.PALETTES.map((p) =>
      `<button type="button" class="pal ${p.id === s.palette ? "is-active" : ""}" data-palette="${p.id}" title="${esc(p.nome)}" aria-label="Tavolozza ${esc(p.nome)}">` +
      `<i style="background:${p.scuro}"></i><i style="background:${p.accento}"></i><i style="background:${p.secondo}"></i></button>`
    ).join("");

    $$(".seg-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.theme === s.theme));

    $("#outfit").innerHTML = ACCESSORI.map((a) =>
      `<button type="button" class="chip ${s.outfit[a.id] ? "is-active" : ""}" data-outfit="${a.id}">${esc(a.nome)}</button>`
    ).join("");

    $("#distractors").innerHTML = s.distractors.length
      ? s.distractors.map((d, i) =>
          `<span class="chip">${esc(d)}<button type="button" class="x" data-distractor="${i}" aria-label="Togli ${esc(d)}">×</button></span>`).join("")
      : `<span class="empty">Nessun distrattore in elenco.</span>`;
  }

  function bindNumber(sel, key) {
    const el = $(sel);
    el.addEventListener("change", () => {
      Store.setSetting(key, el.value);
      el.value = Store.settings()[key];
      Timer.syncIdleDuration();
      renderToday();
      renderTimer(Timer.snapshot());
    });
  }

  function bindSwitch(sel, key, after) {
    const el = $(sel);
    el.addEventListener("change", () => {
      Store.setSetting(key, el.checked);
      if (after) after(el);
    });
  }

  /* ------------------------------------------------------------- avvio UI */

  function bind() {
    $$(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));

    $$(".phase").forEach((b) => b.addEventListener("click", () => Timer.setPhase(b.dataset.phase)));

    $("#btn-start").addEventListener("click", () => { Timer.unlockAudio(); Timer.toggle(); });
    $("#btn-skip").addEventListener("click", () => Timer.skip());
    $("#btn-reset").addEventListener("click", () => Timer.reset());

    $("#btn-theme").addEventListener("click", () => {
      const ordine = ["auto", "light", "dark"];
      const next = ordine[(ordine.indexOf(Store.settings().theme) + 1) % 3];
      Store.setSetting("theme", next);
      applyLook();
      renderSettings();
      toast(next === "auto" ? "Tema: come il sistema" : next === "light" ? "Tema chiaro" : "Tema scuro");
    });

    // attività
    $("#btn-task-new").addEventListener("click", () => {
      const f = $("#form-task");
      f.hidden = !f.hidden;
      if (!f.hidden) $("#task-name").focus();
    });
    $("#btn-task-cancel").addEventListener("click", () => { $("#form-task").hidden = true; });
    $("#form-task").addEventListener("submit", (e) => {
      e.preventDefault();
      const res = Store.addTask($("#task-name").value);
      const err = $("#task-error");
      if (!res.ok) { err.textContent = res.error; err.hidden = false; return; }
      err.hidden = true;
      $("#task-name").value = "";
      $("#form-task").hidden = true;
      renderTasks();
    });
    $("#task-chips").addEventListener("click", (e) => {
      const archivia = e.target.closest("[data-archive]");
      if (archivia) {
        const t = Store.getTask(archivia.dataset.archive);
        if (t && confirm(`Togliere «${t.name}» dall'elenco? Le sessioni già fatte restano.`)) {
          Store.archiveTask(t.id);
          renderTasks();
        }
        return;
      }
      const scegli = e.target.closest("[data-task]");
      if (!scegli) return;
      Store.setCurrentTask(scegli.dataset.task || null);
      renderTasks();
    });

    // cassetto
    $("#cassetto").addEventListener("click", (e) => {
      const c = e.target.closest("[data-sock]");
      if (c) showCalzino(c.dataset.sock);
    });
    $("#btn-calzino-close").addEventListener("click", () => { $("#sheet-calzino").hidden = true; });
    $("#btn-escape-ok").addEventListener("click", () => { $("#sheet-escape").hidden = true; });

    // impostazioni
    bindNumber("#s-focus", "focusMin");
    bindNumber("#s-short", "shortMin");
    bindNumber("#s-long", "longMin");
    bindNumber("#s-cycles", "cycles");
    bindNumber("#s-goal", "goalMin");
    bindSwitch("#s-auto-break", "autoStartBreak");
    bindSwitch("#s-auto-focus", "autoStartFocus");
    bindSwitch("#s-sound", "sound", () => Timer.unlockAudio());
    bindSwitch("#s-wake", "wakeLock");
    bindSwitch("#s-strict", "strict");
    bindSwitch("#s-notify", "notify", async (el) => {
      if (el.checked && typeof Notification !== "undefined" && Notification.permission === "default") {
        const esito = await Notification.requestPermission();
        if (esito !== "granted") {
          Store.setSetting("notify", false);
          el.checked = false;
          toast("Permesso negato: resta il suono.");
        }
      }
      renderSettings();
    });

    $$("[data-preset]").forEach((b) => b.addEventListener("click", () => {
      const [f, s, l, c] = b.dataset.preset.split("-").map(Number);
      Store.setSetting("focusMin", f);
      Store.setSetting("shortMin", s);
      Store.setSetting("longMin", l);
      Store.setSetting("cycles", c);
      Timer.syncIdleDuration();
      renderSettings();
      renderTimer(Timer.snapshot());
      toast(`Durate: ${f} / ${s} / ${l} minuti`);
    }));

    $("#palettes").addEventListener("click", (e) => {
      const b = e.target.closest("[data-palette]");
      if (!b) return;
      Store.setSetting("palette", b.dataset.palette);
      applyLook();
      renderSettings();
    });

    $$(".seg-btn").forEach((b) => b.addEventListener("click", () => {
      Store.setSetting("theme", b.dataset.theme);
      applyLook();
      renderSettings();
    }));

    $("#outfit").addEventListener("click", (e) => {
      const b = e.target.closest("[data-outfit]");
      if (!b) return;
      const outfit = Object.assign({}, Store.settings().outfit);
      outfit[b.dataset.outfit] = !outfit[b.dataset.outfit];
      Store.setSetting("outfit", outfit);
      applyLook();
      renderSettings();
    });

    $("#form-distractor").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#distractor-name");
      const valore = input.value.trim();
      if (!valore) return;
      const lista = Store.settings().distractors.slice();
      if (!lista.some((d) => d.toLowerCase() === valore.toLowerCase())) lista.push(valore);
      Store.setSetting("distractors", lista);
      input.value = "";
      renderSettings();
    });
    $("#distractors").addEventListener("click", (e) => {
      const b = e.target.closest("[data-distractor]");
      if (!b) return;
      const lista = Store.settings().distractors.slice();
      lista.splice(Number(b.dataset.distractor), 1);
      Store.setSetting("distractors", lista);
      renderSettings();
    });

    // dati
    $("#btn-export").addEventListener("click", () => {
      const dati = Store.exportAll();
      const blob = new Blob([JSON.stringify(dati, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `calzino-${dayKey(new Date().toISOString())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $("#data-note").textContent = `Esportate ${dati.sessions.length} sessioni.`;
    });

    $("#file-import").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const res = Store.importAll(JSON.parse(await file.text()));
        $("#data-note").textContent = res.ok
          ? `Importate ${res.added} sessioni (${res.skipped} già presenti).`
          : res.error;
        if (res.ok) { applyLook(); renderAll(); }
      } catch (err) {
        $("#data-note").textContent = "Il file non è leggibile.";
      }
      e.target.value = "";
    });

    $("#btn-wipe").addEventListener("click", () => {
      if (!confirm("Cancellare sessioni, attività e impostazioni? Non si torna indietro.")) return;
      Store.wipe();
      Timer.setPhase("focus", { keepCycle: false });
      applyLook();
      renderAll();
      toast("Tutto azzerato.");
    });

    // scorciatoie: solo quando non si sta scrivendo
    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space") { e.preventDefault(); Timer.unlockAudio(); Timer.toggle(); }
      else if (e.key === "r" || e.key === "R") Timer.reset();
      else if (e.key === "s" || e.key === "S") Timer.skip();
    });

    // Uscite dalla scheda durante la concentrazione. Il conteggio aspetta un
    // istante: anche un semplice ricaricamento passa di qui, e in modalità
    // severa avrebbe disfatto un calzino per niente. Se la pagina se ne va, il
    // timeout muore con lei; se torni entro un battito, non era una fuga.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        escapeTimer = setTimeout(() => {
          escapeTimer = null;
          const info = Timer.noteEscape();
          if (info) lastEscapeInfo = info;
        }, ATTESA_FUGA);
        return;
      }
      if (escapeTimer) {
        clearTimeout(escapeTimer);
        escapeTimer = null;
      }
      Timer.refreshWakeLock();
      if (lastEscapeInfo) {
        mostraRientro(lastEscapeInfo);
        lastEscapeInfo = null;
      }
    });
  }

  function mostraRientro(info) {
    const distrattori = Store.settings().distractors;
    const elenco = distrattori.length ? ` Il tuo elenco dice: ${distrattori.join(", ")}.` : "";
    $("#escape-title").textContent = info.strict ? "Calzino disfatto" : "Sei tornato";
    $("#escape-text").textContent = info.strict
      ? `Modalità severa: la sessione si è chiusa qui, con ${info.minutes} minuti registrati e nessun calzino.${elenco}`
      : `Sei uscito ${info.escapes} ${info.escapes === 1 ? "volta" : "volte"} da quando hai iniziato. Il timer è andato avanti lo stesso.${elenco}`;
    $("#sheet-escape").hidden = false;
  }

  /* ------------------------------------------------------------ redisegno */

  function renderAll() {
    renderTimer(Timer.snapshot());
    renderTasks();
    renderToday();
    renderCassetto();
    renderStats();
    renderSettings();
  }

  function onTimer(snap, event) {
    renderTimer(snap);
    if (!event) return;
    if (["complete", "reset", "disfatto"].includes(event.type)) {
      renderToday();
      if (!$("#view-cassetto").hidden) renderCassetto();
      if (!$("#view-statistiche").hidden) renderStats();
    }
    if (event.type === "complete" && event.natural && event.phase === "focus") {
      const totali = Store.socks().length;
      toast(totali % Store.CALZINI_PER_PAIO === 0
        ? `Paio completo: ${totali / Store.CALZINI_PER_PAIO} nel cassetto.`
        : `Calzino finito: ne manca uno per il paio.`);
    }
    if (event.type === "reset" && event.partial) toast(`Registrati ${event.partial} minuti, senza calzino.`);
  }

  /* -------------------------------------------------------- service worker */

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline non disponibile: pazienza */ });
  }

  function init() {
    applyLook();
    bind();
    Timer.on(onTimer);
    Timer.boot();
    renderAll();
    showView("timer");
    $("#storage-warning").hidden = Store.isStorageAvailable();
    registerServiceWorker();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
