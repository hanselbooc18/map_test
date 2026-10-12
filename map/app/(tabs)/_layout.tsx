import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { palette } from '@/components/mobile-ui';

const icons: Record<string, string> = {
  index: '◎',
  usage: '▤',
  history: '⌖',
  settings: '⚙',
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.green,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          height: 68,
          paddingTop: 8,
          paddingBottom: 8,
          borderTopColor: palette.border,
          backgroundColor: palette.white,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 22, lineHeight: 24 }}>{icons[route.name]}</Text>
        ),
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'GPS Test' }} />
      <Tabs.Screen name="usage" options={{ title: 'Data Usage' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
