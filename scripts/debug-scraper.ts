import { chromium } from 'playwright';

const TEST_URL = 'https://www.tesla.com/nl_NL/inventory/used/m3?INTERIOR=PREMIUM_BLACK&arrangeby=plh&zip=5708&range=0';
const MIN_YEAR = 2024;

async function debug() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: false, // Show the browser so you can see what's happening
    slowMo: 500, // Slow down actions by 500ms
  });

  // Create context with realistic settings to avoid detection
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
    geolocation: { latitude: 51.4416, longitude: 5.4697 }, // Eindhoven
    permissions: ['geolocation'],
  });

  const page = await context.newPage();

  // Add stealth scripts to avoid detection
  await page.addInitScript(() => {
    // Override webdriver detection
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Override plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['nl-NL', 'nl', 'en-US', 'en'],
    });
  });

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

      // Log input state
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

      // Take screenshot after filter
      await page.screenshot({ path: 'debug-after-filter.png' });
      console.log('Screenshot saved: debug-after-filter.png');
    } else {
      // Look for what inputs ARE available
      console.log('Year input not found. Looking for available inputs...');
      const inputs = await page.locator('input').all();
      for (const input of inputs.slice(0, 20)) {
        const name = await input.getAttribute('name');
        const placeholder = await input.getAttribute('placeholder');
        const type = await input.getAttribute('type');
        if (name || placeholder) {
          console.log(`  Input: name="${name}", placeholder="${placeholder}", type="${type}"`);
        }
      }
    }

    // Now scrape cards
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

    // Keep browser open for inspection
    console.log('\n--- Browser will stay open for 60 seconds for inspection ---');
    console.log('Press Ctrl+C to close earlier');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'debug-error.png' });
    console.log('Error screenshot saved: debug-error.png');
  } finally {
    await context.close();
    await browser.close();
  }
}

debug().catch(console.error);
