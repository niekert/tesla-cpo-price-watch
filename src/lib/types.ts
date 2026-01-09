export interface Vehicle {
  vin: string;
  model: string; // "Model 3" or "Model Y" from watchConfig.name
  trim: string; // Trim name from page, e.g., "Long Range AWD"
  year: number | null;
  price: number;
  currency: string;
  mileage: number;
  location: string;
  url: string;
}

export interface StoredVehicle extends Vehicle {
  firstSeen: number;
  lastSeen: number;
  priceHistory: Array<{
    price: number;
    timestamp: number;
  }>;
}

export interface PriceChange {
  vehicle: Vehicle;
  previousPrice: number;
  currentPrice: number;
  changeAmount: number;
  changePercent: number;
  type: 'price_drop' | 'price_increase';
}

export interface NewArrival {
  vehicle: Vehicle;
  type: 'new_arrival';
}

export interface VehicleRemoved {
  vehicle: StoredVehicle;
  type: 'removed';
}

export type VehicleChange = PriceChange | NewArrival | VehicleRemoved;

export interface WatchConfig {
  name: string;
  url: string;
  minYear?: number; // Minimum year filter (e.g., 2024 for Highland, 2023 for Model Y)
}
