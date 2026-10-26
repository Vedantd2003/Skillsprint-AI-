export type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'fill_blank'
  | 'word_order'
  | 'match_pairs'
  | 'flashcard'
  | 'short_answer'
  | 'code_output'
  | 'code_fill';

export type Answer = number | boolean | string | (string | number)[] | { knew: boolean };

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  instructions: string;
  data: {
    options?: string[];
    words?: string[];
    left?: string[];
    right?: string[];
    front?: string;
    back?: string;
    code?: string;
    language?: string;
    sentence?: string;
    wordBank?: string[];
    placeholder?: string;
  };
  topic: string;
  difficulty: number;
}

export interface User {
  id: string;
  email: string;
  role: 'learner' | 'admin';
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface CourseCard {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  level: string;
  estimatedHours: number;
  objectives: string[];
  color: string;
  icon: string;
  tracks: string[];
  progress: { totalLessons: number; completedLessons: number; percent: number };
}

export type LessonStatus = 'locked' | 'available' | 'started' | 'completed';

export interface PathLesson {
  id: string;
  title: string;
  summary: string;
  kind: 'lesson' | 'checkpoint' | 'review';
  topic: string;
  xpReward: number;
  status: LessonStatus;
  bestScore: number;
}

export interface PathUnit {
  id: string;
  title: string;
  description: string;
  order: number;
  rewardXp: number;
  completedLessons: number;
  totalLessons: number;
  completed: boolean;
  lessons: PathLesson[];
}

export interface CoursePath {
  course: Omit<CourseCard, 'progress'>;
  units: PathUnit[];
  totals: { lessons: number; completed: number };
  nextLesson: { id: string; title: string } | null;
}

export interface StartLessonResponse {
  attempt: { id: string; answered: { questionId: string; correct: boolean; skipped: boolean }[] };
  lesson: { id: string; title: string; kind: string; xpReward: number; topic: string };
  questions: Question[];
  hearts: { current: number; max: number; nextHeartAt: string | null; enabled: boolean };
}

export interface SubmitResponse {
  correct: boolean;
  skipped: boolean;
  alreadyAnswered: boolean;
  correctAnswer: string;
  explanation: string;
  hearts: number | null;
  progress: { answered: number; total: number };
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  icon: string;
}

export interface CompleteResponse {
  lessonId: string;
  passed: boolean;
  passScore: number | null;
  score: number;
  correct: number;
  total: number;
  perfect: boolean;
  firstCompletion: boolean;
  xpEarned: number;
  xpBreakdown: { reason: string; amount: number }[];
  unitCompleted: { id: string; title: string; rewardXp: number } | null;
  newlyUnlocked: { id: string; title: string; kind: string }[];
  achievements: Achievement[];
  streak: { current: number; longest: number } | null;
  totals: { totalXp: number; level: number; dailyXp: number; dailyGoal: number };
  nextLesson: { id: string; title: string } | null;
  alreadyCompleted: boolean;
}

export interface Gamification {
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  xpToNextLevel: number;
  streak: { current: number; longest: number; activeToday: boolean; atRisk: boolean; timezone: string };
  hearts: { current: number; max: number; nextHeartAt: string | null };
  daily: { xp: number; goal: number; met: boolean };
  weekly: { xp: number; goal: number; days: { day: string; xp: number; lessonsCompleted: number; isToday: boolean; isFuture: boolean }[] };
  challenge: {
    title: string;
    description: string;
    target: number;
    progress: number;
    completed: boolean;
    rewardClaimed: boolean;
    bonusXp: number;
  };
  stats: { lessonsCompleted: number; perfectLessons: number; unitsCompleted: number };
  recentAchievements?: (Achievement & { unlockedAt: string })[];
}

export interface Profile {
  id: string;
  email: string;
  role: string;
  displayName: string;
  avatarSeed: string;
  friendCode: string;
  uiLanguage: 'en' | 'hi' | 'mr';
  tutorLanguage: string;
  learningGoal: string;
  interests: string[];
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  dailyXpGoal: number;
  timezone: string;
  currentCourseId: string | null;
  onboardingComplete: boolean;
  showOnLeaderboard: boolean;
  preferences: { theme: 'system' | 'light' | 'dark'; sound: boolean; animations: boolean; haptics: boolean };
  notifications: { remindersEnabled: boolean; reminderHour: number; reminderMinute: number; streakAlerts: boolean; weeklySummary: boolean } | null;
  stats: { totalXp: number; level: number; currentStreak: number; longestStreak: number; lessonsCompleted: number; perfectLessons: number };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  pending?: boolean;
}

export interface AIQuiz {
  id: string;
  title: string;
  topic: string;
  difficulty: string;
  aiGenerated: true;
  rejectedQuestions: number;
  questions: { id: string; type: 'multiple_choice' | 'true_false'; question: string; options: string[] }[];
}

export interface RevisionItem {
  revisionItemId: string;
  topic: string;
  wrongCount: number;
  question: Question;
}
