import { Switch, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Label, Notice, palette, Screen, ScreenHeading } from '@/components/mobile-ui';
import { isApiConfigured } from '@/lib/api';
import { useTracking } from '@/lib/TrackingContext';

function permissionLabel(status: string): string {
  return status === 'granted' ? 'Allowed' : status === 'denied' ? 'Denied' : 'Not requested';
}

export default function SettingsScreen() {
  const {
    settings, permissions, online, busy, error, enableTracking, disableTracking,
    syncNow, clearError,
  } = useTracking();

  if (!settings) {
    return <Screen><Text style={styles.body}>Loading settings…</Text></Screen>;
  }

  return (
    <Screen>
      <ScreenHeading title="Settings" subtitle="Control background tracking and synchronization." />

      <Card>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.cardTitle}>Device tracking</Text>
            <Text style={styles.body}>Collect and sync location while tracking is enabled.</Text>
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
          <Text style={styles.intervalValue}>10 sec</Text>
        </View>
        <Text style={styles.body}>GPS fixes are requested every 10 seconds while tracking. Android and iOS may defer background delivery to protect battery or when GPS reception is limited.</Text>
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
        <Text style={styles.cardTitle}>Connectivity & privacy</Text>
        <View style={styles.permissionRow}>
          <Text style={styles.body}>Internet connection</Text>
          <Text style={online ? styles.allowed : styles.denied}>
            {online === null ? 'Checking' : online ? 'Online' : 'Offline'}
          </Text>
        </View>
        <View style={styles.permissionRow}>
          <Text style={styles.body}>Measurement mode</Text>
          <Text style={styles.allowed}>Estimated</Text>
        </View>
        <Text style={styles.body}>
          Transfer estimates include JSON body sizes and approximate HTTP headers. Cellular, TLS, TCP/IP,
          retries, and other phone traffic are not measured by this app.
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Backend</Text>
        <Text style={styles.body}>
          {isApiConfigured()
            ? 'API base URL is configured. Device access tokens are stored in the platform secure store.'
            : 'No backend URL is configured. Location and usage records remain on this device; uploads will fail visibly until configured.'}
        </Text>
        <Text style={styles.deviceId}>Device ID: {settings.deviceId}</Text>
      </Card>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {error ? <Button title="Dismiss message" secondary onPress={clearError} /> : null}
      <Button title="Sync Now" onPress={() => { void syncNow().catch(() => undefined); }} disabled={busy} />
      <Text style={styles.footer}>Pending updates are retried with the same update ID to prevent duplicate server records.</Text>
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
  deviceId: { color: palette.ink, fontSize: 10, fontVariant: ['tabular-nums'] },
  footer: { color: palette.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
