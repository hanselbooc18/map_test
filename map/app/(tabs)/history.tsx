import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, formatTimestamp, Label, Notice, palette, Screen, ScreenHeading, StatCard } from '@/components/mobile-ui';
import { HistoryMap, type HistoryGap } from '@/components/HistoryMap';
import { getAllRemoteHistory, type RemoteLocation } from '@/lib/api';
import { useTracking } from '@/lib/TrackingContext';

function elapsedSeconds(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? (endMs - startMs) / 1000 : null;
}
function average(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function seconds(value: number | null): string { return value == null ? 'Unavailable' : `${value.toFixed(1)} sec`; }

export default function HistoryScreen() {
  const { settings, locations, backendConfigured } = useTracking();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [dateTarget, setDateTarget] = useState<'from' | 'to' | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [appliedRange, setAppliedRange] = useState({ from: '', to: '' });
  const [records, setRecords] = useState<RemoteLocation[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tablePage, setTablePage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!settings || !backendConfigured) return;
    setLoading(true); setError(null);
    try {
      const result = await getAllRemoteHistory(settings, appliedRange.from, appliedRange.to);
      const validRecords = result.records.filter((record) => Number.isFinite(record.latitude) && Number.isFinite(record.longitude)
        && record.latitude >= -90 && record.latitude <= 90 && record.longitude >= -180 && record.longitude <= 180);
      setRecords((current) => JSON.stringify(current) === JSON.stringify(validRecords) ? current : validRecords);
      setTotal(result.total);
      setTablePage(0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load GPS history from Laravel.');
    } finally { setLoading(false); }
  }, [settings, backendConfigured, appliedRange]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const chronological = useMemo(() => [...records].sort((a, b) => {
    const timeA = Date.parse(a.gps_fix_at ?? a.recorded_at ?? '');
    const timeB = Date.parse(b.gps_fix_at ?? b.recorded_at ?? '');
    return (Number.isFinite(timeA) ? timeA : 0) - (Number.isFinite(timeB) ? timeB : 0) || a.id - b.id;
  }), [records]);
  const gaps = useMemo<HistoryGap[]>(() => chronological.slice(1).flatMap((current, index) => {
    const previous = chronological[index];
    const interval = elapsedSeconds(previous.gps_fix_at ?? previous.recorded_at, current.gps_fix_at ?? current.recorded_at);
    if (interval == null) return [];
    return [{ previous, current, seconds: interval, status: interval <= 5 ? 'Normal' : interval <= 10 ? 'Delayed' : 'Critical' }];
  }), [chronological]);
  const gapByCurrentId = useMemo(() => new Map(gaps.map((gap) => [gap.current.id, gap])), [gaps]);
  const tablePageSize = 50;
  const tablePageCount = Math.max(1, Math.ceil(Math.max(chronological.length, gaps.length) / tablePageSize));
  const visibleRecords = chronological.slice(tablePage * tablePageSize, (tablePage + 1) * tablePageSize);
  const visibleGaps = gaps.slice(tablePage * tablePageSize, (tablePage + 1) * tablePageSize);
  const intervals = gaps.map((gap) => gap.seconds);
  const uploadDelays = chronological.map((r) => elapsedSeconds(r.gps_fix_at ?? r.recorded_at, r.uploaded_at)).filter((v): v is number => v != null);
  const receiveDelays = chronological.map((r) => elapsedSeconds(r.uploaded_at, r.server_received_at)).filter((v): v is number => v != null);
  const insertionDelays = chronological.map((r) => elapsedSeconds(r.server_received_at, r.created_at)).filter((v): v is number => v != null);
  const invalidTimeCount = chronological.filter((r) => !Number.isFinite(Date.parse(r.gps_fix_at ?? r.recorded_at ?? ''))).length;
  const selected = chronological.find((record) => record.id === selectedId) ?? chronological.at(-1) ?? null;
  const selectedGap = gaps.find((gap) => gap.current.id === selectedId) ?? null;
  const localCountInRange = locations.filter((record) => {
    const date = record.created_at.slice(0, 10);
    return (!appliedRange.from || date >= appliedRange.from) && (!appliedRange.to || date <= appliedRange.to);
  }).length;
  const localRecordsInRange = locations.filter((record) => {
    const date = record.created_at.slice(0, 10);
    return (!appliedRange.from || date >= appliedRange.from) && (!appliedRange.to || date <= appliedRange.to);
  });
  const locallyConfirmed = localRecordsInRange.filter((record) => record.server_saved === 1).length;
  const locallyPending = localRecordsInRange.filter((record) => record.server_saved === 0 && record.status === 'pending').length;
  const locallyFailed = localRecordsInRange.filter((record) => record.server_saved === 0 && record.status === 'failed').length;
  const delayedCount = gaps.filter((gap) => gap.status === 'Delayed').length;
  const criticalCount = gaps.filter((gap) => gap.status === 'Critical').length;
  const withinFive = intervals.length ? `${(intervals.filter((interval) => interval <= 5).length / intervals.length * 100).toFixed(1)}%` : 'Unavailable';
  const calendarDays = useMemo(() => {
    const offset = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
    const count = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [calendarMonth]);
  const openDatePicker = (target: 'from' | 'to') => {
    const current = new Date(`${(target === 'from' ? fromDate : toDate) || new Date().toISOString().slice(0, 10)}T00:00:00`);
    setCalendarMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setDateTarget(target);
  };
  const chooseDate = (day: number) => {
    const date = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dateTarget === 'from') setFromDate(date); else setToDate(date);
    setDateTarget(null);
  };

  const applyDates = () => {
    const validDate = (value: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
      && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
    if (!validDate(fromDate.trim()) || !validDate(toDate.trim())) {
      setError('Enter dates in YYYY-MM-DD format.'); return;
    }
    if (fromDate && toDate && fromDate > toDate) { setError('Start date must be on or before end date.'); return; }
    setAppliedRange({ from: fromDate.trim(), to: toDate.trim() });
  };

  return (
    <Screen>
      <ScreenHeading title="GPS history" subtitle="Saved Laravel records, route, and measured update intervals for this enrolled device." />
      {!backendConfigured ? <Notice tone="warning">Configure the API URL in map/.env to view database history. Locally stored phone fixes remain available in Settings and the GPS Test screen.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Card>
        <Label>FILTER DATABASE HISTORY</Label>
        <View style={styles.filterRow}>
          <View style={styles.dateField}><Text style={styles.dateLabel}>FROM</Text><Pressable accessibilityRole="button" onPress={() => openDatePicker('from')} style={styles.dateInput}><Text numberOfLines={1} style={fromDate ? styles.dateText : styles.datePlaceholder}>{fromDate || 'Select date'}</Text></Pressable></View>
          <View style={styles.dateField}><Text style={styles.dateLabel}>TO</Text><Pressable accessibilityRole="button" onPress={() => openDatePicker('to')} style={styles.dateInput}><Text numberOfLines={1} style={toDate ? styles.dateText : styles.datePlaceholder}>{toDate || 'Select date'}</Text></Pressable></View>
        </View>
        <Button title={loading ? 'Loading history…' : 'Apply dates and refresh'} onPress={() => { if (!loading) applyDates(); }} disabled={loading || !backendConfigured} secondary />
        <View style={styles.syncInfo}>
          <Text style={styles.small}>Laravel {records.length} valid of {total} · Phone local {localCountInRange}</Text>
          <Text style={styles.small}>Confirmed {locallyConfirmed} · Pending {locallyPending} · Failed {locallyFailed}</Text>
        </View>
      </Card>
      <Card style={styles.mapCard}>
        {records.length ? <HistoryMap records={chronological} gaps={gaps} selectedId={selectedId} onSelect={(id) => {
          const recordIndex = chronological.findIndex((record) => String(record.id) === id);
          if (recordIndex >= 0) setTablePage(Math.floor(recordIndex / tablePageSize));
          setSelectedId(Number(id));
        }} /> : <Text style={styles.small}>{loading ? 'Loading saved GPS records…' : 'No saved GPS records for this device and date range.'}</Text>}
        {chronological.length ? <Text style={[styles.small, styles.legend]}>Green: first · Red: latest · Amber/red segments: delayed/critical. Tap a marker, segment, or table row for details.</Text> : null}
      </Card>
      <View style={styles.statsRow}>
        <StatCard label="STORED RECORDS" value={String(total)} detail={`${records.length} valid coordinates shown`} />
        <StatCard label="AVERAGE GPS INTERVAL" value={seconds(average(intervals))} detail={`Longest ${seconds(intervals.length ? Math.max(...intervals) : null)}`} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="DELAYED / CRITICAL" value={`${delayedCount} / ${criticalCount}`} detail="Delayed >5–10 sec · Critical >10 sec" />
        <StatCard label="WITHIN 5 SECONDS" value={withinFive} detail={`${gaps.length} timestamped intervals`} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="GPS → UPLOAD" value={seconds(average(uploadDelays))} detail={`${uploadDelays.length} comparable records`} />
        <StatCard label="UPLOAD → RECEIVED" value={seconds(average(receiveDelays))} detail={`DB insert after receipt ${seconds(average(insertionDelays))}`} />
      </View>
      {invalidTimeCount ? <Notice tone="warning">{invalidTimeCount} record(s) have no valid GPS-fix timestamp and were excluded from interval calculations. Delay averages exclude missing or negative timestamp differences.</Notice> : null}
      {localRecordsInRange.some((record) => record.server_saved === 0) ? <Card>
        <Label>PHONE RECORDS NOT CONFIRMED BY LARAVEL</Label>
        <Text style={styles.small}>These fixes remain in local SQLite. Failed entries show the latest saved error; the app does not keep a separate history of every HTTP attempt.</Text>
        {localRecordsInRange.filter((record) => record.server_saved === 0).slice(0, 20).map((record) => <View key={record.id} style={styles.tableRow}>
          <Text style={styles.detail}>{record.status === 'failed' ? 'FAILED' : 'PENDING'} · {formatTimestamp(record.created_at)}</Text>
          <Text style={styles.small}>{record.error ?? 'No saved upload error. Retry from Settings when the API is reachable.'}</Text>
        </View>)}
      </Card> : null}
      {selected ? <Card>
        <Label>SELECTED DATABASE RECORD</Label>
        <Text style={styles.detail}>Record {selected.id} · Device database ID {selected.device_id} · Update {selected.update_id}</Text>
        <Text style={styles.detail}>Coordinates {selected.latitude}, {selected.longitude} · Accuracy {selected.accuracy ?? '—'} · Speed {selected.speed ?? '—'} · Heading {selected.heading ?? '—'}</Text>
        <Text style={styles.small}>GPS fix {formatTimestamp(selected.gps_fix_at ?? selected.recorded_at)} · Uploaded {formatTimestamp(selected.uploaded_at)} · Received {formatTimestamp(selected.server_received_at)} · DB created {formatTimestamp(selected.created_at)} · DB updated {formatTimestamp(selected.updated_at)}</Text>
        {selectedGap ? <Text style={styles.detail}>{selectedGap.status} gap from record {selectedGap.previous.id}: {selectedGap.seconds.toFixed(2)} sec (expected 5 sec, excess {(selectedGap.seconds - 5).toFixed(2)} sec).</Text> : null}
      </Card> : null}
      <Card>
        <Label>DATABASE LOCATION TABLE · CHRONOLOGICAL</Label>
        {chronological.length ? visibleRecords.map((record, pageOffset) => {
          const index = tablePage * tablePageSize + pageOffset;
          const gap = gapByCurrentId.get(record.id);
          return <Pressable key={record.id} onPress={() => setSelectedId(record.id)} style={[styles.tableRow, selected?.id === record.id && styles.selectedRow]}>
            <Text style={styles.detail}>{index === 0 ? 'FIRST · ' : index === chronological.length - 1 ? 'LATEST · ' : ''}#{record.id} · {formatTimestamp(record.gps_fix_at ?? record.recorded_at)}</Text>
            <Text style={styles.small}>{record.latitude.toFixed(6)}, {record.longitude.toFixed(6)} · {gap ? `${gap.status} ${gap.seconds.toFixed(1)} sec` : 'No previous fix'}</Text>
            <Text style={styles.small}>Upload {seconds(elapsedSeconds(record.gps_fix_at ?? record.recorded_at, record.uploaded_at))} · Receive {seconds(elapsedSeconds(record.uploaded_at, record.server_received_at))}</Text>
          </Pressable>;
        }) : <Text style={styles.small}>No records to display.</Text>}
        {chronological.length > tablePageSize ? <View style={styles.pagination}>
          <Button title="Previous" secondary disabled={tablePage === 0} onPress={() => setTablePage((page) => Math.max(0, page - 1))} />
          <Text style={styles.small}>Page {tablePage + 1} of {tablePageCount} · {chronological.length} fixes</Text>
          <Button title="Next" secondary disabled={tablePage + 1 >= tablePageCount} onPress={() => setTablePage((page) => Math.min(tablePageCount - 1, page + 1))} />
        </View> : null}
      </Card>
      <Card>
        <Label>CONSECUTIVE GPS FIX GAPS</Label>
        <Text style={styles.small}>Tap a gap to select its current fix; the map highlights that segment. GPS intervals use gps_fix_at, falling back to recorded_at.</Text>
        {gaps.length ? visibleGaps.map((gap) => <Pressable key={gap.current.id} onPress={() => setSelectedId(gap.current.id)} style={styles.tableRow}>
          <Text style={[styles.detail, gap.status === 'Critical' ? styles.critical : gap.status === 'Delayed' ? styles.delayed : null]}>{gap.status} · {gap.seconds.toFixed(2)} sec (expected 5, excess {Math.max(0, gap.seconds - 5).toFixed(2)} sec)</Text>
          <Text style={styles.small}>Previous #{gap.previous.id} at {formatTimestamp(gap.previous.gps_fix_at ?? gap.previous.recorded_at)}</Text>
          <Text style={styles.small}>Current #{gap.current.id} at {formatTimestamp(gap.current.gps_fix_at ?? gap.current.recorded_at)}</Text>
        </Pressable>) : <Text style={styles.small}>At least two valid GPS timestamps are needed to calculate gaps.</Text>}
        {gaps.length > tablePageSize ? <View style={styles.pagination}>
          <Button title="Previous" secondary disabled={tablePage === 0} onPress={() => setTablePage((page) => Math.max(0, page - 1))} />
          <Text style={styles.small}>Page {tablePage + 1} of {tablePageCount} · {gaps.length} intervals</Text>
          <Button title="Next" secondary disabled={tablePage + 1 >= tablePageCount} onPress={() => setTablePage((page) => Math.min(tablePageCount - 1, page + 1))} />
        </View> : null}
      </Card>
      <Text style={styles.small}>Phone fixes are saved to local SQLite before uploads are attempted. This view compares those local records with authenticated Laravel history; it cannot reconstruct old HTTP attempts because the app does not retain a per-attempt response log.</Text>
      <Text style={styles.small}>GPS-to-upload and upload-to-server times compare phone timestamps with server timestamps. They assume the phone and server clocks are synchronized; negative or missing differences are excluded.</Text>
      <Modal visible={dateTarget !== null} transparent animationType="fade" onRequestClose={() => setDateTarget(null)}>
        <View style={styles.modalBackdrop}><View style={styles.calendar}>
          <View style={styles.calendarHeader}>
            <Pressable accessibilityLabel="Previous month" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.monthButton}><Text style={styles.dateText}>‹</Text></Pressable>
            <Text style={styles.calendarTitle}>{calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</Text>
            <Pressable accessibilityLabel="Next month" onPress={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.monthButton}><Text style={styles.dateText}>›</Text></Pressable>
          </View>
          <View style={styles.dayGrid}>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}
            {calendarDays.map((day, index) => day ? <Pressable key={index} onPress={() => chooseDate(day)} style={styles.dayButton}><Text style={styles.dateText}>{day}</Text></Pressable> : <View key={`blank-${index}`} style={styles.dayButton} />)}
          </View>
          <Pressable onPress={() => setDateTarget(null)} style={styles.cancelDate}><Text style={styles.dateLabel}>CANCEL</Text></Pressable>
        </View></View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', gap: 10 }, dateField: { flex: 1, minWidth: 0, gap: 4 }, dateLabel: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }, dateInput: { width: '100%', height: 42, borderWidth: 1, borderColor: palette.border, borderRadius: 10, paddingHorizontal: 9, justifyContent: 'center' }, dateText: { color: palette.ink, fontSize: 14, fontWeight: '600' }, datePlaceholder: { color: palette.muted, fontSize: 13 }, syncInfo: { gap: 2 }, legend: { paddingHorizontal: 14, paddingVertical: 10 }, modalBackdrop: { flex: 1, backgroundColor: '#00000055', justifyContent: 'center', padding: 24 }, calendar: { backgroundColor: palette.white, borderRadius: 20, padding: 18, gap: 12 }, calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, calendarTitle: { color: palette.ink, fontSize: 16, fontWeight: '700' }, monthButton: { padding: 8 }, dayGrid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.285%', textAlign: 'center', color: palette.muted, fontSize: 11, fontWeight: '700', paddingVertical: 8 }, dayButton: { width: '14.285%', height: 40, alignItems: 'center', justifyContent: 'center' }, cancelDate: { alignSelf: 'flex-end', padding: 8 },
  small: { color: palette.muted, fontSize: 12, lineHeight: 18 }, detail: { color: palette.ink, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  mapCard: { padding: 0, overflow: 'hidden' }, statsRow: { flexDirection: 'row', gap: 10 }, tableRow: { borderTopWidth: 1, borderTopColor: palette.border, paddingVertical: 10, gap: 4 }, pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, selectedRow: { backgroundColor: palette.greenTint }, critical: { color: palette.red }, delayed: { color: palette.amber },
});
