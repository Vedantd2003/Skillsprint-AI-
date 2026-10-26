import { Redirect } from 'expo-router';
import { useAuth } from '../store/auth';

export default function Index() {
  const status = useAuth((s) => s.status);
  const onboarded = useAuth((s) => s.onboardingComplete);
  if (status === 'signedIn') return <Redirect href={onboarded ? '/(tabs)' : '/welcome-plan'} />;
  return <Redirect href="/onboarding" />;
}
