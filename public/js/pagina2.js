import { Logger, State, getConfig, loadPayPalSdk, renderBnplBanner, api, goTo, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Inizializzazione Pagina 2 - Scenario A (premio pieno)');
  const cfg = await getConfig();
  const amount = st.amount || cfg.fullPrice;
  document.getElementById('display-amount').textContent = eur(amount);
  Logger.info(`Importo da pagare: ${amount} ${cfg.currency}`);

  const paypal = await loadPayPalSdk(cfg.clientId);

  // Handler condivisi dai due bottoni (PayPal "Paga ora" e Pay Later "Paga dopo").
  const handlers = {
    createOrder: async () => {
      Logger.step('createOrder (Scenario A) - richiesta al backend');
      const order = await api('/api/orders', { amount, description: 'Polizza Auto/Moto - premio pieno' });
      Logger.ok('Ordine creato: ' + order.id);
      return order.id;
    },
    onApprove: async (data) => {
      Logger.step('onApprove - cattura ordine ' + data.orderID);
      const result = await api(`/api/orders/${data.orderID}/capture`, {});
      Logger.ok(`Pagamento catturato: capture=${result.captureId} stato=${result.status}`);
      State.set({
        captureId: result.captureId,
        capturedAmount: result.amount?.value,
        orderId: result.id,
      });
      Logger.step('Pagamento completato → Pagina 4 (esito)');
      goTo('/pagina4.html');
    },
    onCancel: () => Logger.err('Pagamento annullato dall\'utente'),
    onError: (err) => Logger.err('Errore PayPal Buttons: ' + err),
  };

  // SOLO PayPal e Pay Later, stesso look & feel (gold/rect).
  // Bottone PayPal sopra, banner BNPL in mezzo, bottone Pay Later sotto.
  const style = { layout: 'vertical', shape: 'rect', color: 'gold' };

  paypal.Buttons({ fundingSource: paypal.FUNDING.PAYPAL, style, ...handlers })
    .render('#paypal-pay');

  renderBnplBanner('bnpl', amount);

  paypal.Buttons({ fundingSource: paypal.FUNDING.PAYLATER, style, ...handlers })
    .render('#paypal-paylater');

  Logger.ok('Bottoni renderizzati (gold): PayPal · banner BNPL · Pay Later');
})();
