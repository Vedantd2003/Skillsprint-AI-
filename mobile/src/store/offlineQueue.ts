import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ApiError, api } from '../api/client';
import type { Answer } from '../api/types';

/**
 * Answers made while offline are saved on the device and synced when the
 * connection returns. The server treats every submission as idempotent per
 * (attempt, question), so retries can never duplicate progress or rewards.
 */
export interface QueuedAnswer {
  clientEventId: string;
  lessonId: string;
  attemptId: string;
  questionId: string;
  answer?: Answer;
  skip?: boolean;
  queuedAt: number;
}

interface QueueState {
  items: QueuedAnswer[];
  syncing: boolean;
  lastError: string | null;
  enqueue: (item: Omit<QueuedAnswer, 'clientEventId' | 'queuedAt'>) => void;
  flush: () => Promise<{ synced: number; remaining: number }>;
  forAttempt: (attemptId: string) => QueuedAnswer[];
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const useOfflineQueue = create<QueueState>()(
  persist(
    (set, get) => ({
      items: [],
      syncing: false,
      lastError: null,
      enqueue: (item) =>
        set((s) => {
          // One pending answer per question; a newer one replaces the older.
          const rest = s.items.filter((i) => !(i.attemptId === item.attemptId && i.questionId === item.questionId));
          return { items: [...rest, { ...item, clientEventId: newId(), queuedAt: Date.now() }] };
        }),
      forAttempt: (attemptId) => get().items.filter((i) => i.attemptId === attemptId),
      flush: async () => {
        if (get().syncing) return { synced: 0, remaining: get().items.length };
        set({ syncing: true, lastError: null });
        let synced = 0;
        try {
          for (const item of [...get().items]) {
            try {
              await api.post(`/lessons/${item.lessonId}/submit`, {
                attemptId: item.attemptId,
                questionId: item.questionId,
                ...(item.skip ? { skip: true } : { answer: item.answer }),
                clientEventId: item.clientEventId,
              });
              synced++;
              set((s) => ({ items: s.items.filter((i) => i.clientEventId !== item.clientEventId) }));
            } catch (err) {
              if (err instanceof ApiError && err.isNetwork) break; // still offline — keep everything
              // The server rejected it (e.g. out of hearts, attempt closed): drop it and report.
              set((s) => ({
                items: s.items.filter((i) => i.clientEventId !== item.clientEventId),
                lastError: err instanceof Error ? err.message : 'Sync failed',
              }));
            }
          }
        } finally {
          set({ syncing: false });
        }
        return { synced, remaining: get().items.length };
      },
    }),
    {
      name: 'skillsprint-offline-queue',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
