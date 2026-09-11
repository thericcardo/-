/**
 * Genera un codice di sblocco per Calzino Pro.
 *
 *   node focus/tools/genera-codice.mjs            un mese da oggi
 *   node focus/tools/genera-codice.mjs 90         novanta giorni
 *   node focus/tools/genera-codice.mjs 31 5       cinque codici da un mese
 *
 * Serve a chi incassa: arriva il pagamento, generi un codice, lo mandi.
 * L'algoritmo è lo stesso di js/licenza.js — se cambi il sale lì, cambialo
 * anche qui, altrimenti i codici non entrano.
 */
const SALE = "mora-sferruzza-2026";

function impronta(testo) {
  let h = 0x811c9dc5;
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const LETTERE = "ABCDEFGHIJKLMNPQRSTUVWXYZ23456789"; // niente O/0 e I/1: si copiano a mano

function codice(giorni) {
  const scadenza = Math.floor((Date.now() + giorni * 86400000) / 86400000);
  const testa = scadenza.toString(36).toUpperCase().padStart(5, "0");
  let coda = "";
  for (let i = 0; i < 3; i++) coda += LETTERE[Math.floor(Math.random() * LETTERE.length)];
  const corpo = testa + coda;
  const controllo = impronta(corpo + SALE).toString(36).toUpperCase().padStart(7, "0").slice(-4);
  return `CALZ-${corpo.slice(0, 4)}-${corpo.slice(4)}-${controllo}`;
}

const giorni = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 31;
const quanti = Number(process.argv[3]) > 0 ? Number(process.argv[3]) : 1;
const fine = new Date(Date.now() + giorni * 86400000);

console.log(`${quanti} codice/i, validi fino al ${fine.toLocaleDateString("it-IT")}:\n`);
for (let i = 0; i < quanti; i++) console.log("  " + codice(giorni));
