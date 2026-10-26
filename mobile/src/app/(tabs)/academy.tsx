import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useCourses } from '../../api/hooks';
import { CourseCard } from '../../components/cards';
import { AppText, Card, Chip, Icon, Row, Screen, SectionHeader, type IconName } from '../../components/primitives';
import { ErrorState, LoadingState } from '../../components/states';
import { useTheme } from '../../theme/ThemeProvider';
import { palette, radius, space } from '../../theme/tokens';

type Track = 'english' | 'coding' | 'interview' | 'ai';

interface Mode {
  title: string;
  body: string;
  icon: IconName;
  href: Href;
}

const MODES: Record<Track, Mode[]> = {
  english: [
    { title: 'Conversation role-play', body: 'Practise a job interview, a stand-up update or a client call with the AI.', icon: 'users', href: { pathname: '/tutor/[id]', params: { id: 'new', mode: 'roleplay', scenario: 'A job interview for an entry-level role' } } },
    { title: 'Grammar correction', body: 'Paste any sentence and get corrections with reasons.', icon: 'edit-3', href: { pathname: '/tutor/[id]', params: { id: 'new', mode: 'grammar' } } },
    { title: 'Pronunciation drill', body: 'Hear tricky words, repeat them aloud and rate yourself.', icon: 'volume-2', href: '/pronunciation' },
    { title: 'Vocabulary quiz', body: 'A fresh AI quiz on workplace words.', icon: 'book', href: { pathname: '/ai-quiz', params: { topic: 'Workplace English vocabulary' } } },
  ],
  coding: [
    { title: 'Predict the output', body: 'Quick AI quiz on reading Python and JavaScript.', icon: 'terminal', href: { pathname: '/ai-quiz', params: { topic: 'Predict the output of short Python and JavaScript snippets', difficulty: 'medium' } } },
    { title: 'Debugging challenges', body: 'Ask the tutor for a buggy snippet, then fix it step by step.', icon: 'tool', href: { pathname: '/tutor/[id]', params: { id: 'new', prompt: 'Give me a short beginner debugging challenge in Python. Do not show the answer until I try.' } } },
    { title: 'DSA practice', body: 'Interview patterns: Big-O, hashing, stacks and queues.', icon: 'git-branch', href: { pathname: '/ai-quiz', params: { topic: 'Data structures and algorithms interview basics', difficulty: 'medium' } } },
  ],
  interview: [
    { title: 'HR mock interview', body: 'Answer real questions and get feedback on structure and clarity.', icon: 'briefcase', href: { pathname: '/interview', params: { mode: 'hr' } } },
    { title: 'Technical mock interview', body: 'Role-specific technical questions with scored feedback.', icon: 'cpu', href: { pathname: '/interview', params: { mode: 'technical' } } },
    { title: 'Revise past mistakes', body: 'Spaced repetition built from your real answers.', icon: 'repeat', href: '/revision' },
  ],
  ai: [
    { title: 'Prompt engineering lab', body: 'Write prompts and get them critiqued by the tutor.', icon: 'feather', href: { pathname: '/tutor/[id]', params: { id: 'new', prompt: 'Teach me prompt engineering with a hands-on exercise. Give me a task, let me write a prompt, then critique it.' } } },
    { title: 'RAG & agents quiz', body: 'Check your understanding of retrieval and tool-using agents.', icon: 'layers', href: { pathname: '/ai-quiz', params: { topic: 'RAG pipelines and AI agents', difficulty: 'medium' } } },
    { title: 'Build-it project coach', body: 'Plan a small AI project with the tutor, one step at a time.', icon: 'box', href: { pathname: '/tutor/[id]', params: { id: 'new', prompt: 'Coach me through building a small AI-powered app that calls an LLM API from a backend. Start by asking about my skills.' } } },
  ],
};

const TRACKS: { id: Track; label: string; icon: IconName }[] = [
  { id: 'english', label: 'English', icon: 'message-square' },
  { id: 'coding', label: 'Coding', icon: 'code' },
  { id: 'interview', label: 'Interviews', icon: 'briefcase' },
  { id: 'ai', label: 'AI & tech', icon: 'cpu' },
];

export default function Academy() {
  const t = useTheme();
  const router = useRouter();
  const [track, setTrack] = useState<Track>('english');
  const courses = useCourses(track);

  return (
    <Screen>
      <View style={{ paddingTop: space.md, gap: 4 }}>
        <AppText variant="title">Training academy</AppText>
        <AppText muted>Practice built for real goals: speaking, coding, interviews and AI.</AppText>
      </View>
      <Row style={{ flexWrap: 'wrap', marginTop: space.lg }}>
        {TRACKS.map((tr) => (
          <Chip key={tr.id} label={tr.label} icon={tr.icon} selected={track === tr.id} onPress={() => setTrack(tr.id)} testID={`track-${tr.id}`} />
        ))}
      </Row>

      <SectionHeader title="Practice modes" />
      <View style={{ gap: space.md }}>
        {MODES[track].map((m) => (
          <Card key={m.title} onPress={() => router.push(m.href)} accessibilityLabel={m.title} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: radius.button, backgroundColor: palette.volt, borderWidth: 2, borderColor: palette.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={m.icon} color={palette.ink} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="subheading">{m.title}</AppText>
              <AppText variant="small" muted>
                {m.body}
              </AppText>
            </View>
            <Icon name="chevron-right" color={t.colors.textMuted} />
          </Card>
        ))}
      </View>

      <SectionHeader title="Courses" />
      {courses.isPending ? (
        <LoadingState lines={0} cards={2} />
      ) : courses.error ? (
        <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />
      ) : (
        <View style={{ gap: space.md }}>
          {courses.data.map((c) => (
            <CourseCard key={c.id} course={c} onPress={() => router.push(`/course/${c.id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}
