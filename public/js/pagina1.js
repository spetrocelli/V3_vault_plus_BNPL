import { Logger, State, getConfig, loadPayPalSdk, renderBnplBanner, goTo, eur } from './common.js';

Logger.init();
State.clear(); // nuovo funnel
let scenario = null;

(async function init() {
  Logger.step('Inizializzazione Pagina 1 - scelta polizza');
  const cfg = await getConfig();

  // Riempimento prezzi a video
  document.getElementById('display-price').textContent = eur(cfg.fullPrice);
  document.getElementById('a-price').textContent = eur(cfg.fullPrice);
  document.getElementById('a-extra').textContent = eur(cfg.extraAmount);
  document.getElementById('b-price').textContent = eur(cfg.discountedPrice);
  document.getElementById('b-extra').textContent = eur(cfg.extraAmount);

  // Banner BNPL PayPal (calcolato sul premio pieno mostrato)
  await loadPayPalSdk(cfg.clientId);
  renderBnplBanner('bnpl', cfg.fullPrice);

  // Selezione opzioni
  const optA = document.getElementById('optA');
  const optB = document.getElementById('optB');
  const cont = document.getElementById('continue');

  function select(s, el) {
    scenario = s;
    optA.classList.toggle('selected', s === 'A');
    optB.classList.toggle('selected', s === 'B');
    cont.disabled = false;
    Logger.step(`Opzione ${s} selezionata`);
  }
  optA.onclick = () => select('A', optA);
  optB.onclick = () => select('B', optB);

  cont.onclick = () => {
    if (scenario === 'A') {
      State.set({ scenario: 'A', amount: cfg.fullPrice });
      Logger.step('Scenario A → premio pieno → Pagina 2');
      goTo('/pagina2.html');
    } else {
      State.set({ scenario: 'B', amount: cfg.discountedPrice });
      Logger.step('Scenario B → tokenizzazione → Pagina 3');
      goTo('/pagina3.html');
    }
  };

  Logger.ok('Pagina 1 pronta');
})();
