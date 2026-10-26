/* global jest */
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));

const mockSecure = new Map();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: jest.fn(async (k) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k, v) => void mockSecure.set(k, v)),
  deleteItemAsync: jest.fn(async (k) => void mockSecure.delete(k)),
}));
jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn(async () => {}) }) }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  setNotificationChannelAsync: jest.fn(async () => {}),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: 'daily' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
// Minimal Reanimated mock covering the APIs this app uses (the library's own
// Jest mock depends on native worklet runtimes that aren't available in Jest).
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const id = (v) => v;
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v) => ({ value: v }),
    useAnimatedStyle: (fn) => fn(),
    withTiming: id,
    withSpring: id,
    withRepeat: id,
    withSequence: (...v) => v[v.length - 1],
    Easing: { out: id, in: id, quad: id, linear: id },
  };
});
// Icon fonts are bundled assets; render icons as labelled text in tests.
jest.mock('@expo/vector-icons/Feather', () => {
  const { Text } = require('react-native');
  const Icon = ({ name }) => require('react').createElement(Text, null, `icon:${name}`);
  return { __esModule: true, default: Icon };
});
