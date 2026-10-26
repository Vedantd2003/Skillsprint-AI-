import { Link, useRouter } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { LoginForm } from '../../components/forms';
import { Mascot } from '../../components/Mascot';
import { AppText, Row, Screen } from '../../components/primitives';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';

export default function Login() {
  const t = useTheme();
  const router = useRouter();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]}>
        <View style={{ gap: space.xl, paddingTop: space.lg }}>
          <Row gap={space.md}>
            <Mascot size={64} bounce={false} />
            <View style={{ flex: 1 }}>
              <AppText variant="title">Welcome back</AppText>
              <AppText muted>Your streak missed you.</AppText>
            </View>
          </Row>
          <LoginForm onDone={() => router.replace('/')} />
          <View style={{ gap: space.md, alignItems: 'center' }}>
            <Link href="/(auth)/forgot-password" accessibilityRole="link">
              <AppText variant="smallBold" color={t.colors.primary}>
                Forgot your password?
              </AppText>
            </Link>
            <Link href="/(auth)/register" accessibilityRole="link">
              <AppText variant="smallBold" color={t.colors.primary}>
                New here? Create an account
              </AppText>
            </Link>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
