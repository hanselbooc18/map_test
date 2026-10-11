import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Card, Label, Notice, palette, Screen, ScreenHeading, StatCard } from '@/components/mobile-ui';
import { getRemoteUsageSummary, isApiConfigured } from '@/lib/api';
import { formatBytes } from '@/lib/bytes';
import { useTracking } from '@/lib/TrackingContext';

export default function UsageScreen() {
  const { settings, totals, online, busy, syncNow } = useTracking();
  const [remoteMessage, setRemoteMessage] = useState<string | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings || !online || !isApiConfigured()) return;
    let active = true;
    getRemoteUsageSummary(settings)
      .then(() => {
        if (active) {
          setRemoteMessage('Connected to the backend usage summary. Figures below are calculated from this device’s local update log.');
          setRemoteError(null);
        }
      })
      .catch((error) => {
        if (active) setRemoteError(error instanceof Error ? error.message : 'Could not load server usage summary.');
      });
    return () => { active = false; };
  }, [settings?.deviceId, online]);

  const maxDaily = Math.max(1, ...(totals?.daily.map((day) => day.bytes) ?? [0]));

  return (
    <Screen>
      <ScreenHeading title="Data usage" subtitle="Estimated network transfer for location updates." />

      <Notice>
        Estimated only. The app adds request/response body sizes and approximate HTTP headers; TLS, TCP/IP,
        retries, acknowledgements, and other system traffic are not fully observable from the app.
        These figures do not represent all data used by your phone.
      </Notice>

      <View style={styles.statGrid}>
        <StatCard label="TODAY" value={formatBytes(totals?.today ?? 0)} detail="Estimated total" />
        <StatCard label="THIS MONTH" value={formatBytes(totals?.month ?? 0)} detail="Estimated total" />
        <StatCard label="AVERAGE / UPDATE" value={formatBytes(totals?.average ?? 0)} detail="All recorded updates" />
        <StatCard label="LATEST UPDATE" value={formatBytes(totals?.latest?.total_bytes ?? 0)} detail="Estimated total" />
      </View>

      <Card>
        <Text style={styles.sectionTitle}>Transfer totals</Text>
        <View style={styles.metricRow}>
          <View style={styles.metricMark}><Text style={styles.uploadMark}>↑</Text></View>
          <Text style={styles.metricName}>Estimated upload</Text>
          <Text style={styles.metricValue}>{formatBytes(totals?.upload ?? 0)}</Text>
        </View>
        <View style={styles.metricRow}>
          <View style={[styles.metricMark, styles.downloadTint]}><Text style={styles.downloadMark}>↓</Text></View>
          <Text style={styles.metricName}>Estimated download</Text>
          <Text style={styles.metricValue}>{formatBytes(totals?.download ?? 0)}</Text>
        </View>
      </Card>

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Daily data usage</Text>
          <Text style={styles.chartUnit}>Last 7 recorded days</Text>
        </View>
        {totals?.daily.length ? totals.daily.map((day) => (
          <View key={day.day} style={styles.chartRow}>
            <Text style={styles.dayLabel}>{day.day.slice(5)}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { width: `${Math.max(2, day.bytes / maxDaily * 100)}%` }]} />
            </View>
            <Text style={styles.barValue}>{formatBytes(day.bytes)}</Text>
          </View>
        )) : <Text style={styles.emptyText}>No location update usage has been recorded yet.</Text>}
      </Card>

      <View style={styles.statGrid}>
        <StatCard label="SUCCESSFUL UPDATES" value={String(totals?.successful ?? 0)} />
        <StatCard label="FAILED UPDATES" value={String(totals?.failed ?? 0)} />
      </View>

      {remoteMessage ? <Notice>{remoteMessage}</Notice> : null}
      {remoteError ? <Notice tone="warning">Could not retrieve the backend summary: {remoteError}</Notice> : null}
      <Button title="Sync pending updates" secondary onPress={() => { void syncNow().catch(() => undefined); }} disabled={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sectionTitle: { color: palette.ink, fontSize: 16, fontWeight: '800' },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4 },
  metricMark: { width: 32, height: 32, borderRadius: 11, backgroundColor: palette.greenTint, alignItems: 'center', justifyContent: 'center' },
  uploadMark: { color: palette.green, fontSize: 18, fontWeight: '800' },
  downloadTint: { backgroundColor: '#EEF0FF' },
  downloadMark: { color: '#6464C9', fontSize: 18, fontWeight: '800' },
  metricName: { color: palette.ink, fontSize: 13, fontWeight: '600', flex: 1 },
  metricValue: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  chartUnit: { color: palette.muted, fontSize: 10 },
  chartRow: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 25 },
  dayLabel: { width: 39, color: palette.muted, fontSize: 10, fontVariant: ['tabular-nums'] },
  barTrack: { height: 9, flex: 1, backgroundColor: '#EFF3F1', borderRadius: 5, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 5, backgroundColor: palette.green },
  barValue: { width: 60, color: palette.ink, textAlign: 'right', fontSize: 10, fontWeight: '700' },
  emptyText: { color: palette.muted, fontSize: 13, lineHeight: 19 },
});
