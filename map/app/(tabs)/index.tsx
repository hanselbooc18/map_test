import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Button, Card, formatTimestamp, Label, Notice, palette, Screen, ScreenHeading } from '@/components/mobile-ui';
import { useTracking } from '@/lib/TrackingContext';
import { getRemoteLatest, isApiConfigured } from '@/lib/api';
import type { LocationUpdate } from '@/lib/types';

type RemoteLocation = {
  latitude?: number;
  longitude?: number;
  timestamp?: string;
  createdAt?: string;
  created_at?: string;
};

export default function TrackingScreen() {
  const {
    settings, latest, locations, online, permissions, busy, error,
    enableTracking, disableTracking, clearError,
  } = useTracking();
  const [remoteLatest, setRemoteLatest] = useState<RemoteLocation | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!settings || !online || !isApiConfigured()) return undefined;
    let active = true;
    let requestInFlight = false;
    const refreshRemoteLatest = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const result = await getRemoteLatest(settings);
        if (!active) return;
        const record = result && typeof result === 'object' ? result as RemoteLocation : null;
        setRemoteLatest(typeof record?.latitude === 'number' && typeof record.longitude === 'number'
          ? record
          : null);
        setRemoteError(null);
      } catch (loadError) {
        if (active) setRemoteError(loadError instanceof Error ? loadError.message : 'Could not load server location.');
      } finally {
        requestInFlight = false;
      }
    };
    void refreshRemoteLatest();
    const timer = setInterval(() => { void refreshRemoteLatest(); }, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [settings?.deviceId, online]));

  const lastSuccessful = useMemo(
    () => locations.find((location) => location.status === 'success') ?? null,
    [locations]
  );
  const locationToShow = latest ?? (remoteLatest as LocationUpdate | null);
  const permissionMissing =
    permissions.foreground !== 'granted' || permissions.background !== 'granted';
  const ageMs = latest ? now - new Date(latest.created_at).getTime() : Infinity;
  const stale = !latest || ageMs > Math.max(30000, (settings?.intervalSeconds ?? 10) * 3 * 1000);
  const status = permissionMissing
    ? 'Permission Required'
    : !settings?.enabled
      ? 'Tracking off'
      : online === false
        ? 'Offline'
        : stale ? 'Location Stale' : 'Tracking';
  const statusTone = status === 'Tracking' ? palette.green : status === 'Offline' || status === 'Location Stale'
    ? palette.amber : status === 'Permission Required' ? palette.red : palette.muted;
  const dueAt = latest
    ? new Date(latest.created_at).getTime() + (settings?.intervalSeconds ?? 10) * 1000
    : now;
  const countdown = Math.max(0, Math.ceil((dueAt - now) / 1000));
  const nextUpdate = countdown === 0
    ? 'Due now (the operating system may defer background updates)'
    : `${Math.floor(countdown / 60)}m ${countdown % 60}s`;
  const locationTimestamp = latest?.created_at
    ?? remoteLatest?.timestamp
    ?? remoteLatest?.createdAt
    ?? remoteLatest?.created_at;

  if (!settings) {
    return <Screen><ActivityIndicator color={palette.green} /></Screen>;
  }

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeading title="Device tracking" subtitle="Your location, stored locally and synced securely." />

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusTone }]} />
        <Text style={[styles.statusText, { color: statusTone }]}>{status}</Text>
        <Text style={styles.onlineText}>{online === false ? 'No internet' : online ? 'Online' : 'Checking'}</Text>
      </View>

      <Card>
        <Label>LATEST GPS FIX</Label>
        <Text style={styles.gpsTimestamp}>{formatTimestamp(locationTimestamp)}</Text>
        <View style={styles.coordinateRow}>
          <View style={styles.metric}>
            <Label>LATITUDE</Label>
            <Text selectable style={styles.metricValue}>{locationToShow ? locationToShow.latitude.toFixed(6) : '—'}</Text>
          </View>
          <View style={styles.metric}>
            <Label>LONGITUDE</Label>
            <Text selectable style={styles.metricValue}>{locationToShow ? locationToShow.longitude.toFixed(6) : '—'}</Text>
          </View>
        </View>
        <View style={styles.metricsGrid}>
          <GpsMetric label="ACCURACY" value={latest?.accuracy == null ? 'Not available' : `±${latest.accuracy.toFixed(1)} m`} />
          <GpsMetric label="ALTITUDE" value={latest?.altitude == null ? 'Not available' : `${latest.altitude.toFixed(1)} m`} />
          <GpsMetric label="SPEED" value={latest?.speed == null ? 'Not available' : `${latest.speed.toFixed(2)} m/s`} />
          <GpsMetric label="HEADING" value={latest?.heading == null ? 'Not available' : `${latest.heading.toFixed(1)}°`} />
        </View>
        {latest?.accuracy != null && latest.accuracy > 50
          ? <Notice tone="warning">GPS accuracy is weak (±{latest.accuracy.toFixed(0)} m). Move to an open area for a better fix.</Notice>
          : null}
        {!locationToShow ? <Text style={styles.helper}>A GPS fix will appear after you start tracking. Turn on Location/GPS if the device cannot obtain a fix.</Text> : null}
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <Label>DEVICE</Label>
          <Text style={styles.deviceName}>{settings.deviceName}</Text>
        </View>
        <View style={styles.divider} />
        <Label>UNIQUE DEVICE ID</Label>
        <Text selectable style={styles.deviceId}>{settings.deviceId}</Text>
      </Card>

      <View style={styles.coordinateRow}>
        <Card style={styles.coordinateCard}>
          <Label>LAST SUCCESSFUL REPORT</Label>
          <Text style={styles.smallValue}>{formatTimestamp(lastSuccessful?.created_at)}</Text>
        </Card>
        <Card style={styles.coordinateCard}>
          <Label>GPS REQUEST INTERVAL</Label>
          <Text style={styles.smallValue}>{settings.intervalSeconds} seconds</Text>
        </Card>
      </View>

      <Card>
        <View style={styles.rowBetween}>
          <Label>NEXT EXPECTED UPDATE</Label>
          <Text style={styles.nextUpdate}>{settings.enabled ? nextUpdate : 'Tracking is off'}</Text>
        </View>
        <Text style={styles.helper}>
          GPS updates are requested every {settings.intervalSeconds} seconds. The device OS may defer background fixes,
          especially when stationary or under battery restrictions.
        </Text>
      </Card>

      {latest?.status === 'failed' && latest.error ? <Notice tone="warning">{latest.error}</Notice> : null}
      {remoteError ? <Notice tone="warning">Server location could not be refreshed: {remoteError}</Notice> : null}
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : null}
      {error ? <Button title="Dismiss message" secondary onPress={clearError} /> : null}
      <Button
        title={settings.enabled ? 'Stop Tracking' : 'Start Tracking'}
        onPress={() => {
          const action = settings.enabled ? disableTracking : enableTracking;
          void action().catch(() => undefined);
        }}
        disabled={busy}
      />
    </Screen>
  );
}

function GpsMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Label>{label}</Label>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -5 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontWeight: '800', fontSize: 14 },
  onlineText: { marginLeft: 'auto', color: palette.muted, fontSize: 12, fontWeight: '600' },
  gpsTimestamp: { color: palette.ink, fontSize: 12, marginTop: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  deviceName: { color: palette.ink, fontWeight: '700', fontSize: 15 },
  divider: { height: 1, backgroundColor: palette.border, marginVertical: 2 },
  deviceId: { color: palette.ink, fontSize: 12, fontVariant: ['tabular-nums'] },
  coordinateRow: { flexDirection: 'row', gap: 10 },
  coordinateCard: { flex: 1, padding: 14 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flex: 1, minWidth: '42%', gap: 5 },
  metricValue: { color: palette.ink, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  smallValue: { color: palette.ink, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  nextUpdate: { color: palette.green, fontSize: 13, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  helper: { color: palette.muted, fontSize: 12, lineHeight: 18 },
});
