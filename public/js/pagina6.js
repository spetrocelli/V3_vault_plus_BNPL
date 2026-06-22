import { Logger, State, getConfig, api, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Initializing Page 6 - extra amount charge (Scenario B)');
  const cfg = await getConfig();

  document.getElementById('r-capture').textContent = st.captureId || '—';
  document.getElementById('r-amount').textContent = st.capturedAmount ? eur(st.capturedAmount) : '—';
  document.getElementById('r-method').textContent =
    st.paidWith === 'paylater' ? 'Pay in installments (BNPL)' : st.paidWith === 'vault' ? 'Edit Funding Instrument (tokenized account)' : '—';
  document.getElementById('extra-label').textContent = eur(cfg.extraAmount);

  if (!st.vaultId) Logger.err('Account not tokenized in state: the extra charge will use the last vault saved on the backend');

  const btn = document.getElementById('extra-btn');
  btn.onclick = async () => {
    btn.disabled = true;
    Logger.step('Requesting extra amount charge from the backend (vault) - Black Box not installed');
    try {
      const r = await api('/api/vault/pay', {
        amount: cfg.extraAmount,
        vaultId: st.vaultId,
        description: 'Extra charge - Black Box not installed',
      });
      Logger.ok(`Extra charge completed: capture=${r.captureId} status=${r.status}`);
      document.getElementById('extra-result').innerHTML =
        `<div class="result ok"><div class="icon">⚡</div><div>
           <div><strong>Extra charge executed</strong> — Black Box discount removed after sale</div>
           <div class="k">Capture ID</div><div class="v">${r.captureId}</div>
           <div class="k">Charged amount</div><div class="v">${eur(r.amount?.value || cfg.extraAmount)}</div>
         </div></div>`;
    } catch (e) {
      btn.disabled = false;
      document.getElementById('extra-result').innerHTML =
        `<div class="result err"><div class="icon">✖</div><div><strong>Extra charge error</strong><div class="v">${e.message}</div></div></div>`;
    }
  };
})();
