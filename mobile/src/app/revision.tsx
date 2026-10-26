import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { api } from '../api/client';
import { qk, useInvalidateProgress, useWeakTopics } from '../api/hooks';
import type { Question, RevisionItem } from '../api/types';
import { HeartCounter, ProgressBar } from '../components/gamification';
import { Mascot } from '../components/Mascot';
import { AppText, Card, Chip, PrimaryButton, Row, Screen, SectionHeader } from '../components/primitives';
import { AnswerFeedback, QuestionRenderer } from '../components/question';
import { EmptyState, ErrorState, LoadingState, errorMessage } from '../components/states';
import { emptyDraft, isReady, toAnswer, type Draft } from '../lesson/answers';
import { cue } from '../lib/feedback';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

interface DueResponse {
  dueCount: number;
  nextDueAt: string | null;
  items: RevisionItem[];
}
interface RevisionResult {
  correct: boolean;
  correctAnswer: string;
  explanation: string;
  nextDueAt: string | null;
  mastered: boolean;
  hearts: number;
  xpEarned: number;
}

/** Spaced-repetition review built from the learner's real mistakes. */
export default function Revision() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ topic?: string }>();
  const [topic, setTopic] = useState<string | null>(params.topic ?? null);
  const invalidate = useInvalidateProgress();
  const weak = useWeakTopics();

  const due = useQuery({
    queryKey: [...qk.revisionDue, topic ?? 'due'],
    queryFn: async (): Promise<{ questions: Question[]; dueCount: number; nextDueAt: string | null }> => {
      if (topic) {
        const r = await api.get<{ questions: Question[] }>(`/revision/practice?topic=${encodeURIComponent(topic)}`);
        return { questions: r.questions, dueCount: r.questions.length, nextDueAt: null };
      }
      const r = await api.get<DueResponse>('/revision/due?limit=10');
      return { questions: r.items.map((i) => i.question), dueCount: r.dueCount, nextDueAt: r.nextDueAt };
    },
    staleTime: 0,
  });

  const [index, setIndex] = useState(0);
  const [draftState, setDraftState] = useState<{ qid: string; draft: Draft } | null>(null);
  const [result, setResult] = useState<RevisionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, done: 0, xp: 0 });
  const [hearts, setHearts] = useState<number | null>(null);

  const questions = due.data?.questions ?? [];
  const q = questions[index];
  const draft: Draft | null = q ? (draftState?.qid === q.id ? draftState.draft : emptyDraft(q)) : null;
  const setDraft = (d: Draft) => q && setDraftState({ qid: q.id, draft: d });

  const restart = (nextTopic: string | null = topic) => {
    setTopic(nextTopic);
    setIndex(0);
    setResult(null);
    setScore({ correct: 0, done: 0, xp: 0 });
    if (nextTopic === topic) void due.refetch();
  };

  const submit = async (override?: Draft) => {
    const d = override ?? draft;
    if (!q || !d || !isReady(q, d)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<RevisionResult>('/revision/submit', { questionId: q.id, answer: toAnswer(q, d) });
      cue(r.correct ? 'correct' : 'wrong');
      setResult(r);
      setHearts(r.hearts);
      setScore((s) => ({ correct: s.correct + (r.correct ? 1 : 0), done: s.done + 1, xp: s.xp + r.xpEarned }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setResult(null);
    setIndex((i) => i + 1);
    if (index + 1 >= questions.length) void invalidate();
  };

  if (due.isPending) return <Screen edges={[]}><LoadingState label="Loading revision" /></Screen>;
  if (due.error) return <Screen edges={[]}><ErrorState error={due.error} onRetry={() => void due.refetch()} /></Screen>;

  const weakTopics = weak.data?.topics ?? [];

  if (!questions.length || index >= questions.length) {
    const finished = questions.length > 0;
    return (
      <Screen edges={[]}>
        {finished ? (
          <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xl }}>
            <Mascot size={110} mood="cheer" />
            <AppText variant="title">Review done</AppText>
            <AppText muted>
              {score.correct} of {score.done} correct{score.xp ? `, +${score.xp} XP` : ''}. Items you got right come back later; misses return sooner.
            </AppText>
            <PrimaryButton title="Check for more" kind="secondary" onPress={() => restart()} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : (
          <EmptyState
            title={topic ? 'No practice questions yet' : 'Nothing due right now'}
            message={
              due.data.nextDueAt
                ? `Your next review is due ${new Date(due.data.nextDueAt).toLocaleString()}.`
                : 'Questions you miss in lessons appear here for spaced review.'
            }
            action="Go to my path"
            onAction={() => router.replace('/(tabs)/learn')}
          />
        )}
        {weakTopics.length > 0 && (
          <>
            <SectionHeader title="Practise a weak topic" />
            <AppText variant="small" muted style={{ marginBottom: space.md }}>
              Based on your real answers.
            </AppText>
            <View style={{ gap: space.md }}>
              {weakTopics.map((w) => (
                <Card key={w.topic} onPress={() => restart(w.topic)} style={{ gap: space.sm }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <AppText variant="bodyBold" style={{ flex: 1 }}>
                      {w.topic}
                    </AppText>
                    <AppText variant="smallBold" color={t.colors.danger}>
                      {Math.round(w.accuracy * 100)}%
                    </AppText>
                  </Row>
                  <ProgressBar value={w.accuracy} height={6} color={t.colors.danger} />
                  {w.repeatedMistakes > 0 && (
                    <AppText variant="tiny" muted>
                      {w.repeatedMistakes} repeated mistake{w.repeatedMistakes > 1 ? 's' : ''}
                    </AppText>
                  )}
                </Card>
              ))}
            </View>
          </>
        )}
        {topic && <PrimaryButton title="Back to due reviews" kind="ghost" onPress={() => restart(null)} />}
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Screen edges={[]}>
        <Row style={{ paddingVertical: space.md }} gap={space.md}>
          <ProgressBar value={index / questions.length} style={{ flex: 1 }} accessibilityLabel="Revision progress" />
          {hearts !== null && <HeartCounter hearts={hearts} />}
        </Row>
        <Row style={{ marginBottom: space.md, flexWrap: 'wrap' }}>
          <Chip label={topic ? `Topic: ${topic}` : `${due.data.dueCount} due`} selected />
          <AppText variant="small" muted>
            Correct answers earn hearts back.
          </AppText>
        </Row>
        {q && draft && (
          <QuestionRenderer
            key={q.id}
            question={q}
            draft={draft}
            onChange={setDraft}
            disabled={!!result || busy}
            reveal={result ? { correct: result.correct } : null}
            onFlashAnswer={(knew) => {
              const d: Draft = { kind: 'flash', flipped: true, value: knew };
              setDraft(d);
              void submit(d);
            }}
          />
        )}
        {error && <AppText color={t.colors.danger}>{error}</AppText>}
      </Screen>
      {result ? (
        <AnswerFeedback correct={result.correct} correctAnswer={result.correctAnswer} explanation={result.mastered ? `${result.explanation} You've mastered this one!` : result.explanation} onContinue={next} />
      ) : (
        q?.type !== 'flashcard' && (
          <View style={{ padding: space.lg, borderTopWidth: 1, borderColor: t.colors.border }}>
            <PrimaryButton title="Check" loading={busy} disabled={!q || !draft || !isReady(q, draft)} onPress={() => void submit()} />
          </View>
        )
      )}
    </View>
  );
}
