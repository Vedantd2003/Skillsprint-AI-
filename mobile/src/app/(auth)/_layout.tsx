import { Stack } from 'expo-router';
import { useTheme } from '../../theme/ThemeProvider';
import { fonts } from '../../theme/tokens';

export default function AuthLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: t.colors.bg },
        headerTintColor: t.colors.text,
        headerTitleStyle: { fontFamily: fonts.heading },
        contentStyle: { backgroundColor: t.colors.bg },
        title: '',
      }}
    />
  );
}
