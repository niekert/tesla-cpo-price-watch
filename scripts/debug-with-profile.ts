import { chromium } from 'playwright';
import { homedir } from 'os';
import { join } from 'path';

const TEST_URL = 'https://www.tesla.com/nl_NL/inventory/used/m3?INTERIOR=PREMIUM_BLACK&arrangeby=plh&zip=5708&range=0';
const MIN_YEAR = 2024;

async function debug() {
  console.log('Launching browser with your Chrome profile...');
  console.log('NOTE: Close Chrome completely before running this!\n');

  // Use your actual Chrome profile to bypass detection
  const userDataDir = join(homedir(), 'Library/Application Support/Google/Chrome');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 500,
    channel: 'chrome', // Use installed Chrome
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    console.log(`Navigating to ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });

    console.log('Waiting for page to load...');
    await page.waitForTimeout(5000);

    // Take screenshot before filter
    await page.screenshot({ path: 'debug-before-filter.png' });
    console.log('Screenshot saved: debug-before-filter.png');

    // Try to find year input
    console.log('Looking for year input...');
    const yearInputExists = await page.locator('input[name="inputMin-Year"]').count();
    console.log(`Year input found: ${yearInputExists > 0}`);

    if (yearInputExists > 0) {
      console.log(`Applying year filter: ${MIN_YEAR}`);
      const yearInput = page.locator('input[name="inputMin-Year"]');

      const inputValue = await yearInput.inputValue();
      const isVisible = await yearInput.isVisible();
      console.log(`Input visible: ${isVisible}, current value: "${inputValue}"`);

      await yearInput.scrollIntoViewIfNeeded();
      await yearInput.click();
      await yearInput.clear();
      await yearInput.fill(String(MIN_YEAR));
      await yearInput.press('Tab');
      await page.waitForTimeout(500);
      await yearInput.press('Enter');

      console.log('Year filter applied, waiting for update...');
      await page.waitForTimeout(5000);

      await page.screenshot({ path: 'debug-after-filter.png' });
      console.log('Screenshot saved: debug-after-filter.png');
    } else {
      console.log('Year input not found. Available inputs:');
      const inputs = await page.locator('input').all();
      for (const input of inputs.slice(0, 20)) {
        const name = await input.getAttribute('name');
        const placeholder = await input.getAttribute('placeholder');
        if (name || placeholder) {
          console.log(`  name="${name}", placeholder="${placeholder}"`);
        }
      }
    }

    // Scrape cards
    console.log('\nLooking for vehicle cards...');
    const cards = await page.locator('article.result.card[data-id]').all();
    console.log(`Found ${cards.length} cards`);

    for (const card of cards.slice(0, 3)) {
      const dataId = await card.getAttribute('data-id');
      const vin = dataId?.split('-')[0];
      const location = await card.locator('.inventory-card-chip').textContent();
      const details = await card.locator('.card-info-details').textContent();

      console.log(`\n  VIN: ${vin}`);
      console.log(`  Location: ${location?.trim()}`);
      console.log(`  Details: ${details?.trim()}`);
    }

    console.log('\n--- Browser open for 60s for inspection (Ctrl+C to close) ---');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'debug-error.png' });
  } finally {
    await context.close();
  }
}

debug().catch(console.error);
