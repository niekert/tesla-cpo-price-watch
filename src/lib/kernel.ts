import Kernel from '@onkernel/sdk';
import { chromium, Page } from 'playwright';
import { Vehicle, WatchConfig } from './types';
import { extractVehiclesFromDOM, ScrapedVehicle } from './scraper';

// Lazy initialize Kernel client to avoid build-time errors
let _kernel: Kernel | null = null;
function getKernel(): Kernel {
  if (!_kernel) {
    _kernel = new Kernel({
      apiKey: process.env.KERNEL_API_KEY!,
    });
  }
  return _kernel;
}

interface TeslaInventoryItem {
  VIN: string;
  Model: string;
  TrimName: string;
  Price: number;
  Odometer: number;
  City: string;
  StateProvince?: string;
  Country?: string;
  InventoryPrice: number;
  Currency: string;
  VehicleDetailUrl?: string;
}

async function waitForPageStable(page: Page, timeout = 10000): Promise<void> {
  const startTime = Date.now();
  let lastContent = 0;

  while (Date.now() - startTime < timeout) {
    await page.waitForTimeout(500);
    try {
      const currentContent = await page.evaluate(() => document.body?.innerHTML?.length || 0);
      if (currentContent === lastContent && currentContent > 1000) {
        // Page content stabilized
        return;
      }
      lastContent = currentContent;
    } catch {
      // Context might be destroyed during navigation, wait and retry
      await page.waitForTimeout(500);
    }
  }
}

async function extractVehiclesFromPage(page: Page, config: WatchConfig): Promise<Vehicle[]> {
  // Wait for page to stabilize after any redirects/navigation
  await waitForPageStable(page);

  // Try multiple extraction methods with retries
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Method 1: Try to intercept network response (most reliable)
      const vehicles = await tryExtractFromPageState(page, config);
      if (vehicles.length > 0) {
        return vehicles;
      }

      // Method 2: Try DOM scraping
      const domVehicles = await tryExtractFromDOM(page);
      if (domVehicles.length > 0) {
        return domVehicles;
      }

      // Wait before retry
      await page.waitForTimeout(2000);
    } catch (error) {
      console.log(`Extraction attempt ${attempt + 1} failed:`, error);
      await page.waitForTimeout(1000);
    }
  }

  return [];
}

async function tryExtractFromPageState(page: Page, config: WatchConfig): Promise<Vehicle[]> {
  const inventoryData = await page.evaluate(() => {
    // Tesla stores inventory in various places
    const win = window as unknown as Record<string, unknown>;

    // Check common Tesla data stores
    if (win.__PRELOADED_STATE__) return win.__PRELOADED_STATE__;
    if (win.__ds_state__) return win.__ds_state__;
    if (win.__NEXT_DATA__) return win.__NEXT_DATA__;

    // Look for JSON in script tags
    const scripts = document.querySelectorAll('script:not([src])');
    for (const script of scripts) {
      const content = script.textContent || '';
      if (content.includes('"VIN"') && content.includes('"results"')) {
        try {
          const match = content.match(/\{[^{}]*"results"\s*:\s*\[[^\]]*\][^{}]*\}/);
          if (match) return JSON.parse(match[0]);
        } catch { /* continue */ }
      }
    }

    return null;
  });

  if (!inventoryData) return [];

  const results = extractResults(inventoryData);
  return results.map(item => parseVehicle(item, config));
}

async function tryExtractFromDOM(page: Page): Promise<Vehicle[]> {
  // Pass the function source to evaluate - it runs in browser context
  const scraped = await page.evaluate(extractVehiclesFromDOM);

  // Convert ScrapedVehicle to Vehicle (add variant field)
  return scraped.map((v: ScrapedVehicle): Vehicle => ({
    vin: v.vin,
    model: v.model,
    variant: v.year ? `${v.year}` : v.model,
    price: v.price,
    currency: v.currency,
    mileage: v.mileage,
    location: v.location,
    url: v.url,
  }));
}

function extractResults(data: unknown): TeslaInventoryItem[] {
  if (!data || typeof data !== 'object') return [];

  const obj = data as Record<string, unknown>;

  // Try common Tesla data structures
  if (Array.isArray(obj.results)) {
    return obj.results as TeslaInventoryItem[];
  }

  if (obj.inventory && typeof obj.inventory === 'object') {
    const inv = obj.inventory as Record<string, unknown>;
    if (Array.isArray(inv.results)) {
      return inv.results as TeslaInventoryItem[];
    }
  }

  if (obj.DSServices && typeof obj.DSServices === 'object') {
    const ds = obj.DSServices as Record<string, unknown>;
    if (ds.InventoryListService && typeof ds.InventoryListService === 'object') {
      const ils = ds.InventoryListService as Record<string, unknown>;
      if (Array.isArray(ils.results)) {
        return ils.results as TeslaInventoryItem[];
      }
    }
  }

  // Recursively search for results array
  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && value.length > 0 && value[0]?.VIN) {
      return value as TeslaInventoryItem[];
    }
    if (typeof value === 'object' && value !== null) {
      const results = extractResults(value);
      if (results.length > 0) return results;
    }
  }

  return [];
}

