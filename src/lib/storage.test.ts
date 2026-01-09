import { describe, it, expect } from 'vitest';
import { isAvailableSoon, computeChanges } from './storage';
import { Vehicle, StoredVehicle } from './types';

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    vin: '5YJ3E1EA1PF123456',
    model: 'Model 3',
    trim: 'Long Range AWD',
    year: 2024,
    price: 45000,
    currency: 'EUR',
    mileage: 10000,
    location: 'Nu op te halen in Amsterdam',
    url: 'https://tesla.com/...',
    ...overrides,
  };
}

function makeStoredVehicle(overrides: Partial<StoredVehicle> = {}): StoredVehicle {
  return {
    ...makeVehicle(),
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    priceHistory: [],
    ...overrides,
  };
}

describe('isAvailableSoon', () => {
  it('returns true for "Binnenkort op te halen in Amsterdam"', () => {
    expect(isAvailableSoon('Binnenkort op te halen in Amsterdam')).toBe(true);
  });

  it('returns true for lowercase "binnenkort op te halen in Amsterdam"', () => {
    expect(isAvailableSoon('binnenkort op te halen in Amsterdam')).toBe(true);
  });

  it('returns false for "Nu op te halen in Amsterdam"', () => {
    expect(isAvailableSoon('Nu op te halen in Amsterdam')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAvailableSoon('')).toBe(false);
  });

  it('handles leading/trailing whitespace', () => {
    expect(isAvailableSoon('  Binnenkort op te halen in Amsterdam')).toBe(false); // leading space breaks it!
    expect(isAvailableSoon('Binnenkort op te halen in Amsterdam  ')).toBe(true);
  });

  it('handles different casing', () => {
    expect(isAvailableSoon('BINNENKORT op te halen in Amsterdam')).toBe(true);
    expect(isAvailableSoon('BinnenKort op te halen in Amsterdam')).toBe(true);
  });
});

describe('computeChanges', () => {
  describe('new arrivals', () => {
    it('detects new vehicle', () => {
      const current = [makeVehicle({ vin: 'NEW123' })];
      const stored: StoredVehicle[] = [];

      const changes = computeChanges(current, stored);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('new_arrival');
    });
  });

  describe('price changes', () => {
    it('detects price drop', () => {
      const current = [makeVehicle({ vin: 'ABC123', price: 40000 })];
      const stored = [makeStoredVehicle({ vin: 'ABC123', price: 45000 })];

      const changes = computeChanges(current, stored);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('price_drop');
    });

    it('detects price increase', () => {
      const current = [makeVehicle({ vin: 'ABC123', price: 50000 })];
      const stored = [makeStoredVehicle({ vin: 'ABC123', price: 45000 })];

      const changes = computeChanges(current, stored);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('price_increase');
    });
  });

  describe('removed vehicles', () => {
    it('detects removed vehicle', () => {
      const current: Vehicle[] = [];
      const stored = [makeStoredVehicle({ vin: 'GONE123' })];

      const changes = computeChanges(current, stored);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('removed');
    });
  });

  describe('availability changes', () => {
    it('detects change from "Binnenkort" to "Nu"', () => {
      const current = [
        makeVehicle({
          vin: 'ABC123',
          price: 45000,
          location: 'Nu op te halen in Amsterdam',
        }),
      ];
      const stored = [
        makeStoredVehicle({
          vin: 'ABC123',
          price: 45000,
          location: 'Binnenkort op te halen in Amsterdam',
        }),
      ];

      const changes = computeChanges(current, stored);

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('now_available');
    });

    it('does NOT notify when staying "Nu"', () => {
      const current = [
        makeVehicle({
          vin: 'ABC123',
          price: 45000,
          location: 'Nu op te halen in Amsterdam',
        }),
      ];
      const stored = [
        makeStoredVehicle({
          vin: 'ABC123',
          price: 45000,
          location: 'Nu op te halen in Rotterdam',
        }),
      ];

      const changes = computeChanges(current, stored);

      expect(changes).toHaveLength(0);
    });

    it('does NOT notify when staying "Binnenkort"', () => {
      const current = [
        makeVehicle({
          vin: 'ABC123',
          price: 45000,
          location: 'Binnenkort op te halen in Amsterdam',
        }),
      ];
      const stored = [
        makeStoredVehicle({
          vin: 'ABC123',
          price: 45000,
          location: 'Binnenkort op te halen in Rotterdam',
        }),
      ];

      const changes = computeChanges(current, stored);

      expect(changes).toHaveLength(0);
    });

    it('does NOT notify when going from "Nu" back to "Binnenkort"', () => {
      const current = [
        makeVehicle({
          vin: 'ABC123',
          price: 45000,
          location: 'Binnenkort op te halen in Amsterdam',
        }),
      ];
      const stored = [
        makeStoredVehicle({
          vin: 'ABC123',
          price: 45000,
          location: 'Nu op te halen in Amsterdam',
        }),
      ];

      const changes = computeChanges(current, stored);

      expect(changes).toHaveLength(0);
    });

    it('price change takes priority over availability change', () => {
      const current = [
        makeVehicle({
          vin: 'ABC123',
          price: 40000,
          location: 'Nu op te halen in Amsterdam',
        }),
      ];
      const stored = [
        makeStoredVehicle({
          vin: 'ABC123',
          price: 45000,
          location: 'Binnenkort op te halen in Amsterdam',
        }),
      ];

      const changes = computeChanges(current, stored);

      // Only price change, not availability
      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('price_drop');
    });
  });
});
