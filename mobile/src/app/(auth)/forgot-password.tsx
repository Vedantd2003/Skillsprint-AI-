import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';
import { request } from '../../api/client';
import { AppText, PrimaryButton, Screen, TextField } from '../../components/primitives';
import { useTheme } from '../../theme/ThemeProvider';
import { space } from '../../theme/tokens';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address') });

export default function ForgotPassword() {
  const t = useTheme();
  const router = useRouter();
  const [sent, setSent] = useState<{ devToken?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      const { data } = await request<{ message: string; devResetToken?: string }>('/auth/forgot-password', { method: 'POST', body: { email }, auth: false });
      setSent({ devToken: data.devResetToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a reset code.');
    }
  });

  return (
    <Screen edges={[]}>
      <View style={{ gap: space.lg, paddingTop: space.lg }}>
        <AppText variant="title">Reset your password</AppText>
        {sent ? (
          <>
            <AppText>If an account exists for that email, we've sent a reset code. It expires in 30 minutes.</AppText>
            {sent.devToken && (
              <View style={{ backgroundColor: t.colors.surfaceAlt, padding: space.md, borderRadius: 12 }}>
                <AppText variant="small" muted>
                  Development mode: email delivery isn't configured, so here is the code.
                </AppText>
                <AppText variant="smallBold" selectable>
                  {sent.devToken}
                </AppText>
              </View>
            )}
            <PrimaryButton title="Enter reset code" onPress={() => router.push({ pathname: '/(auth)/reset-password', params: sent.devToken ? { token: sent.devToken } : {} })} />
          </>
        ) : (
          <>
            <AppText muted>Enter the email you signed up with and we'll send you a reset code.</AppText>
            {error && <AppText color={t.colors.danger}>{error}</AppText>}
            <Controller
              control={control}
              name="email"
              render={({ field, fieldState }) => (
                <TextField label="Email" keyboardType="email-address" autoCapitalize="none" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
              )}
            />
            <PrimaryButton title="Send reset code" loading={formState.isSubmitting} onPress={onSubmit} />
          </>
        )}
      </View>
    </Screen>
  );
}
