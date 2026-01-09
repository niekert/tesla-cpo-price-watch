import { watchConfigs } from "@/config";
import { scrapeAllUrls, ScrapeResult } from "@/lib/kernel";
import {
  computeChanges,
  getAllStoredVehicles,
  updateStorage,
} from "@/lib/storage";
import { sendErrorMessage, sendNotifications } from "@/lib/telegram";
import {
  StoredVehicle,
  Vehicle,
  VehicleChange,
  WatchConfig,
} from "@/lib/types";
import { FatalError } from "workflow";

async function scrapeVehicles(configs: WatchConfig[]): Promise<ScrapeResult> {
  "use step";
  console.log(`Scraping ${configs.length} Tesla URLs...`);
  const result = await scrapeAllUrls(configs);
  console.log(`Found ${result.vehicles.length} vehicles`);
  return result;
}

async function getStoredVehicles(): Promise<StoredVehicle[]> {
  "use step";
  return getAllStoredVehicles();
}

async function compareWithStored(
  vehicles: Vehicle[],
  storedVehicles: StoredVehicle[],
  skipModels: string[]
): Promise<VehicleChange[]> {
  "use step";
  console.log("Comparing with stored prices...");
  const changes = await computeChanges(vehicles, storedVehicles, skipModels);
  console.log(`Detected ${changes.length} changes`);
  return changes;
}

async function notifyChanges(
  changes: VehicleChange[],
  vehicleCount: number
): Promise<void> {
  "use step";
  if (changes.length === 0) {
    console.log(
      `✓ All ${vehicleCount} vehicles checked - no price changes detected`
    );
    return;
  }
  console.log(`Sending ${changes.length} notifications...`);
  await sendNotifications(changes);
  console.log("Notifications sent");
}

async function persistPrices(
  vehicles: Vehicle[],
  skipModels: string[]
): Promise<void> {
  "use step";
  console.log("Updating stored prices...");
  await updateStorage(vehicles, skipModels);
  console.log("Storage updated");
}

async function handleError(error: unknown): Promise<void> {
  "use step";
  const message = error instanceof Error ? error.message : String(error);
  console.error("Workflow error:", message);
  try {
    await sendErrorMessage(`Workflow failed: ${message}`);
  } catch {
    // Ignore notification errors
  }
  throw new FatalError(message);
}

export async function checkPricesWorkflow(): Promise<{
  vehicleCount: number;
  changeCount: number;
}> {
  "use workflow";

  try {
    // Step 1: Scrape Tesla inventory pages
    const { vehicles, failedModels } = await scrapeVehicles(watchConfigs);

    if (vehicles.length === 0) {
      console.log("No vehicles found - skipping further steps");
      return { vehicleCount: 0, changeCount: 0 };
    }

    // Step: Get stored vehicles
    const storedVehicles = await getStoredVehicles();

    // Step 3: Compare with stored prices to detect changes (skip failed models)
    const changes = await compareWithStored(vehicles, storedVehicles, failedModels);

    // Step 4: Send notifications for any changes
    await notifyChanges(changes, vehicles.length);

    // Step 5: Update stored prices (skip failed models)
    await persistPrices(vehicles, failedModels);

    return { vehicleCount: vehicles.length, changeCount: changes.length };
  } catch (error) {
    await handleError(error);
    throw error; // Re-throw to mark workflow as failed
  }
}
