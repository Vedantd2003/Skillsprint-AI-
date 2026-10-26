import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useProfile, useProgress } from '../../api/hooks';
import { ProgressBar, WeeklyChart, XPBadge } from '../../components/gamification';
import { Mascot } from '../../components/Mascot';
import { AppText, Card, Icon, Row, Screen, SectionHeader, type IconName } from '../../components/primitives';
import { ErrorState, LoadingState } from '../../components/states';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';

function Stat({ label, value, icon, color }: { label: string; value: string | number; icon: IconName; color: string }) {
  return (
    <Card style={{ flex: 1, minWidth: '45%', gap: 6 }}>
      <Icon name={icon} color={color} />
      <AppText variant="title">{value}</AppText>
      <AppText variant="small" muted>
        {label}
      </AppText>
    </Card>
  );
}

export default function ProfileTab() {
  const t = useTheme();
  const router = useRouter();
  const profile = useProfile();
  const progress = useProgress();

  if (profile.isPending || progress.isPending) return <Screen><LoadingState cards={4} label="Loading your stats" /></Screen>;
  if (profile.error || progress.error) {
    return <Screen><ErrorState error={profile.error ?? progress.error} onRetry={() => { void profile.refetch(); void progress.refetch(); }} /></Screen>;
  }
  const p = profile.data;
  const g = progress.data.gamification;

  return (
    <Screen refreshControl={<RefreshControl refreshing={progress.isRefetching} onRefresh={() => { void progress.refetch(); void profile.refetch(); }} />}>
      <Row style={{ paddingTop: space.md, justifyContent: 'space-between' }}>
        <AppText variant="title">Profile</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={12} onPress={() => router.push('/settings')}>
          <Icon name="settings" size={24} color={t.colors.text} />
        </Pressable>
      </Row>
      <Card style={{ marginTop: space.lg, flexDirection: 'row', gap: space.lg, alignItems: 'center' }} onPress={() => router.push('/settings')} accessibilityLabel="Open settings">
        <Mascot size={70} bounce={false} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">{p.displayName}</AppText>
          <AppText variant="small" muted>
            Level {g.level}, friend code {p.friendCode}
          </AppText>
          <XPBadge xp={g.totalXp} compact />
        </View>
      </Card>

      <View style={{ marginTop: space.md, gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="smallBold">Level {g.level}</AppText>
          <AppText variant="small" muted>
            {g.currentLevelXp}/{g.nextLevelXp} XP
          </AppText>
        </Row>
        <ProgressBar value={g.currentLevelXp / g.nextLevelXp} accessibilityLabel="Progress to next level" />
      </View>

      <Row style={{ flexWrap: 'wrap', marginTop: space.lg }} gap={space.md}>
        <Stat label="Current streak" value={g.streak.current} icon="zap" color={t.colors.streak} />
        <Stat label="Longest streak" value={g.streak.longest} icon="trending-up" color={t.colors.streak} />
        <Stat label="Lessons completed" value={g.stats.lessonsCompleted} icon="check-circle" color={t.colors.success} />
        <Stat label="Overall accuracy" value={progress.data.accuracy === null ? '–' : `${Math.round(progress.data.accuracy * 100)}%`} icon="target" color={t.colors.primary} />
      </Row>

      <SectionHeader title="This week" />
      <Card style={{ gap: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <AppText variant="bodyBold">{g.weekly.xp} XP</AppText>
          <AppText variant="small" muted>
            Weekly goal {g.weekly.goal} XP
          </AppText>
        </Row>
        <WeeklyChart days={g.weekly.days} goal={g.daily.goal} />
      </Card>

      <SectionHeader title="Courses" />
      <View style={{ gap: space.md }}>
        {progress.data.courses.length === 0 ? (
          <AppText muted>Start a lesson and your course progress will show here.</AppText>
        ) : (
          progress.data.courses.map((c) => (
            <Card key={c.id} onPress={() => router.push(`/course/${c.id}`)} style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="bodyBold" style={{ flex: 1 }}>
                  {c.title}
                </AppText>
                <AppText variant="smallBold" muted>
                  {c.percent}%
                </AppText>
              </Row>
              <ProgressBar value={c.percent / 100} color={c.color} height={8} />
            </Card>
          ))
        )}
      </View>

      <SectionHeader title="Accuracy by topic" />
      <Card style={{ gap: space.md }}>
        {progress.data.topicAccuracy.length === 0 ? (
          <AppText muted>Answer a few questions to see where you're strong.</AppText>
        ) : (
          progress.data.topicAccuracy.slice(0, 8).map((tp) => (
            <View key={tp.topic} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="small" style={{ flex: 1 }}>
                  {tp.topic}
                </AppText>
                <AppText variant="smallBold" color={tp.accuracy < 0.6 ? t.colors.danger : tp.accuracy < 0.8 ? t.colors.streak : t.colors.success}>
                  {Math.round(tp.accuracy * 100)}%
                </AppText>
              </Row>
              <ProgressBar value={tp.accuracy} height={6} color={tp.accuracy < 0.6 ? t.colors.danger : tp.accuracy < 0.8 ? t.colors.streak : t.colors.success} />
            </View>
          ))
        )}
      </Card>

      <SectionHeader title="More" />
      <View style={{ gap: space.md }}>
        {(
          [
            ['Leaderboard', 'bar-chart', '/leaderboard'],
            ['Achievements', 'award', '/achievements'],
            ['Study plan', 'calendar', '/study-plan'],
            ['Revision', 'repeat', '/revision'],
            ['Settings', 'settings', '/settings'],
          ] as const
        ).map(([label, icon, href]) => (
          <Card key={href} onPress={() => router.push(href)} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Icon name={icon} color={t.colors.primary} />
            <AppText variant="bodyBold" style={{ flex: 1 }}>
              {label}
            </AppText>
            {href === '/revision' && progress.data.revision.due > 0 && (
              <AppText variant="smallBold" color={t.colors.streak}>
                {progress.data.revision.due} due
              </AppText>
            )}
            <Icon name="chevron-right" color={t.colors.textMuted} />
          </Card>
        ))}
      </View>
    </Screen>
  );
}
