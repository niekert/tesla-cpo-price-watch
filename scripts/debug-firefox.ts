import { firefox } from "playwright";
import { extractVehiclesFromDOM } from "../src/lib/scraper";

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

    // Dismiss cookie banner
    console.log("Looking for cookie banner...");
    const acceptButton = page.locator('button:has-text("Accepteren")');
    if ((await acceptButton.count()) > 0) {
      console.log("Clicking cookie accept button...");
      await acceptButton.click();
      await page.waitForTimeout(1000);
    }

    // Dismiss locale modal by pressing Escape
    console.log("Looking for locale modal...");
    const dialog = page.locator("dialog");
    if ((await dialog.count()) > 0 && (await dialog.isVisible())) {
      console.log("Pressing Escape to close modal...");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1000);
    }

    await page.waitForTimeout(2000);
    console.log("Page title:", await page.title());
    console.log("Page URL:", page.url());

    // Check if blocked
    const bodyText = await page.locator("body").textContent();
    if (bodyText?.includes("permission") || bodyText?.includes("blocked")) {
      console.log("\n⚠️  Might be blocked. Page content preview:");
      console.log(bodyText?.slice(0, 500));
      return;
    }

    // Try to find year input
    console.log("\nLooking for year input...");
    const yearInputExists = await page
      .locator('input[name="inputMin-Year"]')
      .count();
    console.log(`Year input "inputMin-Year" found: ${yearInputExists > 0}`);

    if (yearInputExists > 0) {
      const yearInput = page.locator('input[name="inputMin-Year"]');
      console.log("Clicking and filling year input...");

      await yearInput.scrollIntoViewIfNeeded();
      await yearInput.click();
      await yearInput.fill(String(MIN_YEAR));
      await yearInput.press("Enter");

      console.log("Waiting for results to update...");
      await page.waitForTimeout(5000);
    }

    // Scrape using shared extraction logic
    console.log("\n--- Scraping vehicles ---");
    const vehicles = await page.evaluate(extractVehiclesFromDOM);

    // Print structured output
    console.log(`\n--- Structured Output (${vehicles.length} vehicles) ---\n`);
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      console.log(`${i + 1}. VIN: ${v.vin}`);
      console.log(`   Model:    ${v.model}`);
      console.log(`   Location: ${v.location}`);
      console.log(`   Price:    €${v.price.toLocaleString("nl-NL")}`);
      console.log(`   Mileage:  ${v.mileage.toLocaleString("nl-NL")} km`);
      console.log(`   Year:     ${v.year || "N/A"}`);
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
