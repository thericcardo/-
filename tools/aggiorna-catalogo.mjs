/**
 * Rigenera il catalogo che viaggia dentro l'app (js/catalogo.js).
 *
 *   node tools/aggiorna-catalogo.mjs            tutto
 *   node tools/aggiorna-catalogo.mjs --solo-gutenberg    salta la rete lenta
 *
 * L'app interroga Open Library dal vivo, ma in due situazioni non può: quando
 * manca la rete, e quando la pagina non ha il permesso di uscire — succede
 * nella versione pubblicata come artifact. Lì resta solo quello che il file si
 * porta dietro, e un pugno di titoli non è una libreria.
 *
 * Si pesca da tre posti diversi, perché da uno solo si ottiene sempre la
 * stessa cosa: i soliti nomi.
 *
 *   1. Project Gutenberg — il catalogo intero, in un file. Sono decine di
 *      migliaia di opere di dominio pubblico: qui stanno gli autori che
 *      nessuna classifica nomina, e tutte si possono leggere gratis, quindi
 *      ogni riga si porta dietro il link per aprirle.
 *   2. Open Library per autore — i nomi che la gente digita, mangaka compresi.
 *      Open Library archivia ogni opera col titolo originale, così di Murakami
 *      trova «海辺のカフカ» e di Oda «ONE PIECE 1»: illeggibili e incercabili.
 *      Per questo di ogni autore si fa un secondo giro chiedendo le edizioni
 *      italiane (e per i manga anche quelle inglesi), che restituiscono il
 *      titolo con cui il libro sta in libreria.
 *   3. Open Library per argomento, in profondità — non le prime ottanta opere
 *      di ogni scaffale, ma quattrocento: dalla terza pagina in poi cominciano
 *      i libri che non stanno in vetrina.
 *
 * Open Library limita le richieste: si va piano, con attese e ritentativi.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OPEN_LIBRARY = "https://openlibrary.org";
const GUTENBERG_CSV = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";
const PER_AUTORE = 50;
const PAGINE_PER_ARGOMENTO = 4;
const PER_PAGINA = 100;
const PAUSA = 1100;

const soloGutenberg = process.argv.includes("--solo-gutenberg");

/* ===================================================== gli scaffali ===== */

/**
 * Gli scaffali dell'app, con le parole che li riconoscono fra gli argomenti
 * della Library of Congress usati da Gutenberg. L'ordine conta: si prende il
 * primo che risponde, quindi i più specifici stanno prima.
 */
