/**
 * Un ebook vero, in un file.
 *
 * Genera un EPUB 3 valido dentro il browser, senza librerie. Serve perché «il
 * più possibile un ebook» non finisce col leggerlo qui dentro: un .epub si
 * apre su un lettore di ebook, su un telefono, su un Kobo, e resta tuo anche
 * se questa pagina domani non c'è più.
 *
 * Un EPUB è uno ZIP con dentro una struttura precisa:
 *
 *   mimetype                 per primo, non compresso, senza campi extra —
 *                            è la firma con cui i lettori riconoscono il formato
 *   META-INF/container.xml   dice dove sta il manifesto
 *   OEBPS/content.opf        il manifesto: metadati, elenco file, ordine
 *   OEBPS/nav.xhtml          l'indice navigabile
 *   OEBPS/*.xhtml            le pagine
 *
 * Lo ZIP qui è scritto a mano in «stored», cioè senza comprimere: risparmia
 * l'implementazione di deflate, e su un testo di cinquantamila caratteri la
 * differenza di peso non si sente. La parte che non si può saltare è il CRC-32
 * di ogni file, che i lettori controllano davvero.
 */
const Epub = (() => {
  "use strict";

  /* ============================================================ lo ZIP == */

  const tabellaCrc = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(byte) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < byte.length; i++) c = tabellaCrc[(c ^ byte[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  const utf8 = (s) => new TextEncoder().encode(s);

  /** Scrive numeri e byte in sequenza, che è tutto quello che serve a uno ZIP. */
  function penna() {
    let pezzi = [];
    let lunghezza = 0;
    const metti = (b) => { pezzi.push(b); lunghezza += b.length; };
    return {
      byte: metti,
      u16(n) { metti(new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF])); },
      u32(n) { metti(new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF])); },
      get lunghezza() { return lunghezza; },
      chiudi() {
        const fuori = new Uint8Array(lunghezza);
        let i = 0;
        for (const p of pezzi) { fuori.set(p, i); i += p.length; }
        return fuori;
      }
    };
  }

  /**
   * Impacchetta i file in uno ZIP.
   * @param file elenco di { nome, contenuto } — il contenuto è testo o byte
   */
  function zip(file) {
    const p = penna();
    const indice = [];

    for (const f of file) {
      const nome = utf8(f.nome);
      const dati = typeof f.contenuto === "string" ? utf8(f.contenuto) : f.contenuto;
      const crc = crc32(dati);
      indice.push({ nome, dati, crc, offset: p.lunghezza });

      p.u32(0x04034b50);          // firma di intestazione locale
      p.u16(20);                  // versione minima per leggerlo
      p.u16(0x0800);              // i nomi dei file sono in UTF-8
      p.u16(0);                   // metodo: stored, nessuna compressione
      p.u16(0); p.u16(0);         // ora e data: non servono, restano a zero
      p.u32(crc);
      p.u32(dati.length);         // dimensione compressa
      p.u32(dati.length);         // dimensione reale
      p.u16(nome.length);
      p.u16(0);                   // nessun campo extra
      p.byte(nome);
      p.byte(dati);
    }

    const inizioIndice = p.lunghezza;
    for (const f of indice) {
      p.u32(0x02014b50);          // firma di voce dell'indice centrale
      p.u16(20);                  // versione di chi l'ha scritto
      p.u16(20);                  // versione minima per leggerlo
      p.u16(0x0800);              // nomi in UTF-8
      p.u16(0);                   // metodo: stored
      p.u16(0); p.u16(0);         // ora e data
      p.u32(f.crc);
      p.u32(f.dati.length);       // dimensione compressa
      p.u32(f.dati.length);       // dimensione reale
      p.u16(f.nome.length);
      p.u16(0);                   // lunghezza del campo extra
      p.u16(0);                   // lunghezza del commento
      p.u16(0);                   // disco di partenza
      p.u16(0);                   // attributi interni
      p.u32(0);                   // attributi esterni
      p.u32(f.offset);            // dove sta l'intestazione locale
      p.byte(f.nome);
    }

    // La dimensione dell'indice va misurata adesso: scrivendo la coda, la
    // penna avanza, e misurarla dopo la conterebbe dentro.
    const dimensioneIndice = p.lunghezza - inizioIndice;

    p.u32(0x06054b50);            // fine dell'indice centrale
    p.u16(0); p.u16(0);           // numero del disco, disco dell'indice
    p.u16(indice.length); p.u16(indice.length);
    p.u32(dimensioneIndice);
    p.u32(inizioIndice);
    p.u16(0);                     // nessun commento
    return p.chiudi();
  }

  /* ========================================================== l'EPUB ==== */

  const scappa = (s) => String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  /** Un identificativo stabile: lo stesso libro rifatto ha lo stesso codice. */
  function identificativo(semi) {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < semi.length; i++) {
      h1 = ((h1 ^ semi.charCodeAt(i)) >>> 0) * 16777619 >>> 0;
      h2 = ((h2 + semi.charCodeAt(i) * (i + 1)) >>> 0) * 2246822519 >>> 0;
    }
    const pezzo = (n) => n.toString(16).padStart(8, "0");
    return `urn:uuid:${pezzo(h1)}-${pezzo(h2).slice(0, 4)}-4${pezzo(h1).slice(1, 4)}-a${pezzo(h2).slice(4, 7)}-${pezzo(h1)}${pezzo(h2).slice(0, 4)}`;
  }

  const FOGLIO = `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; margin: 5%; }
h1 { font-size: 1.5em; line-height: 1.25; margin: 0 0 .4em; }
h2 { font-size: 1.2em; line-height: 1.3; margin: 0 0 .3em; }
p.riga { font-size: .85em; color: #555; margin: 0 0 .2em; font-family: sans-serif; }
p.riga + p:not(.riga) { margin-top: 1.2em; }
p { margin: 0 0 .9em; }
p.nota { font-size: .85em; color: #555; border-left: 3px solid #E8BE3C; padding: .6em .8em; background: #f7f5ee; }
nav ol { list-style: none; padding-left: 0; }
nav li { margin: .25em 0; }
nav li.arco { margin-top: .9em; font-weight: bold; }
nav li.volume { padding-left: 1.2em; font-size: .92em; }`;

  /**
   * Costruisce l'EPUB.
   *
   * @param titolo   il titolo del libro
   * @param autore   chi l'ha scritto
   * @param lingua   codice di due lettere, per i lettori vocali e la sillabazione
   * @param pagine   pagine composte { titolo, righe, testo, nota } o stringhe
   * @param nota     una riga sull'origine del testo, messa nei metadati
   * @returns Uint8Array, il file .epub
   */
  function costruisci({ titolo, autore, lingua = "it", pagine = [], nota = "" }) {
    const capitoli = pagine.map((p, i) => {
      const composta = p && typeof p === "object";
      const intestazione = composta ? (p.titolo || `${i + 1}`) : `${i + 1}`;
      const corpo = [];
      if (composta) {
        for (const riga of p.righe || []) corpo.push(`<p class="riga">${scappa(riga)}</p>`);
        for (const par of String(p.testo || "").split("\n\n")) {
          if (par.trim()) corpo.push(`<p>${scappa(par).replace(/\n/g, "<br/>")}</p>`);
        }
        if (p.nota) corpo.push(`<p class="nota">${scappa(p.nota)}</p>`);
      } else {
        for (const par of String(p || "").split("\n\n")) {
          if (par.trim()) corpo.push(`<p>${scappa(par).replace(/\n/g, "<br/>")}</p>`);
        }
      }
      return {
        file: `c${String(i + 1).padStart(3, "0")}.xhtml`,
        titolo: intestazione,
        // Nell'indice i volumi stanno rientrati sotto il loro arco: si
        // riconoscono perché la loro intestazione comincia col numero di volume
        // nella lingua scelta.
        livello: composta && /^(Volume|Tome|Band|Volumen|第\d+巻)/.test(intestazione) ? "volume" : "arco",
        xhtml: `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lingua}" lang="${lingua}">
<head><meta charset="utf-8"/><title>${scappa(intestazione)}</title>
<link rel="stylesheet" type="text/css" href="stile.css"/></head>
<body>
<h1>${scappa(intestazione)}</h1>
${corpo.join("\n")}
</body>
</html>`
      };
    });

    const id = identificativo(titolo + "|" + autore + "|" + lingua + "|" + capitoli.length);
    const adesso = new Date().toISOString().replace(/\.\d+Z$/, "Z");

    const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${lingua}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${id}</dc:identifier>
    <dc:title>${scappa(titolo)}</dc:title>
    <dc:creator>${scappa(autore)}</dc:creator>
    <dc:language>${lingua}</dc:language>
    ${nota ? `<dc:description>${scappa(nota)}</dc:description>` : ""}
    <meta property="dcterms:modified">${adesso}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="stile.css" media-type="text/css"/>
${capitoli.map((c, i) => `    <item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`).join("\n")}
  </manifest>
  <spine>
${capitoli.map((c, i) => `    <itemref idref="c${i + 1}"/>`).join("\n")}
  </spine>
</package>`;

    const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lingua}" lang="${lingua}">
<head><meta charset="utf-8"/><title>${scappa(titolo)}</title>
<link rel="stylesheet" type="text/css" href="stile.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h1>${scappa(titolo)}</h1>
<ol>
${capitoli.map((c) => `<li class="${c.livello}"><a href="${c.file}">${scappa(c.titolo)}</a></li>`).join("\n")}
</ol>
</nav>
</body>
</html>`;

    return zip([
      // Il mimetype va per primo e non compresso: è la firma del formato.
      { nome: "mimetype", contenuto: "application/epub+zip" },
      { nome: "META-INF/container.xml", contenuto: `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>` },
      { nome: "OEBPS/content.opf", contenuto: opf },
      { nome: "OEBPS/nav.xhtml", contenuto: nav },
      { nome: "OEBPS/stile.css", contenuto: FOGLIO },
      ...capitoli.map((c) => ({ nome: "OEBPS/" + c.file, contenuto: c.xhtml }))
    ]);
  }

  return { costruisci, zip, crc32 };
})();
