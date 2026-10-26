import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Daily study reminders are scheduled locally on the device (no push server
 * needed), at the time the learner picks in Settings.
 */
const REMINDER_ID = 'skillsprint-daily-reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function scheduleDailyReminder(hour: number, minute: number) {
  if (Platform.OS === 'web') return false;
  if (!(await ensurePermission())) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Learning reminders',
      // eslint-disable-next-line import/namespace -- re-exported via `export *`; the plugin can't follow it
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Time for a quick sprint ⚡',
      body: 'A 5-minute lesson keeps your streak alive.',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: 'reminders' },
  });
  return true;
}

export async function cancelDailyReminder() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
}
