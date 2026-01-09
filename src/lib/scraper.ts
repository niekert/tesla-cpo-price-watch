// Shared scraping logic - used by both kernel.ts and debug scripts

import { Page } from "playwright";

export interface ScrapedVehicle {
  vin: string;
  trim: string; // Trim name from page, e.g., "Long Range AWD"
  location: string;
  price: number;
  mileage: number;
  year: number | null;
  currency: string;
  url: string;
}

// This function runs in browser context (page.evaluate)
// Keep it self-contained with no external dependencies
export function extractVehiclesFromDOM(): ScrapedVehicle[] {
  const vehicles: ScrapedVehicle[] = [];
  const cards = document.querySelectorAll("article.result.card[data-id]");
  const seenVins = new Set<string>();

  for (const card of cards) {
    const dataId = card.getAttribute("data-id");
    if (!dataId) continue;

    // VIN is everything before the first dash
    const vin = dataId.split("-")[0];

    // Skip if not a valid VIN (17 chars) or already seen
    if (vin.length !== 17 || seenVins.has(vin)) continue;
    seenVins.add(vin);

    // Extract trim from the trim-name element
    const trimEl = card.querySelector(".trim-name, .tds-text--h4.trim-name");
    const trim = trimEl?.textContent?.trim() || "Unknown";

    // Extract location from .inventory-card-chip
    const locationEl = card.querySelector(".inventory-card-chip");
    const location = locationEl?.textContent?.trim() || "";

    // Extract details from .card-info-details (contains price, km, year)
    const detailsEl = card.querySelector(".card-info-details");
    const details = detailsEl?.textContent?.trim() || "";

    // Extract price: €41.990 or € 41.990
    let price = 0;
    const priceMatch = details.match(/€\s*([\d.,]+)/);
    if (priceMatch) {
      price = parseInt(priceMatch[1].replace(/[.,]/g, ""), 10);
    }

    // Extract mileage: 12.500 km
    let mileage = 0;
    const kmMatch = details.match(/([\d.,]+)\s*km/i);
    if (kmMatch) {
      mileage = parseInt(kmMatch[1].replace(/[.,]/g, ""), 10);
    }

    // Extract year: 2024, 2023, etc.
    const yearMatch = details.match(/\b(20[12]\d)\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

    // Determine URL based on current page URL
    const isModelY = window.location.href.includes("/my") || window.location.href.includes("/model-y");
    const modelPath = isModelY ? "my" : "m3";
    const url = `https://www.tesla.com/nl_NL/${modelPath}/order/${vin}`;

    vehicles.push({
      vin,
      trim,
      location,
      price,
      mileage,
      year,
      currency: "EUR",
      url,
    });
  }

  return vehicles;
}

// Dismiss cookie banner and locale modal
export async function dismissOverlays(page: Page): Promise<void> {
  // Dismiss cookie banner if present (wait up to 5s for it to appear)
  console.log("Waiting for cookie banner...");
  try {
    const acceptButton = page.locator('button:has-text("Accepteren")');
    await acceptButton.waitFor({ state: "visible", timeout: 5000 });
    console.log("Cookie banner found, clicking accept...");
    await acceptButton.click();
    await page.waitForTimeout(1000);
  } catch {
    console.log("No cookie banner appeared within 5s");
  }

  // Dismiss locale modal by pressing Escape (wait up to 5s for it to appear)
  console.log("Waiting for locale modal...");
  try {
    const dialog = page.locator("dialog.dx-mega-menu-panel");
    await dialog.waitFor({ state: "visible", timeout: 5000 });
    console.log("Locale modal found, pressing Escape...");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
  } catch {
    console.log("No locale modal appeared within 5s");
  }
}

// Apply year filter
export async function applyYearFilter(page: Page, minYear: number): Promise<void> {
  console.log(`Applying year filter: ${minYear}+`);

  await page.waitForSelector('input[name="inputMin-Year"]', { timeout: 10000 });

  const yearInput = page.locator('input[name="inputMin-Year"]');
  await yearInput.scrollIntoViewIfNeeded();
  await yearInput.click();
  await yearInput.clear();
  await yearInput.fill(String(minYear));
  await yearInput.press("Tab");
  await page.waitForTimeout(500);
  await yearInput.press("Enter");

  console.log(`Year filter applied: ${minYear}`);
  await page.waitForTimeout(3000);
}
