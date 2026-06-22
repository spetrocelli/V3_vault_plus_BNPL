import { Logger, State, getConfig, api, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Initializing Page 4 - Scenario A result');
  const cfg = await getConfig();

  document.getElementById('r-order').textContent = st.orderId || '—';
  document.getElementById('r-capture').textContent = st.captureId || '—';
  document.getElementById('r-amount').textContent = st.capturedAmount ? eur(st.capturedAmount) : '—';
  document.getElementById('extra-label').textContent = eur(cfg.extraAmount);

  if (!st.captureId) Logger.err('No capture in state: go back to Page 2');
  else Logger.ok('Result shown for capture ' + st.captureId);

  const btn = document.getElementById('refund-btn');
  btn.onclick = async () => {
    if (!st.captureId) { Logger.err('Cannot refund: capture missing'); return; }
    btn.disabled = true;
    Logger.step('Requesting extra amount refund from the backend');
    try {
      const r = await api('/api/refund', { captureId: st.captureId, amount: cfg.extraAmount });
      Logger.ok(`Refund done: refund=${r.id} status=${r.status}`);
      document.getElementById('refund-result').innerHTML =
        `<div class="result ok"><div class="icon">↩︎</div><div>
           <div><strong>Refund completed</strong> — Black Box discount applied afterwards</div>
           <div class="k">Refund ID</div><div class="v">${r.id}</div>
           <div class="k">Refunded amount</div><div class="v">${eur(r.amount?.value || cfg.extraAmount)}</div>
         </div></div>`;
    } catch (e) {
      btn.disabled = false;
      document.getElementById('refund-result').innerHTML =
        `<div class="result err"><div class="icon">✖</div><div><strong>Refund error</strong><div class="v">${e.message}</div></div></div>`;
    }
  };
})();
