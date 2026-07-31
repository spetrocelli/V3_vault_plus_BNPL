import { Logger, State, getConfig, api, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Initializing Page 6C - Scenario C result');
  const cfg = await getConfig();
  const qp = new URLSearchParams(location.search);

  const orderId = qp.get('orderId') || st.orderId || '—';
  const captureId = qp.get('captureId') || st.captureId || '—';
  const amount = qp.get('amount') || st.capturedAmount || '';
  const status = qp.get('status') || st.status || '';
  const method = qp.get('method') || 'paylater-redirect';
  const vaultId = st.vaultId || qp.get('vaultId') || '—';

  document.getElementById('r-order').textContent = orderId;
  document.getElementById('r-capture').textContent = captureId;
  document.getElementById('r-amount').textContent = amount ? eur(amount) : '—';
  document.getElementById('r-method').textContent = method === 'paylater-redirect' ? 'Pay Later redirect' : '—';
  document.getElementById('r-vault').textContent = vaultId;

  State.set({ orderId, captureId, capturedAmount: amount, status, paidWith: 'paylater-redirect', vaultId });

  const btn = document.getElementById('extra-btn');
  btn.onclick = async () => {
    if (!st.vaultId && !qp.get('vaultId')) {
      Logger.err('No vault ID available for the extra charge');
      document.getElementById('extra-result').innerHTML =
        '<div class="result err"><div class="icon">✖</div><div><strong>No vault ID available</strong><div class="v">The discounted purchase did not return a vault ID.</div></div></div>';
      return;
    }
    btn.disabled = true;
    Logger.step('Charging extra amount with the vault created during Scenario C');
    try {
      const r = await api('/api/vault/pay', {
        amount: cfg.extraAmount,
        vaultId: st.vaultId || qp.get('vaultId'),
        description: 'Extra charge - Black Box not installed',
      });
      Logger.ok(`Extra charge completed: capture=${r.captureId} status=${r.status}`);
      document.getElementById('extra-result').innerHTML =
        `<div class="result ok"><div class="icon">⚡</div><div><strong>Extra charge executed</strong><div class="v">Capture ID ${r.captureId}</div></div></div>`;
    } catch (e) {
      btn.disabled = false;
      document.getElementById('extra-result').innerHTML =
        `<div class="result err"><div class="icon">✖</div><div><strong>Extra charge error</strong><div class="v">${e.message}</div></div></div>`;
    }
  };

  if (status && status.toUpperCase() !== 'COMPLETED') {
    Logger.err(`Return completed with status ${status}`);
  } else {
    Logger.ok(`Scenario C completed order=${orderId} capture=${captureId}`);
  }
})();
