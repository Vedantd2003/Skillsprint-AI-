import React, { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { usePrefs } from '../store/prefs';
import { palette } from '../theme/tokens';

export type Mood = 'happy' | 'cheer' | 'think' | 'sad' | 'sleep';

/**
 * "Dash" — SkillSprint's original mascot: a round cobalt spark with a volt
 * lightning tuft and running shoes. Drawn in SVG so it scales and themes.
 */
export function Mascot({ size = 120, mood = 'happy', bounce = true }: { size?: number; mood?: Mood; bounce?: boolean }) {
  const animations = usePrefs((s) => s.animations);
  const y = useSharedValue(0);
  useEffect(() => {
    if (!bounce || !animations) return;
    y.value = withRepeat(
      withSequence(withTiming(-6, { duration: 700, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 700, easing: Easing.in(Easing.quad) })),
      -1,
    );
  }, [bounce, animations, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  const eye = (cx: number) => {
    if (mood === 'sleep') return <Path key={cx} d={`M${cx - 7} 58 q7 6 14 0`} stroke={palette.ink} strokeWidth={3.5} fill="none" strokeLinecap="round" />;
    if (mood === 'cheer') return <Path key={cx} d={`M${cx - 7} 60 q7 -9 14 0`} stroke={palette.ink} strokeWidth={3.5} fill="none" strokeLinecap="round" />;
    return (
      <G key={cx}>
        <Ellipse cx={cx} cy={58} rx={8} ry={mood === 'think' ? 7 : 9.5} fill={palette.white} />
        <Circle cx={cx + (mood === 'think' ? 3 : 1.5)} cy={mood === 'think' ? 56 : 59} r={4.6} fill={palette.ink} />
        <Circle cx={cx + 3} cy={56} r={1.6} fill={palette.white} />
      </G>
    );
  };
  const mouth =
    mood === 'sad'
      ? 'M52 80 q8 -7 16 0'
      : mood === 'think'
        ? 'M53 79 h12'
        : mood === 'sleep'
          ? 'M56 78 q4 3 8 0'
          : 'M50 75 q10 11 20 0';

  return (
    <Animated.View style={style} accessibilityRole="image" accessibilityLabel="Dash, the SkillSprint mascot">
      <Svg width={size} height={size} viewBox="0 0 120 120">
        {/* lightning tuft */}
        <Path d="M64 6 L50 30 L60 30 L54 46 L74 22 L63 22 Z" fill={palette.volt} stroke={palette.ink} strokeWidth={3} strokeLinejoin="round" />
        {/* body */}
        <Circle cx={60} cy={66} r={38} fill={palette.cobalt} stroke={palette.ink} strokeWidth={3.5} />
        <Ellipse cx={47} cy={46} rx={10} ry={6} fill="#ffffff" opacity={0.18} />
        {/* cheeks */}
        <Circle cx={36} cy={72} r={5} fill={palette.flame} opacity={0.55} />
        <Circle cx={84} cy={72} r={5} fill={palette.flame} opacity={0.55} />
        {eye(47)}
        {eye(73)}
        <Path d={mouth} stroke={palette.ink} strokeWidth={3.5} fill={mood === 'happy' || mood === 'cheer' ? palette.ink : 'none'} strokeLinecap="round" />
        {/* arms */}
        {mood === 'cheer' ? (
          <>
            <Path d="M24 60 L10 40" stroke={palette.ink} strokeWidth={5} strokeLinecap="round" />
            <Path d="M96 60 L110 40" stroke={palette.ink} strokeWidth={5} strokeLinecap="round" />
          </>
        ) : (
          <>
            <Path d="M24 70 L14 80" stroke={palette.ink} strokeWidth={5} strokeLinecap="round" />
            <Path d="M96 70 L106 80" stroke={palette.ink} strokeWidth={5} strokeLinecap="round" />
          </>
        )}
        {/* running shoes */}
        <Rect x={36} y={100} width={20} height={11} rx={5.5} fill={palette.flame} stroke={palette.ink} strokeWidth={3} />
        <Rect x={64} y={100} width={20} height={11} rx={5.5} fill={palette.flame} stroke={palette.ink} strokeWidth={3} />
      </Svg>
    </Animated.View>
  );
}
