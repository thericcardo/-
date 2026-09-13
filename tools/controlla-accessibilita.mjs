/**
 * Controlla l'accessibilità dell'app, in tema chiaro e in tema scuro.
 *
 *   npx http-server -p 8124 -s          (in un altro terminale)
 *   node tools/controlla-accessibilita.mjs [url]
 *
 * Verifica tre cose, su ogni schermata:
 *
 *   1. il contrasto di ogni testo visibile, secondo le soglie WCAG AA
 *      (4,5:1 per il testo normale, 3:1 per quello grande);
 *   2. che ogni comando abbia un nome leggibile da uno screen reader;
 *   3. che ogni immagine abbia un attributo alt.
 *
 * Il calcolo del contrasto è la parte delicata. Due trappole, entrambe capaci
 * di produrre allarmi falsi a decine:
 *
 *   - **l'alfa**: un giallo al 12% su verde scuro non è giallo su giallo, e va
 *     sovrapposto al colore sottostante prima di misurare;
 *   - **i gradienti**: un elemento con solo un gradiente ha `backgroundColor`
 *     trasparente, e risalire l'albero porterebbe a confrontare il testo con
 *     lo sfondo della pagina, che non è quello che si vede.
 *
 * Lo strumento dice anche quanti elementi ha valutato e quanti ha saltato: un
 * risultato verde da un controllo che non controlla niente non vale niente.
 *
 * Serve Chromium via Playwright, che qui è una dipendenza da sviluppo.
 */

async function caricaChromium() {
  for (const dove of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
    try {
      return (await import(dove)).chromium;
    } catch (err) { /* si prova il prossimo */ }
  }
  throw new Error("Playwright non trovato. Installalo con: npm i -D playwright");
}

const APP = process.argv[2] || "http://127.0.0.1:8124/index.html";

const CONTROLLO = `
(() => {
  const luminanza = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const leggi = (s) => {
    const n = (s.match(/[\\d.]+/g) || []).map(Number);
    return { rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 };
  };
  const rapporto = (a, b) => {
    const l1 = luminanza(leggi(a).rgb), l2 = luminanza(leggi(b).rgb);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const componi = (sopra, sotto) => {
    const f = leggi(sopra), b = leggi(sotto);
    if (f.a >= 1) return "rgb(" + f.rgb.join(",") + ")";
    return "rgb(" + f.rgb.map((v, i) => Math.round(v * f.a + b.rgb[i] * (1 - f.a))).join(",") + ")";
  };

  const sfondoDi = (el) => {
    const livelli = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const st = getComputedStyle(node);
      const bg = st.backgroundColor;
      if (st.backgroundImage && st.backgroundImage !== "none") {
        return leggi(bg).a >= 1 ? bg : null;  // il colore di base, se c'è
      }
      if (leggi(bg).a > 0) {
        livelli.push(bg);
        if (leggi(bg).a >= 1) break;
      }
      node = node.parentElement;
    }
    if (!livelli.length) return getComputedStyle(document.body).backgroundColor;
    let risultato = livelli.pop();
    while (livelli.length) risultato = componi(livelli.pop(), risultato);
    return risultato;
  };

  const problemi = [];
  let valutati = 0, saltati = 0;

  const conTesto = [...document.querySelectorAll("body *")].filter((el) => {
    if (!el.offsetParent && getComputedStyle(el).position !== "fixed") return false;
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  });

  for (const el of conTesto) {
    const st = getComputedStyle(el);
    const dimensione = parseFloat(st.fontSize);
    const grande = dimensione >= 24 || (dimensione >= 18.66 && Number(st.fontWeight) >= 700);
    const soglia = grande ? 3 : 4.5;
    const sfondo = sfondoDi(el);
    if (!sfondo) { saltati++; continue; }
    valutati++;
    const r = rapporto(st.color, sfondo);
    if (r < soglia) {
      problemi.push("contrasto " + r.toFixed(2) + ":1 (serve " + soglia + ") — " +
        el.tagName.toLowerCase() + "." + String(el.className || "").split(" ")[0] +
        " «" + el.textContent.trim().slice(0, 40) + "»");
    }
  }

  const comandi = [...document.querySelectorAll("button, a[href], input, select, textarea")]
    .filter((el) => el.offsetParent || getComputedStyle(el).position === "fixed");

  for (const el of comandi) {
    const nome = (el.getAttribute("aria-label") || "").trim()
      || (el.labels && el.labels.length ? [...el.labels].map((l) => l.textContent).join(" ").trim() : "")
      || (el.textContent || "").trim()
      || (el.getAttribute("title") || "").trim()
      || (el.getAttribute("placeholder") || "").trim();
    if (!nome) problemi.push("comando senza nome accessibile — " + el.tagName.toLowerCase() + "#" + (el.id || "?"));
  }

  for (const img of document.querySelectorAll("img")) {
    if (img.getAttribute("alt") === null) problemi.push("immagine senza alt — " + String(img.src).slice(0, 50));
  }

  return { problemi, valutati, saltati, comandi: comandi.length };
})()
`;

const chromium = await caricaChromium();
const browser = await chromium.launch();
let totale = 0;

const riporta = (tema, dove, r) => {
  totale += r.problemi.length;
  console.log(`  ${dove.padEnd(16)} ${String(r.valutati).padStart(3)} testi, ${String(r.comandi).padStart(3)} comandi` +
    (r.saltati ? `, ${r.saltati} non valutabili` : "") + " — " +
    (r.problemi.length ? "\n     " + r.problemi.join("\n     ") : "tutto a posto"));
};

for (const tema of ["light", "dark"]) {
  const page = await (await browser.newContext({
    viewport: { width: 430, height: 940 }, locale: "it-IT", colorScheme: tema
  })).newPage();

  // Senza rete: si controlla l'interfaccia, non il catalogo.
  await page.route("**://openlibrary.org/**", (r) => r.abort());
  await page.route("**://covers.openlibrary.org/**", (r) => r.abort());
  await page.route("**://*.wikipedia.org/**", (r) => r.abort());
  await page.route("**://www.googleapis.com/**", (r) => r.abort());

  console.log(`\nTema ${tema === "light" ? "chiaro" : "scuro"}`);
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  riporta(tema, "accesso", await page.evaluate(CONTROLLO));

  await page.fill("#login-username", "Prova");
  await page.click("#form-login button[type=submit]");
  await page.waitForSelector("#screen-app:not([hidden])");

  await page.fill("#f-cerca", "calvino");
  await page.click("#btn-cerca");
  await page.waitForSelector("#lib-risultati .book-card:not(.is-skeleton), .empty", { timeout: 20000 });
  riporta(tema, "libreria", await page.evaluate(CONTROLLO));

  for (const [vista, nome] of [["nuova", "nuova lettura"], ["diario", "diario"], ["profilo", "profilo"]]) {
    await page.click(`.tab[data-view="${vista}"]`);
    await page.waitForTimeout(250);
    riporta(tema, nome, await page.evaluate(CONTROLLO));
  }
}

await browser.close();
console.log(totale ? `\n${totale} problemi da sistemare.` : "\nNessun problema di accessibilità.");
process.exit(totale ? 1 : 0);
