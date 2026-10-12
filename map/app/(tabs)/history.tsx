import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card, formatTimestamp, Label, palette, Screen, ScreenHeading } from '@/components/mobile-ui';
import { useTracking } from '@/lib/TrackingContext';

export default function HistoryScreen() {
  const { locations } = useTracking();
  const [dateFilter, setDateFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const date = dateFilter.trim();
    return locations.filter((entry) => !date || entry.created_at.slice(0, 10).includes(date));
  }, [locations, dateFilter]);
  const selected = filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null;

  return (
    <Screen>
      <ScreenHeading title="Location history" subtitle="Browse GPS fixes stored locally on this device." />
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

      <Text style={styles.countText}>{filtered.length} location {filtered.length === 1 ? 'update' : 'updates'}</Text>
      {filtered.map((entry) => (
        <Pressable key={entry.id} onPress={() => setSelectedId(entry.id)}>
          <Card style={[styles.historyCard, selected?.id === entry.id && styles.selectedCard]}>
            <View style={styles.rowTop}>
              <Text style={styles.dateText}>{formatTimestamp(entry.created_at)}</Text>
              <Text style={[
                styles.status,
                entry.status === 'success' ? styles.synced : entry.status === 'failed' ? styles.failed : styles.pending,
              ]}>
                {entry.status === 'success' ? 'Synced' : entry.status === 'failed' ? 'Sync failed' : 'Pending'}
              </Text>
            </View>
            <View style={styles.coordsRow}>
              <Text style={styles.coords}>{entry.latitude.toFixed(5)}, {entry.longitude.toFixed(5)}</Text>
              <Text style={styles.accuracy}>
                {entry.accuracy == null ? 'Accuracy unavailable' : `±${entry.accuracy.toFixed(1)} m`}
              </Text>
            </View>
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
  status: { backgroundColor: palette.greenTint, color: palette.green, fontSize: 10, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, overflow: 'hidden' },
  synced: { backgroundColor: palette.greenTint, color: palette.green },
  failed: { backgroundColor: palette.redTint, color: palette.red },
  pending: { backgroundColor: palette.amberTint, color: palette.amber },
  coordsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  coords: { color: palette.ink, fontSize: 13, fontVariant: ['tabular-nums'] },
  accuracy: { color: palette.muted, fontSize: 12, fontWeight: '700' },
});
