const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const USER_DATA_DIR = path.join(__dirname, 'puppeteer_data');
const CONTACTS_FILE = path.join(__dirname, 'contacts.json');
const FLAG_FILE = path.join(__dirname, 'first_run_done.txt');
const NAV_TIMEOUT = 60000;

// ======= STEP 1: Check if script was already run once =======
(async () => {
  try {
    await fs.access(FLAG_FILE);
    console.log('✅ WhatsApp automation already executed once. Exiting...');
    process.exit(0);
  } catch {
    console.log('🚀 First run detected. Proceeding to send WhatsApp messages...');
  }
})();

async function readContacts() {
  try {
    const raw = await fs.readFile(CONTACTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [
       { phone: '7723065844', message: 'Hello Krishna! This is an automated message.'},
        { phone: '7869722272', message: 'Hello Krishna! This is an automated message. genereted me code'},
        // { phone: '8827944207', message: 'Hello'},
        // { phone: '9329229531', message: 'Hello '},
        // { phone: '7974815528', message: 'Hello tum khana ka li'}
    ];
  }
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function sendToNumber(page, phone, message) {
  const encoded = encodeURIComponent(message || '');
  const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encoded}`;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    await page.waitForSelector('div[contenteditable="true"][data-tab]', { timeout: 20000 });

    const sendBtn = await page.$('button[data-testid="compose-btn-send"], span[data-icon="send"]');
    if (sendBtn) {
      await sendBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }

    await sleep(1500);
    console.log(`✅ Message sent to ${phone}`);
  } catch (err) {
    console.error(`❌ Error sending to ${phone}:`, err.message);
  }
}

async function deleteFlagFile() {
  try {
    await fs.unlink(FLAG_FILE);
    console.log('🗑️  Flag file deleted. Script can run again next time.');
  } catch {
    console.log('⚠️  No flag file found to delete (maybe first run failed).');
  }
}

(async () => {
  const contacts = await readContacts();

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: USER_DATA_DIR,
    defaultViewport: null,
  });

  const page = await browser.newPage();
  console.log('📱 Opening WhatsApp Web... Scan the QR code if prompted.');

  for (const contact of contacts) {
    await sendToNumber(page, contact.phone, contact.message);
    await sleep(3000);
  }

  // ======= STEP 2: Mark script as executed once =======
  await fs.writeFile(FLAG_FILE, 'done');
  console.log('\n✅ Messages sent and flag saved. Next time, this script will not run again.');

  await browser.close();

  // delete the file

  await deleteFlagFile();


})();

