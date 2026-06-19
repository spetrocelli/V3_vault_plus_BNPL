import { Logger, State, getConfig, api, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Inizializzazione Pagina 4 - esito Scenario A');
  const cfg = await getConfig();

  document.getElementById('r-order').textContent = st.orderId || '—';
  document.getElementById('r-capture').textContent = st.captureId || '—';
  document.getElementById('r-amount').textContent = st.capturedAmount ? eur(st.capturedAmount) : '—';
  document.getElementById('extra-label').textContent = eur(cfg.extraAmount);

  if (!st.captureId) Logger.err('Nessuna capture in stato: torna alla Pagina 2');
  else Logger.ok('Esito mostrato per capture ' + st.captureId);

  const btn = document.getElementById('refund-btn');
  btn.onclick = async () => {
    if (!st.captureId) { Logger.err('Impossibile stornare: capture mancante'); return; }
    btn.disabled = true;
    Logger.step('Richiesta storno importo extra al backend');
    try {
      const r = await api('/api/refund', { captureId: st.captureId, amount: cfg.extraAmount });
      Logger.ok(`Storno eseguito: refund=${r.id} stato=${r.status}`);
      document.getElementById('refund-result').innerHTML =
        `<div class="result ok"><div class="icon">↩︎</div><div>
           <div><strong>Storno completato</strong> — sconto Black Box applicato a posteriori</div>
           <div class="k">Refund ID</div><div class="v">${r.id}</div>
           <div class="k">Importo stornato</div><div class="v">${eur(r.amount?.value || cfg.extraAmount)}</div>
         </div></div>`;
    } catch (e) {
      btn.disabled = false;
      document.getElementById('refund-result').innerHTML =
        `<div class="result err"><div class="icon">✖</div><div><strong>Errore storno</strong><div class="v">${e.message}</div></div></div>`;
    }
  };
})();
