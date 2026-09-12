/**
 * Genera le icone PNG dell'app a partire da icon.svg.
 *
 *   node tools/genera-icone.mjs
 *
 * Android e iOS vogliono PNG di dimensioni precise per installare davvero
 * l'app: un SVG nel manifest non basta. Qui il disegno resta uno solo — il
 * file SVG — e le versioni PNG si rifanno da quello quando cambia.
 *
 * Serve Chromium via Playwright, che in questo progetto è uno strumento da
 * sviluppo e non una dipendenza dell'app: l'app resta un sito statico.
 *
 * L'icona «maskable» è a parte perché Android ritaglia un cerchio dentro il
 * quadrato: il disegno deve stare nel 60% centrale o viene tagliato.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Playwright può essere installato nel progetto o globalmente: vanno bene entrambi. */
async function caricaChromium() {
  for (const dove of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
    try {
      return (await import(dove)).chromium;
    } catch (err) { /* si prova il prossimo */ }
  }
  throw new Error("Playwright non trovato. Installalo con: npm i -D playwright");
}

const chromium = await caricaChromium();

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(resolve(root, "icon.svg"), "utf8");

/** Lo stesso disegno rimpicciolito, con il fondo pieno attorno. */
const maskable = svg
  .replace('<rect width="512" height="512" rx="112" fill="#202B22"/>',
           '<rect width="512" height="512" fill="#202B22"/><g transform="translate(102.4 102.4) scale(0.6)">')
  .replace("</svg>", "</g></svg>");

const ICONE = [
  { file: "icona-192.png", size: 192, source: svg },
  { file: "icona-512.png", size: 512, source: svg },
  { file: "icona-maskable-512.png", size: 512, source: maskable },
  { file: "icona-apple-180.png", size: 180, source: svg }
];

const browser = await chromium.launch();
for (const icona of ICONE) {
  const page = await browser.newPage({
    viewport: { width: icona.size, height: icona.size },
    deviceScaleFactor: 1
  });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${icona.source}`
  );
  const png = await page.screenshot({ omitBackground: true });
  writeFileSync(resolve(root, icona.file), png);
  await page.close();
  console.log(icona.file, icona.size + "×" + icona.size, (png.length / 1024).toFixed(1) + " kB");
}
await browser.close();
