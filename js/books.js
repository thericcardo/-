/**
 * Leggi di più — il catalogo mondiale.
 *
 * Parla con tre fonti pubbliche, tutte interrogabili da un browser senza chiavi
 * perché rispondono con `access-control-allow-origin: *`:
 *
 *   Open Library   ~40 milioni di opere: ricerca, scaffali per argomento,
 *                  autori, edizioni, copertine
 *   Wikipedia (it) la trama vera, dalla sezione «Trama» della voce
 *   Google Books   la descrizione dell'editore, come ripiego
 *
 * Tre accortezze che fanno la differenza fra una demo e un catalogo usabile:
 *
 *   - **cache**: ogni risposta resta in memoria e in sessionStorage, così
 *     tornare indietro è istantaneo e non si ripete la stessa domanda;
 *   - **ritentativi**: Open Library limita le richieste, e un 429 o una
 *     connessione chiusa non devono diventare una schermata vuota;
 *   - **catalogo di scorta**: dove la rete non c'è — o dove la pagina non ha il
 *     permesso di uscire — la ricerca continua a funzionare sui titoli che
 *     viaggiano dentro il file.
 */
const Books = (() => {
  "use strict";

  const OPEN_LIBRARY = "https://openlibrary.org";
  const COVERS = "https://covers.openlibrary.org/b/id";
  const GOOGLE_BOOKS = "https://www.googleapis.com/books/v1/volumes";
  const WIKIPEDIA = "https://it.wikipedia.org/w/api.php";

  const PAGE_SIZE = 24;
  const CACHE_TTL = 30 * 60 * 1000;
  const CACHE_PREFIX = "leggidipiu.cache.v2:";

  /** null finché non si sa; poi true/false, per spiegare all'utente che succede. */
  let reachable = null;

  /* =========================================================== la rete === */

  const memory = new Map();
  const inFlight = new Map();

  function cacheRead(key) {
    const hit = memory.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
    try {
      const raw = sessionStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.at >= CACHE_TTL) return null;
      memory.set(key, parsed);
      return parsed.data;
    } catch (err) {
      return null;
    }
  }

  function cacheWrite(key, data) {
    const entry = { at: Date.now(), data };
    memory.set(key, entry);
    try {
      sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch (err) {
      // Spazio finito o storage negato: la cache in memoria basta.
    }
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Una GET con cache, deduplica delle richieste identiche in volo, timeout e
   * ritentativi su tutto quello che vale la pena ritentare (429, 5xx, rete).
   */
  async function getJSON(url, { timeout = 10000, retries = 2, cache = true } = {}) {
    if (cache) {
      const hit = cacheRead(url);
      if (hit) return { ok: true, data: hit, cached: true };
      const pending = inFlight.get(url);
      if (pending) return pending;
    }

    const attempt = (async () => {
      // Ritentare ha senso quando la rete fa i capricci. Quando invece si è
      // già capito che da questa pagina non si esce — è il caso della
      // versione pubblicata come artifact — riprovare due volte con le attese
      // in mezzo vuol dire solo far aspettare due secondi in più prima di
      // mostrare il catalogo interno, che è lì pronto. Un tentativo basta: se
      // va a buon fine la rete è tornata, e i ritentativi con lei.
      const quanti = reachable === false ? 0 : retries;
      for (let tryNumber = 0; ; tryNumber++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const response = await fetch(url, { signal: controller.signal });
          reachable = true;
          if (response.ok) {
            const data = await response.json();
            if (cache) cacheWrite(url, data);
            return { ok: true, data };
          }
          const worthRetrying = response.status === 429 || response.status >= 500;
          if (!worthRetrying || tryNumber >= quanti) {
            return { ok: false, reason: response.status === 429 ? "rate-limit" : "http", status: response.status };
          }
        } catch (err) {
          if (reachable !== true) reachable = false;
          if (tryNumber >= quanti) {
            return { ok: false, reason: err && err.name === "AbortError" ? "timeout" : "network" };
          }
        } finally {
          clearTimeout(timer);
        }
        await sleep(600 * Math.pow(2, tryNumber)); // 600ms, poi 1,2s
      }
    })().finally(() => inFlight.delete(url));

    if (cache) inFlight.set(url, attempt);
    return attempt;
  }

  const isReachable = () => reachable;

  /* ====================================================== normalizzazione = */

  const normalize = (s) => String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  /* ======================================= il catalogo che sta nel file === */

  /**
   * Le presentazioni scritte a mano per i titoli più noti. Il catalogo scaricato
   * porta titolo, autore e anno, ma non una riga che faccia venire voglia di
   * aprire il libro: queste la aggiungono dove conta.
   */
  const PRESENTAZIONI = {
    "il barone rampante": "Un ragazzo di dodici anni sale su un albero dopo un litigio a tavola e decide di non scendere mai più. Da lassù si costruisce una vita intera.",
    "il visconte dimezzato": "Una palla di cannone taglia in due un visconte. Le due metà tornano a casa separate: una cattivissima, l'altra buonissima.",
    "il cavaliere inesistente": "Un'armatura bianca combatte per Carlo Magno con zelo impeccabile. Dentro non c'è nessuno.",
    "le citta invisibili": "Marco Polo descrive a Kublai Khan decine di città impossibili. Ogni città è un modo diverso di guardare la vita.",
    "marcovaldo": "Venti racconti su un manovale di città che continua a cercare la natura fra cemento, semafori e supermercati.",
    "se una notte d inverno un viaggiatore": "Cominci a leggere un romanzo e si interrompe. Ne cerchi la continuazione e ne trovi un altro. E poi un altro ancora.",
    "il piccolo principe": "Un aviatore precipita nel deserto e incontra un bambino arrivato da un piccolo pianeta, che gli fa domande a cui i grandi non sanno rispondere.",
    "pinocchio": "Un burattino di legno vuole diventare un bambino vero, ma ogni volta che può scegliere sceglie la strada sbagliata.",
    "le avventure di pinocchio": "Un burattino di legno vuole diventare un bambino vero, ma ogni volta che può scegliere sceglie la strada sbagliata.",
    "cuore": "Il diario di un anno di scuola nella Torino dell'Ottocento, fra compagni, maestri e racconti mensili.",
    "i promessi sposi": "Due giovani vogliono sposarsi, un signorotto locale lo impedisce. Attorno a loro, la Lombardia del Seicento fra carestia, guerra e peste.",
    "la divina commedia": "Un uomo smarrito attraversa Inferno, Purgatorio e Paradiso per ritrovare la strada. Il viaggio più influente della letteratura europea.",
    "il fu mattia pascal": "Un uomo scopre di essere stato dichiarato morto e coglie l'occasione per rifarsi una vita da capo. Non è semplice come sembra.",
    "se questo e un uomo": "La testimonianza lucida di un anno ad Auschwitz, scritta da un chimico che voleva soprattutto capire e far capire.",
    "il gattopardo": "Un principe siciliano guarda il proprio mondo finire mentre l'Italia si unisce, e decide che cambiare tutto serve a non cambiare niente.",
    "il giorno della civetta": "Un capitano dei carabinieri indaga su un omicidio in un paese siciliano dove nessuno ha visto niente.",
    "la coscienza di zeno": "Un uomo scrive la propria autobiografia per il medico che lo cura, e mentre la scrive si giustifica, si contraddice, forse mente.",
    "novecento": "Un pianista nato su una nave non scende mai a terra in tutta la vita. Un monologo breve sul coraggio e sui limiti che scegliamo.",
    "l amica geniale": "Due bambine crescono in un rione povero di Napoli negli anni Cinquanta, legate da un'amicizia che le spinge e le ferisce per tutta la vita.",
    "io non ho paura": "In un'estate rovente del Sud, un bambino di nove anni scopre un segreto che riguarda gli adulti del suo paese.",
    "il nome della rosa": "In un'abbazia medievale i monaci muoiono uno dopo l'altro. Un frate inglese indaga usando la logica.",
    "il deserto dei tartari": "Un giovane ufficiale è assegnato a una fortezza ai confini del regno, ad aspettare un nemico che forse non arriverà mai.",
    "le avventure di tom sawyer": "Un ragazzo del Mississippi salta la scuola, cerca tesori e finisce testimone di un delitto.",
    "l isola del tesoro": "Un ragazzo trova una mappa in un baule e parte per un'isola, su una nave dove metà equipaggio ha altri piani.",
    "treasure island": "Un ragazzo trova una mappa in un baule e parte per un'isola, su una nave dove metà equipaggio ha altri piani.",
    "il giro del mondo in ottanta giorni": "Un gentiluomo inglese scommette metà del suo patrimonio che riuscirà a fare il giro del mondo in ottanta giorni esatti.",
    "ventimila leghe sotto i mari": "Tre naufraghi vengono raccolti da un sottomarino comandato da un capitano che ha voltato le spalle al mondo.",
    "alice nel paese delle meraviglie": "Una bambina insegue un coniglio con l'orologio e finisce in un mondo dove la logica funziona al contrario.",
    "alice s adventures in wonderland": "Una bambina insegue un coniglio con l'orologio e finisce in un mondo dove la logica funziona al contrario.",
    "il meraviglioso mago di oz": "Un ciclone porta Dorothy in un paese lontano. Per tornare a casa deve seguire una strada di mattoni gialli.",
    "il libro della giungla": "Un bambino cresciuto dai lupi impara le leggi della giungla da una pantera, un orso e un pitone.",
    "robinson crusoe": "Un naufrago resta solo su un'isola per ventotto anni e ricostruisce da zero tutto quello che sapeva fare.",
    "zanna bianca": "Un lupo nato nel Grande Nord passa di padrone in padrone e impara che cosa cambia fra chi lo picchia e chi lo rispetta.",
    "white fang": "Un lupo nato nel Grande Nord passa di padrone in padrone e impara che cosa cambia fra chi lo picchia e chi lo rispetta.",
    "il richiamo della foresta": "Un cane da salotto viene rapito e venduto come cane da slitta in Alaska, dove ritrova istinti che non sapeva di avere.",
    "the call of the wild": "Un cane da salotto viene rapito e venduto come cane da slitta in Alaska, dove ritrova istinti che non sapeva di avere.",
    "frankenstein": "Uno scienziato costruisce una creatura vivente e poi scappa dalla sua stessa creazione. La creatura lo cerca per chiedergli conto.",
    "orgoglio e pregiudizio": "Cinque sorelle, poca dote e una madre decisa a maritarle. Elizabeth Bennet detesta il signor Darcy, almeno all'inizio.",
    "pride and prejudice": "Cinque sorelle, poca dote e una madre decisa a maritarle. Elizabeth Bennet detesta il signor Darcy, almeno all'inizio.",
    "delitto e castigo": "Uno studente povero uccide una vecchia usuraia convinto di averne il diritto, e poi deve convivere con quello che ha fatto.",
    "anna karenina": "Una donna dell'aristocrazia russa lascia marito e posizione per amore, e scopre il prezzo che la società le presenta.",
    "il vecchio e il mare": "Un pescatore vecchio e senza fortuna aggancia il pesce più grande della sua vita, lontano da riva e da solo.",
    "the old man and the sea": "Un pescatore vecchio e senza fortuna aggancia il pesce più grande della sua vita, lontano da riva e da solo.",
    "1984": "In uno Stato che sorveglia tutto e riscrive il passato ogni giorno, un impiegato comincia a tenere un diario.",
    "nineteen eighty four": "In uno Stato che sorveglia tutto e riscrive il passato ogni giorno, un impiegato comincia a tenere un diario.",
    "la fattoria degli animali": "Gli animali cacciano il contadino e si governano da soli. Poi qualcuno comincia a essere più uguale degli altri.",
    "animal farm": "Gli animali cacciano il contadino e si governano da soli. Poi qualcuno comincia a essere più uguale degli altri.",
    "il signore delle mosche": "Un gruppo di ragazzi naufraga su un'isola senza adulti e prova a darsi delle regole.",
    "lord of the flies": "Un gruppo di ragazzi naufraga su un'isola senza adulti e prova a darsi delle regole.",
    "il giovane holden": "Tre giorni a New York di un ragazzo appena cacciato da scuola, che trova falso quasi tutto il mondo dei grandi.",
    "the catcher in the rye": "Tre giorni a New York di un ragazzo appena cacciato da scuola, che trova falso quasi tutto il mondo dei grandi.",
    "fahrenheit 451": "In un futuro dove i pompieri bruciano i libri invece di spegnere gli incendi, uno di loro ne apre uno.",
    "lo hobbit": "Un hobbit sedentario viene trascinato da tredici nani e un mago in un viaggio verso una montagna occupata da un drago.",
    "the hobbit": "Un hobbit sedentario viene trascinato da tredici nani e un mago in un viaggio verso una montagna occupata da un drago.",
    "il signore degli anelli": "Un anello che dà potere assoluto va distrutto, e tocca farlo alla creatura più piccola e meno potente di tutte.",
    "the lord of the rings": "Un anello che dà potere assoluto va distrutto, e tocca farlo alla creatura più piccola e meno potente di tutte.",
    "harry potter e la pietra filosofale": "Un bambino cresciuto in un sottoscala scopre a undici anni di essere un mago e parte per una scuola di magia.",
    "harry potter and the philosopher s stone": "Un bambino cresciuto in un sottoscala scopre a undici anni di essere un mago e parte per una scuola di magia.",
    "le cronache di narnia": "Quattro fratelli attraversano un armadio e finiscono in un paese dove è sempre inverno e mai Natale.",
    "momo": "Una bambina che sa ascoltare come nessuno affronta gli uomini grigi, che rubano il tempo alle persone.",
    "la storia infinita": "Un ragazzo ruba un libro e, leggendolo, si accorge che la storia dentro il libro sta parlando proprio di lui.",
    "the neverending story": "Un ragazzo ruba un libro e, leggendolo, si accorge che la storia dentro il libro sta parlando proprio di lui.",
    "il grande gigante gentile": "Una bambina viene rapita da un gigante che, a differenza degli altri giganti, non mangia i bambini: soffia sogni.",
    "matilde": "Una bambina straordinariamente intelligente, con una famiglia che la ignora e una preside terrificante, scopre di avere un potere.",
    "matilda": "Una bambina straordinariamente intelligente, con una famiglia che la ignora e una preside terrificante, scopre di avere un potere.",
    "la fabbrica di cioccolato": "Cinque bambini vincono un biglietto d'oro ed entrano nella fabbrica di cioccolato più segreta del mondo.",
    "charlie and the chocolate factory": "Cinque bambini vincono un biglietto d'oro ed entrano nella fabbrica di cioccolato più segreta del mondo.",
    "il buio oltre la siepe": "In una cittadina dell'Alabama degli anni Trenta, un avvocato difende un uomo nero accusato ingiustamente, e i suoi figli guardano.",
    "to kill a mockingbird": "In una cittadina dell'Alabama degli anni Trenta, un avvocato difende un uomo nero accusato ingiustamente, e i suoi figli guardano.",
    "cent anni di solitudine": "Sette generazioni della famiglia Buendía nel villaggio di Macondo, dove il meraviglioso è parte della vita quotidiana.",
    "it": "Sette ragazzini di una cittadina del Maine affrontano una cosa che torna ogni ventisette anni. Da adulti devono tornare a farlo.",
    "shining": "Un uomo accetta di fare il custode invernale di un albergo isolato, con la moglie e il figlio. L'albergo ha altri piani.",
    "the shining": "Un uomo accetta di fare il custode invernale di un albergo isolato, con la moglie e il figlio. L'albergo ha altri piani.",
    "misery": "Uno scrittore ha un incidente e viene salvato dalla sua lettrice numero uno. Che non ha nessuna intenzione di lasciarlo andare.",
    "carrie": "Una ragazza umiliata da tutti scopre di poter muovere le cose con la mente, e arriva la sera del ballo.",
    "il trono di spade": "Sette regni, molte famiglie, un solo trono, e un inverno che sta arrivando da anni.",
    "a game of thrones": "Sette regni, molte famiglie, un solo trono, e un inverno che sta arrivando da anni.",
    "sapiens": "Come una scimmia poco importante dell'Africa orientale sia arrivata a dominare il pianeta, in tre rivoluzioni.",
    "diario di anne frank": "Due anni di clandestinità in un alloggio segreto di Amsterdam, raccontati da una ragazza che voleva fare la scrittrice.",
    "il diario di anne frank": "Due anni di clandestinità in un alloggio segreto di Amsterdam, raccontati da una ragazza che voleva fare la scrittrice."
  };

  const presentazioneDi = (titolo) => PRESENTAZIONI[normalize(titolo)] || "";

  /* ------------------------------------------- il catalogo che sta nel file */

  /** Le colonne di ogni riga di CATALOGO. */
  const T = 0, A = 1, ANNO = 2, PAGINE = 3, COPERTINA = 4, OPERA = 5, EDIZIONI = 6, ALTRO = 7;

  const daCatalogo = (riga) => ({
    id: riga[OPERA] ? "/works/" + riga[OPERA] : "locale:" + normalize(riga[T] + " " + riga[A]).replace(/ /g, "-"),
    source: "catalogo",
    title: riga[T],
    altTitle: riga[ALTRO] || "",
    author: riga[A],
    authorKeys: [],
    year: riga[ANNO] || null,
    pages: riga[PAGINE] || null,
    cover: riga[COPERTINA] ? `${COVERS}/${riga[COPERTINA]}-M.jpg` : null,
    coverLarge: riga[COPERTINA] ? `${COVERS}/${riga[COPERTINA]}-L.jpg` : null,
    subjects: [],
    languages: [],
    editions: riga[EDIZIONI] || 0,
    publisher: "",
    firstSentence: "",
    readable: false,
    blurb: presentazioneDi(riga[T]) || presentazioneDi(riga[ALTRO])
  });

  /**
   * Una parola cercata combacia con una parola del libro se è la stessa, o se
   * il libro la comincia: si cerca a metà digitazione, e chi ha scritto
   * «calvi» si aspetta già Calvino.
   *
   * Quello che invece non deve succedere è ritrovarsi la parola in mezzo a
   * un'altra: cercando Stephen King arrivavano i libri di Stephen Hawking,
   * perché «hawking» contiene «king».
   */
  const combaciaParola = (parole, cercata) => {
    for (const p of parole) if (p === cercata || p.startsWith(cercata)) return true;
    return false;
  };

  /**
   * La ricerca nel catalogo interno.
   *
   * Regola che conta: **tutte** le parole cercate devono trovarsi da qualche
   * parte, nel titolo o nell'autore. Accontentarsi di una parola sola faceva
   * comparire «La coscienza di Zeno» fra i risultati di «Italo Calvino»,
   * perché anche Svevo si chiamava Italo.
   *
   * Poi conta l'ordine. Un autore ha decine di libri in catalogo, e chi cerca
   * «Stephen King» vuole «It» e «Shining», non gli atti di un convegno:
   * davanti vanno le opere ristampate più volte.
   */
  function searchLocal(query, limit) {
    const parole = normalize(query).split(" ").filter(Boolean);
    if (!parole.length) return [];
    const cercato = normalize(query);
    const trovati = [];

    for (const riga of CATALOGO) {
      const titolo = normalize(riga[T]);
      const altro = riga[ALTRO] ? normalize(riga[ALTRO]) : "";
      const paroleTitolo = titolo.split(" ");
      const paroleAltro = altro ? altro.split(" ") : [];
      const paroleAutore = normalize(riga[A]).split(" ");

      const nelTitolo = (w) => combaciaParola(paroleTitolo, w);
      const nellAltro = (w) => paroleAltro.length > 0 && combaciaParola(paroleAltro, w);
      const nellAutore = (w) => combaciaParola(paroleAutore, w);

      const tuttoNelTitolo = parole.every(nelTitolo) || parole.every(nellAltro);
      const tuttoNellAutore = parole.every(nellAutore);
      if (!parole.every((w) => nelTitolo(w) || nellAltro(w) || nellAutore(w))) continue;

      let punti = 0;
      // Chi scrive il nome di un autore vuole i suoi libri, e fra quelli
      // decide soltanto quante volte sono stati ristampati. Premiare anche il
      // titolo qui fa danni: manda in cima «Omaggio a Italo Calvino», «The
      // Letters of J.R.R. Tolkien» e un volumetto intitolato «Andrea
      // Camilleri», davanti al «Barone rampante», allo «Hobbit» e al
      // commissario Montalbano.
      if (tuttoNellAutore) {
        punti += 12;
      } else {
        if (titolo === cercato || altro === cercato) punti += 40;
        if (tuttoNelTitolo) punti += 14;
        if (paroleTitolo[0] === parole[0]) punti += 4;
      }
      // Quante volte è stata ristampata, compressa: fra 5 edizioni e 50 la
      // differenza conta, fra 500 e 1000 molto meno.
      punti += Math.min(12, Math.round(Math.log10((riga[EDIZIONI] || 0) + 1) * 5));
      if (riga[COPERTINA]) punti += 2;
      if (riga[ANNO]) punti += 1;
      trovati.push({ riga, punti });
    }

    trovati.sort((a, b) => b.punti - a.punti ||
      (b.riga[EDIZIONI] || 0) - (a.riga[EDIZIONI] || 0) ||
      String(a.riga[T]).localeCompare(String(b.riga[T]), "it"));

    // Lo stesso libro può avere due schede su Open Library. In classifica
    // resta quella arrivata prima, cioè la più ristampata.
    const visti = new Set();
    const esito = [];
    for (const { riga } of trovati) {
      const chiave = normalize(riga[T]) + "|" + normalize(riga[A]).split(" ").pop();
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      esito.push(daCatalogo(riga));
      if (esito.length >= limit) break;
    }
    return esito;
  }

  /** Quante opere l'app si porta dietro, da dire all'utente quando serve. */
  const operePresenti = () => CATALOGO.length;

  /** E di quanti autori. Si conta una volta sola: il catalogo non cambia. */
  let quantiAutori = 0;
  const autoriPresenti = () => {
    if (!quantiAutori) quantiAutori = new Set(CATALOGO.map((r) => r[A])).size;
    return quantiAutori;
  };


  /* ============================================================ ricerca == */

  /** Le modalità di ricerca, con il parametro che Open Library si aspetta. */
  const MODES = {
    tutto:     { label: "Tutto",     param: "q" },
    titolo:    { label: "Titolo",    param: "title" },
    autore:    { label: "Autore",    param: "author" },
    argomento: { label: "Argomento", param: "subject" },
    isbn:      { label: "ISBN",      param: "isbn" }
  };

  /** Italiano e inglese davanti: sono le lingue in cui si legge qui. */
  const LANGUAGES = [
    { code: "", label: "Tutte le lingue" },
    { code: "ita", label: "Italiano" },
    { code: "eng", label: "Inglese" },
    { code: "fre", label: "Francese" },
    { code: "spa", label: "Spagnolo" },
    { code: "ger", label: "Tedesco" },
    { code: "jpn", label: "Giapponese" }
  ];

  /** «Più edizioni» è il modo più onesto di dire «più celebre». */
  const SORTS = {
    pertinenza: { label: "Più pertinenti", param: "" },
    celebri:    { label: "Più celebri",    param: "editions" },
    recenti:    { label: "Più recenti",    param: "new" },
    antichi:    { label: "Più antichi",    param: "old" }
  };

  const SEARCH_FIELDS = [
    "key", "title", "author_name", "author_key", "first_publish_year",
    "cover_i", "number_of_pages_median", "language", "subject", "edition_count",
    "publisher", "first_sentence", "ia"
  ].join(",");

  function fromOpenLibrary(doc) {
    return {
      id: doc.key || null,
      source: "openlibrary",
      title: doc.title || "",
      author: (doc.author_name || []).slice(0, 2).join(", "),
      authorKeys: doc.author_key || [],
      year: doc.first_publish_year || null,
      pages: doc.number_of_pages_median || null,
      cover: doc.cover_i ? `${COVERS}/${doc.cover_i}-M.jpg` : null,
      coverLarge: doc.cover_i ? `${COVERS}/${doc.cover_i}-L.jpg` : null,
      subjects: (doc.subject || []).slice(0, 14),
      languages: doc.language || [],
      editions: doc.edition_count || 0,
      publisher: (doc.publisher || [])[0] || "",
      firstSentence: Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : (doc.first_sentence || ""),
      readable: Array.isArray(doc.ia) && doc.ia.length > 0,
      blurb: ""
    };
  }

  function fromSubjectWork(work) {
    return {
      id: work.key || null,
      source: "openlibrary",
      title: work.title || "",
      author: (work.authors || []).map((a) => a.name).slice(0, 2).join(", "),
      authorKeys: (work.authors || []).map((a) => String(a.key || "").split("/").pop()),
      year: work.first_publish_year || null,
      pages: null,
      cover: work.cover_id ? `${COVERS}/${work.cover_id}-M.jpg` : null,
      coverLarge: work.cover_id ? `${COVERS}/${work.cover_id}-L.jpg` : null,
      subjects: (work.subject || []).slice(0, 14),
      languages: [],
      editions: work.edition_count || 0,
      publisher: "",
      firstSentence: "",
      readable: Array.isArray(work.ia) && work.ia.length > 0,
      blurb: ""
    };
  }

  /**
   * Open Library ordina per pertinenza testuale: davanti finisce spesso una
   * ristampa oscura. Qui pesano anche la lingua che l'utente sta cercando, il
   * numero di edizioni (quanto il libro è stato ripubblicato) e la copertina.
   */
  function rank(books, query, language) {
    const words = normalize(query).split(" ").filter(Boolean);
    const wanted = normalize(query);
    return books
      .map((book, index) => {
        const title = normalize(book.title);
        let score = -index * 0.35;
        if (title === wanted) score += 12;
        else if (words.length && words.every((w) => title.includes(w))) score += 6;
        if (language && (book.languages || []).includes(language)) score += 5;
        if (!language && (book.languages || []).includes("ita")) score += 2;
        if (book.cover) score += 2.5;
        score += Math.min(4, Math.log10((book.editions || 0) + 1) * 2);
        return { book, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((row) => row.book);
  }

  function dedupe(books) {
    const seen = new Set();
    const out = [];
    for (const book of books) {
      const author = normalize(book.author).split(" ").slice(-1)[0] || "";
      const key = normalize(book.title) + "|" + author;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(book);
    }
    return out;
  }

  /**
   * La ricerca vera e propria.
   * `page` parte da 1. Il risultato dice sempre se c'è dell'altro da caricare.
   */
  async function search({ query, mode = "tutto", language = "", sort = "pertinenza", page = 1 } = {}) {
    const clean = String(query || "").trim();
    if (clean.length < 2) return { ok: true, books: [], total: 0, page: 1, hasMore: false, online: reachable === true };

    const modeSpec = MODES[mode] || MODES.tutto;
    const sortSpec = SORTS[sort] || SORTS.pertinenza;

    const params = new URLSearchParams();
    params.set(modeSpec.param, mode === "isbn" ? clean.replace(/[^0-9Xx]/g, "") : clean);
    params.set("limit", String(PAGE_SIZE));
    params.set("page", String(page));
    params.set("fields", SEARCH_FIELDS);
    if (language) params.set("language", language);
    if (sortSpec.param) params.set("sort", sortSpec.param);

    const result = await getJSON(`${OPEN_LIBRARY}/search.json?${params}`);

    if (!result.ok) {
      // Niente rete: resta il catalogo interno, ma solo alla prima pagina.
      // Gli argomenti arrivano dal «Vedi tutto» degli scaffali e portano la
      // chiave di Open Library («classic literature»): lì non c'è niente da
      // cercare fra i titoli, c'è uno scaffale da riempire.
      const argomento = mode === "argomento" ? shelfLocal(clean.replace(/\s+/g, "_"), 40) : [];
      const local = page !== 1 ? [] : (argomento.length ? argomento : searchLocal(clean, 40));
      return {
        ok: local.length > 0,
        books: local,
        total: local.length,
        page: 1,
        hasMore: false,
        online: false,
        reason: result.reason
      };
    }

    const docs = (result.data.docs || []).map(fromOpenLibrary).filter((b) => b.title);
    // L'ordinamento esplicito è una scelta dell'utente: non va scavalcato.
    const ordered = sortSpec.param ? docs : rank(docs, clean, language);

    for (const book of ordered) {
      if (!book.blurb) book.blurb = presentazioneDi(book.title);
    }

    let books = dedupe(ordered);
    if (page === 1) {
      const local = searchLocal(clean, 8).filter(
        (l) => !books.some((b) => normalize(b.title) === normalize(l.title))
      );
      books = dedupe(books.concat(local));
    }

    const total = result.data.numFound || books.length;
    return {
      ok: true,
      books,
      total,
      page,
      hasMore: page * PAGE_SIZE < total,
      online: true,
      cached: result.cached === true
    };
  }

  /* ========================================================== scaffali === */

  /**
   * Gli scaffali della libreria. La chiave è il soggetto come lo conosce Open
   * Library; l'etichetta è quella che legge l'utente.
   */
  const SHELVES = [
    { key: "classic_literature", label: "Classici" },
    { key: "juvenile_fiction", label: "Per ragazzi" },
    { key: "adventure", label: "Avventura" },
    { key: "fantasy", label: "Fantasy" },
    { key: "science_fiction", label: "Fantascienza" },
    { key: "detective_and_mystery_stories", label: "Gialli" },
    { key: "history", label: "Storia" },
    { key: "biography", label: "Biografie" },
    { key: "poetry", label: "Poesia" },
    { key: "humor", label: "Umorismo" },
    { key: "philosophy", label: "Filosofia" },
    { key: "science", label: "Scienza" }
  ];

  /**
   * Gli scaffali quando la rete non c'è.
   *
   * A quale argomento appartenga un'opera lo sa Open Library, ma è una
   * risposta che arriva dalla rete. Senza rete restano gli autori: per ogni
   * scaffale se ne indicano alcuni, e lo scaffale si riempie con i loro libri
   * più ristampati. Sono meno di quelli veri, ma sono libri riconoscibili —
   * meglio di uno scaffale vuoto.
   */
  const AUTORI_PER_SCAFFALE = {
    classic_literature: ["Alessandro Manzoni", "Italo Svevo", "Luigi Pirandello", "Giovanni Verga",
      "Fëdor Dostoevskij", "Lev Tolstoj", "Anton Čechov", "Victor Hugo", "Charles Dickens",
      "Jane Austen", "Gustave Flaubert", "Stendhal", "Miguel de Cervantes", "Franz Kafka",
      "Virginia Woolf", "James Joyce", "Ernest Hemingway", "John Steinbeck", "Emily Brontë"],
    juvenile_fiction: ["Carlo Collodi", "Edmondo De Amicis", "Gianni Rodari", "Roald Dahl",
      "Astrid Lindgren", "Michael Ende", "Antoine de Saint-Exupéry", "Lewis Carroll",
      "Cornelia Funke", "Rick Riordan", "J. K. Rowling", "Luis Sepúlveda"],
    adventure: ["Emilio Salgari", "Jules Verne", "Robert Louis Stevenson", "Daniel Defoe",
      "Jack London", "Rudyard Kipling", "Alexandre Dumas", "Ken Follett",
      "Valerio Massimo Manfredi", "Suzanne Collins"],
    fantasy: ["J. R. R. Tolkien", "J. K. Rowling", "George R. R. Martin", "C. S. Lewis",
      "Terry Pratchett", "Neil Gaiman", "Ursula K. Le Guin", "Brandon Sanderson",
      "Patrick Rothfuss", "Andrzej Sapkowski", "Michael Ende", "Philip Pullman"],
    science_fiction: ["Isaac Asimov", "Philip K. Dick", "Ray Bradbury", "Arthur C. Clarke",
      "George Orwell", "Aldous Huxley", "H. G. Wells", "Michael Crichton", "Liu Cixin",
      "Ted Chiang", "Margaret Atwood"],
    detective_and_mystery_stories: ["Andrea Camilleri", "Agatha Christie", "Arthur Conan Doyle",
      "Edgar Allan Poe", "Gianrico Carofiglio", "Giorgio Faletti", "John Grisham",
      "Leonardo Sciascia", "Umberto Eco", "Dan Brown"],
    history: ["Alessandro Barbero", "Antonio Scurati", "Tiziano Terzani", "Yuval Noah Harari",
      "Jared Diamond", "Niccolò Machiavelli", "Oriana Fallaci", "Curzio Malaparte",
      "Anne Frank", "Primo Levi"],
    biography: ["Anne Frank", "Primo Levi", "Oriana Fallaci", "Tiziano Terzani", "Oliver Sacks",
      "Stephen Hawking", "Piero Angela", "Natalia Ginzburg"],
    poetry: ["Giacomo Leopardi", "Ugo Foscolo", "Giovanni Pascoli", "Eugenio Montale",
      "Dante Alighieri", "Francesco Petrarca", "Gabriele D'Annunzio", "Federico García Lorca",
      "Oscar Wilde", "William Shakespeare"],
    humor: ["Stefano Benni", "Gianni Rodari", "Terry Pratchett", "Mark Twain", "Oscar Wilde",
      "Carlo Goldoni", "Molière", "Andrea Vitali"],
    philosophy: ["Umberto Galimberti", "Jostein Gaarder", "Albert Camus", "Jean-Paul Sartre",
      "Niccolò Machiavelli", "Hermann Hesse", "Milan Kundera", "José Saramago"],
    science: ["Carlo Rovelli", "Piero Angela", "Stephen Hawking", "Oliver Sacks",
      "Jared Diamond", "Yuval Noah Harari", "Isaac Asimov"]
  };

  const cognomeDi = (nome) => normalize(nome).split(" ").pop();

  function shelfLocal(key, limit) {
    const voluti = new Set((AUTORI_PER_SCAFFALE[key] || []).map(cognomeDi));
    if (!voluti.size) return [];

    // Un autore per volta, a giro: così lo scaffale non diventa la
    // bibliografia di chi ha più ristampe.
    const perAutore = new Map();
    for (const riga of CATALOGO) {
      const cognome = cognomeDi(riga[A]);
      if (!voluti.has(cognome)) continue;
      if (!perAutore.has(cognome)) perAutore.set(cognome, []);
      perAutore.get(cognome).push(riga);
    }
    for (const righe of perAutore.values()) {
      righe.sort((a, b) => (b[EDIZIONI] || 0) - (a[EDIZIONI] || 0));
    }

    const scaffale = [];
    const code = [...perAutore.values()];
    for (let giro = 0; scaffale.length < limit && giro < 6; giro++) {
      for (const righe of code) {
        if (!righe[giro]) continue;
        scaffale.push(daCatalogo(righe[giro]));
        if (scaffale.length >= limit) break;
      }
    }
    return scaffale;
  }

  async function shelf(key, { limit = 14 } = {}) {
    const result = await getJSON(`${OPEN_LIBRARY}/subjects/${encodeURIComponent(key)}.json?limit=${limit}`);
    if (!result.ok) {
      const local = shelfLocal(key, limit);
      const scaffale = SHELVES.find((s) => s.key === key);
      return {
        ok: local.length > 0,
        books: local,
        total: local.length,
        name: (scaffale && scaffale.label) || key,
        online: false,
        reason: result.reason
      };
    }
    const works = (result.data.works || []).map(fromSubjectWork).filter((b) => b.title);
    return {
      ok: true,
      books: dedupe(works),
      total: result.data.work_count || works.length,
      name: result.data.name || key
    };
  }

  /* ============================================================ autori === */

  async function findAuthors(name) {
    const clean = String(name || "").trim();
    if (clean.length < 2) return { ok: true, authors: [] };
    const result = await getJSON(`${OPEN_LIBRARY}/search/authors.json?q=${encodeURIComponent(clean)}&limit=5`);
    if (!result.ok) return { ok: false, authors: [], reason: result.reason };
    const authors = (result.data.docs || [])
      .filter((a) => a.name && (a.work_count || 0) > 0)
      .map((a) => ({
        key: a.key,
        name: a.name,
        works: a.work_count || 0,
        topWork: a.top_work || "",
        birth: a.birth_date || "",
        death: a.death_date || ""
      }))
      .sort((a, b) => b.works - a.works);
    return { ok: true, authors };
  }

  async function authorProfile(author) {
    const result = await getJSON(`${OPEN_LIBRARY}/authors/${encodeURIComponent(author.key)}.json`);
    if (!result.ok) return null;
    let bio = result.data.bio;
    if (bio && typeof bio === "object") bio = bio.value;
    return {
      name: result.data.name || author.name,
      bio: String(bio || "").trim(),
      birth: result.data.birth_date || author.birth || "",
      death: result.data.death_date || author.death || "",
      url: `${OPEN_LIBRARY}/authors/${author.key}`
    };
  }

  /* ========================================================= Wikipedia === */

  const wikiApi = (params) =>
    `${WIKIPEDIA}?${new URLSearchParams(Object.assign({ format: "json", origin: "*" }, params))}`;

  function htmlToText(html) {
    const cleaned = String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<table[\s\S]*?<\/table>/gi, "")
      .replace(/<sup[\s\S]*?<\/sup>/gi, "");
    const box = document.createElement("div");
    box.innerHTML = cleaned;
    return box.textContent
      .replace(/\[modifica[^\]]*\]/gi, "")
      .replace(/\[\d+\]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Trova la voce giusta. Meglio nessuna trama che la trama di un altro libro:
   * se il titolo della voce non somiglia a quello del libro, si lascia perdere.
   */
  function pickPage(hits, book) {
    const wanted = normalize(book.title);
    for (const hit of hits) {
      const found = normalize(hit.title).replace(/ (romanzo|libro|film|racconto)$/, "");
      if (found === wanted) return hit.title;
    }
    for (const hit of hits) {
      const found = normalize(hit.title);
      if (found.startsWith(wanted) && found.length <= wanted.length + 14) return hit.title;
    }
    return null;
  }

  const PLOT_SECTIONS = /^(trama|contenuto|sinossi|riassunto|argomento|contenuti|il libro)$/i;

  async function wikipedia(book) {
    const query = `${book.title} ${(book.author || "").split(",")[0]}`.trim();
    const found = await getJSON(wikiApi({ action: "query", list: "search", srsearch: query, srlimit: "5" }));
    if (!found.ok) return null;

    const title = pickPage(found.data?.query?.search || [], book);
    if (!title) return null;

    const [intro, sections] = await Promise.all([
      getJSON(wikiApi({ action: "query", prop: "extracts", exintro: "1", explaintext: "1", redirects: "1", titles: title })),
      getJSON(wikiApi({ action: "parse", prop: "sections", page: title }))
    ]);

    const page = intro.ok ? Object.values(intro.data?.query?.pages || {})[0] : null;
    const list = sections.ok ? (sections.data?.parse?.sections || []) : [];
    const plotSection = list.find((s) => PLOT_SECTIONS.test(String(s.line || "").trim()));

    let plot = "";
    if (plotSection) {
      const body = await getJSON(wikiApi({ action: "parse", prop: "text", section: plotSection.index, page: title }));
      if (body.ok) {
        plot = htmlToText(body.data?.parse?.text?.["*"] || "")
          .replace(new RegExp("^" + plotSection.line + "\\s*", "i"), "")
          .trim();
      }
    }

    return {
      title,
      url: `https://it.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      intro: (page && page.extract) ? page.extract.trim() : "",
      plot
    };
  }

  /* ============================================== le altre due fonti === */

  async function openLibraryWork(book) {
    if (!book.id || !book.id.startsWith("/works/")) return null;
    const result = await getJSON(`${OPEN_LIBRARY}${book.id}.json`);
    if (!result.ok) return null;
    let description = result.data.description;
    if (description && typeof description === "object") description = description.value;
    return {
      url: `${OPEN_LIBRARY}${book.id}`,
      description: String(description || "").trim(),
      subjects: (result.data.subjects || []).slice(0, 14)
    };
  }

  /** Le edizioni danno quello che manca alla scheda: ISBN, editore, lingue. */
  async function editions(book) {
    if (!book.id || !book.id.startsWith("/works/")) return null;
    const result = await getJSON(`${OPEN_LIBRARY}${book.id}/editions.json?limit=20`);
    if (!result.ok) return null;
    const list = result.data.entries || [];
    const isbn = [];
    const publishers = [];
    const languages = [];
    for (const edition of list) {
      for (const value of (edition.isbn_13 || []).concat(edition.isbn_10 || [])) {
        if (value && !isbn.includes(value)) isbn.push(value);
      }
      for (const value of edition.publishers || []) {
        if (value && !publishers.includes(value)) publishers.push(value);
      }
      for (const value of edition.languages || []) {
        const code = String(value.key || "").split("/").pop();
        if (code && !languages.includes(code)) languages.push(code);
      }
    }
    return {
      count: result.data.size || list.length,
      isbn: isbn.slice(0, 3),
      publishers: publishers.slice(0, 3),
      languages
    };
  }

  async function googleBooks(book) {
    const query = `intitle:${book.title}${book.author ? " inauthor:" + book.author.split(",")[0] : ""}`;
    const result = await getJSON(`${GOOGLE_BOOKS}?q=${encodeURIComponent(query)}&maxResults=3`, { retries: 0 });
    if (!result.ok) return null; // quota o rete: è solo un ripiego
    for (const item of result.data.items || []) {
      const info = item.volumeInfo || {};
      if (info.description) {
        return {
          url: info.infoLink || "",
          description: String(info.description).trim(),
          categories: info.categories || [],
          pages: info.pageCount || null
        };
      }
    }
    return null;
  }

  /* ============================================================= temi === */

  /**
   * I soggetti di Open Library sono in inglese e mescolano generi veri a rumore
   * di catalogazione («Accessible book», «Readers»). Passa solo quello che un
   * lettore italiano riconosce come un tema, tradotto.
   */
  const TEMI = {
    "fiction": "Narrativa", "history": "Storia", "historical fiction": "Romanzo storico",
    "italian fiction": "Narrativa italiana", "italian literature": "Letteratura italiana",
    "fantasy": "Fantasy", "fantasy fiction": "Fantasy", "science fiction": "Fantascienza",
    "adventure": "Avventura", "adventure stories": "Avventura", "adventure and adventurers": "Avventura",
    "juvenile fiction": "Per ragazzi", "juvenile literature": "Per ragazzi",
    "children's stories": "Per bambini", "children's fiction": "Per bambini",
    "young adult fiction": "Per ragazzi", "love stories": "Storie d'amore", "romance": "Romanzo d'amore",
    "detective and mystery stories": "Giallo", "mystery": "Giallo", "mystery and detective stories": "Giallo",
    "horror": "Horror", "horror tales": "Horror", "biography": "Biografia", "autobiography": "Autobiografia",
    "poetry": "Poesia", "drama": "Teatro", "philosophy": "Filosofia", "psychology": "Psicologia",
    "travel": "Viaggi", "voyages and travels": "Viaggi", "war": "Guerra",
    "world war, 1939-1945": "Seconda guerra mondiale", "holocaust, jewish (1939-1945)": "Shoah",
    "friendship": "Amicizia", "family": "Famiglia", "families": "Famiglia",
    "fathers and sons": "Padri e figli", "brothers": "Fratelli", "mothers and daughters": "Madri e figlie",
    "animals": "Animali", "dogs": "Cani", "wolves": "Lupi", "magic": "Magia", "wizards": "Maghi",
    "witches": "Streghe", "nobility": "Nobiltà", "kings and rulers": "Re e sovrani",
    "politics and government": "Politica", "social conditions": "Società",
    "coming of age": "Formazione", "bildungsromans": "Romanzo di formazione",
    "classic literature": "Classico", "classics": "Classico", "satire": "Satira", "humor": "Umorismo",
    "fairy tales": "Fiabe", "folklore": "Folclore", "islands": "Isole", "pirates": "Pirati",
    "sea stories": "Storie di mare", "school stories": "Storie di scuola", "orphans": "Orfani",
    "utopias": "Utopie", "dystopias": "Distopia", "science": "Scienza", "nature": "Natura",
    "death": "Morte", "religion": "Religione", "art": "Arte", "music": "Musica", "cooking": "Cucina"
  };

  function temiItaliani(raw) {
    const out = [];
    for (const subject of raw) {
      const tema = TEMI[String(subject || "").trim().toLowerCase()];
      if (tema && !out.includes(tema)) out.push(tema);
    }
    return out.slice(0, 6);
  }

  const LANGUAGE_NAMES = {
    ita: "italiano", eng: "inglese", fre: "francese", spa: "spagnolo", ger: "tedesco",
    rus: "russo", jpn: "giapponese", por: "portoghese", chi: "cinese", ara: "arabo",
    dut: "olandese", swe: "svedese", pol: "polacco", gre: "greco", lat: "latino"
  };

  const languageName = (code) => LANGUAGE_NAMES[code] || code;

  /* ========================================================== dossier === */

  /**
   * Tutto quello che si riesce a sapere del libro, in una volta sola: è il
   * materiale che finisce sotto gli occhi di Claude quando deve spiegare
   * qualcosa, e l'elenco delle fonti che l'utente può andare a controllare.
   */
  async function research(book) {
    const [wiki, work, editionInfo, google] = await Promise.all([
      wikipedia(book).catch(() => null),
      openLibraryWork(book).catch(() => null),
      editions(book).catch(() => null),
      googleBooks(book).catch(() => null)
    ]);

    const sources = [];
    if (wiki && (wiki.plot || wiki.intro)) sources.push({ name: `Wikipedia — ${wiki.title}`, url: wiki.url });
    if (work && work.description) sources.push({ name: "Open Library", url: work.url });
    if (google && google.description) sources.push({ name: "Google Books", url: google.url });

    const plot = (wiki && wiki.plot) || (work && work.description) || (google && google.description) || "";
    const plotSource = (wiki && wiki.plot) ? "Wikipedia"
      : (work && work.description) ? "Open Library"
      : (google && google.description) ? "Google Books"
      : "";

    const subjects = temiItaliani(
      [].concat(book.subjects || [], work ? work.subjects : [], google ? google.categories : []).filter(Boolean)
    );

    const languages = Array.from(new Set([].concat(book.languages || [], editionInfo ? editionInfo.languages : [])));

    return {
      book,
      plot,
      plotSource,
      intro: wiki ? wiki.intro : "",
      subjects,
      languages,
      editions: editionInfo,
      pages: book.pages || (google && google.pages) || null,
      sources,
      online: reachable === true,
      empty: !plot && !(wiki && wiki.intro) && !book.blurb
    };
  }

  /** Il dossier compattato per stare dentro un prompt senza sprechi. */
  function dossierText(dossier, { maxPlot = 2600 } = {}) {
    const parts = [];
    const book = dossier.book;
    parts.push(`Libro: «${book.title}»${book.author ? " di " + book.author : ""}${book.year ? ", " + book.year : ""}.`);
    if (dossier.intro) parts.push("Dalla voce enciclopedica:\n" + dossier.intro.slice(0, 900));
    if (dossier.plot) parts.push(`Trama (fonte: ${dossier.plotSource}):\n` + dossier.plot.slice(0, maxPlot));
    else if (book.blurb) parts.push("In breve:\n" + book.blurb);
    if (dossier.subjects.length) parts.push("Temi e generi: " + dossier.subjects.join(", ") + ".");
    return parts.join("\n\n");
  }

  return {
    MODES, LANGUAGES, SORTS, SHELVES, PAGE_SIZE,
    search, searchLocal, shelf, findAuthors, authorProfile,
    research, dossierText, wikipedia,
    isReachable, normalize, languageName, temiItaliani, operePresenti, autoriPresenti
  };
})();
