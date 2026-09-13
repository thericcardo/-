/**
 * Rigenera il catalogo che viaggia dentro l'app (js/catalogo.js).
 *
 *   node tools/aggiorna-catalogo.mjs
 *
 * L'app interroga Open Library dal vivo, ma in due situazioni non può:
 * quando manca la rete, e quando la pagina non ha il permesso di uscire —
 * succede nella versione pubblicata come artifact. Lì resta solo quello che
 * il file si porta dietro, e un pugno di titoli non è una libreria.
 *
 * Questo strumento scarica le opere più pubblicate di un elenco di autori e
 * le più note di un elenco di argomenti, e le impacchetta in un file compatto.
 * Va rilanciato quando si vuole aggiornare o allargare il catalogo.
 *
 * Tre accortezze imparate sul campo:
 *
 *   - Open Library limita le richieste: si va piano, con attese e ritentativi.
 *   - La ricerca per autore è approssimativa e restituisce anche opere di
 *     altri: si tiene solo quello che porta davvero il nome giusto.
 *   - Open Library archivia ogni opera con il titolo originale. Di Murakami
 *     trova «海辺のカフカ», di Tolstoj «Анна Каренина»: illeggibili qui, e
 *     soprattutto impossibili da cercare. Per questo di ogni autore si fa un
 *     secondo giro chiedendo le edizioni italiane, che restituiscono il
 *     titolo con cui il libro si trova in libreria.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OPEN_LIBRARY = "https://openlibrary.org";
const PER_AUTORE = 50;
const PER_ARGOMENTO = 80;
const PAUSA = 1100;

/** Gli autori che un lettore italiano cerca davvero. */
const AUTORI = [
  // italiani, dai banchi di scuola agli scaffali delle novità
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
  "José Saramago", "Milan Kundera", "Umberto Galimberti", "Yuval Noah Harari", "Stephen Hawking",
  "Carlo Rovelli", "Piero Angela", "Alessandro Barbero", "Jared Diamond", "Oliver Sacks",
  "Astrid Lindgren", "Rick Riordan", "Suzanne Collins", "Stephenie Meyer", "Jostein Gaarder",
  "Luis Sepúlveda", "Banana Yoshimoto", "Yasunari Kawabata", "Natsume Sōseki", "Yukio Mishima",
  "Rick Warren", "John Green", "Markus Zusak", "Cornelia Funke", "Philip Pullman",
  "Patrick Rothfuss", "Brandon Sanderson", "Andrzej Sapkowski", "Liu Cixin", "Ted Chiang"
];

/** Argomenti da cui pescare qualche classico in più. */
const ARGOMENTI = [
  "classic_literature", "juvenile_fiction", "adventure", "fantasy", "science_fiction",
  "detective_and_mystery_stories", "history", "biography", "poetry", "philosophy",
  "italian_literature", "humor", "horror", "science", "love_stories", "school_stories",
  "young_adult_fiction", "travel", "art", "psychology"
];

const CAMPI = "key,title,author_name,first_publish_year,number_of_pages_median,cover_i,edition_count,language";
const CAMPI_IT = CAMPI + ",editions,editions.title,editions.language";

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizza = (s) => String(s || "")
  .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

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

async function chiedi(url, tentativi = 4) {
  for (let i = 0; i < tentativi; i++) {
    try {
      const risposta = await fetch(url);
      if (risposta.ok) return await risposta.json();
      if (risposta.status !== 429 && risposta.status < 500) return null;
    } catch (err) { /* rete: si riprova */ }
    await attendi(1500 * (i + 1));
  }
  return null;
}

/**
 * Le edizioni italiane si portano dietro la coda del catalogo dell'editore:
 * «Il giovane Holden. Ediz. speciale», «Il nome della rosa (Super ET)».
 * Qui interessa il titolo, non la confezione.
 */
