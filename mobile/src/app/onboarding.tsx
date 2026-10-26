import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { RegisterForm } from '../components/forms';
import { ProgressBar } from '../components/gamification';
import { Mascot } from '../components/Mascot';
import { AppText, Chip, Icon, PrimaryButton, Row, Screen, Spacer, type IconName } from '../components/primitives';
import { QuizOption } from '../components/question';
import { DAILY_GOALS, GOALS, useOnboarding } from '../store/onboarding';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';

const STEPS = ['welcome', 'intro', 'language', 'goal', 'level', 'daily', 'account'] as const;
type Step = (typeof STEPS)[number];

const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
] as const;

const LEVELS = [
  { id: 'beginner', label: "I'm new to this", hint: 'Start from the basics' },
  { id: 'intermediate', label: 'I know the basics', hint: 'Skip ahead where possible' },
  { id: 'advanced', label: "I'm fairly confident", hint: 'Focus on harder practice' },
] as const;

const HIGHLIGHTS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'play', title: 'Five-minute lessons', body: 'Short, interactive practice with instant feedback.' },
  { icon: 'message-circle', title: 'A personal AI tutor', body: 'Ask anything in English, Hindi or Marathi.' },
  { icon: 'briefcase', title: 'Training for real goals', body: 'Coding, interviews, communication and AI skills.' },
];

export default function Onboarding() {
  const t = useTheme();
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const { answers, update } = useOnboarding();
  const i = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, i + 1)]!);
  const back = () => setStep(STEPS[Math.max(0, i - 1)]!);
  const optional = step !== 'welcome' && step !== 'account';

  if (step === 'welcome') {
    return (
      <Screen scroll={false} contentStyle={{ justifyContent: 'space-between', paddingTop: space.xxl }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
          <Mascot size={150} mood="cheer" />
          <View style={{ gap: space.md }}>
            <AppText variant="display">SkillSprint</AppText>
            <AppText variant="title" style={{ maxWidth: 320 }}>
              Learn smarter. Practice daily. Level up.
            </AppText>
            <AppText muted style={{ maxWidth: 330 }}>
              Bite-sized lessons, an AI tutor that speaks your language, and practice for the skills that get you hired.
            </AppText>
          </View>
        </View>
        <View style={{ gap: space.md, paddingBottom: space.lg }}>
          <PrimaryButton testID="get-started" title="Get started" onPress={next} />
          <PrimaryButton title="I already have an account" kind="secondary" onPress={() => router.push('/(auth)/login')} />
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Row style={{ paddingVertical: space.md }} gap={space.md}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={12}>
            <Icon name="arrow-left" size={24} />
          </Pressable>
          <ProgressBar value={i / (STEPS.length - 1)} style={{ flex: 1 }} accessibilityLabel={`Step ${i} of ${STEPS.length - 1}`} />
          {optional && (
            <Pressable accessibilityRole="button" onPress={next} hitSlop={12}>
              <AppText variant="smallBold" color={t.colors.primary}>
                Skip
              </AppText>
            </Pressable>
          )}
        </Row>
        <Spacer size={space.lg} />

        {step === 'intro' && (
          <View style={{ gap: space.xl }}>
            <AppText variant="title">Here's how SkillSprint works</AppText>
            {HIGHLIGHTS.map((h) => (
              <Row key={h.title} gap={space.lg} align="flex-start">
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: t.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={h.icon} color={t.colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="subheading">{h.title}</AppText>
                  <AppText muted>{h.body}</AppText>
                </View>
              </Row>
            ))}
            <PrimaryButton title="Continue" onPress={next} />
          </View>
        )}

        {step === 'language' && (
          <View style={{ gap: space.lg }}>
            <AppText variant="title">Which language should your tutor use?</AppText>
            <AppText muted>You can change this any time in Settings.</AppText>
            {LANGS.map((l) => (
              <QuizOption
                key={l.code}
                label={l.label}
                state={(answers.tutorLanguage ?? 'en') === l.code ? 'selected' : 'idle'}
                onPress={() => update({ tutorLanguage: l.code, uiLanguage: l.code })}
              />
            ))}
            <PrimaryButton title="Continue" onPress={next} />
          </View>
        )}

        {step === 'goal' && (
          <View style={{ gap: space.lg }}>
            <AppText variant="title">What do you want to get better at?</AppText>
            <AppText muted>Pick one or more. We'll suggest where to start.</AppText>
            <View style={{ gap: space.md }}>
              {GOALS.map((g) => {
                const selected = answers.interests?.includes(g.id) ?? false;
                return (
                  <QuizOption
                    key={g.id}
                    testID={`goal-${g.id}`}
                    label={g.label}
                    state={selected ? 'selected' : 'idle'}
                    onPress={() => {
                      const set = new Set(answers.interests ?? []);
                      if (selected) set.delete(g.id);
                      else set.add(g.id);
                      const interests = [...set];
                      update({ interests, learningGoal: interests[0] ?? 'general' });
                    }}
                  />
                );
              })}
            </View>
            <PrimaryButton title="Continue" onPress={next} />
          </View>
        )}

        {step === 'level' && (
          <View style={{ gap: space.lg }}>
            <AppText variant="title">How much do you already know?</AppText>
            {LEVELS.map((l) => (
              <QuizOption
                key={l.id}
                label={`${l.label} — ${l.hint}`}
                state={answers.skillLevel === l.id ? 'selected' : 'idle'}
                onPress={() => update({ skillLevel: l.id })}
              />
            ))}
            <PrimaryButton title="Continue" onPress={next} />
          </View>
        )}

        {step === 'daily' && (
          <View style={{ gap: space.lg }}>
            <AppText variant="title">Pick a daily goal</AppText>
            <AppText muted>Small and steady beats big and rare. You can change it later.</AppText>
            {DAILY_GOALS.map((d) => (
              <Pressable
                key={d.xp}
                accessibilityRole="radio"
                accessibilityState={{ selected: (answers.dailyXpGoal ?? 20) === d.xp }}
                onPress={() => update({ dailyXpGoal: d.xp })}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: space.lg,
                  borderRadius: radius.button,
                  borderWidth: 2,
                  borderBottomWidth: 4,
                  borderColor: (answers.dailyXpGoal ?? 20) === d.xp ? t.colors.primary : t.colors.border,
                  backgroundColor: (answers.dailyXpGoal ?? 20) === d.xp ? t.colors.primarySoft : t.colors.surface,
                }}
              >
                <AppText variant="subheading">{d.label}</AppText>
                <AppText muted>
                  {d.xp} XP, about {d.minutes} min a day
                </AppText>
              </Pressable>
            ))}
            <PrimaryButton title="Continue" onPress={next} />
          </View>
        )}

        {step === 'account' && (
          <View style={{ gap: space.lg }}>
            <Row gap={space.md}>
              <Mascot size={64} bounce={false} />
              <AppText variant="title" style={{ flex: 1 }}>
                Save your progress
              </AppText>
            </Row>
            <AppText muted>Create a free account so your streak, XP and tutor chats follow you across devices.</AppText>
            <Row style={{ flexWrap: 'wrap' }}>
              {(answers.interests ?? []).map((g) => (
                <Chip key={g} label={GOALS.find((x) => x.id === g)?.label ?? g} selected />
              ))}
            </Row>
            <RegisterForm onDone={() => router.replace('/welcome-plan')} />
            <PrimaryButton title="I already have an account" kind="ghost" onPress={() => router.push('/(auth)/login')} />
          </View>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
