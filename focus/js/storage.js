/**
 * Calzino — persistenza locale.
 *
 * Un'unica chiave in localStorage: impostazioni, attività, sessioni e lo stato
 * del timer in corso. Nessun account e nessun server, come nell'app di lettura
 * accanto: chi apre la pagina è già dentro.
 *
 * I calzini non vengono salvati: si ricavano dalle sessioni di concentrazione
 * portate a termine, così non esistono due verità da tenere allineate.
 * Uno per sessione, sempre: nessun moltiplicatore, nessun premio a parte.
 */
const Store = (() => {
  "use strict";

  const KEY = "calzino.v1";
  const CALZINI_PER_PAIO = 2;

  const PALETTES = [
    { id: "notte",    nome: "Notte",     accento: "#F2A65A", secondo: "#7FD1B9", scuro: "#1E2438" },
    { id: "bosco",    nome: "Bosco",     accento: "#8FBF6A", secondo: "#E7C46B", scuro: "#1B2A22" },
    { id: "prugna",   nome: "Prugna",    accento: "#D98BB0", secondo: "#9AB6E8", scuro: "#2A1E30" },
    { id: "argilla",  nome: "Argilla",   accento: "#E0785C", secondo: "#E8C79A", scuro: "#2E211C" },
    { id: "oceano",   nome: "Oceano",    accento: "#5FB6D9", secondo: "#A8E0C6", scuro: "#12242E" },
    { id: "carbone",  nome: "Carbone",   accento: "#C9C4BC", secondo: "#8FA0A6", scuro: "#212121" },
    { id: "tramonto", nome: "Tramonto",  accento: "#FF8A5B", secondo: "#FFC9A0", scuro: "#2B1B2E", pro: true },
    { id: "menta",    nome: "Menta",     accento: "#4FD1A5", secondo: "#BDF0DA", scuro: "#12291F", pro: true },
    { id: "lavanda",  nome: "Lavanda",   accento: "#A88CF0", secondo: "#D9CBFF", scuro: "#241F3A", pro: true },
    { id: "rame",     nome: "Rame",      accento: "#C9713A", secondo: "#E6B98F", scuro: "#2A1E18", pro: true }
  ];

  /** Accessori di Mora e fantasie dei calzini: quelli con `pro` stanno dietro
      l'abbonamento, gli altri no. L'elenco vive qui perché lo guardano sia
      l'interfaccia sia il controllo di quello che è davvero sbloccato. */
  const ACCESSORI = [
    { id: "cappello",  nome: "Cappellino" },
    { id: "occhiali",  nome: "Occhiali" },
    { id: "grembiule", nome: "Grembiule" },
    { id: "ditale",    nome: "Ditale" },
    { id: "coroncina", nome: "Coroncina", pro: true },
    { id: "papillon",  nome: "Papillon",  pro: true },
    { id: "fiore",     nome: "Fiorellino", pro: true }
  ];

  const FANTASIE = [
    { id: "tinta",  nome: "Tinta unita" },
    { id: "righe",  nome: "A righe",   pro: true },
    { id: "pois",   nome: "A pois",    pro: true },
    { id: "rombi",  nome: "A rombi",   pro: true },
    { id: "punta",  nome: "Punta a contrasto", pro: true }
  ];

  /** Colori della lana: il cassetto deve restare leggibile anche pieno. */
  const FILATI = ["#E0785C", "#F2A65A", "#E7C46B", "#8FBF6A", "#7FD1B9", "#5FB6D9", "#9AB6E8", "#D98BB0"];

  /**
   * La casa di Mora: undici pezzi, pagati in paia di calzini. È il filo lungo
   * dell'app — il cassetto dice quanto hai lavorato oggi, la casa dice dove sta
   * andando a finire tutto quel lavoro.
   *
   * `paia` è il totale che serve per avere quel pezzo, non il costo del singolo
   * passo: così spostare una soglia non obbliga a ricalcolare le altre.
   */
  const CASA = [
    { id: "terreno",     nome: "Il terreno",     paia: 1,
      racconto: "Con il primo paio Mora ha pagato la caparra: un quadrato di terra buona, in fondo al prato." },
    { id: "fondamenta",  nome: "Le fondamenta",  paia: 3,
      racconto: "Tre paia, e lo scavo è fatto. Adesso c'è dove appoggiare i muri, anche se i muri non ci sono ancora." },
    { id: "pavimento",   nome: "Il pavimento",   paia: 6,
      racconto: "Sei paia diventate assi di legno chiaro. Mora ci cammina sopra scalza, per sentire quali scricchiolano." },
    { id: "muri",        nome: "I muri",         paia: 10,
      racconto: "Dieci paia: quattro muri dritti. Per la prima volta esiste un dentro, e quindi anche un fuori." },
    { id: "finestre",    nome: "Le finestre",    paia: 15,
      racconto: "Quindici paia comprano due finestre. Da lì si vede il prato — e il prato vede lei." },
    { id: "porta",       nome: "La porta",       paia: 21,
      racconto: "Ventuno paia per una porta con la maniglia d'ottone. Adesso si può bussare, e si può non aprire." },
    { id: "tetto",       nome: "Il tetto",       paia: 28,
      racconto: "Ventotto paia di tegole rosse. La prima notte di pioggia Mora è rimasta sveglia apposta, per sentirla cadere di sopra." },
    { id: "camino",      nome: "Il camino",      paia: 36,
      racconto: "Trentasei paia: un camino che tira. Il fumo esce storto, ma esce." },
    { id: "luce",        nome: "La luce",        paia: 45,
      racconto: "Quarantacinque paia per l'impianto. La sera, alla finestra, adesso c'è una luce gialla che prima non c'era." },
    { id: "giardino",    nome: "Il giardino",    paia: 55,
      racconto: "Cinquantacinque paia, e davanti alla porta crescono un melo e tre file di ravanelli." },
    { id: "staccionata", nome: "La staccionata", paia: 66,
      racconto: "Sessantasei paia. La staccionata non serve a tenere fuori nessuno: serve a dire che quella casa è finita, ed è sua." }
  ];

  const CASA_FINITA = "La casa è finita. Mora continua a sferruzzare, ma adesso lo fa per il gusto di farlo.";

  const DEFAULT_SETTINGS = {
    focusMin: 25,
    shortMin: 5,
    longMin: 15,
    cycles: 4,
    goalMin: 100,
    autoStartBreak: true,
    autoStartFocus: false,
    sound: true,
    notify: false,
    wakeLock: true,
    strict: false,
    theme: "auto",
    palette: "notte",
    outfit: { cappello: false, occhiali: false, grembiule: true, ditale: false,
              coroncina: false, papillon: false, fiore: false },
    fantasia: "tinta",
    modo: "timer",
    distractors: ["Instagram", "YouTube", "Chat di gruppo"]
  };

  const LIMITS = {
    focusMin: [1, 180], shortMin: [1, 60], longMin: [1, 90],
    cycles: [2, 12], goalMin: [10, 960]
  };

  let available = true;
  let state = load();

  function blank() {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      settings: Object.assign({}, DEFAULT_SETTINGS, { outfit: Object.assign({}, DEFAULT_SETTINGS.outfit) }),
      tasks: [],
      currentTaskId: null,
      sessions: [],
      running: null
    };
  }

  function clampNum(value, [min, max], fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function cleanSettings(raw) {
    const s = Object.assign({}, DEFAULT_SETTINGS, raw && typeof raw === "object" ? raw : {});
    for (const [k, range] of Object.entries(LIMITS)) s[k] = clampNum(s[k], range, DEFAULT_SETTINGS[k]);
    for (const k of ["autoStartBreak", "autoStartFocus", "sound", "notify", "wakeLock", "strict"]) {
      s[k] = Boolean(s[k]);
    }
    if (!["auto", "light", "dark"].includes(s.theme)) s.theme = "auto";
    if (!PALETTES.some((p) => p.id === s.palette)) s.palette = "notte";
    if (!FANTASIE.some((f) => f.id === s.fantasia)) s.fantasia = "tinta";
    if (s.modo !== "libera") s.modo = "timer";
    const outfit = Object.assign({}, DEFAULT_SETTINGS.outfit, s.outfit && typeof s.outfit === "object" ? s.outfit : {});
    for (const k of Object.keys(outfit)) outfit[k] = Boolean(outfit[k]);
    s.outfit = outfit;
    s.distractors = Array.isArray(s.distractors)
      ? s.distractors.map((d) => String(d).trim().slice(0, 30)).filter(Boolean).slice(0, 40)
      : DEFAULT_SETTINGS.distractors.slice();
    return s;
  }

  function isTask(t) {
    return t && typeof t === "object" && typeof t.id === "string" && typeof t.name === "string";
  }

  /** Quanti calzini ha fruttato una sessione: uno di suo, due con il Pro.
      Resta scritto nella sessione, non ricalcolato: se l'abbonamento scade, i
      calzini già cuciti restano quelli che erano. */
  function clampCalzini(v) {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 1 && n <= 4 ? n : 1;
  }

  function isSession(s) {
    return s && typeof s === "object" && typeof s.startedAt === "string" && Number.isFinite(Number(s.minutes));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return blank();
      const base = blank();
      const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.filter(isTask) : [];
      const sessions = Array.isArray(parsed.sessions)
        ? parsed.sessions.filter(isSession).map((s) => ({
            id: typeof s.id === "string" ? s.id : newId(),
            startedAt: s.startedAt,
            endedAt: typeof s.endedAt === "string" ? s.endedAt : s.startedAt,
            minutes: Math.max(0, Math.round(Number(s.minutes) || 0)),
            kind: s.kind === "short" || s.kind === "long" ? s.kind : "focus",
            completed: Boolean(s.completed),
            taskId: typeof s.taskId === "string" ? s.taskId : null,
            escapes: Math.max(0, Math.round(Number(s.escapes) || 0)),
            calzini: clampCalzini(s.calzini)
          }))
        : [];
      return {
        version: 1,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : base.createdAt,
        settings: cleanSettings(parsed.settings),
        tasks,
        currentTaskId: tasks.some((t) => t.id === parsed.currentTaskId) ? parsed.currentTaskId : null,
        sessions,
        running: parsed.running && typeof parsed.running === "object" ? parsed.running : null
      };
    } catch (err) {
      console.warn("Dati salvati illeggibili: riparto da zero.", err);
      return blank();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      available = true;
      return true;
    } catch (err) {
      available = false;
      console.error("Impossibile salvare:", err);
      return false;
    }
  }

  function probe() {
    try {
      const t = KEY + ".probe";
      localStorage.setItem(t, "1");
      localStorage.removeItem(t);
      return true;
    } catch (err) {
      return false;
    }
  }

  function newId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------------------------------------------------- impostazioni */

  const settings = () => state.settings;

  function setSetting(key, value) {
    if (!(key in DEFAULT_SETTINGS)) return false;
    if (key in LIMITS) state.settings[key] = clampNum(value, LIMITS[key], DEFAULT_SETTINGS[key]);
    else if (key === "outfit") state.settings.outfit = cleanSettings({ outfit: value }).outfit;
    else if (key === "distractors") state.settings.distractors = cleanSettings({ distractors: value }).distractors;
    else if (typeof DEFAULT_SETTINGS[key] === "boolean") state.settings[key] = Boolean(value);
    else state.settings[key] = cleanSettings(Object.assign({}, state.settings, { [key]: value }))[key];
    save();
    return true;
  }

  function durationFor(phase) {
    const s = state.settings;
    if (phase === "short") return s.shortMin;
    if (phase === "long") return s.longMin;
    return s.focusMin;
  }

  /* -------------------------------------------------------------- attività */

  const tasks = () => state.tasks.filter((t) => !t.archived);

  function addTask(name) {
    const clean = String(name || "").trim().replace(/\s+/g, " ");
    if (clean.length < 2) return { ok: false, error: "Il nome dell'attività deve avere almeno 2 caratteri." };
    if (clean.length > 40) return { ok: false, error: "Massimo 40 caratteri." };
    if (state.tasks.some((t) => !t.archived && t.name.toLowerCase() === clean.toLowerCase())) {
      return { ok: false, error: "Questa attività c'è già." };
    }
    const task = {
      id: newId(),
      name: clean,
      color: FILATI[state.tasks.length % FILATI.length],
      archived: false,
      createdAt: new Date().toISOString()
    };
    state.tasks.push(task);
    state.currentTaskId = task.id;
    save();
    return { ok: true, value: task };
  }

  function archiveTask(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return false;
    t.archived = true;
    if (state.currentTaskId === id) state.currentTaskId = null;
    save();
    return true;
  }

  function getTask(id) {
    return state.tasks.find((t) => t.id === id) || null;
  }

  function currentTaskId() {
    return state.currentTaskId;
  }

  function setCurrentTask(id) {
    state.currentTaskId = id && state.tasks.some((t) => t.id === id) ? id : null;
    save();
  }

  /* -------------------------------------------------------------- sessioni */

  const sessions = () => state.sessions;

  function addSession(data) {
    const session = {
      id: newId(),
      startedAt: data.startedAt,
      endedAt: data.endedAt || new Date().toISOString(),
      minutes: Math.max(0, Math.round(Number(data.minutes) || 0)),
      kind: data.kind || "focus",
      completed: Boolean(data.completed),
      taskId: data.taskId || null,
      escapes: Math.max(0, Math.round(Number(data.escapes) || 0)),
      calzini: clampCalzini(data.calzini)
    };
    state.sessions.push(session);
    save();
    return session;
  }

  /**
   * I calzini sono le sessioni di concentrazione finite, dalla più vecchia.
   * Una sessione ne vale uno; con il Pro attivo al momento in cui è finita ne
   * vale due, e il secondo resta segnato come doppio — il cassetto deve poter
   * dire quanto lavoro c'è dietro, non solo quanti calzini ci sono.
   */
  function socks() {
    const out = [];
    const complete = state.sessions
      .filter((s) => s.kind === "focus" && s.completed)
      .sort((a, b) => String(a.endedAt).localeCompare(String(b.endedAt)));
    for (const s of complete) {
      const quanti = clampCalzini(s.calzini);
      for (let k = 0; k < quanti; k++) {
        out.push({
          index: out.length,
          id: k === 0 ? s.id : `${s.id}#${k + 1}`,
          session: s,
          doppio: k > 0,
          color: colorOf(s, out.length),
          paio: Math.floor(out.length / CALZINI_PER_PAIO)
        });
      }
    }
    return out;
  }

  /**
   * Lo stato della casa, ricavato dalle paia: `fatte` sono i pezzi già pagati,
   * `prossimo` quello a cui si sta lavorando (null se la casa è finita).
   */
  function casa() {
    const paia = Math.floor(socks().length / CALZINI_PER_PAIO);
    const fatte = CASA.filter((f) => paia >= f.paia);
    const prossimo = CASA.find((f) => paia < f.paia) || null;
    const precedente = fatte.length ? fatte[fatte.length - 1].paia : 0;
    return {
      paia,
      fase: fatte.length,
      fatte,
      prossimo,
      mancano: prossimo ? prossimo.paia - paia : 0,
      // quanto manca al pezzo dopo, da 0 a 1, per la barra
      avanzamento: prossimo ? (paia - precedente) / (prossimo.paia - precedente) : 1,
      finita: !prossimo
    };
  }

  function colorOf(session, i) {
    const task = session.taskId ? getTask(session.taskId) : null;
    return task ? task.color : FILATI[i % FILATI.length];
  }

  /* ---------------------------------------------------- timer in sospeso */

  const running = () => state.running;

  function setRunning(value) {
    state.running = value || null;
    save();
  }

  /* ------------------------------------------------------ esporta/importa */

  function exportAll() {
    return {
      app: "calzino",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      tasks: state.tasks,
      sessions: state.sessions
    };
  }

  /**
   * Aggiunge sessioni e attività di un file esportato. Quelle già presenti
   * (stesso id) vengono saltate: reimportare due volte non crea doppioni.
   */
  function importAll(payload) {
    if (!payload || typeof payload !== "object" || !Array.isArray(payload.sessions)) {
      return { ok: false, error: "Il file non sembra un export di Calzino." };
    }
    const knownTasks = new Set(state.tasks.map((t) => t.id));
    if (Array.isArray(payload.tasks)) {
      for (const t of payload.tasks) {
        if (!isTask(t) || knownTasks.has(t.id)) continue;
        knownTasks.add(t.id);
        state.tasks.push({
          id: t.id,
          name: String(t.name).slice(0, 40),
          color: typeof t.color === "string" ? t.color : FILATI[state.tasks.length % FILATI.length],
          archived: Boolean(t.archived),
          createdAt: t.createdAt || new Date().toISOString()
        });
      }
    }
    const known = new Set(state.sessions.map((s) => s.id));
    let added = 0;
    let skipped = 0;
    for (const raw of payload.sessions) {
      if (!isSession(raw) || (raw.id && known.has(raw.id))) { skipped++; continue; }
      const s = Object.assign({}, raw, { id: raw.id || newId() });
      known.add(s.id);
      state.sessions.push(s);
      added++;
    }
    if (payload.settings) state.settings = cleanSettings(Object.assign({}, state.settings, payload.settings));
    save();
    return { ok: true, added, skipped };
  }

  function wipe() {
    state = blank();
    save();
  }

  return {
    PALETTES,
    CASA,
    CASA_FINITA,
    ACCESSORI,
    FANTASIE,
    FILATI,
    CALZINI_PER_PAIO,
    DEFAULT_SETTINGS,
    isStorageAvailable: () => available && probe(),
    settings,
    setSetting,
    durationFor,
    tasks,
    allTasks: () => state.tasks,
    addTask,
    archiveTask,
    getTask,
    currentTaskId,
    setCurrentTask,
    sessions,
    addSession,
    socks,
    casa,
    running,
    setRunning,
    exportAll,
    importAll,
    wipe
  };
})();
