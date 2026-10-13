import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const palette = {
  ink: '#14231F',
  muted: '#71807A',
  green: '#147D64',
  greenTint: '#E7F5F0',
  background: '#F4F7F5',
  border: '#E3EAE6',
  white: '#FFFFFF',
  amber: '#A85C13',
  amberTint: '#FFF3DF',
  red: '#B53D3D',
  redTint: '#FCEBEB',
};

export function Screen({ children, contentStyle }: {
  children: React.ReactNode;
  contentStyle?: ViewProps['style'];
}) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.screenContent, contentStyle]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function ScreenHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.heading}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewProps['style'] }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Value({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.value, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  disabled,
  secondary,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}
    >
      {disabled ? <ActivityIndicator color={secondary ? palette.green : palette.white} /> : (
        <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Notice({ children, tone = 'info' }: {
  children: React.ReactNode;
  tone?: 'info' | 'warning' | 'error';
}) {
  const toneStyle = tone === 'error'
    ? styles.errorNotice
    : tone === 'warning' ? styles.warningNotice : styles.infoNotice;
  return <View style={[styles.notice, toneStyle]}><Text style={styles.noticeText}>{children}</Text></View>;
}

export function StatCard({ label, value, detail }: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card style={styles.statCard}>
      <Label>{label}</Label>
      <Text style={styles.statValue}>{value}</Text>
      {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
    </Card>
  );
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Not yet available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  screenContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 16 },
  heading: { gap: 5, marginBottom: 2 },
  title: { color: palette.ink, fontSize: 29, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 17,
    gap: 9,
  },
  label: { color: palette.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  value: { color: palette.ink, fontSize: 15, fontWeight: '600' },
  button: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: palette.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: palette.white, fontSize: 15, fontWeight: '700' },
  secondaryButton: { backgroundColor: palette.greenTint, borderWidth: 1, borderColor: '#D1EAE1' },
  secondaryButtonText: { color: palette.green },
  disabledButton: { opacity: 0.55 },
  pressedButton: { opacity: 0.78 },
  notice: { borderRadius: 14, padding: 13 },
  infoNotice: { backgroundColor: palette.greenTint },
  warningNotice: { backgroundColor: palette.amberTint },
  errorNotice: { backgroundColor: palette.redTint },
  noticeText: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  statCard: { flex: 1, minWidth: '45%', padding: 15 },
  statValue: { color: palette.ink, fontSize: 21, fontWeight: '800' },
  statDetail: { color: palette.muted, fontSize: 11, lineHeight: 16 },
});
