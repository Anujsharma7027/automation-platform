import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from '@/auth/auth-context';

export default function RootLayout() {
  return (
    <AuthProvider><StatusBar style="light" /><Routes /></AuthProvider>
  );
}

function Routes() {
  const { user, loading } = useAuth();
  // The navigator must stay mounted at all times. Swapping it for a spinner or a
  // bare <Redirect> while the session restores breaks navigation after a reload
  // (e.g. the post-login redirect silently does nothing). Guards decide access.
  const signedIn = Boolean(user);
  return (
    <View style={styles.root}>
      <Stack screenOptions={{ animation: 'fade', contentStyle: { backgroundColor: '#000000' }, headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="gmail" />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" /><Stack.Screen name="sign-up" />
          <Stack.Screen name="forgot-password" /><Stack.Screen name="reset-password" /><Stack.Screen name="verify-email" />
        </Stack.Protected>
        {/* While restoring, keep private routes reachable so a reload on /dashboard is not bounced away. */}
        <Stack.Protected guard={signedIn || loading}>
          <Stack.Screen name="dashboard" /><Stack.Screen name="canvas" />
          <Stack.Screen name="settings" options={{ animation: 'slide_from_right', contentStyle: { backgroundColor: '#F3F3F3' } }} />
        </Stack.Protected>
      </Stack>
      {loading && !user ? <View style={styles.splash}><ActivityIndicator color="#fff" /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000', flex: 1 },
  splash: { ...StyleSheet.absoluteFillObject, alignItems: 'center', backgroundColor: '#000', justifyContent: 'center' },
});
