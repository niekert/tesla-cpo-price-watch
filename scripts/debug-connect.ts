import { chromium } from 'playwright';

const TEST_URL = 'https://www.tesla.com/nl_NL/inventory/used/m3?INTERIOR=PREMIUM_BLACK&arrangeby=plh&zip=5708&range=0';
const MIN_YEAR = 2024;

async function debug() {
  console.log(`
===========================================
STEP 1: Close Chrome completely

STEP 2: Run this command in a NEW terminal:

  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222

STEP 3: In that Chrome window, navigate to:
  ${TEST_URL}

STEP 4: Press Enter here when ready...
===========================================
`);

  // Wait for user to press enter
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  console.log('Connecting to Chrome...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');

  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  const page = pages.find(p => p.url().includes('tesla.com')) || pages[0];

  console.log(`Connected to page: ${page.url()}`);

  try {
    // Wait a bit for page to be ready
    await page.waitForTimeout(2000);

    // Try to find year input
    console.log('\nLooking for year input...');
    const yearInputExists = await page.locator('input[name="inputMin-Year"]').count();
    console.log(`Year input found: ${yearInputExists > 0}`);

    if (yearInputExists > 0) {
      console.log(`\nApplying year filter: ${MIN_YEAR}`);
      const yearInput = page.locator('input[name="inputMin-Year"]');

      const boundingBox = await yearInput.boundingBox();
      console.log(`Input bounding box:`, boundingBox);

      const inputValue = await yearInput.inputValue();
      const isVisible = await yearInput.isVisible();
      const isEnabled = await yearInput.isEnabled();
      console.log(`Visible: ${isVisible}, Enabled: ${isEnabled}, Value: "${inputValue}"`);

      if (isVisible) {
        await yearInput.scrollIntoViewIfNeeded();
        await yearInput.click();
        await page.waitForTimeout(300);
        await yearInput.clear();
        await yearInput.fill(String(MIN_YEAR));
        console.log('Filled value, pressing Tab...');
        await yearInput.press('Tab');
        await page.waitForTimeout(1000);
        console.log('Pressing Enter...');
        await yearInput.press('Enter');

        console.log('Filter applied! Watch the browser...');
        await page.waitForTimeout(5000);
      }
    } else {
      console.log('\nYear input not found. Listing all inputs:');
      const inputs = await page.locator('input').all();
      for (const input of inputs) {
        const name = await input.getAttribute('name');
        const id = await input.getAttribute('id');
        const placeholder = await input.getAttribute('placeholder');
        const type = await input.getAttribute('type');
        const isVisible = await input.isVisible();
        if (name || id) {
          console.log(`  name="${name}" id="${id}" type="${type}" visible=${isVisible} placeholder="${placeholder}"`);
        }
      }
    }

    // Scrape cards
    console.log('\n--- Vehicle Cards ---');
    const cards = await page.locator('article.result.card[data-id]').all();
    console.log(`Found ${cards.length} cards\n`);

    for (const card of cards.slice(0, 5)) {
      const dataId = await card.getAttribute('data-id');
      const vin = dataId?.split('-')[0];
      const location = await card.locator('.inventory-card-chip').textContent().catch(() => 'N/A');
      const details = await card.locator('.card-info-details').textContent().catch(() => 'N/A');

      console.log(`VIN: ${vin}`);
      console.log(`  Location: ${location?.trim()}`);
      console.log(`  Details: ${details?.trim()}\n`);
    }

  } catch (error) {
    console.error('Error:', error);
  }

  console.log('\nDone! You can close Chrome now.');
}

debug().catch(console.error);
