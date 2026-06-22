import { Logger, State, getConfig, loadPayPalSdk, renderBnplBanner, goTo, eur } from './common.js';

Logger.init();
State.clear(); // new funnel
let scenario = null;

(async function init() {
  Logger.step('Initializing Page 1 - policy selection');
  const cfg = await getConfig();

  // Fill prices on screen
  document.getElementById('display-price').textContent = eur(cfg.fullPrice);
  document.getElementById('a-price').textContent = eur(cfg.fullPrice);
  document.getElementById('a-extra').textContent = eur(cfg.extraAmount);
  document.getElementById('b-price').textContent = eur(cfg.discountedPrice);
  document.getElementById('b-extra').textContent = eur(cfg.extraAmount);

  // PayPal BNPL banner (computed on the full premium shown)
  await loadPayPalSdk(cfg.clientId);
  renderBnplBanner('bnpl', cfg.fullPrice);

  // Option selection
  const optA = document.getElementById('optA');
  const optB = document.getElementById('optB');
  const cont = document.getElementById('continue');

  function select(s, el) {
    scenario = s;
    optA.classList.toggle('selected', s === 'A');
    optB.classList.toggle('selected', s === 'B');
    cont.disabled = false;
    Logger.step(`Option ${s} selected`);
  }
  optA.onclick = () => select('A', optA);
  optB.onclick = () => select('B', optB);

  cont.onclick = () => {
    if (scenario === 'A') {
      State.set({ scenario: 'A', amount: cfg.fullPrice });
      Logger.step('Scenario A → full premium → Page 2');
      goTo('/pagina2.html');
    } else {
      State.set({ scenario: 'B', amount: cfg.discountedPrice });
      Logger.step('Scenario B → tokenization → Page 3');
      goTo('/pagina3.html');
    }
  };

  Logger.ok('Page 1 ready');
})();
