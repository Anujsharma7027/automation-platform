import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { AuthLanding } from '@/components/auth/auth-landing';

export default function HomeScreen() {
  const { user } = useAuth();
  if (user) return <Redirect href="/dashboard" />;
  return <AuthLanding />;
}
