import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, Card, formatTimestamp, Label, Notice, palette, Screen, ScreenHeading } from '@/components/mobile-ui';
import { OpenStreetMap } from '@/components/OpenStreetMap';
import { useTracking } from '@/lib/TrackingContext';

export default function TrackingScreen() {
  const {
    settings, latest, online, permissions, busy, error,
    enableTracking, disableTracking, clearError,
  } = useTracking();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!settings) {
    return <Screen><ActivityIndicator color={palette.green} /></Screen>;
  }

  const hasPermissions = permissions.foreground === 'granted' && permissions.background === 'granted';
  const fixAge = latest ? now - new Date(latest.created_at).getTime() : Infinity;
  const fixIsStale = fixAge > 30_000;
  const accuracy = latest?.accuracy;
  const gpsStatus = !hasPermissions
    ? 'Location permission required'
    : !settings.enabled
      ? latest ? 'Tracking stopped · showing last fix' : 'Tracking stopped'
      : !latest
        ? 'Waiting for GPS fix'
        : fixIsStale
          ? 'GPS fix is stale · waiting for update'
          : accuracy == null
            ? 'GPS fix received · accuracy unavailable'
            : accuracy > 50
              ? 'Weak GPS signal'
              : 'GPS fix received';
  const gpsStatusColor = !hasPermissions ? palette.red
    : !settings.enabled || fixIsStale || (accuracy != null && accuracy > 50)
      ? palette.amber : palette.green;

  return (
    <Screen contentStyle={styles.content}>
      <ScreenHeading
        title="Local GPS map test"
        subtitle="Live phone GPS. Fixes are stored locally first, then sent to the configured Laravel API."
      />

      <Card style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: gpsStatusColor }]} />
          <View style={styles.statusCopy}>
            <Label>GPS STATUS</Label>
            <Text style={[styles.statusText, { color: gpsStatusColor }]}>{gpsStatus}</Text>
          </View>
        </View>
        <View style={styles.internetRow}>
          <Text style={styles.internetLabel}>Internet · map tiles</Text>
          <Text style={[styles.internetValue, { color: online === false ? palette.amber : palette.muted }]}>
            {online === null ? 'Checking' : online ? 'Connected' : 'Unavailable'}
          </Text>
        </View>
        <Text style={styles.helper}>GPS collection is separate from internet access. OpenStreetMap tiles need a connection; without one, the map may be blank while GPS values continue updating locally.</Text>
      </Card>

      <Card style={styles.mapCard}>
        <OpenStreetMap
          fix={latest ? {
            latitude: latest.latitude,
            longitude: latest.longitude,
            accuracy: latest.accuracy,
          } : null}
        />
      </Card>

      <Card style={styles.detailsCard}>
        <View style={styles.coordinateRow}>
          <GpsValue label="LATITUDE" value={latest ? latest.latitude.toFixed(6) : 'Waiting for fix'} />
          <GpsValue label="LONGITUDE" value={latest ? latest.longitude.toFixed(6) : 'Waiting for fix'} />
        </View>
        <View style={styles.divider} />
        <View style={styles.coordinateRow}>
          <GpsValue label="GPS ACCURACY" value={
            latest?.accuracy == null ? 'Not available' : `±${latest.accuracy.toFixed(1)} m`
          } />
          <GpsValue label="FIX TIMESTAMP" value={formatTimestamp(latest?.created_at)} />
        </View>
        <View style={styles.divider} />
        <View style={styles.coordinateRow}>
          <GpsValue
            label="SERVER UPLOAD"
            value={!latest ? 'No fix yet' : latest.status === 'success' ? 'Sent to Laravel' : latest.status === 'failed' ? 'Failed · retry from Settings' : 'Waiting to sync'}
          />
          <GpsValue label="REPORT DATA" value={latest?.error ?? 'Saved on phone'} />
        </View>
        {accuracy != null && accuracy > 50
          ? <Notice tone="warning">Reported GPS accuracy is ±{accuracy.toFixed(1)} m. The marker’s circle shows this measured uncertainty; this fix is not being described as precise.</Notice>
          : null}
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {error ? <Button title="Dismiss message" secondary onPress={clearError} /> : null}
      <Button
        title={settings.enabled ? 'Stop Tracking' : 'Start Tracking'}
        onPress={() => {
          const action = settings.enabled ? disableTracking : enableTracking;
          void action().catch(() => undefined);
        }}
        disabled={busy}
      />
      <Text style={styles.attributionNote}>Map data © OpenStreetMap contributors · GPS update requested every 10 seconds</Text>
    </Screen>
  );
}

function GpsValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Label>{label}</Label>
      <Text selectable style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  statusCard: { paddingVertical: 13, gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 11, height: 11, borderRadius: 6 },
  statusCopy: { flex: 1, gap: 3 },
  statusText: { fontSize: 14, fontWeight: '800' },
  internetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  internetLabel: { color: palette.muted, fontSize: 12 },
  internetValue: { fontSize: 12, fontWeight: '800' },
  helper: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  mapCard: { padding: 0, overflow: 'hidden' },
  detailsCard: { gap: 13 },
  coordinateRow: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, gap: 5 },
  metricValue: { color: palette.ink, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  divider: { height: 1, backgroundColor: palette.border },
  attributionNote: { color: palette.muted, textAlign: 'center', fontSize: 10, lineHeight: 14 },
});
