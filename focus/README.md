# Calzino

Un timer di concentrazione con una compagna di lavoro: **Mora**, la talpa che
sferruzza. Quando il timer parte lei prende i ferri; quando la sessione arriva
in fondo, nel cassetto c'è **un calzino**. Due calzini fanno **un paio**.

E i paia servono a qualcosa: **Mora si sta costruendo una casa**, e ogni paio ne
paga un pezzo — il terreno, le fondamenta, i muri, le finestre, il tetto, fino
alla staccionata. Undici pezzi, ognuno con la sua riga di racconto che si legge
solo quando l'hai costruito. È il filo lungo dell'app: il cassetto dice quanto
hai lavorato oggi, la casa dice dove sta andando a finire tutto quel lavoro.

Con **Calzino Pro** — 2 € al mese — ogni sessione vale due calzini (la casa
cresce il doppio più in fretta), le sessioni libere arrivano a sei ore e si
aprono le decorazioni in più. Tutto il resto è gratis e completo, e resta tale:
la casa si finisce anche senza pagare, ci vuole il doppio del lavoro.

## La stanza

La schermata del timer non è un cronometro con un disegno accanto: è **il posto
dove Mora vive adesso**. All'inizio lavora sul prato, con un cartello piantato
nel terreno appena comprato. Quando la casa arriva ai muri, la stessa scena
diventa un interno, e da lì in poi ogni pezzo costruito compare lì dentro — la
finestra, la porta, la trave del tetto, la stufa, la lampada accesa, la pianta,
il quadro. Si guarda la stanza e si vede quanto si è lavorato, senza leggere un
numero.

Sopra la scena c'è il conto dei calzini; sotto, il timer e un solo bottone
grande. La navigazione sta in basso, dove arriva il pollice.

## Concentrazione profonda

Premendo **Avvia**, se l'interruttore è acceso (lo è di suo), la pagina passa a
schermo intero e resta solo la stanza, il tempo e un bottone: spariscono le
altre schede, le impostazioni, la lista, tutto. Si esce con **Esci dalla
concentrazione** o con `Esc`.

Non è il blocco delle app — quello serve un'app installata, e questa è una
pagina web — ma è la cosa più vicina che il browser sappia fare: toglie di mezzo
anche l'app stessa.

## Come si usa

1. Apri `index.html` (doppio clic va benissimo) oppure il sito pubblicato.
2. **Timer** → scegli il modo (**a tempo** o **libera**), l'attività, premi
   **Avvia** e lascia perdere il telefono.
3. **Cose da fare** → la lista di quello che vuoi finire, da spuntare mentre vai.
4. **Casa** → la casa di Mora che cresce, la storia, il cassetto dei calzini e i
   traguardi.
5. **Numeri** → oggi, la striscia di giorni, gli ultimi 14 giorni, il tempo
   per attività, il registro delle sessioni.
6. **Impostazioni** → durate, avvisi, distrattori, aspetto, dati.

Scorciatoie da tastiera: barra spaziatrice avvia o mette in pausa, `R` azzera,
`S` salta alla fase dopo.

## I due modi del timer

- **A tempo** — il classico conto alla rovescia: concentrazione, pausa breve,
  pausa lunga, con le durate che vuoi e l'avvio automatico delle pause.
- **Libera** — il conto sale invece di scendere, e la sessione finisce quando lo
  decidi tu. Sotto i **5 minuti** non fa calzino (è un'occhiata, non del
  lavoro); il calzino è assicurato appena li superi, e la sessione si chiude da
  sola al tetto: **2 ore**, **6 con il Pro**. I minuti restano registrati
  comunque, anche quelli delle sessioni troppo corte.

## Che cosa c'è dentro

- **Durate libere**: concentrazione, pausa breve, pausa lunga, quante sessioni
  prima della pausa lunga, obiettivo giornaliero. Quattro preimpostati
  (25/5/15, 50/10/30, 90/20/30, 15/3/10) e avvio automatico delle pause.
- **La casa di Mora**: undici pezzi da pagare in paia di calzini (1, 3, 6, 10,
  15, 21, 28, 36, 45, 55, 66), disegnati uno alla volta, con il racconto che si
  scopre costruendo. Sessantasei paia sono 132 sessioni: un arco lungo mesi, che
  è il punto.
