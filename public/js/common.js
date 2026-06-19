// ---------------------------------------------------------------------------
// common.js - utilità condivise da tutte le pagine della demo Genertel
//   - Logger frontend (pannello a schermo + console)
//   - Stato di funnel persistito in sessionStorage
//   - Caricamento dinamico dell'SDK PayPal (buttons, messages, paylater)
//   - Helper per chiamare il backend
// ---------------------------------------------------------------------------

export const Logger = {
  _body: null,
  init() {
    this._body = document.getElementById('logbody');
    const clear = document.getElementById('logclear');
    if (clear) clear.onclick = () => { if (this._body) this._body.innerHTML = ''; };
    this.step('Pagina caricata: ' + document.title);
  },
  _append(kind, msg) {
    const time = new Date().toLocaleTimeString('it-IT');
    // console
    const tag = kind.toUpperCase();
    console.log(`[${time}] [${tag}] ${msg}`);
    // pannello
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

// ---- Stato del funnel (condiviso fra le pagine) ----
const STATE_KEY = 'genertel_demo_state';
export const State = {
  get() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY)) || {}; }
    catch { return {}; }
  },
  set(patch) {
    const next = { ...this.get(), ...patch };
    sessionStorage.setItem(STATE_KEY, JSON.stringify(next));
    Logger.info('Stato aggiornato: ' + JSON.stringify(patch));
    return next;
  },
  clear() { sessionStorage.removeItem(STATE_KEY); },
};

// ---- Config dal backend ----
let _config = null;
export async function getConfig() {
  if (_config) return _config;
  Logger.api('GET /api/config');
  const res = await fetch('/api/config');
  _config = await res.json();
  Logger.ok(`Config ricevuta: env=${_config.env} valuta=${_config.currency} pieno=${_config.fullPrice} scontato=${_config.discountedPrice}`);
  return _config;
}

// ---- Helper chiamate backend ----
export async function api(path, body) {
  Logger.api(`POST ${path} ${body ? JSON.stringify(body) : ''}`);
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    Logger.err(`${path} -> ${res.status}: ${data.error || 'errore'}`);
    throw new Error(data.error || 'Errore backend');
  }
  Logger.ok(`${path} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

// ---- Caricamento SDK PayPal ----
// opts.userIdToken   -> attributo data-user-id-token (returning payer / vault)
// opts.components     -> override dei componenti (default: buttons,messages)
// opts.enableFunding  -> override funding (default: paylater)
// opts.locale         -> locale SDK (default it_IT)
// opts.buyerCountry   -> buyer-country per il sandbox (default IT): determina la
//                        lingua/offerta Pay Later a prescindere dal paese del merchant.
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
      Logger.info('SDK con data-user-id-token (returning payer / Save Payment Method)');
    }
    s.onload = () => { Logger.ok('SDK PayPal caricato'); resolve(window.paypal); };
    s.onerror = () => { Logger.err('Errore caricamento SDK PayPal'); reject(new Error('SDK load error')); };
    document.head.appendChild(s);
    Logger.api('Caricamento SDK PayPal: ' + s.src);
  });
  return _sdkPromise;
}

// ---- Banner BNPL (Pay Later messaging) ----
// buyerCountry guida l'offerta mostrata (default IT), come nel reference.
export function renderBnplBanner(containerId, amount, buyerCountry = 'IT') {
  if (!window.paypal || !window.paypal.Messages) {
    Logger.err('Componente Messages non disponibile per il banner BNPL');
    return;
  }
  Logger.info(`Render banner BNPL importo=${amount} buyerCountry=${buyerCountry}`);
  window.paypal.Messages({
    amount: Number(amount),
    placement: 'payment',
    buyerCountry,
    style: { layout: 'text', logo: { type: 'inline' } },
  }).render('#' + containerId);
}

// ---- Navigazione ----
export function goTo(page) {
  Logger.step('Navigazione verso ' + page);
  window.location.href = page;
}

// ---- Helper formattazione ----
export function eur(v) { return Number(v).toFixed(2).replace('.', ',') + ' €'; }
