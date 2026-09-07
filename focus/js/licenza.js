/**
 * Calzino — la licenza Pro.
 *
 * Due euro al mese per: calzini ×2, sessioni libere fino a sei ore invece di
 * due, e le decorazioni in più (tavolozze, accessori di Mora, fantasie dei
 * calzini). Tutto il resto — timer, casa, cassetto, statistiche, export —
 * resta gratis e non chiede niente a nessuno.
 *
 * ONESTÀ SUL LUCCHETTO. Questo è un sito statico: non c'è un server che possa
 * dire «questa persona ha pagato». Il controllo del codice avviene qui, nel
 * browser, con il sale scritto due righe più sotto: chi apre il sorgente può
 * fabbricarsi un codice in un minuto. È una porta chiusa, non una cassaforte —
 * tiene fuori la distrazione, non chi ci tiene a entrare.
 *
 * Per un lucchetto vero serve un server che verifichi l'abbonamento presso chi
 * incassa (Stripe e simili). Il punto da sostituire è uno solo: `verifica()`.
 * Diventa una `fetch` al tuo server, il resto del file non cambia.
 */
const Licenza = (() => {
  "use strict";

  const KEY = "calzino.licenza.v1";

  /** Cambiandolo, i codici già distribuiti smettono di funzionare. */
  const SALE = "mora-sferruzza-2026";

  const PREZZO = "2 € al mese";

  /** Quanto può durare una sessione libera: due ore, sei con l'abbonamento. */
  const ORE_LIBERA = 2;
  const ORE_LIBERA_PRO = 6;
  const GIORNI_ABBONAMENTO = 31;
  const GIORNI_PROVA = 7;

  /** Il link del pagamento (Stripe Payment Link, PayPal, quello che usi).
      Finché resta vuoto, l'app lo dice invece di fingere un bottone che funziona. */
  const PAGAMENTO_URL = "";

  let stato = carica();

  function vuoto() {
    return { codice: null, scadenza: null, provaUsata: false, attivataIl: null };
  }

  function carica() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return vuoto();
      const p = JSON.parse(raw);
      if (!p || typeof p !== "object") return vuoto();
      return {
        codice: typeof p.codice === "string" ? p.codice : null,
        scadenza: typeof p.scadenza === "string" ? p.scadenza : null,
        provaUsata: Boolean(p.provaUsata),
        attivataIl: typeof p.attivataIl === "string" ? p.attivataIl : null
      };
    } catch (err) {
      return vuoto();
    }
  }

  function salva() {
    try {
      localStorage.setItem(KEY, JSON.stringify(stato));
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ------------------------------------------------------------- il codice */

  /** FNV-1a: corta, senza dipendenze, uguale in tools/genera-codice.mjs. */
  function impronta(testo) {
    let h = 0x811c9dc5;
    for (let i = 0; i < testo.length; i++) {
      h ^= testo.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  const pulisci = (codice) => String(codice || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  /**
   * Un codice è `CALZ-AAAA-BBBB-CCCC`: otto caratteri di contenuto (i primi
   * cinque sono il giorno di scadenza in base 36) più quattro di controllo.
   */
  function leggi(codice) {
    const c = pulisci(codice);
    if (!c.startsWith("CALZ") || c.length !== 16) return null;
    const corpo = c.slice(4, 12);
    const controllo = c.slice(12);
    const atteso = impronta(corpo + SALE).toString(36).toUpperCase().padStart(7, "0").slice(-4);
    if (controllo !== atteso) return null;
    const giorno = parseInt(corpo.slice(0, 5), 36);
    if (!Number.isFinite(giorno)) return null;
    const scadenza = new Date(giorno * 86400000);
    // Un codice buono per dieci anni non è un codice: è un errore di stampa.
    if (scadenza.getFullYear() > new Date().getFullYear() + 5) return null;
    return { scadenza, formattato: `CALZ-${corpo.slice(0, 4)}-${corpo.slice(4)}-${controllo}` };
  }

  /**
   * QUI si innesta il controllo vero. Oggi guarda solo la forma del codice;
   * domani può diventare:
   *
   *   const r = await fetch("https://tuo-server/licenza", {...});
   *
   * La firma resta questa — una promessa che risolve {ok, scadenza} — quindi
   * l'interfaccia non si accorge del cambio.
   */
  async function verifica(codice) {
    const letto = leggi(codice);
    if (!letto) return { ok: false, error: "Codice non valido. Controlla di averlo copiato per intero." };
    if (letto.scadenza <= new Date()) return { ok: false, error: "Questo codice è scaduto." };
    return { ok: true, scadenza: letto.scadenza, codice: letto.formattato };
  }

  /* ------------------------------------------------------------- lo stato */

  function scadenza() {
    return stato.scadenza ? new Date(stato.scadenza) : null;
  }

  function attiva() {
    const s = scadenza();
    return Boolean(s && s > new Date());
  }

  const inProva = () => attiva() && !stato.codice;

  function giorniRimasti() {
    const s = scadenza();
    if (!s) return 0;
    return Math.max(0, Math.ceil((s - new Date()) / 86400000));
  }

  /** L'unica cosa che tocca i dati: quanti calzini vale una sessione finita. */
  const moltiplicatore = () => (attiva() ? 2 : 1);

  /** Il tetto della sessione libera, in millisecondi. */
  const limiteLibera = () => (attiva() ? ORE_LIBERA_PRO : ORE_LIBERA) * 3600000;

  const puoiProvare = () => !stato.provaUsata && !attiva();

  function avviaProva() {
    if (!puoiProvare()) return { ok: false, error: "La prova è già stata usata." };
    const fine = new Date(Date.now() + GIORNI_PROVA * 86400000);
    stato.scadenza = fine.toISOString();
    stato.provaUsata = true;
    stato.attivataIl = new Date().toISOString();
    stato.codice = null;
    salva();
    return { ok: true, scadenza: fine };
  }

  async function riscatta(codice) {
    const esito = await verifica(codice);
    if (!esito.ok) return esito;
    stato.codice = esito.codice;
    stato.scadenza = esito.scadenza.toISOString();
    stato.attivataIl = new Date().toISOString();
    salva();
    return { ok: true, scadenza: esito.scadenza };
  }

  /** Toglie la licenza da questo dispositivo: il codice resta valido altrove. */
  function rimuovi() {
    stato.codice = null;
    stato.scadenza = null;
    stato.attivataIl = null;
    salva();
  }

  return {
    PREZZO,
    PAGAMENTO_URL,
    ORE_LIBERA,
    ORE_LIBERA_PRO,
    limiteLibera,
    GIORNI_PROVA,
    GIORNI_ABBONAMENTO,
    attiva,
    inProva,
    scadenza,
    giorniRimasti,
    moltiplicatore,
    puoiProvare,
    avviaProva,
    riscatta,
    rimuovi,
    codice: () => stato.codice
  };
})();
