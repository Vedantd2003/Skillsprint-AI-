import { AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold } from '@expo-google-fonts/atkinson-hyperlegible';
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../api/queryClient';
import { OfflineBanner } from '../components/states';
import { startNetworkSync } from '../lib/network';
import { useAuth } from '../store/auth';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/tokens';

void SplashScreen.preventAutoHideAsync();
startNetworkSync();

/** Course metadata and dashboard data are cached on device for offline viewing. */
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'skillsprint-query-cache', throttleTime: 2000 });

function RootNavigator() {
  const t = useTheme();
  const status = useAuth((s) => s.status);
  const signedIn = status === 'signedIn';
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTransparent: false,
          headerStyle: { backgroundColor: t.colors.bg },
          headerTintColor: t.colors.text,
          headerTitleStyle: { fontFamily: fonts.heading, color: t.colors.text },
          headerBackTitleStyle: { fontFamily: fonts.body },
          contentStyle: { backgroundColor: t.colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="welcome-plan" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="lesson/[id]" options={{ headerShown: false, gestureEnabled: false, animation: 'slide_from_bottom' }} />
          <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
          <Stack.Screen name="catalog" options={{ title: 'All courses' }} />
          <Stack.Screen name="revision" options={{ title: 'Revision' }} />
          <Stack.Screen name="ai-quiz" options={{ title: 'AI practice quiz' }} />
          <Stack.Screen name="tutor/[id]" options={{ title: 'AI tutor' }} />
          <Stack.Screen name="interview" options={{ title: 'Mock interview' }} />
          <Stack.Screen name="pronunciation" options={{ title: 'Pronunciation' }} />
          <Stack.Screen name="study-plan" options={{ title: 'Study plan' }} />
          <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
          <Stack.Screen name="achievements" options={{ title: 'Achievements' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
  });
  const status = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (fontsLoaded && status !== 'loading') void SplashScreen.hideAsync();
  }, [fontsLoaded, status]);

  useEffect(() => {
    if (status === 'signedOut') queryClient.clear();
  }, [status]);

  if (!fontsLoaded || status === 'loading') return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60_000, buster: 'v1' }}>
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
