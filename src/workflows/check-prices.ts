import { FatalError } from 'workflow';
import { watchConfigs } from '@/config';
import { scrapeAllUrls } from '@/lib/kernel';
import { detectChanges, updateStorage } from '@/lib/storage';
import { sendNotifications, sendErrorMessage } from '@/lib/telegram';
import { Vehicle, VehicleChange, WatchConfig } from '@/lib/types';

async function scrapeVehicles(configs: WatchConfig[]): Promise<Vehicle[]> {
  'use step';
  console.log(`Scraping ${configs.length} Tesla URLs...`);
  const vehicles = await scrapeAllUrls(configs);
  console.log(`Found ${vehicles.length} vehicles`);
  return vehicles;
}

async function compareWithStored(vehicles: Vehicle[]): Promise<VehicleChange[]> {
  'use step';
  console.log('Comparing with stored prices...');
  const changes = await detectChanges(vehicles);
  console.log(`Detected ${changes.length} changes`);
  return changes;
}

async function notifyChanges(changes: VehicleChange[]): Promise<void> {
  'use step';
  if (changes.length === 0) {
    console.log('No changes to notify');
    return;
  }
  console.log(`Sending ${changes.length} notifications...`);
  await sendNotifications(changes);
  console.log('Notifications sent');
}

async function persistPrices(vehicles: Vehicle[]): Promise<void> {
  'use step';
  console.log('Updating stored prices...');
  await updateStorage(vehicles);
  console.log('Storage updated');
}

async function handleError(error: unknown): Promise<void> {
  'use step';
  const message = error instanceof Error ? error.message : String(error);
  console.error('Workflow error:', message);
  try {
    await sendErrorMessage(`Workflow failed: ${message}`);
  } catch {
    // Ignore notification errors
  }
  throw new FatalError(message);
}

export async function checkPricesWorkflow(): Promise<{ vehicleCount: number; changeCount: number }> {
  'use workflow';

  try {
    // Step 1: Scrape Tesla inventory pages
    const vehicles = await scrapeVehicles(watchConfigs);

    if (vehicles.length === 0) {
      console.log('No vehicles found - skipping further steps');
      return { vehicleCount: 0, changeCount: 0 };
    }

    // Step 2: Compare with stored prices to detect changes
    const changes = await compareWithStored(vehicles);

    // Step 3: Send notifications for any changes
    await notifyChanges(changes);

    // Step 4: Update stored prices
    await persistPrices(vehicles);

    return { vehicleCount: vehicles.length, changeCount: changes.length };
  } catch (error) {
    await handleError(error);
    throw error; // Re-throw to mark workflow as failed
  }
}
