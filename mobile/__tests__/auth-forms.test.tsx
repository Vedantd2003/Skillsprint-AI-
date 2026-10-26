import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { LoginForm, RegisterForm } from '../src/components/forms';
import { ApiError } from '../src/api/client';
import { useAuth } from '../src/store/auth';

describe('authentication forms', () => {
  const login = jest.fn();
  const register = jest.fn();

  beforeEach(() => {
    login.mockReset();
    register.mockReset();
    useAuth.setState({ login, register } as never);
  });

  it('validates the login form before calling the API', async () => {
    await render(<LoginForm />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('signs in with valid credentials', async () => {
    login.mockResolvedValue(undefined);
    const onDone = jest.fn();
    await render(<LoginForm onDone={onDone} />);
    await fireEvent.changeText(screen.getByTestId('login-email'), 'asha@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'Passw0rd!');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() => expect(login).toHaveBeenCalledWith('asha@example.com', 'Passw0rd!'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('shows server errors from login', async () => {
    login.mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password'));
    await render(<LoginForm />);
    await fireEvent.changeText(screen.getByTestId('login-email'), 'asha@example.com');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'wrong');
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Incorrect email or password')).toBeTruthy();
  });

  it('enforces password rules on registration', async () => {
    await render(<RegisterForm />);
    await fireEvent.changeText(screen.getByTestId('register-name'), 'Asha');
    await fireEvent.changeText(screen.getByTestId('register-email'), 'asha@example.com');
    await fireEvent.changeText(screen.getByTestId('register-password'), 'password');
    await fireEvent.press(screen.getByTestId('register-submit'));
    expect(await screen.findByText('Include at least one number')).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it('maps a taken email to the email field', async () => {
    register.mockRejectedValue(new ApiError(409, 'EMAIL_TAKEN', 'exists'));
    await render(<RegisterForm />);
    await fireEvent.changeText(screen.getByTestId('register-name'), 'Asha');
    await fireEvent.changeText(screen.getByTestId('register-email'), 'asha@example.com');
    await fireEvent.changeText(screen.getByTestId('register-password'), 'Passw0rd1');
    await fireEvent.press(screen.getByTestId('register-submit'));
    expect(await screen.findByText('An account already uses this email. Try signing in.')).toBeTruthy();
  });
});
