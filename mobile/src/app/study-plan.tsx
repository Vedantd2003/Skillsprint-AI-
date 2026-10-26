import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { api } from '../api/client';
import { Mascot } from '../components/Mascot';
import { AppText, Card, Chip, Icon, PrimaryButton, Row, Screen, TextField, type IconName } from '../components/primitives';
import { ErrorState, LoadingState } from '../components/states';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

interface Plan {
  summary: string;
  focusTopics: string[];
  days: { day: number; title: string; tasks: { type: 'lesson' | 'revision' | 'tutor' | 'quiz'; description: string; lessonId?: string; lessonTitle?: string; topic?: string }[] }[];
  basedOn: { weakTopics: { topic: string; accuracy: number }[]; dueReviews: number; dailyXpGoal: number };
}

const taskIcon: Record<string, IconName> = { lesson: 'play', revision: 'repeat', tutor: 'message-circle', quiz: 'check-square' };

/** AI study plan built from verified progress data (weak topics, due reviews, next lessons). */
export default function StudyPlan() {
  const t = useTheme();
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [focus, setFocus] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const build = async () => {
    setLoading(true);
    setError(null);
    try {
      setPlan(await api.post<Plan>('/ai/study-plan', { days, ...(focus.trim() ? { focus: focus.trim() } : {}) }, { timeoutMs: 60_000 }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const openTask = (task: Plan['days'][number]['tasks'][number]) => {
    if (task.type === 'lesson' && task.lessonId) router.push(`/lesson/${task.lessonId}`);
    else if (task.type === 'revision') router.push(task.topic ? { pathname: '/revision', params: { topic: task.topic } } : '/revision');
    else if (task.type === 'quiz') router.push({ pathname: '/ai-quiz', params: { topic: task.topic ?? task.description } });
    else router.push({ pathname: '/tutor/[id]', params: { id: 'new', prompt: task.description } });
  };

  return (
    <Screen edges={[]}>
      <View style={{ gap: space.lg, paddingTop: space.md }}>
        <Row gap={space.md}>
          <Mascot size={64} mood="think" bounce={false} />
          <AppText style={{ flex: 1 }} muted>
            Dash builds a plan from your actual results: weak topics, reviews due, and the next lessons on your path.
          </AppText>
        </Row>
        <Row>
          {[3, 7, 14].map((d) => (
            <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </Row>
        <TextField label="Anything to focus on? (optional)" value={focus} onChangeText={setFocus} maxLength={200} placeholder="e.g. interview next Friday" />
        <PrimaryButton title={plan ? 'Rebuild plan' : 'Build my plan'} icon="calendar" loading={loading} onPress={() => void build()} />
        {loading && !plan && <LoadingState lines={2} cards={3} label="Building your plan" />}
        {error ? <ErrorState error={error} onRetry={() => void build()} /> : null}
        {plan && (
          <>
            <Card style={{ gap: space.sm, backgroundColor: t.colors.primarySoft, borderColor: t.colors.primary }}>
              <AppText>{plan.summary}</AppText>
              <AppText variant="tiny" muted>
                Based on {plan.basedOn.dueReviews} due reviews
                {plan.basedOn.weakTopics.length ? ` and weak topics: ${plan.basedOn.weakTopics.map((w) => w.topic).join(', ')}` : ''}. AI-generated suggestion.
              </AppText>
            </Card>
            {plan.days.map((d) => (
              <Card key={d.day} style={{ gap: space.md }}>
                <AppText variant="subheading">
                  Day {d.day}: {d.title}
                </AppText>
                {d.tasks.map((task, i) => (
                  <Card key={i} onPress={() => openTask(task)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: t.colors.bg }}>
                    <Icon name={taskIcon[task.type] ?? 'circle'} color={t.colors.primary} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="small">{task.description}</AppText>
                      {task.lessonTitle && (
                        <AppText variant="tiny" color={t.colors.primary}>
                          Lesson: {task.lessonTitle}
                        </AppText>
                      )}
                    </View>
                    <Icon name="chevron-right" size={18} color={t.colors.textMuted} />
                  </Card>
                ))}
              </Card>
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}
