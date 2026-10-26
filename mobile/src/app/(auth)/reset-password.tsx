import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';
import { request } from '../../api/client';
import { passwordSchema } from '../../components/forms';
import { AppText, PrimaryButton, Screen, TextField } from '../../components/primitives';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';

const schema = z
  .object({ token: z.string().trim().min(20, 'Paste the full reset code'), password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ['confirm'] });

export default function ResetPassword() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { control, handleSubmit, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { token: params.token ?? '', password: '', confirm: '' },
  });
  const onSubmit = handleSubmit(async ({ token, password }) => {
    setError(null);
    try {
      await request('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset your password.');
    }
  });

  if (done) {
    return (
      <Screen edges={[]}>
        <View style={{ gap: space.lg, paddingTop: space.lg }}>
          <AppText variant="title">Password updated</AppText>
          <AppText muted>For your security we signed you out on all devices. Sign in with your new password.</AppText>
          <PrimaryButton title="Sign in" onPress={() => router.replace('/(auth)/login')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <View style={{ gap: space.lg, paddingTop: space.lg }}>
        <AppText variant="title">Choose a new password</AppText>
        {error && <AppText color={t.colors.danger}>{error}</AppText>}
        <Controller control={control} name="token" render={({ field, fieldState }) => <TextField label="Reset code" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={control} name="password" render={({ field, fieldState }) => <TextField label="New password" secureTextEntry value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <Controller control={control} name="confirm" render={({ field, fieldState }) => <TextField label="Confirm new password" secureTextEntry value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
        <PrimaryButton title="Update password" loading={formState.isSubmitting} onPress={onSubmit} />
      </View>
    </Screen>
  );
}
