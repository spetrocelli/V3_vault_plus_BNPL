import { Logger, State, getConfig, api, goTo, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Initializing Page 5C - Scenario C (redirect Pay Later)');
  const cfg = await getConfig();
  const amount = st.amount || cfg.discountedPrice;
  document.getElementById('display-amount').textContent = eur(amount);
  document.getElementById('vault-info').textContent =
    st.vaultId
      ? `Tokenized account: vault_id=${st.vaultId} · customer_id=${st.customerId || '—'}${st.vaultEmail ? ' (' + st.vaultEmail + ')' : ''}`
      : 'No tokenized account (go back to Page 3C)';

  const btn = document.getElementById('pay-later');
  btn.onclick = async () => {
    btn.disabled = true;
    Logger.step('Creating checkout-with-vault Pay Later order');
    try {
      const r = await api('/api/vault/paylater', {
        amount,
        description: 'Policy - discounted premium (redirect Pay Later)',
      });
      Logger.ok(`Approval URL received: ${r.approveUrl}`);
      window.location.href = r.approveUrl;
    } catch (e) {
      btn.disabled = false;
      document.getElementById('pay-result').innerHTML =
        `<div class="result err"><div class="icon">✖</div><div><strong>Pay Later redirect error</strong><div class="v">${e.message}</div></div></div>`;
    }
  };
})();
