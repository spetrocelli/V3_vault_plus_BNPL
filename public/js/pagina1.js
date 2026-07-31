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
  const optC = document.getElementById('optC');
  const cont = document.getElementById('continue');

  function select(s) {
    scenario = s;
    optA.classList.toggle('selected', s === 'A');
    optB.classList.toggle('selected', s === 'B');
    optC.classList.toggle('selected', s === 'C');
    cont.disabled = false;
    Logger.step(`Option ${s} selected`);
  }
  optA.onclick = () => select('A');
  optB.onclick = () => select('B');
  optC.onclick = () => select('C');

  cont.onclick = () => {
    if (scenario === 'A') {
      State.set({ scenario: 'A', amount: cfg.fullPrice });
      Logger.step('Scenario A → full premium → Page 2');
      goTo('/pagina2.html');
    } else if (scenario === 'C') {
      State.set({ scenario: 'C', amount: cfg.discountedPrice });
      Logger.step('Scenario C → tokenization → Page 3C');
      goTo('/pagina3c.html');
    } else {
      State.set({ scenario: 'B', amount: cfg.discountedPrice });
      Logger.step('Scenario B → tokenization → Page 3');
      goTo('/pagina3.html');
    }
  };

  Logger.ok('Page 1 ready');
})();
