// Sends WhatsApp messages from input.csv with headers: phone,message
// Requires: Node 18+, npm install puppeteer

const fs = require('fs/promises');
const path = require('path');
const puppeteer = require('puppeteer');

const CSV_PATH = path.join(__dirname, 'input.csv');
const USER_DATA_DIR = path.join(__dirname, 'puppeteer_data');

// If your numbers are local (no country code), set this.
// Example for India: '91'. Leave '' if CSV already has full intl numbers.
const DEFAULT_COUNTRY_CODE = '';

// Cross-version safe delay helper (older Puppeteer lacks page.waitForTimeout)
function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function normalizePhone(raw) {
  let p = String(raw || '').replace(/[^\d]/g, '');
  if (!p) return '';
  // Strip leading zeros
  p = p.replace(/^0+/, '');
  if (DEFAULT_COUNTRY_CODE && !p.startsWith(DEFAULT_COUNTRY_CODE)) {
    p = DEFAULT_COUNTRY_CODE + p;
  }
  return p;
}

// Minimal CSV parser supporting quotes and commas in fields
function splitCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(content) {
  content = content.replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (!lines.length) return [];

  const headers = splitCSVLine(lines.shift()).map(h => h.trim().toLowerCase());
  const phoneIdx = headers.indexOf('phone');
  const messageIdx = headers.indexOf('message');
  if (phoneIdx === -1 || messageIdx === -1) {
    throw new Error('CSV must have headers: phone,message');
  }

  const rows = [];
  for (const line of lines) {
    const cols = splitCSVLine(line);
    rows.push({
      phone: cols[phoneIdx] ?? '',
      message: cols[messageIdx] ?? ''
    });
  }
  return rows;
}

async function sendOne(page, rawPhone, message) {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    console.warn('Skipping row with empty/invalid phone');
    return;
  }
  const encoded = encodeURIComponent(message ?? '');
  const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}&type=phone_number&app_absent=0`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for the message box to be available
    await page.waitForSelector('div[contenteditable="true"]', { timeout: 60000 });

    // Give WhatsApp a moment to hydrate UI
    await sleep(500);

    // Try send button; fallback to Enter
    const sendButton =
      (await page.$('button[aria-label*="Send"]')) ||
      (await page.$('button[data-testid="compose-btn-send"]')) ||
      (await page.$('span[data-icon="send"]'));

    if (sendButton) {
      await sendButton.click();
    } else {
      await page.keyboard.press('Enter');
    }

    await sleep(1200);
    console.log(`Sent to ${phone}`);
  } catch (err) {
    console.warn(`Failed to send to ${phone}: ${err.message}`);
  }
}

async function main() {
  const csv = await fs.readFile(CSV_PATH, 'utf8');
  const rows = parseCSV(csv);
  if (!rows.length) {
    console.log('No rows found in CSV.');
    return;
  }

  console.log(`Loaded ${rows.length} row(s). Launching WhatsApp Web...`);

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: USER_DATA_DIR,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle2' });
    // Wait for login; scan QR if needed
    await page.waitForSelector('#app', { timeout: 0 });

    for (let i = 0; i < rows.length; i++) {
      const { phone, message } = rows[i];
      await sendOne(page, phone, message);
      await sleep(1000);
    }

    console.log('All messages attempted.');
  } finally {
    // Keep open so you can verify. Close if preferred.
    // await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
