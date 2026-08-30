# Panigale V4 — Anatomia della Velocità

Un sito web open source dedicato alla **Ducati Panigale V4 S**: modello 3D
generato via codice, animazioni pilotate dallo scroll e suono del motore
sintetizzato in tempo reale.

**Non c'è un solo asset binario nel repository.** Nessun `.glb`, nessuna
texture `.png`, nessun campione audio `.wav`. La moto è geometria procedurale,
le mappe PBR sono disegnate su `<canvas>` all'avvio e il V4 è sintetizzato
partendo dal suo ordine di scoppio reale.

---

## Provare il sito

Serve un server statico qualsiasi — non c'è build step, non ci sono dipendenze
da installare:

```bash
python3 -m http.server 8080
# poi apri http://localhost:8080
```

Aprire `index.html` con un doppio clic **non** funziona: i moduli sono caricati
come script classici ma il browser applica comunque restrizioni `file://` alle
texture generate da canvas.

Requisiti: un browser con WebGL. Senza, la pagina resta leggibile e mostra un
avviso al posto della scena.

---

## Come è fatto

Sei moduli indipendenti, nessuno dei quali conosce gli altri. Comunicano
attraverso un unico oggetto di stato:

```
{ chapter, progress, rpm, throttle, speed, exploded, paintColor }
```

`ui.js` lo **produce** leggendo lo scroll; `scene.js` e `engine-audio.js` lo
**consumano**. È l'unico accoppiamento del progetto.

| File | Ruolo |
|---|---|
| `js/materials.js` | Libreria PBR procedurale: rumore tileable, height→normal, carbonio a twill 2×2, gomma con battistrada, dischi forati, titanio rinvenuto, TFT con subpixel |
| `js/bike-model.js` | La moto. Frontale in tre pezzi (cupolino, fiancate, puntale), fiancate come superfici rigate che si incontrano su una piega viva, tubi su curve Catmull-Rom, scultura dei vertici |
| `js/effects.js` | HDRI di studio procedurale (PMREM), foschia di calore, fumo, scintille, scie di velocità, pavimento riflettente, pulviscolo |
| `js/scene.js` | Renderer, regia della camera, bloom scritto a mano, vista esplosa, degrado automatico della qualità |
| `js/engine-audio.js` | Sintesi del V4: treno di impulsi sull'angolo di manovella, risonatori di scarico, rumore d'aspirazione |
| `js/ui.js` | GSAP + ScrollTrigger: split del testo, smooth scroll, cursore magnetico, HUD, marquee |
| `js/main.js` | Avvio, scelta della qualità, cablaggio, degrado in caso di guasto |

### Il contratto del mondo 3D

Tutti i moduli condividono lo stesso sistema di riferimento, ed è l'unica cosa
che non si può cambiare senza rompere qualcosa:

```
1 unità = 1 metro
+X avanti   +Y alto   +Z lato SINISTRO della moto
piano terra a y = 0, origine a metà interasse
```

Le proporzioni della moto derivano da misure reali, non da valori scelti a
occhio: interasse 1469 mm, pneumatici 120/70 e 200/55 su cerchi da 17",
inclinazione del cannotto 24,5°, avancorsa 100 mm, altezza sella 835 mm.
Cambiare una di queste costanti in cima a `bike-model.js` riposiziona
automaticamente ruote, forcella e forcellone. I dati e la loro affidabilità
stanno in [`data/specs.json`](data/specs.json).

### Il suono

Il Desmosedici Stradale è un V4 a 90° con ordine di scoppio *Twin Pulse*: i
cilindri sparano a **0°, 90°, 290° e 380°** del ciclo di 720°. È per questo che
un V4 può suonare come un bicilindrico arrabbiato. `engine-audio.js` non
riproduce un campione: accumula l'angolo di manovella e genera un impulso di
scarico a ciascuno di quei quattro angoli, poi manda il treno di impulsi in un
banco di risonatori. Il timbro emerge dalla fisica, non da un file.

