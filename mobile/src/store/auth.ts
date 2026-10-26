import { create } from 'zustand';
import { api, refreshSession, request, session } from '../api/client';
import type { Tokens, User } from '../api/types';
import type { OnboardingAnswers } from './onboarding';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: User | null;
  onboardingComplete: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; displayName: string; onboarding?: OnboardingAnswers }) => Promise<void>;
  logout: () => Promise<void>;
  markOnboarded: () => void;
  expire: () => void;
}

interface AuthResponse {
  user: User;
  tokens: Tokens;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  onboardingComplete: false,

  bootstrap: async () => {
    try {
      const ok = await refreshSession();
      if (!ok) return set({ status: 'signedOut', user: null });
      const me = await api.get<{ user: User; profile: { onboardingComplete: boolean } }>('/auth/me');
      set({ status: 'signedIn', user: me.user, onboardingComplete: me.profile.onboardingComplete });
    } catch {
      // Offline at launch with a stored session: stay signed out of server features
      // but keep the refresh token so the next launch can restore the session.
      set({ status: 'signedOut', user: null });
    }
  },

  login: async (email, password) => {
    const { data } = await request<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false });
    await session.save(data.tokens);
    const me = await api.get<{ profile: { onboardingComplete: boolean } }>('/auth/me');
    set({ status: 'signedIn', user: data.user, onboardingComplete: me.profile.onboardingComplete });
  },

  register: async (input) => {
    const { data } = await request<AuthResponse>('/auth/register', { method: 'POST', body: input, auth: false });
    await session.save(data.tokens);
    // New accounts always see the personalised plan screen before the dashboard.
    set({ status: 'signedIn', user: data.user, onboardingComplete: false });
  },

  logout: async () => {
    const refreshToken = await session.getRefreshToken();
    if (refreshToken) {
      await request('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }).catch(() => undefined);
    }
    await session.clear();
    set({ status: 'signedOut', user: null, onboardingComplete: false });
  },

  markOnboarded: () => set({ onboardingComplete: true }),

  expire: () => {
    if (get().status === 'signedIn') void session.clear().then(() => set({ status: 'signedOut', user: null }));
  },
}));

session.setOnExpired(() => useAuth.getState().expire());
