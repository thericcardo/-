# Portare Calzino sugli store

Domanda giusta, risposta scomoda: **da qui non si pubblica**. Servono un account
di sviluppatore intestato a una persona, una carta di credito e — per Apple — un
Mac. Nessuna di queste tre cose sta in questa cartella. Quello che c'è qui è
tutto il resto: l'app pronta, le icone giuste, e i passi esatti da fare.

## Prima di tutto: forse non ti serve nessuno store

Calzino è già installabile. Su Android il browser propone «Installa»
(Impostazioni → Installala sul telefono); su iPhone si fa da Condividi →
«Aggiungi a Home». In tutti e due i casi parte a tutto schermo, con la sua
icona, e funziona senza rete.

Cosa cambia davvero passando dagli store:

|                         | Sito installabile | Play Store | App Store |
|-------------------------|-------------------|------------|-----------|
| Costo                   | zero              | 25 $ una volta | 99 $ l'anno |
| Serve un Mac            | no                | no         | **sì**    |
| Tempi di revisione      | nessuna revisione | ore/giorni | giorni    |
| Si trova cercando       | no                | sì         | sì        |
| Blocco delle altre app  | **impossibile**   | possibile (va riscritta nativa) | no |
| Abbonamento a 2 €       | come vuoi         | pagamenti Google, 15–30 % | pagamenti Apple, 15–30 % |

La riga che conta è l'ultima delle funzioni: **il blocco delle app resta
impossibile finché è una pagina web**, anche impacchettata dentro uno store.
Impacchettarla ti dà la vetrina, non la funzione.

## Play Store (Android) — la strada corta

Android accetta un sito installabile impacchettato come app (**TWA**, Trusted
Web Activity): l'app è un guscio che apre il tuo sito a tutto schermo.

1. Pubblica la cartella `focus/` su un indirizzo HTTPS stabile (GitHub Pages
   basta: Settings → Pages → branch, cartella `/ (root)`).
2. Account: 25 $ una volta su <https://play.google.com/console> (serve un
   documento d'identità; per gli account personali Google chiede anche un
   periodo di prova chiusa prima della pubblicazione — informati sulle regole
   in vigore quando lo fai).
3. Sulla tua macchina, con Node installato:
   ```
   npx @bubblewrap/cli init --manifest https://TUO-INDIRIZZO/focus/manifest.webmanifest
   npx @bubblewrap/cli build
   ```
   Sputa un `.aab` firmato: quello si carica sul Play Console.
4. Bubblewrap stampa un'impronta della chiave di firma. Va messa in
   `.well-known/assetlinks.json` sul tuo sito, altrimenti l'app mostra la barra
   del browser invece di sembrare un'app.

Serve anche il materiale della scheda: descrizione, almeno due schermate per
formato, un'icona 512×512 (c'è: `icona-512.png`), una grafica di testata
1024×500 e una pagina con l'informativa privacy. Per Calzino l'informativa è
corta e vera: **nessun dato lascia il dispositivo**.

## App Store (iPhone) — la strada lunga

1. **Serve un Mac** con Xcode: non è aggirabile, la firma delle app iOS avviene
   lì. 99 $ l'anno per l'Apple Developer Program.
2. Si impacchetta con Capacitor:
   ```
   npm install @capacitor/cli @capacitor/core @capacitor/ios
   npx cap init Calzino it.calzino.app --web-dir focus
   npx cap add ios
   npx cap open ios
   ```
3. **Il rischio vero è il rifiuto.** La linea guida 4.2 di Apple («minimum
   functionality») boccia le app che sono solo un sito impacchettato. Calzino ha
   dalla sua timer, notifiche, dati locali e una progressione, ma per passare va
   presentata come app vera: notifiche di sistema, icona e schermata d'avvio
   native, niente barre del browser. Mettere in conto almeno un rifiuto e una
   revisione.
4. **L'abbonamento da 2 € va rifatto.** Dentro un'app iOS un abbonamento
   digitale deve passare dagli acquisti in-app di Apple (15 % con lo Small
   Business Program, 30 % sopra il milione di dollari): il sistema di codici
   `CALZ-...` che c'è adesso, e qualsiasi link a un pagamento esterno, sono
   motivo di rifiuto. Va sostituito con `StoreKit`, il che implica un backend
   che verifichi le ricevute — l'esatto contrario dell'app senza server che è
   oggi.

## Il consiglio, in una riga

Pubblica il sito e installalo: è gratis, è immediato, e chi lo usa ottiene il
99 % di quello che gli store darebbero. Vai su Play solo se ti serve che la
gente la *trovi* cercando; vai su App Store solo se sei disposto a un Mac, a 99 $
l'anno e a riscrivere gli abbonamenti.
