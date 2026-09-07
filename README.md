# Leggi di più

Un diario di lettura essenziale: segni **titolo**, **pagine lette** e rispondi alle
**domande sul contesto**; l'app tiene il conto sul tuo profilo. Per entrare serve
solo un **nome utente** — niente password, niente email, niente server.

## Come si usa

1. Apri `index.html` (doppio clic va benissimo) oppure il sito pubblicato.
2. Scrivi un nome utente e premi **Entra**. Se non esiste, viene creato.
3. **Nuova lettura** → titolo, pagine lette, e le domande sul contesto.
4. **Diario** → tutte le letture, in ordine di data, con ricerca e filtro per libro.
5. **Profilo** → pagine totali, giorni di fila, pagine della settimana, grafico degli
   ultimi 14 giorni, elenco dei libri e obiettivo giornaliero.

Più persone possono usare lo stesso dispositivo: ogni nome utente ha il suo diario
separato, e da **Cambia utente** si passa dall'uno all'altro.

## Le domande sul contesto

A ogni lettura l'app propone sei domande. Non sono obbligatorie: bastano una o due,
e servono a fissare quello che hai letto invece di dimenticarlo alla pagina dopo.

1. Di che cosa parlano le pagine che hai letto?
2. Chi o che cosa è al centro?
3. Dove e quando si svolge? In quale contesto si colloca?
4. Che cosa hai imparato o scoperto?
5. C'è qualcosa che non hai capito?
6. Che cosa pensi che succederà? Che cosa vuoi scoprire?

Puoi aggiungerne di tue con **+ Aggiungi una tua domanda**.

## Claude come compagno di lettura

Tre punti dell'app chiedono aiuto a Claude:

- **Domande su misura** (nel form) — tre domande pensate per quel libro e per le
  pagine appena lette, che finiscono nel form pronte da compilare;
- **Commento di Claude** (su ogni lettura del diario) — legge quello che hai
  scritto, dice che cosa resta vago e chiude con una domanda che ti riporta al
  testo; il commento resta salvato insieme alla lettura;
- **Dove eravamo rimasti** (sui libri, nel profilo) — riassume i tuoi appunti
  precedenti prima che tu riprenda il libro.

A Claude viene chiesto di non anticipare mai nulla oltre le pagine indicate: il
diario non deve diventare una fonte di spoiler.

**Con una chiave API** (da `console.anthropic.com`, incollata in *Profilo →
Claude*) le risposte arrivano dentro l'app. La chiave resta in questo browser,
in una voce di `localStorage` separata dai diari, e non entra mai nell'export;
chi usa il dispositivo però può leggerla, quindi non va messa su un computer
condiviso. Ogni richiesta è conteggiata sul tuo account Anthropic.

**Senza chiave** — o dove la pagina non può chiamare servizi esterni — l'app
prepara comunque la domanda completa da copiare e incollare in Claude, e per le
domande su misura ti offre un campo dove riportare dentro la risposta. Questa
strada funziona ovunque e non costa niente.

Le chiamate usano `fetch` verso l'API di Anthropic invece dell'SDK ufficiale,
perché l'SDK richiederebbe npm e un bundler e l'app deve restare un sito statico
apribile con un doppio clic.

## Dove finiscono i dati

Tutto resta nel `localStorage` del browser, su quel dispositivo: nessuna
registrazione, nessun invio in rete. Due conseguenze pratiche:

- svuotare i dati del browser cancella anche il diario;
- il diario non si sincronizza tra telefono e computer.

Per questo in **Profilo → I tuoi dati** ci sono **Esporta** (scarica un `.json`) e
**Importa** (rimette dentro un file esportato, saltando le letture già presenti).

## Pubblicarla online

È un sito statico senza build: basta caricare la cartella così com'è.

Con GitHub Pages: *Settings → Pages → Source: Deploy from a branch*, scegli il
branch e la cartella `/ (root)`. Da HTTPS si attiva anche il service worker, quindi
l'app funziona offline e si può installare sul telefono con «Aggiungi a schermata
Home».

## Versione a file unico

```
node build.mjs
```

Rigenera dagli stessi sorgenti due file dentro `dist/`:

- `leggi-di-piu.html` — la stessa app in un solo file, con CSS, JavaScript e
  icona già dentro: si apre con un doppio clic, si manda per email, sta su una
  chiavetta;
- `artifact.html` — lo stesso contenuto senza `<html>`/`<head>`/`<body>`, per gli
  host che avvolgono loro la pagina.

Sono file generati: si modificano i sorgenti e si rilancia il comando, mai il
contrario. Il build si ferma con un errore se non ritrova quello che deve
sostituire, così non produce silenziosamente una versione monca.

## Struttura

```
index.html              markup delle tre schermate
css/styles.css          stile (verde #202B22 + giallo #FFD85F, chiaro e scuro)
js/storage.js           profili e letture su localStorage
js/ai.js                chiamate a Claude e costruzione dei prompt
js/app.js               interfaccia, statistiche, import/export
sw.js                   cache offline
manifest.webmanifest    installazione come app
icon.svg                icona
build.mjs               genera la versione a file unico in dist/
```

Nessuna dipendenza e nessuna compilazione per lavorarci: si modifica un file e si
ricarica la pagina.

## E accanto: Calzino

In `focus/` c'è una seconda app, indipendente da questa: **Calzino**, un timer
di concentrazione con Mora, la talpa che sferruzza — ogni sessione finita è un
calzino, due calzini fanno un paio, e con il Pro a 1 € al mese i calzini sono
due per sessione. Stessa filosofia: sito statico, nessuna dipendenza, dati solo
nel browser. Si apre da `focus/index.html`, e ha il suo
[README](focus/README.md).
