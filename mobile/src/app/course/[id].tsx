import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useCoursePath, useEnroll, useProfile } from '../../api/hooks';
import { LessonCard } from '../../components/cards';
import { ProgressBar } from '../../components/gamification';
import { AppText, Card, Icon, PrimaryButton, Row, Screen, SectionHeader, type IconName } from '../../components/primitives';
import { ErrorState, LoadingState } from '../../components/states';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';

export default function CourseDetail() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const path = useCoursePath(id);
  const profile = useProfile();
  const enroll = useEnroll();

  if (path.isPending) return <Screen edges={[]}><LoadingState cards={4} /></Screen>;
  if (path.error) return <Screen edges={[]}><ErrorState error={path.error} onRetry={() => void path.refetch()} /></Screen>;
  const { course, units, totals, nextLesson } = path.data;
  const isCurrent = profile.data?.currentCourseId === course.id;

  const start = async () => {
    if (!isCurrent) await enroll.mutateAsync(course.id);
    if (nextLesson) router.push(`/lesson/${nextLesson.id}`);
    else router.push('/(tabs)/learn');
  };

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: course.title }} />
      <Card style={{ marginTop: space.md, gap: space.md, backgroundColor: course.color, borderColor: t.colors.shadowBlock, borderWidth: 3 }}>
        <Row>
          <Icon name={(course.icon as IconName) || 'book'} color="#fff" size={26} />
          <AppText variant="small" color="#fff">
            {course.level}, about {course.estimatedHours} hours
          </AppText>
        </Row>
        <AppText variant="title" color="#fff">
          {course.title}
        </AppText>
        <AppText color="#fff">{course.description}</AppText>
        <ProgressBar value={totals.lessons ? totals.completed / totals.lessons : 0} color="#fff" track="rgba(255,255,255,0.3)" />
        <AppText variant="smallBold" color="#fff">
          {totals.completed} of {totals.lessons} lessons complete
        </AppText>
      </Card>

      <View style={{ marginTop: space.lg, gap: space.sm }}>
        <PrimaryButton
          testID="start-course"
          title={isCurrent ? (nextLesson ? `Continue: ${nextLesson.title}` : 'Review the course') : 'Start this course'}
          icon="play"
          loading={enroll.isPending}
          onPress={() => void start()}
        />
        {!isCurrent && (
          <AppText variant="small" muted style={{ textAlign: 'center' }}>
            This becomes your current course on Home. Progress in other courses is kept.
          </AppText>
        )}
      </View>

      {course.objectives.length > 0 && (
        <>
          <SectionHeader title="What you'll learn" />
          <Card style={{ gap: space.sm }}>
            {course.objectives.map((o) => (
              <Row key={o} align="flex-start">
                <Icon name="check" size={18} color={t.colors.success} />
                <AppText style={{ flex: 1 }}>{o}</AppText>
              </Row>
            ))}
          </Card>
        </>
      )}

      {units.map((u, i) => (
        <View key={u.id}>
          <SectionHeader title={`Unit ${i + 1}: ${u.title}`} />
          <View style={{ gap: space.sm }}>
            {u.lessons.map((l) => (
              <LessonCard key={l.id} lesson={l} onPress={() => router.push(`/lesson/${l.id}`)} />
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