- **Attività senza limite**, ognuna con il suo colore: il calzino prende il
  colore dell'attività su cui hai lavorato.
- **Traguardi** che si accendono da soli guardando le sessioni.
- **Cose da fare**: una lista semplice da spuntare, con «togli le fatte».
- **La festa di fine sessione**: il calzino appena finito, quanti ne hai, e
  quanto manca al prossimo pezzo di casa.
- **Sette tavolozze**, tema chiaro/scuro/automatico, quattro accessori per Mora
  (cappellino, occhiali, grembiule, ditale) e **quattro pelli**: Mora, Neve,
  Cenere, Terra.
- **Suono** di fine sessione sintetizzato (nessun file da scaricare),
  **notifica** di sistema se il browser dà il permesso, **schermo acceso**
  mentre il timer va (Screen Wake Lock, dove c'è).
- **Esporta / importa** in JSON, e cancellazione completa.
- **Offline e installabile**: service worker e manifest, quindi «Aggiungi a
  schermata Home» funziona.

## Calzino Pro — 2 € al mese

Cambia tre cose:

- **Calzini ×2**: ogni sessione portata a termine ne mette due nel cassetto
  invece di uno, quindi la casa cresce il doppio più in fretta. Il secondo porta
  un marchio «2» e nel dettaglio dice da dove viene: il cassetto deve restare
  leggibile come registro del lavoro fatto, non diventare un mucchio.
- **Sessioni libere fino a sei ore** invece di due.
- **Decorazioni in più**: quattro decorazioni per la stanza (lucine, gatto,
  tazza, tende), due pelli di Mora (Oro, Notturna), quattro tavolozze
  (Tramonto, Menta, Lavanda, Rame), tre accessori (coroncina, papillon,
  fiorellino) e quattro fantasie per i calzini (righe, pois, rombi, punta a
  contrasto).

Sette giorni di prova gratuita, una volta sola. Alla scadenza le decorazioni Pro
si spengono ma **la scelta resta salvata**: rinnovando, ritrovi la tua tavolozza
dov'era. I calzini doppi già cuciti non spariscono mai — sono lavoro fatto.

### Come si incassa davvero

L'abbonamento si sblocca con un codice `CALZ-XXXX-XXXX-XXXX`:

```
node focus/tools/genera-codice.mjs          un codice da 31 giorni
node focus/tools/genera-codice.mjs 90 5     cinque codici da 90 giorni
```

Il giro completo, oggi: metti un link di pagamento (Stripe Payment Link o simili)
in `PAGAMENTO_URL` dentro `js/licenza.js`, e quando arriva un pagamento generi un
codice e lo mandi. Manuale, ma funziona da subito e senza server.

### Quanto tiene il lucchetto

Poco, e va detto: **il controllo del codice avviene nel browser**, con il sale
scritto nel sorgente. Chi apre `js/licenza.js` si fabbrica un codice in un
minuto, e chiunque può scrivere a mano la scadenza in `localStorage`. È una
porta chiusa, non una cassaforte: chi paga lo fa perché gli va che questa cosa
esista.

Per un lucchetto vero serve un server che chieda a chi incassa se
l'abbonamento è attivo. Il punto da sostituire è **uno solo**: la funzione
`verifica()` in `js/licenza.js`, che oggi guarda la forma del codice e domani
diventa una `fetch`. La firma non cambia, il resto dell'app non se ne accorge.

## Il patto sui distrattori

Focus Friend, sul telefono, spegne davvero le altre app. Questa è una pagina
web: **quel permesso non ce l'ha e non può averlo**, servirebbe un'app Android
nativa con i permessi di sistema. Dire il contrario sarebbe una bugia.

Quello che questa app può fare, e fa:

- tieni un elenco di ciò che ti ruba il tempo (Impostazioni → Distrattori);
- se esci dalla scheda mentre stai lavorando, l'uscita viene contata e al
  rientro te lo dice, elenco alla mano;
- in **modalità severa** uscire chiude la sessione: i minuti fatti restano nel
  registro, il calzino no.

Il conteggio aspetta mezzo secondo prima di scattare: ricaricare la pagina passa
per lo stesso evento, e un ricaricamento non è una fuga.

## Dove finiscono i dati

Nel `localStorage` di quel browser, su quel dispositivo: niente account, niente
invii in rete. Quindi svuotare i dati del browser cancella anche il cassetto, e
il cassetto non si sincronizza tra telefono e computer — per quello ci sono
**Esporta** e **Importa** (reimportare due volte lo stesso file non crea
doppioni).

## Il timer, tecnicamente

Il tempo si misura con l'istante di fine (`endsAt`), non contando i tick: il
conto resta giusto anche quando il browser rallenta i timer in sottofondo o il
telefono si blocca. Lo stato viene salvato a ogni cambio, mai a ogni tick,
quindi ricaricare la pagina riprende la sessione dove era.

## Installarla e pubblicarla

Da **Impostazioni → Installala sul telefono**: su Android il bottone chiede
l'installazione al browser, su iPhone l'app spiega la via del menù Condividi →
«Aggiungi a Home» (lì il gancio dell'installazione non esiste). L'icona per iOS
è un PNG a parte, `icona-apple-180.png`: iOS ignora l'SVG e la trasparenza.

Per gli store — che cosa cambia davvero, quanto costa, e perché il blocco delle
app resta impossibile anche impacchettata — c'è [PUBBLICARE.md](PUBBLICARE.md).

## Pubblicarla online

È un sito statico senza build: basta caricare la cartella così com'è. Con
GitHub Pages la pagina sta in `/focus/`; da HTTPS si attiva il service worker,
quindi l'app funziona offline e si installa sul telefono.

## Versione a file unico

```
node focus/build.mjs
```

Rigenera dagli stessi sorgenti due file dentro `focus/dist/`:

- `calzino.html` — la stessa app in un solo file, con CSS, JavaScript e icona
  già dentro: si apre con un doppio clic, si manda per email, sta su una
  chiavetta;
- `artifact.html` — lo stesso contenuto senza `<html>`/`<head>`/`<body>`, per
  gli host che avvolgono loro la pagina.

Sono file generati: si modificano i sorgenti e si rilancia il comando, mai il
contrario. Il build si ferma con un errore se non ritrova quello che deve
sostituire.

## Struttura

```
index.html              markup delle quattro schermate e i disegni (la stanza, Mora, la casa)
css/styles.css          stile, tavolozze, i colori di Mora e della casa
js/storage.js           impostazioni, attività e sessioni su localStorage
js/licenza.js           abbonamento Pro: prova, codici, scadenza
js/timer.js             fasi, modo libero, suono, notifiche, schermo acceso
js/app.js               interfaccia, casa, cassetto, statistiche, import/export
sw.js                   cache offline
manifest.webmanifest    installazione come app
icon.svg                icona
build.mjs               genera la versione a file unico in dist/
tools/genera-codice.mjs genera i codici di sblocco del Pro
```

Nessuna dipendenza e nessuna compilazione per lavorarci: si modifica un file e
si ricarica la pagina.

## Parentela con Focus Friend

L'idea — un timer con una creatura che lavora mentre lavori tu, una stanza che
si arreda completando sessioni, un abbonamento che dà decorazioni e premi più
in fretta — viene da *Focus Friend* di Hank Green. Anche l'impianto è
volutamente simile: la scena del personaggio in cima, il timer sotto, la barra
in basso, i colori caldi, le pelli del protagonista.

Quello che **non** viene da lì, e non deve: il personaggio (una talpa, non il
suo fagiolo), i disegni, il nome, il codice, i testi. Sono tutti originali. Le
meccaniche di un genere si possono riprendere — la forma di un'app non è di
nessuno — ma l'espressione di un'opera è protetta dal diritto d'autore, e
copiarla non è un dettaglio legale: è la differenza fra fare la propria cosa e
prendere quella di un altro.

Due cose restano nostre anche come idea: la casa da costruire come arco lungo
(lì la stanza si arreda comprando, qui si costruisce un pezzo alla volta con una
storia da leggere) e il fatto che il lucchetto del Pro sia dichiarato per quello
che è.
