import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { FlatList, View } from 'react-native';
import { request } from '../../api/client';
import { qk, useAIStatus } from '../../api/hooks';
import { Mascot } from '../../components/Mascot';
import { AppText, Card, Chip, Icon, PrimaryButton, Row, Screen } from '../../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../components/states';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';

interface ConversationSummary {
  id: string;
  title: string;
  mode: string;
  messageCount: number;
  lastMessageAt: string;
}

const STARTERS = [
  "Explain React hooks like I'm a beginner and give me five practice questions.",
  'What is the difference between a list and a tuple in Python?',
  'मुझे RAG आसान भाषा में समझाइए',
  'Help me answer "Tell me about yourself" for a fresher role.',
];

const modeLabel: Record<string, string> = { tutor: 'Tutor', roleplay: 'Role-play', grammar: 'Grammar', interview: 'Interview' };

export default function TutorHome() {
  const t = useTheme();
  const router = useRouter();
  const status = useAIStatus();
  const list = useInfiniteQuery({
    queryKey: qk.conversations,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => request<ConversationSummary[]>(`/ai/conversations?page=${pageParam}&limit=20`),
    getNextPageParam: (last) => (last.meta && last.meta.page! < last.meta.totalPages! ? last.meta.page! + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];

  const header = (
    <View style={{ gap: space.lg, paddingTop: space.md, paddingBottom: space.lg }}>
      <Row gap={space.md}>
        <Mascot size={72} mood="think" />
        <View style={{ flex: 1 }}>
          <AppText variant="title">Ask Dash</AppText>
          <AppText muted>Your AI tutor. Explanations, examples and practice, in English, Hindi or Marathi.</AppText>
        </View>
      </Row>
      {status.data && !status.data.enabled && (
        <Card style={{ backgroundColor: t.colors.streakSoft, borderColor: t.colors.streak }}>
          <AppText variant="smallBold">The AI tutor isn't configured on this server yet. Lessons and revision still work.</AppText>
        </Card>
      )}
      <PrimaryButton testID="new-chat" title="New conversation" icon="plus" onPress={() => router.push('/tutor/new')} />
      <View style={{ gap: space.sm }}>
        <AppText variant="smallBold" muted>
          Try asking
        </AppText>
        <Row style={{ flexWrap: 'wrap' }}>
          {STARTERS.map((s) => (
            <Chip key={s} label={s.length > 42 ? `${s.slice(0, 40)}…` : s} onPress={() => router.push({ pathname: '/tutor/[id]', params: { id: 'new', prompt: s } })} />
          ))}
        </Row>
      </View>
      <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
        <AppText variant="heading">Recent chats</AppText>
        <AppText variant="tiny" muted>
          Stored so you can revisit them. Delete any time.
        </AppText>
      </Row>
    </View>
  );

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md }}
        ListHeaderComponent={header}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        onEndReachedThreshold={0.4}
        refreshing={list.isRefetching}
        onRefresh={() => void list.refetch()}
        ListEmptyComponent={
          list.isPending ? <LoadingState lines={0} cards={3} /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : <EmptyState title="No chats yet" message="Ask your first question — nothing is too basic." />
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/tutor/${item.id}`)} accessibilityLabel={item.title} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Icon name={item.mode === 'roleplay' ? 'users' : item.mode === 'grammar' ? 'edit-3' : 'message-circle'} color={t.colors.primary} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyBold" numberOfLines={1}>
                {item.title}
              </AppText>
              <AppText variant="small" muted>
                {modeLabel[item.mode] ?? item.mode}, {new Date(item.lastMessageAt).toLocaleDateString()}
              </AppText>
            </View>
            <Icon name="chevron-right" color={t.colors.textMuted} />
          </Card>
        )}
      />
    </Screen>
  );
}
