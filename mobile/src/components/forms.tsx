import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';
import { ApiError } from '../api/client';
import { useAuth } from '../store/auth';
import { useOnboarding } from '../store/onboarding';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';
import { AppText, PrimaryButton, TextField } from './primitives';

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

export const registerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Use at least 2 characters')
    .max(30, 'Use 30 characters or fewer')
    .regex(/^[\p{L}\p{N} _.-]+$/u, 'Letters, numbers, spaces, _ . - only'),
  email: z.string().trim().email('Enter a valid email address'),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

function FormError({ message }: { message: string | null }) {
  const t = useTheme();
  if (!message) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: t.colors.dangerSoft, padding: space.md, borderRadius: 12 }}>
      <AppText variant="smallBold" color={t.colors.danger}>
        {message}
      </AppText>
    </View>
  );
}

export function RegisterForm({ withOnboarding = true, onDone }: { withOnboarding?: boolean; onDone?: () => void }) {
  const register = useAuth((s) => s.register);
  const answers = useOnboarding((s) => s.answers);
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState, setError } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await register({ ...values, onboarding: withOnboarding ? { ...answers, timezone } : { timezone } });
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setError('email', { message: 'An account already uses this email. Try signing in.' });
      else setServerError(err instanceof Error ? err.message : 'Could not create your account.');
    }
  });

  return (
    <View style={{ gap: space.lg }}>
      <FormError message={serverError} />
      <Controller
        control={control}
        name="displayName"
        render={({ field, fieldState }) => (
          <TextField
            testID="register-name"
            label="Display name"
            hint="Shown on leaderboards. Avoid using your full name."
            autoComplete="nickname"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            testID="register-email"
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            testID="register-password"
            label="Password"
            secureTextEntry
            autoComplete="new-password"
            hint="8+ characters with a letter and a number"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <PrimaryButton testID="register-submit" title="Create account" loading={formState.isSubmitting} onPress={onSubmit} />
    </View>
  );
}

export function LoginForm({ onDone }: { onDone?: () => void }) {
  const login = useAuth((s) => s.login);
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });
  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      await login(email, password);
      onDone?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Could not sign in.');
    }
  });
  return (
    <View style={{ gap: space.lg }}>
      <FormError message={serverError} />
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            testID="login-email"
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            testID="login-password"
            label="Password"
            secureTextEntry
            autoComplete="current-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            onSubmitEditing={() => void onSubmit()}
            error={fieldState.error?.message}
          />
        )}
      />
      <PrimaryButton testID="login-submit" title="Sign in" loading={formState.isSubmitting} onPress={onSubmit} />
    </View>
  );
}
