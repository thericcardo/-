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
    // Chi non ha ancora letto niente parte dalla libreria; chi legge già,
    // dal form: è il gesto che ripete ogni giorno.
    switchView(Store.entries().length ? "nuova" : "libreria");
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
      const answered = Object.keys(answers).length + data.customQA.filter((qa) => qa.a).length;
      resetForm();
      renderAll();
      toast(answered
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
    const cards = [
      ["Pagine lette", String(stats.pages), plural(stats.sessions, "lettura", "letture")],
      ["Giorni di fila", String(stats.streak), stats.streak ? "continua così" : "si riparte oggi"],
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
    if (!box.open) box.showModal();
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

  function bookCard(book, { compact = false } = {}) {
    const shelf = Store.shelfOf(book);
    const shelfLabel = shelf ? (Store.SHELVES.find((s) => s.id === shelf) || {}).label : "";
    return h("article", { class: "book-card" + (compact ? " is-compact" : "") },
      h("button", {
        type: "button", class: "book-card-btn",
        onClick: () => openBookSheet(book),
        "aria-label": `Apri ${book.title}${book.author ? ", " + book.author : ""}`
      },
        h("span", { class: "book-card-cover" },
          coverNode(book, compact ? "sm" : "md"),
          shelf ? h("span", { class: "book-card-flag", text: shelfLabel }) : null
        ),
        h("span", { class: "book-card-text" },
          h("strong", { class: "book-card-title", text: book.title }),
          h("span", { class: "book-card-author", text: book.author || "autore sconosciuto" }),
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
      box.append(emptyState(
        "Nessun libro trovato.",
        result.online
          ? "Prova con il titolo esatto, con il solo cognome dell'autore, o cambia la modalità di ricerca."
          : "Da questa pagina non riesco a raggiungere il catalogo online: restano i libri che l'app porta con sé."
      ));
      return;
    }

    const shown = lib.books.length;
    $("#lib-stato").textContent = result.online
      ? `${formatNumber(lib.total)} ${lib.total === 1 ? "risultato" : "risultati"} per «${lib.query}» — ne vedi ${formatNumber(shown)}.`
      : `${plural(shown, "libro", "libri")} dal catalogo interno: il catalogo online non è raggiungibile da qui.`;

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
    if (result.total) head.append(h("span", { class: "shelf-count", text: formatNumber(result.total) }));
    for (const book of result.books) strip.append(bookCard(book, { compact: true }));
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
          h("div", { class: "shelf-row" }, books.map((book) => bookCard(book, { compact: true })))
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

    const sheet = $("#book-sheet");
    if (!sheet.open) sheet.showModal();
    sheet.scrollTop = 0;

    const dossier = await Books.research(book);
    if (currentBook !== book) return; // l'utente ha già aperto un altro libro
    currentDossier = dossier;
    renderSheetBody(dossier);
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

  /** La scheda catalografica: quello che rende un record un record. */
  function renderFacts(dossier) {
    const box = $("#sheet-facts");
    clear(box);
    const book = dossier.book;
    const editions = dossier.editions;

    const rows = [];
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

    closeSheet();
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

  function closeNina() {
    stopDictation();
    $("#nina").hidden = true;
    document.body.classList.remove("is-locked");
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
    $("#btn-leggi").addEventListener("click", () => currentBook && startReading(currentBook));
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
      if (e.key === "Escape" && !$("#nina").hidden) closeNina();
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
