import * as Speech from 'expo-speech';
import React, { useState } from 'react';
import { View } from 'react-native';
import { ProgressBar } from '../components/gamification';
import { Mascot } from '../components/Mascot';
import { AppText, Card, Chip, Icon, PrimaryButton, Row, Screen } from '../components/primitives';
import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

/**
 * Listen-and-repeat pronunciation drill using on-device text-to-speech.
 * Automatic speech scoring needs a speech-recognition service, which isn't
 * configured, so learners self-assess.
 */
const SETS: Record<string, { word: string; tip: string }[]> = {
  'Workplace words': [
    { word: 'schedule', tip: 'Indian/British: SHED-yool. American: SKED-jool. Both are fine.' },
    { word: 'colleague', tip: 'KOL-eeg — two syllables, the "ue" is silent.' },
    { word: 'determine', tip: 'dih-TUR-min — not "deter-mine".' },
    { word: 'hierarchy', tip: 'HY-uh-rar-kee — four syllables.' },
    { word: 'entrepreneur', tip: 'on-truh-pruh-NUR — stress on the last syllable.' },
  ],
  'Tech terms': [
    { word: 'cache', tip: 'Sounds like "cash", not "catch-ay".' },
    { word: 'GUI', tip: 'GOO-ee.' },
    { word: 'Linux', tip: 'LIN-ucks.' },
    { word: 'SQL', tip: 'Either "S-Q-L" or "sequel".' },
    { word: 'algorithm', tip: 'AL-guh-rith-um — stress on the first syllable.' },
  ],
  'Interview phrases': [
    { word: "I'm a quick learner", tip: 'Link the words: "I\'m-a quick learner".' },
    { word: 'I take ownership of my work', tip: 'Stress "ownership".' },
    { word: 'Could you repeat the question?', tip: 'Rising tone on "question".' },
  ],
};

export default function Pronunciation() {
  const t = useTheme();
  const [set, setSet] = useState('Workplace words');
  const [i, setI] = useState(0);
  const [rate, setRate] = useState(0.9);
  const [scores, setScores] = useState<boolean[]>([]);
  const items = SETS[set]!;
  const item = items[i];

  const speak = () => {
    if (!item) return;
    Speech.stop();
    Speech.speak(item.word, { language: 'en-IN', rate });
  };

  const rateSelf = (ok: boolean) => {
    setScores((s) => [...s, ok]);
    setI((x) => x + 1);
  };

  return (
    <Screen edges={[]}>
      <View style={{ gap: space.lg, paddingTop: space.md }}>
        <Row style={{ flexWrap: 'wrap' }}>
          {Object.keys(SETS).map((k) => (
            <Chip
              key={k}
              label={k}
              selected={set === k}
              onPress={() => {
                setSet(k);
                setI(0);
                setScores([]);
              }}
            />
          ))}
        </Row>
        <ProgressBar value={i / items.length} />
        {item ? (
          <>
            <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
              <AppText variant="display" style={{ textAlign: 'center' }}>
                {item.word}
              </AppText>
              <AppText muted style={{ textAlign: 'center' }}>
                {item.tip}
              </AppText>
            </Card>
            <PrimaryButton title="Listen" icon="volume-2" onPress={speak} />
            <Row>
              <Chip label="Slow" selected={rate === 0.6} onPress={() => setRate(0.6)} />
              <Chip label="Normal" selected={rate === 0.9} onPress={() => setRate(0.9)} />
            </Row>
            <AppText muted>Now say it out loud three times. How did it go?</AppText>
            <Row gap={space.md}>
              <PrimaryButton title="Needs work" kind="secondary" style={{ flex: 1 }} onPress={() => rateSelf(false)} />
              <PrimaryButton title="Nailed it" kind="success" style={{ flex: 1 }} onPress={() => rateSelf(true)} />
            </Row>
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: space.md }}>
            <Mascot size={100} mood="cheer" />
            <AppText variant="title">Set complete</AppText>
            <AppText muted>
              You felt confident with {scores.filter(Boolean).length} of {scores.length}. Repeat the ones that need work tomorrow.
            </AppText>
            <PrimaryButton title="Go again" icon="refresh-cw" onPress={() => { setI(0); setScores([]); }} style={{ alignSelf: 'stretch' }} />
          </View>
        )}
        <Row align="flex-start">
          <Icon name="info" size={16} color={t.colors.textMuted} />
          <AppText variant="tiny" muted style={{ flex: 1 }}>
            Audio uses your device's built-in voice. Automatic scoring needs a speech service, which isn't set up, so rate yourself honestly.
          </AppText>
        </Row>
      </View>
    </Screen>
  );
}
