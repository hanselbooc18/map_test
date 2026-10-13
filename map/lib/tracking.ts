import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';

import {
  getLatestLocation,
  getLocations,
  getPendingLocations,
  getSettings,
  saveLocation,
  updateUsage,
  markLocationsServerSaved,
  markLocationsMissingFromServer,
} from './database';
import { estimateTransfer, getRemoteLocationIds, isApiConfigured, submitLocation } from './api';
import { utf8ByteLength } from './bytes';
import type { LocationUpdate } from './types';
import { gpsFixKey, isValidGpsFix, persistWithoutWaitingForUpload, uploadInOrder } from './locationPolicy';

export const LOCATION_TASK_NAME = 'device-background-location';
let locationWriteQueue: Promise<void> = Promise.resolve();
type SyncResult = {
  succeeded: boolean;
  error: string | null;
  stopSync: boolean;
  retryable: boolean;
  retryAfterMs: number | null;
};
const locationSyncs = new Map<string, Promise<SyncResult>>();
let pendingDrain: Promise<{ attempted: number; succeeded: number; failed: number; errors: string[] }> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelayMs = 5_000;
let retryNotBefore = 0;
let drainRequested = false;
const locationChangeListeners = new Set<(update: LocationUpdate) => void>();

export function subscribeLocationChanges(listener: (update: LocationUpdate) => void): () => void {
  locationChangeListeners.add(listener);
  return () => {
    locationChangeListeners.delete(listener);
  };
}

function notifyLocationChanged(update: LocationUpdate): void {
  for (const listener of locationChangeListeners) listener(update);
}

