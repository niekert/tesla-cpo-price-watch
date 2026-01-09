// Shared DOM scraping logic - used by both kernel.ts and debug scripts

export interface ScrapedVehicle {
  vin: string;
  model: string;
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

    // Extract model from heading element
    const modelEl = card.querySelector('h3, h2, [class*="result-title"]');
    const model = modelEl?.textContent?.trim() || "Tesla";

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

    // Determine URL based on model
    const isModelY = model.toLowerCase().includes("model y");
    const modelPath = isModelY ? "my" : "m3";
    const url = `https://www.tesla.com/nl_NL/${modelPath}/order/${vin}`;

    vehicles.push({
      vin,
      model,
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

// String version of the function for use with page.evaluate()
// This is necessary because page.evaluate() serializes the function
export const extractVehiclesFromDOMString = extractVehiclesFromDOM.toString();
