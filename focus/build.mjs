/**
 * Genera le versioni a file unico di Calzino, partendo dagli stessi sorgenti
 * di index.html: niente copie da tenere allineate a mano.
 *
 *   node focus/build.mjs
 *
 * Produce:
 *   focus/dist/calzino.html    pagina completa e autosufficiente (si apre con
 *                              un doppio clic, si manda per email, sta su una
 *                              chiavetta): CSS, JS e icona sono dentro il file
 *   focus/dist/artifact.html   lo stesso contenuto senza <html>/<head>/<body>,
 *                              per gli host che avvolgono loro la pagina
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(root, p), "utf8");

/** Fallisce rumorosamente: meglio un build rotto di un build che perde pezzi. */
function replaceOnce(text, needle, replacement, what) {
  if (!text.includes(needle)) throw new Error(`Build: non trovo ${what} ("${needle}"). Aggiorna build.mjs.`);
  return text.replace(needle, replacement);
}

const html = read("index.html");
const css = read("css/styles.css");
const icon = read("icon.svg");
const iconDataUri = "data:image/svg+xml;base64," + Buffer.from(icon, "utf8").toString("base64");

const TITLE = "Calzino";

// ---- markup: solo il contenuto di <body>, senza i tag <script src>
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
if (!bodyMatch) throw new Error("Build: non trovo il <body> in index.html.");
const body = bodyMatch[1]
  .replace(/\s*<script src="[^"]*"><\/script>/g, "")
  .replace(/src="icon\.svg"/g, `src="${iconDataUri}"`)
  .trim();

// ---- script: gli stessi file, nello stesso ordine in cui li carica index.html
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g), (m) => m[1]);
if (!scripts.length) throw new Error("Build: nessuno <script src> in index.html.");
let js = scripts.map(read).join("\n\n");
// In un file unico non c'è nessun sw.js accanto alla pagina.
js = replaceOnce(js, "    registerServiceWorker();", "    // file unico: nessun service worker da registrare", "la chiamata a registerServiceWorker");
// L'icona nelle notifiche deve restare raggiungibile anche senza cartella accanto.
js = js.replace(/icon: "icon\.svg"/g, `icon: "${iconDataUri}"`);
js = js.replace(/<\/script/gi, "<\\/script");

const style = `<style>\n${css}\n</style>`;
const script = `<script>\n${js}\n</script>`;

// L'host degli artifact avvolge lui il contenuto in <html>/<head>/<body>.
const inner = [`<title>${TITLE}</title>`, style, body, script].join("\n\n");

const standalone = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Timer di concentrazione con Mora, la talpa che sferruzza: ogni sessione finita è un calzino, due calzini fanno un paio. Gratis; con il Pro a 1 € al mese i calzini sono due e si aprono le decorazioni.">
<meta name="theme-color" content="#1E2438">
<link rel="icon" href="${iconDataUri}" type="image/svg+xml">
<title>${TITLE}</title>
${style}
</head>
<body>
${body}

${script}
</body>
</html>
`;

mkdirSync(resolve(root, "dist"), { recursive: true });
writeFileSync(resolve(root, "dist/calzino.html"), standalone);
writeFileSync(resolve(root, "dist/artifact.html"), inner + "\n");

const kb = (s) => (Buffer.byteLength(s, "utf8") / 1024).toFixed(1) + " kB";
console.log("focus/dist/calzino.html", kb(standalone));
console.log("focus/dist/artifact.html", kb(inner));
