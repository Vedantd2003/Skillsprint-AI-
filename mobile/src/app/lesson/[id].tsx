import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, api } from '../../api/client';
import { useInvalidateProgress } from '../../api/hooks';
import type { CompleteResponse, StartLessonResponse, SubmitResponse } from '../../api/types';
import { MarkdownText } from '../../components/AIChatBubble';
import { AchievementCard, HeartCounter, ProgressBar, XPBurst } from '../../components/gamification';
import { Mascot } from '../../components/Mascot';
import { AppText, Card, Icon, PrimaryButton, Row } from '../../components/primitives';
import { AnswerFeedback, QuestionRenderer } from '../../components/question';
import { ErrorState, LoadingState, errorMessage } from '../../components/states';
import { emptyDraft, isReady, toAnswer, type Draft } from '../../lesson/answers';
import { initialLessonState, lessonReducer, pendingSyncCount, progressOf } from '../../lesson/lessonMachine';
import { cue } from '../../lib/feedback';
import { useOfflineQueue } from '../../store/offlineQueue';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';

/** Keyed by lesson id so moving to the next lesson starts with fresh state. */
export default function LessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LessonPlayer key={id} lessonId={id} />;
}

function LessonPlayer({ lessonId }: { lessonId: string }) {
  const t = useTheme();
  const router = useRouter();
  const invalidate = useInvalidateProgress();
  const enqueue = useOfflineQueue((s) => s.enqueue);
  const flush = useOfflineQueue((s) => s.flush);

  const [state, dispatch] = useReducer(lessonReducer, initialLessonState);
  const [meta, setMeta] = useState<StartLessonResponse | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [draftState, setDraftState] = useState<{ qid: string; draft: Draft } | null>(null);
  const [completion, setCompletion] = useState<CompleteResponse | null>(null);
  const [completeError, setCompleteError] = useState<unknown>(null);
  const [explain, setExplain] = useState<{ loading: boolean; text?: string; error?: string } | null>(null);
  const completing = useRef(false);

  const [reloadKey, setReloadKey] = useState(0);

  /** Applies a /start response. Answers saved offline for this attempt count as answered (pending sync). */
  const applyStart = useCallback((res: StartLessonResponse) => {
    setLoadError(null);
    setMeta(res);
    const queued = useOfflineQueue.getState().forAttempt(res.attempt.id);
    dispatch({ type: 'load', questions: res.questions, answered: res.attempt.answered, hearts: res.hearts.enabled ? res.hearts.current : null });
    for (const q of queued) dispatch({ type: 'savedOffline', questionId: q.questionId });
    if (queued.length) dispatch({ type: 'next' });
    const allAnswered = res.questions.every((q) => res.attempt.answered.some((a) => a.questionId === q.id) || queued.some((x) => x.questionId === q.id));
    return allAnswered;
  }, []);

  const complete = useCallback(
    async (attemptId: string) => {
      if (completing.current) return;
      completing.current = true;
      try {
        if (useOfflineQueue.getState().forAttempt(attemptId).length) {
          const r = await flush();
          if (r.remaining) throw new ApiError(0, 'NETWORK_ERROR', 'Some answers are still saved on this device. Reconnect to finish the lesson.');
          // Re-sync results now that the server has checked the queued answers.
          applyStart(await api.post<StartLessonResponse>(`/lessons/${lessonId}/start`));
        }
        const res = await api.post<CompleteResponse>(`/lessons/${lessonId}/complete`, { attemptId });
        setCompleteError(null);
        cue('complete');
        setCompletion(res);
        void invalidate();
      } catch (err) {
        setCompleteError(err);
      } finally {
        completing.current = false;
      }
    },
    [lessonId, flush, applyStart, invalidate],
  );

  // Latest `complete` without making the start effect depend on it (it must run once per load).
  const completeRef = useRef(complete);
  useEffect(() => {
    completeRef.current = complete;
  }, [complete]);

  useEffect(() => {
    let active = true;
    api
      .post<StartLessonResponse>(`/lessons/${lessonId}/start`)
      .then((res) => {
        if (!active) return;
        // Resuming an attempt where every question is already answered: finish it.
        if (applyStart(res)) void completeRef.current(res.attempt.id);
      })
      .catch((err) => active && setLoadError(err));
    return () => {
      active = false;
    };
  }, [lessonId, reloadKey, applyStart]);

  const load = () => {
    setCompletion(null);
    setReloadKey((k) => k + 1);
  };

  /** Continue after feedback; finishing the last question completes the lesson. */
  const onContinue = () => {
    const next = lessonReducer(state, { type: 'next' });
    dispatch({ type: 'next' });
    if (next.phase === 'finished' && meta) void complete(meta.attempt.id);
  };

  const question = state.questions[state.index];
  // The draft belongs to the current question; a new question starts with an empty draft.
  const draft: Draft | null = question ? (draftState?.qid === question.id ? draftState.draft : emptyDraft(question)) : null;
  const setDraft = (d: Draft) => question && setDraftState({ qid: question.id, draft: d });

  const submit = async (opts: { skip?: boolean; answerOverride?: Draft } = {}) => {
    if (!meta || !question) return;
    const d = opts.answerOverride ?? draft;
    if (!opts.skip && (!d || !isReady(question, d))) return;
    dispatch({ type: 'check' });
    const payload = opts.skip ? { skip: true } : { answer: toAnswer(question, d!) };
    try {
      const res = await api.post<SubmitResponse>(`/lessons/${lessonId}/submit`, { attemptId: meta.attempt.id, questionId: question.id, ...payload });
      cue(res.correct ? 'correct' : 'wrong');
      dispatch({ type: 'result', questionId: question.id, response: res });
    } catch (err) {
      if (err instanceof ApiError && err.isNetwork) {
        enqueue({ lessonId, attemptId: meta.attempt.id, questionId: question.id, ...payload });
        dispatch({ type: 'savedOffline', questionId: question.id });
      } else if (err instanceof ApiError && err.code === 'OUT_OF_HEARTS') {
        dispatch({ type: 'outOfHearts' });
      } else {
        dispatch({ type: 'error', message: errorMessage(err) });
      }
    }
  };

  const exit = () => {
    if (completion || state.phase === 'outOfHearts') return router.back();
    const go = () => router.back();
    if (Platform.OS === 'web') return go();
    Alert.alert('Leave this lesson?', 'Your answers so far are saved. You can pick up where you left off.', [
      { text: 'Keep learning', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: go },
    ]);
  };

  const explainMistake = async () => {
    if (!question || !draft) return;
    setExplain({ loading: true });
    try {
      const given = JSON.stringify(toAnswer(question, draft)).slice(0, 400);
      const res = await api.post<{ explanation: string }>('/ai/explanations', { questionId: question.id, givenAnswer: given });
      setExplain({ loading: false, text: res.explanation });
    } catch (err) {
      setExplain({ loading: false, error: errorMessage(err) });
    }
  };

  // ---------- Render states ----------

  if (loadError) {
    const locked = loadError instanceof ApiError && loadError.code === 'LESSON_LOCKED';
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, padding: space.lg }}>
        <ErrorState error={loadError} title={locked ? 'This lesson is locked' : undefined} onRetry={locked ? undefined : load} />
        <PrimaryButton title="Back" kind="ghost" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }
  if (!meta) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, padding: space.lg }}>
        <LoadingState label="Loading lesson" />
      </SafeAreaView>
    );
  }

  if (completion) return <CompletionScreen result={completion} onNext={(id) => router.replace(`/lesson/${id}`)} onDone={() => router.back()} onRetry={load} />;

  if (state.phase === 'finished') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, padding: space.lg, justifyContent: 'center' }}>
        {completeError ? (
          <>
            <ErrorState error={completeError} title={pendingSyncCount(state) ? 'Waiting to sync' : "Couldn't finish the lesson"} onRetry={() => meta && void complete(meta.attempt.id)} />
            <AppText variant="small" muted style={{ textAlign: 'center' }}>
              Your answers are safe. XP is only added once the server confirms the lesson.
            </AppText>
            <PrimaryButton title="Close" kind="ghost" onPress={() => router.back()} />
          </>
        ) : (
          <LoadingState lines={1} cards={1} label="Finishing lesson" />
        )}
      </SafeAreaView>
    );
  }

  if (state.phase === 'outOfHearts') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, padding: space.xl, justifyContent: 'center', gap: space.lg }}>
        <Mascot size={120} mood="sad" />
        <AppText variant="title" style={{ textAlign: 'center' }}>
          You're out of hearts
        </AppText>
        <AppText muted style={{ textAlign: 'center' }}>
          Your lesson progress is saved. Practise your mistakes in Revision to earn hearts back, or wait — a heart refills every 30 minutes.
        </AppText>
        <PrimaryButton title="Practise in Revision" icon="repeat" onPress={() => router.replace('/revision')} />
        <PrimaryButton title="Back to the path" kind="secondary" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const revealed = state.phase === 'feedback' && state.feedback ? { correct: state.feedback.correct } : null;
  const showFooterFeedback = state.phase === 'feedback' || state.phase === 'savedOffline';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Row style={{ paddingHorizontal: space.lg, paddingVertical: space.md }} gap={space.md}>
          <Pressable testID="exit-lesson" accessibilityRole="button" accessibilityLabel="Pause and exit lesson" onPress={exit} hitSlop={12}>
            <Icon name="x" size={26} color={t.colors.textMuted} />
          </Pressable>
          <ProgressBar value={progressOf(state)} style={{ flex: 1 }} height={14} accessibilityLabel="Lesson progress" />
          {state.hearts !== null && <HeartCounter hearts={state.hearts} max={meta.hearts.max} />}
        </Row>

        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
          {question && draft && (
            <QuestionRenderer
              key={question.id}
              question={question}
              draft={draft}
              onChange={setDraft}
              disabled={state.phase !== 'answering'}
              reveal={revealed}
              onFlashAnswer={(knew) => {
                const d: Draft = { kind: 'flash', flipped: true, value: knew };
                setDraft(d);
                void submit({ answerOverride: d });
              }}
            />
          )}
          {state.error && (
            <AppText color={t.colors.danger} style={{ marginTop: space.lg }} accessibilityRole="alert">
              {state.error}
            </AppText>
          )}
        </ScrollView>

        {showFooterFeedback ? (
          <AnswerFeedback
            correct={state.feedback?.correct ?? false}
            skipped={state.feedback?.skipped}
            correctAnswer={state.feedback?.correctAnswer}
            explanation={state.feedback?.explanation}
            savedOffline={state.phase === 'savedOffline'}
            onExplain={!state.feedback?.skipped ? explainMistake : undefined}
            onContinue={onContinue}
          />
        ) : (
          question?.type !== 'flashcard' && (
            <View style={{ padding: space.lg, gap: space.sm, borderTopWidth: 1, borderColor: t.colors.border }}>
              <PrimaryButton testID="check-answer" title="Check" loading={state.phase === 'checking'} disabled={!question || !draft || !isReady(question, draft)} onPress={() => void submit()} />
              <PrimaryButton title="Skip for now" kind="ghost" onPress={() => void submit({ skip: true })} disabled={state.phase !== 'answering'} />
            </View>
          )
        )}
      </KeyboardAvoidingView>

      <Modal visible={!!explain} transparent animationType="slide" onRequestClose={() => setExplain(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,12,30,0.5)' }}>
          <View style={{ backgroundColor: t.colors.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: space.xl, gap: space.md, maxHeight: '75%' }}>
            <Row>
              <Mascot size={44} bounce={false} mood="think" />
              <AppText variant="heading" style={{ flex: 1 }}>
                Why that was wrong
              </AppText>
            </Row>
            <ScrollView>
              {explain?.loading && <LoadingState lines={3} cards={0} label="Asking the tutor" />}
              {explain?.text && <MarkdownText content={explain.text} color={t.colors.text} />}
              {explain?.error && <AppText color={t.colors.danger}>{explain.error}</AppText>}
            </ScrollView>
            <AppText variant="tiny" muted>
              AI explanation. The answer shown in the lesson is the authoritative one.
            </AppText>
            <PrimaryButton title="Got it" onPress={() => setExplain(null)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function CompletionScreen({ result, onNext, onDone, onRetry }: { result: CompleteResponse; onNext: (id: string) => void; onDone: () => void; onRetry: () => void }) {
  const t = useTheme();
  const failedCheckpoint = !result.passed;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} testID="lesson-complete">
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg, alignItems: 'stretch' }}>
        <View style={{ alignItems: 'center', gap: space.md, marginTop: space.xl }}>
          <Mascot size={130} mood={failedCheckpoint ? 'sad' : 'cheer'} />
          <AppText variant="display" style={{ textAlign: 'center' }}>
            {failedCheckpoint ? 'Almost there' : result.perfect ? 'Perfect lesson!' : 'Lesson complete!'}
          </AppText>
          {failedCheckpoint && (
            <AppText muted style={{ textAlign: 'center' }}>
              Checkpoints need {Math.round((result.passScore ?? 0.7) * 100)}%. You scored {Math.round(result.score * 100)}%. Review your mistakes and try again.
            </AppText>
          )}
          {result.xpEarned > 0 && <XPBurst xp={result.xpEarned} />}
        </View>

        <Row gap={space.md}>
          <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <AppText variant="tiny" muted>
              Accuracy
            </AppText>
            <AppText variant="title">{Math.round(result.score * 100)}%</AppText>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <AppText variant="tiny" muted>
              Streak
            </AppText>
            <AppText variant="title" color={t.colors.streak}>
              {result.streak?.current ?? '–'}
            </AppText>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <AppText variant="tiny" muted>
              Level
            </AppText>
            <AppText variant="title">{result.totals.level}</AppText>
          </Card>
        </Row>

        {result.xpBreakdown.length > 0 && (
          <Card style={{ gap: space.sm }}>
            {result.xpBreakdown.map((x) => (
              <Row key={x.reason} style={{ justifyContent: 'space-between' }}>
                <AppText>{x.reason}</AppText>
                <AppText variant="bodyBold">+{x.amount} XP</AppText>
              </Row>
            ))}
            {result.alreadyCompleted && (
              <AppText variant="tiny" muted>
                Already recorded. XP is only ever counted once.
              </AppText>
            )}
          </Card>
        )}

        {result.unitCompleted && (
          <Card style={{ backgroundColor: t.colors.successSoft, borderColor: t.colors.success }}>
            <AppText variant="subheading" color={t.colors.success}>
              Unit complete: {result.unitCompleted.title}
            </AppText>
          </Card>
        )}

        {result.newlyUnlocked.length > 0 && (
          <Card style={{ gap: space.sm }}>
            <AppText variant="subheading">Unlocked</AppText>
            {result.newlyUnlocked.map((l) => (
              <Row key={l.id}>
                <Icon name="unlock" size={16} color={t.colors.primary} />
                <AppText>{l.title}</AppText>
              </Row>
            ))}
          </Card>
        )}

        {result.achievements.map((a) => (
          <AchievementCard key={a.code} achievement={a} />
        ))}

        <View style={{ gap: space.md, marginTop: space.md }}>
          {failedCheckpoint ? (
            <PrimaryButton title="Try the checkpoint again" icon="refresh-cw" onPress={onRetry} />
          ) : (
            result.nextLesson && <PrimaryButton testID="next-lesson" title={`Next: ${result.nextLesson.title}`} icon="play" onPress={() => onNext(result.nextLesson!.id)} />
          )}
          <PrimaryButton title="Back to the path" kind="secondary" onPress={onDone} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
