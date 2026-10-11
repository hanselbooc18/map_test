import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, formatTimestamp, Label, Notice, palette, Screen, ScreenHeading } from '@/components/mobile-ui';
import { getRemoteHistory, isApiConfigured } from '@/lib/api';
import { formatBytes } from '@/lib/bytes';
import { useTracking } from '@/lib/TrackingContext';
import type { LocationUpdate, UpdateStatus } from '@/lib/types';

type RemoteUpdate = Record<string, unknown>;

function parseRemoteHistory(payload: unknown, deviceId: string): LocationUpdate[] {
  const records = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : [];
  return records.flatMap((item): LocationUpdate[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as RemoteUpdate;
    const latitude = row.latitude;
    const longitude = row.longitude;
    const timestamp = row.timestamp ?? row.createdAt ?? row.created_at;
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof timestamp !== 'string') return [];
    const status = row.status === 'failed' || row.status === 'pending' ? row.status : 'success';
    return [{
      id: String(row.updateId ?? row.id ?? `${timestamp}:${latitude}:${longitude}`),
      device_id: String(row.deviceId ?? row.device_id ?? deviceId),
      created_at: timestamp,
      latitude,
      longitude,
      accuracy: typeof row.accuracy === 'number' ? row.accuracy : null,
      altitude: typeof row.altitude === 'number' ? row.altitude : null,
      speed: typeof row.speed === 'number' ? row.speed : null,
      heading: typeof row.heading === 'number' ? row.heading : null,
      coordinate_bytes: Number(row.coordinatePayloadBytes ?? row.coordinate_bytes) || 0,
      request_body_bytes: Number(row.requestBodyBytes ?? row.request_body_bytes) || 0,
      response_body_bytes: Number(row.responseBodyBytes ?? row.response_body_bytes) || 0,
      upload_bytes: Number(row.uploadBytes ?? row.upload_bytes) || 0,
      download_bytes: Number(row.downloadBytes ?? row.download_bytes) || 0,
      total_bytes: Number(row.totalBytes ?? row.total_bytes) || 0,
      status: status as UpdateStatus,
      error: typeof row.error === 'string' ? row.error : null,
    }];
  });
}

export default function HistoryScreen() {
  const { settings, locations, online } = useTracking();
  const [remoteLocations, setRemoteLocations] = useState<LocationUpdate[]>([]);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!settings || !online || !isApiConfigured()) return;
    let active = true;
    getRemoteHistory(settings)
      .then((payload) => {
        if (active) {
          setRemoteLocations(parseRemoteHistory(payload, settings.deviceId));
          setRemoteError(null);
        }
      })
      .catch((error) => {
        if (active) setRemoteError(error instanceof Error ? error.message : 'Could not retrieve history.');
      });
    return () => { active = false; };
  }, [settings?.deviceId, online]);

  const allLocations = useMemo(() => {
    const byId = new Map<string, LocationUpdate>();
    for (const entry of [...remoteLocations, ...locations]) byId.set(entry.id, entry);
    return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [locations, remoteLocations]);
  const filtered = useMemo(() => {
    const date = dateFilter.trim();
    return allLocations.filter((entry) => !date || entry.created_at.slice(0, 10).includes(date));
  }, [allLocations, dateFilter]);
  const selected = filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null;

  return (
    <Screen>
      <ScreenHeading title="Location history" subtitle="Browse saved and server-synced location reports." />
      <Card>
        {selected ? (
          <>
            <Label>SELECTED GPS FIX</Label>
            <Text style={styles.coords}>{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}</Text>
            <Text style={styles.selectedTime}>{formatTimestamp(selected.created_at)}</Text>
            <Text style={styles.selectedTime}>
              Accuracy: {selected.accuracy == null ? 'Not available' : `±${selected.accuracy.toFixed(1)} m`}
              {' · '}Altitude: {selected.altitude == null ? 'Not available' : `${selected.altitude.toFixed(1)} m`}
            </Text>
            <Text style={styles.selectedTime}>
              Speed: {selected.speed == null ? 'Not available' : `${selected.speed.toFixed(2)} m/s`}
              {' · '}Heading: {selected.heading == null ? 'Not available' : `${selected.heading.toFixed(1)}°`}
            </Text>
          </>
        ) : (
          <View style={styles.emptyPlaceholder}><Text style={styles.emptyText}>No location records match this date.</Text></View>
        )}
      </Card>

      <View style={styles.filterLabel}>
        <Label>FILTER BY DATE</Label>
        <Text style={styles.filterHint}>Use YYYY-MM-DD</Text>
      </View>
      <TextInput
        value={dateFilter}
        onChangeText={setDateFilter}
        placeholder="e.g. 2026-10-10"
        placeholderTextColor="#9BA7A2"
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
        style={styles.input}
        accessibilityLabel="Filter history by date"
      />

      {remoteError ? <Notice tone="warning">Could not refresh server history: {remoteError}</Notice> : null}
      <Text style={styles.countText}>{filtered.length} location {filtered.length === 1 ? 'update' : 'updates'}</Text>
      {filtered.map((entry) => (
        <Pressable key={entry.id} onPress={() => setSelectedId(entry.id)}>
          <Card style={[styles.historyCard, selected?.id === entry.id && styles.selectedCard]}>
            <View style={styles.rowTop}>
              <Text style={styles.dateText}>{formatTimestamp(entry.created_at)}</Text>
              <Text style={[
                styles.status,
                entry.status === 'success' ? styles.success :
                  entry.status === 'pending' ? styles.pending : styles.failed,
              ]}>
                {entry.status === 'success' ? 'Sent' : entry.status === 'pending' ? 'Queued' : 'Failed'}
              </Text>
            </View>
            <View style={styles.coordsRow}>
              <Text style={styles.coords}>{entry.latitude.toFixed(5)}, {entry.longitude.toFixed(5)}</Text>
              <Text style={styles.usage}>{formatBytes(entry.total_bytes)}</Text>
            </View>
            {entry.error ? <Text style={styles.errorText} numberOfLines={2}>{entry.error}</Text> : null}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  selectedTime: { color: palette.muted, fontSize: 11, paddingHorizontal: 4 },
  emptyPlaceholder: { minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: palette.muted, fontSize: 13, textAlign: 'center' },
  filterLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filterHint: { color: palette.muted, fontSize: 11 },
  input: {
    height: 48,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: palette.ink,
    fontSize: 14,
  },
  countText: { color: palette.muted, fontSize: 12, fontWeight: '700' },
  historyCard: { paddingVertical: 14, gap: 10 },
  selectedCard: { borderColor: palette.green, borderWidth: 1.5 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  dateText: { color: palette.ink, fontSize: 13, fontWeight: '700', flex: 1 },
  status: { fontSize: 10, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, overflow: 'hidden' },
  success: { backgroundColor: palette.greenTint, color: palette.green },
  pending: { backgroundColor: '#FFF3DF', color: palette.amber },
  failed: { backgroundColor: palette.redTint, color: palette.red },
  coordsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  coords: { color: palette.ink, fontSize: 13, fontVariant: ['tabular-nums'] },
  usage: { color: palette.green, fontSize: 12, fontWeight: '700' },
  errorText: { color: palette.red, fontSize: 11, lineHeight: 16 },
});
