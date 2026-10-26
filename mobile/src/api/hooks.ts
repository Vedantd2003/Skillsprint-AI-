import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './client';
import type { CourseCard, CoursePath, Gamification, Profile } from './types';

export const qk = {
  gamification: ['gamification'] as const,
  profile: ['profile'] as const,
  courses: (track?: string) => ['courses', track ?? 'all'] as const,
  coursePath: (id: string) => ['coursePath', id] as const,
  progress: ['progress'] as const,
  weak: ['weakTopics'] as const,
  revisionDue: ['revisionDue'] as const,
  achievements: ['achievements'] as const,
  leaderboard: (scope: string) => ['leaderboard', scope] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  aiStatus: ['aiStatus'] as const,
  friends: ['friends'] as const,
};

export const useGamification = () => useQuery({ queryKey: qk.gamification, queryFn: () => api.get<Gamification>('/gamification/me') });
export const useProfile = () => useQuery({ queryKey: qk.profile, queryFn: () => api.get<Profile>('/profile/me') });

export const useCourses = (track?: string) =>
  useQuery({
    queryKey: qk.courses(track),
    queryFn: () => api.get<CourseCard[]>(`/courses?limit=50${track ? `&track=${track}` : ''}`),
    staleTime: 5 * 60_000, // course metadata changes rarely; also persisted for offline use
  });

export const useCoursePath = (courseId?: string | null) =>
  useQuery({ queryKey: qk.coursePath(courseId ?? ''), queryFn: () => api.get<CoursePath>(`/courses/${courseId}/units`), enabled: !!courseId });

export interface ProgressData {
  currentCourseId: string | null;
  courses: { id: string; title: string; color: string; icon: string; totalLessons: number; completedLessons: number; percent: number }[];
  accuracy: number | null;
  questionsAnswered: number;
  topicAccuracy: { topic: string; attempts: number; accuracy: number }[];
  revision: { due: number; mastered: number };
  gamification: Gamification;
}
export const useProgress = () => useQuery({ queryKey: qk.progress, queryFn: () => api.get<ProgressData>('/progress/me') });

export interface WeakTopic {
  topic: string;
  accuracy: number;
  attempts: number;
  dueReviews: number;
  repeatedMistakes: number;
}
export const useWeakTopics = () => useQuery({ queryKey: qk.weak, queryFn: () => api.get<{ topics: WeakTopic[] }>('/progress/me/weak-topics') });

export const useAIStatus = () => useQuery({ queryKey: qk.aiStatus, queryFn: () => api.get<{ enabled: boolean; model: string }>('/ai/status'), staleTime: 10 * 60_000 });

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch<Profile>('/profile/me', patch),
    onSuccess: (data) => {
      qc.setQueryData(qk.profile, data);
      void qc.invalidateQueries({ queryKey: qk.gamification });
    },
  });
}

export function useEnroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => api.post(`/courses/${courseId}/enroll`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.profile });
      void qc.invalidateQueries({ queryKey: qk.progress });
    },
  });
}

/** After anything that changes XP/progress, refresh the dependent views. */
export function useInvalidateProgress() {
  const qc = useQueryClient();
  // Stable identity so it can safely be used in effect/callback dependencies.
  return useCallback(
    () =>
      Promise.all(
        [qk.gamification, qk.progress, qk.weak, qk.revisionDue, qk.achievements, ['coursePath'], ['courses'], ['leaderboard']].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      ),
    [qc],
  );
}
