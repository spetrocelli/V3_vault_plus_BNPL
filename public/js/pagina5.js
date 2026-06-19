import { Logger, State, getConfig, loadPayPalSdk, renderBnplBanner, api, goTo, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  // Fallback/diagnostica: consenti override di vault_id/customer_id da query string.
  const qp = new URLSearchParams(location.search);
  if (qp.get('customer_id')) st.customerId = qp.get('customer_id');
  if (qp.get('vault_id')) st.vaultId = qp.get('vault_id');
  Logger.step('Inizializzazione Pagina 5 - Scenario B (pagamento)');
  const cfg = await getConfig();
  const amount = st.amount || cfg.discountedPrice;
  document.getElementById('display-amount').textContent = eur(amount);
  document.getElementById('vault-info').textContent =
    st.vaultId
      ? `Conto tokenizzato: vault_id=${st.vaultId} · customer_id=${st.customerId || '—'}${st.vaultEmail ? ' (' + st.vaultEmail + ')' : ''}`
      : 'Nessun conto tokenizzato (torna alla Pagina 3)';

  if (!st.customerId) {
    Logger.err('customer_id assente: senza target_customer_id il one-click NON mostra il conto salvato!');
  }

  // PASSO 1: ottenere PRIMA il data-user-id-token (returning payer, target_customer_id),
  // POI caricare l'SDK e SOLO DOPO renderizzare i bottoni JS.
  Logger.step('Richiesta id_token payer (target_customer_id=' + (st.customerId || '—') + ')');
  const q = st.customerId ? ('?customerId=' + encodeURIComponent(st.customerId)) : '';
  const idRes = await fetch('/api/vault/id-token' + q);
  const { idToken } = await idRes.json();
  Logger.ok('id_token ricevuto');

  // PASSO 2: load SDK con data-user-id-token.
  const paypal = await loadPayPalSdk(cfg.clientId, { userIdToken: idToken });
  Logger.ok('SDK caricato con data-user-id-token → ora renderizzo i bottoni');

  // Stile identico al reference (one-click).
  const style = { color: 'gold', shape: 'rect', height: 45, tagline: false };

  // ---- 1) Paga ora: JS SDK one-click sul conto salvato (Edit FI) ----
  // createOrder SENZA attributi vault: ci pensa data-user-id-token a mostrare il conto salvato.
  paypal.Buttons({
    fundingSource: paypal.FUNDING.PAYPAL,
    style,
    createOrder: async () => {
      Logger.step('[1 JS SDK] createOrder (premio scontato, conto salvato)');
      const order = await api('/api/orders', { amount, description: 'Polizza - premio scontato (one-click JS SDK)' });
      return order.id;
    },
    onApprove: async (data) => {
      Logger.step('[1 JS SDK] onApprove, cattura ' + data.orderID);
      const r = await api(`/api/orders/${data.orderID}/capture`, {});
      Logger.ok(`[1 JS SDK] completato: capture=${r.captureId} stato=${r.status}`);
      State.set({ captureId: r.captureId, capturedAmount: r.amount?.value, paidWith: 'jssdk-oneclick' });
      goTo('/pagina6.html');
    },
    onCancel: () => Logger.err('[1 JS SDK] Pagamento annullato dall\'utente'),
    onError: (err) => Logger.err('[1 JS SDK] Errore PayPal: ' + err),
  }).render('#paypal-pay');
  Logger.ok('Bottone 1 (JS SDK one-click) renderizzato');

  // ---- 2) Paga ora: cattura lato SERVER (MIT con vault_id) ----
  const payServer = document.getElementById('pay-server');
  payServer.onclick = async () => {
    if (!st.vaultId) { Logger.err('[2 server] vault_id assente: impossibile pagare'); return; }
    payServer.disabled = true;
    Logger.step('[2 server] Cattura server side: v2/order con vault_id=' + st.vaultId);
    try {
      const r = await api('/api/vault/pay', { amount, vaultId: st.vaultId, description: 'Polizza - premio scontato (server side vault)' });
      Logger.ok(`[2 server] completato: capture=${r.captureId} stato=${r.status}`);
      State.set({ captureId: r.captureId, capturedAmount: r.amount?.value, paidWith: 'server-vault' });
      goTo('/pagina6.html');
    } catch (e) {
      payServer.disabled = false;
      document.getElementById('pay-result').innerHTML =
        `<div class="result err"><div class="icon">✖</div><div><strong>Errore cattura server side</strong><div class="v">${e.message}</div></div></div>`;
    }
  };
  Logger.ok('Bottone 2 (cattura server side) pronto');

  // ---- 3) Paga a rate (BNPL): banner prima del pulsante ----
  renderBnplBanner('bnpl', amount);
  paypal.Buttons({
    fundingSource: paypal.FUNDING.PAYLATER,
    style,
    createOrder: async () => {
      Logger.step('[3 Pay Later] createOrder (premio scontato)');
      const order = await api('/api/orders', { amount, description: 'Polizza - premio scontato (BNPL)' });
      return order.id;
    },
    onApprove: async (data) => {
      Logger.step('[3 Pay Later] onApprove, cattura ' + data.orderID);
      const r = await api(`/api/orders/${data.orderID}/capture`, {});
      Logger.ok(`[3 Pay Later] completato: capture=${r.captureId}`);
      State.set({ captureId: r.captureId, capturedAmount: r.amount?.value, paidWith: 'paylater' });
      goTo('/pagina6.html');
    },
    onCancel: () => Logger.err('[3 Pay Later] annullato'),
    onError: (err) => Logger.err('[3 Pay Later] Errore: ' + err),
  }).render('#paypal-paylater');
  Logger.ok('Bottone 3 (Pay Later) renderizzato');
})();
