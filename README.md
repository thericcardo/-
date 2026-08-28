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

## Struttura

```
index.html              markup delle tre schermate
css/styles.css          stile (verde #202B22 + giallo #FFD85F, chiaro e scuro)
js/storage.js           profili e letture su localStorage
js/app.js               interfaccia, statistiche, import/export
sw.js                   cache offline
manifest.webmanifest    installazione come app
icon.svg                icona
```

Nessuna dipendenza, nessun passaggio di compilazione: si modifica un file e si
ricarica la pagina.
