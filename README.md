# Acme Insurance — PayPal Demo: account tokenization + BNPL

Demo of an "online insurance" checkout funnel (Car & Motorcycle) for the merchant **Acme Insurance**.
It handles the **discount tied to the Black Box installation** through two scenarios:

- **Scenario A** — the user pays the **full premium**; if they install the Black Box, the extra amount is **refunded**.
- **Scenario B** — the user **tokenizes the PayPal account** and pays the **discounted premium**; if they do NOT install the Black Box, the extra amount is **charged** (discount removed after sale).

**Direct PayPal integration**: JS SDK (Buttons, Pay Later/BNPL, Messages) + REST API (Orders v2, Vault/Payment Tokens v3, Refunds).

> The brand name ("Acme Insurance") is generic so the demo can be reused for other clients.

## Funnel

| Page | Scenario | Content |
|--------|----------|-----------|
| **1** (`index.html`) | — | Policy selection, price, A/B options, BNPL banner. A→Page 2, B→Page 3 |
| **2** | A | "Pay now" and "Pay Later" PayPal buttons, BNPL banner. → Page 4 |
| **4** | A | Transaction result + extra amount **refund** button |
| **3** | B | PayPal account tokenization (no charge). → Page 5 |
| **5** | B | "Pay in installments" + BNPL banner + button; "or"; "Pay now — Edit Funding Instrument" + server-side capture. → Page 6 |
| **6** | B | Extra amount **charge** button on the tokenized account (Black Box not installed) |

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Add your **PayPal Sandbox** credentials to the `.env` file:
   ```env
   PAYPAL_CLIENT_ID=...
   PAYPAL_SECRET=...
   ```
   (the other variables — amounts, currency, port — are already set; change them as you like)
3. Run in development (with **nodemon**):
   ```bash
   npm run dev
   ```
   or `npm start`.
4. Open http://localhost:3000

## Amounts (defaults, configurable in `.env`)

- Full premium: **500.00 €** (Scenario A)
- Discounted premium: **400.00 €** (Scenario B)
- Extra amount / discount: **100.00 €** (refund or charge)

## Logs

- **Frontend**: every page has a fixed log panel at the bottom that traces all interactions (plus `console.log`).
- **Backend**: every request from the frontend and every PayPal call (request/response) are logged to the console.

## Technical notes

- Vault without purchase (Scenario B) uses the *Save Payment Method* flow: `createVaultSetupToken` → `/v3/vault/setup-tokens`, then `onApprove` → `/v3/vault/payment-tokens` (obtains the `vault_id`).
- Deferred payments (Page 5 "Pay now — server side" and Page 6 "extra charge") use the `vault_id` as a *merchant-initiated transaction* (`stored_credential`).
- The `vault_id` is kept **in memory** on the backend (demo): restarting the server loses it.
