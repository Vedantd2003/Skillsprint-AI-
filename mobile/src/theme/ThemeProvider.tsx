import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { usePrefs } from '../store/prefs';
import { darkTheme, lightTheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const pref = usePrefs((s) => s.theme);
  const theme = useMemo(() => {
    const mode = pref === 'system' ? system ?? 'light' : pref;
    return mode === 'dark' ? darkTheme : lightTheme;
  }, [pref, system]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
