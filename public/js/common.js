// ---------------------------------------------------------------------------
// common.js - shared utilities used by every page of the insurance demo
//   - Frontend logger (on-screen panel + console)
//   - Funnel state persisted in sessionStorage
//   - Dynamic loading of the PayPal SDK (buttons, messages, paylater)
//   - Helper to call the backend
// ---------------------------------------------------------------------------

export const Logger = {
  _body: null,
  init() {
    this._body = document.getElementById('logbody');
    const clear = document.getElementById('logclear');
    if (clear) clear.onclick = () => { if (this._body) this._body.innerHTML = ''; };
    this.step('Page loaded: ' + document.title);
  },
  _append(kind, msg) {
    const time = new Date().toLocaleTimeString('en-GB');
    // console
    const tag = kind.toUpperCase();
    console.log(`[${time}] [${tag}] ${msg}`);
    // panel
    if (!this._body) return;
    const line = document.createElement('div');
    line.className = 'line ' + kind;
    line.innerHTML = `<span class="time">[${time}]</span> ${escapeHtml(msg)}`;
    this._body.appendChild(line);
    this._body.scrollTop = this._body.scrollHeight;
  },
  step(m) { this._append('step', '▶ ' + m); },
  info(m) { this._append('info', 'ℹ ' + m); },
  api(m) { this._append('api', '→ ' + m); },
  ok(m) { this._append('ok', '✔ ' + m); },
  err(m) { this._append('err', '✖ ' + m); },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// ---- Funnel state (shared across pages) ----
const STATE_KEY = 'insurance_demo_state';
export const State = {
  get() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY)) || {}; }
    catch { return {}; }
  },
  set(patch) {
    const next = { ...this.get(), ...patch };
    sessionStorage.setItem(STATE_KEY, JSON.stringify(next));
    Logger.info('State updated: ' + JSON.stringify(patch));
    return next;
  },
  clear() { sessionStorage.removeItem(STATE_KEY); },
};

// ---- Config from the backend ----
let _config = null;
export async function getConfig() {
  if (_config) return _config;
  Logger.api('GET /api/config');
  const res = await fetch('/api/config');
  _config = await res.json();
  Logger.ok(`Config received: env=${_config.env} currency=${_config.currency} full=${_config.fullPrice} discounted=${_config.discountedPrice}`);
  return _config;
}

// ---- Backend call helper ----
export async function api(path, body) {
  Logger.api(`POST ${path} ${body ? JSON.stringify(body) : ''}`);
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    Logger.err(`${path} -> ${res.status}: ${data.error || 'error'}`);
    throw new Error(data.error || 'Backend error');
  }
  Logger.ok(`${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

// ---- PayPal SDK loading ----
// opts.userIdToken   -> data-user-id-token attribute (returning payer / vault)
// opts.components     -> components override (default: buttons,messages)
// opts.enableFunding  -> funding override (default: paylater)
// opts.locale         -> SDK locale (default it_IT)
// opts.buyerCountry   -> buyer-country for the sandbox (default IT): determines the
//                        Pay Later language/offer regardless of the merchant country.
let _sdkPromise = null;
export function loadPayPalSdk(clientId, opts = {}) {
  if (_sdkPromise) return _sdkPromise;
  _sdkPromise = new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      'client-id': clientId,
      components: opts.components || 'buttons,messages',
      currency: 'EUR',
      locale: opts.locale || 'it_IT',
      'buyer-country': opts.buyerCountry || 'IT',
    });
    const enableFunding = opts.enableFunding ?? 'paylater';
    if (enableFunding) params.set('enable-funding', enableFunding);

    const s = document.createElement('script');
    s.id = 'pp-sdk';
    s.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    if (opts.userIdToken) {
      s.setAttribute('data-user-id-token', opts.userIdToken);
      Logger.info('SDK with data-user-id-token (returning payer / Save Payment Method)');
    }
    s.onload = () => { Logger.ok('PayPal SDK loaded'); resolve(window.paypal); };
    s.onerror = () => { Logger.err('PayPal SDK load error'); reject(new Error('SDK load error')); };
    document.head.appendChild(s);
    Logger.api('Loading PayPal SDK: ' + s.src);
  });
  return _sdkPromise;
}

// ---- BNPL banner (Pay Later messaging) ----
// buyerCountry drives the offer shown (default IT), as in the reference.
export function renderBnplBanner(containerId, amount, buyerCountry = 'IT') {
  if (!window.paypal || !window.paypal.Messages) {
    Logger.err('Messages component not available for the BNPL banner');
    return;
  }
  Logger.info(`Rendering BNPL banner amount=${amount} buyerCountry=${buyerCountry}`);
  window.paypal.Messages({
    amount: Number(amount),
    placement: 'payment',
    buyerCountry,
    style: { layout: 'text', logo: { type: 'inline' } },
  }).render('#' + containerId);
}

// ---- Navigation ----
export function goTo(page) {
  Logger.step('Navigating to ' + page);
  window.location.href = page;
}

// ---- Formatting helper ----
export function eur(v) { return Number(v).toFixed(2) + ' €'; }
