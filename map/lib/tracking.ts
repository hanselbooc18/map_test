import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';

import {
  getLatestLocation,
  getPendingLocations,
  hasLocationTimestamp,
  getSettings,
  saveLocation,
  updateUsage,
} from './database';
import { estimateTransfer, isApiConfigured, submitLocation } from './api';
import { utf8ByteLength } from './bytes';
import type { LocationUpdate } from './types';

export const LOCATION_TASK_NAME = 'device-background-location';
let locationWriteQueue: Promise<void> = Promise.resolve();
const locationSyncs = new Map<string, Promise<{ succeeded: boolean; error: string | null }>>();

async function syncLocationUpdate(
  update: LocationUpdate
): Promise<{ succeeded: boolean; error: string | null }> {
  const currentSync = locationSyncs.get(update.id);
  if (currentSync) return currentSync;

  const sync = (async () => {
    let requestBodyBytes = 0;
    let responseBodyBytes = 0;
    let locationSucceeded = false;
    let usageSucceeded = false;
    let errors: string[] = [];

    try {
      const result = await submitLocation(await getSettings(), update);
      requestBodyBytes = result.requestBodyBytes;
      responseBodyBytes = result.responseBodyBytes;
      locationSucceeded = result.locationSucceeded;
      usageSucceeded = result.usageSucceeded;
      if (result.locationError) errors.push(result.locationError);
      if (result.usageError) errors.push(result.usageError);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Location upload failed.');
    }

    const transfer = estimateTransfer(requestBodyBytes, responseBodyBytes);
    const succeeded = locationSucceeded && usageSucceeded;
    const errorMessage = errors.length ? errors.join(' · ') : null;
    await updateUsage(update.id, {
      request_body_bytes: requestBodyBytes,
      response_body_bytes: responseBodyBytes,
      upload_bytes: transfer.uploadBytes,
      download_bytes: transfer.downloadBytes,
      total_bytes: transfer.totalBytes,
    }, succeeded ? 'success' : 'failed', errorMessage);
    return { succeeded, error: errorMessage };
  })();
  locationSyncs.set(update.id, sync);
  try {
    return await sync;
  } finally {
    if (locationSyncs.get(update.id) === sync) locationSyncs.delete(update.id);
  }
}

export async function syncPendingLocationUpdates(): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  if (!isApiConfigured()) {
    throw new Error('Set EXPO_PUBLIC_API_URL (or EXPO_PUBLIC_API_BASE_URL) to your laptop Laravel API URL before syncing.');
  }
  const pending = await getPendingLocations();
  const errors: string[] = [];
  let succeeded = 0;
  for (const update of pending) {
    const result = await syncLocationUpdate(update);
    if (result.succeeded) succeeded += 1;
    else if (result.error) errors.push(result.error);
  }
  return { attempted: pending.length, succeeded, failed: pending.length - succeeded, errors };
}

export async function recordLocation(
  coords: Pick<Location.LocationObjectCoords, 'latitude' | 'longitude' | 'accuracy' | 'altitude' | 'speed' | 'heading'>,
  timestamp = new Date()
): Promise<void> {
  const settings = await getSettings();
  const createdAt = timestamp.toISOString();
  const write = locationWriteQueue.then(async () => {
    if (await hasLocationTimestamp(createdAt)) return;
    const id = Crypto.randomUUID();
    const coordinateBytes = utf8ByteLength(JSON.stringify({
      latitude: coords.latitude,
      longitude: coords.longitude,
    }));
    const update = {
      id,
      device_id: settings.deviceId,
      created_at: createdAt,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude,
      speed: coords.speed,
      heading: coords.heading,
      coordinate_bytes: coordinateBytes,
    };
    await saveLocation(update);
    if (isApiConfigured()) {
      await syncLocationUpdate({
        ...update,
        request_body_bytes: 0,
        response_body_bytes: 0,
        upload_bytes: 0,
        download_bytes: 0,
        total_bytes: 0,
        status: 'pending',
        error: null,
      });
    }
  });
  locationWriteQueue = write.then(() => undefined, () => undefined);
  await write;
}

export async function captureCurrentLocation(): Promise<void> {
  const currentPermission = await Location.getForegroundPermissionsAsync();
  const permission = currentPermission.status === 'granted'
    ? currentPermission
    : await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error(permission.canAskAgain
      ? 'Allow DevicePulse to access your location when prompted, then try again.'
      : 'Location permission is blocked. Open Android Settings > Apps > DevicePulse > Permissions > Location and allow access.');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Turn on Location or GPS in your phone settings, then try again.');
  }
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  await recordLocation(location.coords, new Date(location.timestamp));
}

export async function getLastLocation() {
  return getLatestLocation();
}
