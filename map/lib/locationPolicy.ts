import type { LocationUpdate } from './types';

export const LOCATION_UPDATE_INTERVAL_MS = 5_000;
export const LOCATION_DISTANCE_INTERVAL_METERS = 0;
export const UNCERTAIN_ACCURACY_METERS = 50;

export function isValidGpsFix(
  timestamp: string,
  latitude: number,
  longitude: number
): boolean {
  const fixTime = Date.parse(timestamp);
  return Number.isFinite(fixTime)
    && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function gpsFixKey(timestamp: string, latitude: number, longitude: number): string {
  return JSON.stringify([timestamp, latitude, longitude]);
}

export function newestLocation(
  current: LocationUpdate | null,
  candidate: LocationUpdate | null
): LocationUpdate | null {
  if (!candidate) return current;
  if (!current || candidate.id === current.id || Date.parse(candidate.created_at) >= Date.parse(current.created_at)) return candidate;
  return current;
}

export async function persistWithoutWaitingForUpload(
  persist: () => Promise<boolean>,
  upload: () => Promise<unknown>
): Promise<boolean> {
  const persisted = await persist();
  if (!persisted) return false;
  void Promise.resolve().then(upload).catch(() => undefined);
  return true;
}

export async function uploadInOrder<T, R extends { stopSync: boolean }>(
  records: T[],
  upload: (record: T) => Promise<R>
): Promise<{ records: T[]; results: R[]; stopped: boolean }> {
  const results: R[] = [];
  const attempted: T[] = [];
  for (const record of records) {
    attempted.push(record);
    const result = await upload(record);
    results.push(result);
    if (result.stopSync) return { records: attempted, results, stopped: true };
  }
  return { records: attempted, results, stopped: false };
}
