# Genertel — Demo PayPal: tokenizzazione conto + BNPL

Demo di un funnel di checkout "assicurazione online" (Auto & Moto) per il merchant **Genertel**.
Gestisce lo **sconto legato all'installazione della Black Box** tramite due scenari:

- **Scenario A** — l'utente paga il **premio pieno**; se installa la Black Box, gli viene **stornato** l'importo extra.
- **Scenario B** — l'utente **tokenizza il conto PayPal** e paga il **premio scontato**; se NON installa la Black Box, gli viene **addebitato** l'importo extra (sconto rimosso post-vendita).

Integrazione **PayPal diretta**: JS SDK (Buttons, Pay Later/BNPL, Messages) + REST API (Orders v2, Vault/Payment Tokens v3, Refunds).

## Funnel

| Pagina | Scenario | Contenuto |
|--------|----------|-----------|
| **1** (`index.html`) | — | Scelta polizza, prezzo, opzioni A/B, banner BNPL. A→Pag.2, B→Pag.3 |
| **2** | A | Pulsanti PayPal "Paga ora" e "Paga dopo", banner BNPL. → Pag.4 |
| **4** | A | Esito transazione + pulsante **storno** importo extra |
| **3** | B | Tokenizzazione conto PayPal (nessun addebito). → Pag.5 |
| **5** | B | Scritta "Paga a rate" + banner BNPL + pulsante "Paga a rate"; "oppure"; pulsante "Paga subito — Edit Funding Instrument". → Pag.6 |
| **6** | B | Pulsante **addebito importo extra** sul conto tokenizzato (mancata installazione) |

## Setup

1. Installa le dipendenze:
   ```bash
   npm install
   ```
2. Inserisci le credenziali **PayPal Sandbox** nel file `.env`:
   ```env
   PAYPAL_CLIENT_ID=...
   PAYPAL_SECRET=...
   ```
   (le altre variabili — importi, valuta, porta — sono già impostate; modificabili a piacere)
3. Avvia in sviluppo (con **nodemon**):
   ```bash
   npm run dev
   ```
   oppure `npm start`.
4. Apri http://localhost:3000

## Importi (default, modificabili in `.env`)

- Premio pieno: **500,00 €** (Scenario A)
- Premio scontato: **400,00 €** (Scenario B)
- Importo extra / sconto: **100,00 €** (storno o addebito)

## Log

- **Frontend**: ogni pagina ha un pannello log fisso in basso che traccia tutte le interazioni (più `console.log`).
- **Backend**: ogni richiesta dal frontend e ogni chiamata PayPal (request/response) sono loggate in console.

## Note tecniche

- Vault senza acquisto (Scenario B) usa il flusso *Save Payment Method*: `createVaultSetupToken` → `/v3/vault/setup-tokens`, poi `onApprove` → `/v3/vault/payment-tokens` (ottiene il `vault_id`).
- I pagamenti differiti (Pag.5 "Paga subito" e Pag.6 "addebito extra") usano il `vault_id` come *merchant-initiated transaction* (`stored_credential`).
- Il `vault_id` viene conservato **in memoria** lato backend (demo): riavviando il server si perde.
