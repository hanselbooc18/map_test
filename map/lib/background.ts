import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { LOCATION_TASK_NAME, recordLocation } from './tracking';

let backgroundStart: Promise<void> | null = null;

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location task failed:', error.message);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  for (const location of [...(locations ?? [])].sort((a, b) => a.timestamp - b.timestamp)) {
    try {
      await recordLocation(location.coords, new Date(location.timestamp));
    } catch (taskError) {
      console.error('Could not store background location:', taskError);
    }
  }
});

export async function startBackgroundLocationUpdates(restart = false): Promise<void> {
  if (backgroundStart) return backgroundStart;
  backgroundStart = (async () => {
    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (alreadyStarted && !restart) return;
    if (alreadyStarted) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5_000,
      distanceInterval: 0,
      deferredUpdatesInterval: 0,
      deferredUpdatesDistance: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Location tracking is active',
        notificationBody: 'GPS updates are requested about every 5 seconds when available.',
        notificationColor: '#147D64',
      },
    });
  })();
  try {
    await backgroundStart;
  } finally {
    backgroundStart = null;
  }
}

export async function stopBackgroundLocationUpdates(): Promise<void> {
  if (backgroundStart) await backgroundStart;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
