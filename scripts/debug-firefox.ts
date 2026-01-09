import { firefox } from "playwright";
import {
  extractVehiclesFromDOM,
  dismissOverlays,
  applyYearFilter,
} from "../src/lib/scraper";

const TEST_URL =
  "https://www.tesla.com/nl_NL/inventory/used/m3?INTERIOR=PREMIUM_BLACK&arrangeby=plh&zip=5708&range=0";
const MIN_YEAR = 2024;

async function debug() {
  console.log("Launching Firefox...");
  const browser = await firefox.launch({
    headless: false,
    slowMo: 300,
  });

  const page = await browser.newPage();

  try {
    console.log(`Navigating to ${TEST_URL}`);
    await page.goto(TEST_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    console.log("Waiting for page to load...");
    await page.waitForTimeout(3000);

    console.log("Page title:", await page.title());
    console.log("Page URL:", page.url());

    // Dismiss cookie banner and locale modal
    await dismissOverlays(page);

    // Apply year filter
    await applyYearFilter(page, MIN_YEAR);

    // Scrape using shared extraction logic
    console.log("\n--- Scraping vehicles ---");
    const vehicles = await page.evaluate(extractVehiclesFromDOM);

    // Print structured output
    console.log(`\n--- Structured Output (${vehicles.length} vehicles) ---\n`);
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      console.log(`${i + 1}. VIN: ${v.vin}`);
      console.log(`   Trim:     ${v.trim}`);
      console.log(`   Year:     ${v.year || "N/A"}`);
      console.log(`   Location: ${v.location}`);
      console.log(`   Price:    €${v.price.toLocaleString("nl-NL")}`);
      console.log(`   Mileage:  ${v.mileage.toLocaleString("nl-NL")} km`);
      console.log(`   URL:      ${v.url}`);
      console.log("");
    }

    // Also output as JSON for easy verification
    console.log("--- JSON Output ---");
    console.log(JSON.stringify(vehicles, null, 2));

    console.log("\n--- Browser stays open for 30s (Ctrl+C to close) ---");
    await page.waitForTimeout(30000);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser.close();
  }
}

debug().catch(console.error);