async function syncLocationUpdate(
  update: LocationUpdate
): Promise<SyncResult> {
  const currentSync = locationSyncs.get(update.id);
  if (currentSync) return currentSync;

  const sync = (async () => {
    let requestBodyBytes = 0;
    let responseBodyBytes = 0;
    let locationSucceeded = false;
    let stopSync = false;
    let resultRetryable = false;
    let resultRetryAfterMs: number | null = null;
    let uploadedAt: string | null = update.uploaded_at;
    let serverReceivedAt: string | null = update.server_received_at;
    const errors: string[] = [];

    try {
      const result = await submitLocation(await getSettings(), update, async (timestamp) => {
        update.uploaded_at = timestamp;
        await updateUsage(update.id, {
          request_body_bytes: 0,
          response_body_bytes: 0,
          upload_bytes: 0,
          download_bytes: 0,
          total_bytes: 0,
        }, 'pending', null, { uploaded_at: timestamp, server_received_at: update.server_received_at });
      });
      requestBodyBytes = result.requestBodyBytes;
      responseBodyBytes = result.responseBodyBytes;
      locationSucceeded = result.locationSucceeded;
      stopSync = result.stopSync;
      resultRetryable = result.retryable;
      resultRetryAfterMs = result.retryAfterMs;
      uploadedAt = result.uploadedAt;
      serverReceivedAt = result.serverReceivedAt;
      if (locationSucceeded) await markLocationsServerSaved([update.id]);
      if (result.locationError) errors.push(result.locationError);
      if (result.usageError) errors.push(result.usageError);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Location upload failed.');
      resultRetryable = true;
      stopSync = true;
    }

    const transfer = estimateTransfer(requestBodyBytes, responseBodyBytes);
    const succeeded = locationSucceeded;
    const errorMessage = errors.length ? errors.join(' · ') : null;
    const status: LocationUpdate['status'] = succeeded ? 'success' : 'failed';
    await updateUsage(update.id, {
      request_body_bytes: requestBodyBytes,
      response_body_bytes: responseBodyBytes,
      upload_bytes: transfer.uploadBytes,
      download_bytes: transfer.downloadBytes,
      total_bytes: transfer.totalBytes,
    }, status, errorMessage, { uploaded_at: uploadedAt, server_received_at: serverReceivedAt }, locationSucceeded);
    notifyLocationChanged({
      ...update,
      request_body_bytes: requestBodyBytes,
      response_body_bytes: responseBodyBytes,
      upload_bytes: transfer.uploadBytes,
      download_bytes: transfer.downloadBytes,
      total_bytes: transfer.totalBytes,
      uploaded_at: uploadedAt ?? update.uploaded_at,
      server_received_at: serverReceivedAt ?? update.server_received_at,
      server_saved: locationSucceeded ? 1 : update.server_saved,
      status,
      error: errorMessage,
    });
    return {
      succeeded,
      error: errorMessage,
      stopSync,
      retryable: resultRetryable,
      retryAfterMs: resultRetryAfterMs,
    };
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
  if (Date.now() < retryNotBefore) {
    return { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  }
  if (pendingDrain) {
    drainRequested = true;
    return pendingDrain;
  }
  pendingDrain = (async () => {
    const pending = await getPendingLocations();
    const errors: string[] = [];
    let succeeded = 0;
    let attempted = 0;
    let shouldRetry = false;
    let waitBeforeRetryMs = retryDelayMs;
    const processed = await uploadInOrder(pending, async (update) => {
      attempted += 1;
      const result = await syncLocationUpdate(update);
      if (result.succeeded) {
        succeeded += 1;
        retryDelayMs = 5_000;
      } else if (result.error) {
        errors.push(result.error);
      }
      if (result.stopSync) {
        shouldRetry = result.retryable;
        waitBeforeRetryMs = result.retryAfterMs ?? retryDelayMs;
      }
      return { stopSync: result.stopSync };
    });
    if (shouldRetry) {
      if (retryTimer) clearTimeout(retryTimer);
      retryNotBefore = Date.now() + waitBeforeRetryMs;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        retryNotBefore = 0;
        void syncPendingLocationUpdates().catch(() => undefined);
      }, waitBeforeRetryMs);
      retryDelayMs = Math.min(Math.max(waitBeforeRetryMs * 2, 5_000), 60_000);
    }
    return { attempted: processed.records.length, succeeded, failed: processed.records.length - succeeded, errors };
  })();
  try {
    return await pendingDrain;
  } finally {
    pendingDrain = null;
    if (drainRequested) {
      drainRequested = false;
      void Promise.resolve().then(() => syncPendingLocationUpdates()).catch(() => undefined);
    }
  }
}

export async function recordLocation(
  coords: Pick<Location.LocationObjectCoords, 'latitude' | 'longitude' | 'accuracy' | 'altitude' | 'speed' | 'heading'>,
  timestamp = new Date()
): Promise<boolean> {
  const settings = await getSettings();
  if (!Number.isFinite(timestamp.getTime())) return false;
  const createdAt = timestamp.toISOString();
  const write = locationWriteQueue.then(async () => {
    if (!isValidGpsFix(createdAt, coords.latitude, coords.longitude)) return false;
    const id = Crypto.randomUUID();
    const fixKey = gpsFixKey(createdAt, coords.latitude, coords.longitude);
    const coordinateBytes = utf8ByteLength(JSON.stringify({
      latitude: coords.latitude,
      longitude: coords.longitude,
    }));
    const update = {
      id,
      device_id: settings.deviceId,
      fix_key: fixKey,
      created_at: createdAt,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      altitude: coords.altitude,
      speed: coords.speed,
      heading: coords.heading,
      coordinate_bytes: coordinateBytes,
    };
    const queuedUpdate: LocationUpdate = {
        ...update,
        uploaded_at: null,
        server_received_at: null,
        server_saved: 0,
        request_body_bytes: 0,
        response_body_bytes: 0,
        upload_bytes: 0,
        download_bytes: 0,
        total_bytes: 0,
        status: 'pending',
        error: null,
      };
    return persistWithoutWaitingForUpload(
      async () => {
        const inserted = await saveLocation(queuedUpdate);
        if (inserted) notifyLocationChanged(queuedUpdate);
        return inserted;
      },
      () => isApiConfigured() ? syncPendingLocationUpdates() : Promise.resolve()
    );
  });
  locationWriteQueue = write.then(() => undefined, () => undefined);
  return write;
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

export async function reconcileLocationRecords(): Promise<{
  localCount: number;
  serverCount: number;
  matchedCount: number;
  missingOnServer: number;
  missingLocally: number;
}> {
  const [settings, localRecords] = await Promise.all([getSettings(), getLocations()]);
  const remoteIds = await getRemoteLocationIds(settings);
  const localIds = new Set(localRecords.map((record) => record.id));
  const remoteIdSet = new Set(remoteIds);
  const matchingIds = remoteIds.filter((id) => localIds.has(id));
  const missingIds = [...localIds].filter((id) => !remoteIdSet.has(id));
  await markLocationsServerSaved(matchingIds);
  await markLocationsMissingFromServer(missingIds);
  if (missingIds.length > 0) await syncPendingLocationUpdates();
  const finalRemoteIds = await getRemoteLocationIds(settings);
  const finalRemoteSet = new Set(finalRemoteIds);
  const finalMatches = finalRemoteIds.filter((id) => localIds.has(id));
  await markLocationsServerSaved(finalMatches);
  return {
    localCount: localRecords.length,
    serverCount: finalRemoteSet.size,
    matchedCount: finalMatches.length,
    missingOnServer: localIds.size - finalMatches.length,
    missingLocally: [...finalRemoteSet].filter((id) => !localIds.has(id)).length,
  };
}
