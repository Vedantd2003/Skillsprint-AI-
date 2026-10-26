import { Tabs } from 'expo-router';
import React from 'react';
import { Icon, type IconName } from '../../components/primitives';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts } from '../../theme/tokens';

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarIcon: ({ color, focused }: { color: unknown; focused: boolean }) => <Icon name={icon} size={focused ? 24 : 22} color={String(color)} />,
});

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 11 },
        tabBarStyle: { backgroundColor: t.colors.surface, borderTopColor: t.colors.border, height: 64, paddingTop: 6, paddingBottom: 8 },
      }}
    >
      <Tabs.Screen name="index" options={tab('Home', 'home')} />
      <Tabs.Screen name="learn" options={tab('Learn', 'map')} />
      <Tabs.Screen name="academy" options={tab('Academy', 'briefcase')} />
      <Tabs.Screen name="tutor" options={tab('Tutor', 'message-circle')} />
      <Tabs.Screen name="profile" options={tab('Profile', 'user')} />
    </Tabs>
  );
}
