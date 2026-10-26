import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, View } from 'react-native';
import { useCoursePath, useProfile } from '../../api/hooks';
import type { PathLesson } from '../../api/types';
import { ProgressBar } from '../../components/gamification';
import { AppText, Icon, PrimaryButton, Row, Screen } from '../../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { UnitTrack } from '../../components/TrackPath';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';

/** The gamified learning map for the learner's current course. */
export default function Learn() {
  const t = useTheme();
  const router = useRouter();
  const profile = useProfile();
  const path = useCoursePath(profile.data?.currentCourseId);
  const [selected, setSelected] = useState<PathLesson | null>(null);

  if (profile.isPending) return <Screen><LoadingState /></Screen>;
  if (profile.error) return <Screen><ErrorState error={profile.error} onRetry={() => void profile.refetch()} /></Screen>;
  if (!profile.data.currentCourseId) {
    return (
      <Screen>
        <EmptyState title="No course yet" message="Pick a course to see your learning path." action="Browse courses" onAction={() => router.push('/catalog')} />
      </Screen>
    );
  }
  if (path.isPending) return <Screen><LoadingState cards={4} label="Loading learning path" /></Screen>;
  if (path.error) return <Screen><ErrorState error={path.error} onRetry={() => void path.refetch()} /></Screen>;

  const { course, units, totals, nextLesson } = path.data;

  const onLessonPress = (l: PathLesson) => {
    if (l.status === 'locked') {
      Alert.alert('Locked', 'Finish the earlier lessons on the track to unlock this one.');
      return;
    }
    setSelected(l);
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={path.isRefetching} onRefresh={() => void path.refetch()} />}>
      <Pressable accessibilityRole="button" accessibilityLabel="Change course" onPress={() => router.push('/catalog')} style={{ paddingTop: space.md, paddingBottom: space.lg }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <AppText variant="small" muted>
              Your course
            </AppText>
            <AppText variant="title">{course.title}</AppText>
          </View>
          <Row gap={4}>
            <AppText variant="smallBold" color={t.colors.primary}>
              Change
            </AppText>
            <Icon name="chevron-down" size={18} color={t.colors.primary} />
          </Row>
        </Row>
        <Row style={{ marginTop: space.md }}>
          <ProgressBar value={totals.lessons ? totals.completed / totals.lessons : 0} color={course.color} style={{ flex: 1 }} />
          <AppText variant="smallBold" muted>
            {totals.completed}/{totals.lessons}
          </AppText>
        </Row>
      </Pressable>

      {units.map((u, i) => (
        <UnitTrack key={u.id} unit={u} index={i} currentLessonId={nextLesson?.id} onLessonPress={onLessonPress} />
      ))}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(10,12,30,0.55)', justifyContent: 'flex-end' }} onPress={() => setSelected(null)}>
          {selected && (
            <Pressable style={{ backgroundColor: t.colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space.xl, gap: space.md }}>
              <AppText variant="small" muted>
                {selected.kind === 'checkpoint' ? 'Checkpoint: score 70% to pass' : selected.topic}
              </AppText>
              <AppText variant="title">{selected.title}</AppText>
              <AppText muted>{selected.summary}</AppText>
              <Row>
                <Icon name="zap" size={16} color={t.colors.primary} />
                <AppText variant="smallBold">
                  {selected.status === 'completed' ? `Completed, best score ${Math.round(selected.bestScore * 100)}%. Replays earn practice XP.` : `${selected.xpReward} XP on completion`}
                </AppText>
              </Row>
              <PrimaryButton
                testID="start-lesson"
                title={selected.status === 'completed' ? 'Practise again' : selected.status === 'started' ? 'Continue lesson' : 'Start lesson'}
                icon="play"
                onPress={() => {
                  const id = selected.id;
                  setSelected(null);
                  router.push(`/lesson/${id}`);
                }}
              />
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </Screen>
  );
}
