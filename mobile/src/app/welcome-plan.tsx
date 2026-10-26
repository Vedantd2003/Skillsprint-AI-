import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';
import { api } from '../api/client';
import { qk, useCourses, useProfile } from '../api/hooks';
import { CourseCard } from '../components/cards';
import { Mascot } from '../components/Mascot';
import { AppText, Card, Icon, PrimaryButton, Row, Screen } from '../components/primitives';
import { ErrorState, LoadingState } from '../components/states';
import { scheduleDailyReminder } from '../lib/notifications';
import { useAuth } from '../store/auth';
import { GOALS } from '../store/onboarding';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

/** Initial personalised learning plan shown right after sign-up. */
export default function WelcomePlan() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const markOnboarded = useAuth((s) => s.markOnboarded);
  const profile = useProfile();
  const courses = useCourses();
  const [reminders, setReminders] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recommended = useMemo(() => {
    const goal = GOALS.find((g) => g.id === (profile.data?.interests?.[0] ?? profile.data?.learningGoal));
    const list = courses.data ?? [];
    const primary = list.find((c) => c.slug === goal?.course) ?? list[0];
    const extra = list.filter((c) => c.id !== primary?.id && profile.data?.interests?.some((i) => c.tracks.includes(GOALS.find((g) => g.id === i)?.track ?? ''))).slice(0, 2);
    return { primary, extra };
  }, [courses.data, profile.data]);

  if (profile.isPending || courses.isPending) return <Screen><LoadingState /></Screen>;
  if (profile.error || courses.error) return <Screen><ErrorState error={profile.error ?? courses.error} onRetry={() => { void profile.refetch(); void courses.refetch(); }} /></Screen>;

  const start = async () => {
    if (!recommended.primary) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/courses/${recommended.primary.id}/enroll`);
      const notifications = { remindersEnabled: reminders, reminderHour: 19, reminderMinute: 0 };
      await api.patch('/profile/me', { onboardingComplete: true, notifications });
      if (reminders) await scheduleDailyReminder(19, 0).catch(() => false);
      // Refresh cached profile/progress so Home and Learn see the new current course.
      await Promise.all([qc.invalidateQueries({ queryKey: qk.profile }), qc.invalidateQueries({ queryKey: qk.progress })]);
      markOnboarded();
      router.replace('/(tabs)/learn');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your plan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: space.lg, paddingTop: space.xl }}>
        <Row gap={space.md}>
          <Mascot size={80} mood="cheer" />
          <View style={{ flex: 1 }}>
            <AppText variant="title">Your plan is ready, {profile.data?.displayName}</AppText>
          </View>
        </Row>
        <Card style={{ gap: space.md }}>
          <Row>
            <Icon name="target" color={t.colors.primary} />
            <AppText variant="bodyBold">{profile.data?.dailyXpGoal} XP a day</AppText>
          </Row>
          <Row>
            <Icon name="bar-chart-2" color={t.colors.primary} />
            <AppText variant="bodyBold">Starting level: {profile.data?.skillLevel}</AppText>
          </Row>
          <Row>
            <Icon name="message-circle" color={t.colors.primary} />
            <AppText variant="bodyBold">Tutor language: {({ en: 'English', hi: 'Hindi', mr: 'Marathi' } as Record<string, string>)[profile.data?.tutorLanguage ?? 'en'] ?? 'English'}</AppText>
          </Row>
        </Card>
        <AppText variant="heading">Start here</AppText>
        {recommended.primary && <CourseCard course={recommended.primary} onPress={start} />}
        {recommended.extra.length > 0 && (
          <>
            <AppText variant="subheading">Also good for your goals</AppText>
            {recommended.extra.map((c) => (
              <CourseCard key={c.id} course={c} compact onPress={() => router.push(`/course/${c.id}`)} />
            ))}
          </>
        )}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Daily reminder at 7 PM</AppText>
            <AppText variant="small" muted>
              A gentle nudge to keep your streak. Change the time in Settings.
            </AppText>
          </View>
          <Switch accessibilityLabel="Daily reminder" value={reminders} onValueChange={setReminders} trackColor={{ true: t.colors.primary }} />
        </Card>
        {error && <AppText color={t.colors.danger}>{error}</AppText>}
        <PrimaryButton testID="start-plan" title="Start my first lesson" loading={busy} onPress={start} />
      </View>
    </Screen>
  );
}
