import { Logger, State, getConfig, loadPayPalSdk, renderBnplBanner, api, goTo, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  // Fallback/diagnostics: allow overriding vault_id/customer_id from the query string.
  const qp = new URLSearchParams(location.search);
  if (qp.get('customer_id')) st.customerId = qp.get('customer_id');
  if (qp.get('vault_id')) st.vaultId = qp.get('vault_id');
  Logger.step('Initializing Page 5 - Scenario B (payment)');
  const cfg = await getConfig();
  const amount = st.amount || cfg.discountedPrice;
  document.getElementById('display-amount').textContent = eur(amount);
  document.getElementById('vault-info').textContent =
    st.vaultId
      ? `Tokenized account: vault_id=${st.vaultId} · customer_id=${st.customerId || '—'}${st.vaultEmail ? ' (' + st.vaultEmail + ')' : ''}`
      : 'No tokenized account (go back to Page 3)';

  if (!st.customerId) {
    Logger.err('customer_id missing: without target_customer_id one-click will NOT show the saved account!');
  }

  // STEP 1: FIRST get the data-user-id-token (returning payer, target_customer_id),
  // THEN load the SDK and ONLY AFTER render the JS buttons.
  Logger.step('Requesting payer id_token (target_customer_id=' + (st.customerId || '—') + ')');
  const q = st.customerId ? ('?customerId=' + encodeURIComponent(st.customerId)) : '';
  const idRes = await fetch('/api/vault/id-token' + q);
  const { idToken } = await idRes.json();
  Logger.ok('id_token received');

  // STEP 2: load SDK with data-user-id-token.
  const paypal = await loadPayPalSdk(cfg.clientId, { userIdToken: idToken });
  Logger.ok('SDK loaded with data-user-id-token → now rendering the buttons');

  // Style identical to the reference (one-click).
  const style = { color: 'gold', shape: 'rect', height: 45, tagline: false };

  // ---- 1) Pay now: JS SDK one-click on the saved account (Edit FI) ----
  // createOrder WITHOUT vault attributes: data-user-id-token shows the saved account.
  paypal.Buttons({
    fundingSource: paypal.FUNDING.PAYPAL,
    style,
    createOrder: async () => {
      Logger.step('[1 JS SDK] createOrder (discounted premium, saved account)');
      const order = await api('/api/orders', { amount, description: 'Policy - discounted premium (one-click JS SDK)' });
      return order.id;
    },
    onApprove: async (data) => {
      Logger.step('[1 JS SDK] onApprove, capturing ' + data.orderID);
      const r = await api(`/api/orders/${data.orderID}/capture`, {});
      Logger.ok(`[1 JS SDK] completed: capture=${r.captureId} status=${r.status}`);
      State.set({ captureId: r.captureId, capturedAmount: r.amount?.value, paidWith: 'jssdk-oneclick' });
      goTo('/pagina6.html');
    },
    onCancel: () => Logger.err('[1 JS SDK] Payment cancelled by the user'),
    onError: (err) => Logger.err('[1 JS SDK] PayPal error: ' + err),
  }).render('#paypal-pay');
  Logger.ok('Button 1 (JS SDK one-click) rendered');

  // ---- 2) Pay now: server-side capture (MIT with vault_id) ----
  const payServer = document.getElementById('pay-server');
  payServer.onclick = async () => {
    if (!st.vaultId) { Logger.err('[2 server] vault_id missing: cannot pay'); return; }
    payServer.disabled = true;
    Logger.step('[2 server] Server-side capture: v2/order with vault_id=' + st.vaultId);
    try {
      const r = await api('/api/vault/pay', { amount, vaultId: st.vaultId, description: 'Policy - discounted premium (server side vault)' });
      Logger.ok(`[2 server] completed: capture=${r.captureId} status=${r.status}`);
      State.set({ captureId: r.captureId, capturedAmount: r.amount?.value, paidWith: 'server-vault' });
      goTo('/pagina6.html');
    } catch (e) {
      payServer.disabled = false;
      document.getElementById('pay-result').innerHTML =
        `<div class="result err"><div class="icon">✖</div><div><strong>Server-side capture error</strong><div class="v">${e.message}</div></div></div>`;
    }
  };
  Logger.ok('Button 2 (server-side capture) ready');

  // ---- 3) Pay in installments (BNPL): banner before the button ----
  renderBnplBanner('bnpl', amount);
  paypal.Buttons({
    fundingSource: paypal.FUNDING.PAYLATER,
    style,
    createOrder: async () => {
      Logger.step('[3 Pay Later] createOrder (discounted premium)');
      const order = await api('/api/orders', { amount, description: 'Policy - discounted premium (BNPL)' });
      return order.id;
    },
    onApprove: async (data) => {
      Logger.step('[3 Pay Later] onApprove, capturing ' + data.orderID);
      const r = await api(`/api/orders/${data.orderID}/capture`, {});
      Logger.ok(`[3 Pay Later] completed: capture=${r.captureId}`);
      State.set({ captureId: r.captureId, capturedAmount: r.amount?.value, paidWith: 'paylater' });
      goTo('/pagina6.html');
    },
    onCancel: () => Logger.err('[3 Pay Later] cancelled'),
    onError: (err) => Logger.err('[3 Pay Later] Error: ' + err),
  }).render('#paypal-paylater');
  Logger.ok('Button 3 (Pay Later) rendered');
})();
