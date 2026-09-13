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
globalThis.CATALOGO = (0, eval)(leggi("js/catalogo.js") + "; CATALOGO");
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
  Books.operePresenti() >= 3000 || `solo ${Books.operePresenti()} opere`);

prova("il catalogo copre molti autori", () =>
  Books.autoriPresenti() >= 120 || `solo ${Books.autoriPresenti()} autori`);

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
