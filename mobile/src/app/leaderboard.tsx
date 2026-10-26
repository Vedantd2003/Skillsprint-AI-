import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { api } from '../api/client';
import { qk, useProfile } from '../api/hooks';
import { AppText, Card, Chip, PrimaryButton, Row, TextField } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState, errorMessage } from '../components/states';
import { useTheme } from '../theme/ThemeProvider';
import { palette, space } from '../theme/tokens';

interface Board {
  scope: string;
  entries: { rank: number; displayName: string; avatarSeed: string; level: number; xp: number; isMe: boolean }[];
  me: { xp: number; displayName: string };
}

const MEDAL = [palette.volt, '#C9D1E6', '#F2B48A'];

export default function Leaderboard() {
  const t = useTheme();
  const qc = useQueryClient();
  const profile = useProfile();
  const [scope, setScope] = useState<'weekly' | 'alltime' | 'friends'>('weekly');
  const [code, setCode] = useState('');
  const board = useQuery({ queryKey: qk.leaderboard(scope), queryFn: () => api.get<Board>(`/leaderboard?scope=${scope}&limit=50`) });
  const addFriend = useMutation({
    mutationFn: (friendCode: string) => api.post<{ displayName: string }>('/friends', { friendCode }),
    onSuccess: () => {
      setCode('');
      void qc.invalidateQueries({ queryKey: qk.leaderboard('friends') });
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        data={board.data?.entries ?? []}
        keyExtractor={(e) => `${e.rank}-${e.displayName}`}
        contentContainerStyle={{ padding: space.lg, gap: space.sm }}
        refreshing={board.isRefetching}
        onRefresh={() => void board.refetch()}
        ListHeaderComponent={
          <View style={{ gap: space.md, marginBottom: space.md }}>
            <Row>
              <Chip label="This week" selected={scope === 'weekly'} onPress={() => setScope('weekly')} />
              <Chip label="All time" selected={scope === 'alltime'} onPress={() => setScope('alltime')} />
              <Chip label="Friends" selected={scope === 'friends'} onPress={() => setScope('friends')} />
            </Row>
            <AppText variant="small" muted>
              Only display names and XP are shown. You can hide yourself in Settings.
            </AppText>
            {scope === 'friends' && (
              <Card style={{ gap: space.md }}>
                <AppText variant="smallBold">Your friend code: {profile.data?.friendCode ?? '…'}</AppText>
                <TextField label="Add a friend by code" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={12} />
                {addFriend.error && <AppText color={t.colors.danger}>{errorMessage(addFriend.error)}</AppText>}
                {addFriend.data && <AppText color={t.colors.success}>Added {addFriend.data.displayName}.</AppText>}
                <PrimaryButton title="Add friend" kind="secondary" loading={addFriend.isPending} disabled={code.length < 6} onPress={() => addFriend.mutate(code)} />
              </Card>
            )}
          </View>
        }
        ListEmptyComponent={
          board.isPending ? (
            <LoadingState lines={0} cards={4} />
          ) : board.error ? (
            <ErrorState error={board.error} onRetry={() => void board.refetch()} />
          ) : (
            <EmptyState title="No XP yet this week" message="Finish a lesson to put yourself on the board." />
          )
        }
        renderItem={({ item }) => (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderColor: item.isMe ? t.colors.primary : t.colors.border, borderWidth: item.isMe ? 2 : 1 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: MEDAL[item.rank - 1] ?? t.colors.surfaceAlt, borderWidth: item.rank <= 3 ? 2 : 0, borderColor: palette.ink }}>
              <AppText variant="smallBold" color={item.rank <= 3 ? palette.ink : t.colors.text}>
                {item.rank}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold">
                {item.displayName}
                {item.isMe ? ' (you)' : ''}
              </AppText>
              <AppText variant="small" muted>
                Level {item.level}
              </AppText>
            </View>
            <AppText variant="subheading">{item.xp.toLocaleString()} XP</AppText>
          </Card>
        )}
      />
    </View>
  );
}
