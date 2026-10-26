import React, { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ApiError } from '../api/client';
import { useIsOnline } from '../lib/network';
import { useOfflineQueue } from '../store/offlineQueue';
import { usePrefs } from '../store/prefs';
import { useTheme } from '../theme/ThemeProvider';
import { palette, radius, space } from '../theme/tokens';
import { Mascot, type Mood } from './Mascot';
import { AppText, Icon, PrimaryButton, Row } from './primitives';

export function Skeleton({ height = 16, width = '100%', radius: r = 8 }: { height?: number; width?: DimensionValue; radius?: number }) {
  const t = useTheme();
  const animations = usePrefs((s) => s.animations);
  const o = useSharedValue(0.55);
  useEffect(() => {
    if (animations) o.value = withRepeat(withTiming(1, { duration: 750 }), -1, true);
  }, [animations, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: t.colors.surfaceAlt }, style]} />;
}

/** Skeleton loading state shaped like the content that is coming. */
export function LoadingState({ lines = 3, cards = 2, label = 'Loading' }: { lines?: number; cards?: number; label?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ gap: space.md, paddingVertical: space.lg }} testID="loading-state">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={`l${i}`} width={i === 0 ? '60%' : '90%'} height={i === 0 ? 24 : 14} />
      ))}
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={`c${i}`} height={96} radius={radius.card} />
      ))}
    </View>
  );
}

export function EmptyState({ title, message, action, onAction, mood = 'happy' }: { title: string; message: string; action?: string; onAction?: () => void; mood?: Mood }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.md }} testID="empty-state">
      <Mascot size={96} mood={mood} bounce={false} />
      <AppText variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText muted style={{ textAlign: 'center', maxWidth: 300 }}>
        {message}
      </AppText>
      {action && onAction && <PrimaryButton title={action} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: space.sm }} />}
    </View>
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const offline = error instanceof ApiError && error.isNetwork;
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.md }} testID="error-state" accessibilityLiveRegion="polite">
      <Mascot size={90} mood="sad" bounce={false} />
      <AppText variant="heading" style={{ textAlign: 'center' }}>
        {title ?? (offline ? "You're offline" : "That didn't load")}
      </AppText>
      <AppText muted style={{ textAlign: 'center', maxWidth: 300 }}>
        {errorMessage(error)}
      </AppText>
      {onRetry && <PrimaryButton title="Try again" icon="refresh-cw" kind="secondary" onPress={onRetry} style={{ alignSelf: 'stretch' }} />}
    </View>
  );
}

export function OfflineBanner() {
  const online = useIsOnline();
  const pending = useOfflineQueue((s) => s.items.length);
  const syncing = useOfflineQueue((s) => s.syncing);
  if (online && !pending) return null;
  const text = !online
    ? pending
      ? `Offline. ${pending} answer${pending > 1 ? 's' : ''} saved on this device, not yet synced.`
      : "You're offline. Saved courses still open; progress syncs when you reconnect."
    : syncing
      ? 'Syncing your saved answers…'
      : `${pending} answer${pending > 1 ? 's' : ''} waiting to sync`;
  return (
    <View
      accessibilityRole="alert"
      testID="offline-banner"
      style={{ backgroundColor: online ? palette.amber : palette.ink, paddingVertical: 8, paddingHorizontal: space.lg }}
    >
      <Row>
        <Icon name={online ? 'upload-cloud' : 'wifi-off'} size={16} color={online ? palette.ink : '#fff'} />
        <AppText variant="smallBold" color={online ? palette.ink : '#fff'} style={{ flex: 1 }}>
          {text}
        </AppText>
      </Row>
    </View>
  );
}
