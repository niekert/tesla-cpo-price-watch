import { WatchConfig } from "./lib/types";

/**
 * Configure the Tesla inventory URLs you want to monitor.
 *
 * To get your URL:
 * 1. Go to https://www.tesla.com/inventory/new/m3 (or /my for Model Y)
 * 2. Apply your filters (price range, location, features, etc.)
 * 3. Copy the URL from your browser
 *
 * Example URLs:
 * - Model 3 Highland: https://www.tesla.com/inventory/new/m3?arrangeby=plh&zip=1012&range=200
 * - Model Y 2023+: https://www.tesla.com/inventory/used/my?arrangeby=plh&zip=1012&range=200&Year=2023,2024,2025
 */
export const watchConfigs: WatchConfig[] = [
  {
    name: "Model 3 Highland",
    url: "https://www.tesla.com/nl_NL/inventory/used/m3?INTERIOR=PREMIUM_BLACK&arrangeby=plh&zip=5708&range=0", // Replace with your filtered Tesla URL
  },
  {
    name: "Model Y 2023+",
    url: "https://www.tesla.com/nl_NL/inventory/used/my?TRIM=MYRWD&INTERIOR=PREMIUM_BLACK&arrangeby=plh&zip=5708&range=0", // Replace with your filtered Tesla URL
  },
];

/**
 * How often to check for price changes (in minutes).
 * Default: 30 minutes
 * Note: This is configured in vercel.json cron schedule
 */
export const CHECK_INTERVAL_MINUTES = 10;
