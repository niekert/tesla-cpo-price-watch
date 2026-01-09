import Kernel from "@onkernel/sdk";
import { chromium, Page } from "playwright";
import {
  extractVehiclesFromDOM,
  ScrapedVehicle,
  dismissOverlays,
  applyYearFilter,
} from "./scraper";
import { Vehicle, WatchConfig } from "./types";

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

async function waitForPageStable(page: Page, timeout = 10000): Promise<void> {
  const startTime = Date.now();
  let lastContent = 0;

  while (Date.now() - startTime < timeout) {
    await page.waitForTimeout(500);
    try {
      const currentContent = await page.evaluate(
        () => document.body?.innerHTML?.length || 0
      );
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

async function extractVehiclesFromPage(
  page: Page,
  config: WatchConfig
): Promise<Vehicle[]> {
  // Wait for page to stabilize after any redirects/navigation
  await waitForPageStable(page);

  // Try DOM scraping with retries
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const scraped = await page.evaluate(extractVehiclesFromDOM);

      if (scraped.length > 0) {
        // Convert ScrapedVehicle to Vehicle
        return scraped.map(
          (v: ScrapedVehicle): Vehicle => ({
            vin: v.vin,
            model: config.name,
            trim: v.trim,
            year: v.year,
            price: v.price,
            currency: v.currency,
            mileage: v.mileage,
            location: v.location,
            url: v.url,
          })
        );
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
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // Wait for initial load
    await page.waitForTimeout(3000);

    // Dismiss cookie banner and locale modal
    await dismissOverlays(page);

    // Apply year filter if configured (required - fail if can't apply)
    if (config.minYear) {
      await applyYearFilter(page, config.minYear);
      await waitForPageStable(page);
    }

    // Extract vehicles
    const vehicles = await extractVehiclesFromPage(page, config);

    // Log structured output for cron logs
    console.log(
      `\n--- Scraped ${vehicles.length} vehicles from ${config.name} ---`
    );
    for (const v of vehicles) {
      const yearStr = v.year ? ` (${v.year})` : "";
      console.log(
        `  ${v.trim}${yearStr} | €${v.price.toLocaleString("nl-NL")} | ${v.mileage.toLocaleString("nl-NL")} km | ${v.location} | ${v.vin}`
      );
    }

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
    } catch {
      /* ignore cleanup errors */
    }

    try {
      if (kernelBrowser) {
        await getKernel().browsers.deleteByID(kernelBrowser.session_id);
      }
    } catch {
      /* ignore cleanup errors */
    }
  }
}

export async function scrapeAllUrls(
  configs: WatchConfig[]
): Promise<Vehicle[]> {
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
