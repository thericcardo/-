/**
 * Leggi di più — interfaccia.
 *
 * Accesso con il solo nome utente, poi libreria, nuova lettura, diario e
 * profilo; più la scheda di un libro e la conversazione con Nina.
 * Nessuna dipendenza esterna: il DOM viene costruito a mano con h().
 */
(() => {
  "use strict";

  /** Le domande sul contesto proposte a ogni lettura. */
  const QUESTIONS = [
    {
      id: "sintesi",
      label: "Di che cosa parlano le pagine che hai letto?",
      hint: "Due o tre righe, con parole tue."
    },
    {
      id: "protagonisti",
      label: "Chi o che cosa è al centro?",
      hint: "Personaggi, idee o luoghi principali."
    },
    {
      id: "contesto",
      label: "Dove e quando si svolge? In quale contesto si colloca?",
      hint: "Epoca, luogo, situazione: il contorno di quello che succede."
    },
    {
      id: "scoperta",
      label: "Che cosa hai imparato o scoperto?",
      hint: "Un fatto, una parola nuova, un'idea che non conoscevi."
    },
    {
      id: "dubbi",
      label: "C'è qualcosa che non hai capito?",
      hint: "Scriverlo adesso ti fa ritrovare il punto dopo."
    },
    {
      id: "prossimo",
      label: "Che cosa pensi che succederà? Che cosa vuoi scoprire?",
      hint: "Una previsione o una domanda aperta: è quella che ti fa riaprire il libro."
    }
  ];

  let editingId = null;
  let toastTimer = null;

  /* ------------------------------------------------------------- utilities */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "dataset") Object.assign(node.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v === true ? "" : String(v));
      }
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false || child === "") continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.hidden = false;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("is-visible");
      setTimeout(() => { el.hidden = true; }, 250);
    }, 3200);
  }

  function showError(el, message) {
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.textContent = message;
    el.hidden = false;
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ----------------------------------------------------------------- date */

  function toISODate(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  const todayISO = () => toISODate(new Date());

  function fromISODate(iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
  }

  const dateFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const shortFormatter = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" });

  function formatDay(iso) {
    if (!iso) return "";
    const today = todayISO();
    if (iso === today) return "Oggi";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (iso === toISODate(yesterday)) return "Ieri";
    return dateFormatter.format(fromISODate(iso));
  }

  /* ---------------------------------------------------------------- stats */

  function computeStats(entries, goal) {
    const pagesByDate = new Map();
    let pages = 0;
    let minutes = 0;

    for (const e of entries) {
      const p = Number(e.pages) || 0;
      pages += p;
      minutes += Number(e.minutes) || 0;
      if (e.date) pagesByDate.set(e.date, (pagesByDate.get(e.date) || 0) + p);
    }

    const today = todayISO();
    const last7 = lastDays(7).reduce((acc, iso) => acc + (pagesByDate.get(iso) || 0), 0);

    return {
      sessions: entries.length,
      pages,
      minutes,
      pagesToday: pagesByDate.get(today) || 0,
      pagesLast7: last7,
      goal,
      streak: computeStreak(pagesByDate),
      pagesByDate,
      books: groupByBook(entries)
    };
  }

  function lastDays(n) {
    const out = [];
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
      const day = new Date(d);
      day.setDate(d.getDate() - i);
      out.push(toISODate(day));
    }
    return out;
  }

  /** Giorni consecutivi di lettura. Oggi non ancora letto non spezza la serie. */
  function computeStreak(pagesByDate) {
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    if (!pagesByDate.has(toISODate(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (pagesByDate.has(toISODate(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function groupByBook(entries) {
    const map = new Map();
    for (const e of entries) {
      const key = String(e.title || "").trim().toLowerCase();
      if (!key) continue;
      let book = map.get(key);
      if (!book) {
        book = { title: e.title, author: e.author || "", pages: 0, sessions: 0, lastDate: "", lastPage: 0 };
        map.set(key, book);
      }
      book.pages += Number(e.pages) || 0;
      book.sessions++;
      if (e.author && !book.author) book.author = e.author;
      if (String(e.date || "") >= book.lastDate) {
        book.lastDate = e.date || "";
        book.title = e.title;
      }
      const to = Number(e.pageTo) || 0;
      if (to > book.lastPage) book.lastPage = to;
    }
    return Array.from(map.values()).sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)));
  }

  function countAnswers(entry) {
    const fixed = QUESTIONS.filter((q) => String(entry.answers?.[q.id] || "").trim()).length;
    const custom = (entry.customQA || []).filter((qa) => String(qa.a || "").trim()).length;
    return fixed + custom;
  }

  /* --------------------------------------------------- il tasto Indietro */

  /**
   * Ogni pannello a schermo intero lascia uno stato nella cronologia, così il
   * tasto Indietro del telefono lo chiude invece di far uscire dall'app.
   *
   * Chiudere dall'app significa tornare indietro: la chiusura vera la fa
   * sempre `popstate`, una strada sola, per non contarla due volte.
   */
  const layers = [];

  function openLayer(name, onClose) {
    let inHistory = false;
    try {
      history.pushState({ layer: name }, "");
      inHistory = true;
    } catch (err) {
      // Aperta da file://, dove la cronologia non si può toccare.
    }
    layers.push({ name, onClose, inHistory });
  }

  function popLayer() {
    const layer = layers.pop();
    if (layer) layer.onClose();
  }

  /**
   * Sostituisce il pannello in cima senza toccare la cronologia: dalla scheda
   * di un libro si passa a Nina, e il tasto Indietro continua a chiudere una
   * cosa sola. Chiudere e riaprire farebbe accavallare due operazioni sulla
   * cronologia, e Nina si chiuderebbe da sola appena aperta.
   */
  function replaceLayer(name, onClose) {
    if (!layers.length) return openLayer(name, onClose);
    layers[layers.length - 1] = { name, onClose, inHistory: layers[layers.length - 1].inHistory };
  }

  /**
   * Chiede la chiusura di un pannello. Vero se c'era qualcosa da chiudere.
   *
   * Il pannello viene segnato come «in chiusura» prima di toccare la
   * cronologia: due chiamate ravvicinate — capita, perché chi chiude può
   * chiamarla e poi richiamarla — farebbero altrimenti due passi indietro,
   * e il secondo butterebbe fuori dall'app.
   */
  /**
   * Apre un pannello prendendo il posto di quello che c'è.
   *
   * Aprire un pannello e chiuderne un altro sono due mosse sulla cronologia, e
   * fatte insieme si pestano: la chiusura arriva un istante dopo e si porta via
   * il pannello appena aperto. Rinominare il livello esistente invece di
   * chiuderlo e riaprirne uno lascia la cronologia con un passo solo, che è poi
   * quello che si aspetta chi preme Indietro.
   */
  function subentraA(nome, onClose) {
    const sheet = $("#book-sheet");
    const guida = $("#guida-op");
    if (sheet.open) {
      replaceLayer(nome, onClose);
      sheet.close();
      return;
    }
    if (guida && !guida.hidden) {
      replaceLayer(nome, onClose);
      nascondiGuidaOnePiece();
      return;
    }
    openLayer(nome, onClose);
  }

  function requestCloseLayer(name) {
    const layer = layers.find((l) => l.name === name && !l.closing);
    if (!layer) return false;
    layer.closing = true;
    if (layer.inHistory) history.back();
    else popLayer();
    return true;
  }

  window.addEventListener("popstate", popLayer);

  /* ------------------------------------------------------------- schermate */

  function showLogin() {
    $("#screen-app").hidden = true;
    $("#screen-login").hidden = false;
    showError($("#login-error"), "");
    $("#login-username").value = "";
    renderKnownUsers();
    $("#storage-warning").hidden = Store.isStorageAvailable();
    $("#login-username").focus();
  }

  function renderKnownUsers() {
    const users = Store.listUsers();
    const box = $("#login-users");
    const list = $("#login-users-list");
    clear(list);
    box.hidden = users.length === 0;
    for (const u of users) {
      const total = u.entries.reduce((acc, e) => acc + (Number(e.pages) || 0), 0);
      list.append(
        h("li", {},
          h("button", {
            type: "button",
            class: "user-chip",
            onClick: () => doLogin(u.username)
          },
            h("span", { class: "avatar", "aria-hidden": "true", text: initial(u.username) }),
            h("span", { class: "user-chip-text" },
              h("strong", { text: u.username }),
              h("span", { class: "sub", text: total > 0 ? `${plural(total, "pagina", "pagine")} in totale` : "nessuna lettura ancora" })
            )
          )
        )
      );
    }
  }

  const initial = (name) => String(name || "?").trim().charAt(0).toUpperCase();

  function enterApp() {
    const user = Store.current();
    if (!user) return showLogin();
    $("#screen-login").hidden = true;
    $("#screen-app").hidden = false;
    resetForm();
    renderAll();
    // Le scorciatoie dell'icona installata («Cerca un libro») arrivano qui.
    // Altrimenti: chi non ha ancora letto niente parte dalla libreria, chi
    // legge già dal form, che è il gesto che ripete ogni giorno.
    const chiesta = new URLSearchParams(location.search).get("vai");
    const valide = ["libreria", "nuova", "diario", "profilo"];
    switchView(valide.includes(chiesta) ? chiesta : (Store.entries().length ? "nuova" : "libreria"));
  }

  function doLogin(name) {
    const res = Store.login(name);
    if (!res.ok) {
      showError($("#login-error"), res.error);
      return;
    }
    enterApp();
    toast(res.isNew ? `Ciao ${res.value.username}! Segna la tua prima lettura.` : `Bentornato, ${res.value.username}.`);
  }

  function switchView(name) {
    // La vista attiva finisce sul body: la striscia di «Oggi» riguarda la
    // lettura, non la libreria, e in libreria si toglie di mezzo.
    document.body.dataset.view = name;
    for (const tab of $$(".tab")) {
      const active = tab.dataset.view === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const view of $$(".view")) {
      view.hidden = view.id !== "view-" + name;
    }
    const panel = $("#view-" + name);
    if (panel) panel.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderAll() {
    const user = Store.current();
    if (!user) return;
    const list = Store.entries();
    const stats = computeStats(list, user.dailyGoal);

    $("#app-avatar").textContent = initial(user.username);
    $("#app-username").textContent = user.username;
    $("#app-subtitle").textContent = stats.sessions
      ? `${plural(stats.pages, "pagina letta", "pagine lette")} · ${plural(stats.sessions, "lettura", "letture")}`
      : "nessuna lettura ancora";

    renderToday(stats);
    renderRegistrate();
    renderContinua();
    renderMyShelves();
    renderDatalists(list);
    renderDiario(list);
    renderProfilo(list, stats, user);
  }

  /* -------------------------------------------------------- striscia oggi */

  function renderToday(stats) {
    const strip = $("#today-strip");
    clear(strip);
    const pct = Math.min(100, Math.round((stats.pagesToday / Math.max(1, stats.goal)) * 100));
    const done = stats.pagesToday >= stats.goal;

    strip.append(
      h("div", { class: "today-main" },
        h("div", { class: "today-head" },
          h("span", { class: "today-label", text: "Oggi" }),
          h("span", { class: "today-value", text: `${stats.pagesToday} / ${stats.goal} pagine` })
        ),
        h("div", { class: "bar", role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Obiettivo di oggi" },
          h("span", { class: "bar-fill" + (done ? " is-done" : ""), style: `width:${pct}%` })
        ),
        h("p", { class: "today-note", text: done ? "Obiettivo raggiunto. Ogni pagina in più è guadagnata." : `Ti mancano ${stats.goal - stats.pagesToday} pagine.` })
      ),
      h("div", { class: "streak", title: "Giorni consecutivi di lettura" },
        h("strong", { text: String(stats.streak) }),
        h("span", { text: stats.streak === 1 ? "giorno" : "giorni" })
      )
    );
  }

  /* --------------------------------------------------------------- form */

  function buildQuestionFields() {
    const box = $("#domande-box");
    clear(box);
    for (const q of QUESTIONS) {
      box.append(
        h("label", { class: "field question" },
          h("span", { class: "q-label", text: q.label }),
          h("span", { class: "q-hint", text: q.hint }),
          h("textarea", { id: "q-" + q.id, rows: "2", maxlength: "1000", "data-question": q.id, onInput: onQuestionInput })
        )
      );
    }
  }

  function onQuestionInput(event) {
    autoGrow(event.target);
    updateQuestionCount();
  }

  function autoGrow(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(320, textarea.scrollHeight + 2) + "px";
  }

  function updateQuestionCount() {
    const answered = QUESTIONS.filter((q) => $("#q-" + q.id).value.trim()).length;
    const custom = readCustomQA().length;
    const label = custom > 0
      ? `${answered} su ${QUESTIONS.length} + ${custom}`
      : `${answered} su ${QUESTIONS.length}`;
    $("#dom-count").textContent = label;
  }

  function addCustomRow(question = "", answer = "") {
    const box = $("#custom-box");
    const row = h("div", { class: "custom-row" });
    const qInput = h("input", { type: "text", maxlength: "160", placeholder: "La tua domanda", class: "custom-q", onInput: updateQuestionCount });
    const aInput = h("textarea", { rows: "2", maxlength: "1000", placeholder: "La tua risposta", class: "custom-a", onInput: onQuestionInput });
    qInput.value = question;
    aInput.value = answer;
    row.append(
      h("div", { class: "custom-row-head" },
        qInput,
        h("button", {
          type: "button", class: "btn ghost small icon", title: "Togli questa domanda", "aria-label": "Togli questa domanda",
          onClick: () => { row.remove(); updateQuestionCount(); }, text: "×"
        })
      ),
      aInput
    );
    box.append(row);
    updateQuestionCount();
    return qInput;
  }

  function readCustomQA() {
    return $$(".custom-row").map((row) => ({
      q: $(".custom-q", row).value.trim(),
      a: $(".custom-a", row).value.trim()
    })).filter((qa) => qa.q || qa.a);
  }

  function resetForm() {
    editingId = null;
    $("#form-lettura").reset();
    $("#f-data").value = todayISO();
    clear($("#custom-box"));
    for (const q of QUESTIONS) {
      const ta = $("#q-" + q.id);
      ta.value = "";
      ta.style.height = "";
    }
    $("#form-title").textContent = "Nuova lettura";
    $("#btn-salva").textContent = "Salva lettura";
    $("#btn-annulla").hidden = true;
    showError($("#form-error"), "");
    updateQuestionCount();
    renderContinua();
  }

  function startEdit(id) {
    const entry = Store.getEntry(id);
    if (!entry) return;
    resetForm();
    editingId = id;
    $("#f-titolo").value = entry.title || "";
    $("#f-autore").value = entry.author || "";
    $("#f-da").value = entry.pageFrom ?? "";
    $("#f-a").value = entry.pageTo ?? "";
    $("#f-pagine").value = entry.pages ?? "";
    $("#f-data").value = entry.date || todayISO();
    $("#f-minuti").value = entry.minutes ?? "";
    for (const q of QUESTIONS) {
      const ta = $("#q-" + q.id);
      ta.value = entry.answers?.[q.id] || "";
      autoGrow(ta);
    }
    for (const qa of entry.customQA || []) addCustomRow(qa.q, qa.a);
    $("#form-title").textContent = "Modifica lettura";
    $("#btn-salva").textContent = "Salva modifiche";
    $("#btn-annulla").hidden = false;
    updateQuestionCount();
    renderContinua();
    switchView("nuova");
  }

  /** Se conosco la pagina di partenza e quella di arrivo, le pagine lette le calcolo io. */
  function syncPageCount() {
    const from = Number($("#f-da").value);
    const to = Number($("#f-a").value);
    if ($("#f-da").value !== "" && $("#f-a").value !== "" && Number.isFinite(from) && Number.isFinite(to) && to >= from) {
      $("#f-pagine").value = String(to - from + 1);
    }
  }

  function readNumber(sel, { min = 0, max = 99999 } = {}) {
    const raw = $(sel).value.trim();
    if (raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max) return NaN;
    return Math.round(n);
  }

  function onSubmitLettura(event) {
    event.preventDefault();
    const err = $("#form-error");
    showError(err, "");

    const title = $("#f-titolo").value.trim();
    if (!title) {
      showError(err, "Scrivi il titolo del libro.");
      $("#f-titolo").focus();
      return;
    }

    const pages = readNumber("#f-pagine", { min: 1 });
    if (pages === null || Number.isNaN(pages)) {
      showError(err, "Scrivi quante pagine hai letto (almeno 1).");
      $("#f-pagine").focus();
      return;
    }

    const pageFrom = readNumber("#f-da");
    const pageTo = readNumber("#f-a");
    if (Number.isNaN(pageFrom) || Number.isNaN(pageTo)) {
      showError(err, "Le pagine devono essere numeri validi.");
      return;
    }
    if (pageFrom !== null && pageTo !== null && pageTo < pageFrom) {
      showError(err, "La pagina di arrivo non può essere prima di quella di partenza.");
      $("#f-a").focus();
      return;
    }

    const minutes = readNumber("#f-minuti", { max: 1440 });
    if (Number.isNaN(minutes)) {
      showError(err, "I minuti devono essere un numero tra 0 e 1440.");
      return;
    }

    const date = $("#f-data").value || todayISO();
    if (date > todayISO()) {
      showError(err, "La data non può essere nel futuro.");
      $("#f-data").focus();
      return;
    }

    const answers = {};
    for (const q of QUESTIONS) {
      const value = $("#q-" + q.id).value.trim();
      if (value) answers[q.id] = value;
    }

    const data = {
      title,
      author: $("#f-autore").value.trim(),
      pages,
      pageFrom,
      pageTo,
      minutes,
      date,
      answers,
      customQA: readCustomQA()
    };

    if (editingId) {
      Store.updateEntry(editingId, data);
      resetForm();
      renderAll();
      toast("Lettura aggiornata.");
      switchView("diario");
    } else {
      Store.addEntry(data);
      const finito = segnalaSeFinito(data);
      const answered = Object.keys(answers).length + data.customQA.filter((qa) => qa.a).length;
      resetForm();
      renderAll();
      if (finito) toast(`Hai finito «${data.title}». Spostato su «Letti».`);
      else toast(answered
        ? `Segnate ${plural(pages, "pagina", "pagine")} e ${plural(answered, "risposta", "risposte")}.`
        : `Segnate ${plural(pages, "pagina", "pagine")}. La prossima volta prova a rispondere a una domanda.`);
    }
  }

  function renderDatalists(entries) {
    const titles = new Set();
    const authors = new Set();
    for (const e of entries) {
      if (e.title) titles.add(e.title);
      if (e.author) authors.add(e.author);
    }
    fillDatalist($("#dl-titoli"), titles);
    fillDatalist($("#dl-autori"), authors);
  }

  function fillDatalist(node, values) {
    clear(node);
    for (const v of values) node.append(h("option", { value: v }));
  }

  /* -------------------------------------------------------------- diario */

  function renderDiario(entries) {
    const search = $("#diario-search").value.trim().toLowerCase();
    const book = $("#diario-book").value;

    // Il menu dei libri si ricostruisce a ogni render: conserva la scelta corrente.
    const select = $("#diario-book");
    const books = groupByBook(entries);
    clear(select);
    select.append(h("option", { value: "", text: "Tutti i libri" }));
    for (const b of books) {
      select.append(h("option", { value: b.title.toLowerCase(), text: b.title }));
    }
    select.value = books.some((b) => b.title.toLowerCase() === book) ? book : "";

    const filtered = entries.filter((e) => {
      if (select.value && String(e.title || "").toLowerCase() !== select.value) return false;
      if (!search) return true;
      const haystack = [
        e.title, e.author, e.date,
        ...Object.values(e.answers || {}),
        ...(e.customQA || []).flatMap((qa) => [qa.q, qa.a])
      ].join(" ").toLowerCase();
      return haystack.includes(search);
    });

    $("#diario-count").textContent = entries.length
      ? `${plural(filtered.length, "lettura", "letture")}`
      : "";

    const list = $("#diario-list");
    clear(list);

    if (!entries.length) {
      list.append(emptyState(
        "Il diario è vuoto.",
        "Vai su «Nuova lettura» e segna le pagine che hai letto oggi: bastano dieci.",
        "Segna la prima lettura",
        () => switchView("nuova")
      ));
      return;
    }
    if (!filtered.length) {
      list.append(emptyState("Nessuna lettura trovata.", "Prova a cambiare la ricerca o il filtro."));
      return;
    }

    let lastDate = null;
    for (const entry of filtered) {
      if (entry.date !== lastDate) {
        lastDate = entry.date;
        list.append(h("h3", { class: "day-heading", text: formatDay(entry.date) }));
      }
      list.append(entryCard(entry));
    }
  }

  function emptyState(title, text, ctaLabel, onCta) {
    return h("div", { class: "empty" },
      h("p", { class: "empty-title", text: title }),
      h("p", { class: "muted", text: text }),
      ctaLabel && h("button", { type: "button", class: "btn primary", onClick: onCta, text: ctaLabel })
    );
  }

  function entryCard(entry) {
    const answered = QUESTIONS
      .filter((q) => String(entry.answers?.[q.id] || "").trim())
      .map((q) => ({ q: q.label, a: entry.answers[q.id] }));
    const custom = (entry.customQA || []).filter((qa) => qa.q || qa.a);
    const all = answered.concat(custom.map((qa) => ({ q: qa.q || "Domanda", a: qa.a })));

    const range = entry.pageFrom !== null && entry.pageFrom !== undefined && entry.pageTo !== null && entry.pageTo !== undefined
      ? `pagine ${entry.pageFrom}–${entry.pageTo}`
      : "";
    const meta = [range, entry.minutes ? `${entry.minutes} min` : ""].filter(Boolean).join(" · ");

    return h("article", { class: "entry" },
      h("div", { class: "entry-head" },
        h("div", { class: "entry-cover" },
          coverNode({ title: entry.title, author: entry.author || "", cover: knownCover(entry.title) }, "xs")
        ),
        h("div", { class: "entry-title" },
          h("h4", { text: entry.title }),
          entry.author && h("p", { class: "muted small", text: entry.author })
        ),
        h("span", { class: "pages-badge", text: `${entry.pages} pag.` })
      ),
      meta && h("p", { class: "muted small", text: meta }),
      all.length
        ? h("details", { class: "qa" },
            h("summary", { text: `Domande sul contesto (${all.length})` }),
            h("dl", {}, all.flatMap((item) => [
              h("dt", { text: item.q }),
              h("dd", { text: item.a || "—" })
            ]))
          )
        : h("p", { class: "muted small", text: "Nessuna domanda compilata." }),
      entry.aiComment && entry.aiComment.text
        ? h("blockquote", { class: "ai-note" },
            h("span", { class: "ai-note-label", text: "Claude" }),
            h("p", { text: entry.aiComment.text })
          )
        : null,
      h("div", { class: "entry-actions" },
        h("button", { type: "button", class: "btn ghost small", onClick: () => startEdit(entry.id), text: "Modifica" }),
        h("button", {
          type: "button", class: "btn ghost small", onClick: () => aiFeedback(entry),
          text: entry.aiComment ? "Chiedi di nuovo" : "Commento di Claude"
        }),
        h("button", {
          type: "button", class: "btn ghost small",
          onClick: () => ninaFromEntry(entry), text: "Racconta a Nina"
        }),
        h("button", { type: "button", class: "btn ghost small danger", onClick: () => removeEntry(entry), text: "Elimina" })
      )
    );
  }

  function removeEntry(entry) {
    const ok = window.confirm(`Eliminare la lettura di «${entry.title}» del ${formatDay(entry.date).toLowerCase()}?`);
    if (!ok) return;
    Store.deleteEntry(entry.id);
    if (editingId === entry.id) resetForm();
    renderAll();
    toast("Lettura eliminata.");
  }

  /* ------------------------------------------------------------- profilo */

  function renderProfilo(entries, stats, user) {
    const box = $("#profilo-stats");
    clear(box);
    const anno = new Date().getFullYear();
    const finiti = Store.shelfBooks("letti").filter(
      (b) => new Date(b.addedAt || 0).getFullYear() === anno
    ).length;

    const cards = [
      ["Pagine lette", String(stats.pages), plural(stats.sessions, "lettura", "letture")],
      ["Giorni di fila", String(stats.streak), stats.streak ? "continua così" : "si riparte oggi"],
      ["Libri finiti", String(finiti), "nel " + anno],
      ["Questa settimana", String(stats.pagesLast7), `obiettivo ${stats.goal * 7}`],
      ["Tempo di lettura", stats.minutes ? formatMinutes(stats.minutes) : "—", "quando lo segni"]
    ];
    for (const [label, value, sub] of cards) {
      box.append(
        h("div", { class: "stat" },
          h("span", { class: "stat-label", text: label }),
          h("strong", { class: "stat-value", text: value }),
          h("span", { class: "stat-sub", text: sub })
        )
      );
    }

    renderChart(stats);
    renderBooks(stats.books);
    renderKeyState();
    $("#goal-input").value = String(user.dailyGoal);
  }

  function formatMinutes(total) {
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (!hours) return `${mins} min`;
    return mins ? `${hours} h ${mins} min` : `${hours} h`;
  }

  function renderChart(stats) {
    const chart = $("#chart");
    clear(chart);
    const days = lastDays(14);
    const values = days.map((iso) => stats.pagesByDate.get(iso) || 0);
    const max = Math.max(stats.goal, ...values, 1);

    for (let i = 0; i < days.length; i++) {
      const iso = days[i];
      const value = values[i];
      const height = Math.round((value / max) * 100);
      chart.append(
        h("div", { class: "chart-col", title: `${formatDay(iso)}: ${plural(value, "pagina", "pagine")}` },
          h("div", { class: "chart-bar-track" },
            h("div", { class: "chart-bar" + (value >= stats.goal ? " is-goal" : ""), style: `height:${value ? Math.max(4, height) : 0}%` })
          ),
          h("span", { class: "chart-label", text: shortFormatter.format(fromISODate(iso)).replace(".", "") })
        )
      );
    }
  }

  function renderBooks(books) {
    const box = $("#books-list");
    clear(box);
    if (!books.length) {
      box.append(h("p", { class: "muted", text: "Nessun libro ancora. Comincia dal primo." }));
      return;
    }
    for (const b of books) {
      box.append(
        h("div", { class: "book" },
          h("div", { class: "book-mini" },
            coverNode({ title: b.title, author: b.author, cover: knownCover(b.title) }, "xs")
          ),
          h("div", { class: "book-text" },
            h("strong", { text: b.title }),
            h("span", { class: "muted small", text: [b.author, `${plural(b.pages, "pagina", "pagine")} in ${plural(b.sessions, "lettura", "letture")}`, b.lastDate ? `ultima: ${formatDay(b.lastDate).toLowerCase()}` : ""].filter(Boolean).join(" · ") })
          ),
          h("div", { class: "book-actions" },
            h("button", { type: "button", class: "btn ghost small", onClick: () => aiRecap(b), text: "Dove eravamo rimasti" }),
            h("button", { type: "button", class: "btn small", onClick: () => resume(b), text: "Riprendi" })
          )
        )
      );
    }
  }

  /** Precompila il form con il libro scelto, ripartendo dalla pagina dopo l'ultima. */
  function resume(book) {
    resetForm();
    $("#f-titolo").value = book.title;
    $("#f-autore").value = book.author || "";
    if (book.lastPage > 0) $("#f-da").value = String(book.lastPage + 1);
    switchView("nuova");
    $("#f-a").focus();
    toast(`Riprendi «${book.title}».`);
  }

  /* ------------------------------------------------------------- Claude */

  /** Le domande e risposte di una lettura, nell'ordine in cui appaiono nel form. */
  function entryQA(entry) {
    const fixed = QUESTIONS
      .filter((q) => String(entry.answers?.[q.id] || "").trim())
      .map((q) => ({ q: q.label, a: entry.answers[q.id] }));
    const custom = (entry.customQA || [])
      .filter((qa) => String(qa.a || "").trim())
      .map((qa) => ({ q: qa.q || "Domanda", a: qa.a }));
    return fixed.concat(custom);
  }

  /** Una lettura passata riassunta per Claude: pagine, giorno e appunti. */
  function sessionSummary(entry) {
    const range = entry.pageFrom !== null && entry.pageFrom !== undefined
      && entry.pageTo !== null && entry.pageTo !== undefined
      ? `pagine ${entry.pageFrom}–${entry.pageTo}`
      : `${entry.pages} pagine`;
    const qa = AI.formatQA(entryQA(entry));
    return `(${range}, ${formatDay(entry.date).toLowerCase()})\n${qa || "nessun appunto"}`;
  }

  /** Le letture precedenti dello stesso libro, dalla più vecchia alla più recente. */
  function previousSessions(title, excludeId) {
    const key = String(title || "").trim().toLowerCase();
    if (!key) return [];
    return Store.entries()
      .filter((e) => String(e.title || "").trim().toLowerCase() === key && e.id !== excludeId)
      .reverse()
      .map(sessionSummary);
  }

  /* --- finestra di dialogo: risposta di Claude, oppure prompt da copiare --- */

  const dialog = () => $("#ai-dialog");

  function openDialog(title, note) {
    const box = dialog();
    $("#ai-title").textContent = title;
    $("#ai-note").textContent = note || "";
    $("#ai-note").hidden = !note;
    clear($("#ai-body"));
    clear($("#ai-actions"));
    if (!box.open) {
      box.showModal();
      openLayer("dialog", () => { if (box.open) box.close(); });
    }
  }

  function dialogLoading(message) {
    clear($("#ai-body"));
    $("#ai-body").append(h("p", { class: "ai-loading", text: message }));
  }

  function dialogAnswer(text, sources) {
    clear($("#ai-body"));
    $("#ai-body").append(h("p", { class: "ai-answer", text: text }));
    if (sources && sources.length) {
      const line = h("p", { class: "muted small" }, "Costruita su: ");
      sources.forEach((source, i) => {
        if (i) line.append(document.createTextNode(" · "));
        line.append(h("a", { href: source.url, target: "_blank", rel: "noopener noreferrer", text: source.name }));
      });
      $("#ai-body").append(line);
    }
    clear($("#ai-actions"));
    $("#ai-actions").append(h("button", { type: "button", class: "btn", onClick: closeDialog, text: "Chiudi" }));
  }

  /** Chiede prima qualcosa all'utente, poi passa il testo a chi ha chiamato. */
  function dialogCompose(label, placeholder, onSubmit) {
    const field = h("textarea", { rows: "3", maxlength: "600", placeholder, "aria-label": label });
    clear($("#ai-body"));
    $("#ai-body").append(h("p", { class: "compose-label", text: label }), field);
    clear($("#ai-actions"));
    $("#ai-actions").append(
      h("button", {
        type: "button", class: "btn primary", text: "Chiedi",
        onClick: () => {
          const value = field.value.trim();
          if (!value) { toast("Scrivi prima la tua domanda."); field.focus(); return; }
          onSubmit(value);
        }
      }),
      h("button", { type: "button", class: "btn ghost", onClick: closeDialog, text: "Annulla" })
    );
    field.focus();
  }

  /**
   * Nessuna chiave, o API irraggiungibile: l'app prepara comunque la domanda.
   * Con `onPaste` compare anche il campo per riportare dentro la risposta.
   */
  function dialogManual(prompt, note, onPaste) {
    $("#ai-note").textContent = note;
    $("#ai-note").hidden = false;

    const promptBox = h("textarea", { class: "ai-prompt", rows: "8", readonly: true, "aria-label": "Domanda da copiare" });
    promptBox.value = prompt;

    clear($("#ai-body"));
    $("#ai-body").append(promptBox);

    clear($("#ai-actions"));
    $("#ai-actions").append(
      h("button", { type: "button", class: "btn primary", onClick: () => copyText(promptBox), text: "Copia la domanda" }),
      h("a", { class: "btn", href: "https://claude.ai/new", target: "_blank", rel: "noopener noreferrer", text: "Apri Claude" }),
      h("button", { type: "button", class: "btn ghost", onClick: closeDialog, text: "Chiudi" })
    );

    if (!onPaste) return;
    const answerBox = h("textarea", { class: "ai-prompt", rows: "5", placeholder: "Incolla qui la risposta di Claude", "aria-label": "Risposta di Claude" });
    $("#ai-body").append(
      h("p", { class: "hint", text: "Poi torna qui e incolla la risposta:" }),
      answerBox,
      h("button", {
        type: "button", class: "btn small", text: "Usa questa risposta",
        onClick: () => {
          const value = answerBox.value.trim();
          if (!value) { toast("Incolla prima la risposta di Claude."); return; }
          onPaste(value);
          closeDialog();
        }
      })
    );
  }

  function closeDialog() {
    if (requestCloseLayer("dialog")) return;
    if (dialog().open) dialog().close();
  }

  /**
   * Copia negli appunti. Prima la via sincrona, che funziona anche dentro una
   * finestra di dialogo e in un iframe; l'API asincrona resta come riserva, ma
   * con un tempo massimo, perché in alcuni contesti non risponde mai.
   */
  async function copyText(field) {
    field.focus();
    field.select();

    try {
      if (document.execCommand("copy")) {
        toast("Copiato.");
        return;
      }
    } catch (err) { /* deprecata e non sempre disponibile: si prosegue */ }

    try {
      await Promise.race([
        navigator.clipboard.writeText(field.value),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1500))
      ]);
      toast("Copiato.");
    } catch (err) {
      toast("Copia non permessa qui: il testo è già selezionato, usa Ctrl+C (⌘+C sul Mac).");
    }
  }

  /**
   * Il giro completo di una richiesta: chiave presente → chiama l'API;
   * altrimenti, o se la chiamata fallisce, mostra il prompt da copiare.
   */
  async function askClaude({ title, note, prompt, onText, onPaste, sources, quiet }) {
    if (!AI.hasKey()) {
      openDialog(title, note);
      dialogManual(prompt, "Non hai una chiave API di Claude: copia la domanda qui sotto e incollala in Claude.", onPaste);
      return;
    }

    // Con «quiet» il risultato non si legge nel dialogo ma finisce nella
    // pagina: aprirlo e richiuderlo subito sarebbe solo un lampo fastidioso.
    if (quiet) toast("Chiedo a Claude…");
    else {
      openDialog(title, note);
      dialogLoading("Sto chiedendo a Claude…");
    }

    const result = await AI.ask(prompt);

    if (result.ok) {
      if (onText) onText(result.text);
      else dialogAnswer(result.text, sources);
      return;
    }

    openDialog(title, note);
    dialogManual(prompt, `${AI.explain(result)} Intanto puoi copiare la domanda e incollarla in Claude.`, onPaste);
  }

  /* --- le tre richieste --- */

  function aiSuggestQuestions() {
    const title = $("#f-titolo").value.trim();
    if (!title) {
      toast("Scrivi prima il titolo del libro.");
      $("#f-titolo").focus();
      return;
    }
    const pages = readNumber("#f-pagine", { min: 1 });
    const entry = {
      pages: Number.isFinite(pages) && pages ? pages : null,
      pageFrom: readNumber("#f-da"),
      pageTo: readNumber("#f-a")
    };
    if (!entry.pages && (entry.pageFrom === null || entry.pageTo === null)) {
      toast("Scrivi prima quante pagine hai letto.");
      $("#f-pagine").focus();
      return;
    }

    const prompt = AI.prompts.questions({
      title,
      author: $("#f-autore").value.trim(),
      entry,
      previous: previousSessions(title, editingId).slice(-2)
    });

    const useQuestions = (text) => {
      const questions = AI.parseQuestions(text);
      if (!questions.length) {
        toast("Non ho trovato domande nella risposta.");
        return;
      }
      for (const question of questions) addCustomRow(question, "");
      closeDialog();
      switchView("nuova");
      toast(`Aggiunte ${plural(questions.length, "domanda", "domande")}. Ora rispondi con parole tue.`);
    };

    askClaude({
      title: "Domande su misura",
      note: `Per «${title}».`,
      prompt,
      quiet: true,          // le domande compaiono nel form, non nel dialogo
      onText: useQuestions,
      onPaste: useQuestions
    });
  }

  function aiFeedback(entry) {
    const qa = entryQA(entry);
    if (!qa.length) {
      toast("Rispondi prima ad almeno una domanda: Claude commenta quello che hai scritto.");
      return;
    }
    const prompt = AI.prompts.feedback({ title: entry.title, author: entry.author, entry, qa });
    const save = (text) => {
      Store.updateEntry(entry.id, { aiComment: { text, at: new Date().toISOString() } });
      renderAll();
      dialogAnswer(text);
    };
    askClaude({
      title: "Commento di Claude",
      note: `Su «${entry.title}», ${formatDay(entry.date).toLowerCase()}.`,
      prompt,
      onText: save,
      onPaste: save
    });
  }

  function aiRecap(book) {
    const sessions = previousSessions(book.title, null);
    if (!sessions.length) {
      toast("Nessun appunto su questo libro, per ora.");
      return;
    }
    askClaude({
      title: "Dove eravamo rimasti",
      note: `Su «${book.title}», da ${plural(sessions.length, "lettura", "letture")}.`,
      prompt: AI.prompts.recap({ title: book.title, author: book.author, sessions })
    });
  }

  /* --- impostazioni della chiave --- */

  function renderKeyState() {
    const field = $("#ai-key");
    const state = $("#ai-key-state");
    if (AI.hasKey()) {
      field.value = "";
      field.placeholder = "chiave salvata — incollane una nuova per sostituirla";
      state.textContent = `Chiave salvata. Claude risponde dentro l'app con il modello ${AI.MODEL}.`;
    } else {
      field.placeholder = "sk-ant-…";
      state.textContent = "Nessuna chiave: l'app prepara la domanda da copiare in Claude.";
    }
  }

  /* ============================================================== LIBRERIA */

  /** Lo stato della libreria: che cosa si sta cercando e come. */
  const lib = {
    query: "",
    mode: "tutto",
    language: "",
    sort: "pertinenza",
    page: 1,
    total: 0,
    books: [],
    busy: false,
    token: 0
  };

  let currentBook = null;
  let currentDossier = null;

  function hashString(text) {
    let hash = 0;
    const s = String(text || "");
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    return hash;
  }

  const formatNumber = (n) => new Intl.NumberFormat("it-IT").format(n);

  /* ------------------------------------------------------------ copertine */

  /**
   * La copertina vera se c'è e si carica, altrimenti una disegnata col titolo.
   * Serve davvero: moltissimi libri non hanno copertina, e in certe pagine le
   * immagini esterne non vengono caricate affatto.
   */
  function coverNode(book, size) {
    const wrap = h("div", { class: `cover cover-${size}` });
    const drawCover = () => {
      clear(wrap);
      wrap.classList.remove("is-loading");
      wrap.classList.add("is-drawn", "pattern-" + (hashString(book.title) % 4));
      wrap.append(
        h("span", { class: "cover-title", text: book.title }),
        h("span", { class: "cover-author", text: (book.author || "").split(",")[0] })
      );
    };

    if (book.cover) {
      // L'ascoltatore va agganciato prima di src: se il caricamento fallisce
      // subito, l'evento parte prima ancora che si faccia in tempo ad ascoltarlo.
      const img = h("img", { alt: "", loading: "lazy", decoding: "async" });
      // Una richiesta che non fallisce ma resta appesa lascerebbe un buco vuoto
      // per sempre: dopo qualche secondo si disegna la copertina.
      const giveUp = setTimeout(drawCover, 3500);
      wrap.classList.add("is-loading");
      img.addEventListener("load", () => {
        clearTimeout(giveUp);
        wrap.classList.remove("is-loading");
        if (!img.naturalWidth) drawCover(); // immagine servita ma vuota
      });
      img.addEventListener("error", () => {
        clearTimeout(giveUp);
        drawCover();
      });
      wrap.append(img);
      img.src = book.cover;
    } else {
      drawCover();
    }
    return wrap;
  }

  /**
   * A che punto sei di questo libro. È il collegamento fra le due metà
   * dell'app: la libreria sa che cosa stai leggendo, il diario sa quanto.
   */
  function progressOf(book) {
    const wanted = Books.normalize(book.title);
    const letture = Store.entries().filter((e) => Books.normalize(e.title) === wanted);
    if (!letture.length) return null;

    // La pagina più avanti raggiunta è più onesta della somma: rileggere
    // venti pagine non fa avanzare di venti.
    const perPagina = letture.reduce((max, e) => Math.max(max, Number(e.pageTo) || 0), 0);
    const sommate = letture.reduce((acc, e) => acc + (Number(e.pages) || 0), 0);
    const read = Math.max(perPagina, perPagina ? 0 : sommate);
    const total = Number(book.pages) || 0;
    if (!read) return null;

    return {
      read,
      total,
      percent: total ? Math.min(100, Math.round((read / total) * 100)) : null,
      sessions: letture.length
    };
  }

  /** La copertina che l'app conosce già per un titolo, se l'ha vista in libreria. */
  function knownCover(title) {
    const wanted = Books.normalize(title);
    for (const spec of Store.SHELVES) {
      const found = Store.shelfBooks(spec.id).find((b) => Books.normalize(b.title) === wanted);
      if (found && found.cover) return found.cover;
    }
    return null;
  }

  function bookCard(book, { compact = false, progress = false } = {}) {
    const shelf = Store.shelfOf(book);
    const shelfLabel = shelf ? (Store.SHELVES.find((s) => s.id === shelf) || {}).label : "";
    const avanzamento = progress ? progressOf(book) : null;

    return h("article", { class: "book-card" + (compact ? " is-compact" : "") },
      h("button", {
        type: "button", class: "book-card-btn",
        onClick: () => openBookSheet(book),
        "aria-label": `Apri ${book.title}${book.author ? ", " + book.author : ""}`
      },
        h("span", { class: "book-card-cover" },
          coverNode(book, compact ? "sm" : "md"),
          shelf && !progress ? h("span", { class: "book-card-flag", text: shelfLabel }) : null,
          avanzamento && avanzamento.percent !== null
            ? h("span", { class: "card-progress", title: `pagina ${avanzamento.read} di ${avanzamento.total}` },
                h("span", { class: "card-progress-fill", style: `width:${avanzamento.percent}%` })
              )
            : null
        ),
        h("span", { class: "book-card-text" },
          h("strong", { class: "book-card-title", text: book.title }),
          avanzamento
            ? h("span", { class: "book-card-author", text: avanzamento.percent !== null
                ? `pagina ${avanzamento.read} di ${avanzamento.total}`
                : `${plural(avanzamento.read, "pagina letta", "pagine lette")}` })
            : h("span", { class: "book-card-author", text: book.author || "autore sconosciuto" }),
          !compact && book.year ? h("span", { class: "book-card-year", text: String(book.year) }) : null
        )
      )
    );
  }

  /* -------------------------------------------------- comandi di ricerca */

  function renderSearchControls() {
    const modi = $("#lib-modi");
    clear(modi);
    for (const [id, spec] of Object.entries(Books.MODES)) {
      modi.append(h("button", {
        type: "button",
        class: "mode" + (lib.mode === id ? " is-active" : ""),
        "aria-pressed": lib.mode === id ? "true" : "false",
        text: spec.label,
        onClick: () => {
          lib.mode = id;
          renderSearchControls();
          if (lib.query) runSearch();
        }
      }));
    }

    const lingua = $("#f-lingua");
    if (!lingua.options.length) {
      for (const l of Books.LANGUAGES) lingua.append(h("option", { value: l.code, text: l.label }));
    }
    lingua.value = lib.language;

    const ordine = $("#f-ordine");
    if (!ordine.options.length) {
      for (const [id, spec] of Object.entries(Books.SORTS)) {
        ordine.append(h("option", { value: id, text: spec.label }));
      }
    }
    ordine.value = lib.sort;

    $("#btn-azzera").hidden = !(lib.query || lib.language || lib.sort !== "pertinenza" || lib.mode !== "tutto");
  }

  function resetSearch() {
    lib.query = "";
    lib.mode = "tutto";
    lib.language = "";
    lib.sort = "pertinenza";
    lib.books = [];
    lib.total = 0;
    lib.page = 1;
    lib.token++;
    $("#f-cerca").value = "";
    renderSearchControls();
    showBrowse();
  }

  function showBrowse() {
    $("#lib-risultati-box").hidden = true;
    $("#lib-sfoglia").hidden = false;
  }

  function showResults() {
    $("#lib-sfoglia").hidden = true;
    $("#lib-risultati-box").hidden = false;
  }

  /* ---------------------------------------------------------- la ricerca */

  async function runSearch(nextPage = false) {
    const clean = $("#f-cerca").value.trim();
    if (!nextPage) {
      if (clean.length < 2) {
        toast("Scrivi almeno due lettere.");
        return;
      }
      lib.query = clean;
      lib.page = 1;
      lib.books = [];
    }

    const token = ++lib.token;
    lib.busy = true;
    showResults();
    renderSearchControls();
    $("#btn-altri").disabled = true;

    if (!nextPage) {
      const box = $("#lib-risultati");
      clear(box);
      for (let i = 0; i < 8; i++) box.append(h("div", { class: "book-card is-skeleton" }));
      $("#lib-stato").textContent = "Cerco…";
      $("#lib-autore").hidden = true;
    }

    const result = await Books.search({
      query: lib.query,
      mode: lib.mode,
      language: lib.language,
      sort: lib.sort,
      page: lib.page
    });

    if (token !== lib.token) return; // è già partita una ricerca più recente

    lib.busy = false;
    $("#btn-altri").disabled = false;
    lib.total = result.total;
    lib.books = nextPage ? lib.books.concat(result.books) : result.books;

    renderResults(result);
    if (!nextPage) lookUpAuthor(token);
  }

  function renderResults(result) {
    const box = $("#lib-risultati");
    clear(box);

    if (!lib.books.length) {
      $("#lib-stato").textContent = "";
      $("#btn-altri").hidden = true;
      box.append(result.online
        ? emptyState(
            "Nessun libro trovato.",
            "Prova con il titolo esatto, con il solo cognome dell'autore, o cambia la modalità di ricerca."
          )
        : emptyState(
            "Nessun libro trovato, e il catalogo online non risponde.",
            `Da questa pagina posso cercare solo fra le ${formatNumber(Books.operePresenti())} opere ` +
            `di ${formatNumber(Books.autoriPresenti())} autori che l'app si porta dietro. ` +
            "Può essere la rete, oppure una pagina che non ha il permesso di chiamare servizi esterni.",
            "Riprova",
            () => runSearch()
          ));
      return;
    }

    const shown = lib.books.length;
    $("#lib-stato").textContent = result.online
      ? `${formatNumber(lib.total)} ${lib.total === 1 ? "risultato" : "risultati"} per «${lib.query}» — ne vedi ${formatNumber(shown)}.`
      : `${plural(shown, "libro", "libri")} fra le ${formatNumber(Books.operePresenti())} opere ` +
        `di ${formatNumber(Books.autoriPresenti())} autori che l'app si porta dietro. ` +
        `Il catalogo online, molto più grande, non è raggiungibile da questa pagina.`;

    for (const book of lib.books) box.append(bookCard(book));
    $("#btn-altri").hidden = !result.hasMore;
  }

  async function loadMore() {
    if (lib.busy) return;
    lib.page++;
    await runSearch(true);
  }

  /* ------------------------------------------------------------- autori */

  /**
   * «calvino» deve bastare per riconoscere Italo Calvino: si confrontano le
   * parole, non le stringhe intere, così basta il cognome o il nome completo.
   */
  function nameMatches(name, query) {
    const words = new Set(Books.normalize(name).split(" ").filter(Boolean));
    const asked = Books.normalize(query).split(" ").filter(Boolean);
    if (!asked.length) return false;
    return asked.every((word) => words.has(word));
  }

  /** Se la ricerca somiglia al nome di un autore, la scheda dell'autore aiuta. */
  async function lookUpAuthor(token) {
    const card = $("#lib-autore");
    card.hidden = true;
    if (lib.mode === "isbn" || lib.mode === "argomento") return;

    const found = await Books.findAuthors(lib.query);
    if (token !== lib.token || !found.ok || !found.authors.length) return;

    const author = found.authors[0];
    if (lib.mode !== "autore" && !nameMatches(author.name, lib.query)) return;

    const profile = await Books.authorProfile(author);
    if (token !== lib.token) return;

    clear(card);
    const dates = [author.birth, author.death].filter(Boolean).join(" – ");
    card.append(
      h("div", { class: "author-head" },
        h("div", {},
          h("h3", { text: profile ? profile.name : author.name }),
          h("p", { class: "muted small", text: [dates, plural(author.works, "opera", "opere")].filter(Boolean).join(" · ") })
        ),
        lib.mode !== "autore"
          ? h("button", { type: "button", class: "btn small", text: "Tutte le opere", onClick: () => searchByAuthor(author.name) })
          : null
      ),
      profile && profile.bio
        ? h("p", { class: "author-bio", text: trimTo(profile.bio, 420) })
        : null,
      profile
        ? h("p", { class: "muted small" }, h("a", { href: profile.url, target: "_blank", rel: "noopener noreferrer", text: "Scheda su Open Library" }))
        : null
    );
    card.hidden = false;
  }

  function searchByAuthor(name) {
    lib.mode = "autore";
    $("#f-cerca").value = name;
    switchView("libreria");
    runSearch();
  }

  /* ---------------------------------------------------------- gli scaffali */

  /**
   * Gli scaffali da sfogliare. Dodici richieste tutte insieme sarebbero uno
   * spreco: ogni scaffale si carica quando sta per entrare nello schermo.
   */
  function renderBrowseShelves() {
    renderInvitoOnePiece();
    const box = $("#lib-scaffali");
    clear(box);
    box.append(h("h3", { class: "browse-title", text: "Sfoglia gli scaffali" }));

    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver((entries, self) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            self.unobserve(entry.target);
            fillShelf(entry.target);
          }
        }, { rootMargin: "300px" })
      : null;

    for (const spec of Books.SHELVES) {
      const row = h("section", { class: "shelf", dataset: { key: spec.key } },
        h("div", { class: "shelf-head" },
          h("h4", { text: spec.label }),
          h("button", {
            type: "button", class: "btn ghost small", text: "Vedi tutto",
            onClick: () => {
              lib.mode = "argomento";
              $("#f-cerca").value = spec.key.replace(/_/g, " ");
              runSearch();
            }
          })
        ),
        h("div", { class: "shelf-row" },
          ...Array.from({ length: 6 }, () => h("div", { class: "book-card is-compact is-skeleton" }))
        )
      );
      box.append(row);
      if (observer) observer.observe(row);
      else fillShelf(row);
    }
  }

  async function fillShelf(row) {
    const key = row.dataset.key;
    const result = await Books.shelf(key);
    const strip = $(".shelf-row", row);
    clear(strip);
    if (!result.ok || !result.books.length) {
      row.remove(); // uno scaffale vuoto è peggio di uno scaffale assente
      return;
    }
    const head = $(".shelf-head h4", row);
    // Il totale è quello di Open Library. Senza rete lo scaffale è quello che
    // l'app si porta dietro, e dire «14» accanto a «Fantasy» sarebbe falso.
    if (result.total && result.online !== false) {
      head.append(h("span", { class: "shelf-count", text: formatNumber(result.total) }));
    }
    for (const book of result.books) strip.append(bookCard(book, { compact: true }));
  }

  /**
   * Arrivare all'ultima pagina è un traguardo: il libro passa da solo su
   * «Letti». Si fa solo quando le pagine totali si conoscono davvero.
   */
  function segnalaSeFinito(data) {
    const arrivato = Number(data.pageTo) || 0;
    if (!arrivato) return false;

    const wanted = Books.normalize(data.title);
    for (const spec of Store.SHELVES) {
      const book = Store.shelfBooks(spec.id).find((b) => Books.normalize(b.title) === wanted);
      if (!book || !book.pages) continue;
      if (spec.id === "letti" || arrivato < book.pages) return false;
      Store.setShelf(book, "letti");
      return true;
    }
    return false;
  }

  /* -------------------------------------------------- continua a leggere */

  /**
   * Il gesto di ogni sera è sempre lo stesso: segnare le pagine del libro che
   * si sta leggendo. Ridigitarne il titolo ogni volta è attrito inutile, e
   * l'app quel titolo lo sa già.
   */
  function renderContinua() {
    const box = $("#continua");
    clear(box);
    box.hidden = true;
    if (editingId) return; // durante una modifica sarebbe solo confusione

    const inLettura = Store.shelfBooks("in-lettura");
    if (!inLettura.length) return;

    // Il libro toccato più di recente: quello che con ogni probabilità si ha in mano.
    const ultimo = Store.entries()[0];
    const book = (ultimo && inLettura.find((b) => Books.normalize(b.title) === Books.normalize(ultimo.title)))
      || inLettura[0];

    const avanzamento = progressOf(book);
    const daPagina = avanzamento && avanzamento.percent !== null ? avanzamento.read + 1 : null;

    box.hidden = false;
    box.append(
      h("div", { class: "continua-cover" }, coverNode(book, "xs")),
      h("div", { class: "continua-text" },
        h("span", { class: "continua-label", text: "Stai leggendo" }),
        h("strong", { class: "continua-title", text: book.title }),
        avanzamento
          ? h("span", { class: "muted small", text: avanzamento.percent !== null
              ? `pagina ${avanzamento.read} di ${avanzamento.total} — ${avanzamento.percent}%`
              : plural(avanzamento.read, "pagina letta", "pagine lette") })
          : h("span", { class: "muted small", text: "non hai ancora segnato niente" })
      ),
      h("button", {
        type: "button", class: "btn primary small",
        text: daPagina ? `Riprendi da pag. ${daPagina}` : "Compila",
        onClick: () => {
          $("#f-titolo").value = book.title;
          $("#f-autore").value = book.author || "";
          if (daPagina) $("#f-da").value = String(daPagina);
          ($("#f-da").value ? $("#f-a") : $("#f-pagine")).focus();
          toast(`«${book.title}» nel form.`);
        }
      })
    );
  }

  /* ------------------------------------------------------ i miei scaffali */

  function renderMyShelves() {
    const box = $("#lib-miei");
    clear(box);
    const counts = Store.shelfCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (!total) return;

    box.append(h("h3", { class: "browse-title", text: "I miei scaffali" }));
    for (const spec of Store.SHELVES) {
      const books = Store.shelfBooks(spec.id);
      if (!books.length) continue;
      box.append(
        h("section", { class: "shelf" },
          h("div", { class: "shelf-head" },
            h("h4", { text: spec.label }),
            h("span", { class: "shelf-count", text: String(books.length) })
          ),
          h("div", { class: "shelf-row" },
            books.map((book) => bookCard(book, { compact: true, progress: spec.id === "in-lettura" }))
          )
        )
      );
    }
  }

  /* ------------------------------------------------------ scheda del libro */

  async function openBookSheet(book) {
    currentBook = book;
    currentDossier = null;

    $("#sheet-title").textContent = book.title;
    $("#sheet-author").textContent = book.author || "Autore sconosciuto";

    const meta = $("#sheet-meta");
    clear(meta);
    const bits = [book.year ? String(book.year) : "", book.pages ? plural(book.pages, "pagina", "pagine") : ""].filter(Boolean);
    if (bits.length) meta.append(document.createTextNode(bits.join(" · ")));
    if (book.author) {
      if (bits.length) meta.append(document.createTextNode(" · "));
      meta.append(h("button", {
        type: "button", class: "link-button", text: "altri libri di " + book.author.split(",")[0],
        onClick: () => { closeSheet(); searchByAuthor(book.author.split(",")[0]); }
      }));
    }

    clear($("#sheet-cover"));
    $("#sheet-cover").append(coverNode(book, "lg"));
    clear($("#sheet-temi"));
    clear($("#sheet-facts"));
    clear($("#sheet-body"));
    $("#sheet-sources").textContent = "";
    $("#sheet-body").append(h("p", { class: "ai-loading", text: "Cerco di che cosa parla…" }));
    renderShelfPicker(book);
    $("#btn-apri-lettore").hidden = !puoLeggersi(book);

    const sheet = $("#book-sheet");
    if (!sheet.open) {
      sheet.showModal();
      openLayer("sheet", () => { if (sheet.open) sheet.close(); });
    }
    sheet.scrollTop = 0;

    // Di un volume di One Piece la trama è scritta dentro l'app: non c'è
    // niente da cercare in rete, e cercarlo darebbe la voce sbagliata.
    if (book.source === "onepiece") {
      renderSchedaOnePiece(book);
      return;
    }

    const dossier = await Books.research(book);
    if (currentBook !== book) return; // l'utente ha già aperto un altro libro
    currentDossier = dossier;
    renderSheetBody(dossier);
  }

  /**
   * La scheda di un volume di One Piece.
   *
   * Tre cose che le altre schede non hanno: la trama già scritta, nella lingua
   * scelta; i capitoli contenuti, perché un volume è una fetta di una storia
   * più lunga; e dove leggerlo per davvero, che per un manga sotto copyright
   * non è il lettore interno ma il suo editore.
   */
  function renderSchedaOnePiece(book) {
    const lingua = Books.getLinguaTrame();
    const arco = OnePiece.ARCHI.find((a) => a.key === book.arco);
    const body = $("#sheet-body");
    clear(body);

    // Prima che cosa succede in questo volume, poi in che storia si inserisce:
    // è l'ordine in cui serve, aprendo la scheda di un volume preciso.
    const sua = OnePiece.tramaVolume(book.volume, lingua);
    if (sua) {
      body.append(
        h("p", { class: "sheet-h", text: `In questo volume` }),
        h("p", { class: "sheet-text", text: sua })
      );
    }
    if (arco) {
      body.append(
        h("p", { class: "sheet-h", text: `${sua ? "L'arco: " : "Arco: "}${arco.nome[lingua]}` }),
        h("p", { class: "sheet-text", text: arco.trama[lingua] })
      );
    }

    body.append(h("div", { class: "row wrap" },
      h("button", {
        type: "button", class: "btn small", text: "Leggilo come un libro",
        onClick: leggiOnePieceComeLibro
      }),
      h("button", {
        type: "button", class: "btn small", text: "Tutta la guida a One Piece",
        onClick: () => apriGuidaOnePiece(book.arco)
      }),
      h("select", {
        class: "op-lingua-mini", "aria-label": "Lingua della trama",
        onChange: (e) => { Books.setLinguaTrame(e.target.value); renderSchedaOnePiece(book); }
      }, ...OnePiece.LINGUE.map((l) => h("option", {
        value: l.code, text: l.label, selected: l.code === lingua ? "selected" : null
      })))
    ));

    const fatti = $("#sheet-facts");
    clear(fatti);
    const righe = [
      ["Volume", `${book.volume} di ${OnePiece.quantiVolumi()}`],
      ["Capitoli", `dal ${book.capitoli[0]} al ${book.capitoli[1]}`],
      ["Titolo originale", book.altTitle || "—"],
      ["Editore italiano", "Star Comics"]
    ];
    for (const [etichetta, valore] of righe) {
      fatti.append(h("dt", { text: etichetta }), h("dd", { text: valore }));
    }

    const fonti = $("#sheet-sources");
    clear(fonti);
    fonti.append(document.createTextNode("Dove leggerlo: "));
    OnePiece.DOVE.forEach((d, i) => {
      if (i) fonti.append(document.createTextNode(" · "));
      fonti.append(h("a", { href: d.url, target: "_blank", rel: "noopener noreferrer", text: d.nome }));
    });

    // Il lettore interno apre solo le opere di dominio pubblico: dirlo qui
    // evita di far cercare a vuoto un testo che non può esistere.
    $("#btn-apri-lettore").hidden = true;
  }

  function renderShelfPicker(book) {
    const box = $("#sheet-scaffale");
    clear(box);
    const here = Store.shelfOf(book);
    for (const spec of Store.SHELVES) {
      const active = here === spec.id;
      box.append(h("button", {
        type: "button",
        class: "shelf-chip" + (active ? " is-active" : ""),
        "aria-pressed": active ? "true" : "false",
        text: spec.label,
        onClick: () => {
          Store.setShelf(book, active ? null : spec.id);
          renderShelfPicker(book);
          renderMyShelves();
          toast(active ? `Tolto dagli scaffali.` : `«${book.title}» → ${spec.label}.`);
        }
      }));
    }
  }

  function renderSheetBody(dossier) {
    const book = dossier.book;
    const body = $("#sheet-body");
    clear(body);

    const opening = dossier.intro || book.blurb || book.firstSentence;
    if (opening) {
      body.append(
        h("h4", { class: "sheet-h", text: "Di che cosa parla" }),
        h("p", { class: "sheet-text", text: trimTo(opening, 760) })
      );
    }

    if (dossier.plot) {
      // La trama enciclopedica racconta anche il finale: sta dietro un clic.
      body.append(
        h("details", { class: "plot" },
          h("summary", { text: "Leggi la trama completa" }),
          h("p", { class: "plot-warning", text: "Attenzione: una trama completa di solito racconta anche come va a finire." }),
          h("p", { class: "sheet-text", text: dossier.plot }),
          h("p", { class: "muted small", text: "Fonte: " + dossier.plotSource })
        )
      );
    } else if (!opening) {
      body.append(
        h("p", { class: "muted", text: dossier.online
          ? "Nessuna delle fonti pubbliche racconta questo libro."
          : "Da questa pagina non riesco a consultare le fonti online." }),
        h("button", {
          type: "button", class: "btn small", text: "Chiedi a Claude di che cosa parla",
          onClick: () => askClaude({ title: "Di che cosa parla", note: `«${book.title}»`, prompt: AI.prompts.plot(book) })
        })
      );
    }

    clear($("#sheet-temi"));
    for (const tema of dossier.subjects) {
      $("#sheet-temi").append(h("span", { class: "chip is-static", text: tema }));
    }

    renderProgress(dossier.book);
    renderFacts(dossier);

    const sources = $("#sheet-sources");
    clear(sources);
    if (dossier.sources.length) {
      sources.append(document.createTextNode("Fonti consultate: "));
      dossier.sources.forEach((source, i) => {
        if (i) sources.append(document.createTextNode(" · "));
        sources.append(h("a", { href: source.url, target: "_blank", rel: "noopener noreferrer", text: source.name }));
      });
    }
  }

  /** A che punto sei, se hai già segnato qualche lettura di questo libro. */
  function renderProgress(book) {
    const avanzamento = progressOf(Object.assign({}, book, { pages: book.pages || 0 }));
    if (!avanzamento) return;

    const testo = avanzamento.percent !== null
      ? `Sei a pagina ${avanzamento.read} di ${avanzamento.total} — ${avanzamento.percent}%`
      : `Hai letto ${plural(avanzamento.read, "pagina", "pagine")}`;

    $("#sheet-body").append(
      h("div", { class: "read-progress" },
        h("div", { class: "read-progress-head" },
          h("span", { text: testo }),
          h("span", { class: "muted small", text: plural(avanzamento.sessions, "lettura", "letture") })
        ),
        avanzamento.percent !== null
          ? h("div", { class: "bar", role: "progressbar",
              "aria-valuenow": String(avanzamento.percent), "aria-valuemin": "0", "aria-valuemax": "100",
              "aria-label": "Avanzamento nel libro" },
              h("span", { class: "bar-fill", style: `width:${avanzamento.percent}%` })
            )
          : null
      )
    );
  }

  /** La scheda catalografica: quello che rende un record un record. */
  function renderFacts(dossier) {
    const box = $("#sheet-facts");
    clear(box);
    const book = dossier.book;
    const editions = dossier.editions;

    const rows = [];
    // Molti libri girano con due nomi: «The Catcher in the Rye» in originale,
    // «Il giovane Holden» in libreria. Vederli entrambi evita di comprare due
    // volte lo stesso romanzo.
    if (book.altTitle) rows.push(["Conosciuto anche come", book.altTitle]);
    if (book.year) rows.push(["Prima pubblicazione", String(book.year)]);
    if (dossier.pages) rows.push(["Pagine", String(dossier.pages)]);
    if (editions && editions.count) rows.push(["Edizioni", formatNumber(editions.count)]);
    if (editions && editions.publishers.length) rows.push(["Editori", editions.publishers.join(", ")]);
    if (dossier.languages.length) {
      rows.push(["Lingue", dossier.languages.slice(0, 6).map(Books.languageName).join(", ")]);
    }
    if (editions && editions.isbn.length) rows.push(["ISBN", editions.isbn.join(" · ")]);

    for (const [label, value] of rows) {
      box.append(h("dt", { text: label }), h("dd", { text: value }));
    }
  }

  function trimTo(text, max) {
    const clean = String(text || "").trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const stop = cut.lastIndexOf(". ");
    return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut) + " […]";
  }

  function closeSheet() {
    if (requestCloseLayer("sheet")) return;
    if ($("#book-sheet").open) $("#book-sheet").close();
  }

  /** Dalla scheda al diario: il libro scelto entra nel form già compilato. */
  function startReading(book) {
    resetForm();
    $("#f-titolo").value = book.title;
    $("#f-autore").value = book.author || "";
    const known = groupByBook(Store.entries()).find(
      (b) => Books.normalize(b.title) === Books.normalize(book.title)
    );
    if (known && known.lastPage > 0) $("#f-da").value = String(known.lastPage + 1);
    if (!Store.shelfOf(book)) Store.setShelf(book, "in-lettura");
    renderMyShelves();
    closeSheet();
    switchView("nuova");
    ($("#f-da").value ? $("#f-a") : $("#f-pagine")).focus();
    toast(`«${book.title}» è pronto nel diario.`);
  }

  /** Il dubbio dell'utente, sciolto con il materiale raccolto in rete. */
  function askDoubt(book, dossier) {
    openDialog("Non ho capito una cosa", `Su «${book.title}».`);
    dialogCompose(
      "Che cosa non ti torna?",
      "es. perché il padre si arrabbia così tanto per un piatto di lumache?",
      (doubt) => {
        const material = dossier && !dossier.empty
          ? Books.dossierText(dossier)
          : `Libro: «${book.title}»${book.author ? " di " + book.author : ""}. Non ho trovato materiale in rete su questo libro.`;
        askClaude({
          title: "La spiegazione",
          note: `Su «${book.title}».`,
          prompt: AI.prompts.doubt({ dossier: material, doubt }),
          sources: dossier ? dossier.sources : []
        });
      }
    );
  }


  /* ==================================================== guida a One Piece */

  /**
   * La guida a One Piece.
   *
   * Esiste perché del manga non si può mettere il testo: è di Eiichirō Oda e
   * della Shūeisha, e nessuna fonte libera lo contiene. Quello che si può
   * fare è raccontarlo — la storia, i venti archi, tutti i 115 volumi — e
   * dire dove leggerlo per davvero, cioè dal suo editore.
   *
   * La lingua si cambia in cima e vale per tutto, comprese le trame nelle
   * schede dei volumi: italiano, inglese, giapponese, francese, spagnolo,
   * tedesco.
   */
  function apriGuidaOnePiece(arcoDaMostrare) {
    if (typeof OnePiece === "undefined") return;

    const select = $("#guida-lingua");
    if (!select.options.length) {
      for (const l of OnePiece.LINGUE) {
        select.append(h("option", { value: l.code, text: l.label }));
      }
      select.addEventListener("change", () => {
        Books.setLinguaTrame(select.value);
        renderGuidaOnePiece();
      });
    }
    select.value = Books.getLinguaTrame();

    subentraA("guida-op", nascondiGuidaOnePiece);
    $("#guida-op").hidden = false;
    document.body.classList.add("is-locked");
    renderGuidaOnePiece();

    if (arcoDaMostrare) {
      const bersaglio = $(`[data-arco="${arcoDaMostrare}"]`);
      if (bersaglio) bersaglio.scrollIntoView({ block: "start" });
    } else {
      $("#guida-corpo").scrollTop = 0;
    }
    $("#guida-corpo").focus();
  }

  function renderGuidaOnePiece() {
    const lingua = Books.getLinguaTrame();
    const box = $("#guida-corpo");
    clear(box);
    $("#guida-conta").textContent =
      `${OnePiece.quantiVolumi()} volumi · ${OnePiece.ultimoCapitolo()} capitoli`;

    // Di che cosa parla: la risposta alla domanda, scritta, senza chiedere
    // niente a nessuno e senza uscire da qui.
    for (const paragrafo of OnePiece.STORIA[lingua].split("\n\n")) {
      box.append(h("p", { class: "op-storia", text: paragrafo }));
    }

    box.append(h("div", { class: "op-avviso" },
      h("strong", { text: SPIEGAZIONE_OP[lingua].titolo }),
      document.createTextNode(" " + SPIEGAZIONE_OP[lingua].testo)
    ));

    box.append(h("div", { class: "op-apri" },
      h("button", {
        type: "button", class: "btn primary", text: SPIEGAZIONE_OP[lingua].leggi,
        onClick: leggiOnePieceComeLibro
      }),
      h("button", {
        type: "button", class: "btn", text: SPIEGAZIONE_OP[lingua].scarica,
        onClick: () => scaricaOnePieceEpub(lingua)
      }),
      h("span", { class: "hint", text: SPIEGAZIONE_OP[lingua].leggiNota })
    ));

    for (let i = 0; i < OnePiece.ARCHI.length; i++) {
      const arco = OnePiece.ARCHI[i];
      const volumi = OnePiece.volumiDellArco(arco.key);
      const fineVol = arco.vol[1] ? arco.vol[1] : OnePiece.quantiVolumi();
      const fineCap = arco.cap[1] ? String(arco.cap[1]) : "…";

      box.append(h("section", { class: "op-arco", dataset: { arco: arco.key } },
        h("div", { class: "op-arco-head" },
          h("span", { class: "op-arco-num", text: String(i + 1) }),
          h("h4", { text: arco.nome[lingua] }),
          lingua !== "ja" ? h("span", { class: "op-arco-ja", text: arco.nome.ja }) : null
        ),
        h("p", { class: "op-arco-dove",
          text: `volumi ${arco.vol[0]}–${fineVol} · capitoli ${arco.cap[0]}–${fineCap}` }),
        h("p", { class: "op-arco-trama", text: arco.trama[lingua] }),
        h("div", { class: "op-volumi" }, ...volumi.map((v) => h("button", {
          type: "button", class: "op-volume",
          title: `${OnePiece.altriTitoli(v, lingua).join(" · ")} — capitoli ${v[4]}-${v[5]}`,
          onClick: () => {
            requestCloseLayer("guida-op");
            const libro = OnePiece.comeLibri(lingua).find((b) => b.volume === v[0]);
            if (libro) openBookSheet(libro);
          }
        }, h("b", { text: String(v[0]) }),
           document.createTextNode(" " + OnePiece.titoloVolume(v, lingua)))))
      ));
    }

    const dove = h("section", { class: "op-dove" },
      h("h4", { text: SPIEGAZIONE_OP[lingua].dove })
    );
    for (const canale of OnePiece.DOVE) {
      dove.append(h("div", { class: "op-canale" },
        h("a", { class: "op-canale-nome", href: canale.url, target: "_blank",
                 rel: "noopener noreferrer", text: canale.nome }),
        h("p", { text: canale.nota[lingua] })
      ));
    }
    box.append(dove);
  }

  /**
   * Il perché, nelle sei lingue: che le trame sono scritte qui e il manga no.
   * Meglio dirlo una volta chiaramente che lasciare cercare un testo che non
   * può esistere.
   */
  const SPIEGAZIONE_OP = {
    it: { titolo: "Perché qui c'è la trama e non il manga.",
          testo: "One Piece è di Eiichirō Oda e della Shūeisha: il suo testo non esiste in nessuna fonte libera, e questa app non lo contiene. Le trame qui sotto sono scritte per l'app, arco per arco. Per leggere i capitoli ci sono i canali ufficiali in fondo alla pagina: su MANGA Plus, del suo editore, i primi tre e gli ultimi tre sono gratis.",
          dove: "Dove leggerlo, legalmente",
          leggi: "Leggilo come un libro", leggiNota: "137 pagine che si sfogliano, col segno che si salva da solo.",
          scarica: "Scaricalo in .epub" },
    en: { titolo: "Why the plot is here and the manga is not.",
          testo: "One Piece belongs to Eiichirō Oda and Shueisha: its text exists in no free source, and this app does not contain it. The summaries below were written for this app, arc by arc. To read the chapters, the official channels are at the foot of this page: on MANGA Plus, run by its own publisher, the first three and the latest three are free.",
          dove: "Where to read it, legally",
          leggi: "Read it as a book", leggiNota: "137 pages to turn, with a bookmark that saves itself.",
          scarica: "Download as .epub" },
    ja: { titolo: "ここにあらすじがあり、漫画本文がない理由。",
          testo: "『ONE PIECE』は尾田栄一郎氏と集英社の作品であり、その本文は自由に使える形では存在せず、このアプリにも含まれていません。以下のあらすじは、このアプリのために章ごとに書き起こしたものです。本編を読むには、ページ下部の公式配信をご利用ください。出版社自身が運営する MANGA Plus では、最初の三話と最新の三話が無料です。",
          dove: "公式に読める場所",
          leggi: "本のように読む", leggiNota: "137ページをめくって読める。しおりは自動で保存される。",
          scarica: ".epub でダウンロード" },
    fr: { titolo: "Pourquoi l'intrigue est ici et le manga non.",
          testo: "One Piece appartient à Eiichirō Oda et à Shueisha : son texte n'existe dans aucune source libre, et cette application ne le contient pas. Les résumés ci-dessous ont été écrits pour cette application, arc par arc. Pour lire les chapitres, les canaux officiels sont en bas de page : sur MANGA Plus, géré par son propre éditeur, les trois premiers et les trois derniers sont gratuits.",
          dove: "Où le lire, légalement",
          leggi: "Le lire comme un livre", leggiNota: "137 pages à tourner, avec un marque-page qui se sauvegarde seul.",
          scarica: "Télécharger en .epub" },
    es: { titolo: "Por qué aquí está la trama y no el manga.",
          testo: "One Piece es de Eiichirō Oda y de Shueisha: su texto no existe en ninguna fuente libre, y esta aplicación no lo contiene. Los resúmenes de abajo se han escrito para esta aplicación, arco por arco. Para leer los capítulos están los canales oficiales al final de la página: en MANGA Plus, de su propia editorial, los tres primeros y los tres últimos son gratis.",
          dove: "Dónde leerlo, legalmente",
          leggi: "Léelo como un libro", leggiNota: "137 páginas para pasar, con un marcador que se guarda solo.",
          scarica: "Descárgalo en .epub" },
    de: { titolo: "Warum hier die Handlung steht und nicht der Manga.",
          testo: "One Piece gehört Eiichirō Oda und Shueisha: sein Text existiert in keiner freien Quelle, und diese App enthält ihn nicht. Die Zusammenfassungen unten wurden für diese App geschrieben, Bogen für Bogen. Um die Kapitel zu lesen, stehen die offiziellen Kanäle am Seitenende: auf MANGA Plus, betrieben vom eigenen Verlag, sind die ersten drei und die neuesten drei kostenlos.",
          dove: "Wo man es legal liest",
          leggi: "Wie ein Buch lesen", leggiNota: "137 Seiten zum Blättern, mit einem Lesezeichen, das sich selbst speichert.",
          scarica: "Als .epub laden" }
  };

  function nascondiGuidaOnePiece() {
    $("#guida-op").hidden = true;
    document.body.classList.remove("is-locked");
  }

  function chiudiGuidaOnePiece() {
    if (requestCloseLayer("guida-op")) return;
    nascondiGuidaOnePiece();
  }

  /** L'invito in cima alla libreria, che è come si scopre che la guida c'è. */
  function renderInvitoOnePiece() {
    // Dentro #lib-sfoglia e non in #lib-miei o #lib-scaffali: quei due
    // vengono svuotati a ogni render e si porterebbero via l'invito.
    const box = $("#lib-sfoglia");
    if (!box || typeof OnePiece === "undefined") return;
    if ($(".op-invito")) return;
    box.prepend(h("div", { class: "op-invito" },
      h("div", { class: "op-invito-text" },
        h("strong", { text: "One Piece, dal volume 1 al 115" }),
        h("p", { text: "La storia arco per arco, in sei lingue, scritta qui dentro." })
      ),
      h("button", {
        type: "button", class: "btn accent", text: "Apri la guida",
        onClick: () => apriGuidaOnePiece(null)
      })
    ));
  }

  /* ============================================================ lettore == */

  /**
   * Il lettore.
   *
   * Legge davvero: il testo del libro arriva da Internet Archive e si sfoglia
   * qui dentro. Quello che conta, oltre a mostrarlo, è non far perdere il
   * segno a nessuno — quindi la posizione si salva da sola, ogni dieci
   * secondi e ogni volta che si esce dalla pagina, e finisce nella sezione
   * «Registrate dal lettore» senza che si debba annotare niente.
   */
  const lettore = {
    book: null,
    pagine: [],
    pagina: 1,
    corpo: 1.08,
    /** Quale scansione stiamo leggendo, per poter chiedere la prossima. */
    scansione: 0,
    /** Da quando si è su questa pagina: serve a contare il tempo vero. */
    dalle: 0,
    /** Secondi già contati e non ancora salvati. */
    daSalvare: 0,
    timer: null,
    token: 0
  };

  /** Ogni dieci secondi, come chiesto: né più spesso, né solo alla chiusura. */
  const SALVA_OGNI = 10000;

  const CORPO_MIN = 0.85;
  const CORPO_MAX = 1.7;

  async function openReader(book, scansione = 0) {
    const token = ++lettore.token;
    lettore.book = book;
    lettore.pagine = [];
    lettore.pagina = 1;
    lettore.scansione = scansione;

    $("#lettore-titolo").textContent = book.title;
    $("#lettore-autore").textContent = book.author || "autore sconosciuto";
    $("#lettore-foot").hidden = true;
    $("#lettore-fonte").textContent = "";
    clear($("#lettore-pagina"));
    $("#lettore-stato").textContent = "Cerco il testo…";

    subentraA("lettore", hideReader);
    $("#lettore").hidden = false;
    document.body.classList.add("is-locked");
    applicaCorpo();

    // Un libro può portarsi già dietro le proprie pagine: è il caso di One
    // Piece, che non si scarica da nessuna parte perché è scritto qui dentro.
    const esito = Array.isArray(book.pagine) && book.pagine.length
      ? { ok: true, pagine: book.pagine, caratteri: misuraPagine(book.pagine),
          fonte: book.fonte || "", url: "", lingua: "", quante: 0, provata: 0 }
      : await Lettore.apri(book, (messaggio) => {
          if (token === lettore.token) $("#lettore-stato").textContent = messaggio;
        }, scansione);
    if (token !== lettore.token) return;

    if (!esito.ok) {
      $("#lettore-cambio-box").hidden = true;
      const altrove = Lettore.altroveDoveLeggere(book);
      clear($("#lettore-pagina"));
      $("#lettore-stato").textContent = "";
      $("#lettore-pagina").append(emptyState(
        esito.reason === "senza-altre"
          ? "Ho finito le copie da provare."
          : esito.reason === "non-trovato"
          ? "Di questo libro non ho trovato il testo."
          : "Ho trovato il libro, ma non una trascrizione leggibile.",
        altrove
          ? "Su Project Gutenberg però c'è, e si apre in una scheda nuova: da qui la pagina non ha il permesso di prenderne il testo."
          : "Il testo completo si trova solo per le opere di dominio pubblico. Di questa esiste la scheda, non la scansione.",
        altrove ? "Apri dove si può leggere" : "",
        altrove ? () => window.open(altrove, "_blank", "noopener") : null
      ));
      return;
    }

    lettore.pagine = esito.pagine;
    // Si riprende da dove si era arrivati, se c'è un segno.
    const segno = Store.readingOf(book);
    lettore.pagina = segno && segno.page && segno.page <= esito.pagine.length ? segno.page : 1;

    $("#lettore-stato").textContent = "";
    $("#lettore-foot").hidden = false;
    $("#lettore-range").max = String(esito.pagine.length);

    clear($("#lettore-fonte"));
    if (esito.url) {
      const lingua = esito.lingua ? ` · ${Books.languageName(abbreviaLingua(esito.lingua))}` : "";
      $("#lettore-fonte").append(
        document.createTextNode("Scansione da "),
        h("a", { href: esito.url, target: "_blank", rel: "noopener noreferrer", text: esito.fonte }),
        document.createTextNode(`${lingua} · il testo è letto da una macchina, qualche parola può essere storta`)
      );
    } else if (esito.fonte) {
      $("#lettore-fonte").textContent = esito.fonte;
    }

    // Il cambio si offre solo se c'è davvero un'altra copia da provare.
    const altre = (esito.quante || 0) - (esito.provata || 0) - 1;
    $("#lettore-cambio-box").hidden = altre <= 0;
    if (altre > 0) {
      $("#lettore-cambio").textContent = `Questa copia si legge male: provane un'altra (${altre} ancora)`;
    }

    Store.openedReading(book, {
      page: lettore.pagina,
      pages: esito.pagine.length,
      chars: esito.caratteri,
      source: esito.fonte
    });
    renderRegistrate();

    mostraPagina();
    avviaSalvataggio();
  }

  /**
   * Se offrire «Leggi il libro».
   *
   * Il testo intero esiste per le opere di dominio pubblico. Quando il
   * catalogo se lo porta già dietro non c'è dubbio; altrimenti si guarda
   * l'anno, perché di un romanzo del 2019 la scansione non ci sarà, e
   * promettere una lettura che finisce in «non l'ho trovato» è peggio che non
   * prometterla.
   */
  function puoLeggersi(book) {
    if (book.readable || book.freeUrl) return true;
    return Boolean(book.year) && book.year < 1930;
  }

  /**
   * Apre One Piece nel lettore, come un libro.
   *
   * È la cosa più vicina a un ebook che di questo manga si possa fare
   * onestamente: non il fumetto, che è di Oda e della Shūeisha, ma la storia
   * raccontata — centotrentasette pagine che si sfogliano, con il segno che si
   * salva da solo e la lettura che finisce fra quelle registrate, esattamente
   * come per gli altri libri.
   */
  function leggiOnePieceComeLibro() {
    const lingua = Books.getLinguaTrame();
    const ebook = OnePiece.comeEbook(lingua);
    const nomeLingua = (OnePiece.LINGUE.find((l) => l.code === lingua) || {}).label || "";
    openReader({
      id: "onepiece:ebook:" + lingua,
      title: ebook.titolo,
      author: ebook.autore,
      cover: null,
      pagine: ebook.pagine,
      fonte: `Scritto per questa app · ${nomeLingua} · non è il manga`,
      freeUrl: "",
      blurb: ""
    });
  }

  /**
   * Scarica One Piece come file .epub.
   *
   * È il gradino più in là del leggerlo qui dentro: un .epub si apre su un
   * lettore di ebook, su un telefono, su un Kobo, e resta anche se questa
   * pagina domani non c'è più. Il file viene costruito sul momento nel
   * browser, senza passare da nessun server.
   *
   * Dove la pagina è ospitata dentro un'altra — la versione pubblicata come
   * artifact — lo scaricamento è bloccato dal contenitore, non dall'app: in
   * quel caso conviene dirlo invece di lasciare un bottone che non fa niente.
   */
  function scaricaOnePieceEpub(lingua) {
    const l = Books.getLinguaTrame();
    const libro = OnePiece.comeEbook(l);
    const nome = `One Piece - ${l}.epub`;
    try {
      const byte = Epub.costruisci({
        titolo: libro.titolo,
        autore: libro.autore,
        lingua: l,
        pagine: libro.pagine,
        nota: "La storia raccontata, scritta per l'app Leggi di più. Non è il manga, " +
          "che è di Eiichirō Oda e della Shūeisha."
      });
      const indirizzo = URL.createObjectURL(new Blob([byte], { type: "application/epub+zip" }));
      const a = h("a", { href: indirizzo, download: nome });
      document.body.append(a);
      a.click();
      a.remove();
      // L'indirizzo temporaneo si libera dopo, perché revocarlo subito
      // interromperebbe lo scaricamento appena cominciato.
      setTimeout(() => URL.revokeObjectURL(indirizzo), 60000);
      toast(`«${nome}» — ${formatNumber(libro.pagine.length)} pagine. Se non lo trovi, guarda fra i download.`);
    } catch (err) {
      toast("Questo browser non lascia scaricare file da qui. Apri l'app in locale e riprova.");
    }
  }

  /** Quanto testo c'è, sia che le pagine siano stringhe sia che siano composte. */
  const misuraPagine = (pagine) => pagine.reduce((n, p) =>
    n + (typeof p === "string" ? p.length
      : String(p.titolo || "").length + String(p.testo || "").length), 0);

  /** Internet Archive scrive «Italian», Open Library «ita»: qui serve «ita». */
  function abbreviaLingua(nome) {
    const n = String(nome || "").toLowerCase();
    if (n.startsWith("ita")) return "ita";
    if (n.startsWith("eng")) return "eng";
    if (n.startsWith("fre") || n.startsWith("fra")) return "fre";
    if (n.startsWith("spa")) return "spa";
    if (n.startsWith("ger") || n.startsWith("deu")) return "ger";
    if (n.startsWith("jpn") || n.startsWith("jap")) return "jpn";
    return n.slice(0, 3);
  }

  function mostraPagina() {
    const box = $("#lettore-pagina");
    clear(box);
    const pagina = lettore.pagine[lettore.pagina - 1];

    if (pagina && typeof pagina === "object") {
      // Una pagina scritta per l'app ha una struttura: titolo, righe di
      // servizio, corpo. Darle un peso tipografico è la differenza fra un
      // libro e un blocco di testo.
      box.classList.add("is-composta");
      if (pagina.titolo) box.append(h("h3", { class: "pagina-titolo", text: pagina.titolo }));
      for (const riga of pagina.righe || []) {
        box.append(h("p", { class: "pagina-riga", text: riga }));
      }
      for (const paragrafo of String(pagina.testo || "").split("\n\n")) {
        box.append(h("p", { class: "pagina-corpo", text: paragrafo }));
      }
      if (pagina.nota) box.append(h("p", { class: "pagina-nota", text: pagina.nota }));
    } else {
      // Un testo scaricato arriva come stringa: si mostra come arriva.
      box.classList.remove("is-composta");
      box.textContent = pagina || "";
    }
    box.scrollTop = 0;
    $("#lettore-conta").textContent =
      `pagina ${formatNumber(lettore.pagina)} di ${formatNumber(lettore.pagine.length)}`;
    $("#lettore-range").value = String(lettore.pagina);
    $("#lettore-prec").disabled = lettore.pagina <= 1;
    $("#lettore-succ").disabled = lettore.pagina >= lettore.pagine.length;
    // Il tempo si conta per pagina: cambiare pagina chiude il conto di quella
    // prima e apre quello della nuova.
    chiudiConto();
    lettore.dalle = Date.now();
  }

  function vaiA(numero) {
    const n = Math.max(1, Math.min(lettore.pagine.length, Math.round(numero)));
    if (n === lettore.pagina) return;
    lettore.pagina = n;
    mostraPagina();
    salvaSegno();
  }

  function applicaCorpo() {
    $("#lettore-pagina").style.setProperty("--lettura-corpo", lettore.corpo.toFixed(2) + "rem");
    try { localStorage.setItem("leggidipiu.corpo", String(lettore.corpo)); } catch (err) { /* va bene */ }
  }

  function cambiaCorpo(delta) {
    lettore.corpo = Math.min(CORPO_MAX, Math.max(CORPO_MIN, lettore.corpo + delta));
    applicaCorpo();
  }

  /** Il tempo passato sulla pagina appena lasciata entra nel conto. */
  function chiudiConto() {
    if (!lettore.dalle) return;
    const secondi = (Date.now() - lettore.dalle) / 1000;
    // Una pagina aperta per un'ora vuol dire che qualcuno è andato a cena: si
    // conta fino a cinque minuti, che è il massimo credibile per una pagina.
    lettore.daSalvare += Math.min(300, secondi);
    lettore.dalle = 0;
  }

  /**
   * Scrive dove siamo arrivati. È l'unico punto che tocca il deposito, e
   * viene chiamato dal timer, a ogni cambio pagina e quando si esce: se il
   * browser chiude la pagina fra due battiti, si perde al massimo il conto di
   * dieci secondi.
   */
  function salvaSegno() {
    if (!lettore.book || !lettore.pagine.length) return;
    chiudiConto();
    const secondi = lettore.daSalvare;
    lettore.daSalvare = 0;
    lettore.dalle = Date.now();
    Store.trackReading(lettore.book, {
      page: lettore.pagina,
      pages: lettore.pagine.length,
      seconds: secondi
    });
    renderRegistrate();
    festeggiaSeFinito();
  }

  /**
   * Arrivare all'ultima pagina è finire il libro: lo scaffale si aggiorna da
   * solo, una volta sola, senza chiedere niente.
   */
  function festeggiaSeFinito() {
    if (!lettore.book || !lettore.pagine.length) return;
    if (lettore.pagina < lettore.pagine.length) return;
    if (Store.shelfOf(lettore.book) === "letti") return;
    Store.setShelf(lettore.book, "letti");
    toast(`Hai finito «${lettore.book.title}». Spostato su «Letti».`);
  }

  function avviaSalvataggio() {
    fermaSalvataggio();
    lettore.dalle = Date.now();
    lettore.timer = setInterval(salvaSegno, SALVA_OGNI);
  }

  function fermaSalvataggio() {
    if (lettore.timer) clearInterval(lettore.timer);
    lettore.timer = null;
  }

  function hideReader() {
    salvaSegno();
    fermaSalvataggio();
    lettore.token++;
    lettore.dalle = 0;
    $("#lettore").hidden = true;
    document.body.classList.remove("is-locked");
    renderRegistrate();
    renderMyShelves();
  }

  function closeReader() {
    if (requestCloseLayer("lettore")) return;
    hideReader();
  }

  /* --------------------------------------- le letture registrate da sola */

  function renderRegistrate() {
    const box = $("#registrate-list");
    const sezione = $("#registrate");
    if (!box || !sezione) return;
    const righe = Store.sessions().slice().sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

    sezione.hidden = righe.length === 0;
    if (!righe.length) return;
    $("#registrate-count").textContent = plural(righe.length, "libro", "libri");

    clear(box);
    for (const riga of righe) {
      const percento = riga.pages ? Math.round((riga.furthest / riga.pages) * 100) : null;
      const minuti = Math.round((riga.seconds || 0) / 60);
      const dettagli = [
        riga.pages ? `pagina ${formatNumber(riga.furthest)} di ${formatNumber(riga.pages)}` : null,
        minuti >= 1 ? `${plural(minuti, "minuto", "minuti")} di lettura` : "meno di un minuto",
        riga.sessions > 1 ? `${riga.sessions} volte` : null
      ].filter(Boolean).join(" · ");

      box.append(h("article", { class: "registrata" },
        h("div", { class: "registrata-text" },
          h("strong", { text: riga.title }),
          h("span", { class: "muted small", text: riga.author || "autore sconosciuto" }),
          h("span", { class: "muted small", text: dettagli }),
          percento !== null
            ? h("span", { class: "bar" }, h("span", { class: "bar-fill", style: `width:${percento}%` }))
            : null
        ),
        h("button", {
          type: "button", class: "btn small", text: percento === 100 ? "Rileggi" : "Riprendi",
          onClick: () => openReader({
            id: riga.id, title: riga.title, author: riga.author,
            cover: riga.cover, freeUrl: "", blurb: ""
          })
        })
      ));
    }
  }

  /* ============================================= RACCONTA A UNA BAMBINA */

  const nina = { book: null, material: "", messages: [], busy: false };

  function openNina(book, dossier) {
    nina.book = book;
    nina.material = dossier && !dossier.empty ? Books.dossierText(dossier, { maxPlot: 2000 }) : "";
    nina.messages = [];
    nina.busy = false;

    $("#nina-libro").textContent = book.title;
    clear($("#nina-chat"));
    ninaBubble("nina", "Ciao! Che cosa hai letto? Raccontamelo tutto. Però parla facile, che io ho sei anni.");
    $("#nina-hint").textContent = nina.material
      ? "Nina conosce la storia, ma fa finta di no."
      : "Non ho trovato materiale su questo libro: Nina ti ascolta e basta.";
    $("#nina-input").value = "";

    // Il rinomino viene prima della chiusura: così il gestore di «close» del
    // dialogo non trova più un pannello «sheet» da chiudere a sua volta.
    const sheet = $("#book-sheet");
    if (sheet.open) {
      replaceLayer("nina", hideNina);
      sheet.close();
    } else {
      openLayer("nina", hideNina);
    }

    $("#nina").hidden = false;
    document.body.classList.add("is-locked");
    $("#nina-input").focus();
  }

  /**
   * Da una lettura del diario a Nina. Il libro qui è solo un titolo scritto a
   * mano: va prima ritrovato nel catalogo, se possibile, per dare a Nina la
   * storia vera. Intanto la conversazione è già aperta.
   */
  async function ninaFromEntry(entry) {
    const book = { title: entry.title, author: entry.author || "", subjects: [], cover: null, blurb: "" };
    openNina(book, null);
    $("#nina-hint").textContent = "Cerco la storia vera…";

    const found = await Books.search(`${entry.title} ${entry.author || ""}`.trim(), { limit: 4 });
    if (nina.book !== book) return;

    const wanted = Books.normalize(entry.title);
    const match = (found.books || []).find((b) => Books.normalize(b.title) === wanted) || (found.books || [])[0];
    if (!match) {
      $("#nina-hint").textContent = "Non ho trovato materiale su questo libro: Nina ti ascolta e basta.";
      return;
    }

    const dossier = await Books.research(match);
    if (nina.book !== book) return;
    nina.material = dossier.empty ? "" : Books.dossierText(dossier, { maxPlot: 2000 });
    $("#nina-hint").textContent = nina.material
      ? "Nina conosce la storia, ma fa finta di no."
      : "Non ho trovato materiale su questo libro: Nina ti ascolta e basta.";
  }

  function hideNina() {
    stopDictation();
    $("#nina").hidden = true;
    document.body.classList.remove("is-locked");
  }

  function closeNina() {
    if (requestCloseLayer("nina")) return;
    hideNina();
  }

  function ninaBubble(who, text, extra) {
    const bubble = h("div", { class: "bubble bubble-" + who },
      extra ? h("span", { class: "bubble-badge", text: extra }) : null,
      h("p", { text: text })
    );
    $("#nina-chat").append(bubble);
    bubble.scrollIntoView({ block: "end", behavior: "smooth" });
    return bubble;
  }

  function ninaTyping(on) {
    const existing = $("#nina-typing");
    if (existing) existing.remove();
    if (!on) return;
    const dots = h("div", { class: "bubble bubble-nina is-typing", id: "nina-typing" },
      h("p", { text: "Nina sta pensando…" }));
    $("#nina-chat").append(dots);
    dots.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  async function ninaSend(text) {
    const clean = String(text || "").trim();
    if (!clean || nina.busy) return;
    ninaBubble("me", clean);
    nina.messages.push({ role: "user", content: clean });
    $("#nina-input").value = "";
    await ninaAnswer(AI.childSystem(nina.material), "nina");
  }

  async function ninaCoach() {
    if (nina.busy) return;
    if (!nina.messages.some((m) => m.role === "user")) {
      toast("Prima raccontale qualcosa.");
      return;
    }
    const messages = nina.messages.concat([{ role: "user", content: AI.coachRequest }]);
    await ninaAnswer(AI.coachSystem(nina.material), "coach", messages);
  }

  /**
   * Un turno di conversazione. In «coach» il risultato non entra nella
   * cronologia: è un commento sul racconto, non una battuta del racconto.
   */
  async function ninaAnswer(system, kind, messagesOverride) {
    const messages = messagesOverride || nina.messages;

    if (!AI.hasKey()) {
      ninaManual(system, messages, kind);
      return;
    }

    nina.busy = true;
    $("#nina-send").disabled = true;
    ninaTyping(true);

    const result = await AI.ask(messages, { system, maxTokens: kind === "coach" ? 1200 : 700 });

    ninaTyping(false);
    nina.busy = false;
    $("#nina-send").disabled = false;

    if (!result.ok) {
      ninaManual(system, messages, kind, AI.explain(result));
      return;
    }
    receiveNina(result.text, kind);
  }

  function receiveNina(text, kind) {
    if (kind === "coach") {
      const { score, body } = AI.parseScore(text);
      ninaBubble("coach", body, score ? `Chiarezza ${score}/5` : null);
      return;
    }
    nina.messages.push({ role: "assistant", content: text });
    ninaBubble("nina", text);
  }

  /** Senza chiave: la conversazione continua passando dal copia e incolla. */
  function ninaManual(system, messages, kind, why) {
    const transcript = messages
      .map((m) => (m.role === "user" ? "IO: " : "NINA: ") + m.content)
      .join("\n\n");
    const prompt = `${system}\n\n---\n\nLa conversazione fino a qui:\n\n${transcript}\n\n---\n\nScrivi ora la tua risposta, e soltanto quella.`;

    openDialog(
      kind === "coach" ? "Come sto andando?" : "La risposta di Nina",
      `Su «${nina.book.title}».`
    );
    dialogManual(
      prompt,
      (why ? why + " " : "") + "Copia tutto questo in Claude e riporta qui la risposta.",
      (answer) => receiveNina(answer, kind)
    );
  }

  /* ---- dettatura: spiegare a voce è più naturale che scrivere ---- */

  let recognition = null;

  function stopDictation() {
    if (!recognition) return;
    try { recognition.stop(); } catch (err) { /* già ferma */ }
    recognition = null;
    $("#nina-mic").classList.remove("is-recording");
  }

  function setupDictation() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = $("#nina-mic");
    if (!Recognition) return; // il bottone resta nascosto dove non funziona
    mic.hidden = false;

    mic.addEventListener("click", () => {
      if (recognition) { stopDictation(); return; }
      recognition = new Recognition();
      recognition.lang = "it-IT";
      recognition.continuous = true;
      recognition.interimResults = false;
      const field = $("#nina-input");
      const before = field.value;

      recognition.addEventListener("result", (event) => {
        let said = "";
        for (let i = event.resultIndex; i < event.results.length; i++) said += event.results[i][0].transcript;
        field.value = (before ? before + " " : "") + said.trim();
      });
      recognition.addEventListener("error", () => {
        stopDictation();
        toast("Non riesco a sentirti. Controlla il permesso del microfono.");
      });
      recognition.addEventListener("end", () => stopDictation());

      try {
        recognition.start();
        mic.classList.add("is-recording");
        toast("Ti ascolto: parla pure.");
      } catch (err) {
        stopDictation();
      }
    });
  }

  /* --------------------------------------------------------- import/export */

  function doExport() {
    const payload = Store.exportCurrent();
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `leggi-di-piu-${payload.user.username}-${todayISO()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Dati esportati.");
  }

  function doImport(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let payload;
      try {
        payload = JSON.parse(String(reader.result));
      } catch (e) {
        toast("Il file non è un JSON valido.");
        return;
      }
      const res = Store.importIntoCurrent(payload);
      if (!res.ok) {
        toast(res.error);
        return;
      }
      renderAll();
      toast(res.added
        ? `Importate ${plural(res.added, "lettura", "letture")}${res.skipped ? ` (${res.skipped} già presenti)` : ""}.`
        : "Nessuna nuova lettura da importare.");
    };
    reader.onerror = () => toast("Non riesco a leggere il file.");
    reader.readAsText(file);
  }

  function deleteProfile() {
    const user = Store.current();
    if (!user) return;
    const ok = window.confirm(`Eliminare il profilo «${user.username}» e tutte le sue letture? L'operazione non si può annullare.`);
    if (!ok) return;
    Store.deleteCurrentUser();
    showLogin();
    toast("Profilo eliminato.");
  }

  /* --------------------------------------------------------------- avvio */

  function wire() {
    // Il corpo del testo scelto nel lettore resta scelto.
    try {
      const salvato = Number(localStorage.getItem("leggidipiu.corpo"));
      if (salvato >= CORPO_MIN && salvato <= CORPO_MAX) lettore.corpo = salvato;
    } catch (err) { /* navigazione privata: si parte dal valore di partenza */ }

    $("#form-login").addEventListener("submit", (e) => {
      e.preventDefault();
      doLogin($("#login-username").value);
    });
    $("#login-username").addEventListener("input", () => showError($("#login-error"), ""));

    $("#btn-logout").addEventListener("click", () => {
      Store.logout();
      showLogin();
    });

    for (const tab of $$(".tab")) {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    }

    $("#form-lettura").addEventListener("submit", onSubmitLettura);
    $("#btn-annulla").addEventListener("click", () => { resetForm(); toast("Modifica annullata."); });
    $("#f-da").addEventListener("input", syncPageCount);
    $("#f-a").addEventListener("input", syncPageCount);
    $("#btn-add-domanda").addEventListener("click", () => addCustomRow().focus());

    $("#diario-search").addEventListener("input", () => renderDiario(Store.entries()));
    $("#diario-book").addEventListener("change", () => renderDiario(Store.entries()));

    $("#btn-goal").addEventListener("click", () => {
      if (Store.setGoal($("#goal-input").value)) {
        renderAll();
        toast("Obiettivo aggiornato.");
      } else {
        toast("Scegli un numero di pagine tra 1 e 500.");
      }
    });

    $("#btn-ai-domande").addEventListener("click", aiSuggestQuestions);
    $("#ai-close").addEventListener("click", closeDialog);

    // ---- libreria
    $("#form-cerca").addEventListener("submit", (e) => {
      e.preventDefault();
      runSearch();
    });
    $("#btn-altri").addEventListener("click", loadMore);
    $("#btn-azzera").addEventListener("click", resetSearch);
    $("#f-lingua").addEventListener("change", (e) => {
      lib.language = e.target.value;
      if (lib.query) runSearch(); else renderSearchControls();
    });
    $("#f-ordine").addEventListener("change", (e) => {
      lib.sort = e.target.value;
      if (lib.query) runSearch(); else renderSearchControls();
    });
    // Svuotare il campo riporta agli scaffali, senza dover premere «Azzera».
    $("#f-cerca").addEventListener("input", (e) => {
      if (!e.target.value.trim() && lib.query) resetSearch();
    });
    $("#sheet-close").addEventListener("click", closeSheet);
    $("#btn-apri-lettore").addEventListener("click", () => currentBook && openReader(currentBook));
    $("#btn-leggi").addEventListener("click", () => currentBook && startReading(currentBook));

    /* ---- il lettore ---- */

    $("#guida-close").addEventListener("click", chiudiGuidaOnePiece);
    $("#lettore-close").addEventListener("click", closeReader);
    $("#lettore-prec").addEventListener("click", () => vaiA(lettore.pagina - 1));
    $("#lettore-succ").addEventListener("click", () => vaiA(lettore.pagina + 1));
    // Un'altra scansione della stessa opera: si riparte dalla successiva,
    // tenendo il segno, perché è lo stesso libro.
    $("#lettore-cambio").addEventListener("click", () => {
      if (!lettore.book) return;
      salvaSegno();
      openReader(lettore.book, lettore.scansione + 1);
    });
    $("#lettore-meno").addEventListener("click", () => cambiaCorpo(-0.09));
    $("#lettore-piu").addEventListener("click", () => cambiaCorpo(0.09));
    // Lo slider sfoglia mentre lo trascini, ma il segno si scrive quando lo
    // lasci: salvare a ogni pixel riempirebbe il deposito di posizioni finte.
    $("#lettore-range").addEventListener("input", (e) => {
      const n = Math.max(1, Math.min(lettore.pagine.length, Number(e.target.value) || 1));
      if (n === lettore.pagina) return;
      lettore.pagina = n;
      mostraPagina();
    });
    $("#lettore-range").addEventListener("change", salvaSegno);

    // Le frecce sfogliano, come in un lettore vero.
    $("#lettore-pagina").addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); vaiA(lettore.pagina + 1); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); vaiA(lettore.pagina - 1); }
    });

    /**
     * Uscire dalla pagina non deve costare il segno.
     *
     * «visibilitychange» scatta quando si passa a un'altra scheda o si mette
     * via il telefono; «pagehide» quando la pagina viene chiusa per davvero.
     * Sono i due momenti in cui il browser può non tornare più, e sono più
     * affidabili di «beforeunload», che su mobile spesso non arriva.
     */
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") salvaSegno();
      else if (!$("#lettore").hidden && lettore.pagine.length) lettore.dalle = Date.now();
    });
    window.addEventListener("pagehide", salvaSegno);
    $("#btn-nina").addEventListener("click", () => currentBook && openNina(currentBook, currentDossier));
    $("#btn-dubbio").addEventListener("click", () => currentBook && askDoubt(currentBook, currentDossier));

    // ---- racconta a Nina
    $("#nina-close").addEventListener("click", closeNina);
    $("#nina-coach").addEventListener("click", ninaCoach);
    $("#nina-form").addEventListener("submit", (e) => {
      e.preventDefault();
      ninaSend($("#nina-input").value);
    });
    // Invio manda, a capo con maiuscolo: come in una chat.
    $("#nina-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        ninaSend($("#nina-input").value);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#lettore").hidden) closeReader();
      else if (!$("#guida-op").hidden) chiudiGuidaOnePiece();
      else if (!$("#nina").hidden) closeNina();
    });

    // Esc chiude un <dialog> da solo: qui si riallinea la cronologia.
    $("#book-sheet").addEventListener("close", () => requestCloseLayer("sheet"));
    $("#ai-dialog").addEventListener("close", () => requestCloseLayer("dialog"));

    // «/» porta alla ricerca, come in ogni catalogo che si rispetti.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (!$("#screen-app").hidden && layers.length === 0) {
        e.preventDefault();
        switchView("libreria");
        $("#f-cerca").focus();
        $("#f-cerca").select();
      }
    });

    $("#btn-ai-key").addEventListener("click", () => {
      const value = $("#ai-key").value.trim();
      if (!value) { toast("Incolla prima la chiave."); return; }
      if (!AI.setKey(value)) { toast("Non riesco a salvare la chiave in questo browser."); return; }
      renderKeyState();
      toast("Chiave salvata. Ora Claude risponde dentro l'app.");
    });
    $("#btn-ai-key-remove").addEventListener("click", () => {
      if (!AI.hasKey()) { toast("Nessuna chiave da rimuovere."); return; }
      AI.setKey("");
      renderKeyState();
      toast("Chiave rimossa.");
    });

    $("#btn-export").addEventListener("click", doExport);
    $("#btn-import").addEventListener("click", () => $("#file-import").click());
    $("#file-import").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) doImport(file);
      e.target.value = "";
    });
    $("#btn-delete-user").addEventListener("click", deleteProfile);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (!location.protocol.startsWith("http")) return; // aperto da file:// — niente SW
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline è un extra, non un requisito */ });
  }

  function init() {
    buildQuestionFields();
    renderSearchControls();
    renderBrowseShelves();
    setupDictation();
    wire();
    if (Store.current()) enterApp();
    else showLogin();
    registerServiceWorker();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
