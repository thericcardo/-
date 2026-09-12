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

  function exportCurrent() {
    const u = current();
    if (!u) return null;
    return {
      app: "leggi-di-piu",
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { username: u.username, createdAt: u.createdAt, dailyGoal: u.dailyGoal },
      entries: u.entries,
      shelves: u.shelves || {}
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
    getEntry,
    addEntry,
    updateEntry,
    deleteEntry,
    exportCurrent,
    importIntoCurrent
  };
})();
