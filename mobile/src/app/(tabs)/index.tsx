import { useRouter } from 'expo-router';
import React from 'react';
import { RefreshControl, View } from 'react-native';
import { useCoursePath, useGamification, useProfile, useWeakTopics } from '../../api/hooks';
import { AchievementCard, HeartCounter, ProgressBar, StreakIndicator, XPBadge } from '../../components/gamification';
import { Mascot } from '../../components/Mascot';
import { AppText, Card, Icon, PrimaryButton, Row, Screen, SectionHeader } from '../../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { useTheme } from '../../theme/ThemeProvider';
import { palette, radius, space } from '../../theme/tokens';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const profile = useProfile();
  const g = useGamification();
  const path = useCoursePath(profile.data?.currentCourseId);
  const weak = useWeakTopics();

  const refreshing = profile.isRefetching || g.isRefetching;
  const refresh = () => {
    void profile.refetch();
    void g.refetch();
    void path.refetch();
    void weak.refetch();
  };

  if (profile.isPending || g.isPending) return <Screen><LoadingState cards={3} label="Loading your dashboard" /></Screen>;
  if (profile.error || g.error) return <Screen><ErrorState error={profile.error ?? g.error} onRetry={refresh} /></Screen>;

  const p = profile.data;
  const s = g.data;
  const next = path.data?.nextLesson;
  const dailyPct = s.daily.goal ? s.daily.xp / s.daily.goal : 0;
  const firstWeak = weak.data?.topics[0];

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Row style={{ justifyContent: 'space-between', paddingTop: space.md }}>
        <StreakIndicator days={s.streak.current} activeToday={s.streak.activeToday} />
        <Row gap={space.sm}>
          <HeartCounter hearts={s.hearts.current} max={s.hearts.max} />
          <XPBadge xp={s.totalXp} compact />
        </Row>
      </Row>

      <Row style={{ marginTop: space.xl }} gap={space.md} align="flex-end">
        <View style={{ flex: 1, gap: 4 }}>
          <AppText muted>{greeting()},</AppText>
          <AppText variant="display" numberOfLines={1} adjustsFontSizeToFit>
            {p.displayName}
          </AppText>
          <AppText variant="small" muted>
            Level {s.level}, {s.xpToNextLevel} XP to level {s.level + 1}
          </AppText>
        </View>
        <Mascot size={86} mood={s.daily.met ? 'cheer' : s.streak.atRisk ? 'think' : 'happy'} />
      </Row>

      {/* Daily goal — the "lap" for today */}
      <Card style={{ marginTop: space.lg, gap: space.md, backgroundColor: t.colors.primary, borderColor: t.colors.shadowBlock, borderWidth: 3 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="subheading" color="#fff">
            {s.daily.met ? 'Daily goal reached' : "Today's goal"}
          </AppText>
          <AppText variant="smallBold" color={palette.volt}>
            {s.daily.xp} / {s.daily.goal} XP
          </AppText>
        </Row>
        <ProgressBar value={dailyPct} color={palette.volt} track="rgba(255,255,255,0.22)" height={14} accessibilityLabel="Daily XP goal" />
        {s.streak.atRisk && (
          <AppText variant="small" color="#fff">
            Finish one lesson today to keep your {s.streak.current}-day streak.
          </AppText>
        )}
      </Card>

      <SectionHeader title="Continue learning" action="All courses" onAction={() => router.push('/catalog')} />
      {!p.currentCourseId ? (
        <EmptyState title="Pick your first course" message="Choose a course and we'll keep your place here." action="Browse courses" onAction={() => router.push('/catalog')} />
      ) : path.isPending ? (
        <LoadingState lines={1} cards={1} />
      ) : path.error ? (
        <ErrorState error={path.error} onRetry={() => void path.refetch()} />
      ) : (
        <Card style={{ gap: space.md }}>
          <Row>
            <View style={{ width: 10, height: 40, borderRadius: 5, backgroundColor: path.data.course.color }} />
            <View style={{ flex: 1 }}>
              <AppText variant="subheading">{path.data.course.title}</AppText>
              <AppText variant="small" muted>
                {path.data.totals.completed} of {path.data.totals.lessons} lessons done
              </AppText>
            </View>
          </Row>
          <ProgressBar value={path.data.totals.lessons ? path.data.totals.completed / path.data.totals.lessons : 0} color={path.data.course.color} height={8} />
          {next ? (
            <PrimaryButton testID="continue-learning" title={`Continue: ${next.title}`} icon="play" onPress={() => router.push(`/lesson/${next.id}`)} />
          ) : (
            <PrimaryButton title="Course complete — pick another" kind="secondary" onPress={() => router.push('/catalog')} />
          )}
        </Card>
      )}

      <SectionHeader title="Daily challenge" />
      <Card style={{ gap: space.sm, borderColor: s.challenge.completed ? t.colors.success : t.colors.border, borderWidth: s.challenge.completed ? 2 : 1 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row>
            <Icon name={s.challenge.completed ? 'check-circle' : 'award'} color={s.challenge.completed ? t.colors.success : t.colors.streak} />
            <AppText variant="subheading">{s.challenge.title}</AppText>
          </Row>
          <AppText variant="smallBold" color={t.colors.streak}>
            +{s.challenge.bonusXp} XP
          </AppText>
        </Row>
        <AppText muted>{s.challenge.description}</AppText>
        <Row>
          <ProgressBar value={s.challenge.progress / s.challenge.target} color={t.colors.streak} height={8} style={{ flex: 1 }} />
          <AppText variant="tiny" muted>
            {s.challenge.progress}/{s.challenge.target}
          </AppText>
        </Row>
      </Card>

      <SectionHeader title="Recommended for you" />
      <View style={{ gap: space.md }}>
        <Card onPress={() => router.push('/revision')} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }} accessibilityLabel="Review your mistakes">
          <View style={{ width: 44, height: 44, borderRadius: radius.button, backgroundColor: t.colors.streakSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="repeat" color={t.colors.streak} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Review mistakes</AppText>
            <AppText variant="small" muted>
              {firstWeak ? `Weakest topic: ${firstWeak.topic} (${Math.round(firstWeak.accuracy * 100)}%)` : 'Spaced repetition keeps what you learn.'}
            </AppText>
          </View>
          <Icon name="chevron-right" color={t.colors.textMuted} />
        </Card>
        <Card onPress={() => router.push('/(tabs)/academy')} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }} accessibilityLabel="Open the training academy">
          <View style={{ width: 44, height: 44, borderRadius: radius.button, backgroundColor: t.colors.successSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="briefcase" color={t.colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyBold">Training academy</AppText>
            <AppText variant="small" muted>
              Mock interviews, role-plays and coding drills.
            </AppText>
          </View>
          <Icon name="chevron-right" color={t.colors.textMuted} />
        </Card>
      </View>

      <Card onPress={() => router.push('/tutor/new')} style={{ marginTop: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.colors.primarySoft, borderColor: t.colors.primary }} accessibilityLabel="Ask the AI tutor">
        <Mascot size={56} bounce={false} mood="think" />
        <View style={{ flex: 1 }}>
          <AppText variant="subheading">Stuck on something?</AppText>
          <AppText variant="small" muted>
            Ask Dash, your AI tutor, in English, Hindi or Marathi.
          </AppText>
        </View>
        <Icon name="arrow-right" color={t.colors.primary} />
      </Card>

      {!!s.recentAchievements?.length && (
        <>
          <SectionHeader title="Recent achievements" action="See all" onAction={() => router.push('/achievements')} />
          <View style={{ gap: space.md }}>
            {s.recentAchievements.map((a) => (
              <AchievementCard key={a.code} achievement={a} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}
