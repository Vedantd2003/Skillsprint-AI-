import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { api } from '../api/client';
import { useInvalidateProgress } from '../api/hooks';
import type { AIQuiz } from '../api/types';
import { ProgressBar, XPBurst } from '../components/gamification';
import { Mascot } from '../components/Mascot';
import { AppText, Card, Chip, Icon, PrimaryButton, Row, Screen, TextField } from '../components/primitives';
import { QuizOption } from '../components/question';
import { ErrorState, LoadingState } from '../components/states';
import { cue } from '../lib/feedback';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

interface QuizResult {
  score: number;
  total: number;
  xpEarned: number;
  note: string;
  results: { questionId: string; correct: boolean; correctAnswer: number; correctOption: string; explanation: string; given: number | null }[];
}

/** AI-generated practice quiz. Answers are checked by the server, never on the device. */
export default function AIQuizScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ topic?: string; difficulty?: 'easy' | 'medium' | 'hard' }>();
  const invalidate = useInvalidateProgress();
  const [topic, setTopic] = useState(params.topic ?? '');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>(params.difficulty ?? 'easy');
  const [count, setCount] = useState(5);
  const [quiz, setQuiz] = useState<AIQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setAnswers({});
    setIndex(0);
    try {
      setQuiz(await api.post<AIQuiz>('/ai/quizzes/generate', { topic: topic.trim(), difficulty, count }, { timeoutMs: 60_000 }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!quiz) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<QuizResult>(`/ai/quizzes/${quiz.id}/submit`, { answers: Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer })) });
      cue('complete');
      setResult(r);
      void invalidate();
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !quiz) {
    return (
      <Screen edges={[]}>
        <View style={{ alignItems: 'center', paddingTop: space.xxl, gap: space.md }}>
          <Mascot size={100} mood="think" />
          <AppText variant="heading">Writing your quiz…</AppText>
          <AppText muted>Every question is checked before you see it.</AppText>
          <LoadingState lines={2} cards={1} />
        </View>
      </Screen>
    );
  }

  if (!quiz) {
    return (
      <Screen edges={[]}>
        <View style={{ gap: space.lg, paddingTop: space.md }}>
          <AppText variant="title">Generate a practice quiz</AppText>
          <TextField label="Topic" value={topic} onChangeText={setTopic} placeholder="e.g. JavaScript promises" maxLength={200} />
          <View style={{ gap: space.sm }}>
            <AppText variant="smallBold">Difficulty</AppText>
            <Row>
              {(['easy', 'medium', 'hard'] as const).map((d) => (
                <Chip key={d} label={d[0]!.toUpperCase() + d.slice(1)} selected={difficulty === d} onPress={() => setDifficulty(d)} />
              ))}
            </Row>
          </View>
          <View style={{ gap: space.sm }}>
            <AppText variant="smallBold">Questions</AppText>
            <Row>
              {[3, 5, 8, 10].map((n) => (
                <Chip key={n} label={String(n)} selected={count === n} onPress={() => setCount(n)} />
              ))}
            </Row>
          </View>
          {error ? <ErrorState error={error} onRetry={() => void generate()} /> : null}
          <PrimaryButton testID="generate-quiz" title="Generate quiz" icon="zap" disabled={topic.trim().length < 2} onPress={() => void generate()} />
          <AppText variant="small" muted>
            Quizzes are written by AI and haven't been reviewed by an educator. Answers are checked on the server.
          </AppText>
        </View>
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen edges={[]}>
        <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.lg }}>
          <Mascot size={100} mood={result.score / result.total >= 0.6 ? 'cheer' : 'think'} />
          <AppText variant="display">
            {result.score}/{result.total}
          </AppText>
          {result.xpEarned > 0 && <XPBurst xp={result.xpEarned} />}
        </View>
        <View style={{ gap: space.md, marginTop: space.lg }}>
          {quiz.questions.map((q, i) => {
            const r = result.results.find((x) => x.questionId === q.id)!;
            return (
              <Card key={q.id} style={{ gap: space.sm, borderColor: r.correct ? t.colors.success : t.colors.danger }}>
                <Row align="flex-start">
                  <Icon name={r.correct ? 'check-circle' : 'x-circle'} color={r.correct ? t.colors.success : t.colors.danger} />
                  <AppText variant="bodyBold" style={{ flex: 1 }}>
                    {i + 1}. {q.question}
                  </AppText>
                </Row>
                {!r.correct && <AppText variant="small">Answer: {r.correctOption}</AppText>}
                <AppText variant="small" muted>
                  {r.explanation}
                </AppText>
              </Card>
            );
          })}
          <AppText variant="tiny" muted>
            {result.note}
          </AppText>
          <PrimaryButton title="New quiz" icon="refresh-cw" onPress={() => setQuiz(null)} />
        </View>
      </Screen>
    );
  }

  const q = quiz.questions[index]!;
  const last = index === quiz.questions.length - 1;
  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Screen edges={[]}>
        <Row style={{ paddingVertical: space.md }}>
          <ProgressBar value={(index + (answers[q.id] !== undefined ? 1 : 0)) / quiz.questions.length} style={{ flex: 1 }} />
          <Chip label="AI-generated" icon="cpu" />
        </Row>
        <AppText variant="small" muted>
          {quiz.title}
        </AppText>
        <AppText variant="title" style={{ marginVertical: space.lg }}>
          {q.question}
        </AppText>
        <View style={{ gap: space.md }} accessibilityRole="radiogroup">
          {q.options.map((o, i) => (
            <QuizOption key={o} index={i} label={o} state={answers[q.id] === i ? 'selected' : 'idle'} onPress={() => setAnswers((a) => ({ ...a, [q.id]: i }))} />
          ))}
        </View>
        {error ? <ErrorState error={error} /> : null}
      </Screen>
      <Row style={{ padding: space.lg, borderTopWidth: 1, borderColor: t.colors.border }} gap={space.md}>
        {index > 0 && <PrimaryButton title="Back" kind="secondary" style={{ flex: 1 }} onPress={() => setIndex(index - 1)} />}
        <PrimaryButton
          title={last ? 'Submit answers' : 'Next'}
          style={{ flex: 2 }}
          loading={loading}
          disabled={answers[q.id] === undefined}
          onPress={() => (last ? void submit() : setIndex(index + 1))}
        />
      </Row>
    </View>
  );
}
