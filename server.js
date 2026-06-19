import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createOrder,
  captureOrder,
  refundCapture,
  createSetupToken,
  createPaymentToken,
  getIdToken,
  CURRENCY,
  ENV,
} from './src/paypalClient.js';
import { logStep, logInfo, logError } from './src/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Parametri commerciali della demo.
const MONEY = {
  currency: CURRENCY,
  fullPrice: process.env.FULL_PRICE || '500.00',
  discount: process.env.DISCOUNT || '100.00',
  discountedPrice: process.env.DISCOUNTED_PRICE || '400.00',
  extraAmount: process.env.EXTRA_AMOUNT || '100.00',
};

// "Database" in memoria: vault token salvati (per simulare la cattura differita).
const vaultStore = new Map(); // key: customerId -> { vaultId, customerId, createdAt }
let lastVault = null;

// Log di ogni richiesta in ingresso dal frontend.
app.use('/api', (req, _res, next) => {
  logStep('FRONTEND→BACKEND', `${req.method} ${req.path}`);
  next();
});

// Config + parametri per il frontend (Client ID, valuta, importi).
app.get('/api/config', (_req, res) => {
  res.json({
    clientId: process.env.PAYPAL_CLIENT_ID,
    env: ENV,
    ...MONEY,
  });
});

// ---- Checkout standard (Scenario A) ----
app.post('/api/orders', async (req, res) => {
  try {
    const { amount, description } = req.body;
    logInfo(`Creazione ordine standard importo=${amount} ${MONEY.currency}`);
    const order = await createOrder({ amount, description });
    res.json({ id: order.id, status: order.status });
  } catch (err) {
    logError('Errore createOrder', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.post('/api/orders/:id/capture', async (req, res) => {
  try {
    logInfo(`Cattura ordine ${req.params.id}`);
    const data = await captureOrder(req.params.id);
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    res.json({
      id: data.id,
      status: data.status,
      captureId: capture?.id,
      amount: capture?.amount,
      payer: data.payer,
    });
  } catch (err) {
    logError('Errore captureOrder', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

// ---- Storno importo extra (Scenario A, Pagina 4) ----
app.post('/api/refund', async (req, res) => {
  try {
    const { captureId, amount } = req.body;
    logInfo(`Storno importo=${amount || 'totale'} su capture ${captureId}`);
    const data = await refundCapture(captureId, amount || MONEY.extraAmount);
    res.json({ id: data.id, status: data.status, amount: data.amount });
  } catch (err) {
    logError('Errore refund', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

// ---- Vault: tokenizzazione conto PayPal (Scenario B, Pagina 3) ----
// id_token del payer per l'SDK (data-user-id-token), richiesto dal flusso vault.
app.get('/api/vault/id-token', async (req, res) => {
  try {
    const customerId = req.query.customerId;
    logInfo(`Generazione id_token payer per SDK (data-user-id-token)${customerId ? ' target_customer_id=' + customerId : ''}`);
    const idToken = await getIdToken(customerId);
    res.json({ idToken });
  } catch (err) {
    logError('Errore getIdToken', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/vault/setup-token', async (_req, res) => {
  try {
    logInfo('Creazione setup-token (tokenizzazione conto PayPal)');
    const data = await createSetupToken();
    res.json({ id: data.id, status: data.status });
  } catch (err) {
    logError('Errore createSetupToken', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.post('/api/vault/payment-token', async (req, res) => {
  try {
    const { setupTokenId } = req.body;
    logInfo(`Scambio setup-token ${setupTokenId} -> payment-token (vault)`);
    const data = await createPaymentToken(setupTokenId);
    const record = {
      vaultId: data.id,
      customerId: data.customer?.id,
      email: data.payment_source?.paypal?.email_address,
      createdAt: new Date().toISOString(),
    };
    vaultStore.set(record.customerId || record.vaultId, record);
    lastVault = record;
    logInfo(`Conto tokenizzato: vault_id=${record.vaultId} customer=${record.customerId}`);
    res.json(record);
  } catch (err) {
    logError('Errore createPaymentToken', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

// ---- Pagamento con conto tokenizzato (Scenario B, Pagina 5 "paga ora" e Pagina 6 "extra") ----
app.post('/api/vault/pay', async (req, res) => {
  try {
    const { amount, description, vaultId } = req.body;
    const useVault = vaultId || lastVault?.vaultId;
    if (!useVault) {
      return res.status(400).json({ error: 'Nessun conto tokenizzato disponibile. Esegui prima la Pagina 3.' });
    }
    logInfo(`Pagamento con conto tokenizzato vault_id=${useVault} importo=${amount} ${MONEY.currency}`);
    const order = await createOrder({ amount, description, vaultId: useVault });
    // Con vault_id (MIT) l'ordine viene processato e catturato in automatico:
    // la capture è già nella risposta. Si cattura a parte solo se non presente.
    let result = order;
    let capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture && order.status !== 'COMPLETED') {
      logInfo(`Ordine ${order.id} non ancora catturato: eseguo capture`);
      result = await captureOrder(order.id);
      capture = result.purchase_units?.[0]?.payments?.captures?.[0];
    } else {
      logInfo(`Ordine ${order.id} già catturato in automatico (MIT)`);
    }
    res.json({
      id: result.id,
      status: result.status,
      captureId: capture?.id,
      amount: capture?.amount,
    });
  } catch (err) {
    logError('Errore pagamento con vault', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.listen(PORT, () => {
  logStep('SERVER', `Genertel demo avviata su http://localhost:${PORT}  (PayPal ENV=${ENV})`);
  if (!process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID.startsWith('INCOLLA')) {
    logError('ATTENZIONE: credenziali PayPal non configurate. Compila il file .env');
  }
});
