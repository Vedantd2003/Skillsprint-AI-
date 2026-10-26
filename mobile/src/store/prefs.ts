import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Device-level UI preferences (non-sensitive). Synced to the server profile when signed in. */
interface PrefsState {
  theme: 'system' | 'light' | 'dark';
  sound: boolean;
  animations: boolean;
  haptics: boolean;
  set: (p: Partial<Omit<PrefsState, 'set'>>) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: 'system',
      sound: true,
      animations: true,
      haptics: true,
      set: (p) => set(p),
    }),
    { name: 'skillsprint-prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
