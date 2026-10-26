import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { api } from '../api/client';
import { ProgressBar } from '../components/gamification';
import { Mascot } from '../components/Mascot';
import { AppText, Card, Chip, Icon, PrimaryButton, Row, Screen, SectionHeader, TextField } from '../components/primitives';
import { ErrorState } from '../components/states';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, type } from '../theme/tokens';

interface QuestionRes {
  stage: 'question';
  question: string;
  focus: string;
  tips: string[];
}
interface FeedbackRes {
  stage: 'feedback';
  scores: { structure: number; clarity: number; relevance: number; depth: number };
  overall: number;
  strengths: string[];
  improvements: string[];
  improvedAnswer: string;
  followUpQuestion: string;
  disclaimer: string;
}

const ROLES = ['Software developer (fresher)', 'Data analyst', 'Frontend developer', 'AI/ML engineer', 'Business analyst'];

/** Mock interview: AI asks a question, the learner answers, and gets structured (estimated) feedback. */
export default function Interview() {
  const t = useTheme();
  const params = useLocalSearchParams<{ mode?: 'hr' | 'technical' }>();
  const [mode, setMode] = useState<'hr' | 'technical'>(params.mode ?? 'hr');
  const [role, setRole] = useState(ROLES[0]!);
  const [question, setQuestion] = useState<QuestionRes | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<FeedbackRes | null>(null);
  const [asked, setAsked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const ask = async () => {
    setLoading(true);
    setError(null);
    setFeedback(null);
    setAnswer('');
    try {
      const q = await api.post<QuestionRes>('/ai/interview/practice', { mode, role, previousQuestions: asked.slice(-5) }, { timeoutMs: 45_000 });
      setQuestion(q);
      setAsked((a) => [...a, q.question]);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const evaluate = async () => {
    if (!question) return;
    setLoading(true);
    setError(null);
    try {
      setFeedback(await api.post<FeedbackRes>('/ai/interview/practice', { mode, role, question: question.question, answer }, { timeoutMs: 60_000 }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Screen edges={[]}>
        {!question ? (
          <View style={{ gap: space.lg, paddingTop: space.md }}>
            <Row gap={space.md}>
              <Mascot size={70} mood="think" />
              <AppText variant="title" style={{ flex: 1 }}>
                Practise like it's the real thing
              </AppText>
            </Row>
            <View style={{ gap: space.sm }}>
              <AppText variant="smallBold">Interview type</AppText>
              <Row>
                <Chip label="HR / behavioural" selected={mode === 'hr'} onPress={() => setMode('hr')} />
                <Chip label="Technical" selected={mode === 'technical'} onPress={() => setMode('technical')} />
              </Row>
            </View>
            <View style={{ gap: space.sm }}>
              <AppText variant="smallBold">Role</AppText>
              <Row style={{ flexWrap: 'wrap' }}>
                {ROLES.map((r) => (
                  <Chip key={r} label={r} selected={role === r} onPress={() => setRole(r)} />
                ))}
              </Row>
              <TextField label="Or type a role" value={role} onChangeText={setRole} maxLength={100} />
            </View>
            {error ? <ErrorState error={error} onRetry={() => void ask()} /> : null}
            <PrimaryButton title="Ask me a question" icon="mic" loading={loading} disabled={role.trim().length < 2} onPress={() => void ask()} />
          </View>
        ) : (
          <View style={{ gap: space.lg, paddingTop: space.md }}>
            <Card style={{ gap: space.sm, borderWidth: 3, borderColor: t.colors.shadowBlock }}>
              <AppText variant="small" muted>
                {mode === 'hr' ? 'HR question' : 'Technical question'}, focus: {question.focus}
              </AppText>
              <AppText variant="heading">{question.question}</AppText>
            </Card>
            {!feedback && (
              <>
                <Card style={{ gap: 6, backgroundColor: t.colors.primarySoft, borderColor: t.colors.primary }}>
                  <AppText variant="smallBold" color={t.colors.primary}>
                    Tips
                  </AppText>
                  {question.tips.map((tip) => (
                    <Row key={tip} align="flex-start">
                      <Icon name="check" size={16} color={t.colors.primary} />
                      <AppText variant="small" style={{ flex: 1 }}>
                        {tip}
                      </AppText>
                    </Row>
                  ))}
                </Card>
                <TextInput
                  accessibilityLabel="Your answer"
                  multiline
                  value={answer}
                  onChangeText={setAnswer}
                  maxLength={4000}
                  placeholder="Type your answer as you'd say it…"
                  placeholderTextColor={t.colors.textMuted}
                  style={[type.body, { minHeight: 180, textAlignVertical: 'top', borderRadius: radius.input, borderWidth: 2, borderColor: t.colors.border, backgroundColor: t.colors.surface, color: t.colors.text, padding: space.md }]}
                />
                <AppText variant="tiny" muted>
                  {answer.trim().split(/\s+/).filter(Boolean).length} words. Aim for 120–250 for most answers.
                </AppText>
                {error ? <ErrorState error={error} /> : null}
                <PrimaryButton title="Get feedback" loading={loading} disabled={answer.trim().length < 10} onPress={() => void evaluate()} />
                <PrimaryButton title="Skip this question" kind="ghost" onPress={() => void ask()} />
              </>
            )}
            {feedback && (
              <>
                <Card style={{ gap: space.md }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <AppText variant="heading">Overall</AppText>
                    <AppText variant="display" color={t.colors.primary}>
                      {feedback.overall}/10
                    </AppText>
                  </Row>
                  {(Object.entries(feedback.scores) as [string, number][]).map(([k, v]) => (
                    <View key={k} style={{ gap: 4 }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <AppText variant="small">{k[0]!.toUpperCase() + k.slice(1)}</AppText>
                        <AppText variant="smallBold">{v}/5</AppText>
                      </Row>
                      <ProgressBar value={v / 5} height={8} />
                    </View>
                  ))}
                  <AppText variant="tiny" muted>
                    {feedback.disclaimer}
                  </AppText>
                </Card>
                {feedback.strengths.length > 0 && (
                  <>
                    <SectionHeader title="What worked" />
                    {feedback.strengths.map((s) => (
                      <Row key={s} align="flex-start">
                        <Icon name="thumbs-up" size={16} color={t.colors.success} />
                        <AppText style={{ flex: 1 }}>{s}</AppText>
                      </Row>
                    ))}
                  </>
                )}
                <SectionHeader title="To improve" />
                {feedback.improvements.map((s) => (
                  <Row key={s} align="flex-start">
                    <Icon name="arrow-up-circle" size={16} color={t.colors.streak} />
                    <AppText style={{ flex: 1 }}>{s}</AppText>
                  </Row>
                ))}
                <SectionHeader title="A stronger version" />
                <Card>
                  <AppText>{feedback.improvedAnswer}</AppText>
                </Card>
                {!!feedback.followUpQuestion && (
                  <AppText variant="small" muted>
                    Likely follow-up: {feedback.followUpQuestion}
                  </AppText>
                )}
                <PrimaryButton title="Next question" icon="arrow-right" loading={loading} onPress={() => void ask()} />
                <PrimaryButton title="Change role or type" kind="ghost" onPress={() => setQuestion(null)} />
              </>
            )}
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
