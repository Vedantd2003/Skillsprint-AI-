import React from 'react';
import { View } from 'react-native';
import type { CourseCard as CourseCardT, PathLesson } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';
import { ProgressBar } from './gamification';
import { AppText, Card, Icon, Row, type IconName } from './primitives';

const levelLabel: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

export function CourseCard({ course, onPress, compact }: { course: CourseCardT; onPress: () => void; compact?: boolean }) {
  return (
    <Card onPress={onPress} accessibilityLabel={`${course.title}, ${course.progress.percent}% complete`} style={{ gap: space.md, padding: 0, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', gap: space.md, padding: space.lg, paddingBottom: compact ? space.lg : 0 }}>
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: course.color, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={(course.icon as IconName) || 'book'} size={22} color="#fff" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="subheading" numberOfLines={2}>
            {course.title}
          </AppText>
          <AppText variant="small" muted>
            {levelLabel[course.level] ?? course.level}, about {course.estimatedHours} hours
          </AppText>
        </View>
      </View>
      {!compact && (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md }}>
          <AppText variant="small" muted numberOfLines={2}>
            {course.description}
          </AppText>
          <Row>
            <ProgressBar value={course.progress.percent / 100} height={8} color={course.color} style={{ flex: 1 }} />
            <AppText variant="tiny" muted>
              {course.progress.completedLessons}/{course.progress.totalLessons}
            </AppText>
          </Row>
        </View>
      )}
    </Card>
  );
}

const kindIcon: Record<PathLesson['kind'], IconName> = { lesson: 'play', checkpoint: 'flag', review: 'repeat' };

export function LessonCard({ lesson, onPress }: { lesson: PathLesson; onPress?: () => void }) {
  const t = useTheme();
  const locked = lesson.status === 'locked';
  return (
    <Card onPress={locked ? undefined : onPress} accessibilityLabel={`${lesson.title}, ${lesson.status}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: locked ? 0.6 : 1 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: locked ? t.colors.surfaceAlt : t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={locked ? 'lock' : lesson.status === 'completed' ? 'check' : kindIcon[lesson.kind]} color={locked ? t.colors.locked : t.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyBold" numberOfLines={1}>
          {lesson.title}
        </AppText>
        <AppText variant="small" muted numberOfLines={1}>
          {lesson.topic}
        </AppText>
      </View>
      <AppText variant="tiny" muted>
        {lesson.xpReward} XP
      </AppText>
    </Card>
  );
}
