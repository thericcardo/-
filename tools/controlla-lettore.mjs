/**
 * Controlla che i libri si possano ancora leggere.
 *
 *   node tools/controlla-lettore.mjs
 *
 * A differenza di tools/controlla-catalogo.mjs, questo ha bisogno della rete:
 * verifica un accordo con un servizio esterno, e quell'accordo può cambiare
 * senza avvisare. Le tre cose che devono restare vere sono
 *
 *   1. la ricerca fra i testi di Internet Archive risponde;
 *   2. le scansioni in prestito restano fuori (dichiarano il file di testo ma
 *      lo scaricano vuoto: è il motivo per cui il lettore tornava a mani
 *      vuote pur avendo il libro a due risposte di distanza);
 *   3. il file di testo arriva con `access-control-allow-origin`, altrimenti
 *      il browser non può leggerlo e il lettore non ha più niente da mostrare.
 *
 * Se qui qualcosa si rompe, si rompe il lettore — non il catalogo.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = globalThis;
const Lettore = (0, eval)(
  readFileSync(resolve(root, "js/lettore.js"), "utf8")
    .replace(/^const Lettore =/m, "globalThis.Lettore =") + "; globalThis.Lettore");

let passate = 0;
const fallite = [];

const prova = async (nome, fn) => {
  try {
    const esito = await fn();
    if (esito === true) { passate++; return; }
    fallite.push(`${nome}\n      ${esito}`);
  } catch (err) {
    fallite.push(`${nome}\n      ${err.message}`);
  }
};

/* --------------------------------------------- i titoli si accorciano bene */

const titoli = [
  ["Frankenstein; or, the modern prometheus", "Frankenstein"],
  ["Le avventure di Pinocchio: Storia di un burattino", "Le avventure di Pinocchio"],
  ["Moby-Dick; or, The Whale", "Moby Dick"]
];
for (const [intero, atteso] of titoli) {
  await prova(`«${intero}» si cerca come «${atteso}»`, () =>
    Lettore.titoloBreve(intero) === atteso || `esce «${Lettore.titoloBreve(intero)}»`);
}

/* ------------------------------------------------- i libri si aprono ancora */

const libri = [
  { title: "Frankenstein", author: "Mary Shelley" },
  { title: "Le avventure di Pinocchio", author: "Carlo Collodi" },
  { title: "Dracula", author: "Bram Stoker" }
];

for (const libro of libri) {
  await prova(`«${libro.title}» si apre e si impagina`, async () => {
    const esito = await Lettore.apri(libro);
    if (!esito.ok) return `non si apre: ${esito.reason}`;
    if (esito.pagine.length < 20) return `solo ${esito.pagine.length} pagine`;
    const mezza = esito.pagine[Math.floor(esito.pagine.length / 2)];
    if (!/\p{L}{4,}/u.test(mezza)) return "una pagina in mezzo non contiene parole";
    // Una pagina non deve mai finire a metà di una parola.
    if (/\p{L}$/u.test(mezza) && /^\p{Ll}/u.test(esito.pagine[Math.floor(esito.pagine.length / 2) + 1] || " ")) {
      return "una pagina finisce in mezzo a una parola";
    }
    return true;
  });
}

/* ------------------------------ le scansioni in prestito restano fuori */

await prova("le scansioni in prestito non entrano", async () => {
  const candidati = await Lettore.trova({ title: "Frankenstein", author: "Mary Shelley" });
  if (!candidati.length) return "la ricerca non risponde";
  for (const c of candidati.slice(0, 6)) {
    const meta = await (await fetch(`https://archive.org/metadata/${c.identifier}`)).json();
    if (String((meta.metadata || {})["access-restricted-item"]) === "true") {
      return `«${c.identifier}» è in prestito ed è arrivata fra i candidati`;
    }
  }
  return true;
});

/* ---------------------------- il testo arriva con il permesso di leggerlo */

await prova("il testo si può leggere dal browser (CORS)", async () => {
  const risposta = await fetch(
    "https://archive.org/download/frankenstein_1818_1910/frankenstein_djvu.txt");
  const permesso = risposta.headers.get("access-control-allow-origin");
  return permesso === "*" || `l'intestazione dice «${permesso}»: il browser non potrebbe leggerlo`;
});

console.log(`\n  ${passate} prove passate, ${fallite.length} fallite\n`);
for (const f of fallite) console.log(`  ✗ ${f}\n`);
process.exit(fallite.length ? 1 : 0);
