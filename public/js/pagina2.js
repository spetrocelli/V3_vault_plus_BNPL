import { Logger, State, getConfig, loadPayPalSdk, renderBnplBanner, api, goTo, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Initializing Page 2 - Scenario A (full premium)');
  const cfg = await getConfig();
  const amount = st.amount || cfg.fullPrice;
  document.getElementById('display-amount').textContent = eur(amount);
  Logger.info(`Amount to pay: ${amount} ${cfg.currency}`);

  const paypal = await loadPayPalSdk(cfg.clientId);

  // Handlers shared by both buttons (PayPal "Pay now" and Pay Later).
  const handlers = {
    createOrder: async () => {
      Logger.step('createOrder (Scenario A) - backend request');
      const order = await api('/api/orders', { amount, description: 'Car/Motorcycle policy - full premium' });
      Logger.ok('Order created: ' + order.id);
      return order.id;
    },
    onApprove: async (data) => {
      Logger.step('onApprove - capturing order ' + data.orderID);
      const result = await api(`/api/orders/${data.orderID}/capture`, {});
      Logger.ok(`Payment captured: capture=${result.captureId} status=${result.status}`);
      State.set({
        captureId: result.captureId,
        capturedAmount: result.amount?.value,
        orderId: result.id,
      });
      Logger.step('Payment completed → Page 4 (result)');
      goTo('/pagina4.html');
    },
    onCancel: () => Logger.err('Payment cancelled by the user'),
    onError: (err) => Logger.err('PayPal Buttons error: ' + err),
  };

  // ONLY PayPal and Pay Later, same look & feel (gold/rect).
  // PayPal button on top, BNPL banner in the middle, Pay Later button below.
  const style = { layout: 'vertical', shape: 'rect', color: 'gold' };

  paypal.Buttons({ fundingSource: paypal.FUNDING.PAYPAL, style, ...handlers })
    .render('#paypal-pay');

  renderBnplBanner('bnpl', amount);

  paypal.Buttons({ fundingSource: paypal.FUNDING.PAYLATER, style, ...handlers })
    .render('#paypal-paylater');

  Logger.ok('Buttons rendered (gold): PayPal · BNPL banner · Pay Later');
})();
