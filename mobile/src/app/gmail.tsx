import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, useRootNavigationState } from 'expo-router';
import { connectionsApi } from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-context';

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function GmailOAuthCallbackScreen() {
  const { status: statusParam, connectionId: connectionIdParam } = useLocalSearchParams<{
    status?: string | string[];
    connectionId?: string | string[];
  }>();
  const status = first(statusParam);
  const connectionId = first(connectionIdParam);
  const { user, loading: authLoading } = useAuth();
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const navigationState = useRootNavigationState();
  const previousRoute = navigationState?.routes.slice(0, navigationState.index).at(-1)?.name;

  const returnToBuilder = useCallback((showGmailConnection = false) => {
    if (previousRoute === 'canvas') {
      router.back();
      return;
    }
    if (showGmailConnection) {
      router.replace({ pathname: '/canvas', params: { showGmailConnection: '1' } });
      return;
    }
    router.replace('/canvas');
  }, [previousRoute]);

  useEffect(() => {
    if (authLoading || !user || status !== 'connected' || !connectionId) return;
    let active = true;

    void connectionsApi.get(connectionId).then((connection) => {
      if (connection.provider !== 'gmail' || connection.status !== 'CONNECTED') {
        throw new Error('The Gmail connection could not be verified. Return to the builder and try again.');
      }
      if (active) {
        returnToBuilder(true);
      }
    }).catch((error: unknown) => {
      if (active) setVerificationError(error instanceof Error ? error.message : 'The Gmail connection could not be verified.');
    });

    return () => { active = false; };
  }, [authLoading, connectionId, returnToBuilder, status, user]);

  const message = verificationError ?? (
    status === 'cancelled'
      ? 'Gmail authorization was cancelled. Your Taskvyn account is still connected.'
      : status === 'failed'
        ? 'Gmail authorization could not be completed. Your Taskvyn account is still connected.'
        : !authLoading && !user
          ? 'Taskvyn could not restore your signed-in session, so the Gmail connection could not be verified.'
          : status !== 'connected' || !connectionId
            ? 'The Gmail callback was incomplete. Return to the builder and try again.'
            : null
  );

  return <View style={styles.container}>
    {message ? <>
      <Text accessibilityRole="alert" style={styles.message}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={() => returnToBuilder()} style={styles.button}>
        <Text style={styles.buttonText}>Return to workflow builder</Text>
      </Pressable>
    </> : <>
      <ActivityIndicator color="#FFFFFF" />
      <Text style={styles.message}>Verifying your Gmail connection…</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: '#000000', flex: 1, justifyContent: 'center', padding: 28 },
  message: { color: '#FFFFFF', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  button: { backgroundColor: '#208AEF', borderRadius: 12, marginTop: 20, paddingHorizontal: 18, paddingVertical: 13 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
