/**
 * Leggi di più — interfaccia.
 *
 * Tre schermate: accesso (solo username), form nuova lettura, diario e profilo.
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
    switchView("nuova");
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

  function dialogAnswer(text) {
    clear($("#ai-body"));
    $("#ai-body").append(h("p", { class: "ai-answer", text: text }));
    clear($("#ai-actions"));
    $("#ai-actions").append(h("button", { type: "button", class: "btn", onClick: closeDialog, text: "Chiudi" }));
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
  async function askClaude({ title, note, prompt, onText, onPaste }) {
    openDialog(title, note);
    if (!AI.hasKey()) {
      dialogManual(prompt, "Non hai una chiave API di Claude: copia la domanda qui sotto e incollala in Claude.", onPaste);
      return;
    }
    dialogLoading("Sto chiedendo a Claude…");
    const result = await AI.ask(prompt);
    if (result.ok) {
      if (onText) onText(result.text);
      else dialogAnswer(result.text);
      return;
    }
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
    wire();
    if (Store.current()) enterApp();
    else showLogin();
    registerServiceWorker();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
