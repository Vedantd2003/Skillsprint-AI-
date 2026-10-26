import React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import type { Question } from '../api/types';
import { pickPair, type Draft } from '../lesson/answers';
import { tap } from '../lib/feedback';
import { useTheme } from '../theme/ThemeProvider';
import { fonts, MIN_TOUCH, palette, radius, space, type } from '../theme/tokens';
import { AppText, Icon, PrimaryButton, Row } from './primitives';

type OptionState = 'idle' | 'selected' | 'correct' | 'wrong' | 'dimmed';

export function QuizOption({ label, state = 'idle', onPress, index, disabled, testID }: { label: string; state?: OptionState; onPress?: () => void; index?: number; disabled?: boolean; testID?: string }) {
  const t = useTheme();
  const colors: Record<OptionState, { border: string; bg: string; fg: string }> = {
    idle: { border: t.colors.border, bg: t.colors.surface, fg: t.colors.text },
    selected: { border: t.colors.primary, bg: t.colors.primarySoft, fg: t.colors.primary },
    correct: { border: t.colors.success, bg: t.colors.successSoft, fg: t.colors.success },
    wrong: { border: t.colors.danger, bg: t.colors.dangerSoft, fg: t.colors.danger },
    dimmed: { border: t.colors.border, bg: t.colors.surface, fg: t.colors.textMuted },
  };
  const c = colors[state];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected: state === 'selected', disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH + 8,
        borderWidth: 2,
        borderBottomWidth: 4,
        borderColor: c.border,
        backgroundColor: c.bg,
        borderRadius: radius.button,
        paddingHorizontal: space.lg,
        paddingVertical: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        transform: [{ translateY: pressed ? 2 : 0 }],
      })}
    >
      {index !== undefined && (
        <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="tiny" color={c.fg}>
            {String.fromCharCode(65 + index)}
          </AppText>
        </View>
      )}
      <AppText variant="bodyBold" color={c.fg} style={{ flex: 1 }}>
        {label}
      </AppText>
      {state === 'correct' && <Icon name="check-circle" color={t.colors.success} />}
      {state === 'wrong' && <Icon name="x-circle" color={t.colors.danger} />}
    </Pressable>
  );
}

export function CodeBlock({ code, highlightBlank }: { code: string; highlightBlank?: string }) {
  const parts = highlightBlank ? code.split('____') : [code];
  return (
    <ScrollView horizontal style={{ borderRadius: radius.input, backgroundColor: '#161A33' }} contentContainerStyle={{ padding: space.md }}>
      <AppText style={{ fontFamily: fonts.mono, fontSize: 14, lineHeight: 21, color: '#E6E9FF' }} accessibilityLabel={`Code: ${code.replace(/____/g, 'blank')}`}>
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            {p}
            {i < parts.length - 1 && (
              <AppText style={{ fontFamily: fonts.mono, fontSize: 14, color: palette.ink, backgroundColor: palette.volt }}>
                {highlightBlank || ' ____ '}
              </AppText>
            )}
          </React.Fragment>
        ))}
      </AppText>
    </ScrollView>
  );
}

function WordTile({ word, onPress, used }: { word: string; onPress: () => void; used?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={word}
      accessibilityState={{ disabled: used }}
      disabled={used}
      onPress={() => {
        tap();
        onPress();
      }}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        justifyContent: 'center',
        borderRadius: 12,
        borderWidth: 2,
        borderBottomWidth: used ? 2 : 4,
        borderColor: used ? t.colors.track : t.colors.border,
        backgroundColor: used ? t.colors.track : t.colors.surface,
      }}
    >
      <AppText variant="bodyBold" style={{ opacity: used ? 0 : 1 }}>
        {word}
      </AppText>
    </Pressable>
  );
}

const textInputStyle = (t: ReturnType<typeof useTheme>, mono = false) => [
  mono ? { fontFamily: fonts.mono, fontSize: 15, lineHeight: 21 } : type.body,
  {
    minHeight: 56,
    borderRadius: radius.input,
    borderWidth: 2,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
    color: t.colors.text,
    padding: space.md,
    textAlignVertical: 'top' as const,
  },
];

