import { Logger, State, getConfig, loadPayPalSdk, api, goTo, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Initializing Page 3C - Scenario C (three-button flow)');
  const cfg = await getConfig();
  const amount = st.amount || cfg.discountedPrice;
  document.getElementById('display-amount').textContent = eur(amount);

  const paypal = await loadPayPalSdk(cfg.clientId, { components: 'buttons', enableFunding: '' });

  const style = { layout: 'vertical', shape: 'rect', color: 'gold' };
  let lastOrderId = null;
  let lastVaultId = null;

  const createScenarioOrder = async ({ paymentMethodSelected, paymentMethodPreference }) => {
    const order = await api('/api/orders', {
      amount,
      description: 'Policy - discounted premium (BA with Purchase + Pay Later)',
      createVault: true,
      paymentMethodSelected,
      paymentMethodPreference,
      currencyCode: cfg.currency || 'EUR',
    });
    lastOrderId = order.id;
    lastVaultId = order.vaultId || lastVaultId;
    return order;
  };

  const handleApprove = async (orderId) => {
    Logger.step('Capturing order from JS SDK flow');
    const result = await api(`/api/orders/${orderId}/capture`, {});
    Logger.ok(`Payment captured: capture=${result.captureId} status=${result.status}`);
    State.set({
      orderId: result.id,
      captureId: result.captureId,
      capturedAmount: result.amount?.value,
      vaultId: result.vaultId || lastVaultId || null,
      paidWith: 'js-sdk',
    });
    goTo('/pagina6c.html');
  };

  paypal.Buttons({
    fundingSource: paypal.FUNDING.PAYPAL,
    style,
    createOrder: async () => {
      const order = await createScenarioOrder({ paymentMethodSelected: 'PAYPAL_PAY_LATER' });
      Logger.ok(`JS SDK button 1 created order=${order.id} vaultId=${order.vaultId || '—'}`);
      return order.id;
    },
    onApprove: async (data) => {
      await handleApprove(data.orderID);
    },
    onCancel: () => Logger.err('Pay Now button cancelled'),
    onError: (err) => Logger.err('Pay Now button error: ' + err),
  }).render('#paypal-pay');

  paypal.Buttons({
    fundingSource: paypal.FUNDING.PAYLATER,
    style,
    createOrder: async () => {
      const order = await createScenarioOrder({ paymentMethodPreference: 'IMMEDIATE_PAYMENT_REQUIRED' });
      Logger.ok(`JS SDK button 2 created order=${order.id} vaultId=${order.vaultId || '—'}`);
      return order.id;
    },
    onApprove: async (data) => {
      await handleApprove(data.orderID);
    },
    onCancel: () => Logger.err('Pay Later button cancelled'),
    onError: (err) => Logger.err('Pay Later button error: ' + err),
  }).render('#paypal-paylater');

  const serverBtn = document.getElementById('server-redirect');
  serverBtn.onclick = async () => {
    serverBtn.disabled = true;
    try {
      const r = await api('/api/vault/paylater', {
        amount,
        description: 'Policy - discounted premium (BA with Purchase + Pay Later)',
        paymentMethodSelected: 'PAYPAL_PAY_LATER',
      });
      Logger.ok(`Server redirect order created: ${r.id} vaultId=${r.vaultId || '—'}`);
      State.set({ vaultId: r.vaultId, orderId: r.id, paidWith: 'server-redirect' });
      if (!r.payerActionUrl) throw new Error('Payer-action URL not returned');
      window.location.href = r.payerActionUrl;
    } catch (e) {
      serverBtn.disabled = false;
      document.getElementById('pay-result').innerHTML =
        `<div class="result err"><div class="icon">✖</div><div><strong>Redirect flow error</strong><div class="v">${e.message}</div></div></div>`;
    }
  };
})();
