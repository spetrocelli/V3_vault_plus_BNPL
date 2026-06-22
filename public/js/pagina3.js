import { Logger, State, getConfig, loadPayPalSdk, api, goTo, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Initializing Page 3 - Scenario B (tokenization)');
  const cfg = await getConfig();
  const amount = st.amount || cfg.discountedPrice;
  document.getElementById('display-amount').textContent = eur(amount);
  document.getElementById('extra-label').textContent = eur(cfg.extraAmount);

  // The "Save Payment Method" flow requires the payer's id_token in the SDK
  // (data-user-id-token attribute). We request it from the backend.
  Logger.step('Requesting payer id_token from the backend');
  const idRes = await fetch('/api/vault/id-token');
  const { idToken } = await idRes.json();
  Logger.ok('id_token received (data-user-id-token)');

  const paypal = await loadPayPalSdk(cfg.clientId, {
    userIdToken: idToken,
    components: 'buttons',
    enableFunding: '',
  });

  // "Save Payment Method" flow (Vault without purchase):
  //  createVaultSetupToken -> setup token from the backend
  //  onApprove -> exchange setup token for a permanent payment token (vault_id)
  paypal.Buttons({
    style: { layout: 'vertical', shape: 'rect', label: 'paypal' },

    createVaultSetupToken: async () => {
      Logger.step('createVaultSetupToken - requesting setup token from the backend');
      const r = await api('/api/vault/setup-token', {});
      Logger.ok('Setup token created: ' + r.id);
      return r.id;
    },

    onApprove: async (data) => {
      Logger.step('onApprove - user approval, exchange for payment token');
      Logger.info('vaultSetupToken=' + (data.vaultSetupToken || data.setupToken));
      const r = await api('/api/vault/payment-token', {
        setupTokenId: data.vaultSetupToken || data.setupToken,
      });
      Logger.ok(`Account tokenized: vault_id=${r.vaultId} customer=${r.customerId}`);
      State.set({ vaultId: r.vaultId, customerId: r.customerId, vaultEmail: r.email });
      Logger.step('Tokenization completed → Page 5 (payment)');
      goTo('/pagina5.html');
    },

    onCancel: () => Logger.err('Tokenization cancelled by the user'),
    onError: (err) => Logger.err('PayPal Vault error: ' + err),
  }).render('#paypal-vault');

  Logger.ok('"Save PayPal account" button rendered');
})();
