/**
 * Controlla il catalogo che viaggia dentro l'app.
 *
 *   node tools/controlla-catalogo.mjs
 *
 * Carica js/books.js come lo caricherebbe il browser, ma senza rete: è la
 * condizione della versione pubblicata come artifact, dove la pagina non ha
 * il permesso di chiamare servizi esterni e resta solo il catalogo interno.
 *
 * Le prove qui sotto nascono da segnalazioni vere:
 *
 *   «voglio vedere i libri di Stephen King ma mi dice che c'è un errore»
 *   «se scrivo Italo Calvino mi dà 4 libri»
 *   «mi scrive anche La coscienza di Zeno, che è di Italo Svevo»
 *
 * Chi allarga o rigenera il catalogo lo rilancia: dice subito se una ricerca
 * ha smesso di funzionare.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* Quel tanto di browser che serve a books.js per caricarsi, e niente rete. */
globalThis.window = globalThis;
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.location = { href: "file:///", origin: "null" };
Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
globalThis.fetch = () => Promise.reject(new Error("nessuna rete, come nell'artifact"));

const leggi = (f) => readFileSync(resolve(root, f), "utf8");
const catalogo = leggi("js/catalogo.js");
globalThis.CATALOGO_AUTORI = (0, eval)(catalogo + "; CATALOGO_AUTORI");
globalThis.CATALOGO = (0, eval)(catalogo + "; CATALOGO");
globalThis.CATALOGO_LIBERI = (0, eval)(catalogo + "; CATALOGO_LIBERI");
globalThis.OnePiece = (0, eval)(
  leggi("js/onepiece.js").replace(/^const OnePiece =/m, "globalThis.OnePiece =") + "; globalThis.OnePiece");
const Books = (0, eval)(leggi("js/books.js").replace(/^const Books =/m, "globalThis.Books =") + "; globalThis.Books");

let passate = 0;
const fallite = [];

function prova(nome, fn) {
  try {
    const esito = fn();
    if (esito === true) { passate++; return; }
    fallite.push(`${nome}\n      ${esito}`);
  } catch (err) {
    fallite.push(`${nome}\n      ${err.message}`);
  }
}

const cerca = (q, n = 40) => Books.searchLocal(q, n);
const autoriDi = (q) => [...new Set(cerca(q).map((b) => b.author))];
const titoli = (q) => cerca(q).map((b) => b.title);

/* ------------------------------------------------------ il catalogo c'è */

prova("il catalogo non è un pugno di titoli", () =>
  Books.operePresenti() >= 40000 || `solo ${Books.operePresenti()} opere`);

prova("il catalogo copre molti autori", () =>
  Books.autoriPresenti() >= 10000 || `solo ${Books.autoriPresenti()} autori`);

prova("tanti libri si possono leggere gratis", () =>
  Books.opereLibere() >= 20000 || `solo ${Books.opereLibere()} da leggere`);

/* ------------------------------------------- non solo i nomi più grossi */

prova("il catalogo pesca anche fuori dai soliti nomi", () => {
  // Un catalogo costruito su un elenco di autori famosi dà poche centinaia di
  // nomi, ognuno con molte opere. La coda lunga si riconosce dal contrario:
  // moltissimi autori presenti con un'opera sola.
  const conta = new Map();
  for (const r of globalThis.CATALOGO) conta.set(r[1], (conta.get(r[1]) || 0) + 1);
  for (const r of globalThis.CATALOGO_LIBERI) conta.set(r[1], (conta.get(r[1]) || 0) + 1);
  const unaSola = [...conta.values()].filter((n) => n === 1).length;
  return unaSola >= 5000 || `solo ${unaSola} autori con una sola opera`;
});

const mangaka = ["Osamu Tezuka", "Eiichiro Oda", "Rumiko Takahashi", "Akira Toriyama"];
for (const nome of mangaka) {
  prova(`«${nome}» trova i suoi manga`, () => {
    const n = cerca(nome, 9999).length;
    return n >= 5 || `ne trova ${n}`;
  });
}