Il suono parte solo dopo un gesto dell'utente (pulsante «Motore» nella barra in
alto), come richiedono i browser.

---

## Prestazioni

- La qualità (`high`/`low`) è scelta all'avvio da `deviceMemory`,
  `hardwareConcurrency` e tipo di puntatore.
- Se il frame rate resta sotto i 45 fps per due secondi, `scene.js` spegne il
  bloom e abbassa il pixel ratio, **una volta sola**.
- Il rendering si ferma quando la scheda passa in secondo piano.
- `prefers-reduced-motion` sostituisce ogni movimento con una dissolvenza e
  disattiva lo smooth scroll.

Costo attuale della scena: ~50.000 triangoli, ~380 draw call.

---

## Stato del progetto, onestamente

Cosa funziona bene:

- L'architettura meccanica della moto è corretta e verificata a render:
  interasse, diametri, inclinazione del cannotto, forcella rovesciata con
  steli dorati in alto, forcellone monobraccio con il braccio a sinistra,
  scarichi che escono a destra fuori dalla sagoma del pneumatico.
- Materiali e ambiente: il trasparente sulla vernice, l'HDRI procedurale e il
  pavimento riflettente reggono bene il confronto ravvicinato.
- La carrozzeria è costruita come una moto vera: pezzi separati, fughe scure
  fra un pannello e l'altro, viteria a vista e una piega netta sul fianco che
  divide il rosso dal nero. La piega è un bordo di mesh, non un trucco sulle
  normali, quindi lo spigolo resta vivo da qualunque angolo.
- I dettagli che l'occhio cerca: radiatore a vista fra ruota e carena, tubi
  freno lungo gli steli, alette biplano in carbonio.
- Il racconto a scroll, la regia della camera, la vista esplosa e la sincronia
  fra scroll, scena e audio sono a posto.

Cosa **non** è ancora all'altezza:

- **Il raccordo fra cupolino e fiancate.** I tre pezzi del frontale sono
  costruiti separatamente e si sovrappongono, ma il punto in cui il cupolino
  incontra il bordo alto del pannello mostra una discontinuità. Servirebbe far
  coincidere le due curve invece di lasciarle sovrapporre.
- **La zona fra fiancata e motore.** Dietro il radiatore restano volumi
  scatolati che leggono come scatole, non come componenti.
- Il gruppo ottico anteriore è schematico: la firma a V si legge, i proiettori no.
- Non c'è pilota, e senza un corpo umano di riferimento la scala è più
  difficile da percepire.
- I moduli `effects.js`, `engine-audio.js` e `ui.js` non hanno una suite di test
  automatici: sono stati verificati a mano nel browser.

---

## Licenza e marchi

Codice sotto licenza [MIT](LICENSE).

Questo è un **progetto indipendente**, a scopo didattico e dimostrativo. Non è
affiliato, sponsorizzato né approvato da **Ducati Motor Holding S.p.A.**
«Ducati», «Panigale», «Desmosedici», «Öhlins» e «Brembo» sono marchi dei
rispettivi titolari, citati esclusivamente a scopo descrittivo. **Nessun marchio
figurativo, logo o grafica ufficiale è riprodotto**: la livrea è un rosso pieno
con pannelli scuri, senza sponsor né decalcomanie.

Le cifre tecniche pubblicate sul sito sono quelle comunemente riportate per la
Panigale V4 S 2022–2024. Prima di riutilizzarle altrove, verificarle sulla
scheda tecnica ufficiale del model year: `data/specs.json` indica per ogni dato
quanto è consolidato e quali non sono stati confermati.

## Dipendenze

Caricate da CDN, con versione fissata:

- [three.js](https://threejs.org/) 0.160.0 — MIT
- [GSAP](https://gsap.com/) 3.12.5 + ScrollTrigger — licenza standard GreenSock (uso gratuito nei siti non a pagamento)
- Font [Anton](https://fonts.google.com/specimen/Anton), [Saira](https://fonts.google.com/specimen/Saira), [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) — SIL Open Font License
