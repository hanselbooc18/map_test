import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SQLite from 'expo-sqlite';

import { summarizeLocations } from './usage';
import type { LocationUpdate, TrackingSettings, UsageTotals } from './types';

const databasePromise = SQLite.openDatabaseAsync('device-tracking.db');
let initialized: Promise<void> | undefined;

export async function getDatabase() {
  const database = await databasePromise;
  if (!initialized) {
    initialized = (async () => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS location_updates (
          id TEXT PRIMARY KEY NOT NULL,
          device_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          accuracy REAL,
          altitude REAL,
          speed REAL,
          heading REAL,
          coordinate_bytes INTEGER NOT NULL,
          request_body_bytes INTEGER NOT NULL DEFAULT 0,
          response_body_bytes INTEGER NOT NULL DEFAULT 0,
          upload_bytes INTEGER NOT NULL DEFAULT 0,
          download_bytes INTEGER NOT NULL DEFAULT 0,
          total_bytes INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL,
          error TEXT
        );
        CREATE INDEX IF NOT EXISTS location_updates_created_at
          ON location_updates(created_at DESC);
        CREATE INDEX IF NOT EXISTS location_updates_status
          ON location_updates(status);
      `);
      const locationColumns = await database.getAllAsync<{ name: string }>(
        'PRAGMA table_info(location_updates)'
      );
      const existingColumns = new Set(locationColumns.map(({ name }) => name));
      for (const column of ['accuracy', 'altitude', 'speed', 'heading'] as const) {
        if (!existingColumns.has(column)) {
          await database.execAsync(`ALTER TABLE location_updates ADD COLUMN ${column} REAL`);
        }
      }
      const id = await database.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'deviceId'"
      );
      if (!id) {
        await setSetting('deviceId', Crypto.randomUUID());
      }
      const name = await database.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'deviceName'"
      );
      if (!name) {
        await setSetting('deviceName', Device.deviceName || Device.modelName || 'This device');
      }
      const interval = await database.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'intervalSeconds'"
      );
      if (interval?.value !== '10') await setSetting('intervalSeconds', '10');
      const enabled = await database.getFirstAsync<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'enabled'"
      );
      if (!enabled) await setSetting('enabled', 'false');
    })();
  }
  await initialized;
  return database;
}

export async function getSettings(): Promise<TrackingSettings> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE key IN ('deviceId', 'deviceName', 'enabled', 'intervalSeconds')"
  );
  const values = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
  return {
    deviceId: values.deviceId,
    deviceName: values.deviceName,
    enabled: values.enabled === 'true',
    intervalSeconds: 10,
  };
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await databasePromise;
  await database.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    key,
    value
  );
}

export async function saveLocation(
  update: Omit<LocationUpdate, 'request_body_bytes' | 'response_body_bytes' | 'upload_bytes' | 'download_bytes' | 'total_bytes' | 'status' | 'error'>,
  status: LocationUpdate['status'] = 'pending'
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR IGNORE INTO location_updates
      (id, device_id, created_at, latitude, longitude, accuracy, altitude, speed, heading, coordinate_bytes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    update.id,
    update.device_id,
    update.created_at,
    update.latitude,
    update.longitude,
    update.accuracy,
    update.altitude,
    update.speed,
    update.heading,
    update.coordinate_bytes,
    status
  );
}

export async function updateUsage(
  id: string,
  values: Pick<LocationUpdate, 'request_body_bytes' | 'response_body_bytes' | 'upload_bytes' | 'download_bytes' | 'total_bytes'>,
  status: LocationUpdate['status'],
  error: string | null = null
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE location_updates
     SET request_body_bytes = ?, response_body_bytes = ?, upload_bytes = ?,
         download_bytes = ?, total_bytes = ?, status = ?, error = ?
     WHERE id = ?`,
    values.request_body_bytes,
    values.response_body_bytes,
    values.upload_bytes,
    values.download_bytes,
    values.total_bytes,
    status,
    error,
    id
  );
}

export async function getLocations(): Promise<LocationUpdate[]> {
  const database = await getDatabase();
  return database.getAllAsync<LocationUpdate>(
    'SELECT * FROM location_updates ORDER BY created_at DESC'
  );
}

export async function getPendingLocations(): Promise<LocationUpdate[]> {
  const database = await getDatabase();
  return database.getAllAsync<LocationUpdate>(
    "SELECT * FROM location_updates WHERE status IN ('pending', 'failed') ORDER BY created_at ASC"
  );
}

export async function getLatestLocation(): Promise<LocationUpdate | null> {
  const database = await getDatabase();
  return database.getFirstAsync<LocationUpdate>(
    'SELECT * FROM location_updates ORDER BY created_at DESC LIMIT 1'
  );
}

export async function hasLocationTimestamp(timestamp: string): Promise<boolean> {
  const database = await getDatabase();
  const existing = await database.getFirstAsync<{ found: number }>(
    'SELECT 1 AS found FROM location_updates WHERE created_at = ? LIMIT 1',
    timestamp
  );
  return existing !== null;
}

export async function getUsageTotals(): Promise<UsageTotals> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<LocationUpdate>(
    'SELECT * FROM location_updates ORDER BY created_at DESC'
  );
  return summarizeLocations(rows);
}
