import { create } from 'zustand';

export interface OnboardingAnswers {
  uiLanguage?: 'en' | 'hi' | 'mr';
  tutorLanguage?: string;
  learningGoal?: string;
  interests?: string[];
  skillLevel?: 'beginner' | 'intermediate' | 'advanced';
  dailyXpGoal?: number;
  timezone?: string;
}

interface OnboardingState {
  answers: OnboardingAnswers;
  update: (a: Partial<OnboardingAnswers>) => void;
  reset: () => void;
}

export const useOnboarding = create<OnboardingState>((set) => ({
  answers: {},
  update: (a) => set((s) => ({ answers: { ...s.answers, ...a } })),
  reset: () => set({ answers: {} }),
}));

export const GOALS = [
  { id: 'english', label: 'Speak and write better English', track: 'english', course: 'english-grammar-vocabulary' },
  { id: 'coding', label: 'Learn to code', track: 'coding', course: 'python-foundations' },
  { id: 'interview', label: 'Crack interviews', track: 'interview', course: 'interview-preparation' },
  { id: 'ai', label: 'Understand and build with AI', track: 'ai', course: 'ai-generative-ai' },
  { id: 'aptitude', label: 'Prepare for aptitude tests', track: 'aptitude', course: 'aptitude-reasoning' },
] as const;

export const DAILY_GOALS = [
  { xp: 10, label: 'Casual', minutes: 5 },
  { xp: 20, label: 'Regular', minutes: 10 },
  { xp: 30, label: 'Serious', minutes: 15 },
  { xp: 50, label: 'Intense', minutes: 25 },
] as const;
