# Calzino

Un timer di concentrazione con una compagna di lavoro: **Mora**, la talpa che
sferruzza. Quando il timer parte lei prende i ferri; quando la sessione arriva
in fondo, nel cassetto c'è **un calzino**. Due calzini fanno **un paio**.

Un calzino per sessione, sempre. Niente monete, niente premi che vanno più
veloce se paghi, niente versione Pro: quello che c'è, c'è per tutti.

## Come si usa

1. Apri `index.html` (doppio clic va benissimo) oppure il sito pubblicato.
2. **Timer** → scegli l'attività, premi **Avvia** e lascia perdere il telefono.
3. **Cassetto** → i calzini fatti, appaiati due a due, e i traguardi.
4. **Statistiche** → oggi, la striscia di giorni, gli ultimi 14 giorni, il tempo
   per attività, il registro delle sessioni.
5. **Impostazioni** → durate, avvisi, distrattori, aspetto, dati.

Scorciatoie da tastiera: barra spaziatrice avvia o mette in pausa, `R` azzera,
`S` salta alla fase dopo.

## Che cosa c'è dentro

- **Durate libere**: concentrazione, pausa breve, pausa lunga, quante sessioni
  prima della pausa lunga, obiettivo giornaliero. Quattro preimpostati
  (25/5/15, 50/10/30, 90/20/30, 15/3/10) e avvio automatico delle pause.
- **Attività senza limite**, ognuna con il suo colore: il calzino prende il
  colore dell'attività su cui hai lavorato.
- **Traguardi** che si accendono da soli guardando le sessioni.
- **Sei tavolozze**, tema chiaro/scuro/automatico e quattro accessori per Mora
  (cappellino, occhiali, grembiule, ditale). Tutti disponibili da subito.
- **Suono** di fine sessione sintetizzato (nessun file da scaricare),
  **notifica** di sistema se il browser dà il permesso, **schermo acceso**
  mentre il timer va (Screen Wake Lock, dove c'è).
- **Esporta / importa** in JSON, e cancellazione completa.
- **Offline e installabile**: service worker e manifest, quindi «Aggiungi a
  schermata Home» funziona.

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
index.html              markup delle quattro schermate
css/styles.css          stile, tavolozze, il disegno di Mora
js/storage.js           impostazioni, attività e sessioni su localStorage
js/timer.js             fasi, conteggio, suono, notifiche, schermo acceso
js/app.js               interfaccia, cassetto, statistiche, import/export
sw.js                   cache offline
manifest.webmanifest    installazione come app
icon.svg                icona
build.mjs               genera la versione a file unico in dist/
```

Nessuna dipendenza e nessuna compilazione per lavorarci: si modifica un file e
si ricarica la pagina.

## Parentela con Focus Friend

L'idea — un timer con una creatura che lavora mentre lavori tu — viene da
*Focus Friend* di Hank Green. Qui non c'è niente di suo: personaggio, disegni,
nome e codice sono originali, e le cose che lì stanno dietro l'abbonamento
(decorazioni, ritmo dei premi) qui non sono un abbonamento: sono l'app.
