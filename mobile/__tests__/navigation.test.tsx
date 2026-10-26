import { screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import React from 'react';
import { Text } from 'react-native';
import Index from '../src/app/index';
import { useAuth } from '../src/store/auth';

const routes = {
  index: Index,
  onboarding: () => <Text>Onboarding screen</Text>,
  'welcome-plan': () => <Text>Plan screen</Text>,
  '(tabs)/index': () => <Text>Home screen</Text>,
};

describe('entry navigation', () => {
  it('sends signed-out users to onboarding', async () => {
    useAuth.setState({ status: 'signedOut', onboardingComplete: false });
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Onboarding screen')).toBeTruthy();
    expect(screen).toHavePathname('/onboarding');
  });

  it('sends new accounts to their personalised plan', async () => {
    useAuth.setState({ status: 'signedIn', onboardingComplete: false });
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Plan screen')).toBeTruthy();
  });

  it('sends returning learners to the home dashboard', async () => {
    useAuth.setState({ status: 'signedIn', onboardingComplete: true });
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByText('Home screen')).toBeTruthy();
  });
});
