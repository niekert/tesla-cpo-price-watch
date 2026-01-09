import { Redis } from '@upstash/redis';
import {
  Vehicle,
  StoredVehicle,
  VehicleChange,
  PriceChange,
  NewArrival,
  VehicleRemoved,
} from './types';

// Lazy initialize Redis client to avoid build-time errors
let _redis: Redis | null = null;
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return _redis;
}

const VEHICLES_KEY = 'vehicles';
const VEHICLE_PREFIX = 'vehicle:';

export async function getStoredVehicle(vin: string): Promise<StoredVehicle | null> {
  return getRedis().get<StoredVehicle>(`${VEHICLE_PREFIX}${vin}`);
}

export async function getAllStoredVehicles(): Promise<StoredVehicle[]> {
  const vins = await getRedis().smembers(VEHICLES_KEY);
  if (vins.length === 0) return [];

  const redis = getRedis();
  const vehicles = await Promise.all(
    vins.map((vin) => redis.get<StoredVehicle>(`${VEHICLE_PREFIX}${vin}`))
  );

  return vehicles.filter((v): v is StoredVehicle => v !== null);
}

export async function storeVehicle(vehicle: Vehicle): Promise<void> {
  const existing = await getStoredVehicle(vehicle.vin);
  const now = Date.now();

  const stored: StoredVehicle = {
    ...vehicle,
    firstSeen: existing?.firstSeen ?? now,
    lastSeen: now,
    priceHistory: existing?.priceHistory ?? [],
  };

  // Add to price history if price changed
  if (!existing || existing.price !== vehicle.price) {
    stored.priceHistory.push({
      price: vehicle.price,
      timestamp: now,
    });
  }

  const redis = getRedis();
  await redis.set(`${VEHICLE_PREFIX}${vehicle.vin}`, stored);
  await redis.sadd(VEHICLES_KEY, vehicle.vin);
}

export async function removeVehicle(vin: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${VEHICLE_PREFIX}${vin}`);
  await redis.srem(VEHICLES_KEY, vin);
}

export async function detectChanges(currentVehicles: Vehicle[]): Promise<VehicleChange[]> {
  const changes: VehicleChange[] = [];
  const storedVehicles = await getAllStoredVehicles();
  const currentVins = new Set(currentVehicles.map((v) => v.vin));
  const storedVinsMap = new Map(storedVehicles.map((v) => [v.vin, v]));

  // Check for new arrivals and price changes
  for (const vehicle of currentVehicles) {
    const stored = storedVinsMap.get(vehicle.vin);

    if (!stored) {
      // New arrival
      const newArrival: NewArrival = {
        vehicle,
        type: 'new_arrival',
      };
      changes.push(newArrival);
    } else if (stored.price !== vehicle.price) {
      // Price changed
      const changeAmount = vehicle.price - stored.price;
      const priceChange: PriceChange = {
        vehicle,
        previousPrice: stored.price,
        currentPrice: vehicle.price,
        changeAmount,
        changePercent: (changeAmount / stored.price) * 100,
        type: changeAmount < 0 ? 'price_drop' : 'price_increase',
      };
      changes.push(priceChange);
    }
  }

  // Check for removed vehicles
  for (const stored of storedVehicles) {
    if (!currentVins.has(stored.vin)) {
      const removed: VehicleRemoved = {
        vehicle: stored,
        type: 'removed',
      };
      changes.push(removed);
    }
  }

  return changes;
}

export async function updateStorage(currentVehicles: Vehicle[]): Promise<void> {
  const storedVehicles = await getAllStoredVehicles();
  const currentVins = new Set(currentVehicles.map((v) => v.vin));

  // Store/update current vehicles
  await Promise.all(currentVehicles.map((v) => storeVehicle(v)));

  // Remove vehicles no longer in inventory
  for (const stored of storedVehicles) {
    if (!currentVins.has(stored.vin)) {
      await removeVehicle(stored.vin);
    }
  }
}