function ripulisci(titolo) {
  return String(titolo || "")
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
 * confrontano le prime lettere — quante ne ha la più corta, non più di
 * cinque, così «J.» ritrova «John» senza che «King» diventi «Kingsley».
 */
function simili(a, b) {
  const n = Math.min(5, a.length, b.length);
  return n > 0 && a.slice(0, n) === b.slice(0, n);
}

/**
 * Quale dei nomi restituiti da Open Library è l'autore che cercavamo.
 *
 * Serve perché la ricerca per autore è generosa: chiedendo Stephen King
 * restituisce anche le «Metamorfosi» di Ovidio, la cui scheda elenca
 * duecento fra curatori e traduttori — e fra duecento nomi un «Henry King»
 * c'è sempre. Quindi si guarda solo in testa all'elenco, dove sta chi il
 * libro l'ha scritto; e quando l'elenco è affollato si pretende il nome
 * intero, non il solo cognome.
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

const libri = new Map();   // chiave -> riga

/**
 * @param doc          il documento di Open Library
 * @param autoreAtteso il nome con cui l'abbiamo cercato (null per gli argomenti)
 * @param tradotto     il titolo dell'edizione italiana, se lo conosciamo
 */
function aggiungi(doc, autoreAtteso, tradotto) {
  const canonico = ripulisci(doc.title);
  const italiano = ripulisci(tradotto);
  if (!canonico || NON_E_UN_LIBRO.test(canonico) || NON_E_UN_LIBRO.test(italiano)) return;

  // Titolo da mostrare: quello con cui l'opera è archiviata, se si legge; se
  // è in caratteri che qui nessuno cercherebbe, quello dell'edizione italiana.
  let titolo = latino(canonico) ? canonico : (latino(italiano) ? italiano : "");
  if (!titolo || titolo.length > 90) return;
  // L'altro titolo resta cercabile: chi digita «Il giovane Holden» deve
  // trovare «The Catcher in the Rye», e chi digita «Invisible Cities» deve
  // arrivare a «Le città invisibili».
  let altro = "";
  if (latino(italiano) && normalizza(italiano) !== normalizza(titolo) && italiano.length <= 90) {
    altro = italiano;
  }

  const autori = doc.author_name || [];
  let autore;
  if (autoreAtteso) {
    if (!combacia(autori, autoreAtteso)) return;
    // Il nome cercato è quello che il lettore italiano conosce e scriverà:
    // «Lev Tolstoj», non «Лев Толстой».
    autore = autoreAtteso;
  } else {
    autore = (autori.find(nomeLatino) || "").trim();
  }
  if (!autore) return;

  // Le opere senza edizioni in italiano o in inglese riempirebbero il
  // catalogo di titoli che qui nessuno cerca.
  const lingue = doc.language || [];
  if (lingue.length && !lingue.includes("ita") && !lingue.includes("eng") && !altro) return;

  const opera = String(doc.key || "").replace("/works/", "");
  const chiave = opera || normalizza(titolo) + "|" + normalizza(autore).split(" ").pop();
  const riga = [
    titolo,
    autore,
    doc.first_publish_year || 0,
    doc.number_of_pages_median || 0,
    doc.cover_i || 0,
    opera,
    // Il numero di edizioni è il segnale più onesto di quanto un'opera sia
    // nota: serve a mettere «It» davanti a una raccolta di saggi.
    doc.edition_count || 0,
    altro
  ];

  const esistente = libri.get(chiave);
  if (!esistente) { libri.set(chiave, riga); return; }
  // Stessa opera incontrata due volte: si tiene la riga più informativa e non
  // si perde per strada il titolo italiano raccolto nel secondo giro.
  if (!esistente[7] && altro) esistente[7] = altro;
  if (!latino(esistente[0]) && latino(titolo)) esistente[0] = titolo;
  for (const i of [2, 3, 4, 6]) if (!esistente[i] && riga[i]) esistente[i] = riga[i];
}

const cerca = (parametri) => chiedi(`${OPEN_LIBRARY}/search.json?${parametri}`);

console.log(`Scarico le opere di ${AUTORI.length} autori e ${ARGOMENTI.length} argomenti.\n`);

let fatti = 0;
for (const autore of AUTORI) {
  const nome = encodeURIComponent(autore);
  const prima = libri.size;

  // Primo giro: le opere più pubblicate, come Open Library le archivia.
  const generale = await cerca(`author=${nome}&limit=${PER_AUTORE}&sort=editions&fields=${CAMPI}`);
  if (generale && generale.docs) for (const doc of generale.docs) aggiungi(doc, autore, "");
  await attendi(PAUSA);

  // Secondo giro: le stesse opere viste dall'Italia, col titolo che hanno in
  // libreria qui. È il giro che salva Murakami, Tolstoj e Dostoevskij.
  const itagliano = await cerca(
    `author=${nome}&limit=${PER_AUTORE}&sort=editions&language=ita&fields=${CAMPI_IT}`);
  if (itagliano && itagliano.docs) {
    for (const doc of itagliano.docs) {
      const edizioni = (doc.editions && doc.editions.docs) || [];
      const it = edizioni.find((e) => (e.language || []).includes("ita")) || edizioni[0] || {};
      aggiungi(doc, autore, it.title || "");
    }
  }

  fatti++;
  console.log(`  ${String(fatti).padStart(3)}/${AUTORI.length}  ${autore.padEnd(30)} +${libri.size - prima}`);
  await attendi(PAUSA);
}

for (const argomento of ARGOMENTI) {
  const dati = await chiedi(`${OPEN_LIBRARY}/subjects/${argomento}.json?limit=${PER_ARGOMENTO}`);
  const prima = libri.size;
  if (dati && dati.works) {
    for (const opera of dati.works) {
      aggiungi({
        key: opera.key,
        title: opera.title,
        author_name: (opera.authors || []).map((a) => a.name),
        first_publish_year: opera.first_publish_year,
        cover_i: opera.cover_id,
        edition_count: opera.edition_count,
        language: []      // gli scaffali non riportano le lingue
      }, null, "");
    }
  }
  console.log(`  argomento ${argomento.padEnd(30)} +${libri.size - prima}`);
  await attendi(PAUSA);
}

const righe = [...libri.values()].sort((a, b) =>
  a[1].localeCompare(b[1], "it") || b[6] - a[6] || a[0].localeCompare(b[0], "it"));

// L'ottava colonna è vuota quasi ovunque: toglierla dalle righe che non ce
// l'hanno vale decine di kB su un file che viaggia con l'app.
const compatte = righe.map((r) => (r[7] ? r : r.slice(0, 7)));
const autori = new Set(righe.map((r) => r[1])).size;
const tradotte = righe.filter((r) => r[7]).length;

const file = `/**
 * Il catalogo che viaggia dentro l'app.
 *
 * Generato da tools/aggiorna-catalogo.mjs con i dati di Open Library: non va
 * modificato a mano. Serve quando la pagina non può interrogare il catalogo
 * online — senza rete, o dove non ha il permesso di uscire, come nella
 * versione pubblicata come artifact.
 *
 * Ogni riga è [titolo, autore, anno, pagine, copertina, opera, edizioni,
 * altro titolo]; gli zeri stanno per «non si sa» e le ultime colonne possono
 * mancare. «opera» è la chiave su Open Library, che permette di ritrovarla
 * quando la rete c'è; «edizioni» è quante volte è stata pubblicata, il
 * segnale più onesto di quanto sia nota; «altro titolo» c'è quando il libro
 * gira anche con un altro nome, così «Il giovane Holden» trova «The Catcher
 * in the Rye» e «Invisible Cities» arriva a «Le città invisibili».
 *
 * Opere: ${righe.length} di ${autori} autori, ${tradotte} con un secondo titolo.
 * Aggiornato il ${new Date().toISOString().slice(0, 10)}.
 */
const CATALOGO = ${JSON.stringify(compatte)};
`;

writeFileSync(resolve(root, "js/catalogo.js"), file);
console.log(`\njs/catalogo.js — ${righe.length} opere di ${autori} autori ` +
  `(${tradotte} con un secondo titolo), ${(Buffer.byteLength(file) / 1024).toFixed(0)} kB`);
