import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import * as Network from 'expo-network';

import { estimateTransfer, isApiConfigured, submitLocation, ApiError } from './api';
import {
  getLatestLocation,
  hasLocationTimestamp,
  getPendingLocations,
  getSettings,
  saveLocation,
  updateUsage,
} from './database';
import { utf8ByteLength } from './bytes';
import type { LocationUpdate } from './types';

export const LOCATION_TASK_NAME = 'device-background-location';
let locationWriteQueue: Promise<void> = Promise.resolve();
const activeTransmissions = new Map<string, Promise<void>>();

function estimatedRequestBodyBytes(update: LocationUpdate): number {
  const locationBody = {
    updateId: update.id,
    deviceId: update.device_id,
    timestamp: update.created_at,
    latitude: update.latitude,
    longitude: update.longitude,
    coordinatePayloadBytes: update.coordinate_bytes,
  };
  const usageBody = {
    updateId: update.id,
    deviceId: update.device_id,
    timestamp: update.created_at,
    coordinatePayloadBytes: update.coordinate_bytes,
    measurementMode: 'estimated',
  };
  return utf8ByteLength(JSON.stringify(locationBody)) + utf8ByteLength(JSON.stringify(usageBody));
}

async function transmitOnce(update: LocationUpdate): Promise<void> {
  const settings = await getSettings();
  if (!isApiConfigured()) {
    await updateUsage(update.id, {
      request_body_bytes: 0,
      response_body_bytes: 0,
      upload_bytes: 0,
      download_bytes: 0,
      total_bytes: 0,
    }, 'failed', 'Backend URL is not configured.');
    return;
  }

  const connectivity = await Network.getNetworkStateAsync();
  if (!connectivity.isConnected || connectivity.isInternetReachable === false) return;

  const requestBodyBytes = estimatedRequestBodyBytes(update);
  try {
    const result = await submitLocation(settings, update);
    const transfer = estimateTransfer(result.requestBodyBytes, result.responseBodyBytes);
    await updateUsage(
      update.id,
      {
        request_body_bytes: result.requestBodyBytes,
        response_body_bytes: result.responseBodyBytes,
        upload_bytes: transfer.uploadBytes,
        download_bytes: transfer.downloadBytes,
        total_bytes: transfer.totalBytes,
      },
      result.locationSucceeded ? 'success' : 'failed',
      result.locationError
    );
  } catch (error) {
    const responseBodyBytes = error instanceof ApiError ? error.responseBodyBytes : 0;
    const transfer = estimateTransfer(requestBodyBytes, responseBodyBytes);
    await updateUsage(
      update.id,
      {
        request_body_bytes: requestBodyBytes,
        response_body_bytes: responseBodyBytes,
        upload_bytes: transfer.uploadBytes,
        download_bytes: transfer.downloadBytes,
        total_bytes: transfer.totalBytes,
      },
      error instanceof ApiError && error.networkFailure ? 'pending' : 'failed',
      error instanceof Error ? error.message : 'Location upload failed.'
    );
  }
}

function transmit(update: LocationUpdate): Promise<void> {
  const inFlight = activeTransmissions.get(update.id);
  if (inFlight) return inFlight;
  const request = transmitOnce(update).finally(() => activeTransmissions.delete(update.id));
  activeTransmissions.set(update.id, request);
  return request;
}

export async function recordLocation(
  coords: Pick<Location.LocationObjectCoords, 'latitude' | 'longitude' | 'accuracy' | 'altitude' | 'speed' | 'heading'>,
  timestamp = new Date()
): Promise<void> {
  const settings = await getSettings();
  const createdAt = timestamp.toISOString();
  const write = locationWriteQueue.then(async (): Promise<LocationUpdate | null> => {
    if (await hasLocationTimestamp(createdAt)) return null;
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
    return {
      ...update,
      request_body_bytes: 0,
      response_body_bytes: 0,
      upload_bytes: 0,
      download_bytes: 0,
      total_bytes: 0,
      status: 'pending',
      error: null,
    };
  });
  locationWriteQueue = write.then(() => undefined, () => undefined);
  const locationToTransmit = await write;
  if (!locationToTransmit) return;

  await transmit(locationToTransmit);
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

export async function syncPendingLocations(): Promise<void> {
  const connectivity = await Network.getNetworkStateAsync();
  if (!connectivity.isConnected || connectivity.isInternetReachable === false) return;
  const pending = await getPendingLocations();
  for (const update of pending) {
    await transmit(update);
  }
}

export async function getLastLocation(): Promise<LocationUpdate | null> {
  return getLatestLocation();
}
