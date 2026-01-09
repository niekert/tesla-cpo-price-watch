export interface Vehicle {
  vin: string;
  model: string;
  variant: string;
  price: number;
  currency: string;
  mileage: number;
  location: string;
  url: string;
  imageUrl?: string;
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
}
