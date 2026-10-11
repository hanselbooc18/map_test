import 'react-native-reanimated';

import { Stack } from 'expo-router';

import { TrackingProvider } from '@/lib/TrackingContext';

export default function RootLayout() {
  return (
    <TrackingProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </TrackingProvider>
  );
}
