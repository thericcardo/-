/**
 * Controlla che il file .epub generato sia davvero un EPUB.
 *
 *   node tools/controlla-epub.mjs
 *
 * Serve perché lo ZIP è scritto byte per byte a mano in js/epub.js — niente
 * librerie — e un campo spostato di due byte produce un file che sembra a
 * posto e che nessun lettore di ebook apre. È già successo: mancava il campo
 * degli attributi interni nell'indice centrale, e la dimensione dell'indice
 * veniva misurata dopo averci scritto sopra.
 *
 * Non serve la rete.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leggi = (f) => readFileSync(resolve(root, f), "utf8");

globalThis.window = globalThis;
const OnePiece = (0, eval)(
  leggi("js/onepiece.js").replace(/^const OnePiece =/m, "globalThis.OnePiece =") + "; globalThis.OnePiece");
const Epub = (0, eval)(
  leggi("js/epub.js").replace(/^const Epub =/m, "globalThis.Epub =") + "; globalThis.Epub");

let passate = 0;
const fallite = [];
const prova = (nome, fn) => {
  try {
    const esito = fn();
    if (esito === true) { passate++; return; }
    fallite.push(`${nome}\n      ${esito}`);
  } catch (err) { fallite.push(`${nome}\n      ${err.message}`); }
};

/* --------------------------------------------- lo ZIP si legge da fuori */

const cartella = resolve(root, ".prova-epub");
mkdirSync(cartella, { recursive: true });

const fatti = OnePiece.LINGUE.map((lingua) => {
  const libro = OnePiece.comeEbook(lingua.code);
  const byte = Epub.costruisci({
    titolo: libro.titolo, autore: libro.autore, lingua: lingua.code,
    pagine: libro.pagine, nota: "prova"
  });
  const file = resolve(cartella, `op-${lingua.code}.epub`);
  writeFileSync(file, Buffer.from(byte));
  return { lingua, file, byte };
});

for (const { lingua, file } of fatti) {
  prova(`l'epub in ${lingua.label} è uno ZIP valido`, () => {
    // unzip -t è un giudice esterno: non usa il codice che ha scritto il file.
    const fuori = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
    return /No errors detected/.test(fuori) || fuori.trim().split("\n").pop();
  });

  prova(`l'epub in ${lingua.label} comincia col mimetype`, () => {
    const elenco = execFileSync("unzip", ["-l", file], { encoding: "utf8" });
    const righe = elenco.split("\n").filter((r) => /\d\s+\S+$/.test(r));
    const primo = (righe[0] || "").trim().split(/\s+/).pop();
    if (primo !== "mimetype") return `il primo file è «${primo}»`;
    const dentro = execFileSync("unzip", ["-p", file, "mimetype"], { encoding: "utf8" });
    return dentro === "application/epub+zip" || `il mimetype dice «${dentro}»`;
  });

  prova(`l'epub in ${lingua.label} ha tutte le pagine`, () => {
    const elenco = execFileSync("unzip", ["-l", file], { encoding: "utf8" });
    const capitoli = (elenco.match(/c\d{3}\.xhtml/g) || []).length;
    const attese = OnePiece.comeEbook(lingua.code).pagine.length;
    return capitoli === attese || `${capitoli} capitoli invece di ${attese}`;
  });

  prova(`l'epub in ${lingua.label} ha XML ben formato`, () => {
    // Un lettore di ebook rifiuta l'XHTML malformato senza spiegare perché.
    const elenco = execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).trim().split("\n");
    const daControllare = elenco.filter((n) => /\.(xml|opf|xhtml)$/.test(n));
    for (const nome of daControllare.slice(0, 12).concat(daControllare.slice(-3))) {
      const testo = execFileSync("unzip", ["-p", file, nome], { encoding: "utf8" });
      // Un controllo grezzo ma efficace: i tag aperti e chiusi si contano.
      const aperti = (testo.match(/<(?!\/|\?|!)[a-zA-Z][^>]*(?<!\/)>/g) || []).length;
      const chiusi = (testo.match(/<\/[a-zA-Z][^>]*>/g) || []).length;
      if (aperti !== chiusi) return `${nome}: ${aperti} tag aperti e ${chiusi} chiusi`;
    }
    return true;
  });
}

prova("l'epub non è vuoto né assurdamente grosso", () => {
  for (const { lingua, byte } of fatti) {
    const kb = byte.length / 1024;
    if (kb < 40) return `in ${lingua.label} pesa solo ${kb.toFixed(0)} kB`;
    if (kb > 2000) return `in ${lingua.label} pesa ${kb.toFixed(0)} kB`;
  }
  return true;
});

prova("lo stesso libro rifatto dà lo stesso identificativo", () => {
  const uno = OnePiece.comeEbook("it");
  const a = Epub.costruisci({ titolo: uno.titolo, autore: uno.autore, lingua: "it", pagine: uno.pagine });
  const b = Epub.costruisci({ titolo: uno.titolo, autore: uno.autore, lingua: "it", pagine: uno.pagine });
  const testo = (x) => Buffer.from(x).toString("utf8");
  const id = (x) => (testo(x).match(/urn:uuid:[0-9a-f-]+/) || [])[0];
  return id(a) === id(b) || `${id(a)} contro ${id(b)}`;
});

rmSync(cartella, { recursive: true, force: true });

console.log(`\n  ${passate} prove passate, ${fallite.length} fallite\n`);
for (const f of fallite) console.log(`  ✗ ${f}\n`);
process.exit(fallite.length ? 1 : 0);
