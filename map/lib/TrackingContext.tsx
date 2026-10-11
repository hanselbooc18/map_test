import * as Location from 'expo-location';
import * as Network from 'expo-network';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  getLatestLocation,
  getLocations,
  getSettings,
  getUsageTotals,
  setSetting,
} from './database';
import { startBackgroundLocationUpdates, stopBackgroundLocationUpdates } from './background';
import { captureCurrentLocation, syncPendingLocations } from './tracking';
import type { LocationUpdate, TrackingSettings, UsageTotals } from './types';

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
  refresh: () => Promise<void>;
  enableTracking: () => Promise<void>;
  disableTracking: () => Promise<void>;
  syncNow: () => Promise<void>;
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

  const refresh = useCallback(async () => {
    const [storedSettings, storedLatest, storedLocations, usage, network, foreground, background] =
      await Promise.all([
        getSettings(),
        getLatestLocation(),
        getLocations(),
        getUsageTotals(),
        Network.getNetworkStateAsync(),
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
    setSettingsState(storedSettings);
    setLatest(storedLatest);
    setLocations(storedLocations);
    setTotals(usage);
    setOnline(network.isConnected === true && network.isInternetReachable !== false);
    setPermissions({ foreground: foreground.status, background: background.status });
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      await refresh();
      const storedSettings = await getSettings();
      const [foreground, background] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);
      if (storedSettings.enabled && foreground.status === 'granted' && background.status === 'granted') {
        await startBackgroundLocationUpdates();
      }
      await syncPendingLocations();
    };
    initialize().catch((loadError) => {
      if (active) setError(
        loadError instanceof Error ? loadError.message : 'Could not load tracking data.'
      );
    });
    const timer = setInterval(() => {
      if (active) {
        refresh().catch((loadError) => setError(
          loadError instanceof Error ? loadError.message : 'Could not refresh tracking data.'
        ));
      }
    }, settings?.enabled ? 10000 : 15000);
    const subscription = Network.addNetworkStateListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(connected);
      if (connected) {
        syncPendingLocations()
          .then(refresh)
          .catch((syncError) => setError(
            syncError instanceof Error ? syncError.message : 'Could not synchronize updates.'
          ));
      }
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh, settings?.enabled]);

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
    await captureCurrentLocation();
    await startBackgroundLocationUpdates();
    await setSetting('enabled', 'true');
  }), [perform]);

  const disableTracking = useCallback(() => perform(async () => {
    await stopBackgroundLocationUpdates();
    await setSetting('enabled', 'false');
  }), [perform]);

  const syncNow = useCallback(() => perform(syncPendingLocations), [perform]);
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
    refresh,
    enableTracking,
    disableTracking,
    syncNow,
    captureNow,
    clearError,
  }), [
    settings, latest, locations, totals, permissions, online, busy, error,
    refresh, enableTracking, disableTracking, syncNow, captureNow, clearError,
  ]);

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking(): TrackingContextValue {
  const context = useContext(TrackingContext);
  if (!context) throw new Error('useTracking must be used inside TrackingProvider.');
  return context;
}
