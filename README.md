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

- **Hero** con lattina disegnata in SVG (illustrazione originale), titolo che sale
  carattere per carattere da una maschera, parallasse sul puntatore e sullo scroll,
  particelle di condensa e effetto metallo animato.
- **Anatomia**: sezione con la lattina in `position: sticky` che ruota mentre i
  quattro passaggi scorrono, con linea di scansione e step attivo a fuoco.
- **Tema chiaro/scuro** che segue le preferenze di sistema, con override manuale
  memorizzato in `localStorage`.
- **Selettore gusti Ultra**: al click ridipinge l'intera pagina cambiando le
  variabili CSS dell'accento.
- **Profilo aromatico** e **timeline del sorso** con barre animate allo scroll.
- **Confronto caffeina** su banda scura, con nota sulle soglie EFSA.
- **Tabella valori nutrizionali** e accordion sugli ingredienti.
- **FAQ**, form demo (validazione client-side, nessun invio) e toast di conferma.

## Il motore di animazione

Tutto passa da **un solo loop `requestAnimationFrame`** (`assets/js/main.js`), con
interpolazione lineare su ogni valore: lo scroll grezzo viene smorzato e da quello
derivano parallasse, rotazione della lattina, velocità del marquee e cursore.

- Si animano **solo `transform` e `opacity`**, sempre con `translate3d`.
- Le misure (`getBoundingClientRect`) si rifanno solo al resize; gli elementi fuori
  schermo vengono saltati tramite `IntersectionObserver`.
- I colori dell'accento sono registrati con `@property`, quindi il cambio gusto
  **interpola** invece di scattare, accompagnato da un'onda circolare.
- Il cambio tema usa la **View Transitions API** con un cerchio che si espande dal
  pulsante (fallback immediato dove non è supportata).
- Preloader con avanzamento reale (`load` + `document.fonts.ready`) e sipario curvo.
- Cursore interpolato e bottoni magnetici solo su `pointer: fine`.

## Accessibilità e qualità

- HTML semantico, `aria-expanded` / `aria-pressed` sui controlli, focus visibile.
- Rispetta `prefers-reduced-motion`: animazioni e scroll fluido disattivati.
- Fallback `<noscript>`: senza JavaScript i contenuti restano tutti visibili.
- Nessun overflow orizzontale da 360 px in su; verificato in Chromium a 1920, 1440,
  1280, 1100, 1000, 900, 768, 480 e 360 px, in tema chiaro e scuro.
- Con `prefers-reduced-motion` cadono cursore, parallasse, split e onde: restano
  solo i contenuti, tutti visibili.

## Nota sui contenuti

Valori nutrizionali, date e descrizioni dei gusti sono indicativi e servono a
popolare il concept: le formulazioni cambiano da mercato a mercato e fa sempre
fede l'etichetta sulla lattina. «Monster», «Monster Energy» e «Ultra» sono
marchi dei rispettivi titolari, citati qui a soli fini descrittivi.
