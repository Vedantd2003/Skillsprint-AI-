import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { PathLesson, PathUnit } from '../api/types';
import { tap } from '../lib/feedback';
import { usePrefs } from '../store/prefs';
import { useTheme } from '../theme/ThemeProvider';
import { palette, radius, space } from '../theme/tokens';
import { AppText, Icon, Row } from './primitives';

const NODE = 68;
const STEP = 108;
/** Lane swings like a running track bend: centre → right → centre → left. */
const SWING = [0.5, 0.74, 0.5, 0.26];

function nodePositions(count: number, width: number) {
  return Array.from({ length: count }, (_, i) => ({ x: SWING[i % SWING.length]! * width, y: NODE / 2 + 40 + i * STEP }));
}

function lanePath(points: { x: number; y: number }[]) {
  if (!points.length) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const my = (a.y + b.y) / 2;
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  }
  return d;
}

function PulseRing({ color }: { color: string }) {
  const animations = usePrefs((s) => s.animations);
  const s = useSharedValue(1);
  useEffect(() => {
    if (animations) s.value = withRepeat(withTiming(1.22, { duration: 900 }), -1, true);
  }, [animations, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: 2 - s.value * 1.3 }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: NODE + 14, height: NODE + 14, left: -7, top: -7, borderRadius: (NODE + 14) / 2, borderWidth: 4, borderColor: color }, style]}
    />
  );
}

function LessonNode({ lesson, current, onPress }: { lesson: PathLesson; current: boolean; onPress: (l: PathLesson) => void }) {
  const t = useTheme();
  const locked = lesson.status === 'locked';
  const done = lesson.status === 'completed';
  const checkpoint = lesson.kind === 'checkpoint';
  const bg = locked ? t.colors.surfaceAlt : done ? t.colors.success : checkpoint ? palette.flame : t.colors.primary;
  const icon = locked ? 'lock' : done ? 'check' : checkpoint ? 'flag' : lesson.kind === 'review' ? 'repeat' : lesson.status === 'started' ? 'play-circle' : 'play';
  return (
    <Pressable
      testID={`node-${lesson.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${checkpoint ? 'Checkpoint: ' : ''}${lesson.title}. ${locked ? 'Locked' : done ? 'Completed' : lesson.status === 'started' ? 'In progress' : 'Ready to start'}`}
      accessibilityState={{ disabled: locked }}
      onPress={() => {
        tap();
        onPress(lesson);
      }}
      style={({ pressed }) => ({ width: NODE, height: NODE + 6, transform: [{ translateY: pressed && !locked ? 4 : 0 }] })}
    >
      {current && <PulseRing color={t.colors.primary} />}
      <View style={{ position: 'absolute', top: 6, width: NODE, height: NODE, borderRadius: checkpoint ? 20 : NODE / 2, backgroundColor: locked ? t.colors.border : t.colors.shadowBlock }} />
      <View
        style={{
          width: NODE,
          height: NODE,
          borderRadius: checkpoint ? 20 : NODE / 2,
          backgroundColor: bg,
          borderWidth: 3,
          borderColor: locked ? t.colors.border : t.colors.shadowBlock,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={26} color={locked ? t.colors.locked : '#fff'} />
      </View>
    </Pressable>
  );
}

export function UnitTrack({ unit, index, currentLessonId, onLessonPress }: { unit: PathUnit; index: number; currentLessonId?: string; onLessonPress: (l: PathLesson) => void }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const pts = nodePositions(unit.lessons.length, width);
  const height = unit.lessons.length ? pts[pts.length - 1]!.y + NODE / 2 + 30 : 0;
  const unitColor = unit.completed ? t.colors.success : t.colors.primary;
  return (
    <View style={{ marginBottom: space.xl }}>
      <View
        style={{
          backgroundColor: unitColor,
          borderRadius: radius.card,
          borderWidth: 3,
          borderColor: t.colors.shadowBlock,
          padding: space.lg,
          gap: 4,
          marginBottom: space.lg,
        }}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="smallBold" color="#E6EBFF">
            Unit {index + 1}
          </AppText>
          <AppText variant="smallBold" color="#fff">
            {unit.completedLessons}/{unit.totalLessons} {unit.completed ? '✓' : ''}
          </AppText>
        </Row>
        <AppText variant="heading" color="#fff">
          {unit.title}
        </AppText>
        <AppText variant="small" color="#E6EBFF">
          {unit.description}
        </AppText>
        {!unit.completed && (
          <AppText variant="tiny" color={palette.volt} style={{ marginTop: 4 }}>
            Finish the unit for +{unit.rewardXp} bonus XP
          </AppText>
        )}
      </View>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 && (
          <>
            <Svg width={width} height={height} style={{ position: 'absolute' }}>
              <Path d={lanePath(pts)} stroke={t.colors.track} strokeWidth={22} fill="none" strokeLinecap="round" />
              <Path d={lanePath(pts)} stroke={t.colors.bg} strokeWidth={2.5} strokeDasharray="10 12" fill="none" strokeLinecap="round" />
            </Svg>
            {unit.lessons.map((l, i) => {
              const p = pts[i]!;
              const current = l.id === currentLessonId;
              const labelLeft = p.x > width / 2;
              return (
                <View key={l.id} style={{ position: 'absolute', left: p.x - NODE / 2, top: p.y - NODE / 2 }}>
                  {current && (
                    <View
                      style={{
                        position: 'absolute',
                        bottom: NODE + 14,
                        left: -26,
                        width: NODE + 52,
                        alignItems: 'center',
                        backgroundColor: t.colors.surface,
                        borderWidth: 2,
                        borderColor: t.colors.primary,
                        borderRadius: 12,
                        paddingVertical: 4,
                      }}
                    >
                      <AppText variant="tiny" color={t.colors.primary}>
                        {l.status === 'started' ? 'Continue' : 'Start'}
                      </AppText>
                    </View>
                  )}
                  <LessonNode lesson={l} current={current} onPress={onLessonPress} />
                  <View
                    style={{
                      position: 'absolute',
                      top: NODE / 2 - 14,
                      width: Math.max(80, width * 0.3),
                      ...(labelLeft ? { right: NODE + 10 } : { left: NODE + 10 }),
                    }}
                  >
                    <AppText variant="smallBold" numberOfLines={2} style={{ textAlign: labelLeft ? 'right' : 'left' }} muted={l.status === 'locked'}>
                      {l.title}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </View>
    </View>
  );
}
