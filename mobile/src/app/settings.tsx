import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Switch, View } from 'react-native';
import { api } from '../api/client';
import { useProfile, useUpdateProfile } from '../api/hooks';
import type { Profile } from '../api/types';
import { AppText, Card, Chip, PrimaryButton, Row, Screen, SectionHeader, TextField } from '../components/primitives';
import { ErrorState, LoadingState, errorMessage } from '../components/states';
import { cancelDailyReminder, scheduleDailyReminder } from '../lib/notifications';
import { useAuth } from '../store/auth';
import { DAILY_GOALS } from '../store/onboarding';
import { usePrefs } from '../store/prefs';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }} gap={space.md}>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyBold">{label}</AppText>
        {hint && (
          <AppText variant="small" muted>
            {hint}
          </AppText>
        )}
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: t.colors.primary, false: t.colors.border }} />
    </Row>
  );
}

const HOURS = [7, 9, 13, 18, 19, 21];

export default function Settings() {
  const t = useTheme();
  const profile = useProfile();
  const update = useUpdateProfile();
  const prefs = usePrefs();
  const logout = useAuth((s) => s.logout);
  const [nameDraft, setName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Server is the source of truth for preferences after sign-in (syncs the device store).
  const serverPrefs = profile.data?.preferences;
  const syncPrefs = prefs.set;
  useEffect(() => {
    if (serverPrefs) syncPrefs(serverPrefs);
  }, [serverPrefs, syncPrefs]);

  if (profile.isPending) return <Screen edges={[]}><LoadingState /></Screen>;
  if (profile.error) return <Screen edges={[]}><ErrorState error={profile.error} onRetry={() => void profile.refetch()} /></Screen>;
  const p: Profile = profile.data;
  const name = nameDraft ?? p.displayName;
  const n = p.notifications ?? { remindersEnabled: false, reminderHour: 19, reminderMinute: 0, streakAlerts: true, weeklySummary: false };

  const save = (patch: Record<string, unknown>) =>
    update.mutate(patch, { onError: (e) => setNotice(errorMessage(e)), onSuccess: () => setNotice(null) });

  const setPref = (key: 'theme' | 'sound' | 'animations' | 'haptics', value: boolean | string) => {
    prefs.set({ [key]: value } as never);
    save({ preferences: { [key]: value } });
  };

  const setReminders = async (enabled: boolean, hour = n.reminderHour) => {
    save({ notifications: { remindersEnabled: enabled, reminderHour: hour, reminderMinute: 0 } });
    if (enabled) {
      const ok = await scheduleDailyReminder(hour, 0).catch(() => false);
      if (!ok) setNotice(Platform.OS === 'web' ? 'Reminders work in the mobile app.' : 'Allow notifications in system settings to get reminders.');
    } else {
      await cancelDailyReminder();
    }
  };

  const confirmLogout = () => {
    const go = () => void logout();
    if (Platform.OS === 'web') return go();
    Alert.alert('Sign out?', 'Your progress is saved to your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: go },
    ]);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete('/profile/me', { password });
      await cancelDailyReminder();
      setDeleteOpen(false);
      await logout();
    } catch (err) {
      setDeleteError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen edges={[]}>
      {notice && (
        <Card style={{ marginTop: space.md, backgroundColor: t.colors.streakSoft, borderColor: t.colors.streak }}>
          <AppText variant="small">{notice}</AppText>
        </Card>
      )}

      <SectionHeader title="Profile" />
      <Card style={{ gap: space.md }}>
        <TextField label="Display name" value={name} onChangeText={setName} maxLength={30} error={nameError ?? undefined} hint="Visible on leaderboards." />
        <PrimaryButton
          title="Save name"
          kind="secondary"
          disabled={name.trim() === p.displayName || name.trim().length < 2}
          onPress={() => {
            setNameError(null);
            update.mutate({ displayName: name.trim() }, { onError: (e) => setNameError(errorMessage(e)) });
          }}
        />
        <AppText variant="small" muted>
          Signed in as {p.email}
        </AppText>
      </Card>

      <SectionHeader title="Learning" />
      <Card style={{ gap: space.md }}>
        <AppText variant="bodyBold">Tutor language</AppText>
        <Row style={{ flexWrap: 'wrap' }}>
          {[
            ['en', 'English'],
            ['hi', 'हिन्दी'],
            ['mr', 'मराठी'],
          ].map(([code, label]) => (
            <Chip key={code} label={label!} selected={p.tutorLanguage === code} onPress={() => save({ tutorLanguage: code, uiLanguage: code })} />
          ))}
        </Row>
        <AppText variant="bodyBold">Daily goal</AppText>
        <Row style={{ flexWrap: 'wrap' }}>
          {DAILY_GOALS.map((d) => (
            <Chip key={d.xp} label={`${d.label}, ${d.xp} XP`} selected={p.dailyXpGoal === d.xp} onPress={() => save({ dailyXpGoal: d.xp })} />
          ))}
        </Row>
        <AppText variant="bodyBold">Level</AppText>
        <Row style={{ flexWrap: 'wrap' }}>
          {(['beginner', 'intermediate', 'advanced'] as const).map((l) => (
            <Chip key={l} label={l[0]!.toUpperCase() + l.slice(1)} selected={p.skillLevel === l} onPress={() => save({ skillLevel: l })} />
          ))}
        </Row>
        <AppText variant="small" muted>
          Streak days follow your timezone: {p.timezone}.
        </AppText>
      </Card>

      <SectionHeader title="Notifications" />
      <Card style={{ gap: space.sm }}>
        <ToggleRow label="Daily reminder" hint="A local notification at your chosen time." value={n.remindersEnabled} onChange={(v) => void setReminders(v)} />
        {n.remindersEnabled && (
          <Row style={{ flexWrap: 'wrap' }}>
            {HOURS.map((h) => (
              <Chip key={h} label={`${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`} selected={n.reminderHour === h} onPress={() => void setReminders(true, h)} />
            ))}
          </Row>
        )}
        <ToggleRow label="Streak alerts" value={n.streakAlerts} onChange={(v) => save({ notifications: { streakAlerts: v } })} />
      </Card>

      <SectionHeader title="Appearance & sound" />
      <Card style={{ gap: space.sm }}>
        <AppText variant="bodyBold">Theme</AppText>
        <Row>
          {(['system', 'light', 'dark'] as const).map((m) => (
            <Chip key={m} label={m[0]!.toUpperCase() + m.slice(1)} selected={prefs.theme === m} onPress={() => setPref('theme', m)} />
          ))}
        </Row>
        <ToggleRow label="Sound effects" value={prefs.sound} onChange={(v) => setPref('sound', v)} />
        <ToggleRow label="Animations" hint="Turn off for reduced motion." value={prefs.animations} onChange={(v) => setPref('animations', v)} />
        <ToggleRow label="Haptics" value={prefs.haptics} onChange={(v) => setPref('haptics', v)} />
      </Card>

      <SectionHeader title="Privacy" />
      <Card style={{ gap: space.sm }}>
        <ToggleRow label="Show me on leaderboards" hint="Only your display name and XP are ever shown." value={p.showOnLeaderboard} onChange={(v) => save({ showOnLeaderboard: v })} />
        <AppText variant="small" muted>
          Tutor chats are stored so you can revisit them, and are deleted automatically after 180 days. Delete any chat from its screen.
        </AppText>
      </Card>

      <View style={{ gap: space.md, marginTop: space.xl }}>
        <PrimaryButton title="Sign out" kind="secondary" icon="log-out" onPress={confirmLogout} />
        <PrimaryButton title="Delete account" kind="ghost" onPress={() => setDeleteOpen(true)} />
      </View>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: space.lg, backgroundColor: 'rgba(10,12,30,0.6)' }}>
          <View style={{ backgroundColor: t.colors.surface, borderRadius: radius.sheet, padding: space.xl, gap: space.md }}>
            <AppText variant="heading">Delete your account?</AppText>
            <AppText muted>This permanently deletes your profile, progress, XP, streaks and tutor chats. It can't be undone.</AppText>
            <TextField label="Confirm with your password" secureTextEntry value={password} onChangeText={setPassword} error={deleteError ?? undefined} />
            <PrimaryButton title="Delete permanently" kind="danger" loading={deleting} disabled={!password} onPress={() => void deleteAccount()} />
            <PrimaryButton title="Keep my account" kind="secondary" onPress={() => setDeleteOpen(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
