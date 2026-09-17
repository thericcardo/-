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
filtro di lingua (italiano, inglese, francese, spagnolo, tedesco, giapponese,
oppure tutte) e quattro ordinamenti: più pertinenti, più
celebri (cioè con più edizioni pubblicate), più recenti, più antichi. Il
conteggio è quello reale del catalogo, e **Carica altri** scorre pagina per
pagina: da «calvino» arrivano millecinquecento risultati veri, non i primi venti.

**Dove pesca il catalogo interno.** Tre fonti, perché da una sola escono sempre
gli stessi nomi: il catalogo intero di Project Gutenberg (da cui vengono i
**19.982 autori presenti con una sola opera** — il sommerso che nessuna
classifica nomina, e tutte opere da leggere gratis), Open Library interrogata
per autore (compresi i mangaka: di Tezuka 50 opere, di Oda 51, di Takahashi
59), e Open Library interrogata per argomento scendendo fino alla quarta pagina,
dove cominciano i libri che non stanno in vetrina.

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
| [Internet Archive](https://archive.org) | il testo intero dei libri di dominio pubblico, da leggere nell'app |
| [Project Gutenberg](https://www.gutenberg.org) | il catalogo del dominio pubblico: il grosso degli autori poco noti |
| [Wikipedia italiana](https://it.wikipedia.org) | la trama vera, presa dalla sezione «Trama» della voce |
| [Google Books](https://books.google.com) | la descrizione dell'editore, come ripiego |

Open Library, Internet Archive, Wikipedia e Google Books rispondono con
`access-control-allow-origin: *`, quindi la pagina le interroga direttamente,
senza chiavi e senza un server in mezzo. Project Gutenberg no: il suo catalogo
viene scaricato una volta da `tools/aggiorna-catalogo.mjs` e finisce dentro
l'app, e i suoi testi si aprono in una scheda nuova del browser.

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
- **Senza rete.** Restano 80.862 opere di 28.191 autori dentro il file, e
  continuano a funzionare la ricerca, i dodici scaffali e le schede.

## Il collegamento fra libreria e diario

Le due metà si parlano, ed è quello che rende l'app una sola cosa.

**Comincia a leggerlo**, dalla scheda di un libro, lo mette su *Sto leggendo* e
apre il diario col titolo già compilato — e con la pagina di partenza giusta, se
di quel libro hai già letto qualcosa.

Da lì in poi l'app sa **a che punto sei**: sullo scaffale *Sto leggendo* le
copertine hanno una riga di avanzamento e dicono «pagina 137 di 275»; la scheda
del libro lo ripete con la percentuale. Il conto usa la pagina più avanti che
hai raggiunto, non la somma delle pagine lette: rileggere venti pagine non fa
avanzare di venti.

Quando segni una lettura che arriva **all'ultima pagina**, il libro passa da solo
su *Letti* e l'app te lo dice. Nel profilo compare fra i **libri finiti**
dell'anno.

Le copertine che la libreria ha già visto ricompaiono nel diario e nell'elenco
dei libri del profilo: un libro ha la stessa faccia in tutta l'app.

## Leggere i libri, non solo le trame

Delle opere di dominio pubblico l'app non ha soltanto la scheda: ha il testo.
**59.435** titoli del catalogo si possono aprire e leggere — dai *Promessi
sposi* a *Frankenstein*, da *Pinocchio* a *Moby Dick*.

Sulla scheda di un libro compare **Leggi il libro**. Il testo arriva da
[Internet Archive](https://archive.org), che è l'unica delle fonti pubbliche a
mandare `access-control-allow-origin: *` anche sui file scaricati — quindi
l'unica da cui una pagina può prendere un libro intero e mostrarlo dentro di
sé. Project Gutenberg quell'intestazione non la manda: i suoi testi si aprono,
ma in una scheda nuova del browser.

La strada è in tre passi, perché il nome del file non si può indovinare: si
cerca l'opera fra i testi, si chiedono i metadati che elencano i file veri, si
scarica il testo. Poi si impagina tagliando su una riga vuota o in fondo a una
frase, mai a metà di una parola.

Il testo delle scansioni è riconosciuto da una macchina e porta i suoi segni:
numeri di pagina isolati, parole spezzate dal trattino, la copertina e il
timbro della biblioteca nelle prime righe, ogni riga stampata presa per un
paragrafo. Tutto questo viene ricucito prima di mostrarlo — ma qualche parola
resta storta, e l'app lo dice invece di far finta. Della stessa opera ci sono
molte copie e quale si legga meglio non si può sapere prima di aprirla: nessuna
misura automatica le distingue in modo affidabile (le buone e le rovinate
stanno tutte fra 0,99 e 1,00 di caratteri leggibili). Quindi la scelta resta a
chi legge, e **provarne un'altra costa un tocco**.

Le scansioni **in prestito** restano fuori: dichiarano il file di testo ma lo
scaricano vuoto, e soprattutto non sono opere che si possono leggere
liberamente. Senza quel filtro le prime cinque risposte erano tutte in prestito
e il lettore tornava a mani vuote pur avendo il libro a due risposte di
distanza.

### Il segno si tiene da solo

Nel lettore non c'è niente da annotare. La posizione si salva **ogni dieci
secondi**, a ogni cambio pagina, e ogni volta che si esce dalla pagina — sia
passando a un'altra scheda, sia chiudendo il browser. Se la pagina muore fra
due battiti si perde al massimo il conto di dieci secondi.

Quello che il lettore registra finisce nel diario in una sezione a parte,
**Registrate dal lettore**: per ogni libro la pagina più avanti raggiunta, su
quante, quanti minuti di lettura e quante volte l'hai ripreso. È tenuto separato
dal diario scritto a mano di proposito: una cosa è quello che hai deciso di
annotare, un'altra quello che è stato solo misurato. Arrivare all'ultima pagina
sposta il libro su *Letti* da solo.

Il tempo si conta per pagina e si fermano i conti a cinque minuti per pagina:
una pagina aperta per un'ora vuol dire che qualcuno è andato a cena, non che ha
letto per un'ora.

## One Piece, dal volume 1 al 115

One Piece è di Eiichirō Oda e della Shūeisha. Il suo testo non esiste in
nessuna fonte libera, e l'app non lo contiene: il lettore interno apre solo le
opere di dominio pubblico, e per un manga in commercio non ci sarà mai niente
da aprire. Quello che si può fare — e che l'app fa — è raccontarlo.

C'è una **guida** con i dati veri di tutti i **115 volumi**: numero, titolo
dell'edizione italiana Star Comics, titolo giapponese in kanji, romaji, e i
capitoli contenuti (dal 1 al 1179, senza un buco). I dati vengono dall'elenco
di it.wikipedia, che cita i volumi Shūeisha e l'edizione italiana.

La **trama** è scritta qui, arco per arco, nelle sei lingue chieste: italiano,
inglese, giapponese, francese, spagnolo, tedesco. Sono i **venti archi** della
suddivisione ufficiale della serie, dal Mare Orientale a Erbaf, ognuno con il
suo intervallo di volumi e capitoli. Il selettore in cima alla guida cambia la
lingua di tutto, comprese le schede dei singoli volumi.

Perché arco e non volume: un volume è una fetta di carta, decisa da quante
pagine entrano in un tankōbon. Un arco è una storia con un inizio e una fine.
Chi chiede «di che cosa parla il volume 37» vuole sapere che cosa succede a
Water Seven, non i tre capitoli che avanzano — e la scheda del volume dice
comunque quali capitoli contiene.

Cercando «One Piece» in libreria escono tutti i 115 volumi; cercando «One
Piece 37» quel volume viene per primo. La trama compare **senza rete e senza
chiave API**: è dentro il file.

### Si apre come un ebook

**Leggilo come un libro** apre One Piece nello stesso lettore che apre
Frankenstein: **137 pagine** impaginate — una di apertura, una per ciascuno dei
venti archi, una per ciascuno dei 115 volumi, una di chiusura con i canali
ufficiali. Si sfoglia con i bottoni o con le frecce, il corpo del testo si
ingrandisce, e il segno si salva da solo ogni dieci secondi come per gli altri
libri; la lettura finisce fra quelle **registrate dal lettore**, nel diario.

Ogni volume ha la **sua** pagina e la **sua** trama: quaranta righe di
differenza fra il volume 2 e il volume 104, non la stessa riga ripetuta. Le
trame per singolo volume sono scritte in italiano; nelle altre cinque lingue la
pagina di un volume porta la trama del suo arco — meno fine, ma completa, e con
titolo, titolo originale e capitoli sempre esatti.

Non è il manga, e la prima pagina lo dice chiaramente in tutte e sei le lingue,
col nome di chi ne detiene i diritti. È la cosa più vicina a un ebook che di
questa serie si possa fare onestamente.

In fondo alla guida ci sono i posti dove leggerlo per davvero, e sono soltanto
canali ufficiali — [MANGA Plus](https://mangaplus.shueisha.co.jp/titles/100020)
del suo editore, dove i primi tre e gli ultimi tre capitoli sono gratis;
[Viz](https://www.viz.com/shonenjump/chapters/one-piece);
[Star Comics](https://www.starcomics.com/serie/one-piece) per l'edizione
italiana su carta. I siti che caricano scansioni non autorizzate non ci sono, e
una prova in `tools/controlla-catalogo.mjs` fallisce se qualcuno ce li mette.

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

La chiave API **non può crearla l'app né nessun altro**: è legata al tuo
account Anthropic e al tuo metodo di pagamento. In *Profilo → Claude* ci sono i
quattro passi per farla, con il link diretto alla pagina giusta.

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

Perché quel «resta il catalogo interno» volesse dire qualcosa, il catalogo è
stato costruito sul serio: **80.862 opere di 28.191 autori**, di cui **59.435
da leggere gratis**. Cercando un autore escono i suoi libri ordinati per quante
volte sono stati ristampati — di Stephen King prima *Carrie*, *Shining* e *It*,
non gli atti di un convegno — e i dodici scaffali si riempiono lo stesso.
`tools/controlla-catalogo.mjs` dice subito se qualche ricerca ha smesso di
funzionare.

Nella versione pubblicata il catalogo viaggia come file a parte
(`dist/catalogo.js`, 4,8 MB) invece che dentro la pagina: così la pagina si apre
subito, il catalogo arriva in parallelo e il browser lo tiene in cache. La
versione autosufficiente (`dist/leggi-di-piu.html`) se lo porta dentro, perché
quel file deve funzionare anche da una chiavetta, senza niente accanto.

Per avere tutto — catalogo mondiale, trame da Wikipedia e Claude dentro l'app —
va aperta in locale (`index.html` o `dist/leggi-di-piu.html`) oppure pubblicata
su GitHub Pages.

## Installarla sul telefono

L'app è installabile davvero: manifest completo, icone PNG nelle misure che
Android e iOS si aspettano (192, 512, una maskable per il ritaglio circolare di
Android, e una da 180 per iOS), e service worker che la fa funzionare offline.
Da Chrome o Safari: *Aggiungi a schermata Home*. Le due scorciatoie dell'icona
— «Cerca un libro» e «Segna una lettura» — aprono direttamente la sezione giusta.

Le icone PNG sono generate dall'unico disegno, `icon.svg`:

```
node tools/genera-icone.mjs
```

Lo strumento usa Chromium via Playwright, che qui è una dipendenza da sviluppo e
non dell'app: il sito resta statico e senza dipendenze.

## Dettagli che si notano usandola

- **Il tasto Indietro** del telefono chiude la scheda di un libro o la chat con
  Nina, invece di far uscire dall'app. Anche `Esc` lo fa, e senza lasciare stati
  orfani nella cronologia.
- **`/`** porta alla ricerca da qualsiasi sezione.
- **Quando il catalogo non risponde** compare un «Riprova», non un vicolo cieco.
- **Le copertine** pulsano mentre arrivano e, se non arrivano entro tre secondi e
  mezzo, ne viene disegnata una col titolo dentro.
- **Chi non ha ancora letto niente** entra dalla libreria; chi legge già entra
  dal diario, che è il gesto che ripete ogni giorno.
- **«Stai leggendo»**, in cima al form, riempie titolo, autore e pagina di
  partenza con un tocco: segnare le pagine della sera non richiede di
  ridigitare il titolo che l'app già conosce.

## Accessibilità

```
npx http-server -p 8124 -s          # in un altro terminale
node tools/controlla-accessibilita.mjs
```

Su ognuna delle cinque schermate, in tema chiaro e in tema scuro, lo strumento
verifica il contrasto di ogni testo visibile secondo le soglie WCAG AA, che ogni
comando abbia un nome leggibile da uno screen reader, e che ogni immagine abbia
un `alt`. Oggi passa tutto.

Il calcolo del contrasto è la parte delicata, e due trappole producono allarmi
falsi a decine: **l'alfa** — un giallo al 12% su verde scuro non è giallo su
giallo, e va sovrapposto al colore sotto prima di misurare — e i **gradienti**,
perché un elemento con solo un gradiente ha `backgroundColor` trasparente, e
risalire l'albero porterebbe a confrontare il testo con lo sfondo della pagina.
Per questo le copertine disegnate hanno un `background-color` esplicito sotto il
gradiente: è più robusto, e rende il contrasto misurabile.

Lo strumento dice anche quanti elementi ha valutato e quanti ha saltato: un
risultato verde da un controllo che non controlla niente non vale niente.

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
js/catalogo.js          il catalogo che viaggia dentro l'app (generato)
js/onepiece.js          i 115 volumi di One Piece e la trama in sei lingue
js/lettore.js           il lettore: trova il testo, lo impagina, tiene il segno
js/books.js             catalogo, trame e dossier dalle fonti pubbliche
js/ai.js                chiamate a Claude e costruzione dei prompt
js/app.js               interfaccia, libreria, Nina, statistiche
sw.js                   cache offline
manifest.webmanifest    installazione come app
icon.svg                icona
build.mjs               genera la versione a file unico in dist/
tools/genera-icone.mjs  rifà le icone PNG da icon.svg
tools/aggiorna-catalogo.mjs         rigenera js/catalogo.js da Open Library
tools/controlla-catalogo.mjs        prova le ricerche sul catalogo interno
tools/controlla-lettore.mjs         prova che i libri si aprano ancora (serve la rete)
tools/controlla-accessibilita.mjs   contrasti, nomi accessibili, alt
icona-*.png             icone per l'installazione su telefono
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
