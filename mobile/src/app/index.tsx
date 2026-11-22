import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';

/** App entry: send signed-in users to the dashboard and everyone else to sign-in. */
export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <View style={styles.container}><ActivityIndicator color="#FFFFFF" /></View>;
  return <Redirect href={user ? '/dashboard' : '/sign-in'} />;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: '#000000', flex: 1, justifyContent: 'center' },
});
