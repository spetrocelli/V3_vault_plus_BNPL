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

// Commercial parameters of the demo.
const MONEY = {
  currency: CURRENCY,
  fullPrice: process.env.FULL_PRICE || '500.00',
  discount: process.env.DISCOUNT || '100.00',
  discountedPrice: process.env.DISCOUNTED_PRICE || '400.00',
  extraAmount: process.env.EXTRA_AMOUNT || '100.00',
};

// In-memory "database": saved vault tokens (to simulate the deferred capture).
const vaultStore = new Map(); // key: customerId -> { vaultId, customerId, createdAt }
let lastVault = null;

// Log every incoming request from the frontend.
app.use('/api', (req, _res, next) => {
  logStep('FRONTEND→BACKEND', `${req.method} ${req.path}`);
  next();
});

// Config + parameters for the frontend (Client ID, currency, amounts).
app.get('/api/config', (_req, res) => {
  res.json({
    clientId: process.env.PAYPAL_CLIENT_ID,
    env: ENV,
    ...MONEY,
  });
});

// ---- Standard checkout (Scenario A) ----
app.post('/api/orders', async (req, res) => {
  try {
    const { amount, description, createVault, paymentMethodSelected, paymentMethodPreference, currencyCode } = req.body;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    logInfo(`Creating order amount=${amount} ${MONEY.currency}`);
    const order = await createOrder({
      amount,
      description,
      createVault: Boolean(createVault),
      paymentMethodSelected,
      paymentMethodPreference,
      currencyCode: currencyCode || MONEY.currency,
      returnUrl: `${baseUrl}/api/return`,
      cancelUrl: `${baseUrl}/api/cancel`,
    });
    res.json({ id: order.id, status: order.status, vaultId: order.vaultId || null });
  } catch (err) {
    logError('createOrder error', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.post('/api/orders/:id/capture', async (req, res) => {
  try {
    logInfo(`Capturing order ${req.params.id}`);
    const data = await captureOrder(req.params.id);
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    if (data.vaultId) {
      lastVault = { vaultId: data.vaultId, createdAt: new Date().toISOString() };
    }
    res.json({
      id: data.id,
      status: data.status,
      captureId: capture?.id,
      amount: capture?.amount,
      payer: data.payer,
      vaultId: data.vaultId || null,
    });
  } catch (err) {
    logError('captureOrder error', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

// ---- Refund of the extra amount (Scenario A, Page 4) ----
app.post('/api/refund', async (req, res) => {
  try {
    const { captureId, amount } = req.body;
    logInfo(`Refund amount=${amount || 'full'} on capture ${captureId}`);
    const data = await refundCapture(captureId, amount || MONEY.extraAmount);
    res.json({ id: data.id, status: data.status, amount: data.amount });
  } catch (err) {
    logError('refund error', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

// ---- Vault: PayPal account tokenization (Scenario B, Page 3) ----
// Payer id_token for the SDK (data-user-id-token), required by the vault flow.
app.get('/api/vault/id-token', async (req, res) => {
  try {
    const customerId = req.query.customerId;
    logInfo(`Generating payer id_token for SDK (data-user-id-token)${customerId ? ' target_customer_id=' + customerId : ''}`);
    const idToken = await getIdToken(customerId);
    res.json({ idToken });
  } catch (err) {
    logError('getIdToken error', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/vault/setup-token', async (_req, res) => {
  try {
    logInfo('Creating setup-token (PayPal account tokenization)');
    const data = await createSetupToken();
    res.json({ id: data.id, status: data.status });
  } catch (err) {
    logError('createSetupToken error', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.post('/api/vault/payment-token', async (req, res) => {
  try {
    const { setupTokenId } = req.body;
    logInfo(`Exchanging setup-token ${setupTokenId} -> payment-token (vault)`);
    const data = await createPaymentToken(setupTokenId);
    const record = {
      vaultId: data.id,
      customerId: data.customer?.id,
      email: data.payment_source?.paypal?.email_address,
      createdAt: new Date().toISOString(),
    };
    vaultStore.set(record.customerId || record.vaultId, record);
    lastVault = record;
    logInfo(`Account tokenized: vault_id=${record.vaultId} customer=${record.customerId}`);
    res.json(record);
  } catch (err) {
    logError('createPaymentToken error', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

// ---- Scenario C: redirect-based Pay Later flow after tokenization ----
app.post('/api/vault/paylater', async (req, res) => {
  try {
    const { amount, description, paymentMethodSelected = 'PAYPAL_PAY_LATER' } = req.body;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    logInfo(`Creating checkout-with-vault Pay Later order amount=${amount} ${MONEY.currency}`);
    const order = await createOrder({
      amount,
      description,
      createVault: true,
      currencyCode: MONEY.currency,
      paymentMethodSelected,
      userAction: 'CONTINUE',
      returnUrl: `${baseUrl}/api/return`,
      cancelUrl: `${baseUrl}/api/cancel`,
    });
    if (order.vaultId) {
      lastVault = { vaultId: order.vaultId, createdAt: new Date().toISOString() };
    }
    const payerActionLink = order.links?.find((link) => link.rel === 'payer-action')?.href
      || order.links?.find((link) => link.rel === 'approve')?.href;
    if (!payerActionLink) {
      throw new Error('PayPal payer-action link not returned by createOrder');
    }
    res.json({ id: order.id, status: order.status, payerActionUrl: payerActionLink, vaultId: order.vaultId || null });
  } catch (err) {
    logError('paylater order error', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

// ---- Payment with the tokenized account (Scenario B, Page 5 "pay now" and Page 6 "extra") ----
app.post('/api/vault/pay', async (req, res) => {
  try {
    const { amount, description, vaultId } = req.body;
    const useVault = vaultId || lastVault?.vaultId;
    if (!useVault) {
      return res.status(400).json({ error: 'No tokenized account available. Complete Page 3 first.' });
    }
    logInfo(`Payment with tokenized account vault_id=${useVault} amount=${amount} ${MONEY.currency}`);
    const order = await createOrder({ amount, description, vaultId: useVault });
    // With vault_id (MIT) the order is processed and captured automatically:
    // the capture is already in the response. We capture separately only if missing.
    let result = order;
    let capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture && order.status !== 'COMPLETED') {
      logInfo(`Order ${order.id} not captured yet: running capture`);
      result = await captureOrder(order.id);
      capture = result.purchase_units?.[0]?.payments?.captures?.[0];
    } else {
      logInfo(`Order ${order.id} already captured automatically (MIT)`);
    }
    res.json({
      id: result.id,
      status: result.status,
      captureId: capture?.id,
      amount: capture?.amount,
    });
  } catch (err) {
    logError('vault payment error', err);
    res.status(err.status || 500).json({ error: err.message, details: err.details });
  }
});

app.get('/api/return', async (req, res) => {
  try {
    const orderId = req.query.token || req.query.orderId;
    if (!orderId) {
      return res.redirect('/pagina6c.html?status=missing-order');
    }
    logInfo(`Capturing order ${orderId} after PayPal return URL`);
    const data = await captureOrder(orderId);
    const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
    const amount = capture?.amount?.value || data.purchase_units?.[0]?.amount?.value;
    const vaultId = data.vaultId || lastVault?.vaultId || '';
    if (vaultId) {
      lastVault = { vaultId, createdAt: new Date().toISOString() };
    }
    const query = new URLSearchParams({
      orderId: data.id,
      captureId: capture?.id || '',
      amount: amount || '',
      status: data.status || '',
      method: 'paylater-redirect',
      vaultId,
    }).toString();
    res.redirect(`/pagina6c.html?${query}`);
  } catch (err) {
    logError('return callback error', err);
    res.redirect('/pagina6c.html?status=error&message=' + encodeURIComponent(err.message));
  }
});

app.get('/api/cancel', (_req, res) => {
  res.redirect('/pagina5c.html?status=cancelled');
});

app.listen(PORT, () => {
  logStep('SERVER', `Insurance demo started on http://localhost:${PORT}  (PayPal ENV=${ENV})`);
  if (!process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID.startsWith('PASTE')) {
    logError('WARNING: PayPal credentials not configured. Fill in the .env file');
  }
});
