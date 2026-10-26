import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { usePrefs } from '../store/prefs';

/** Short original UI sounds + haptics, both switchable in Settings. */
const sources = {
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  complete: require('../../assets/sounds/complete.wav'),
} as const;

type Cue = keyof typeof sources;
const players: Partial<Record<Cue, AudioPlayer>> = {};

function player(cue: Cue) {
  if (!players[cue]) players[cue] = createAudioPlayer(sources[cue]);
  return players[cue]!;
}

export function cue(kind: Cue) {
  const { sound, haptics } = usePrefs.getState();
  if (sound) {
    try {
      const p = player(kind);
      void p.seekTo(0);
      p.play();
    } catch {
      // Audio is a nicety; never break the lesson over it.
    }
  }
  if (haptics && Platform.OS !== 'web') {
    if (kind === 'wrong') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

export function tap() {
  if (usePrefs.getState().haptics && Platform.OS !== 'web') void Haptics.selectionAsync();
}
