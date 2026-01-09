import { firefox } from 'playwright';

const TEST_URL = 'https://www.tesla.com/nl_NL/inventory/used/m3?INTERIOR=PREMIUM_BLACK&arrangeby=plh&zip=5708&range=0';
const MIN_YEAR = 2024;

async function debug() {
  console.log('Launching Firefox...');
  const browser = await firefox.launch({
    headless: false,
    slowMo: 300,
  });

  const page = await browser.newPage();

  try {
    console.log(`Navigating to ${TEST_URL}`);
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('Waiting for page to load...');
    await page.waitForTimeout(3000);

    // Dismiss cookie banner
    console.log('Looking for cookie banner...');
    const acceptButton = page.locator('button:has-text("Accepteren")');
    if (await acceptButton.count() > 0) {
      console.log('Clicking cookie accept button...');
      await acceptButton.click();
      await page.waitForTimeout(1000);
    }

    // Dismiss locale modal by pressing Escape
    console.log('Looking for locale modal...');
    const dialog = page.locator('dialog');
    if (await dialog.count() > 0 && await dialog.isVisible()) {
      console.log('Pressing Escape to close modal...');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }

    await page.waitForTimeout(2000);
    console.log('Page title:', await page.title());
    console.log('Page URL:', page.url());

    // Check if blocked
    const bodyText = await page.locator('body').textContent();
    if (bodyText?.includes('permission') || bodyText?.includes('blocked')) {
      console.log('\n⚠️  Might be blocked. Page content preview:');
      console.log(bodyText?.slice(0, 500));
      return;
    }

    // Try to find year input
    console.log('\nLooking for year input...');

    // List ALL inputs first
    console.log('\nAll inputs on page:');
    const allInputs = await page.locator('input').all();
    for (const input of allInputs) {
      try {
        const name = await input.getAttribute('name');
        const id = await input.getAttribute('id');
        const type = await input.getAttribute('type');
        const visible = await input.isVisible();
        if (name || id) {
          console.log(`  name="${name}" id="${id}" type="${type}" visible=${visible}`);
        }
      } catch {}
    }

    const yearInputExists = await page.locator('input[name="inputMin-Year"]').count();
    console.log(`\nYear input "inputMin-Year" found: ${yearInputExists > 0}`);

    if (yearInputExists > 0) {
      const yearInput = page.locator('input[name="inputMin-Year"]');
      console.log('Clicking and filling year input...');

      await yearInput.scrollIntoViewIfNeeded();
      await yearInput.click();
      await yearInput.fill(String(MIN_YEAR));
      await yearInput.press('Enter');

      console.log('Waiting for results to update...');
      await page.waitForTimeout(5000);
    }

    // Scrape cards
    console.log('\n--- Vehicle Cards ---');
    const cards = await page.locator('article.result.card[data-id]').all();
    console.log(`Found ${cards.length} total card elements`);

    // Deduplicate by VIN
    const seenVins = new Set<string>();
    let uniqueCount = 0;

    for (const card of cards) {
      const dataId = await card.getAttribute('data-id');
      const vin = dataId?.split('-')[0];

      if (!vin || vin.length !== 17 || seenVins.has(vin)) continue;
      seenVins.add(vin);
      uniqueCount++;

      const location = await card.locator('.inventory-card-chip').textContent().catch(() => 'N/A');
      const details = await card.locator('.card-info-details').textContent().catch(() => 'N/A');

      console.log(`\n${uniqueCount}. VIN: ${vin}`);
      console.log(`   Location: ${location?.trim()}`);
      console.log(`   Details: ${details?.trim()}`);

    }

    console.log(`\n✓ ${uniqueCount} unique vehicles (from ${cards.length} DOM elements)`);


    console.log('\n--- Browser stays open for 30s (Ctrl+C to close) ---');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

debug().catch(console.error);