const SCAFFALI = [
  ["science_fiction", /science fiction|utopias|life on other planets/i],
  ["detective_and_mystery_stories", /detective and mystery|crime|mystery fiction/i],
  ["horror", /horror tales|ghost stories|vampires|monsters/i],
  ["fantasy", /fantasy|fairy tales|magic|mythology/i],
  ["adventure", /adventure stories|sea stories|pirates|voyages/i],
  ["juvenile_fiction", /juvenile fiction|juvenile literature|children's stories/i],
  ["poetry", /poetry|poems|sonnets/i],
  ["biography", /biography|autobiography|diaries|correspondence/i],
  ["history", /history|antiquities|war|revolution/i],
  ["philosophy", /philosophy|ethics|logic|metaphysics/i],
  ["science", /science|natural history|astronomy|physics|botany|zoology/i],
  ["humor", /humor|wit and humor|satire/i]
];

const scaffaleDi = (argomenti) => {
  for (let i = 0; i < SCAFFALI.length; i++) if (SCAFFALI[i][1].test(argomenti)) return i + 1;
  return 0;
};

/* ======================================================== gli autori ==== */

/** I nomi che un lettore digita davvero, dai banchi di scuola ai manga. */
const AUTORI = [
  // italiani
  "Italo Calvino", "Primo Levi", "Umberto Eco", "Alessandro Manzoni", "Dante Alighieri",
  "Luigi Pirandello", "Italo Svevo", "Giovanni Verga", "Cesare Pavese", "Elsa Morante",
  "Alberto Moravia", "Leonardo Sciascia", "Dino Buzzati", "Beppe Fenoglio", "Natalia Ginzburg",
  "Giuseppe Tomasi di Lampedusa", "Andrea Camilleri", "Elena Ferrante", "Niccolò Ammaniti",
  "Alessandro Baricco", "Paolo Cognetti", "Erri De Luca", "Margaret Mazzantini", "Carlo Collodi",
  "Edmondo De Amicis", "Emilio Salgari", "Gianni Rodari", "Susanna Tamaro", "Roberto Saviano",
  "Michela Murgia", "Curzio Malaparte", "Giacomo Leopardi", "Ugo Foscolo", "Giovanni Boccaccio",
  "Niccolò Machiavelli", "Francesco Petrarca", "Oriana Fallaci", "Tiziano Terzani",
  "Antonio Tabucchi", "Giorgio Bassani", "Grazia Deledda", "Carlo Emilio Gadda", "Elio Vittorini",
  "Vasco Pratolini", "Gabriele D'Annunzio", "Giovanni Pascoli", "Eugenio Montale", "Carlo Goldoni",
  "Dacia Maraini", "Stefano Benni", "Gianrico Carofiglio", "Giorgio Faletti", "Paolo Giordano",
  "Antonio Scurati", "Marco Missiroli", "Andrea Vitali", "Melania Mazzucco", "Sandro Veronesi",
  "Fabio Volo", "Federico Moccia", "Massimo Gramellini", "Valerio Massimo Manfredi",
  "Marcello Fois", "Maurizio De Giovanni", "Donato Carrisi", "Ilaria Tuti", "Rosa Teruzzi",
  "Teresa Ciabatti", "Claudia Durastanti", "Veronica Raimo", "Giulia Caminito", "Nicola Lagioia",
  "Emanuele Trevi", "Walter Siti", "Francesco Piccolo", "Paolo Rumiz", "Mauro Corona",
  "Matteo Bussola", "Enrico Galiano", "Alessandro D'Avenia", "Luca Ricci", "Rosella Postorino",
  // grandi nomi internazionali
  "Stephen King", "J. R. R. Tolkien", "J. K. Rowling", "Agatha Christie", "George Orwell",
  "Jane Austen", "Charles Dickens", "Mark Twain", "Ernest Hemingway", "Franz Kafka",
  "Fëdor Dostoevskij", "Lev Tolstoj", "Anton Čechov", "Nikolaj Gogol", "Vladimir Nabokov",
  "Gabriel García Márquez", "Jorge Luis Borges", "Isabel Allende", "Paulo Coelho",
  "Haruki Murakami", "Kazuo Ishiguro", "Ken Follett", "Dan Brown", "John Grisham",
  "Michael Crichton", "Isaac Asimov", "Philip K. Dick", "Ray Bradbury", "Arthur C. Clarke",
  "Ursula K. Le Guin", "Neil Gaiman", "Terry Pratchett", "George R. R. Martin", "C. S. Lewis",
  "Roald Dahl", "Michael Ende", "Antoine de Saint-Exupéry", "Lewis Carroll", "Jules Verne",
  "H. G. Wells", "Robert Louis Stevenson", "Daniel Defoe", "Jack London", "Rudyard Kipling",
  "Mary Shelley", "Bram Stoker", "Oscar Wilde", "Edgar Allan Poe", "Arthur Conan Doyle",
  "Victor Hugo", "Alexandre Dumas", "Gustave Flaubert", "Stendhal", "Honoré de Balzac",
  "Albert Camus", "Jean-Paul Sartre", "Marcel Proust", "Émile Zola", "Molière",
  "Miguel de Cervantes", "Federico García Lorca", "Johann Wolfgang von Goethe", "Hermann Hesse",
  "Thomas Mann", "Bertolt Brecht", "Virginia Woolf", "James Joyce", "William Shakespeare",
  "Emily Brontë", "Charlotte Brontë", "Harper Lee", "J. D. Salinger", "John Steinbeck",
  "F. Scott Fitzgerald", "William Faulkner", "Toni Morrison", "Cormac McCarthy", "Philip Roth",
  "Margaret Atwood", "Doris Lessing", "Aldous Huxley", "William Golding", "Anne Frank",
  "Khaled Hosseini", "Jonathan Safran Foer", "Don DeLillo", "Paul Auster", "Ian McEwan",
  "José Saramago", "Milan Kundera", "Yuval Noah Harari", "Stephen Hawking",
  "Carlo Rovelli", "Piero Angela", "Alessandro Barbero", "Jared Diamond", "Oliver Sacks",
  "Astrid Lindgren", "Rick Riordan", "Suzanne Collins", "Stephenie Meyer", "Jostein Gaarder",
  "Luis Sepúlveda", "Banana Yoshimoto", "Yasunari Kawabata", "Natsume Sōseki", "Yukio Mishima",
  "John Green", "Markus Zusak", "Cornelia Funke", "Philip Pullman", "Patrick Rothfuss",
  "Brandon Sanderson", "Andrzej Sapkowski", "Liu Cixin", "Ted Chiang", "Becky Chambers",
  "N. K. Jemisin", "Octavia Butler", "Joe Abercrombie", "Robin Hobb", "Terry Brooks",
  "Colleen Hoover", "Sally Rooney", "Elizabeth Strout", "Anne Tyler", "Alice Munro",
  "Chimamanda Ngozi Adichie", "Zadie Smith", "Han Kang", "Olga Tokarczuk", "Annie Ernaux",
  "Abdulrazak Gurnah", "Jon Fosse", "Elif Shafak", "Orhan Pamuk", "Amos Oz",
  "David Grossman", "Mario Vargas Llosa", "Julio Cortázar", "Roberto Bolaño", "Javier Marías",
  "Carlos Ruiz Zafón", "Arturo Pérez-Reverte", "Fernando Aramburu", "Delphine de Vigan",
  "Michel Houellebecq", "Emmanuel Carrère", "Laurent Binet", "Muriel Barbery", "Amélie Nothomb",
  "Daniel Pennac", "Fred Vargas", "Pierre Lemaitre", "Joël Dicker", "Bernhard Schlink",
  "Daniel Kehlmann", "Juli Zeh", "Ferdinand von Schirach", "Yu Hua"
];

/** I manga: di loro Open Library sa molto, ma sotto il titolo giapponese. */
const MANGAKA = [
  "Osamu Tezuka", "Eiichiro Oda", "Masashi Kishimoto", "Tite Kubo", "Akira Toriyama",
  "Hirohiko Araki", "Kentaro Miura", "Naoki Urasawa", "Rumiko Takahashi", "Takehiko Inoue",
  "Hajime Isayama", "Koyoharu Gotouge", "Gege Akutami", "Kohei Horikoshi", "Junji Ito",
  "Naoko Takeuchi", "CLAMP", "Sui Ishida", "Tatsuki Fujimoto", "Yoshihiro Togashi",
  "Kazuo Koike", "Jiro Taniguchi", "Inio Asano", "Makoto Yukimura", "Yukito Kishiro",
  "Katsuhiro Otomo", "Kiyohiko Azuma", "Hiromu Arakawa", "Tsugumi Ohba", "Nobuhiro Watsuki",
  "Yoshiyuki Sadamoto", "Ai Yazawa", "Fujiko F. Fujio", "Go Nagai", "Leiji Matsumoto",
  "Shotaro Ishinomori", "Moto Hagio", "Keiko Takemiya", "Taiyo Matsumoto", "Daisuke Igarashi",
  "Q Hayashida", "Yusuke Murata", "ONE", "Haruichi Furudate", "Yuki Tabata"
];

/** Gli argomenti da cui scendere in profondità. */
const ARGOMENTI = [
  "classic_literature", "juvenile_fiction", "adventure", "fantasy", "science_fiction",
  "detective_and_mystery_stories", "history", "biography", "poetry", "philosophy",
  "italian_literature", "humor", "horror", "science", "love_stories", "school_stories",
  "young_adult_fiction", "travel", "art", "psychology", "manga", "comics",
  "graphic_novels", "short_stories", "english_literature", "american_literature",
  "french_literature", "russian_literature", "japanese_literature", "german_literature",
  "spanish_literature", "drama", "essays", "letters", "fairy_tales", "mythology",
  "war_stories", "sea_stories", "western_stories", "spy_stories", "historical_fiction",
  "cooking", "music", "nature", "economics", "politics", "religion", "sports",
  "architecture", "photography"
];

const CAMPI = "key,title,author_name,first_publish_year,number_of_pages_median,cover_i," +
  "edition_count,language,ebook_access,ia";
const CAMPI_TRADOTTI = CAMPI + ",editions,editions.title,editions.language";

/* ==================================================== gli attrezzi ====== */

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizza = (s) => String(s || "")
  .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const cognomeDi = (nome) => normalizza(nome).split(" ").pop() || "";

/**
 * Le lettere con cui si scrivono i titoli italiani e inglesi (più gli accenti
 * di francese, spagnolo e tedesco, che nei classici capitano). Fuori restano
 * il giapponese e il cirillico, ma anche le vocali storte del polacco e del
 * ceco — e con loro i titoli arrivati storti dalla codifica, che si
 * riconoscono proprio da quelle.
 */
const LATINO = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9\s.,:;!?'’"“”()\[\]&+*%°#@$€£§–—\-…\/\\]+$/;
/** Nomi propri: più larghi, perché «Sōseki» e «Čechov» sono nomi veri. */
const NOME_LATINO = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\p{Zs}]+$/u;
const latino = (s) => Boolean(s) && LATINO.test(s);
const nomeLatino = (s) => Boolean(s) && NOME_LATINO.test(s);

