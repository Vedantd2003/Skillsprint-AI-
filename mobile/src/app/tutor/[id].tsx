import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { qk, useProfile } from '../../api/hooks';
import type { ChatMessage } from '../../api/types';
import { AIChatBubble, TypingBubble } from '../../components/AIChatBubble';
import { Mascot } from '../../components/Mascot';
import { AppText, Chip, Icon, Row } from '../../components/primitives';
import { ErrorState, LoadingState, errorMessage } from '../../components/states';
import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type } from '../../theme/tokens';

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
];

interface ChatResponse {
  conversationId: string;
  userMessage: ChatMessage;
  reply: ChatMessage;
}

export default function TutorChat() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id: string; mode?: string; scenario?: string; prompt?: string; lessonId?: string }>();
  const profile = useProfile();
  const [conversationId, setConversationId] = useState<string | null>(params.id && params.id !== 'new' ? params.id : null);
  const [localMessages, setLocalMessages] = useState<ChatMessage[] | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const autoSent = useRef(false);
  const mode = (params.mode as 'tutor' | 'roleplay' | 'grammar' | undefined) ?? 'tutor';

  const existing = useQuery({
    queryKey: qk.conversation(conversationId ?? 'new'),
    enabled: !!conversationId && params.id !== 'new',
    queryFn: () => api.get<{ conversation: { title: string; mode: string; language: string }; messages: ChatMessage[] }>(`/ai/conversations/${conversationId}?limit=100`),
  });

  // Server history seeds the view; once the learner sends, local state takes over.
  const messages = localMessages ?? existing.data?.messages ?? [];
  const setMessages = (fn: (m: ChatMessage[]) => ChatMessage[]) => setLocalMessages((cur) => fn(cur ?? existing.data?.messages ?? []));
  const lang = language ?? existing.data?.conversation.language ?? profile.data?.tutorLanguage ?? 'en';

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || sending) return;
    setError(null);
    setInput('');
    const temp: ChatMessage = { id: `tmp-${Date.now()}`, role: 'user', content: message, createdAt: new Date().toISOString(), pending: true };
    setMessages((m) => [...m, temp]);
    setSending(true);
    try {
      const res = await api.post<ChatResponse>(
        '/ai/tutor/chat',
        {
          message,
          language: lang,
          ...(conversationId ? { conversationId } : { mode, ...(params.scenario ? { scenario: params.scenario } : {}), ...(params.lessonId ? { lessonId: params.lessonId } : {}) }),
        },
        { timeoutMs: 60_000 },
      );
      setConversationId(res.conversationId);
      setMessages((m) => [...m.filter((x) => x.id !== temp.id), res.userMessage, res.reply]);
      void qc.invalidateQueries({ queryKey: qk.conversations });
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setInput(message);
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (params.prompt && !autoSent.current && params.id === 'new' && profile.data) {
      autoSent.current = true;
      void send(params.prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.prompt, profile.data]);

  useEffect(() => {
    if (mode === 'roleplay' && params.id === 'new' && !params.prompt && !autoSent.current && profile.data) {
      autoSent.current = true;
      void send("Let's start the role-play. Please begin.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, profile.data]);

  const remove = () => {
    if (!conversationId) return router.back();
    const go = async () => {
      try {
        await api.delete(`/ai/conversations/${conversationId}`);
        void qc.invalidateQueries({ queryKey: qk.conversations });
        router.back();
      } catch (err) {
        setError(errorMessage(err));
      }
    };
    if (Platform.OS === 'web') return void go();
    Alert.alert('Delete this chat?', 'The conversation and its messages will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void go() },
    ]);
  };

  const title = mode === 'roleplay' ? 'Role-play' : mode === 'grammar' ? 'Grammar coach' : existing.data?.conversation.title ?? 'AI tutor';
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const topic = existing.data?.conversation.title ?? messages.find((m) => m.role === 'user')?.content ?? '';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['bottom']}>
      <Stack.Screen
        options={{
          title,
          headerRight: () =>
            conversationId ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Delete conversation" onPress={remove} hitSlop={12}>
                <Icon name="trash-2" size={20} color={t.colors.textMuted} />
              </Pressable>
            ) : null,
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.sm }}>
          {LANGS.map((l) => (
            <Chip key={l.code} label={l.label} selected={lang === l.code} onPress={() => setLanguage(l.code)} />
          ))}
        </Row>
        {existing.isPending && conversationId && params.id !== 'new' ? (
          <View style={{ padding: space.lg }}>
            <LoadingState label="Loading conversation" />
          </View>
        ) : existing.error ? (
          <View style={{ padding: space.lg }}>
            <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: space.lg, gap: space.md, flexGrow: 1 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xxl }}>
                <Mascot size={96} mood="happy" />
                <AppText variant="heading" style={{ textAlign: 'center' }}>
                  {mode === 'grammar' ? 'Send a sentence to check' : 'What do you want to learn?'}
                </AppText>
                <AppText muted style={{ textAlign: 'center', maxWidth: 300 }}>
                  {mode === 'grammar' ? "I'll correct it and explain each change." : "Ask about a concept, request an example, or say 'quiz me'."}
                </AppText>
              </View>
            }
            renderItem={({ item }) => <AIChatBubble message={item} />}
            ListFooterComponent={sending ? <View style={{ marginTop: space.md }}><TypingBubble /></View> : undefined}
          />
        )}

        {lastAssistant && !sending && mode === 'tutor' && (
          <Row style={{ paddingHorizontal: space.lg, flexWrap: 'wrap' }}>
            <Chip label="Quiz me on this" icon="check-square" onPress={() => router.push({ pathname: '/ai-quiz', params: { topic: topic.slice(0, 150) } })} />
            <Chip label="Another example" icon="plus" onPress={() => void send('Give me another example, please.')} />
            <Chip label="Summarise" icon="list" onPress={() => void send('Summarise the key points in 3 bullets.')} />
          </Row>
        )}

        {error && (
          <AppText variant="small" color={t.colors.danger} style={{ paddingHorizontal: space.lg, paddingTop: space.sm }} accessibilityRole="alert">
            {error}
          </AppText>
        )}
        <Row style={{ padding: space.md, gap: space.sm, borderTopWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface }} align="flex-end">
          <TextInput
            testID="chat-input"
            accessibilityLabel="Message the tutor"
            value={input}
            onChangeText={setInput}
            placeholder={mode === 'grammar' ? 'Type a sentence…' : 'Ask anything…'}
            placeholderTextColor={t.colors.textMuted}
            multiline
            maxLength={2000}
            style={[type.body, { flex: 1, minHeight: MIN_TOUCH, maxHeight: 140, borderRadius: radius.input, backgroundColor: t.colors.bg, color: t.colors.text, paddingHorizontal: space.md, paddingVertical: 12 }]}
          />
          <Pressable
            testID="chat-send"
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!input.trim() || sending}
            onPress={() => void send(input)}
            style={{ width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.button, backgroundColor: input.trim() && !sending ? t.colors.primary : t.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="send" color={input.trim() && !sending ? '#fff' : t.colors.textMuted} />
          </Pressable>
        </Row>
        <AppText variant="tiny" muted style={{ textAlign: 'center', paddingBottom: 6, backgroundColor: t.colors.surface }}>
          AI answers can be wrong. Chats are saved to your account.
        </AppText>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