const liberi = [
  ["Frankenstein", "shelley"],
  ["Moby", "melville"],
  ["Dracula", "stoker"]
];
for (const [titolo, cognome] of liberi) {
  prova(`«${titolo}» si può leggere gratis`, () => {
    const suoi = cerca(titolo, 40).filter((b) =>
      new RegExp(cognome, "i").test(Books.normalize(b.author)));
    if (!suoi.length) return "non lo trova";
    // Basta che una delle schede porti il link: sono lo stesso libro, e
    // l'app propone di leggere da quella che ce l'ha.
    const conLettura = suoi.filter((b) => b.freeUrl);
    return conLettura.length > 0
      || `ne trova ${suoi.length}, nessuna con dove leggerlo`;
  });
}

/* ------------------------------------------------------------- One Piece */

prova("i 115 volumi di One Piece ci sono tutti", () => {
  const n = OnePiece.quantiVolumi();
  const numeri = OnePiece.VOLUMI.map((v) => v[0]);
  const mancanti = [];
  for (let i = 1; i <= n; i++) if (!numeri.includes(i)) mancanti.push(i);
  return (n >= 115 && !mancanti.length) || `${n} volumi, mancano ${mancanti.slice(0, 5)}`;
});

prova("i capitoli dei volumi non lasciano buchi", () => {
  const v = OnePiece.VOLUMI;
  for (let i = 0; i < v.length - 1; i++) {
    if (v[i + 1][4] !== v[i][5] + 1) {
      return `fra il volume ${v[i][0]} (finisce a ${v[i][5]}) e il ${v[i + 1][0]} (comincia a ${v[i + 1][4]})`;
    }
  }
  return true;
});

prova("ogni volume appartiene a un arco", () => {
  const orfani = OnePiece.VOLUMI.filter((v) => !OnePiece.arcoDelVolume(v)).map((v) => v[0]);
  return !orfani.length || `senza arco: ${orfani.join(", ")}`;
});

for (const lingua of OnePiece.LINGUE) {
  prova(`la trama di One Piece è scritta in ${lingua.label}`, () => {
    if (!OnePiece.STORIA[lingua.code]) return "manca la storia generale";
    const vuoti = OnePiece.ARCHI.filter(
      (a) => !a.trama[lingua.code] || !a.nome[lingua.code]).map((a) => a.key);
    return !vuoti.length || `archi senza trama: ${vuoti.join(", ")}`;
  });
}

prova("ogni volume porta la sua trama, senza rete né chiave", () => {
  const libri = OnePiece.comeLibri("fr");
  const senza = libri.filter((b) => !b.blurb || b.blurb.length < 80).map((b) => b.volume);
  return !senza.length || `volumi senza trama: ${senza.slice(0, 6).join(", ")}`;
});

prova("«One Piece» in libreria dà tutti i volumi", () => {
  const trovati = cerca("One Piece", 500).filter((b) => b.source === "onepiece");
  return trovati.length === OnePiece.quantiVolumi() || `ne dà ${trovati.length}`;
});

prova("«One Piece 37» mette quel volume per primo", () => {
  const primo = cerca("One Piece 37", 5)[0];
  return (primo && primo.volume === 37) || `primo: ${primo && primo.title}`;
});

prova("dove leggerlo sono solo canali ufficiali", () => {
  const permessi = /^https:\/\/(mangaplus\.shueisha\.co\.jp|www\.viz\.com|www\.starcomics\.com)\//;
  const estranei = OnePiece.DOVE.filter((d) => !permessi.test(d.url)).map((d) => d.url);
  return !estranei.length || `non ufficiali: ${estranei.join(", ")}`;
});

prova("il manga non finisce fra le opere da leggere nel lettore", () => {
  const leggibili = cerca("One Piece", 200).filter((b) => b.source === "onepiece" && (b.readable || b.freeUrl));
  return !leggibili.length
    || `${leggibili.length} volumi promettono una lettura che non può esistere`;
});

/* ---------------------------------------- ogni autore ha la sua libreria */

const attesi = [
  ["Stephen King", 15], ["Italo Calvino", 15], ["Andrea Camilleri", 10],
  ["Umberto Eco", 8], ["Haruki Murakami", 8], ["Agatha Christie", 10],
  ["Primo Levi", 8], ["Elena Ferrante", 4], ["J. K. Rowling", 8],
  ["Lev Tolstoj", 10], ["Fëdor Dostoevskij", 10], ["Luigi Pirandello", 8]
];

