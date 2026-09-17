/**
 * Leggi di più — il lettore.
 *
 * Non basta sapere di che cosa parla un libro: questa parte serve a leggerlo.
 *
 * Il testo arriva da Internet Archive, che è l'unica delle fonti pubbliche a
 * rispondere con `access-control-allow-origin: *` anche sui file scaricati —
 * quindi l'unica da cui una pagina può prendere un libro intero e mostrarlo
 * dentro di sé. Project Gutenberg quell'intestazione non la manda: i suoi
 * testi si aprono, ma in una scheda del browser, non qui.
 *
 * La strada è in tre passi, perché il nome del file non si può indovinare:
 *
 *   1. si cerca l'opera fra i testi di Internet Archive (titolo e autore);
 *   2. si chiedono i metadati dell'opera, che elencano i file veri;
 *   3. si scarica il file di testo e si impagina.
 *
 * L'impaginazione taglia su una riga vuota o in fondo a una frase, mai a metà
 * parola: una pagina che finisce a metà di «Pinoc-» non si legge.
 */
const Lettore = (() => {
  "use strict";

  const ARCHIVE = "https://archive.org";
  /** Quanti caratteri per pagina: una pagina di libro sta fra 1500 e 2500. */
  const PER_PAGINA = 1900;
  const MAX_TESTO = 4 * 1024 * 1024;   // oltre, il telefono non regge
  /**
   * Sotto questa quota di caratteri leggibili la trascrizione è da buttare.
   * Misurata sul campo: le scansioni buone stanno fra 0,994 e 0,997, quindi
   * la soglia serve solo a fermare quelle davvero rovinate.
   */
  const SOGLIA_LEGGIBILE = 0.9;

  /** Solo testi, e solo quelli che non sono in prestito. */
  const LIBERE = "mediatype:(texts) AND NOT access-restricted-item:(true)";

  /* ========================================================== la rete === */

  const cache = new Map();

  async function prendi(url, { testo = false, timeout = 20000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const risposta = await fetch(url, { signal: controller.signal });
      if (!risposta.ok) return null;
      return testo ? await risposta.text() : await risposta.json();
    } catch (err) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ================================================== trovare il testo === */

  const pulisciPerRicerca = (s) => String(s || "")
    .replace(/["():\[\];,?!*+\-\/\\]/g, " ").replace(/\s+/g, " ").trim();

  /**
   * Il titolo principale, senza il sottotitolo.
   *
   * Un catalogo di scansioni non scheda i libri col titolo completo: quella
   * che qui si chiama «Frankenstein; or, the modern prometheus» là è
   * «Frankenstein». Cercare col titolo intero non trova niente.
   */
  const titoloBreve = (t) => {
    const principale = String(t || "").split(/[;:(\[]/)[0];
    const breve = pulisciPerRicerca(principale);
    return breve.split(" ").slice(0, 8).join(" ");
  };

  /**
   * Cerca l'opera fra i testi di Internet Archive.
   *
   * Si chiede prima col titolo e il cognome dell'autore, che è la domanda
   * precisa; se non risponde niente si riprova col solo titolo, perché su un
   * catalogo di scansioni il nome dell'autore è scritto in venti modi diversi.
   */
  async function trova(libro) {
    const titolo = titoloBreve(libro.title);
    if (!titolo) return [];
    const cognome = pulisciPerRicerca(libro.author).split(" ").pop() || "";

    // Dalla domanda più precisa alla più larga: titolo e autore, poi il solo
    // titolo, poi tutto a testo libero. Su un catalogo di scansioni conviene
    // insistere, perché la stessa opera è schedata in molti modi.
    //
    // A ogni domanda si aggiunge LIBERE, che tiene fuori le scansioni in
    // prestito. Senza quel pezzo le prime cinque risposte sono tutte in
    // prestito e il lettore torna a mani vuote pur avendo il libro a due
    // righe di distanza.
    const domande = [];
    if (cognome) {
      domande.push(`title:(${titolo}) AND creator:(${cognome}) AND ${LIBERE}`);
    }
    domande.push(`title:(${titolo}) AND ${LIBERE}`);
    if (cognome) domande.push(`(${titolo} ${cognome}) AND ${LIBERE}`);

    for (const q of domande) {
      const url = `${ARCHIVE}/advancedsearch.php?q=${encodeURIComponent(q)}` +
        "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=language" +
        "&fl%5B%5D=year&rows=20&page=1&output=json";
      const dati = await prendi(url);
      const trovati = (dati && dati.response && dati.response.docs) || [];
      if (trovati.length) return ordina(trovati, libro);
    }
    return [];
  }

/**
   * Quale scansione provare per prima.
   *
   * Prima la lingua: italiano, poi inglese. Poi la qualità del riconoscimento
   * del testo, che è la cosa che rende un libro leggibile o illeggibile: le
   * scansioni con l'identificativo che finisce per «goog» vengono dalla prima
   * campagna di digitalizzazione di Google e il loro OCR è pieno di buchi —
   * «cresci» diventa «■esci». A parità, quelle datate, che sono schedate
   * meglio.
   */
  function ordina(trovati, libro) {
    const lingua = (d) => {
      const l = [].concat(d.language || []).map((x) => String(x).toLowerCase()).join(" ");
      if (/ital/.test(l)) return 0;
      if (/eng/.test(l)) return 1;
      return 2;
    };
    const atteso = String(libro.title || "").toLowerCase().slice(0, 20);
    const punti = (d) => {
      let p = lingua(d) * 10;
      if (/goog$/i.test(d.identifier || "")) p += 4;
      if (!String(d.title || "").toLowerCase().startsWith(atteso)) p += 2;
      if (!d.year) p += 1;
      return p;
    };
    return trovati.slice().sort((a, b) => punti(a) - punti(b));
  }

  /**
   * Quanto è leggibile un testo riconosciuto da una macchina.
   *
   * Si contano i caratteri che in un libro ci stanno — lettere, spazi,
   * punteggiatura — contro quelli che ci finiscono solo per errore di
   * lettura: ■, |, ~, parentesi graffe. Sotto una certa soglia il libro non
   * si legge, e conviene provare la scansione dopo.
   */
  function qualita(testo) {
    // Si guarda in mezzo, non all'inizio: le prime pagine di una scansione
    // sono la copertina, il dorso e il timbro della biblioteca, e lì il
    // riconoscimento sbaglia sempre. Quello che conta è come si legge il
    // libro, non come si legge la copertina.
    const dentro = Math.floor(testo.length * 0.3);
    const campione = testo.slice(dentro, dentro + 40000);
    if (campione.length < 500) return testo.length > 2000 ? 1 : 0;
    const buoni = (campione.match(/[\p{L}\p{N}\s.,;:!?'’"«»()\-—]/gu) || []).length;
    return buoni / campione.length;
  }

  /**
   * Qual è il file da scaricare. Il nome non segue una regola — di un'opera
   * chiamata «pinocchio_202309» il testo sta in «Pinocchio_djvu.txt» — quindi
   * va chiesto ai metadati. Fra i file si preferisce la trascrizione completa.
   */
  async function fileDiTesto(identifier) {
    const meta = await prendi(`${ARCHIVE}/metadata/${encodeURIComponent(identifier)}`);
    if (!meta) return null;
    // Una parte delle scansioni di Internet Archive è in prestito: i metadati
    // dichiarano il file di testo, ma scaricarlo dà una risposta vuota. Il
    // vincolo è scritto nella scheda, e va rispettato — quelle non sono opere
    // che si possono leggere liberamente.
    if (String((meta.metadata || {})["access-restricted-item"]) === "true") return null;
    const file = meta.files || [];
    const testi = file.filter((f) => /\.txt$/i.test(f.name || ""));
    if (!testi.length) return null;
    const punteggio = (f) => {
      let p = 0;
      if (/_djvu\.txt$/i.test(f.name)) p += 10;      // la trascrizione intera
      if (/_chocr|_hocr|_abbyy|meta|log/i.test(f.name)) p -= 20;
      p += Math.min(5, Math.round((Number(f.size) || 0) / 200000));
      return p;
    };
    testi.sort((a, b) => punteggio(b) - punteggio(a));
    const scelto = testi[0];
    if (Number(scelto.size) > MAX_TESTO) return null;
    return {
      nome: scelto.name,
      url: `${ARCHIVE}/download/${encodeURIComponent(identifier)}/${encodeURIComponent(scelto.name)}`,
      byte: Number(scelto.size) || 0,
      lingua: (meta.metadata && meta.metadata.language) || ""
    };
  }

  /* ================================================ pulire e impaginare == */

  /**
   * Il testo delle scansioni porta i segni della macchina: numeri di pagina
   * su una riga da soli, righe spezzate a metà frase, decine di righe vuote
   * di fila. Niente di tutto questo si legge, e togliere solo questo non
   * cambia una parola del libro.
   */
  function pulisci(grezzo) {
    let t = String(grezzo || "").replace(/\r\n?/g, "\n");
    t = t.replace(/[ \t]+/g, " ");
    // Numeri di pagina o segnature isolati su una riga.
    t = t.replace(/^\s*[\divxlcIVXLC]{1,7}\s*$/gm, "");
    // Una parola spezzata dal trattino a fine riga si ricompone: «dis-» più
    // «covering» è «discovering», e a volte fra i due c'è anche uno spazio.
    t = t.replace(/(\p{Ll})-[ \t]*\n[ \t]*(\p{Ll})/gu, "$1$2");
    t = t.replace(/\n{3,}/g, "\n\n");
    // L'a capo di una riga stampata non è un a capo del testo: è dove
    // finiva la carta. Tenerlo vuol dire spezzare le frasi a metà su uno
    // schermo più stretto della pagina. Restano gli a capo doppi, che sono
    // i paragrafi veri.
    t = t.replace(/([^\n])\n(?!\n)/g, "$1 ");
    t = t.replace(/[ \t]{2,}/g, " ");
    return riavvolgi(togliLaCopertina(t.trim()));
  }

  /**
   * Ricuce le righe in paragrafi.
   *
   * Molte trascrizioni tengono ogni riga della pagina stampata come se fosse
   * un paragrafo, separata da una riga vuota. Il risultato si legge come un
   * elenco della spesa: «Did I request thee, Maker, from my clay», riga
   * vuota, «To mould me man?». Qui si rimettono insieme, andando a capo solo
   * dopo la fine di una frase.
   *
   * Si interviene solo quando è evidente che quelli non sono paragrafi: se
   * quasi tutti sono più corti di una riga di stampa, sono righe. Un libro
   * trascritto bene si lascia come sta.
   */
  function riavvolgi(testo) {
    const pezzi = testo.split(/\n{2,}/).map((x) => x.replace(/\n/g, " ").trim()).filter(Boolean);
    if (pezzi.length < 12) return testo;
    const corti = pezzi.filter((x) => x.length < 90).length;
    if (corti / pezzi.length < 0.65) return testo;

    const paragrafi = [];
    let corrente = "";
    for (const pezzo of pezzi) {
      corrente = corrente ? corrente + " " + pezzo : pezzo;
      // A capo dopo un punto, ma solo quando il paragrafo ha già una misura
      // da paragrafo: altrimenti ogni frase diventerebbe un capoverso.
      if (/[.!?…»"'"]$/.test(pezzo) && corrente.length >= 220) {
        paragrafi.push(corrente);
        corrente = "";
      }
    }
    if (corrente) paragrafi.push(corrente);
    return paragrafi.join("\n\n");
  }

  /**
   * Butta via le prime righe di ciarpame.
   *
   * Una scansione comincia con la copertina, il dorso letto di traverso e il
   * timbro della biblioteca: righe come «| KUBERT W. WOOURUFE|», «=)», «fo».
   * Si scartano le righe in cui le lettere sono meno della metà, finché non
   * ne arriva una che sembra una frase — e si guarda solo all'inizio, perché
   * più avanti quelle righe strane sono parte del libro.
   */
  function togliLaCopertina(testo) {
    const righe = testo.split("\n");
    const limite = Math.min(80, righe.length);
    let da = 0;
    for (let i = 0; i < limite; i++) {
      const riga = righe[i].trim();
      if (!riga) { continue; }
      const lettere = (riga.match(/\p{L}/gu) || []).length;
      // Una frase vera: abbastanza lunga e fatta soprattutto di lettere.
      if (riga.length >= 25 && lettere / riga.length > 0.7) { da = i; break; }
      da = i + 1;
    }
    return da > 0 ? righe.slice(da).join("\n").trim() : testo;
  }

  /**
   * Divide in pagine. Si cerca il taglio migliore entro la pagina: una riga
   * vuota, poi la fine di una frase, poi almeno uno spazio — mai in mezzo a
   * una parola.
   */
  function impagina(testo) {
    const pagine = [];
    let i = 0;
    while (i < testo.length) {
      let fine = Math.min(testo.length, i + PER_PAGINA);
      if (fine < testo.length) {
        const pezzo = testo.slice(i, fine);
        const minimo = Math.floor(PER_PAGINA * 0.55);
        const doppioACapo = pezzo.lastIndexOf("\n\n");
        const frase = Math.max(pezzo.lastIndexOf(". "), pezzo.lastIndexOf(".\n"),
          pezzo.lastIndexOf("! "), pezzo.lastIndexOf("? "), pezzo.lastIndexOf("» "));
        const spazio = pezzo.lastIndexOf(" ");
        if (doppioACapo > minimo) fine = i + doppioACapo;
        else if (frase > minimo) fine = i + frase + 1;
        else if (spazio > minimo) fine = i + spazio;
      }
      const pagina = testo.slice(i, fine).trim();
      if (pagina) pagine.push(pagina);
      i = fine;
    }
    return pagine.length ? pagine : [testo];
  }

  /* ==================================================== l'ingresso ====== */

  /**
   * Apre un libro: lo cerca, scarica il testo e lo restituisce impaginato.
   *
   * `avviso` viene chiamata a ogni passo, perché fra la ricerca e il
   * download possono passare parecchi secondi e una pagina ferma sembra rotta.
   */
  /**
   * Apre un libro.
   *
   * `salta` serve al cambio scansione: la stessa opera su Internet Archive
   * esiste in molte copie, e quale si legga meglio non si può sapere prima di
   * averla aperta — nessuna misura automatica le distingue in modo
   * affidabile, provate. Quindi la scelta resta a chi legge, e passare alla
   * successiva costa un tocco.
   */
  async function apri(libro, avviso = () => {}, salta = 0) {
    const chiave = (libro.id || libro.title) + "#" + salta;
    if (cache.has(chiave)) return cache.get(chiave);

    // Quando il catalogo si porta già dietro il codice dell'opera su Internet
    // Archive, la ricerca si salta: è la strada più corta e più precisa.
    const diretto = /^https:\/\/archive\.org\/details\/(.+)$/.exec(libro.freeUrl || "");
    let candidati = [];
    if (diretto) {
      candidati = [{ identifier: decodeURIComponent(diretto[1]) }];
    } else {
      avviso("Cerco il testo…");
      candidati = await trova(libro);
    }
    if (!candidati.length) {
      return { ok: false, reason: "non-trovato" };
    }

    avviso("Scarico il libro…");
    // Si provano le scansioni in ordine di preferenza. Molte voci di Internet
    // Archive sono in prestito e il loro file di testo scarica vuoto: quelle
    // si saltano. Se nessuna passa il controllo di leggibilità si tiene la
    // migliore fra quelle scaricate, perché un testo imperfetto è comunque
    // meglio di nessun testo.
    let ripiego = null;
    const daProvare = candidati.slice(salta, salta + 5);
    if (!daProvare.length) return { ok: false, reason: "senza-altre" };
    for (const c of daProvare) {
      const file = await fileDiTesto(c.identifier);
      if (!file) continue;
      const grezzo = await prendi(file.url, { testo: true, timeout: 40000 });
      if (!grezzo || grezzo.length < 2000) continue;

      const testo = pulisci(grezzo);
      const buono = qualita(testo);
      if (buono < SOGLIA_LEGGIBILE) {
        if (!ripiego || buono > ripiego.qualita) ripiego = { c, testo, qualita: buono, file };
        continue;
      }
      const pagine = impagina(testo);
      const esito = {
        ok: true,
        pagine,
        caratteri: testo.length,
        fonte: "Internet Archive",
        titolo: c.title || libro.title,
        identifier: c.identifier,
        url: `${ARCHIVE}/details/${c.identifier}`,
        lingua: file.lingua,
        qualita: buono,
        provata: salta + daProvare.indexOf(c),
        quante: candidati.length
      };
      cache.set(chiave, esito);
      return esito;
    }

    if (ripiego) {
      const esito = {
        ok: true,
        pagine: impagina(ripiego.testo),
        caratteri: ripiego.testo.length,
        fonte: "Internet Archive",
        titolo: ripiego.c.title || libro.title,
        identifier: ripiego.c.identifier,
        url: `${ARCHIVE}/details/${ripiego.c.identifier}`,
        lingua: ripiego.file.lingua,
        qualita: ripiego.qualita,
        provata: salta + daProvare.indexOf(ripiego.c),
        quante: candidati.length
      };
      cache.set(chiave, esito);
      return esito;
    }
    return { ok: false, reason: "senza-testo" };
  }

  /** Se del libro non c'è il testo, resta almeno un posto dove aprirlo. */
  function altroveDoveLeggere(libro) {
    if (libro.freeUrl) return libro.freeUrl;
    return "";
  }

  return { apri, trova, impagina, pulisci, qualita, titoloBreve, altroveDoveLeggere, PER_PAGINA };
})();
