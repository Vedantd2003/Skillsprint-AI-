import { useRouter } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { RegisterForm } from '../../components/forms';
import { AppText, Screen } from '../../components/primitives';
import { space } from '../../theme/tokens';

export default function Register() {
  const router = useRouter();
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={[]}>
        <View style={{ gap: space.lg, paddingTop: space.lg }}>
          <AppText variant="title">Create your account</AppText>
          <AppText muted>It takes less than a minute. We'll set up your learning plan next.</AppText>
          <RegisterForm onDone={() => router.replace('/welcome-plan')} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
