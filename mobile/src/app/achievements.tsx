import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { FlatList, View } from 'react-native';
import { api } from '../api/client';
import { qk } from '../api/hooks';
import { AchievementCard } from '../components/gamification';
import { AppText } from '../components/primitives';
import { ErrorState, LoadingState } from '../components/states';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

interface Item {
  code: string;
  title: string;
  description: string;
  icon: string;
  threshold: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export default function Achievements() {
  const t = useTheme();
  const q = useQuery({ queryKey: qk.achievements, queryFn: () => api.get<Item[]>('/achievements') });
  const items = [...(q.data ?? [])].sort((a, b) => Number(b.unlocked) - Number(a.unlocked));
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        data={items}
        keyExtractor={(a) => a.code}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        ListHeaderComponent={
          q.data ? (
            <AppText muted style={{ marginBottom: space.sm }}>
              {q.data.filter((a) => a.unlocked).length} of {q.data.length} unlocked
            </AppText>
          ) : undefined
        }
        ListEmptyComponent={q.isPending ? <LoadingState lines={0} cards={5} /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : undefined}
        renderItem={({ item }) => <AchievementCard achievement={item} unlocked={item.unlocked} progress={item.progress} threshold={item.threshold} />}
      />
    </View>
  );
}