for (const [autore, minimo] of attesi) {
  prova(`«${autore}» trova almeno ${minimo} opere`, () => {
    const n = cerca(autore, 9999).length;
    return n >= minimo || `ne trova ${n}`;
  });
}

/* ------------------------------------------- e non quella di qualcun altro */

prova("«Italo Calvino» non tira dentro Italo Svevo", () => {
  const intrusi = autoriDi("Italo Calvino").filter((a) => !/calvino/i.test(a));
  return intrusi.length === 0 || `compaiono anche: ${intrusi.join(", ")}`;
});

prova("«Stephen King» non tira dentro Stephen Hawking", () => {
  const intrusi = autoriDi("Stephen King").filter((a) => !/king/i.test(a));
  return intrusi.length === 0 || `compaiono anche: ${intrusi.join(", ")}`;
});

prova("«Primo Levi» non tira dentro Carlo Levi o Levine", () => {
  const intrusi = autoriDi("Primo Levi").filter((a) => !/primo levi/i.test(a));
  return intrusi.length === 0 || `compaiono anche: ${intrusi.join(", ")}`;
});

/* ------------------------------------- in cima i libri che si riconoscono */

const inCima = [
  ["Stephen King", ["it", "shining", "carrie", "misery"]],
  ["Italo Calvino", ["barone rampante", "citta invisibili", "marcovaldo", "visconte", "cavaliere"]],
  ["J. R. R. Tolkien", ["hobbit", "signore degli anelli", "lord of the rings", "fellowship"]],
  ["George Orwell", ["1984", "animal farm", "fattoria degli animali"]]
];

for (const [autore, attesi] of inCima) {
  prova(`«${autore}»: in cima c'è un libro noto`, () => {
    const primi = titoli(autore).slice(0, 5).map((t) => Books.normalize(t));
    const trovato = primi.some((t) => attesi.some((a) => t.includes(Books.normalize(a))));
    return trovato || `i primi cinque sono: ${titoli(autore).slice(0, 5).join(" · ")}`;
  });
}

/* ---------------------------------------------- cercare per titolo, e a metà */

const perTitolo = [
  ["Il barone rampante", "calvino"],
  ["Se questo è un uomo", "levi"],
  ["Il nome della rosa", "eco"],
  ["Il giovane Holden", "salinger"],
  ["Il piccolo principe", "exupery"]
];

for (const [titolo, cognome] of perTitolo) {
  prova(`«${titolo}» trova il suo autore`, () => {
    const primo = cerca(titolo, 3)[0];
    if (!primo) return "non trova niente";
    return new RegExp(cognome, "i").test(Books.normalize(primo.author))
      || `il primo risultato è di ${primo.author}`;
  });
}

prova("si cerca anche a metà parola", () => {
  const primi = cerca("calvi", 5).map((b) => b.author);
  return primi.some((a) => /calvino/i.test(a)) || `trova invece: ${primi.join(", ")}`;
});

/* --------------------------------------------------- gli scaffali non vuoti */

const scaffaliVuoti = [];
for (const scaffale of Books.SHELVES) {
  const esito = await Books.shelf(scaffale.key);
  if (!esito.ok || esito.books.length < 5) {
    scaffaliVuoti.push(`${scaffale.label} (${esito.books.length})`);
  }
}
prova("nessuno scaffale resta quasi vuoto senza rete", () =>
  scaffaliVuoti.length === 0 || `troppo corti: ${scaffaliVuoti.join(", ")}`);

const senzaRete = await Books.search({ query: "Stephen King" });
prova("la ricerca risponde anche senza rete", () =>
  (senzaRete.ok && senzaRete.books.length > 0 && senzaRete.online === false)
  || `ok=${senzaRete.ok} libri=${senzaRete.books.length} online=${senzaRete.online}`);

/* ------------------------------------------------------------------ esito */

console.log(`\n  ${passate} prove passate, ${fallite.length} fallite\n`);
for (const f of fallite) console.log(`  ✗ ${f}\n`);
process.exit(fallite.length ? 1 : 0);
