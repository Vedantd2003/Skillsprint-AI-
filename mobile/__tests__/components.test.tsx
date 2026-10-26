import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import type { Question } from '../src/api/types';
import { ApiError } from '../src/api/client';
import { HeartCounter, ProgressBar, StreakIndicator, XPBadge } from '../src/components/gamification';
import { AnswerFeedback, QuestionRenderer, QuizOption } from '../src/components/question';
import { EmptyState, ErrorState, LoadingState } from '../src/components/states';
import { emptyDraft, type Draft } from '../src/lesson/answers';

const mcq: Question = {
  id: 'q1',
  type: 'multiple_choice',
  prompt: 'What does const declare?',
  instructions: 'Choose the correct answer',
  data: { options: ['A constant binding', 'A loop', 'A function'] },
  topic: 'JS',
  difficulty: 1,
};

describe('quiz interactions', () => {
  it('selects a multiple-choice option', async () => {
    const onChange = jest.fn();
    await render(<QuestionRenderer question={mcq} draft={emptyDraft(mcq)} onChange={onChange} />);
    expect(screen.getByText('What does const declare?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('option-1'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'index', value: 1 });
  });

  it('shows correct/incorrect state after reveal and disables input', async () => {
    const onChange = jest.fn();
    const draft: Draft = { kind: 'index', value: 1 };
    await render(<QuestionRenderer question={mcq} draft={draft} onChange={onChange} disabled reveal={{ correct: false }} />);
    expect(screen.getByLabelText('A loop').props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('option-0'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('builds a sentence in word-order questions', async () => {
    const wo: Question = { ...mcq, id: 'w', type: 'word_order', prompt: 'Arrange', data: { words: ['here', 'I', 'am'] } };
    const onChange = jest.fn();
    await render(<QuestionRenderer question={wo} draft={emptyDraft(wo)} onChange={onChange} />);
    await fireEvent.press(screen.getByLabelText('I'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'order', value: [1] });
  });

  it('accepts typed answers for code output questions', async () => {
    const co: Question = { ...mcq, id: 'c', type: 'code_output', prompt: 'What does this print?', data: { code: 'print(1+1)', language: 'python' } };
    const onChange = jest.fn();
    await render(<QuestionRenderer question={co} draft={emptyDraft(co)} onChange={onChange} />);
    await fireEvent.changeText(screen.getByTestId('text-answer'), '2');
    expect(onChange).toHaveBeenCalledWith({ kind: 'text', value: '2' });
  });

  it('QuizOption calls onPress', async () => {
    const onPress = jest.fn();
    await render(<QuizOption label="True" onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('True'));
    expect(onPress).toHaveBeenCalled();
  });

  it('feedback panel explains and continues', async () => {
    const onContinue = jest.fn();
    await render(<AnswerFeedback correct={false} correctAnswer="float" explanation="Decimals are floats." onContinue={onContinue} />);
    expect(screen.getByText('Not quite')).toBeTruthy();
    expect(screen.getByText('Decimals are floats.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('continue-button'));
    expect(onContinue).toHaveBeenCalled();
  });

  it('labels answers saved offline as not yet synced', async () => {
    await render(<AnswerFeedback correct={false} savedOffline onContinue={jest.fn()} />);
    expect(screen.getByText('Saved on this device')).toBeTruthy();
    expect(screen.getByText(/as soon as you reconnect/)).toBeTruthy();
  });
});

describe('loading, error and empty states', () => {
  it('renders a skeleton loading state', async () => {
    await render(<LoadingState label="Loading lesson" />);
    expect(screen.getByTestId('loading-state')).toBeTruthy();
    expect(screen.getByLabelText('Loading lesson')).toBeTruthy();
  });

  it('shows an offline-specific error with retry', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState error={new ApiError(0, 'NETWORK_ERROR', "Can't reach SkillSprint.")} onRetry={onRetry} />);
    expect(screen.getByText("You're offline")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows server error messages', async () => {
    await render(<ErrorState error={new ApiError(403, 'LESSON_LOCKED', 'Complete the previous lessons first')} />);
    expect(screen.getByText('Complete the previous lessons first')).toBeTruthy();
  });

  it('renders an empty state with an action', async () => {
    const onAction = jest.fn();
    await render(<EmptyState title="Nothing due" message="All caught up." action="Go to my path" onAction={onAction} />);
    await fireEvent.press(screen.getByLabelText('Go to my path'));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('progress display', () => {
  it('exposes progress to accessibility and clamps values', async () => {
    await render(<ProgressBar value={1.7} accessibilityLabel="Daily goal" />);
    expect(screen.getByLabelText('Daily goal').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
  });

  it('shows XP, streak and hearts', async () => {
    await render(
      <>
        <XPBadge xp={1250} />
        <StreakIndicator days={7} />
        <HeartCounter hearts={3} max={5} />
      </>,
    );
    expect(screen.getByLabelText('1250 XP')).toBeTruthy();
    expect(screen.getByLabelText('7 day streak')).toBeTruthy();
    expect(screen.getByLabelText('3 of 5 hearts')).toBeTruthy();
  });
});
