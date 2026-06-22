# Acme Insurance PayPal Demo — Flow extract (Frontend ⇄ Backend ⇄ PayPal)

## Actors legend
- **FE** = Frontend (browser, `public/js/*`, PayPal JS SDK)
- **BE** = Backend (Express, `server.js` → `src/paypalClient.js`)
- **PP** = PayPal REST API (`api-m.sandbox.paypal.com`)
- Funnel state shared across pages via `sessionStorage` (`State`)

## Backend endpoints (API summary)
| Method | Endpoint | PP function called | Purpose |
|---|---|---|---|
| GET | `/api/config` | — | Client ID, env, currency, amounts |
| GET | `/api/vault/id-token` | `oauth(id_token, target_customer_id)` | Payer id_token for SDK (`data-user-id-token`) |
| POST | `/api/orders` | `createOrder` | Create CAPTURE order (interactive checkout) |
| POST | `/api/orders/:id/capture` | `captureOrder` | Capture an approved order |
| POST | `/api/refund` | `refundCapture` | Full/partial refund of a capture |
| POST | `/api/vault/setup-token` | `createSetupToken` (v3 vault) | Setup token (save account without purchase) |
| POST | `/api/vault/payment-token` | `createPaymentToken` (v3 vault) | Exchange setup token → permanent `vault_id` |
| POST | `/api/vault/pay` | `createOrder(vaultId)` + optional `captureOrder` | MIT payment with the tokenized account |

All PP functions first run `oauth` client-credentials for the access token. Calls with `payment_source` require the `PayPal-Request-Id` header (idempotency).

---

## PAGE 1 — Policy selection (fork)
- FE → BE: `GET /api/config` (prices/currency)
- FE: loads PayPal SDK + BNPL banner (`Messages`) on the full premium
- User chooses:
  - **Scenario A** → `State{scenario:A, amount:fullPrice}` → Page 2
  - **Scenario B** → `State{scenario:B, amount:discountedPrice}` → Page 3

---

## SCENARIO A — Standard checkout (full premium) + refund

### Page 2 — Interactive payment
1. FE loads PayPal SDK; renders 2 buttons (PayPal + Pay Later/BNPL)
2. **createOrder**: FE → BE `POST /api/orders {amount, description}` → BE → PP `POST /v2/checkout/orders` (intent CAPTURE, `payment_source.paypal.experience_context` with `NO_SHIPPING`, `IMMEDIATE_PAYMENT_REQUIRED`, `PAY_NOW`) → returns `order.id` to FE
3. User approves in the PayPal popup
4. **onApprove**: FE → BE `POST /api/orders/:id/capture` → BE → PP `POST /v2/checkout/orders/:id/capture` → returns `captureId, status, amount`
5. `State{captureId, capturedAmount, orderId}` → Page 4

### Page 4 — Result + extra amount refund
- Shows `orderId / captureId / amount` from state
- Refund button: FE → BE `POST /api/refund {captureId, amount=extra}` → BE → PP `POST /v2/payments/captures/:id/refund` → shows `refund.id, status`
- (Use case: Black Box discount applied afterwards)

---

## SCENARIO B — Vault (account tokenization) + MIT + BNPL

### Page 3 — PayPal account tokenization (Save Payment Method)
1. FE → BE `GET /api/vault/id-token` → BE → PP `oauth response_type=id_token` → `idToken`
2. FE loads SDK with `data-user-id-token=idToken` (component `buttons`)
3. **createVaultSetupToken**: FE → BE `POST /api/vault/setup-token` → BE → PP `POST /v3/vault/setup-tokens` (usage_type MERCHANT) → `setupToken.id`
4. User approves (consent to save the account)
5. **onApprove**: FE → BE `POST /api/vault/payment-token {setupTokenId}` → BE → PP `POST /v3/vault/payment-tokens` → returns `vault_id, customer_id, email`
6. BE stores it in `vaultStore` (in memory) + `lastVault`
7. `State{vaultId, customerId, vaultEmail}` → Page 5

### Page 5 — Discounted premium payment (3 modes)
Pre-step: FE → BE `GET /api/vault/id-token?customerId=...` (returning payer with `target_customer_id`) → loads SDK with `data-user-id-token`.

- **Mode 1 — One-click JS SDK** (saved account / Edit FI)
  - createOrder: FE → BE `POST /api/orders` (no vault; the saved account is shown thanks to `data-user-id-token`) → PP `POST /v2/checkout/orders`
  - onApprove: FE → BE `POST /api/orders/:id/capture` → PP capture
  - **Fix note**: `NO_SHIPPING` must live inside `payment_source.paypal.experience_context` (digital good) to avoid the payment-method selection popup
- **Mode 2 — Server-side capture (MIT, no popup)**
  - FE → BE `POST /api/vault/pay {amount, vaultId}` → BE → PP `POST /v2/checkout/orders` with `payment_source.paypal.vault_id` + `stored_credential {MERCHANT, UNSCHEDULED, SUBSEQUENT}` → order processed/captured automatically; if not already captured → `captureOrder`
- **Mode 3 — Pay Later (BNPL)**
  - `Messages` banner + PAYLATER button → createOrder `POST /api/orders` → onApprove capture

All 3 → `State{captureId, capturedAmount, paidWith}` → Page 6

### Page 6 — Extra amount charge (MIT, no user interaction)
- "Charge extra" button: FE → BE `POST /api/vault/pay {amount=extra, vaultId}` → BE → PP order with `vault_id` (merchant-initiated) + automatic capture → shows `captureId, amount`
- (Use case: Black Box not installed → discount removed after sale)

---

## Compact diagram of the two paths
```
PAGE 1 ──┬── A ── P2 (createOrder→capture) ── P4 (refund)
         │
         └── B ── P3 (setup-token→payment-token / vault_id)
                   └─ P5 ─┬─ 1 one-click (orders→capture)
                          ├─ 2 server MIT (vault/pay, vault_id)
                          └─ 3 BNPL (orders→capture)
                          └─ P6 extra charge MIT (vault/pay, vault_id)
```