/** Apparati e sussidi: chi cerca un romanzo non cerca la guida al romanzo. */
const NON_E_UN_LIBRO =
  /\b(sparknotes|cliffsnotes|study guide|studienf|summary of|analysis of|teacher'?s|workbook|lesson plans|quiz|audiobook|boxed set|box set|ediz\. illustrata)\b/i;

/** Le voci di servizio di Gutenberg, che non sono libri. */
const SERVIZIO_GUTENBERG =
  /^(index of the project gutenberg|the project gutenberg|reader's guide|contents of)/i;

/**
 * I fascicoli di rivista. Gutenberg ne ha digitalizzate a migliaia, numero per
 * numero: «Punch, Vol. 156, No. 4» è una cosa vera, ma non è un libro da
 * mettere in lettura, e in mezzo ai romanzi sono solo rumore.
 */
const FASCICOLO =
  /\b(vol(ume)?\.?\s*[\divxlc]+\s*,?\s*(no|number|issue|part)\.?\s*\d|no\.\s*\d+\s*,\s*(january|february|march|april|may|june|july|august|september|october|november|december)|charivari|notes and queries|scientific american|the atlantic monthly|blackwood's|harper's new monthly|the american missionary|bird-lore|punch,)/i;

async function chiedi(url, tentativi = 4) {
  for (let i = 0; i < tentativi; i++) {
    try {
      const risposta = await fetch(url, { redirect: "follow" });
      if (risposta.ok) return await risposta.json();
      if (risposta.status !== 429 && risposta.status < 500) return null;
    } catch (err) { /* rete: si riprova */ }
    await attendi(1500 * (i + 1));
  }
  return null;
}

/**
 * Le edizioni si portano dietro la coda del catalogo dell'editore: «Il giovane
 * Holden. Ediz. speciale», «Il nome della rosa (Super ET)». Qui interessa il
 * titolo, non la confezione.
 */
function ripulisci(titolo) {
  return String(titolo || "")
    .replace(/\s+/g, " ")
    .replace(/\s*[.,]?\s*(ediz\.?|edizione|nuova ed\.?|testo .*|con .*|seguito .*)\s*[^,]*$/i, "")
    .replace(/\s*\((?:[^()]*(?:ed\.|ediz|collana|super|oscar|classici|illustrat|integrale)[^()]*)\)\s*$/i, "")
    .replace(/\s*\[[^\]]*\]\s*$/, "")
    // Una parentesi rimasta aperta è quello che avanza quando la coda tagliata
    // stava dentro le parentesi: «1984. Millenovecentoottantaquattro (».
    .replace(/\s*[(\[]\s*$/, "")
    .replace(/\s{2,}/g, " ").replace(/[\s.,;:]+$/, "").trim();
}

/**
 * Due nomi che indicano la stessa persona non si scrivono allo stesso modo:
 * fra «Dostoevskij» e «Dostoyevsky» c'è di mezzo la traslitterazione. Si
 * confrontano le prime lettere — quante ne ha la più corta, non più di cinque,
 * così «J.» ritrova «John» senza che «King» diventi «Kingsley».
 */
function simili(a, b) {
  const n = Math.min(5, a.length, b.length);
  return n > 0 && a.slice(0, n) === b.slice(0, n);
}

/**
 * Quale dei nomi restituiti da Open Library è l'autore che cercavamo.
 *
 * Serve perché la ricerca per autore è generosa: chiedendo Stephen King
 * restituisce anche le «Metamorfosi» di Ovidio, la cui scheda elenca duecento
 * fra curatori e traduttori — e fra duecento nomi un «Henry King» c'è sempre.
 * Quindi si guarda solo in testa all'elenco, dove sta chi il libro l'ha
 * scritto; e quando l'elenco è affollato si pretende il nome intero.
 */
function combacia(autori, atteso) {
  const cercate = normalizza(atteso).split(" ").filter(Boolean);
  const cognome = cercate[cercate.length - 1] || "";
  if (!cognome) return null;
  const affollato = autori.length > 3;
  for (const nome of autori.slice(0, 5)) {
    const pezzi = normalizza(nome).split(" ").filter(Boolean);
    // Nome in caratteri non latini (村上春樹, Лев Толстой): non c'è niente da
    // confrontare, ma su una scheda non affollata la ricerca per autore di
    // Open Library è inequivocabile.
    if (!pezzi.length) { if (!affollato) return nome; continue; }
    if (cercate.every((c) => pezzi.some((p) => simili(p, c)))) return nome;
    if (!affollato && pezzi.some((p) => simili(p, cognome))) return nome;
  }
  return null;
}

/* ================================================== il magazzino ======== */

const libri = new Map();   // chiave -> riga

const T = 0, A = 1, ANNO = 2, PAGINE = 3, COPERTINA = 4, OPERA = 5,
      EDIZIONI = 6, ALTRO = 7, LETTURA = 8, SCAFFALE = 9;

/**
 * Mette una riga in magazzino, o la fonde con quella che c'è già.
 *
 * La fusione è il punto in cui le tre fonti si aiutano: la scheda di Open
 * Library porta copertina, anno e numero di edizioni; Gutenberg porta il link
 * per leggere. Un libro che arriva da tutte due esce con entrambi.
 */
function deposita(riga) {
  if (!riga[T] || !riga[A]) return;
  const chiave = riga[OPERA] ? "w:" + riga[OPERA]
    : "t:" + normalizza(riga[T]) + "|" + cognomeDi(riga[A]);
  // La chiave per titolo serve anche a ritrovare una scheda depositata prima
  // con la chiave dell'opera: senza questo, Gutenberg e Open Library non si
  // incontrerebbero mai.
  const perTitolo = "t:" + normalizza(riga[T]) + "|" + cognomeDi(riga[A]);
  const esistente = libri.get(chiave) || libri.get(perTitolo);

  if (!esistente) {
    libri.set(chiave, riga);
    if (chiave !== perTitolo) libri.set(perTitolo, riga);
    return;
  }
  if (!latino(esistente[T]) && latino(riga[T])) esistente[T] = riga[T];
  for (const i of [ANNO, PAGINE, COPERTINA, EDIZIONI]) {
    if (!esistente[i] && riga[i]) esistente[i] = riga[i];
  }
  for (const i of [OPERA, ALTRO, LETTURA, SCAFFALE]) {
    if (!esistente[i] && riga[i]) esistente[i] = riga[i];
  }
  if (riga[OPERA] && !libri.has("w:" + riga[OPERA])) libri.set("w:" + riga[OPERA], esistente);
}

/* ============================ 1. Project Gutenberg ====================== */

/**
 * Da «Verona, Guido da, 1881-1939» a «Guido da Verona».
 *
 * Il campo di Gutenberg è un elenco: l'autore, poi traduttori e curatori, ogni
 * nome seguito dalle date e a volte dal ruolo. Le date vanno via prima di
 * girare il cognome, altrimenti finiscono al posto del nome di battesimo — è
 * così che nasce un autore chiamato «385 BCE-323 BCE Aristotle».
 */
function nomeGutenberg(grezzo) {
  let nome = String(grezzo || "").split(";")[0].trim();
  nome = nome.replace(/\s*\[[^\]]*\]/g, "");                     // [Translator]
  nome = nome.replace(/,\s*active[^,]*$/i, "");                  // active 6th century B.C.
  nome = nome.replace(/,\s*-?\d{1,4}\??\s*(?:bce|b\.c\.|bc|ce|a\.d\.)?\s*(?:-\s*\d{0,4}\??\s*(?:bce|b\.c\.|bc|ce|a\.d\.)?)?\s*$/i, "");
  nome = nome.replace(/,\s*(baron(ess)?|sir|dame|lord|lady|count(ess)?|jr\.?|sr\.?|iii?|of [^,]+)\s*$/i, "");
  nome = nome.replace(/\s*\([^)]*\)/g, "");                       // (John Greenleaf)
  nome = nome.replace(/\s{2,}/g, " ").replace(/[,\s]+$/, "").trim();
  if (/^(anonymous|unknown)$/i.test(nome)) return "Anonimo";
  if (/^various$/i.test(nome)) return "Autori vari";
  const virgola = nome.indexOf(",");
  if (virgola > 0) {
    const cognome = nome.slice(0, virgola).trim();
    const resto = nome.slice(virgola + 1).replace(/,.*$/, "").trim();
    nome = resto ? `${resto} ${cognome}` : cognome;
  }
  // «Lytton, Edward Bulwer Lytton» girato diventa «Edward Bulwer Lytton
  // Lytton»: il cognome ripetuto in coda si toglie.
  const parole = nome.split(" ");
  if (parole.length > 2 && parole[parole.length - 1] === parole[parole.length - 2]) parole.pop();
  return parole.join(" ").replace(/\s{2,}/g, " ").trim();
}

/**
 * Il titolo, senza il sottotitolo.
 *
 * Gutenberg mette il sottotitolo su una seconda riga dentro lo stesso campo.
 * Unirle dà «A Ticket to Adventure A Mystery Story for Girls»; prendere solo
 * la prima dà «A Ticket to Adventure», che è come il libro si chiama.
 */
function titoloGutenberg(grezzo) {
  let t = String(grezzo || "").split("\n")[0].replace(/\s+/g, " ").trim();
  if (t.length > 90) {
    const taglio = t.slice(0, 90);
    const stop = Math.max(taglio.lastIndexOf(": "), taglio.lastIndexOf("; "), taglio.lastIndexOf(", "));
    t = stop > 30 ? taglio.slice(0, stop) : taglio.replace(/\s\S*$/, "");
  }
  return ripulisci(t);
}

/** Un CSV senza dipendenze: virgolette doppie, a capo dentro i campi. */
function leggiCsv(testo) {
  const righe = [];
  let campo = "";
  let riga = [];
  let dentro = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (dentro) {
      if (c === '"') {
        if (testo[i + 1] === '"') { campo += '"'; i++; }
        else dentro = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { dentro = true; continue; }
    if (c === ",") { riga.push(campo); campo = ""; continue; }
    if (c === "\n") { riga.push(campo); righe.push(riga); riga = []; campo = ""; continue; }
    if (c !== "\r") campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  return righe;
}

async function daGutenberg() {
  const copia = resolve(root, "tools/.pg_catalog.csv");
  let testo;
  if (existsSync(copia)) {
    testo = readFileSync(copia, "utf8");
    console.log("Gutenberg: uso la copia già scaricata in tools/.pg_catalog.csv");
  } else {
    console.log("Gutenberg: scarico il catalogo (una ventina di MB)…");
    const risposta = await fetch(GUTENBERG_CSV, { redirect: "follow" });
    if (!risposta.ok) { console.log(`  non risponde (${risposta.status}), salto`); return 0; }
    testo = await risposta.text();
    writeFileSync(copia, testo);
  }

  const righe = leggiCsv(testo);
  const testa = righe.shift().map((c) => c.trim());
  const col = (nome) => testa.indexOf(nome);
  const iId = col("Text#"), iTipo = col("Type"), iTitolo = col("Title"),
        iLingua = col("Language"), iAutori = col("Authors"), iArgomenti = col("Subjects");

  let messi = 0;
  for (const r of righe) {
    if (r[iTipo] !== "Text") continue;
    const lingua = String(r[iLingua] || "").trim();
    if (lingua !== "en" && lingua !== "it") continue;

    const titolo = titoloGutenberg(r[iTitolo]);
    if (!titolo || !latino(titolo)) continue;
    if (SERVIZIO_GUTENBERG.test(titolo) || NON_E_UN_LIBRO.test(titolo)) continue;
    if (FASCICOLO.test(titolo)) continue;

    const autore = nomeGutenberg(r[iAutori]);
    if (!autore || !nomeLatino(autore)) continue;

    const riga = [titolo, autore, 0, 0, 0, "", 0, "", "g" + String(r[iId]).trim(),
                  scaffaleDi(r[iArgomenti] || "")];
    deposita(riga);
    messi++;
  }
  console.log(`Gutenberg: ${messi} opere di dominio pubblico, tutte da leggere gratis.\n`);
  return messi;
}

/* =========================== 2. Open Library per autore ================= */

const cerca = (parametri) => chiedi(`${OPEN_LIBRARY}/search.json?${parametri}`);

function daScheda(doc, autoreAtteso, tradotto) {
  const canonico = ripulisci(doc.title);
  const italiano = ripulisci(tradotto);
  if (!canonico || NON_E_UN_LIBRO.test(canonico) || NON_E_UN_LIBRO.test(italiano)) return;

  // Titolo da mostrare: quello con cui l'opera è archiviata, se si legge; se è
  // in caratteri che qui nessuno cercherebbe, quello dell'edizione tradotta.
  const titolo = latino(canonico) ? canonico : (latino(italiano) ? italiano : "");
  if (!titolo || titolo.length > 90) return;
  // L'altro titolo resta cercabile: chi digita «Il giovane Holden» deve
  // trovare «The Catcher in the Rye», e chi digita «Invisible Cities» deve
  // arrivare a «Le città invisibili».
  const altro = (latino(italiano) && normalizza(italiano) !== normalizza(titolo)
    && italiano.length <= 90) ? italiano : "";

  const autori = doc.author_name || [];
  let autore;
  if (autoreAtteso) {
    if (!combacia(autori, autoreAtteso)) return;
    // Il nome cercato è quello che il lettore conosce e scriverà: «Lev
    // Tolstoj», non «Лев Толстой».
    autore = autoreAtteso;
  } else {
    autore = (autori.find(nomeLatino) || "").trim();
  }
  if (!autore) return;

  // Le opere senza edizioni in italiano o in inglese riempirebbero il catalogo
  // di titoli che qui nessuno cerca.
  const lingue = doc.language || [];
  if (lingue.length && !lingue.includes("ita") && !lingue.includes("eng") && !altro) return;

  // Quando Internet Archive la dà per intera, si può leggere subito.
  const archivio = doc.ebook_access === "public" && (doc.ia || [])[0];

  deposita([
    titolo,
    autore,
    doc.first_publish_year || 0,
    doc.number_of_pages_median || 0,
    doc.cover_i || 0,
    String(doc.key || "").replace("/works/", ""),
    // Il numero di edizioni è il segnale più onesto di quanto un'opera sia
    // nota: serve a mettere «It» davanti a una raccolta di saggi.
    doc.edition_count || 0,
    altro,
    archivio ? "a" + archivio : "",
    0
  ]);
}

async function perAutore(elenco, ancheInglese, etichetta) {
  let fatti = 0;
  for (const autore of elenco) {
    const nome = encodeURIComponent(autore);
    const prima = libri.size;

    const generale = await cerca(`author=${nome}&limit=${PER_AUTORE}&sort=editions&fields=${CAMPI}`);
    if (generale && generale.docs) for (const doc of generale.docs) daScheda(doc, autore, "");
    await attendi(PAUSA);

    // Le stesse opere viste dall'Italia, col titolo che hanno in libreria qui.
    // È il giro che salva Murakami, Tolstoj e Dostoevskij.
    for (const lingua of ancheInglese ? ["ita", "eng"] : ["ita"]) {
      const tradotte = await cerca(
        `author=${nome}&limit=${PER_AUTORE}&sort=editions&language=${lingua}&fields=${CAMPI_TRADOTTI}`);
      if (tradotte && tradotte.docs) {
        for (const doc of tradotte.docs) {
          const edizioni = (doc.editions && doc.editions.docs) || [];
          const scelta = edizioni.find((e) => (e.language || []).includes(lingua)) || edizioni[0] || {};
          daScheda(doc, autore, scelta.title || "");
        }
      }
      await attendi(PAUSA);
    }

    fatti++;
    console.log(`  ${etichetta} ${String(fatti).padStart(3)}/${elenco.length}  ` +
      `${autore.padEnd(28)} +${libri.size - prima}`);
  }
}

/* ======================== 3. Open Library per argomento ================= */

async function perArgomento() {
  let fatti = 0;
  for (const argomento of ARGOMENTI) {
    const prima = libri.size;
    for (let pagina = 0; pagina < PAGINE_PER_ARGOMENTO; pagina++) {
      const dati = await chiedi(`${OPEN_LIBRARY}/subjects/${argomento}.json` +
        `?limit=${PER_PAGINA}&offset=${pagina * PER_PAGINA}`);
      if (!dati || !dati.works || !dati.works.length) { await attendi(PAUSA); break; }
      for (const opera of dati.works) {
        daScheda({
          key: opera.key,
          title: opera.title,
          author_name: (opera.authors || []).map((a) => a.name),
          first_publish_year: opera.first_publish_year,
          cover_i: opera.cover_id,
          edition_count: opera.edition_count,
          language: [],                  // gli scaffali non riportano le lingue
          ebook_access: opera.ebook_count_i > 0 ? "public" : "",
          ia: opera.ia ? [opera.ia] : []
        }, null, "");
      }
      await attendi(PAUSA);
    }
    fatti++;
    console.log(`  argomento ${String(fatti).padStart(2)}/${ARGOMENTI.length}  ` +
      `${argomento.padEnd(30)} +${libri.size - prima}`);
  }
}

/* ============================== si parte =============================== */

await daGutenberg();

if (!soloGutenberg) {
  console.log(`Open Library: ${AUTORI.length} autori, ${MANGAKA.length} mangaka, ` +
    `${ARGOMENTI.length} argomenti.\n`);
  await perAutore(AUTORI, false, "autore ");
  await perAutore(MANGAKA, true, "manga  ");
  await perArgomento();
}

/* ====================== l'ultima cucitura fra le fonti ================= */

/**
 * Attacca il link per leggere alle schede che non ce l'hanno.
 *
 * Open Library scheda «Moby Dick»; Gutenberg lo chiama «Moby-Dick; or, The
 * Whale». Sono lo stesso libro, ma i titoli non combaciano e la fusione fatta
 * mentre si raccoglie non li incontra: la scheda ricca — copertina, anno,
 * milleduecento edizioni — resta senza il testo, che invece c'è.
 *
 * Qui si riprova confrontando il titolo principale, quello prima dei due
 * punti o del punto e virgola. I volumi si lasciano fuori: «Mardi, Vol. 1» e
 * «Mardi, Vol. 2» hanno lo stesso titolo principale e non sono lo stesso
 * libro.
 */
const VOLUME = /\b(vol|volume|part|parte|tomo|libro)\.?\s*[\divxlc]+\b|\(\s*of\s+\d+\s*\)/i;

const titoloPrincipale = (t) =>
  normalizza(String(t || "").split(/[;:(\[]/)[0]).split(" ").slice(0, 8).join(" ");

function cuciLetture() {
  const perTitoloBreve = new Map();
  for (const r of [...libri.values()]) {
    if (!r[LETTURA] || VOLUME.test(r[T])) continue;
    const chiave = titoloPrincipale(r[T]) + "|" + cognomeDi(r[A]);
    if (chiave.length > 2 && !perTitoloBreve.has(chiave)) perTitoloBreve.set(chiave, r[LETTURA]);
  }

  let cuciti = 0;
  for (const r of new Set(libri.values())) {
    if (r[LETTURA] || VOLUME.test(r[T])) continue;
    const trovato = perTitoloBreve.get(titoloPrincipale(r[T]) + "|" + cognomeDi(r[A]));
    if (!trovato) continue;
    r[LETTURA] = trovato;
    cuciti++;
  }
  console.log(`\nLetture attaccate a schede che non le avevano: ${cuciti}`);
}

cuciLetture();

/* ============================== si scrive ============================== */

// Il Map tiene due chiavi per riga (per opera e per titolo): la stessa riga va
// contata una volta sola.
const righe = [...new Set(libri.values())];

// I nomi degli autori si ripetono migliaia di volte. Scritti una volta in un
// elenco a parte e richiamati per numero, il file perde centinaia di kB — su
// un catalogo che viaggia dentro la pagina è la differenza fra scaricarlo e no.
const indiceAutori = new Map();
const elencoAutori = [];
for (const r of righe) {
  if (!indiceAutori.has(r[A])) { indiceAutori.set(r[A], elencoAutori.length); elencoAutori.push(r[A]); }
  r[A] = indiceAutori.get(r[A]);
}

const perAutorePoiEdizioni = (a, b) =>
  elencoAutori[a[A]].localeCompare(elencoAutori[b[A]], "it") ||
  (b[EDIZIONI] || 0) - (a[EDIZIONI] || 0) ||
  String(a[T]).localeCompare(String(b[T]), "it");

/**
 * Due elenchi, perché i dati hanno due nature.
 *
 * Una scheda di Open Library porta copertina, anno, pagine e numero di
 * edizioni. Un'opera di Gutenberg porta il titolo, l'autore e il link per
 * leggerla: scritta nello stesso formato sarebbe mezza riga di zeri, e sono
 * dodici caratteri di niente per sessantamila righe.
 */
const schede = righe.filter((r) => r[OPERA] || r[COPERTINA] || r[EDIZIONI] || r[ANNO]);
const inScheda = new Set(schede);
const liberi = righe.filter((r) => !inScheda.has(r) && r[LETTURA]);

schede.sort(perAutorePoiEdizioni);
liberi.sort(perAutorePoiEdizioni);

// Le ultime colonne sono vuote quasi sempre: togliere quelle finali vale
// decine di kB.
const compatte = schede.map((r) => {
  let fine = r.length;
  while (fine > 2 && !r[fine - 1]) fine--;
  return r.slice(0, fine);
});

// Di un'opera di dominio pubblico bastano quattro cose. Il numero è quello di
// Gutenberg: l'app ne ricava l'indirizzo per leggerla.
const compatteLibere = liberi.map((r) => {
  const riga = [r[T], r[A], Number(String(r[LETTURA]).slice(1)) || 0, r[SCAFFALE] || 0];
  return riga[3] ? riga : riga.slice(0, 3);
});

const daLeggere = schede.filter((r) => r[LETTURA]).length + liberi.length;
const totale = schede.length + liberi.length;

const file = `/**
 * Il catalogo che viaggia dentro l'app.
 *
 * Generato da tools/aggiorna-catalogo.mjs: non va modificato a mano. Serve
 * quando la pagina non può interrogare il catalogo online — senza rete, o dove
 * non ha il permesso di uscire, come nella versione pubblicata come artifact.
 *
 * Le fonti sono tre: Project Gutenberg per il dominio pubblico (da cui viene
 * il grosso degli autori poco noti, e tutti i link per leggere gratis), Open
 * Library per autore e Open Library per argomento, scavando in profondità.
 *
 * CATALOGO_AUTORI elenca i nomi una volta sola; le righe li richiamano per
 * numero.
 *
 * CATALOGO sono le schede di Open Library:
 *
 *   [titolo, autore, anno, pagine, copertina, opera, edizioni, altro titolo,
 *    lettura, scaffale]
 *
 * Gli zeri e le stringhe vuote stanno per «non si sa», e le ultime colonne
 * possono mancare del tutto. «opera» è la chiave su Open Library, che permette
 * di ritrovarla quando la rete c'è. «edizioni» è quante volte è stata
 * pubblicata, il segnale più onesto di quanto sia nota. «altro titolo» c'è
 * quando il libro gira anche con un altro nome, così «Il giovane Holden» trova
 * «The Catcher in the Rye». «lettura» è dove leggerla gratis: «g» più un
 * numero è Project Gutenberg, «a» più un codice è Internet Archive.
 * «scaffale» è la posizione in Books.SHELVES, più uno.
 *
 * CATALOGO_LIBERI sono le opere di dominio pubblico di Project Gutenberg, che
 * di colonne ne hanno bisogno di quattro:
 *
 *   [titolo, autore, numero su Gutenberg, scaffale]
 *
 * Opere: ${totale} di ${elencoAutori.length} autori — ${schede.length} schede e
 * ${liberi.length} opere libere. ${daLeggere} si possono leggere gratis.
 * Aggiornato il ${new Date().toISOString().slice(0, 10)}.
 */
const CATALOGO_AUTORI = ${JSON.stringify(elencoAutori)};
const CATALOGO = ${JSON.stringify(compatte)};
const CATALOGO_LIBERI = ${JSON.stringify(compatteLibere)};
`;

writeFileSync(resolve(root, "js/catalogo.js"), file);
console.log(`\njs/catalogo.js — ${totale} opere di ${elencoAutori.length} autori`);
console.log(`  ${schede.length} schede da Open Library, ${liberi.length} opere libere da Gutenberg`);
console.log(`  ${daLeggere} da leggere gratis`);
console.log(`  ${(Buffer.byteLength(file) / 1024 / 1024).toFixed(2)} MB`);
