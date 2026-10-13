import * as Location from 'expo-location';
import * as Network from 'expo-network';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { isApiConfigured } from './api';
import {
  getLatestLocation,
  getLocations,
  getSettings,
  setSetting,
} from './database';
import { startBackgroundLocationUpdates, stopBackgroundLocationUpdates } from './background';
import { captureCurrentLocation, reconcileLocationRecords, recordLocation, subscribeLocationChanges, syncPendingLocationUpdates } from './tracking';
import { newestLocation, LOCATION_UPDATE_INTERVAL_MS, LOCATION_DISTANCE_INTERVAL_METERS } from './locationPolicy';
import type { LocationUpdate, TrackingSettings, UsageTotals } from './types';
import { summarizeLocations } from './usage';

type PermissionState = {
  foreground: string;
  background: string;
};

type TrackingContextValue = {
  settings: TrackingSettings | null;
  latest: LocationUpdate | null;
  locations: LocationUpdate[];
  totals: UsageTotals | null;
  permissions: PermissionState;
  online: boolean | null;
  busy: boolean;
  error: string | null;
  backendConfigured: boolean;
  refresh: () => Promise<void>;
  syncPending: () => Promise<void>;
  reconcile: () => Promise<{ localCount: number; serverCount: number; matchedCount: number; missingOnServer: number; missingLocally: number }>;
  enableTracking: () => Promise<void>;
  disableTracking: () => Promise<void>;
  captureNow: () => Promise<void>;
  clearError: () => void;
};

const TrackingContext = createContext<TrackingContextValue | null>(null);

