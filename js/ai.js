/**
 * Leggi di più — il compagno di lettura.
 *
 * Parla con l'API di Claude direttamente dal browser, con la chiave che l'utente
 * incolla nelle impostazioni. Niente SDK e niente build: l'app deve restare un
 * sito statico che si apre anche con un doppio clic, e l'SDK ufficiale
 * richiederebbe npm e un bundler.
 *
 * La chiave sta in una voce di localStorage tutta sua, separata dai diari: non
 * finisce mai dentro l'export delle letture.
 *
 * Ogni funzione che chiede qualcosa a Claude restituisce { ok: true, text } o
 * { ok: false, reason }. Chi chiama deve gestire il caso senza risposta: senza
 * chiave, o dove la rete verso l'API è bloccata, l'app ripiega sul prompt da
 * copiare e incollare in Claude.
 */
const AI = (() => {
  "use strict";

  const KEY_STORAGE = "leggidipiu.apikey";
  const ENDPOINT = "https://api.anthropic.com/v1/messages";
  const MODEL = "claude-opus-5";

  const SYSTEM = [
    "Sei il compagno di lettura dentro «Leggi di più», il diario di lettura di chi ti scrive.",
    "Rispondi in italiano e dai del tu. Frasi brevi e concrete: chi ti legge ha appena chiuso il libro e ha poco tempo.",
    "",
    "Regole:",
    "- Non anticipare mai niente che venga dopo le pagine indicate. Niente spoiler, nemmeno accennati o allusivi.",
    "- Entra nel merito del libro solo se lo conosci davvero. Se non lo conosci, o non sei sicuro, dillo in mezza riga e lavora su quello che ha scritto chi legge.",
    "- Niente markdown, niente titoli, niente elenchi puntati se non te li chiedono: il testo viene mostrato così com'è.",
    "- Niente complimenti di cortesia. Se una risposta è vaga, dillo e chiedi la cosa precisa che manca."
  ].join("\n");

  /* ------------------------------------------------------------- chiave API */

  function getKey() {
    try {
      return (localStorage.getItem(KEY_STORAGE) || "").trim();
    } catch (err) {
      return "";
    }
  }

  function setKey(value) {
    const clean = String(value || "").trim();
    try {
      if (clean) localStorage.setItem(KEY_STORAGE, clean);
      else localStorage.removeItem(KEY_STORAGE);
      return true;
    } catch (err) {
      return false;
    }
  }

  const hasKey = () => getKey().length > 0;

  /* ------------------------------------------------------------- richiesta */

  /**
   * Una domanda sola, senza cronologia: ogni funzione qui sotto è autonoma.
   * `effort: "low"` perché sono richieste corte e l'utente aspetta davanti allo
   * schermo.
   */
  async function ask(input, { maxTokens = 4000, system = SYSTEM, effort = "low" } = {}) {
    const key = getKey();
    if (!key) return { ok: false, reason: "no-key" };

    // Una stringa è la domanda secca; un array è una conversazione già avviata.
    const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;

    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          output_config: { effort },
          system,
          messages
        })
      });
    } catch (err) {
      // Rete assente, oppure una policy che blocca le chiamate verso l'esterno.
      return { ok: false, reason: "network", detail: String(err && err.message ? err.message : err) };
    }

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body && body.error && body.error.message ? body.error.message : "";
      } catch (err) { /* corpo non leggibile: resta il codice HTTP */ }
      const reason = response.status === 401 || response.status === 403 ? "auth"
        : response.status === 429 ? "rate-limit"
        : "http";
      return { ok: false, reason, status: response.status, detail };
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      return { ok: false, reason: "http", detail: "Risposta illeggibile." };
    }

    if (data.stop_reason === "refusal") return { ok: false, reason: "refusal" };

    const text = (data.content || [])
      .filter((block) => block && block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) return { ok: false, reason: "empty" };
    return { ok: true, text };
  }

  /** Messaggi in italiano per ogni modo in cui una richiesta può fallire. */
  function explain(result) {
    switch (result.reason) {
      case "no-key": return "Non hai ancora inserito una chiave API di Claude.";
      case "auth": return "La chiave API non è stata accettata. Controllala nel profilo.";
      case "rate-limit": return "Troppe richieste di fila. Riprova fra un minuto.";
      case "refusal": return "Claude ha preferito non rispondere a questa richiesta.";
      case "empty": return "Claude ha risposto senza testo. Riprova.";
      case "network": return "Non riesco a raggiungere l'API di Claude da questa pagina: può essere la rete, oppure una pagina che non ha il permesso di chiamare servizi esterni.";
      case "http": return `L'API ha risposto con un errore${result.status ? " " + result.status : ""}${result.detail ? ": " + result.detail : "."}`;
      default: return "Richiesta non riuscita.";
    }
  }

  /* -------------------------------------------------------------- prompt */

  function describeReading(entry) {
    const hasRange = entry.pageFrom !== null && entry.pageFrom !== undefined
      && entry.pageTo !== null && entry.pageTo !== undefined;
    return hasRange
      ? `dalla pagina ${entry.pageFrom} alla ${entry.pageTo}`
      : `${entry.pages} pagine`;
  }

  function bookLabel(title, author) {
    return author ? `«${title}» di ${author}` : `«${title}»`;
  }

  function formatQA(qa) {
    return qa
      .filter((item) => String(item.a || "").trim())
      .map((item) => `D: ${item.q}\nR: ${item.a.trim()}`)
      .join("\n\n");
  }

  /** Tre domande cucite su questo libro e su queste pagine. */
  function questionsPrompt({ title, author, entry, previous }) {
    const lines = [
      `Sto leggendo ${bookLabel(title, author)}. In questa sessione ho letto ${describeReading(entry)}.`
    ];
    if (previous && previous.length) {
      lines.push("", "Dai miei appunti sulle letture precedenti di questo libro:", previous.join("\n"));
    }
    lines.push(
      "",
      "Scrivimi 3 domande che mi aiutino a fissare quello che ho appena letto e a capirne il contesto.",
      "Devono essere specifiche per questo libro: non domande che andrebbero bene per qualsiasi lettura.",
      "Una domanda per riga, senza numerarle e senza aggiungere altro testo."
    );
    return lines.join("\n");
  }

  /** Un commento breve su quello che ha scritto chi legge. */
  function feedbackPrompt({ title, author, entry, qa }) {
    const answers = formatQA(qa);
    const lines = [
      `Sto leggendo ${bookLabel(title, author)}. Oggi ho letto ${describeReading(entry)}.`,
      "",
      answers ? "Ecco che cosa ho scritto nel diario:" : "Non ho scritto niente nel diario per questa lettura.",
      answers
    ].filter(Boolean);
    lines.push(
      "",
      "In non più di 120 parole: dimmi che cosa ho colto, che cosa nei miei appunti resta vago o impreciso,",
      "e chiudi con una domanda che mi faccia tornare sul testo.",
      "Se ho segnalato un dubbio, sciogliilo in una frase senza andare oltre le pagine che ho letto."
    );
    return lines.join("\n");
  }

  /** Il riassunto di dove eravamo rimasti, prima di riprendere il libro. */
  function recapPrompt({ title, author, sessions }) {
    const lines = [
      `Sto per riprendere ${bookLabel(title, author)}.`,
      "",
      "Questi sono i miei appunti sulle letture precedenti, dalla più vecchia alla più recente:",
      sessions.join("\n\n"),
      "",
      "In non più di 100 parole, e basandoti solo sui miei appunti, ricordami dove sono arrivato",
      "e che cosa mi conviene tenere d'occhio quando riprendo. Se i miei appunti non bastano a capirlo, dillo."
    ];
    return lines.join("\n");
  }

  /* ------------------------------------- spiegare a una bambina di sei anni */

  /**
   * Il sistema di Nina. Il punto pedagogico è tutto qui: Nina conosce il libro,
   * ma fa finta di no. Se chi racconta usa una parola difficile, lei chiede che
   * cosa vuol dire — e chi racconta è costretto a capirla davvero per spiegarla.
   * È il metodo di Feynman, travestito da bambina.
   */
  function childSystem(dossier) {
    const lines = [
      "Sei Nina, hai sei anni e stai ascoltando una persona più grande che ti racconta un libro che ha letto.",
      "",
      "Come parli:",
      "- Frasi corte e parole semplici, quelle che usa davvero una bambina di sei anni.",
      "- Al massimo 60 parole in tutto. Mai di più.",
      "- Curiosa e sincera. Se una cosa non l'hai capita, lo dici: «non ho capito perché…».",
      "- Niente markdown, niente elenchi. Al massimo una faccina, e solo se ci sta.",
      "",
      "Che cosa fai ogni volta:",
      "1. Ripeti con parole tue la cosa che hai capito, corta corta.",
      "2. Fai una o due domande vere, quelle che verrebbero a una bambina: «ma perché?», «e poi come fa a mangiare?», «era triste?».",
      "3. Se senti una parola difficile, chiedi che cosa vuol dire, senza vergogna.",
      "",
      "Regole importanti:",
      "- Non fare la maestra. Niente voti, niente «bravo», niente spiegazioni da grande.",
      "- Tu conosci già la storia perché te l'hanno letta, ma fai finta di no: vuoi che sia l'altra persona a raccontartela.",
      "- Se ti dice una cosa che non torna con la storia vera, non correggerla come farebbe un adulto: stupisciti. «Ah sì? Io pensavo che…», «sei sicuro?».",
      "- Non raccontare tu la storia e non dire come va a finire. Chi racconta sei non sei tu."
    ];
    if (dossier) {
      lines.push("", "Questa è la storia vera, per sapere se quello che ti raccontano torna. Non ripeterla e non citarla:", dossier);
    }
    return lines.join("\n");
  }

  /** Fuori personaggio: la valutazione di come è andato il racconto. */
  function coachSystem(dossier) {
    const lines = [
      "Valuti quanto bene una persona ha spiegato un libro a una bambina di sei anni.",
      "Chi spiega una cosa con parole semplici l'ha capita; chi si rifugia in parole difficili di solito no.",
      "",
      "Rispondi in italiano, dando del tu, in questo formato esatto:",
      "- prima riga: «Chiarezza: N/5», dove N è un numero da 1 a 5 e nient'altro su quella riga;",
      "- poi al massimo 130 parole di testo normale, senza markdown e senza elenchi.",
      "",
      "Nel testo dici tre cose, in quest'ordine: che cosa è arrivato chiaro; che cosa è rimasto confuso o troppo difficile per una bambina;",
      "quale parte del libro sembra non essere stata capita fino in fondo, se ce n'è una.",
      "Chiudi con una sola cosa concreta da fare al prossimo tentativo.",
      "Niente complimenti di cortesia: il voto serve solo se è onesto."
    ];
    if (dossier) {
      lines.push("", "Il libro di cui si parla, per confronto:", dossier);
    }
    return lines.join("\n");
  }

  const childOpening = (book) =>
    `Ciao Nina! Ti racconto «${book.title}»${book.author ? " di " + book.author : ""}.`;

  const coachRequest = "Fermiamoci un momento. Guardando tutto quello che ho raccontato qui sopra, come sono andato?";

  /** Estrae il voto dalla prima riga, se c'è. */
  function parseScore(text) {
    const match = String(text || "").match(/chiarezza:\s*([1-5])\s*\/\s*5/i);
    if (!match) return { score: null, body: String(text || "").trim() };
    return {
      score: Number(match[1]),
      body: String(text).replace(/^.*chiarezza:\s*[1-5]\s*\/\s*5.*$/im, "").trim()
    };
  }

  /* ------------------------------------------------ dubbi e trame mancanti */

  /** Una spiegazione costruita sul dossier raccolto in rete, non sui ricordi. */
  function doubtPrompt({ dossier, doubt }) {
    return [
      "Sto leggendo questo libro e c'è una cosa che non ho capito.",
      "",
      dossier,
      "",
      "La mia domanda è questa:",
      doubt.trim(),
      "",
      "Rispondi in non più di 150 parole, con parole semplici e concrete, basandoti sul materiale qui sopra.",
      "Se il materiale non basta a rispondere, dillo apertamente invece di inventare, e spiegami che cosa sappiamo di sicuro."
    ].join("\n");
  }

  /** Quando nessuna fonte in rete ha una trama da mostrare. */
  function plotPrompt(book) {
    return [
      `Raccontami di che cosa parla ${bookLabel(book.title, book.author)}${book.year ? `, uscito nel ${book.year}` : ""}.`,
      "",
      "Massimo 150 parole: la situazione di partenza, chi è il protagonista e qual è la spinta della storia.",
      "Non rivelare il finale e non anticipare i colpi di scena: serve a decidere se leggerlo.",
      "Se non conosci questo libro con sicurezza, dillo in una riga invece di inventare una trama."
    ].join("\n");
  }

  /** Da una risposta a righe libere alle domande vere e proprie. */
  function parseQuestions(text, limit = 3) {
    return String(text || "")
      .split("\n")
      .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
      .filter((line) => line.length > 3)
      .slice(0, limit);
  }

  return {
    MODEL,
    getKey,
    setKey,
    hasKey,
    ask,
    explain,
    parseQuestions,
    parseScore,
    formatQA,
    childSystem,
    coachSystem,
    childOpening,
    coachRequest,
    prompts: {
      questions: questionsPrompt,
      feedback: feedbackPrompt,
      recap: recapPrompt,
      doubt: doubtPrompt,
      plot: plotPrompt
    }
  };
})();
