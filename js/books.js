/**
 * Leggi di più — la libreria.
 *
 * Cerca fra i libri del mondo e ne ricostruisce la trama, mettendo insieme tre
 * fonti pubbliche che si possono interrogare da un browser senza chiavi:
 *
 *   Open Library   catalogo e copertine
 *   Wikipedia (it) la trama vera, dalla sezione «Trama» della voce
 *   Google Books   descrizione dell'editore, come ripiego
 *
 * Tutte e tre rispondono con `access-control-allow-origin: *`, quindi la pagina
 * può chiamarle direttamente. Dove la rete non c'è — o dove la pagina non ha il
 * permesso di uscire — resta il catalogo di partenza qui sotto, che vive dentro
 * il file: la ricerca funziona comunque, solo su meno libri.
 */
const Books = (() => {
  "use strict";

  const OPEN_LIBRARY = "https://openlibrary.org";
  const COVERS = "https://covers.openlibrary.org/b/id";
  const GOOGLE_BOOKS = "https://www.googleapis.com/books/v1/volumes";
  const WIKIPEDIA = "https://it.wikipedia.org/w/api.php";

  /** null finché non si sa, poi true/false: serve a spiegare all'utente che cosa succede. */
  let reachable = null;

  /**
   * Il catalogo che viaggia dentro il file. Non pretende di essere completo:
   * serve a dare risultati immediati e a far funzionare l'app anche offline.
   * La ricerca online, quando c'è, aggiunge tutto il resto.
   */
  const SEED = [
    { title: "Il barone rampante", author: "Italo Calvino", year: 1957, pages: 275, blurb: "Un ragazzo di dodici anni sale su un albero dopo un litigio a tavola e decide di non scendere mai più. Da lassù si costruisce una vita intera." },
    { title: "Il visconte dimezzato", author: "Italo Calvino", year: 1952, pages: 120, blurb: "Una palla di cannone taglia in due un visconte. Le due metà tornano a casa separate: una cattivissima, l'altra buonissima." },
    { title: "Le città invisibili", author: "Italo Calvino", year: 1972, pages: 164, blurb: "Marco Polo descrive a Kublai Khan decine di città impossibili. Ogni città è un modo diverso di guardare la vita." },
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
    { title: "Il buio oltre la siepe", author: "Harper Lee", year: 1960, pages: 281, blurb: "In una cittadina dell'Alabama degli anni Trenta, un avvocato difende un uomo nero accusato ingiustamente, e i suoi figli guardano." },
    { title: "Cent'anni di solitudine", author: "Gabriel García Márquez", year: 1967, pages: 417, blurb: "Sette generazioni della famiglia Buendía nel villaggio di Macondo, dove il meraviglioso è parte della vita quotidiana." },
    { title: "Il nome della rosa", author: "Umberto Eco", year: 1980, pages: 512, blurb: "In un'abbazia medievale i monaci muoiono uno dopo l'altro. Un frate inglese indaga usando la logica." },
    { title: "Sapiens. Da animali a dèi", author: "Yuval Noah Harari", year: 2011, pages: 512, blurb: "Come una scimmia poco importante dell'Africa orientale sia arrivata a dominare il pianeta, in tre rivoluzioni." }
  ];

  /* --------------------------------------------------------------- rete --- */

  async function getJSON(url, { timeout = 9000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      reachable = true; // ha risposto: la rete c'è, anche se lo stato è un errore
      if (!response.ok) return { ok: false, reason: "http", status: response.status };
      return { ok: true, data: await response.json() };
    } catch (err) {
      if (reachable !== true) reachable = false;
      return { ok: false, reason: err && err.name === "AbortError" ? "timeout" : "network" };
    } finally {
      clearTimeout(timer);
    }
  }

  const isReachable = () => reachable;

  /* ------------------------------------------------------------ ricerca --- */

  const normalize = (s) => String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  function seedId(book) {
    return "seed:" + normalize(book.title + " " + book.author).replace(/ /g, "-");
  }

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
      .map((row) => Object.assign({
        id: seedId(row.book),
        source: "catalogo",
        cover: null,
        subjects: []
      }, row.book));
  }

  function fromOpenLibrary(doc) {
    return {
      id: doc.key || null,
      source: "openlibrary",
      title: doc.title || "",
      author: (doc.author_name || []).slice(0, 2).join(", "),
      year: doc.first_publish_year || null,
      pages: doc.number_of_pages_median || null,
      cover: doc.cover_i ? `${COVERS}/${doc.cover_i}-M.jpg` : null,
      coverLarge: doc.cover_i ? `${COVERS}/${doc.cover_i}-L.jpg` : null,
      subjects: (doc.subject || []).slice(0, 10),
      languages: doc.language || [],
      editions: doc.edition_count || 0,
      blurb: ""
    };
  }

  /**
   * Open Library ordina per pertinenza testuale. Qui davanti vanno i libri che
   * un lettore italiano cerca davvero: edizione italiana, tante ristampe,
   * copertina disponibile.
   */
  function rank(books, query) {
    const words = normalize(query).split(" ").filter(Boolean);
    return books
      .map((book, index) => {
        let score = -index * 0.4; // l'ordine di Open Library conta, ma non decide
        const title = normalize(book.title);
        if (words.length && words.every((w) => title.includes(w))) score += 6;
        if (title === normalize(query)) score += 10;
        if ((book.languages || []).includes("ita")) score += 5;
        if (book.cover) score += 2;
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
      const key = normalize(book.title) + "|" + normalize(book.author).split(" ").slice(-1)[0];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(book);
    }
    return out;
  }

  /**
   * Cerca prima nel catalogo interno (risposta immediata), poi online.
   * Restituisce sempre qualcosa: se la rete manca, restano i risultati locali.
   */
  async function search(query, { limit = 24 } = {}) {
    const clean = String(query || "").trim();
    if (clean.length < 2) return { ok: true, books: [], online: false };

    const local = searchSeed(clean, 6);
    const fields = "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,language,subject,edition_count";
    const url = `${OPEN_LIBRARY}/search.json?q=${encodeURIComponent(clean)}&limit=${limit}&fields=${fields}`;
    const result = await getJSON(url);

    if (!result.ok) {
      return { ok: local.length > 0, books: local, online: false, reason: result.reason };
    }

    const remote = rank((result.data.docs || []).map(fromOpenLibrary).filter((b) => b.title), clean);

    // Il risultato online è più ricco (copertina, temi, scheda dell'opera):
    // il catalogo interno non deve coprirlo, gli presta solo la presentazione.
    for (const book of remote) {
      const known = SEED.find((s) => normalize(s.title) === normalize(book.title));
      if (known && !book.blurb) book.blurb = known.blurb;
    }
    const onlyLocal = local.filter(
      (book) => !remote.some((r) => normalize(r.title) === normalize(book.title))
    );

    return {
      ok: true,
      books: dedupe(remote.concat(onlyLocal)).slice(0, limit),
      online: true,
      total: result.data.numFound || remote.length
    };
  }

  /* ---------------------------------------------------------- Wikipedia --- */

  const wikiApi = (params) =>
    `${WIKIPEDIA}?${new URLSearchParams(Object.assign({ format: "json", origin: "*" }, params))}`;

  function htmlToText(html) {
    const cleaned = String(html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<table[\s\S]*?<\/table>/gi, "")
      .replace(/<sup[\s\S]*?<\/sup>/gi, "");
    const doc = document.createElement("div");
    doc.innerHTML = cleaned;
    return doc.textContent
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
      const found = normalize(hit.title).replace(/ (romanzo|libro|film)$/, "");
      if (found === wanted) return hit.title;
    }
    for (const hit of hits) {
      const found = normalize(hit.title);
      if (found.startsWith(wanted) && found.length <= wanted.length + 14) return hit.title;
    }
    return null;
  }

  const PLOT_SECTIONS = /^(trama|contenuto|sinossi|riassunto|argomento|contenuti)$/i;

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

  /* ------------------------------------------------- altre due fonti --- */

  async function openLibraryWork(book) {
    if (!book.id || !book.id.startsWith("/works/")) return null;
    const result = await getJSON(`${OPEN_LIBRARY}${book.id}.json`);
    if (!result.ok) return null;
    let description = result.data.description;
    if (description && typeof description === "object") description = description.value;
    return {
      url: `${OPEN_LIBRARY}${book.id}`,
      description: String(description || "").trim(),
      subjects: (result.data.subjects || []).slice(0, 10)
    };
  }

  async function googleBooks(book) {
    const query = `intitle:${book.title}${book.author ? " inauthor:" + book.author.split(",")[0] : ""}`;
    const result = await getJSON(`${GOOGLE_BOOKS}?q=${encodeURIComponent(query)}&maxResults=3`);
    if (!result.ok) return null; // quota esaurita o rete: è solo un ripiego
    const items = result.data.items || [];
    for (const item of items) {
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

  /* ------------------------------------------------------------- i temi --- */

  /**
   * I soggetti di Open Library sono in inglese e mescolano generi veri a
   * rumore di catalogazione («Accessible book», «Readers»). Qui passa solo
   * quello che un lettore italiano riconosce come un tema, tradotto.
   */
  const TEMI = {
    "fiction": "Narrativa",
    "history": "Storia",
    "historical fiction": "Romanzo storico",
    "italian fiction": "Narrativa italiana",
    "fantasy": "Fantasy",
    "fantasy fiction": "Fantasy",
    "science fiction": "Fantascienza",
    "adventure": "Avventura",
    "adventure stories": "Avventura",
    "adventure and adventurers": "Avventura",
    "juvenile fiction": "Per ragazzi",
    "juvenile literature": "Per ragazzi",
    "children's stories": "Per bambini",
    "children's fiction": "Per bambini",
    "young adult fiction": "Per ragazzi",
    "love stories": "Storie d'amore",
    "romance": "Romanzo d'amore",
    "detective and mystery stories": "Giallo",
    "mystery": "Giallo",
    "mystery and detective stories": "Giallo",
    "horror": "Horror",
    "biography": "Biografia",
    "autobiography": "Autobiografia",
    "poetry": "Poesia",
    "philosophy": "Filosofia",
    "psychology": "Psicologia",
    "travel": "Viaggi",
    "voyages and travels": "Viaggi",
    "war": "Guerra",
    "world war, 1939-1945": "Seconda guerra mondiale",
    "holocaust, jewish (1939-1945)": "Shoah",
    "friendship": "Amicizia",
    "family": "Famiglia",
    "families": "Famiglia",
    "fathers and sons": "Padri e figli",
    "brothers": "Fratelli",
    "mothers and daughters": "Madri e figlie",
    "animals": "Animali",
    "dogs": "Cani",
    "wolves": "Lupi",
    "magic": "Magia",
    "wizards": "Maghi",
    "witches": "Streghe",
    "nobility": "Nobiltà",
    "kings and rulers": "Re e sovrani",
    "politics and government": "Politica",
    "social conditions": "Società",
    "coming of age": "Formazione",
    "bildungsromans": "Romanzo di formazione",
    "classic literature": "Classico",
    "classics": "Classico",
    "satire": "Satira",
    "humor": "Umorismo",
    "fairy tales": "Fiabe",
    "folklore": "Folclore",
    "islands": "Isole",
    "pirates": "Pirati",
    "sea stories": "Storie di mare",
    "school stories": "Storie di scuola",
    "orphans": "Orfani",
    "utopias": "Utopie",
    "dystopias": "Distopia",
    "science": "Scienza",
    "nature": "Natura",
    "death": "Morte",
    "religion": "Religione"
  };

  function temiItaliani(raw) {
    const out = [];
    for (const subject of raw) {
      const key = String(subject || "").trim().toLowerCase();
      const tema = TEMI[key];
      if (tema && !out.includes(tema)) out.push(tema);
    }
    return out.slice(0, 6);
  }

  /* --------------------------------------------------------- il dossier --- */

  /**
   * Tutto quello che si riesce a sapere del libro, in una volta sola: è il
   * materiale che poi finisce sotto gli occhi di Claude quando deve spiegare
   * qualcosa, e l'elenco delle fonti che l'utente può andare a controllare.
   */
  async function research(book) {
    const [wiki, work, google] = await Promise.all([
      wikipedia(book).catch(() => null),
      openLibraryWork(book).catch(() => null),
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

    return {
      book,
      plot,
      plotSource,
      intro: wiki ? wiki.intro : "",
      subjects: Array.from(new Set(subjects)).slice(0, 12),
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

  return { SEED, search, research, wikipedia, dossierText, isReachable, normalize, seedId };
})();
