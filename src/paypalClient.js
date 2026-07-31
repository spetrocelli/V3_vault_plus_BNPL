// PayPal REST client: OAuth, Orders v2, Vault (Payment Tokens v3), Refunds.
import { logRequest, logResponse, logError } from './logger.js';

const ENV = process.env.PAYPAL_ENV || 'sandbox';
const BASE = ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const SECRET = process.env.PAYPAL_SECRET;
const CURRENCY = process.env.CURRENCY || 'EUR';

// Performs a REST call to PayPal with request/response logging.
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
    const err = new Error(`PayPal ${method} ${path} failed: ${message}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

// OAuth2 client-credentials. With includeIdToken=true it also requests the payer's
// id_token (response_type=id_token), required for the "Save Payment Methods" flow
// to pass to the SDK as data-user-id-token.
async function oauth(includeIdToken = false, targetCustomerId) {
  if (!CLIENT_ID || !SECRET || CLIENT_ID.startsWith('PASTE')) {
    throw new Error('Missing PayPal credentials: set PAYPAL_CLIENT_ID and PAYPAL_SECRET in the .env file');
  }
  const auth = Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64');
  const url = `${BASE}/v1/oauth2/token`;
  let body = 'grant_type=client_credentials';
  if (includeIdToken) body += '&response_type=id_token';
  // Returning payer: binds the id_token to the customer saved in the vault.
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
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${data.error_description || res.status}`);
  return data;
}

export async function getAccessToken() {
  const data = await oauth(false);
  return data.access_token;
}

// Payer's id_token for the SDK (data-user-id-token) in the vault flow.
// With targetCustomerId -> returning payer (shows the already saved account).
export async function getIdToken(targetCustomerId) {
  const data = await oauth(true, targetCustomerId);
  return data.id_token;
}

// PayPal-Request-Id for idempotency (uses the server clock: fine on the Node side).
function requestId(prefix) {
  return `${prefix}-${Date.now()}`;
}

function extractVaultId(response) {
  return response?.payment_source?.paypal?.vault_id
    || response?.payment_source?.paypal?.attributes?.vault?.id
    || response?.payment_source?.paypal?.id
    || response?.vault_id
    || null;
}

// Creates a CAPTURE order.
//  - vaultId present  -> merchant-initiated transaction on the tokenized account (Page 6)
//  - createVault true -> checkout with vault creation during the purchase (Scenario C)
//  - otherwise        -> interactive checkout (guest or returning payer one-click)
// The policy is a digital good: NO_SHIPPING. experience_context aligns brand/locale.
export async function createOrder({
  amount,
  description,
  vaultId,
  createVault = false,
  vaultAttributes,
  brand = 'Acme Insurance',
  userAction = 'PAY_NOW',
  returnUrl,
  cancelUrl,
  currencyCode = CURRENCY,
  paymentMethodSelected,
  paymentMethodPreference,
}) {
  const token = await getAccessToken();
  const order = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: currencyCode, value: amount },
      description: description || 'Acme Insurance policy',
    }],
  };
  const experience_context = {
    brand_name: brand,
    locale: 'it-IT',
    shipping_preference: 'NO_SHIPPING',
    return_url: returnUrl || 'https://example.com/return',
    cancel_url: cancelUrl || 'https://example.com/cancel',
    user_action: userAction,
  };
  if (createVault) {
    order.payment_source = {
      paypal: {
        attributes: {
          vault: vaultAttributes || {
            store_in_vault: 'ON_SUCCESS',
            usage_type: 'MERCHANT',
            customer_type: 'CONSUMER',
          },
        },
        experience_context: {
          ...experience_context,
          ...(paymentMethodSelected ? { payment_method_selected: paymentMethodSelected } : {}),
          ...(paymentMethodPreference ? { payment_method_preference: paymentMethodPreference } : {}),
          user_action: 'PAY_NOW',
        },
      },
    };
  } else if (vaultId) {
    order.payment_source = {
      paypal: {
        vault_id: vaultId,
        experience_context: {
          ...experience_context,
          ...(paymentMethodSelected ? { payment_method_selected: paymentMethodSelected } : {}),
          ...(paymentMethodPreference ? { payment_method_preference: paymentMethodPreference } : {}),
          user_action: 'PAY_NOW',
        },
      },
    };
  } else {
    order.payment_source = {
      paypal: {
        experience_context: {
          ...experience_context,
          ...(paymentMethodPreference ? { payment_method_preference: paymentMethodPreference } : {}),
        },
      },
    };
  }
  // PayPal-Request-Id is required when creating an order with payment_source.
  const result = await call('POST', '/v2/checkout/orders', {
    token,
    body: order,
    extraHeaders: { 'PayPal-Request-Id': requestId('order') },
  });
  return { ...result, vaultId: extractVaultId(result) || null };
}

// Captures an approved order.
export async function captureOrder(orderId) {
  const token = await getAccessToken();
  const captureResult = await call('POST', `/v2/checkout/orders/${orderId}/capture`, {
    token,
    body: {},
    extraHeaders: { 'PayPal-Request-Id': requestId('capture') },
  });

  const orderDetails = await call('GET', `/v2/checkout/orders/${orderId}`, {
    token,
    extraHeaders: { 'PayPal-Request-Id': requestId('order-details') },
  });

  const vaultId = extractVaultId(orderDetails);
  return { ...captureResult, ...orderDetails, vaultId: vaultId || captureResult.vaultId || null };
}

// Full or partial refund (reversal) of a capture.
export async function refundCapture(captureId, amount) {
  const token = await getAccessToken();
  const body = amount
    ? { amount: { currency_code: CURRENCY, value: amount } }
    : {};
  return call('POST', `/v2/payments/captures/${captureId}/refund`, { token, body });
}

// Vault: create a setup token to save the PayPal account without an immediate purchase.
// (Save Payment Methods - Purchase Later, PayPal Wallet: return_url/cancel_url required)
export async function createSetupToken() {
  const token = await getAccessToken();
  const body = {
    payment_source: {
      paypal: {
        usage_type: 'MERCHANT',
        experience_context: {
          brand_name: 'Acme Insurance',
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

// Vault: exchange the approved setup token for a permanent payment token (vault_id).
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
