import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { connectionsApi } from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-context';

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Return target of the Google OAuth redirect (mobile://oauth/gmail).
 * The connect flow normally reads the result itself; this screen only appears when
 * Android delivers the link as a deep link or re-opens the app from an old link.
 * It must never be a dead end.
 */
export default function OAuthCallbackScreen() {
  const params = useLocalSearchParams<{ status?: string | string[]; connectionId?: string | string[] }>();
  const status = first(params.status);
  const connectionId = first(params.connectionId);
  const { user, loading } = useAuth();
  const error = status === 'missing_permissions'
    ? 'Please allow every permission the app asks for, then connect the account again.'
    : status === 'failed' ? 'The account could not be connected. Please try again from the workflow builder.' : null;

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/canvas');
  };

  useEffect(() => {
    if (loading || !user) return;
    if (status !== 'connected' || !connectionId) {
      // Cancelled or stale link: go back to the builder. Failures show a message below.
      if (!error) leave();
      return;
    }
    let active = true;
    connectionsApi.get(connectionId)
      .then(() => { if (active) leave(); })
      .catch(() => { if (active) leave(); });
    return () => { active = false; };
  }, [loading, user, status, connectionId, error]);

  // Not signed in (or the session could not be restored): send the user to sign in
  // instead of showing an error they cannot act on.
  if (!loading && !user) return <Redirect href="/" />;

  return <View style={styles.container}>
    {error ? <>
      <Text accessibilityRole="alert" style={styles.message}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={leave} style={styles.button}>
        <Text style={styles.buttonText}>Return to workflow builder</Text>
      </Pressable>
    </> : <>
      <ActivityIndicator color="#FFFFFF" />
      <Text style={styles.message}>Finishing account connection…</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: '#000000', flex: 1, justifyContent: 'center', padding: 28, gap: 16 },
  message: { color: '#FFFFFF', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  button: { backgroundColor: '#208AEF', borderRadius: 12, marginTop: 4, paddingHorizontal: 18, paddingVertical: 13 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
