# Ultra White — concept fan-site

Sito vetrina a pagina singola dedicato a **Monster Energy Ultra White**.
Progetto **non ufficiale**, realizzato come esercizio di design e sviluppo front-end:
non è affiliato, sponsorizzato né approvato da Monster Beverage Corporation.

## Come si apre

Nessuna build, nessuna dipendenza: basta aprire `index.html` nel browser.

```bash
# opzionale, per servirlo su localhost
npx http-server . -p 8080
```

## Struttura

```
index.html            pagina completa (tutte le sezioni)
assets/css/style.css  design system + layout + animazioni
assets/js/main.js     interazioni (nessuna libreria esterna)
```

## Cosa c'è dentro

- **Hero** con lattina disegnata in SVG (illustrazione originale), parallasse sul
  puntatore, particelle di condensa e titolo con effetto metallo animato.
- **Tema chiaro/scuro** che segue le preferenze di sistema, con override manuale
  memorizzato in `localStorage`.
- **Selettore gusti Ultra**: al click ridipinge l'intera pagina cambiando le
  variabili CSS dell'accento.
- **Profilo aromatico** e **timeline del sorso** con barre animate allo scroll.
- **Confronto caffeina** su banda scura, con nota sulle soglie EFSA.
- **Tabella valori nutrizionali** e accordion sugli ingredienti.
- **FAQ**, form demo (validazione client-side, nessun invio) e toast di conferma.

## Accessibilità e qualità

- HTML semantico, `aria-expanded` / `aria-pressed` sui controlli, focus visibile.
- Rispetta `prefers-reduced-motion`: animazioni e scroll fluido disattivati.
- Fallback `<noscript>`: senza JavaScript i contenuti restano tutti visibili.
- Nessun overflow orizzontale da 320 px in su; verificato in Chromium a
  1440×900 e 390×844, in tema chiaro e scuro.

## Nota sui contenuti

Valori nutrizionali, date e descrizioni dei gusti sono indicativi e servono a
popolare il concept: le formulazioni cambiano da mercato a mercato e fa sempre
fede l'etichetta sulla lattina. «Monster», «Monster Energy» e «Ultra» sono
marchi dei rispettivi titolari, citati qui a soli fini descrittivi.
