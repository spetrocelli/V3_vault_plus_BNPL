// Backend logger: prints every interaction and PayPal call in a readable way.
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function ts() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

export function logStep(tag, message) {
  console.log(`${colors.magenta}[${ts()}] ▶ ${tag}${colors.reset} ${message}`);
}

export function logRequest(method, url, body) {
  console.log(`${colors.cyan}[${ts()}] → PAYPAL ${method} ${url}${colors.reset}`);
  if (body) console.log(`${colors.dim}   payload: ${JSON.stringify(body)}${colors.reset}`);
}

export function logResponse(method, url, status, data) {
  const color = status < 300 ? colors.green : colors.red;
  console.log(`${color}[${ts()}] ← PAYPAL ${method} ${url} [${status}]${colors.reset}`);
  const summary = summarize(data);
  if (summary) console.log(`${colors.dim}   ${summary}${colors.reset}`);
}

export function logInfo(message) {
  console.log(`${colors.yellow}[${ts()}] ℹ ${message}${colors.reset}`);
}

export function logError(message, err) {
  console.log(`${colors.red}[${ts()}] ✖ ${message}${colors.reset}`);
  if (err) console.log(`${colors.red}   ${err.stack || err}${colors.reset}`);
}

// Extracts the useful fields from PayPal responses for a concise log.
function summarize(data) {
  if (!data || typeof data !== 'object') return '';
  const bits = [];
  if (data.id) bits.push(`id=${data.id}`);
  if (data.status) bits.push(`status=${data.status}`);
  if (data.customer?.id) bits.push(`customer=${data.customer.id}`);
  const ps = data.payment_source?.paypal;
  if (ps?.email_address) bits.push(`paypal=${ps.email_address}`);
  const cap = data.purchase_units?.[0]?.payments?.captures?.[0];
  if (cap) bits.push(`capture=${cap.id} ${cap.amount?.value} ${cap.amount?.currency_code}`);
  if (data.amount?.value) bits.push(`amount=${data.amount.value} ${data.amount.currency_code}`);
  return bits.join('  ');
}
