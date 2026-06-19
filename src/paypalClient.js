// Client REST PayPal: OAuth, Orders v2, Vault (Payment Tokens v3), Refunds.
import { logRequest, logResponse, logError } from './logger.js';

const ENV = process.env.PAYPAL_ENV || 'sandbox';
const BASE = ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const SECRET = process.env.PAYPAL_SECRET;
const CURRENCY = process.env.CURRENCY || 'EUR';

// Esegue una chiamata REST verso PayPal con logging request/response.
async function call(method, path, { token, body, extraHeaders } = {}) {
  const url = `${BASE}${path}`;
  logRequest(method, path, body);
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  logResponse(method, path, res.status, data);

  if (!res.ok) {
    const message = data?.message || data?.error_description || `HTTP ${res.status}`;
    const err = new Error(`PayPal ${method} ${path} fallita: ${message}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

// OAuth2 client-credentials. Con includeIdToken=true richiede anche l'id_token
// del payer (response_type=id_token), necessario per il flusso "Save Payment
// Methods" da passare all'SDK come data-user-id-token.
async function oauth(includeIdToken = false, targetCustomerId) {
  if (!CLIENT_ID || !SECRET || CLIENT_ID.startsWith('INCOLLA')) {
    throw new Error('Credenziali PayPal mancanti: compila PAYPAL_CLIENT_ID e PAYPAL_SECRET nel file .env');
  }
  const auth = Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64');
  const url = `${BASE}/v1/oauth2/token`;
  let body = 'grant_type=client_credentials';
  if (includeIdToken) body += '&response_type=id_token';
  // Returning payer: lega l'id_token al customer salvato in vault.
  if (targetCustomerId) body += `&target_customer_id=${encodeURIComponent(targetCustomerId)}`;
  logRequest('POST', '/v1/oauth2/token', {
    grant_type: 'client_credentials',
    response_type: includeIdToken ? 'id_token' : undefined,
    target_customer_id: targetCustomerId,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json();
  logResponse('POST', '/v1/oauth2/token', res.status, { id: includeIdToken ? 'access_token+id_token' : 'access_token', status: res.ok ? 'OK' : 'ERROR' });
  if (!res.ok) throw new Error(`OAuth PayPal fallita: ${data.error_description || res.status}`);
  return data;
}

export async function getAccessToken() {
  const data = await oauth(false);
  return data.access_token;
}

// id_token del payer per l'SDK (data-user-id-token) nel flusso vault.
// Con targetCustomerId -> returning payer (mostra il conto già salvato).
export async function getIdToken(targetCustomerId) {
  const data = await oauth(true, targetCustomerId);
  return data.id_token;
}

// PayPal-Request-Id per idempotenza (usa il clock del server: ok lato Node).
function requestId(prefix) {
  return `${prefix}-${Date.now()}`;
}

// Crea un ordine CAPTURE.
//  - vaultId presente  -> merchant-initiated transaction sul conto tokenizzato (Pagina 6)
//  - altrimenti        -> checkout interattivo (guest o returning payer one-click)
// La polizza è un bene digitale: NO_SHIPPING. experience_context allinea brand/locale.
export async function createOrder({ amount, description, vaultId, brand = 'Genertel Assicurazione Online' }) {
  const token = await getAccessToken();
  const order = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: CURRENCY, value: amount },
      description: description || 'Polizza assicurativa Genertel',
    }],
  };
  if (vaultId) {
    order.payment_source = {
      paypal: {
        vault_id: vaultId,
        stored_credential: {
          payment_initiator: 'MERCHANT',
          payment_type: 'UNSCHEDULED',
          usage: 'SUBSEQUENT',
        },
      },
    };
  } else {
    order.payment_source = {
      paypal: {
        experience_context: {
          // Bene digitale: nessuna spedizione. DEVE stare qui dentro experience_context:
          // con payment_source.paypal il vecchio application_context viene ignorato e
          // PayPal mostrerebbe il popup di selezione del metodo di pagamento.
          shipping_preference: 'NO_SHIPPING',
          payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
          brand_name: brand,
          locale: 'it-IT',
          user_action: 'PAY_NOW',
          return_url: 'https://example.com/return',
          cancel_url: 'https://example.com/cancel',
        },
      },
    };
  }
  // PayPal-Request-Id è obbligatorio quando si crea un ordine con payment_source.
  return call('POST', '/v2/checkout/orders', {
    token,
    body: order,
    extraHeaders: { 'PayPal-Request-Id': requestId('order') },
  });
}

// Cattura un ordine approvato.
export async function captureOrder(orderId) {
  const token = await getAccessToken();
  return call('POST', `/v2/checkout/orders/${orderId}/capture`, {
    token,
    body: {},
    extraHeaders: { 'PayPal-Request-Id': requestId('capture') },
  });
}

// Rimborso (storno) totale o parziale di una capture.
export async function refundCapture(captureId, amount) {
  const token = await getAccessToken();
  const body = amount
    ? { amount: { currency_code: CURRENCY, value: amount } }
    : {};
  return call('POST', `/v2/payments/captures/${captureId}/refund`, { token, body });
}

// Vault: crea un setup token per salvare il conto PayPal senza acquisto immediato.
// (Save Payment Methods - Purchase Later, PayPal Wallet: return_url/cancel_url richiesti)
export async function createSetupToken() {
  const token = await getAccessToken();
  const body = {
    payment_source: {
      paypal: {
        usage_type: 'MERCHANT',
        experience_context: {
          brand_name: 'Genertel Assicurazione Online',
          return_url: 'https://example.com/returnUrl',
          cancel_url: 'https://example.com/cancelUrl',
        },
      },
    },
  };
  return call('POST', '/v3/vault/setup-tokens', {
    token,
    body,
    extraHeaders: { 'PayPal-Request-Id': requestId('setup') },
  });
}

// Vault: scambia il setup token approvato con un payment token permanente (vault_id).
export async function createPaymentToken(setupTokenId) {
  const token = await getAccessToken();
  const body = {
    payment_source: {
      token: { id: setupTokenId, type: 'SETUP_TOKEN' },
    },
  };
  return call('POST', '/v3/vault/payment-tokens', {
    token,
    body,
    extraHeaders: { 'PayPal-Request-Id': requestId('paytoken') },
  });
}

export { CURRENCY, ENV };
