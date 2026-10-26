import React, { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { Achievement } from '../api/types';
import { usePrefs } from '../store/prefs';
import { useTheme } from '../theme/ThemeProvider';
import { palette, radius, space } from '../theme/tokens';
import { AppText, Card, Icon, Row, type IconName } from './primitives';

export function ProgressBar({
  value,
  height = 12,
  color,
  track,
  style,
  accessibilityLabel,
}: {
  value: number;
  height?: number;
  color?: string;
  track?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const animations = usePrefs((s) => s.animations);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const w = useSharedValue(clamped);
  useEffect(() => {
    w.value = animations ? withTiming(clamped, { duration: 450 }) : clamped;
  }, [clamped, animations, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[{ height, borderRadius: height, backgroundColor: track ?? t.colors.track, overflow: 'hidden' }, style]}
    >
      <Animated.View style={[{ height: '100%', borderRadius: height, backgroundColor: color ?? t.colors.primary }, fill]} />
    </View>
  );
}

function StatPill({ icon, value, color, bg, label, testID }: { icon: React.ReactNode; value: string | number; color: string; bg: string; label: string; testID?: string }) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: bg, paddingHorizontal: 10, height: 34, borderRadius: radius.chip }}
    >
      {icon}
      <AppText variant="smallBold" color={color}>
        {value}
      </AppText>
    </View>
  );
}

function Flame({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .2 1.8 1 2.8 2 3 0-3-1-6 .5-9Z" fill={color} />
    </Svg>
  );
}

export function StreakIndicator({ days, activeToday = true }: { days: number; activeToday?: boolean }) {
  const t = useTheme();
  return (
    <StatPill
      testID="streak-indicator"
      icon={<Flame color={activeToday ? t.colors.streak : t.colors.locked} />}
      value={days}
      color={activeToday ? t.colors.streak : t.colors.textMuted}
      bg={activeToday ? t.colors.streakSoft : t.colors.surfaceAlt}
      label={`${days} day streak${activeToday ? '' : ', not yet extended today'}`}
    />
  );
}

export function HeartCounter({ hearts, max = 5 }: { hearts: number; max?: number }) {
  const t = useTheme();
  return (
    <StatPill
      testID="heart-counter"
      icon={<Icon name="heart" size={16} color={hearts > 0 ? t.colors.heart : t.colors.locked} />}
      value={hearts}
      color={hearts > 0 ? t.colors.heart : t.colors.textMuted}
      bg={t.dark ? '#3A1F33' : palette.roseSoft}
      label={`${hearts} of ${max} hearts`}
    />
  );
}

export function XPBadge({ xp, compact }: { xp: number; compact?: boolean }) {
  return (
    <View
      testID="xp-badge"
      accessible
      accessibilityLabel={`${xp} XP`}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: palette.volt,
        borderWidth: 2,
        borderColor: palette.ink,
        borderRadius: radius.chip,
        paddingHorizontal: compact ? 8 : 12,
        height: compact ? 28 : 34,
      }}
    >
      <Icon name="zap" size={compact ? 13 : 15} color={palette.ink} />
      <AppText variant="smallBold" color={palette.ink}>
        {xp.toLocaleString()} XP
      </AppText>
    </View>
  );
}

/** Animated XP pop used on lesson completion. */
export function XPBurst({ xp }: { xp: number }) {
  const animations = usePrefs((s) => s.animations);
  const scale = useSharedValue(animations ? 0.3 : 1);
  useEffect(() => {
    if (animations) scale.value = withSpring(1, { damping: 9, stiffness: 160 });
  }, [animations, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[{ alignItems: 'center' }, style]}>
      <View style={{ backgroundColor: palette.volt, borderWidth: 3, borderColor: palette.ink, borderRadius: radius.card, paddingHorizontal: 22, paddingVertical: 10 }}>
        <AppText variant="display" color={palette.ink}>
          +{xp} XP
        </AppText>
      </View>
    </Animated.View>
  );
}

export function AchievementCard({ achievement, unlocked = true, progress, threshold }: { achievement: Achievement; unlocked?: boolean; progress?: number; threshold?: number }) {
  const t = useTheme();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: unlocked ? 1 : 0.75 }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: unlocked ? palette.volt : t.colors.surfaceAlt,
          borderWidth: 2,
          borderColor: unlocked ? palette.ink : t.colors.border,
        }}
      >
        <Icon name={(achievement.icon as IconName) || 'award'} size={24} color={unlocked ? palette.ink : t.colors.locked} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="subheading">{achievement.title}</AppText>
        <AppText variant="small" muted>
          {achievement.description}
        </AppText>
        {!unlocked && threshold !== undefined && progress !== undefined && (
          <Row>
            <ProgressBar value={progress / threshold} height={8} style={{ flex: 1 }} />
            <AppText variant="tiny" muted>
              {progress}/{threshold}
            </AppText>
          </Row>
        )}
      </View>
    </Card>
  );
}

/** Simple, accessible weekly bar chart drawn with Views (no chart library needed). */
export function WeeklyChart({ days, goal }: { days: { day: string; xp: number; isToday: boolean; isFuture: boolean }[]; goal: number }) {
  const t = useTheme();
  const max = Math.max(goal, ...days.map((d) => d.xp), 1);
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <View accessible accessibilityLabel={`XP this week: ${days.map((d) => d.xp).join(', ')}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 8 }}>
        {days.map((d, i) => (
          <View key={d.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            {d.xp > 0 && (
              <AppText variant="tiny" muted>
                {d.xp}
              </AppText>
            )}
            <View
              style={{
                width: '100%',
                height: `${Math.max(4, (d.xp / max) * 92)}%`,
                borderRadius: 8,
                backgroundColor: d.isFuture ? t.colors.track : d.xp >= goal ? t.colors.primary : d.xp > 0 ? t.colors.primarySoft : t.colors.track,
                borderWidth: d.isToday ? 2 : 0,
                borderColor: t.colors.shadowBlock,
              }}
            />
            <AppText variant="tiny" muted style={{ marginTop: 4 }}>
              {labels[i]}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
