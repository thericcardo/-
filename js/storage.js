/**
 * Leggi di più — persistenza locale.
 *
 * Tutto vive in localStorage sotto un'unica chiave. Nessun server, nessun
 * account: il "profilo" è solo un nome utente, così più persone possono usare
 * lo stesso dispositivo tenendo i diari separati.
 */
const Store = (() => {
  "use strict";

  const KEY = "leggidipiu.v1";
  const DEFAULT_GOAL = 20;

  let available = true;
  let state = load();

  function blank() {
    return { version: 1, users: {}, currentUser: null };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.users || typeof parsed.users !== "object") {
        return blank();
      }
      // Ripulisce i profili malformati invece di far esplodere l'app.
      const users = {};
      for (const [k, u] of Object.entries(parsed.users)) {
        if (!u || typeof u !== "object" || typeof u.username !== "string") continue;
        users[k] = {
          username: u.username,
          createdAt: u.createdAt || new Date().toISOString(),
          lastActive: u.lastActive || u.createdAt || new Date().toISOString(),
          dailyGoal: Number(u.dailyGoal) > 0 ? Number(u.dailyGoal) : DEFAULT_GOAL,
          entries: Array.isArray(u.entries) ? u.entries.filter(isEntry) : [],
          shelves: (u.shelves && typeof u.shelves === "object") ? u.shelves : {}
        };
      }
      const currentUser = typeof parsed.currentUser === "string" && users[parsed.currentUser]
        ? parsed.currentUser
        : null;
      return { version: 1, users, currentUser };
    } catch (err) {
      console.warn("Dati salvati illeggibili: riparto da zero.", err);
      return blank();
    }
  }

  function isEntry(e) {
    return e && typeof e === "object" && typeof e.title === "string" && Number.isFinite(Number(e.pages));
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

  const keyOf = (name) => String(name || "").trim().toLowerCase();

  function newId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ------------------------------------------------------------------ utenti */

  function validateUsername(name) {
    const clean = String(name || "").trim().replace(/\s+/g, " ");
    if (clean.length < 2) return { ok: false, error: "Il nome utente deve avere almeno 2 caratteri." };
    if (clean.length > 24) return { ok: false, error: "Il nome utente non può superare i 24 caratteri." };
    if (!/^[\p{L}\p{N} ._-]+$/u.test(clean)) {
      return { ok: false, error: "Usa solo lettere, numeri, spazi e i simboli . _ -" };
    }
    return { ok: true, value: clean };
  }

  function listUsers() {
    return Object.values(state.users)
      .sort((a, b) => String(b.lastActive || "").localeCompare(String(a.lastActive || "")));
  }

  function current() {
    return state.currentUser ? state.users[state.currentUser] || null : null;
  }

  function login(name) {
    const v = validateUsername(name);
    if (!v.ok) return v;
    const k = keyOf(v.value);
    const now = new Date().toISOString();
    if (!state.users[k]) {
      state.users[k] = {
        username: v.value,
        createdAt: now,
        lastActive: now,
        dailyGoal: DEFAULT_GOAL,
        entries: [],
        shelves: {}
      };
    } else {
      state.users[k].lastActive = now;
    }
    state.currentUser = k;
    save();
    return { ok: true, value: state.users[k], isNew: state.users[k].entries.length === 0 };
  }

  function logout() {
    state.currentUser = null;
    save();
  }

  function deleteCurrentUser() {
    if (!state.currentUser) return false;
    delete state.users[state.currentUser];
    state.currentUser = null;
    save();
    return true;
  }

  function setGoal(pages) {
    const u = current();
    if (!u) return false;
    const n = Number(pages);
    if (!Number.isFinite(n) || n < 1 || n > 500) return false;
    u.dailyGoal = Math.round(n);
    return save();
  }

  /* ----------------------------------------------------------------- letture */

  function entries() {
    const u = current();
    if (!u) return [];
    return u.entries.slice().sort((a, b) => {
      const d = String(b.date || "").localeCompare(String(a.date || ""));
      if (d !== 0) return d;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  function getEntry(id) {
    const u = current();
    if (!u) return null;
    return u.entries.find((e) => e.id === id) || null;
  }

  function addEntry(data) {
    const u = current();
    if (!u) return null;
    const now = new Date().toISOString();
    const entry = Object.assign({}, data, { id: newId(), createdAt: now, updatedAt: now });
    u.entries.push(entry);
    u.lastActive = now;
    save();
    return entry;
  }

  function updateEntry(id, data) {
    const u = current();
    if (!u) return null;
    const i = u.entries.findIndex((e) => e.id === id);
    if (i === -1) return null;
    const now = new Date().toISOString();
    u.entries[i] = Object.assign({}, u.entries[i], data, { id, updatedAt: now });
    u.lastActive = now;
    save();
    return u.entries[i];
  }

  function deleteEntry(id) {
    const u = current();
    if (!u) return false;
    const i = u.entries.findIndex((e) => e.id === id);
    if (i === -1) return false;
    u.entries.splice(i, 1);
    save();
    return true;
  }

  /* ------------------------------------------------------------- scaffali */

  /** Gli scaffali personali. L'ordine è quello in cui appaiono nell'app. */
  const SHELVES = [
    { id: "da-leggere", label: "Da leggere" },
    { id: "in-lettura", label: "Sto leggendo" },
    { id: "letti", label: "Letti" },
    { id: "abbandonati", label: "Abbandonati" }
  ];

  const shelfIds = SHELVES.map((s) => s.id);

  /** La chiave di un libro: l'id del catalogo, o titolo e autore se manca. */
  function bookKey(book) {
    if (book && book.id) return String(book.id);
    return "t:" + String((book && book.title) || "").trim().toLowerCase()
      + "|" + String((book && book.author) || "").trim().toLowerCase();
  }

  function shelves() {
    const u = current();
    if (!u) return {};
    if (!u.shelves || typeof u.shelves !== "object") u.shelves = {};
    return u.shelves;
  }

  /** In quale scaffale si trova questo libro, se in uno. */
  function shelfOf(book) {
    const all = shelves();
    const key = bookKey(book);
    for (const id of shelfIds) {
      if ((all[id] || []).some((entry) => entry.key === key)) return id;
    }
    return null;
  }

  /**
   * Sposta un libro su uno scaffale, o lo toglie da tutti con shelfId null.
   * Un libro sta su un solo scaffale alla volta: è una posizione, non un'etichetta.
   */
  function setShelf(book, shelfId) {
    const u = current();
    if (!u) return false;
    if (shelfId !== null && !shelfIds.includes(shelfId)) return false;

    const all = shelves();
    const key = bookKey(book);
    for (const id of shelfIds) {
      all[id] = (all[id] || []).filter((entry) => entry.key !== key);
    }
    if (shelfId) {
      all[shelfId] = all[shelfId] || [];
      all[shelfId].unshift({
        key,
        id: book.id || null,
        title: book.title || "",
        author: book.author || "",
        year: book.year || null,
        pages: book.pages || null,
        cover: book.cover || null,
        blurb: book.blurb || "",
        addedAt: new Date().toISOString()
      });
    }
    u.lastActive = new Date().toISOString();
    save();
    return true;
  }

  function shelfBooks(shelfId) {
    return (shelves()[shelfId] || []).slice();
  }

  function shelfCounts() {
    const all = shelves();
    const counts = {};
    for (const id of shelfIds) counts[id] = (all[id] || []).length;
    return counts;
  }

  /* -------------------------------------------------------- esporta/importa */

  /* ================================= le letture del lettore interno ====== */

  /**
   * Il diario lo scrive la persona. Questa sezione invece la scrive l'app,
   * mentre si legge dentro il lettore: quante pagine, per quanto tempo, dove
   * si è arrivati. Sta in un elenco a parte proprio per non mescolare quello
   * che uno ha deciso di annotare con quello che è stato solo registrato.
   *
   * Una riga per libro, aggiornata sul posto: di una lettura interessa dove
   * sei arrivato, non ogni volta che hai girato pagina.
   */
  function sessions() {
    const u = current();
    if (!u) return [];
    if (!Array.isArray(u.sessions)) u.sessions = [];
    return u.sessions;
  }

  function readingOf(book) {
    const key = bookKey(book);
    return sessions().find((s) => s.key === key) || null;
  }

  /**
   * Registra dove si è arrivati. Viene chiamata dal salvataggio automatico
   * del lettore, quindi deve essere a buon mercato e non deve mai perdere il
   * punto più avanti raggiunto: si torna indietro a rileggere, ma il segno di
   * quanto si è letto non deve tornare indietro con noi.
   */
  function trackReading(book, { page, pages, seconds = 0, chars = 0, source = "" } = {}) {
    const u = current();
    if (!u) return null;
    const elenco = sessions();
    const key = bookKey(book);
    const now = new Date().toISOString();
    let riga = elenco.find((s) => s.key === key);

    if (!riga) {
      riga = {
        key,
        id: book.id || null,
        title: book.title || "",
        author: book.author || "",
        cover: book.cover || null,
        source,
        startedAt: now,
        seconds: 0,
        page: 0,
        furthest: 0,
        pages: 0,
        chars: 0,
        sessions: 0
      };
      elenco.unshift(riga);
    }

    riga.page = Math.max(1, Number(page) || 1);
    riga.furthest = Math.max(riga.furthest || 0, riga.page);
    if (pages) riga.pages = Number(pages) || riga.pages;
    if (chars) riga.chars = Number(chars) || riga.chars;
    if (seconds > 0) riga.seconds = (riga.seconds || 0) + Math.round(seconds);
    if (source) riga.source = source;
    riga.updatedAt = now;
    u.lastActive = now;
    save();
    return riga;
  }

  /** Una sessione in più da contare: si chiama quando il lettore si apre. */
  function openedReading(book, extra) {
    const riga = trackReading(book, extra);
    if (riga) { riga.sessions = (riga.sessions || 0) + 1; save(); }
    return riga;
  }

  function deleteReading(book) {
    const u = current();
    if (!u) return false;
    const key = bookKey(book);
    u.sessions = sessions().filter((s) => s.key !== key);
    save();
    return true;
  }

  function exportCurrent() {
    const u = current();
    if (!u) return null;
    return {
      app: "leggi-di-piu",
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { username: u.username, createdAt: u.createdAt, dailyGoal: u.dailyGoal },
      entries: u.entries,
      shelves: u.shelves || {},
      sessions: u.sessions || []
    };
  }

  /**
   * Aggiunge al profilo corrente le letture di un file esportato.
   * Le letture già presenti (stesso id) vengono saltate, così reimportare
   * due volte lo stesso file non crea doppioni.
   */
  function importIntoCurrent(payload) {
    const u = current();
    if (!u) return { ok: false, error: "Nessun profilo attivo." };
    if (!payload || !Array.isArray(payload.entries)) {
      return { ok: false, error: "Il file non sembra un export di Leggi di più." };
    }
    const known = new Set(u.entries.map((e) => e.id));
    let added = 0;
    let skipped = 0;
    for (const raw of payload.entries) {
      if (!isEntry(raw)) { skipped++; continue; }
      if (raw.id && known.has(raw.id)) { skipped++; continue; }
      const entry = Object.assign({}, raw, { id: raw.id || newId() });
      known.add(entry.id);
      u.entries.push(entry);
      added++;
    }
    // Gli scaffali arrivano interi: sono una posizione, non una cronologia.
    if (payload.shelves && typeof payload.shelves === "object") {
      const all = shelves();
      for (const id of shelfIds) {
        const incoming = Array.isArray(payload.shelves[id]) ? payload.shelves[id] : [];
        const known = new Set((all[id] || []).map((e) => e.key));
        all[id] = (all[id] || []).concat(incoming.filter((e) => e && e.key && !known.has(e.key)));
      }
    }

    // Le letture registrate dal lettore: per ogni libro resta quella arrivata
    // più avanti, che è l'unica informazione che conta.
    if (Array.isArray(payload.sessions)) {
      const elenco = sessions();
      for (const riga of payload.sessions) {
        if (!riga || !riga.key) continue;
        const mia = elenco.find((s) => s.key === riga.key);
        if (!mia) { elenco.push(riga); continue; }
        mia.furthest = Math.max(mia.furthest || 0, riga.furthest || 0);
        mia.seconds = Math.max(mia.seconds || 0, riga.seconds || 0);
        mia.page = Math.max(mia.page || 0, riga.page || 0);
      }
    }

    save();
    return { ok: true, added, skipped };
  }

  return {
    DEFAULT_GOAL,
    isStorageAvailable: () => available && probe(),
    validateUsername,
    listUsers,
    current,
    login,
    logout,
    deleteCurrentUser,
    setGoal,
    SHELVES,
    bookKey,
    shelfOf,
    setShelf,
    shelfBooks,
    shelfCounts,
    entries,
    sessions,
    readingOf,
    trackReading,
    openedReading,
    deleteReading,
    getEntry,
    addEntry,
    updateEntry,
    deleteEntry,
    exportCurrent,
    importIntoCurrent
  };
})();
