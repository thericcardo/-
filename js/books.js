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
          if (!worthRetrying || tryNumber >= retries) {
            return { ok: false, reason: response.status === 429 ? "rate-limit" : "http", status: response.status };
          }
        } catch (err) {
          if (reachable !== true) reachable = false;
          if (tryNumber >= retries) {
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

  const SEED = [
    { title: "Il barone rampante", author: "Italo Calvino", year: 1957, pages: 275, blurb: "Un ragazzo di dodici anni sale su un albero dopo un litigio a tavola e decide di non scendere mai più. Da lassù si costruisce una vita intera." },
    { title: "Il visconte dimezzato", author: "Italo Calvino", year: 1952, pages: 120, blurb: "Una palla di cannone taglia in due un visconte. Le due metà tornano a casa separate: una cattivissima, l'altra buonissima." },
    { title: "Le città invisibili", author: "Italo Calvino", year: 1972, pages: 164, blurb: "Marco Polo descrive a Kublai Khan decine di città impossibili. Ogni città è un modo diverso di guardare la vita." },
    { title: "Marcovaldo", author: "Italo Calvino", year: 1963, pages: 128, blurb: "Venti racconti su un manovale di città che continua a cercare la natura fra cemento, semafori e supermercati." },
    { title: "Il piccolo principe", author: "Antoine de Saint-Exupéry", year: 1943, pages: 96, blurb: "Un aviatore precipita nel deserto e incontra un bambino arrivato da un piccolo pianeta, che gli fa domande a cui i grandi non sanno rispondere." },
    { title: "Pinocchio", author: "Carlo Collodi", year: 1883, pages: 180, blurb: "Un burattino di legno vuole diventare un bambino vero, ma ogni volta che può scegliere sceglie la strada sbagliata." },
    { title: "Cuore", author: "Edmondo De Amicis", year: 1886, pages: 250, blurb: "Il diario di un anno di scuola nella Torino dell'Ottocento, fra compagni, maestri e racconti mensili." },
    { title: "I promessi sposi", author: "Alessandro Manzoni", year: 1827, pages: 720, blurb: "Due giovani vogliono sposarsi, un signorotto locale lo impedisce. Attorno a loro, la Lombardia del Seicento fra carestia, guerra e peste." },
    { title: "La Divina Commedia", author: "Dante Alighieri", year: 1321, pages: 798, blurb: "Un uomo smarrito attraversa Inferno, Purgatorio e Paradiso per ritrovare la strada. Il viaggio più influente della letteratura europea." },
    { title: "Il fu Mattia Pascal", author: "Luigi Pirandello", year: 1904, pages: 280, blurb: "Un uomo scopre di essere stato dichiarato morto e coglie l'occasione per rifarsi una vita da capo. Non è semplice come sembra." },
    { title: "Se questo è un uomo", author: "Primo Levi", year: 1947, pages: 213, blurb: "La testimonianza lucida di un anno ad Auschwitz, scritta da un chimico che voleva soprattutto capire e far capire." },
    { title: "Il Gattopardo", author: "Giuseppe Tomasi di Lampedusa", year: 1958, pages: 299, blurb: "Un principe siciliano guarda il proprio mondo finire mentre l'Italia si unisce, e decide che cambiare tutto serve a non cambiare niente." },
    { title: "Il giorno della civetta", author: "Leonardo Sciascia", year: 1961, pages: 120, blurb: "Un capitano dei carabinieri indaga su un omicidio in un paese siciliano dove nessuno ha visto niente." },
    { title: "La coscienza di Zeno", author: "Italo Svevo", year: 1923, pages: 437, blurb: "Un uomo scrive la propria autobiografia per il medico che lo cura, e mentre la scrive si giustifica, si contraddice, forse mente." },
    { title: "Novecento", author: "Alessandro Baricco", year: 1994, pages: 62, blurb: "Un pianista nato su una nave non scende mai a terra in tutta la vita. Un monologo breve sul coraggio e sui limiti che scegliamo." },
    { title: "L'amica geniale", author: "Elena Ferrante", year: 2011, pages: 331, blurb: "Due bambine crescono in un rione povero di Napoli negli anni Cinquanta, legate da un'amicizia che le spinge e le ferisce per tutta la vita." },
    { title: "Io non ho paura", author: "Niccolò Ammaniti", year: 2001, pages: 219, blurb: "In un'estate rovente del Sud, un bambino di nove anni scopre un segreto che riguarda gli adulti del suo paese." },
    { title: "Il nome della rosa", author: "Umberto Eco", year: 1980, pages: 512, blurb: "In un'abbazia medievale i monaci muoiono uno dopo l'altro. Un frate inglese indaga usando la logica." },
    { title: "Le avventure di Tom Sawyer", author: "Mark Twain", year: 1876, pages: 274, blurb: "Un ragazzo del Mississippi salta la scuola, cerca tesori e finisce testimone di un delitto." },
    { title: "L'isola del tesoro", author: "Robert Louis Stevenson", year: 1883, pages: 292, blurb: "Un ragazzo trova una mappa in un baule e parte per un'isola, su una nave dove metà equipaggio ha altri piani." },
    { title: "Il giro del mondo in ottanta giorni", author: "Jules Verne", year: 1873, pages: 256, blurb: "Un gentiluomo inglese scommette metà del suo patrimonio che riuscirà a fare il giro del mondo in ottanta giorni esatti." },
    { title: "Ventimila leghe sotto i mari", author: "Jules Verne", year: 1870, pages: 400, blurb: "Tre naufraghi vengono raccolti da un sottomarino comandato da un capitano che ha voltato le spalle al mondo." },
    { title: "Alice nel Paese delle Meraviglie", author: "Lewis Carroll", year: 1865, pages: 152, blurb: "Una bambina insegue un coniglio con l'orologio e finisce in un mondo dove la logica funziona al contrario." },
    { title: "Il meraviglioso mago di Oz", author: "L. Frank Baum", year: 1900, pages: 154, blurb: "Un ciclone porta Dorothy in un paese lontano. Per tornare a casa deve seguire una strada di mattoni gialli." },
    { title: "Il libro della giungla", author: "Rudyard Kipling", year: 1894, pages: 277, blurb: "Un bambino cresciuto dai lupi impara le leggi della giungla da una pantera, un orso e un pitone." },
    { title: "Robinson Crusoe", author: "Daniel Defoe", year: 1719, pages: 320, blurb: "Un naufrago resta solo su un'isola per ventotto anni e ricostruisce da zero tutto quello che sapeva fare." },
    { title: "Zanna Bianca", author: "Jack London", year: 1906, pages: 298, blurb: "Un lupo nato nel Grande Nord passa di padrone in padrone e impara che cosa cambia fra chi lo picchia e chi lo rispetta." },
    { title: "Il richiamo della foresta", author: "Jack London", year: 1903, pages: 172, blurb: "Un cane da salotto viene rapito e venduto come cane da slitta in Alaska, dove ritrova istinti che non sapeva di avere." },
    { title: "Frankenstein", author: "Mary Shelley", year: 1818, pages: 280, blurb: "Uno scienziato costruisce una creatura vivente e poi scappa dalla sua stessa creazione. La creatura lo cerca per chiedergli conto." },
    { title: "Orgoglio e pregiudizio", author: "Jane Austen", year: 1813, pages: 432, blurb: "Cinque sorelle, poca dote e una madre decisa a maritarle. Elizabeth Bennet detesta il signor Darcy, almeno all'inizio." },
    { title: "Delitto e castigo", author: "Fëdor Dostoevskij", year: 1866, pages: 671, blurb: "Uno studente povero uccide una vecchia usuraia convinto di averne il diritto, e poi deve convivere con quello che ha fatto." },
    { title: "Anna Karenina", author: "Lev Tolstoj", year: 1878, pages: 864, blurb: "Una donna dell'aristocrazia russa lascia marito e posizione per amore, e scopre il prezzo che la società le presenta." },
    { title: "Il vecchio e il mare", author: "Ernest Hemingway", year: 1952, pages: 127, blurb: "Un pescatore vecchio e senza fortuna aggancia il pesce più grande della sua vita, lontano da riva e da solo." },
    { title: "1984", author: "George Orwell", year: 1949, pages: 328, blurb: "In uno Stato che sorveglia tutto e riscrive il passato ogni giorno, un impiegato comincia a tenere un diario." },
    { title: "La fattoria degli animali", author: "George Orwell", year: 1945, pages: 112, blurb: "Gli animali cacciano il contadino e si governano da soli. Poi qualcuno comincia a essere più uguale degli altri." },
    { title: "Il signore delle mosche", author: "William Golding", year: 1954, pages: 224, blurb: "Un gruppo di ragazzi naufraga su un'isola senza adulti e prova a darsi delle regole." },
    { title: "Il giovane Holden", author: "J. D. Salinger", year: 1951, pages: 234, blurb: "Tre giorni a New York di un ragazzo appena cacciato da scuola, che trova falso quasi tutto il mondo dei grandi." },
    { title: "Fahrenheit 451", author: "Ray Bradbury", year: 1953, pages: 194, blurb: "In un futuro dove i pompieri bruciano i libri invece di spegnere gli incendi, uno di loro ne apre uno." },
    { title: "Lo Hobbit", author: "J. R. R. Tolkien", year: 1937, pages: 310, blurb: "Un hobbit sedentario viene trascinato da tredici nani e un mago in un viaggio verso una montagna occupata da un drago." },
    { title: "Il signore degli anelli", author: "J. R. R. Tolkien", year: 1954, pages: 1178, blurb: "Un anello che dà potere assoluto va distrutto, e tocca farlo alla creatura più piccola e meno potente di tutte." },
    { title: "Harry Potter e la pietra filosofale", author: "J. K. Rowling", year: 1997, pages: 223, blurb: "Un bambino cresciuto in un sottoscala scopre a undici anni di essere un mago e parte per una scuola di magia." },
    { title: "Le cronache di Narnia", author: "C. S. Lewis", year: 1950, pages: 767, blurb: "Quattro fratelli attraversano un armadio e finiscono in un paese dove è sempre inverno e mai Natale." },
    { title: "Momo", author: "Michael Ende", year: 1973, pages: 240, blurb: "Una bambina che sa ascoltare come nessuno affronta gli uomini grigi, che rubano il tempo alle persone." },
    { title: "La storia infinita", author: "Michael Ende", year: 1979, pages: 448, blurb: "Un ragazzo ruba un libro e, leggendolo, si accorge che la storia dentro il libro sta parlando proprio di lui." },
    { title: "Il Grande Gigante Gentile", author: "Roald Dahl", year: 1982, pages: 208, blurb: "Una bambina viene rapita da un gigante che, a differenza degli altri giganti, non mangia i bambini: soffia sogni." },
    { title: "Matilde", author: "Roald Dahl", year: 1988, pages: 240, blurb: "Una bambina straordinariamente intelligente, con una famiglia che la ignora e una preside terrificante, scopre di avere un potere." },
    { title: "La fabbrica di cioccolato", author: "Roald Dahl", year: 1964, pages: 176, blurb: "Cinque bambini vincono un biglietto d'oro ed entrano nella fabbrica di cioccolato più segreta del mondo." },
    { title: "Il buio oltre la siepe", author: "Harper Lee", year: 1960, pages: 281, blurb: "In una cittadina dell'Alabama degli anni Trenta, un avvocato difende un uomo nero accusato ingiustamente, e i suoi figli guardano." },
    { title: "Cent'anni di solitudine", author: "Gabriel García Márquez", year: 1967, pages: 417, blurb: "Sette generazioni della famiglia Buendía nel villaggio di Macondo, dove il meraviglioso è parte della vita quotidiana." },
    { title: "Sapiens. Da animali a dèi", author: "Yuval Noah Harari", year: 2011, pages: 512, blurb: "Come una scimmia poco importante dell'Africa orientale sia arrivata a dominare il pianeta, in tre rivoluzioni." }
  ];

  const seedId = (book) => "seed:" + normalize(book.title + " " + book.author).replace(/ /g, "-");

  function searchSeed(query, limit) {
    const words = normalize(query).split(" ").filter(Boolean);
    if (!words.length) return [];
    return SEED
      .map((book) => {
        const hay = normalize(book.title + " " + book.author);
        let score = 0;
        for (const word of words) {
          if (hay.includes(word)) score += 2;
          if (normalize(book.title).startsWith(word)) score += 3;
        }
        return { book, score };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((row) => Object.assign({ id: seedId(row.book), source: "catalogo", cover: null, subjects: [], languages: [] }, row.book));
  }

  /* ============================================================ ricerca == */

  /** Le modalità di ricerca, con il parametro che Open Library si aspetta. */
  const MODES = {
    tutto:     { label: "Tutto",     param: "q" },
    titolo:    { label: "Titolo",    param: "title" },
    autore:    { label: "Autore",    param: "author" },
    argomento: { label: "Argomento", param: "subject" },
    isbn:      { label: "ISBN",      param: "isbn" }
  };

  const LANGUAGES = [
    { code: "", label: "Tutte le lingue" },
    { code: "ita", label: "Italiano" },
    { code: "eng", label: "Inglese" },
    { code: "fre", label: "Francese" },
    { code: "spa", label: "Spagnolo" },
    { code: "ger", label: "Tedesco" },
    { code: "por", label: "Portoghese" }
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
      const local = page === 1 ? searchSeed(clean, 12) : [];
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
      const known = SEED.find((s) => normalize(s.title) === normalize(book.title));
      if (known && !book.blurb) book.blurb = known.blurb;
    }

    let books = dedupe(ordered);
    if (page === 1) {
      const local = searchSeed(clean, 6).filter(
        (seed) => !books.some((b) => normalize(b.title) === normalize(seed.title))
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

  async function shelf(key, { limit = 14 } = {}) {
    const result = await getJSON(`${OPEN_LIBRARY}/subjects/${encodeURIComponent(key)}.json?limit=${limit}`);
    if (!result.ok) return { ok: false, books: [], reason: result.reason };
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
    por: "portoghese", rus: "russo", jpn: "giapponese", chi: "cinese", ara: "arabo",
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
    SEED, MODES, LANGUAGES, SORTS, SHELVES, PAGE_SIZE,
    search, shelf, findAuthors, authorProfile,
    research, dossierText, wikipedia,
    isReachable, normalize, seedId, languageName, temiItaliani
  };
})();
