import Kernel from '@onkernel/sdk';
import { chromium, Page } from 'playwright';
import { Vehicle, WatchConfig } from './types';

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

async function extractVehiclesFromPage(page: Page, config: WatchConfig): Promise<Vehicle[]> {
  const vehicles: Vehicle[] = [];

  // Wait for the page to load Tesla's inventory data
  // Tesla loads inventory data via JavaScript into window.__PRELOADED_STATE__ or as JSON in script tags
  await page.waitForLoadState('networkidle');

  // Try to extract inventory data from the page
  const inventoryData = await page.evaluate(() => {
    // Tesla stores inventory in various places depending on the page version
    // Method 1: Check for __PRELOADED_STATE__
    const preloadedState = (window as unknown as { __PRELOADED_STATE__?: unknown }).__PRELOADED_STATE__;
    if (preloadedState) {
      return preloadedState;
    }

    // Method 2: Look for JSON data in script tags
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const content = script.textContent || '';
      if (content.includes('results') && content.includes('VIN')) {
        try {
          // Try to find JSON object in script
          const match = content.match(/\{[\s\S]*"results"[\s\S]*\}/);
          if (match) {
            return JSON.parse(match[0]);
          }
        } catch {
          // Continue to next script
        }
      }
    }

    // Method 3: Extract from API response stored in window
    const dsState = (window as unknown as { __ds_state__?: unknown }).__ds_state__;
    if (dsState) {
      return dsState;
    }

    return null;
  });

  // Parse the inventory data
  if (inventoryData) {
    const results = extractResults(inventoryData);
    for (const item of results) {
      vehicles.push(parseVehicle(item, config));
    }
  }

  // Fallback: scrape visible cards if no structured data found
  if (vehicles.length === 0) {
    const scrapedVehicles = await scrapeVisibleCards(page, config);
    vehicles.push(...scrapedVehicles);
  }

  return vehicles;
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

async function scrapeVisibleCards(page: Page, config: WatchConfig): Promise<Vehicle[]> {
  // Fallback scraping method - extract from DOM if API data not available
  const vehicles = await page.evaluate((configName: string) => {
    const cards = document.querySelectorAll('[data-id], .result-card, .inventory-card');
    const results: Array<{
      vin: string;
      model: string;
      variant: string;
      price: number;
      currency: string;
      mileage: number;
      location: string;
      url: string;
    }> = [];

    for (const card of cards) {
      const vin =
        card.getAttribute('data-id') ||
        card.getAttribute('data-vin') ||
        card.querySelector('[data-vin]')?.getAttribute('data-vin');

      if (!vin) continue;

      const priceEl = card.querySelector('.result-purchase-price, .price, [data-price]');
      const priceText = priceEl?.textContent || '0';
      const price = parseInt(priceText.replace(/[^0-9]/g, ''), 10) || 0;

      const titleEl = card.querySelector('.result-basic-info h3, .title, .model-name');
      const title = titleEl?.textContent?.trim() || configName;

      const locationEl = card.querySelector('.result-basic-info .tds-text--caption, .location');
      const location = locationEl?.textContent?.trim() || '';

      const link = card.querySelector('a[href*="/inventory/"]') as HTMLAnchorElement | null;
      const url = link?.href || `https://www.tesla.com/inventory/used/${vin}`;

      results.push({
        vin,
        model: configName,
        variant: title,
        price,
        currency: 'EUR',
        mileage: 0,
        location,
        url,
      });
    }

    return results;
  }, config.name);

  return vehicles;
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

    // Navigate to Tesla inventory
    await page.goto(config.url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Wait for inventory to load
    await page.waitForTimeout(3000);

    // Extract vehicles
    const vehicles = await extractVehiclesFromPage(page, config);

    console.log(`Scraped ${vehicles.length} vehicles from ${config.name}`);
    return vehicles;
  } finally {
    // Clean up
    if (browser) {
      await browser.close();
    }
    if (kernelBrowser) {
      await getKernel().browsers.deleteByID(kernelBrowser.session_id);
    }
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
