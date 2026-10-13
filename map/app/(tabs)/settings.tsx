import { useEffect, useState } from 'react';
import { Switch, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, Label, Notice, palette, Screen, ScreenHeading } from '@/components/mobile-ui';
import { getEnrollmentCode, saveEnrollmentCode } from '@/lib/api';
import { useTracking } from '@/lib/TrackingContext';

function permissionLabel(status: string): string {
  return status === 'granted' ? 'Allowed' : status === 'denied' ? 'Denied' : 'Not requested';
}

export default function SettingsScreen() {
  const {
    settings, locations, permissions, online, busy, error, backendConfigured,
    enableTracking, disableTracking, syncPending, reconcile, clearError,
  } = useTracking();
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [hasEnrollmentCode, setHasEnrollmentCode] = useState(false);
  const [savingCode, setSavingCode] = useState(false);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [reconciliationMessage, setReconciliationMessage] = useState<string | null>(null);
  const recordedCount = locations.length;
  const pendingCount = locations.filter((location) => location.server_saved === 0 && location.status === 'pending').length;
  const confirmedCount = locations.filter((location) => location.server_saved === 1).length;
  const failedCount = locations.filter((location) => location.server_saved === 0 && location.status === 'failed').length;
  const retryCount = pendingCount + failedCount;

  useEffect(() => {
    getEnrollmentCode()
      .then((code) => setHasEnrollmentCode(Boolean(code)))
      .catch((loadError) => setCodeMessage(
        loadError instanceof Error ? loadError.message : 'Could not load the saved enrollment code.'
      ));
  }, []);

  if (!settings) {
    return <Screen><Text style={styles.body}>Loading settings…</Text></Screen>;
  }

  return (
    <Screen>
      <ScreenHeading title="Settings" subtitle="Control GPS tracking, backend sync, and permissions." />

      <Card>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.cardTitle}>Device tracking</Text>
            <Text style={styles.body}>Collect GPS fixes on this phone; upload them when the Laravel API is reachable.</Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={(enabled) => {
              const action = enabled ? enableTracking : disableTracking;
              void action().catch(() => undefined);
            }}
            disabled={busy}
            trackColor={{ false: '#D9E1DD', true: '#9CD7C5' }}
            thumbColor={settings.enabled ? palette.green : '#FFFFFF'}
            accessibilityLabel="Enable device tracking"
          />
        </View>
      </Card>

      <Card>
        <Label>LOCATION REPORTING INTERVAL</Label>
        <View style={styles.intervalRow}>
          <Text style={styles.intervalLabel}>GPS request interval</Text>
          <Text style={styles.intervalValue}>5 sec target</Text>
        </View>
        <Text style={styles.body}>A continuous GPS subscription requests fixes at 5-second intervals while tracking. The operating system may delay delivery or provide no new fix when GPS data is unavailable.</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Permissions</Text>
        <View style={styles.permissionRow}>
          <Text style={styles.body}>While using the app</Text>
          <Text style={permissions.foreground === 'granted' ? styles.allowed : styles.denied}>
            {permissionLabel(permissions.foreground)}
          </Text>
        </View>
        <View style={styles.permissionRow}>
          <Text style={styles.body}>Background location</Text>
          <Text style={permissions.background === 'granted' ? styles.allowed : styles.denied}>
            {permissionLabel(permissions.background)}
          </Text>
        </View>
        <Text style={styles.body}>
          Foreground access lets the app record a fix while open. Background access is needed for periodic
          updates after you leave the app; the operating system may still defer them.
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Connectivity & local storage</Text>
        <View style={styles.permissionRow}>
          <Text style={styles.body}>Internet for map tiles</Text>
          <Text style={online ? styles.allowed : styles.denied}>
            {online === null ? 'Checking' : online ? 'Online' : 'Offline'}
          </Text>
        </View>
        <Text style={styles.body}>
          Every GPS fix is first saved on this phone, then queued for upload to the configured Laravel API.
          Map-tile connectivity is separate from backend availability.
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Laravel / MySQL sync</Text>
        <View style={styles.permissionRow}>
          <Text style={styles.body}>API URL configured</Text>
          <Text style={backendConfigured ? styles.allowed : styles.denied}>
            {backendConfigured ? 'Yes' : 'No'}
          </Text>
        </View>
        <Text style={styles.body}>
          Recorded locally: {recordedCount}{'\n'}Waiting to upload: {pendingCount}{'\n'}Confirmed saved by Laravel: {confirmedCount}{'\n'}Failed uploads: {failedCount}
        </Text>
        <Text style={styles.body}>
          A record counts as confirmed only after Laravel replies with the matching GPS fix ID. The phone sends data to Laravel; Laravel stores it in MySQL.
          The phone must be on the same Wi-Fi as your laptop, and the API URL must use the laptop's LAN IP, not localhost.
        </Text>
        <Button
          title={`Sync pending/failed reports (${retryCount})`}
          secondary
          disabled={busy || retryCount === 0}
          onPress={() => { void syncPending().catch(() => undefined); }}
        />
        <Button
          title="Reconcile local IDs with Laravel"
          secondary
          disabled={busy || !backendConfigured}
          onPress={() => {
            void reconcile().then((result) => {
              setReconciliationMessage(
                `Matched ${result.matchedCount} IDs (${result.localCount} local, ${result.serverCount} on server); ${result.missingOnServer} local records missing on server, ${result.missingLocally} server records missing locally.`
              );
            }).catch(() => setReconciliationMessage('Reconciliation failed. Check the API connection and retry.'));
          }}
        />
        {reconciliationMessage ? <Text style={styles.body}>{reconciliationMessage}</Text> : null}
        <Label>ENROLLMENT CODE (IF REQUIRED BY YOUR SERVER)</Label>
        <TextInput
          value={enrollmentCode}
          onChangeText={(value) => {
            setEnrollmentCode(value);
            setCodeMessage(null);
          }}
          placeholder={hasEnrollmentCode ? 'A code is already saved securely' : 'Enter server enrollment code'}
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
          accessibilityLabel="Laravel device enrollment code"
        />
        <Button
          title={savingCode ? 'Saving…' : 'Save enrollment code'}
          secondary
          disabled={savingCode}
          onPress={() => {
            setSavingCode(true);
            saveEnrollmentCode(enrollmentCode)
              .then(() => {
                setEnrollmentCode('');
                setHasEnrollmentCode(Boolean(enrollmentCode.trim()));
                setCodeMessage('Enrollment code saved securely on this phone.');
              })
              .catch((saveError) => setCodeMessage(
                saveError instanceof Error ? saveError.message : 'Could not save the enrollment code.'
              ))
              .finally(() => setSavingCode(false));
          }}
        />
        {codeMessage ? <Text style={styles.body}>{codeMessage}</Text> : null}
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {error ? <Button title="Dismiss message" secondary onPress={clearError} /> : null}
      <Text style={styles.footer}>Five seconds is the requested interval. Actual GPS delivery may vary with signal, permissions, network, and operating-system background limits.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 5 },
  cardTitle: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  body: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  intervalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  intervalLabel: { color: palette.ink, fontWeight: '600', fontSize: 13 },
  intervalValue: { color: palette.ink, fontWeight: '800', textAlign: 'center' },
  permissionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  allowed: { color: palette.green, fontWeight: '800', fontSize: 12 },
  denied: { color: palette.amber, fontWeight: '800', fontSize: 12 },
  input: {
    minHeight: 46,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: palette.ink,
  },
  footer: { color: palette.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