function parseVehicle(item: TeslaInventoryItem, config: WatchConfig): Vehicle {
  const location = [item.City, item.StateProvince, item.Country]
    .filter(Boolean)
    .join(', ');

  return {
    vin: item.VIN,
    model: item.Model || config.name,
    variant: item.TrimName || 'Unknown',
    price: item.InventoryPrice || item.Price,
    currency: item.Currency || 'EUR',
    mileage: item.Odometer || 0,
    location,
    url: item.VehicleDetailUrl
      ? `https://www.tesla.com${item.VehicleDetailUrl}`
      : `https://www.tesla.com/inventory/used/${item.VIN}`,
  };
}

export async function scrapeUrl(config: WatchConfig): Promise<Vehicle[]> {
  let kernelBrowser;
  let browser;

  try {
    // Create Kernel browser with stealth mode
    const kernel = getKernel();
    kernelBrowser = await kernel.browsers.create({
      stealth: true,
    });

    // Connect Playwright to Kernel via CDP
    browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);

    // Use existing context and page (Kernel creates one by default)
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());

    // Set a longer timeout for navigation
    page.setDefaultTimeout(60000);

    // Navigate to Tesla inventory
    console.log(`Navigating to ${config.url}`);
    await page.goto(config.url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Wait for initial load
    await page.waitForTimeout(3000);

    // Dismiss cookie banner if present
    try {
      const acceptButton = page.locator('button:has-text("Accepteren")');
      if (await acceptButton.count() > 0) {
        console.log('Dismissing cookie banner...');
        await acceptButton.click();
        await page.waitForTimeout(1000);
      }
    } catch { /* ignore */ }

    // Dismiss locale modal by pressing Escape
    try {
      const dialog = page.locator('dialog');
      if (await dialog.count() > 0 && await dialog.isVisible()) {
        console.log('Dismissing locale modal...');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
      }
    } catch { /* ignore */ }

    // Apply year filter if configured
    if (config.minYear) {
      console.log(`Applying year filter: ${config.minYear}+`);
      try {
        // Wait for filter inputs to be available (they might load dynamically)
        await page.waitForSelector('input[name="inputMin-Year"]', { timeout: 10000 });

        // Find and fill the minimum year input
        const yearInput = page.locator('input[name="inputMin-Year"]');
        await yearInput.scrollIntoViewIfNeeded();
        await yearInput.click();
        await yearInput.clear();
        await yearInput.fill(String(config.minYear));
        await yearInput.press('Tab'); // Move focus to trigger change
        await page.waitForTimeout(500);
        await yearInput.press('Enter');

        console.log(`Year filter applied: ${config.minYear}`);

        // Wait for results to update
        await page.waitForTimeout(3000);
        await waitForPageStable(page);
      } catch (error) {
        console.log('Failed to apply year filter:', error);
      }
    }

    // Extract vehicles
    const vehicles = await extractVehiclesFromPage(page, config);

    console.log(`Scraped ${vehicles.length} vehicles from ${config.name}`);
    return vehicles;
  } catch (error) {
    console.error(`Error in scrapeUrl for ${config.name}:`, error);
    return [];
  } finally {
    // Clean up
    try {
      if (browser) {
        await browser.close();
      }
    } catch { /* ignore cleanup errors */ }

    try {
      if (kernelBrowser) {
        await getKernel().browsers.deleteByID(kernelBrowser.session_id);
      }
    } catch { /* ignore cleanup errors */ }
  }
}

export async function scrapeAllUrls(configs: WatchConfig[]): Promise<Vehicle[]> {
  const allVehicles: Vehicle[] = [];

  // Scrape sequentially to avoid overwhelming the service
  for (const config of configs) {
    try {
      const vehicles = await scrapeUrl(config);
      allVehicles.push(...vehicles);
    } catch (error) {
      console.error(`Error scraping ${config.name}:`, error);
      // Continue with other URLs even if one fails
    }
  }

  // Deduplicate by VIN (same vehicle might appear in multiple searches)
  const uniqueVehicles = Array.from(
    new Map(allVehicles.map((v) => [v.vin, v])).values()
  );

  return uniqueVehicles;
}