/**
 * Renders any question type. When `reveal` is set (after checking), options
 * show correct/incorrect state; inputs are disabled.
 */
export function QuestionRenderer({
  question: q,
  draft,
  onChange,
  disabled,
  reveal,
  onFlashAnswer,
}: {
  question: Question;
  draft: Draft;
  onChange: (d: Draft) => void;
  disabled?: boolean;
  reveal?: { correct: boolean } | null;
  onFlashAnswer?: (knew: boolean) => void;
}) {
  const t = useTheme();
  const optionState = (i: number, selected: boolean): OptionState => {
    if (!reveal) return selected ? 'selected' : 'idle';
    if (selected) return reveal.correct ? 'correct' : 'wrong';
    return 'dimmed';
  };

  const promptBlock = (
    <View style={{ gap: space.sm, marginBottom: space.lg }}>
      {!!q.instructions && (
        <AppText variant="smallBold" color={t.colors.primary}>
          {q.instructions}
        </AppText>
      )}
      <AppText variant="title" accessibilityRole="header">
        {q.type === 'fill_blank' ? q.prompt.replace('___', '_____') : q.prompt}
      </AppText>
    </View>
  );

  switch (q.type) {
    case 'multiple_choice':
      return (
        <View>
          {promptBlock}
          <View accessibilityRole="radiogroup" style={{ gap: space.md }}>
            {(q.data.options ?? []).map((o, i) => (
              <QuizOption
                key={o}
                testID={`option-${i}`}
                index={i}
                label={o}
                disabled={disabled}
                state={optionState(i, draft.kind === 'index' && draft.value === i)}
                onPress={() => onChange({ kind: 'index', value: i })}
              />
            ))}
          </View>
        </View>
      );

    case 'true_false':
      return (
        <View>
          {promptBlock}
          <Row gap={space.md}>
            {[true, false].map((v) => (
              <View key={String(v)} style={{ flex: 1 }}>
                <QuizOption
                  testID={`option-${v}`}
                  label={v ? 'True' : 'False'}
                  disabled={disabled}
                  state={optionState(v ? 0 : 1, draft.kind === 'bool' && draft.value === v)}
                  onPress={() => onChange({ kind: 'bool', value: v })}
                />
              </View>
            ))}
          </Row>
        </View>
      );

    case 'fill_blank':
    case 'code_fill': {
      const bank = q.type === 'fill_blank' ? q.data.wordBank : q.data.options;
      const value = draft.kind === 'text' ? draft.value : '';
      return (
        <View style={{ gap: space.md }}>
          {promptBlock}
          {q.type === 'code_fill' && q.data.code && <CodeBlock code={q.data.code} highlightBlank={value || undefined} />}
          {bank?.length ? (
            <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
              {bank.map((w, i) => (
                <QuizOption key={w} testID={`option-${i}`} label={w} disabled={disabled} state={optionState(i, value === w)} onPress={() => onChange({ kind: 'text', value: w })} />
              ))}
            </Row>
          ) : (
            <TextInput
              testID="text-answer"
              accessibilityLabel="Your answer"
              editable={!disabled}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={q.type === 'code_fill' ? 'Missing code' : 'Type the missing word'}
              placeholderTextColor={t.colors.textMuted}
              value={value}
              onChangeText={(v) => onChange({ kind: 'text', value: v })}
              style={textInputStyle(t, q.type === 'code_fill')}
            />
          )}
        </View>
      );
    }

    case 'short_answer':
    case 'code_output': {
      const value = draft.kind === 'text' ? draft.value : '';
      return (
        <View style={{ gap: space.md }}>
          {promptBlock}
          {q.type === 'code_output' && q.data.code && <CodeBlock code={q.data.code} />}
          <TextInput
            testID="text-answer"
            accessibilityLabel="Your answer"
            editable={!disabled}
            multiline
            autoCapitalize={q.type === 'code_output' ? 'none' : 'sentences'}
            autoCorrect={q.type !== 'code_output'}
            placeholder={q.type === 'code_output' ? 'Exact output' : q.data.placeholder ?? 'Write your answer'}
            placeholderTextColor={t.colors.textMuted}
            value={value}
            onChangeText={(v) => onChange({ kind: 'text', value: v })}
            style={[...textInputStyle(t, q.type === 'code_output'), { minHeight: 100 }]}
          />
        </View>
      );
    }

    case 'word_order': {
      const words = q.data.words ?? [];
      const chosen = draft.kind === 'order' ? draft.value : [];
      return (
        <View style={{ gap: space.lg }}>
          {promptBlock}
          <View
            accessibilityLabel={`Your sentence: ${chosen.map((i) => words[i]).join(' ') || 'empty'}`}
            style={{ minHeight: 64, borderBottomWidth: 2, borderColor: t.colors.border, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingBottom: space.sm }}
          >
            {chosen.map((wi, pos) => (
              <WordTile key={`${wi}-${pos}`} word={words[wi] ?? ''} onPress={() => !disabled && onChange({ kind: 'order', value: chosen.filter((_, p) => p !== pos) })} />
            ))}
          </View>
          <Row style={{ flexWrap: 'wrap', justifyContent: 'center' }} gap={space.sm}>
            {words.map((w, i) => (
              <WordTile key={`${w}-${i}`} word={w} used={chosen.includes(i)} onPress={() => !disabled && onChange({ kind: 'order', value: [...chosen, i] })} />
            ))}
          </Row>
        </View>
      );
    }

    case 'match_pairs': {
      const left = q.data.left ?? [];
      const right = q.data.right ?? [];
      const d = draft.kind === 'pairs' ? draft : { kind: 'pairs' as const, value: left.map(() => null), activeLeft: null };
      const pairColors = [palette.cobalt, palette.flame, palette.mint, palette.rose, palette.amber, '#7950F2'];
      return (
        <View>
          {promptBlock}
          <Row align="flex-start" gap={space.md}>
            <View style={{ flex: 1, gap: space.sm }}>
              {left.map((l, i) => {
                const matched = d.value[i] !== null;
                return (
                  <Pressable
                    key={l}
                    testID={`left-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${l}${matched ? `, matched with ${right[d.value[i]!]}` : ''}`}
                    disabled={disabled}
                    onPress={() => onChange(pickPair(d, 'left', i))}
                    style={{
                      minHeight: 60,
                      padding: space.sm,
                      borderRadius: 12,
                      borderWidth: 2,
                      justifyContent: 'center',
                      borderColor: d.activeLeft === i ? t.colors.primary : matched ? pairColors[i % pairColors.length]! : t.colors.border,
                      backgroundColor: d.activeLeft === i ? t.colors.primarySoft : t.colors.surface,
                    }}
                  >
                    <AppText variant="smallBold">{l}</AppText>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flex: 1, gap: space.sm }}>
              {right.map((r, j) => {
                const owner = d.value.findIndex((v) => v === j);
                return (
                  <Pressable
                    key={r}
                    testID={`right-${j}`}
                    accessibilityRole="button"
                    accessibilityLabel={r}
                    disabled={disabled}
                    onPress={() => onChange(pickPair(d, 'right', j))}
                    style={{
                      minHeight: 60,
                      padding: space.sm,
                      borderRadius: 12,
                      borderWidth: 2,
                      justifyContent: 'center',
                      borderColor: owner >= 0 ? pairColors[owner % pairColors.length]! : t.colors.border,
                      backgroundColor: t.colors.surface,
                    }}
                  >
                    <AppText variant="small">{r}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </Row>
          {!reveal && (
            <AppText variant="small" muted style={{ marginTop: space.md }}>
              {d.activeLeft !== null ? `Now pick the match for “${left[d.activeLeft]}”.` : 'Tap an item on the left to start.'}
            </AppText>
          )}
        </View>
      );
    }

    case 'flashcard': {
      const d = draft.kind === 'flash' ? draft : { kind: 'flash' as const, flipped: false, value: null };
      return (
        <View style={{ gap: space.lg }}>
          {promptBlock}
          <Pressable
            testID="flashcard"
            accessibilityRole="button"
            accessibilityHint="Flip the card"
            onPress={() => onChange({ ...d, flipped: !d.flipped })}
            style={{
              minHeight: 200,
              borderRadius: radius.sheet,
              borderWidth: 3,
              borderColor: t.colors.shadowBlock,
              backgroundColor: d.flipped ? t.colors.primary : t.colors.surface,
              padding: space.xl,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space.md,
            }}
          >
            <AppText variant="heading" color={d.flipped ? '#fff' : t.colors.text} style={{ textAlign: 'center' }}>
              {d.flipped ? q.data.back : q.data.front}
            </AppText>
            <AppText variant="small" color={d.flipped ? '#E6EBFF' : t.colors.textMuted}>
              {d.flipped ? 'Tap to see the question again' : 'Tap to flip'}
            </AppText>
          </Pressable>
          {d.flipped && !disabled && onFlashAnswer && (
            <Row gap={space.md}>
              <PrimaryButton title="Still learning" kind="secondary" style={{ flex: 1 }} onPress={() => onFlashAnswer(false)} />
              <PrimaryButton title="I knew it" kind="success" style={{ flex: 1 }} onPress={() => onFlashAnswer(true)} />
            </Row>
          )}
        </View>
      );
    }
  }
}

/** Bottom feedback panel shown after checking an answer. */
export function AnswerFeedback({
  correct,
  skipped,
  correctAnswer,
  explanation,
  onContinue,
  onExplain,
  savedOffline,
}: {
  correct: boolean;
  skipped?: boolean;
  correctAnswer?: string;
  explanation?: string;
  onContinue: () => void;
  onExplain?: () => void;
  savedOffline?: boolean;
}) {
  const t = useTheme();
  const tone = savedOffline ? { bg: t.colors.surfaceAlt, fg: t.colors.text, icon: 'cloud-off' as const } : correct ? { bg: t.colors.successSoft, fg: t.colors.success, icon: 'check-circle' as const } : { bg: t.colors.dangerSoft, fg: t.colors.danger, icon: 'alert-circle' as const };
  const title = savedOffline ? 'Saved on this device' : correct ? pickPraise() : skipped ? 'Skipped for now' : 'Not quite';
  return (
    <View
      testID="answer-feedback"
      accessibilityLiveRegion="assertive"
      style={{ backgroundColor: tone.bg, padding: space.lg, gap: space.sm, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet }}
    >
      <Row>
        <Icon name={tone.icon} size={24} color={tone.fg} />
        <AppText variant="heading" color={tone.fg}>
          {title}
        </AppText>
      </Row>
      {savedOffline ? (
        <AppText variant="small">You're offline. We'll check this answer and update your progress as soon as you reconnect.</AppText>
      ) : (
        <>
          {!correct && !!correctAnswer && (
            <AppText variant="bodyBold">
              Answer: <AppText variant="body">{correctAnswer}</AppText>
            </AppText>
          )}
          {!!explanation && <AppText variant="small">{explanation}</AppText>}
        </>
      )}
      <Row gap={space.md} style={{ marginTop: space.sm }}>
        {!correct && !savedOffline && onExplain && <PrimaryButton title="Explain more" kind="secondary" icon="message-circle" style={{ flex: 1 }} onPress={onExplain} />}
        <PrimaryButton testID="continue-button" title="Continue" kind={correct || savedOffline ? 'success' : 'danger'} style={{ flex: 1 }} onPress={onContinue} />
      </Row>
    </View>
  );
}

const PRAISE = ['Nice work!', 'Correct!', 'You got it!', 'Spot on!', 'Great!'];
let praiseIndex = 0;
function pickPraise() {
  praiseIndex = (praiseIndex + 1) % PRAISE.length;
  return PRAISE[praiseIndex]!;
}
