import { Logger, State, getConfig, loadPayPalSdk, api, goTo, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Inizializzazione Pagina 3 - Scenario B (tokenizzazione)');
  const cfg = await getConfig();
  const amount = st.amount || cfg.discountedPrice;
  document.getElementById('display-amount').textContent = eur(amount);
  document.getElementById('extra-label').textContent = eur(cfg.extraAmount);

  // Il flusso "Save Payment Method" richiede l'id_token del payer nell'SDK
  // (attributo data-user-id-token). Lo richiediamo al backend.
  Logger.step('Richiesta id_token payer al backend');
  const idRes = await fetch('/api/vault/id-token');
  const { idToken } = await idRes.json();
  Logger.ok('id_token ricevuto (data-user-id-token)');

  const paypal = await loadPayPalSdk(cfg.clientId, {
    userIdToken: idToken,
    components: 'buttons',
    enableFunding: '',
  });

  // Flusso "Save Payment Method" (Vault senza acquisto):
  //  createVaultSetupToken -> setup token dal backend
  //  onApprove -> scambio setup token con payment token (vault_id) permanente
  paypal.Buttons({
    style: { layout: 'vertical', shape: 'rect', label: 'paypal' },

    createVaultSetupToken: async () => {
      Logger.step('createVaultSetupToken - richiesta setup token al backend');
      const r = await api('/api/vault/setup-token', {});
      Logger.ok('Setup token creato: ' + r.id);
      return r.id;
    },

    onApprove: async (data) => {
      Logger.step('onApprove - approvazione utente, scambio con payment token');
      Logger.info('vaultSetupToken=' + (data.vaultSetupToken || data.setupToken));
      const r = await api('/api/vault/payment-token', {
        setupTokenId: data.vaultSetupToken || data.setupToken,
      });
      Logger.ok(`Conto tokenizzato: vault_id=${r.vaultId} customer=${r.customerId}`);
      State.set({ vaultId: r.vaultId, customerId: r.customerId, vaultEmail: r.email });
      Logger.step('Tokenizzazione completata → Pagina 5 (pagamento)');
      goTo('/pagina5.html');
    },

    onCancel: () => Logger.err('Tokenizzazione annullata dall\'utente'),
    onError: (err) => Logger.err('Errore PayPal Vault: ' + err),
  }).render('#paypal-vault');

  Logger.ok('Bottone "Salva conto PayPal" renderizzato');
})();