export function TrackingProvider({ children }: React.PropsWithChildren) {
  const [settings, setSettingsState] = useState<TrackingSettings | null>(null);
  const [latest, setLatest] = useState<LocationUpdate | null>(null);
  const [locations, setLocations] = useState<LocationUpdate[]>([]);
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [permissions, setPermissions] = useState<PermissionState>({
    foreground: 'undetermined',
    background: 'undetermined',
  });
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locationsRef = useRef<LocationUpdate[]>([]);
  const backendConfigured = isApiConfigured();

  useEffect(() => subscribeLocationChanges((update) => {
    setLatest((current) => newestLocation(current, update));
    const next = [update, ...locationsRef.current.filter((item) => item.id !== update.id)]
      .sort((first, second) => Date.parse(second.created_at) - Date.parse(first.created_at));
    locationsRef.current = next;
    setLocations(next);
    setTotals(summarizeLocations(next));
  }), []);

  const refresh = useCallback(async () => {
    const [storedSettings, storedLatest, storedLocations, network, foreground, background] =
      await Promise.all([
        getSettings(),
        getLatestLocation(),
        getLocations(),
        Network.getNetworkStateAsync(),
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
    setSettingsState(storedSettings);
    setLatest((current) => newestLocation(current, storedLatest));
    const refreshedById = new Map(storedLocations.map((location) => [location.id, location]));
    for (const current of locationsRef.current) {
      if (!refreshedById.has(current.id) || current.server_saved > 0) refreshedById.set(current.id, current);
    }
    const mergedLocations = [...refreshedById.values()]
      .sort((first, second) => Date.parse(second.created_at) - Date.parse(first.created_at));
    locationsRef.current = mergedLocations;
    setLocations(mergedLocations);
    setTotals(summarizeLocations(mergedLocations));
    setOnline(network.isConnected === true && network.isInternetReachable !== false);
    setPermissions({ foreground: foreground.status, background: background.status });
  }, []);

  const syncPending = useCallback(async () => {
    if (!backendConfigured) {
      const message = 'Configure EXPO_PUBLIC_API_URL (or EXPO_PUBLIC_API_BASE_URL) with the laptop Laravel API address before syncing.';
      setError(message);
      throw new Error(message);
    }
    setBusy(true);
    setError(null);
    try {
      const result = await syncPendingLocationUpdates();
      await refresh();
      if (result.failed > 0) {
        const message = result.errors[0] ?? `${result.failed} location update(s) could not be synced.`;
        setError(message);
        throw new Error(message);
      }
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Could not sync GPS data to the backend.';
      setError(message);
      await refresh();
      throw syncError;
    } finally {
      setBusy(false);
    }
  }, [backendConfigured, refresh]);

  const reconcile = useCallback(async () => {
    if (!backendConfigured) throw new Error('Configure the Laravel API URL before reconciling records.');
    setBusy(true);
    setError(null);
    try {
      const result = await reconcileLocationRecords();
      await refresh();
      return result;
    } catch (reconcileError) {
      const message = reconcileError instanceof Error ? reconcileError.message : 'Could not reconcile GPS records.';
      setError(message);
      throw reconcileError;
    } finally {
      setBusy(false);
    }
  }, [backendConfigured, refresh]);

  useEffect(() => {
    let active = true;
    let wasOnline = false;
    const initialize = async () => {
      await refresh();
      const network = await Network.getNetworkStateAsync();
      wasOnline = network.isConnected === true && network.isInternetReachable !== false;
      if (wasOnline && backendConfigured) {
        void syncPending().catch(() => undefined);
      }
      const storedSettings = await getSettings();
      const [foreground, background] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      if (storedSettings.enabled && AppState.currentState !== 'active' && foreground.status === 'granted' && background.status === 'granted') {
        await startBackgroundLocationUpdates(true);
      }
    };
    initialize().catch((loadError) => {
      if (active) setError(
        loadError instanceof Error ? loadError.message : 'Could not load tracking data.'
      );
    });
    const subscription = Network.addNetworkStateListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(connected);
      if (connected && !wasOnline && backendConfigured) {
        void syncPending().catch(() => undefined);
      }
      wasOnline = connected;
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [backendConfigured, refresh, settings?.enabled, syncPending]);

  useEffect(() => {
    if (!settings?.enabled) return;
    let mounted = true;
    let startingWatcher = false;
    let watcher: Location.LocationSubscription | null = null;
    const startForegroundWatch = async () => {
      if (AppState.currentState !== 'active' || watcher || startingWatcher) return;
      startingWatcher = true;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!mounted || permission.status !== 'granted' || !(await Location.hasServicesEnabledAsync())) return;
        await stopBackgroundLocationUpdates();
        const subscription = await Location.watchPositionAsync({
          accuracy: Location.Accuracy.High,
          timeInterval: LOCATION_UPDATE_INTERVAL_MS,
          distanceInterval: LOCATION_DISTANCE_INTERVAL_METERS,
        }, async (location) => {
          try {
            await recordLocation(location.coords, new Date(location.timestamp));
          } catch (watchError) {
            if (mounted) setError(watchError instanceof Error ? watchError.message : 'Could not store GPS fix.');
          }
        });
        if (mounted && AppState.currentState === 'active') watcher = subscription;
        else subscription.remove();
      } finally {
        startingWatcher = false;
      }
    };
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void stopBackgroundLocationUpdates()
          .then(startForegroundWatch)
          .then(refresh)
          .catch((stateError) => {
            if (mounted) setError(stateError instanceof Error ? stateError.message : 'Could not resume GPS tracking.');
          });
      } else {
        watcher?.remove();
        watcher = null;
        void startBackgroundLocationUpdates().catch((stateError) => {
          if (mounted) setError(stateError instanceof Error ? stateError.message : 'Could not start background GPS tracking.');
        });
      }
    });
    void startForegroundWatch();
    return () => {
      mounted = false;
      watcher?.remove();
      appStateSub.remove();
    };
  }, [settings?.enabled, refresh]);

  const perform = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : 'The requested action failed.';
      setError(message);
      await refresh();
      throw actionError;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const enableTracking = useCallback(() => perform(async () => {
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') {
      throw new Error('Foreground location permission is required to track this device.');
    }
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== 'granted') {
      throw new Error('Background location permission is required for periodic tracking.');
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      throw new Error('Turn on Location or GPS in your phone settings, then try again.');
    }
    await setSetting('enabled', 'true');
  }), [perform]);

  const disableTracking = useCallback(() => perform(async () => {
    await stopBackgroundLocationUpdates();
    await setSetting('enabled', 'false');
  }), [perform]);

  const captureNow = useCallback(() => perform(captureCurrentLocation), [perform]);
  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<TrackingContextValue>(() => ({
    settings,
    latest,
    locations,
    totals,
    permissions,
    online,
    busy,
    error,
    backendConfigured,
    refresh,
    syncPending,
    reconcile,
    enableTracking,
    disableTracking,
    captureNow,
    clearError,
  }), [
    settings, latest, locations, totals, permissions, online, busy, error,
    backendConfigured, refresh, syncPending, reconcile, enableTracking, disableTracking, captureNow, clearError,
  ]);

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking(): TrackingContextValue {
  const context = useContext(TrackingContext);
  if (!context) throw new Error('useTracking must be used inside TrackingProvider.');
  return context;
}
