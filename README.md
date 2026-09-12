# Leggi di più

Cerca fra i libri del mondo, leggine la trama, poi tieni il conto di quello che
leggi — e mettiti alla prova raccontandolo a una bambina di sei anni. Per entrare
serve solo un **nome utente**: niente password, niente email, niente server.

## Come si usa

1. Apri `index.html` (doppio clic va benissimo) oppure il sito pubblicato.
2. Scrivi un nome utente e premi **Entra**. Se non esiste, viene creato.
3. **Libreria** → cerca fra i libri del mondo, leggi di che cosa parlano, scegli.
4. **Nuova lettura** → titolo, pagine lette, e le domande sul contesto.
5. **Diario** → tutte le letture, in ordine di data, con ricerca e filtro per libro.
6. **Profilo** → pagine totali, giorni di fila, pagine della settimana, grafico degli
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

## La libreria

La scheda **Libreria** è un catalogo mondiale vero: oltre quaranta milioni di
opere da Open Library, con trame, copertine, edizioni e autori.

**Cercare.** Cinque modalità — Tutto, Titolo, Autore, Argomento, ISBN — con
filtro di lingua (sette lingue) e quattro ordinamenti: più pertinenti, più
celebri (cioè con più edizioni pubblicate), più recenti, più antichi. Il
conteggio è quello reale del catalogo, e **Carica altri** scorre pagina per
pagina: da «calvino» arrivano millecinquecento risultati veri, non i primi venti.

**Sfogliare.** Quando non stai cercando niente trovi dodici scaffali da
scorrere di lato — Classici, Per ragazzi, Avventura, Fantasy, Fantascienza,
Gialli, Storia, Biografie, Poesia, Umorismo, Filosofia, Scienza. Ogni scaffale
si carica quando sta per entrare nello schermo, non tutti insieme all'avvio.

**Gli autori.** Se quello che cerchi è il nome di un autore, sopra i risultati
compare la sua scheda: date, numero di opere, biografia, e un pulsante per
vedere tutto quello che ha scritto. Lo stesso collegamento è dentro la scheda
di ogni libro.

**La scheda di un libro.** Copertina, di che cosa parla, la trama completa
dietro un clic, i temi in italiano, e una scheda catalografica vera: prima
pubblicazione, pagine, numero di edizioni, editori, lingue in cui esiste, ISBN.

**I tuoi scaffali.** Ogni libro può stare su *Da leggere*, *Sto leggendo*,
*Letti* o *Abbandonati*. Gli scaffali restano nel profilo, compaiono in cima
alla libreria e finiscono nell'export insieme al diario. Una bandierina sulla
copertina dice dove sta un libro che hai già sistemato.

### Da dove vengono i dati

| Fonte | Che cosa dà |
|---|---|
| [Open Library](https://openlibrary.org) | catalogo, copertine, scaffali per argomento, autori, edizioni |
| [Wikipedia italiana](https://it.wikipedia.org) | la trama vera, presa dalla sezione «Trama» della voce |
| [Google Books](https://books.google.com) | la descrizione dell'editore, come ripiego |

Tutte e tre rispondono con `access-control-allow-origin: *`, quindi la pagina le
interroga direttamente, senza chiavi e senza un server in mezzo.

### Perché regge

- **Cache.** Ogni risposta resta in memoria e in `sessionStorage` per mezz'ora:
  tornare su una ricerca già fatta non produce nessuna chiamata.
- **Ritentativi.** Open Library limita le richieste. Un 429 o una connessione
  chiusa vengono ritentati con attesa crescente invece di diventare una
  schermata vuota.
- **Richieste in volo deduplicate.** Due domande identiche contemporanee
  diventano una sola.
- **La trama giusta o nessuna.** La voce di Wikipedia viene accettata solo se il
  titolo corrisponde davvero al libro: meglio niente che la trama di un altro
  libro.
- **Copertine.** Se l'immagine non arriva — o resta appesa — dopo tre secondi e
  mezzo ne viene disegnata una col titolo dentro.
- **Senza rete.** Resta un catalogo interno di cinquanta titoli e la ricerca
  continua a funzionare.

## Raccontalo a Nina

Nina ha sei anni e ti ascolta raccontare il libro che stai leggendo.

Non è un vezzo: è il metodo di Feynman. Chi ha capito una cosa la sa dire con
parole semplici; chi non l'ha capita si nasconde dietro parole difficili. Nina
non le accetta: se gliene dici una, ti chiede che cosa vuol dire, e per
risponderle devi averla capita davvero.

Come funziona:

- Nina **conosce la storia vera** (le arriva il dossier raccolto in rete) ma fa
  finta di no: vuole che sia tu a raccontargliela.
- Se dici qualcosa che non torna, non ti corregge come farebbe un adulto: si
  stupisce. «Ah sì? Io pensavo che…».
- Risponde in massimo sessanta parole e finisce sempre con una domanda da
  bambina — quelle che vanno dritte al punto che hai saltato.
- **Come sto andando?** la fa uscire dal personaggio: arriva un voto di chiarezza
  da 1 a 5 e tre righe su che cosa è arrivato, che cosa è rimasto confuso e quale
  parte del libro sembra non essere stata capita.

Dove il browser lo permette c'è anche il **microfono**: raccontare a voce è più
naturale che scrivere, ed è esattamente il gesto che l'esercizio richiede.

Nina si raggiunge dalla scheda di un libro in libreria, e da ogni lettura del
diario.

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

## Una nota sulla versione pubblicata come artifact

Una pagina pubblicata come artifact su claude.ai non ha il permesso di chiamare
servizi esterni. Lì la ricerca online, le trame e le chiamate all'API non
possono funzionare: restano il catalogo interno e la strada del copia e incolla,
e l'app lo dice invece di fallire in silenzio.

Per avere tutto — catalogo mondiale, trame da Wikipedia e Claude dentro l'app —
va aperta in locale (`index.html` o `dist/leggi-di-piu.html`) oppure pubblicata
su GitHub Pages.

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
index.html              markup di tutte le schermate
css/styles.css          stile (verde #202B22 + giallo #FFD85F, chiaro e scuro)
js/storage.js           profili e letture su localStorage
js/books.js             catalogo, trame e dossier dalle fonti pubbliche
js/ai.js                chiamate a Claude e costruzione dei prompt
js/app.js               interfaccia, libreria, Nina, statistiche
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
calzino, due calzini fanno un paio, e con i paia Mora si costruisce la casa —
undici pezzi da pagare lavorando. Timer a tempo o libero, e un Pro da 2 € al
mese che raddoppia i calzini. Stessa filosofia: sito statico, nessuna
dipendenza, dati solo nel browser. Si apre da `focus/index.html`, e ha il suo
[README](focus/README.md).
