import { Logger, State, getConfig, api, eur } from './common.js';

Logger.init();

(async function init() {
  const st = State.get();
  Logger.step('Inizializzazione Pagina 6 - addebito importo extra (Scenario B)');
  const cfg = await getConfig();

  document.getElementById('r-capture').textContent = st.captureId || '—';
  document.getElementById('r-amount').textContent = st.capturedAmount ? eur(st.capturedAmount) : '—';
  document.getElementById('r-method').textContent =
    st.paidWith === 'paylater' ? 'Paga a rate (BNPL)' : st.paidWith === 'vault' ? 'Edit Funding Instrument (conto tokenizzato)' : '—';
  document.getElementById('extra-label').textContent = eur(cfg.extraAmount);

  if (!st.vaultId) Logger.err('Conto non tokenizzato in stato: l\'addebito extra userà l\'ultimo vault salvato sul backend');

  const btn = document.getElementById('extra-btn');
  btn.onclick = async () => {
    btn.disabled = true;
    Logger.step('Richiesta addebito importo extra al backend (vault) - mancata installazione Black Box');
    try {
      const r = await api('/api/vault/pay', {
        amount: cfg.extraAmount,
        vaultId: st.vaultId,
        description: 'Addebito extra - mancata installazione Black Box',
      });
      Logger.ok(`Addebito extra completato: capture=${r.captureId} stato=${r.status}`);
      document.getElementById('extra-result').innerHTML =
        `<div class="result ok"><div class="icon">⚡</div><div>
           <div><strong>Addebito extra eseguito</strong> — sconto Black Box rimosso post-vendita</div>
           <div class="k">Capture ID</div><div class="v">${r.captureId}</div>
           <div class="k">Importo addebitato</div><div class="v">${eur(r.amount?.value || cfg.extraAmount)}</div>
         </div></div>`;
    } catch (e) {
      btn.disabled = false;
      document.getElementById('extra-result').innerHTML =
        `<div class="result err"><div class="icon">✖</div><div><strong>Errore addebito extra</strong><div class="v">${e.message}</div></div></div>`;
    }
  };
})();
