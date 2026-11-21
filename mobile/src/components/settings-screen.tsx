import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { IconifyIcon } from '@/components/iconify-icon';

type IconName = `${string}:${string}`;
type Row = { key: string; icon: IconName; label: string; subtitle?: string; onPress?: () => void };

const APPEARANCES = ['System', 'Light', 'Dark'] as const;
const INK = '#111111';
const MUTED = '#7A7A7A';
const PAGE = '#F3F3F3';

// Google avatar URLs default to a tiny 96px crop; request a sharp version.
function largeAvatar(url?: string | null) {
  if (!url) return null;
  return /googleusercontent\.com/.test(url) ? url.replace(/=s\d+(-c)?$/, '=s256-c') : url;
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [appearance, setAppearance] = useState<(typeof APPEARANCES)[number]>('System');
  const [signingOut, setSigningOut] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const avatar = imageFailed ? null : largeAvatar(user?.avatarUrl);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/dashboard'));
  const initials = user?.name?.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'U';

  const doSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await signOut(); router.replace('/sign-in'); } finally { setSigningOut(false); }
  };
  const confirmSignOut = () => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || window.confirm('Log out of your account?')) void doSignOut();
      return;
    }
    Alert.alert('Log out', 'Log out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void doSignOut() },
    ]);
  };

  const appRows: Row[] = [
    {
      key: 'appearance', icon: 'lucide:contrast', label: 'Appearance', subtitle: appearance,
      onPress: () => setAppearance((current) => APPEARANCES[(APPEARANCES.indexOf(current) + 1) % APPEARANCES.length]),
    },
    { key: 'haptics', icon: 'lucide:vibrate', label: 'Haptics' },
    { key: 'widget', icon: 'lucide:panel-bottom', label: 'Widget' },
    { key: 'language', icon: 'lucide:globe', label: 'App Language' },
    { key: 'advanced', icon: 'lucide:flower-2', label: 'Advanced' },
  ];
  const grokRows: Row[] = [
    { key: 'customize', icon: 'lucide:settings-2', label: 'Customize Grok' },
    { key: 'connectors', icon: 'lucide:blocks', label: 'Connectors' },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close settings" accessibilityRole="button" hitSlop={12} onPress={close} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <IconifyIcon color={INK} name="lucide:x" size={26} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          {avatar ? (
            <Image contentFit="cover" onError={() => setImageFailed(true)} source={{ uri: avatar }} style={styles.avatarImage} transition={200} />
          ) : (
            <View style={styles.avatarFallback}><Text style={styles.avatarText}>{initials}</Text></View>
          )}
          <View style={styles.profileText}>
            <Text numberOfLines={1} style={styles.name}>{user?.name || 'User'}</Text>
            <Text numberOfLines={1} style={styles.email}>{user?.email}</Text>
          </View>
        </View>
        <View style={styles.content}>

        <View style={styles.offerCard}>
          <IconifyIcon color={INK} name="lucide:circle-slash-2" size={22} />
          <View style={styles.offerText}>
            <Text style={styles.offerTitle}>Save 50% on Premium</Text>
            <Text style={styles.offerSubtitle}>Early access to <Text style={styles.offerEmphasis}>new features</Text></Text>
          </View>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.claim, pressed && styles.pressed]}>
            <Text style={styles.claimText}>Claim Offer</Text>
          </Pressable>
        </View>

        <Section rows={appRows} title="App" />
        <Section rows={grokRows} title="Grok" />

        <View style={[styles.group, styles.logoutGroup]}>
          <Pressable
            accessibilityLabel="Log out"
            accessibilityRole="button"
            disabled={signingOut}
            onPress={confirmSignOut}
            style={({ pressed }) => [styles.row, styles.rowFirst, styles.rowLast, pressed && styles.rowPressed]}>
            <View style={styles.rowIcon}>
              {signingOut ? <ActivityIndicator color="#D92D20" /> : <IconifyIcon color="#D92D20" name="lucide:log-out" size={22} />}
            </View>
            <Text style={[styles.rowLabel, styles.logoutLabel]}>Log out</Text>
          </Pressable>
        </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.group}>
        {rows.map((row, index) => (
          <Pressable
            accessibilityHint={row.subtitle ? `Currently ${row.subtitle}` : undefined}
            accessibilityRole="button"
            key={row.key}
            onPress={row.onPress}
            style={({ pressed }) => [styles.row, index === 0 && styles.rowFirst, index === rows.length - 1 && styles.rowLast, pressed && styles.rowPressed]}>
            <View style={styles.rowIcon}><IconifyIcon color={INK} name={row.icon} size={22} /></View>
            <View>
              <Text style={styles.rowLabel}>{row.label}</Text>
              {row.subtitle ? <Text style={styles.rowSubtitle}>{row.subtitle}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const CARD = '#FFFFFF';
const styles = StyleSheet.create({
  screen: { backgroundColor: PAGE, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', height: 64, paddingHorizontal: 18 },
  close: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  title: { color: INK, fontSize: 17, fontWeight: '600', marginLeft: 18 },
  profileCard: { alignItems: 'center', backgroundColor: CARD, borderRadius: 24, flexDirection: 'row', gap: 14, marginHorizontal: 16, marginTop: 14, padding: 16 },
  avatarImage: { backgroundColor: '#EDEDEB', borderRadius: 28, height: 56, width: 56 },
  avatarFallback: { alignItems: 'center', backgroundColor: '#EDEDEB', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  avatarText: { color: '#3A3A38', fontSize: 19, fontWeight: '600' },
  profileText: { flex: 1, gap: 3 },
  name: { color: INK, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  email: { color: MUTED, fontSize: 14 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  offerCard: { alignItems: 'center', backgroundColor: CARD, borderRadius: 28, flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16 },
  offerText: { flex: 1, marginLeft: 13 },
  offerTitle: { color: INK, fontSize: 13, fontWeight: '600' },
  offerSubtitle: { color: MUTED, fontSize: 11, marginTop: 3 },
  offerEmphasis: { color: INK, fontWeight: '500' },
  claim: { backgroundColor: '#0A47F0', borderRadius: 14, marginLeft: 10, paddingHorizontal: 12, paddingVertical: 5 },
  claimText: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' },
  sectionTitle: { color: MUTED, fontSize: 14, marginBottom: 16, marginLeft: 16, marginTop: 18 },
  group: { gap: 2 },
  row: { alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 4, flexDirection: 'row', minHeight: 56, paddingHorizontal: 16, paddingVertical: 14 },
  rowFirst: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  rowLast: { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  rowPressed: { backgroundColor: '#ECECEC' },
  rowIcon: { alignItems: 'center', marginRight: 17, width: 24 },
  rowLabel: { color: INK, fontSize: 16, fontWeight: '500' },
  rowSubtitle: { color: MUTED, fontSize: 14, marginTop: 3 },
  logoutGroup: { marginTop: 24 },
  logoutLabel: { color: '#D92D20' },
  pressed: { opacity: 0.6 },
});
