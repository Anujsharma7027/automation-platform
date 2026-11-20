import { IconifyIcon } from '@/components/iconify-icon';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ComponentRef, ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TurboModuleRegistry,
  View,
  type TurboModule,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-context';
import { authApi } from '@/auth/auth-api';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import type * as NativeGoogleAuth from 'react-native-nitro-google-signin';

WebBrowser.maybeCompleteAuthSession();

const ACCENT = '#FFFFFF';
const INK = '#1D1D1F';

type AuthFrameProps = {
  children?: ReactNode;
  footer?: ReactNode;
  subtitle?: string;
  title: string;
  onBack?: () => void;
};

function AuthFrame({ children, footer, onBack, subtitle, title }: AuthFrameProps) {
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));
  const [offset] = useState(() => new Animated.Value(12));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { duration: 360, toValue: 1, useNativeDriver: true }),
      Animated.spring(offset, { damping: 19, stiffness: 140, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [offset, opacity]);

  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <View pointerEvents="none" style={styles.glow} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.frame}>
          <View style={styles.topBar}>
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              hitSlop={12}
              onPress={back}
              style={({ pressed }) => [styles.backButton, pressed && styles.iconPressed]}>
              <IconifyIcon color="#FFFFFF" name="lucide:chevron-left" size={18} />
            </Pressable>
            <View style={styles.brandRow}>
              <Image contentFit="contain" source={require('@/assets/taskvyn.icon/white.svg')} style={styles.brandLogo} />
              <Text style={styles.brandName}>Taskvyn</Text>
            </View>
            <View style={styles.backButtonSpacer} />
          </View>

          <Animated.View style={{ opacity, transform: [{ translateY: offset }] }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {children ? <View style={styles.content}>{children}</View> : null}
          </Animated.View>
          {footer ? (
            <Animated.View style={[styles.footer, { opacity, transform: [{ translateY: offset }] }]}>{footer}</Animated.View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FieldProps = TextInputProps & {
  icon: `${string}:${string}`;
  label: string;
  password?: boolean;
};

function Field({ icon, label, password, onBlur, onFocus, ...props }: FieldProps) {
  const [hidden, setHidden] = useState(password);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <IconifyIcon color={focused ? '#FFFFFF' : '#7C7C82'} name={icon} size={16} />
        <TextInput
          autoCapitalize="none"
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          placeholderTextColor="#5E5E64"
          secureTextEntry={Boolean(password && hidden)}
          selectionColor={ACCENT}
          style={styles.input}
          {...props}
        />
        {password ? (
          <Pressable
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={10}
            onPress={() => setHidden((v) => !v)}>
            <IconifyIcon color="#7C7C82" name={hidden ? 'lucide:eye' : 'lucide:eye-off'} size={16} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
      <IconifyIcon color={INK} name="lucide:arrow-right" size={15} />
    </Pressable>
  );
}

function FormFeedback({ message, error }: { message: string; error?: boolean }) {
  return message ? <Text accessibilityLiveRegion="polite" style={{ color: error ? '#F87171' : '#A3E6B0', fontSize: 13, lineHeight: 18, marginTop: 10 }}>{message}</Text> : null;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const setNotice = (notice: string) => { setError(false); setMessage(notice); };
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage(''); setError(false);
    try { await action(); } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
    }
    finally { setBusy(false); }
  };
  return { busy, message, error, run, setNotice };
}

function OutlineButton({ icon, label, onPress, disabled = false, iconOnly = false, accessibilityLabel }: { icon: ReactNode; label: string; onPress?: () => void; disabled?: boolean; iconOnly?: boolean; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.outlineButton, iconOnly && styles.outlineIconOnly, disabled && styles.outlineDisabled, pressed && styles.outlinePressed]}>
      <View style={iconOnly ? styles.outlineIconCentered : styles.outlineIcon}>{icon}</View>
      {!iconOnly && <Text style={styles.outlineLabel}>{label}</Text>}
    </Pressable>
  );
}

function GoogleSignInButton({ showLabel = false }: { showLabel?: boolean }) {
  const googleClientId = Platform.select({
    android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const nativeClientId = Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
    : process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  if (!googleClientId || (Platform.OS !== 'web' && (!webClientId || !nativeClientId))) {
    return <GoogleSignInUnavailableButton message="Google sign-in needs OAuth client IDs. Add them to mobile/.env and backend/.env, then restart the app." />;
  }
  if (Platform.OS === 'web') return <WebGoogleSignInButton showLabel={showLabel} />;
  if (!hasNativeNitroModules()) {
    return <GoogleSignInUnavailableButton message="This app build does not include the Google sign-in native module. Rebuild the Expo development app, then restart it." />;
  }
  return <NativeGoogleSignInButton showLabel={showLabel} />;
}

function hasNativeNitroModules() {
  try {
    return TurboModuleRegistry.get<TurboModule>('NitroModules') != null;
  } catch {
    return false;
  }
}

let nativeGoogleAuthPromise: Promise<typeof NativeGoogleAuth> | null = null;

function loadNativeGoogleAuth() {
  if (!nativeGoogleAuthPromise) {
    nativeGoogleAuthPromise = import('react-native-nitro-google-signin')
      .then((nativeGoogle) => {
        nativeGoogle.GoogleOneTapSignIn.configure({
          webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
          iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        });
        return nativeGoogle;
      })
      .catch((error: unknown) => {
        nativeGoogleAuthPromise = null;
        throw error;
      });
  }
  return nativeGoogleAuthPromise;
}

function GoogleSignInUnavailableButton({ message: explanation }: { message: string }) {
  return <View style={styles.googleControl}>
    <OutlineButton disabled icon={<IconifyIcon name="logos:google-icon" size={16} />} label="Google sign-in unavailable" />
    <FormFeedback error message={explanation} />
  </View>;
}

function NativeGoogleSignInButton({ showLabel }: { showLabel: boolean }) {
  const [busy, setBusy] = useState(false);
  const [nativeReady, setNativeReady] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const busyRef = useRef(false);
  const nativeGoogleRef = useRef<typeof NativeGoogleAuth | null>(null);
  const { acceptTokens } = useAuth();

  useEffect(() => {
    let alive = true;
    loadNativeGoogleAuth().then((nativeGoogle) => {
      if (alive) {
        nativeGoogleRef.current = nativeGoogle;
        setNativeReady(true);
      }
    }).catch(() => {
      if (alive) {
        setError(true);
        setMessage('Google sign-in needs an Expo development build.');
      }
    });
    return () => { alive = false; };
  }, []);

  const signInWithGoogle = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      const nativeGoogle = nativeGoogleRef.current;
      if (!nativeGoogle) throw new Error('Google sign-in needs an Expo development build.');
      if (Platform.OS === 'android') await nativeGoogle.GoogleOneTapSignIn.checkPlayServices();
      // `signIn()` restores an authorized account on Android. Use the package's
      // interactive flow so users can choose any device account on every attempt.
      let result = await nativeGoogle.GoogleOneTapSignIn.createAccount();
      if (nativeGoogle.isNoSavedCredentialFoundResponse(result)) result = await nativeGoogle.GoogleOneTapSignIn.presentExplicitSignIn();
      if (nativeGoogle.isCancelledResponse(result)) {
        setMessage('Google sign-in was cancelled.');
        return;
      }
      if (!nativeGoogle.isSuccessResponse(result) || !result.data.idToken) {
        throw new Error('Google did not return a valid sign-in token. Please try again.');
      }
      await acceptTokens(await authApi.google({ idToken: result.data.idToken }));
      router.replace('/dashboard');
    } catch (caught) {
      setError(true);
      setMessage(caught instanceof Error ? caught.message : 'Google sign-in failed. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return <View style={styles.googleControl}>
    <OutlineButton disabled={busy || !nativeReady} icon={<IconifyIcon name="logos:google-icon" size={16} />} label={showLabel ? 'Continue with Google' : ''} accessibilityLabel={busy ? 'Connecting to Google' : showLabel ? 'Continue with Google' : nativeReady ? 'Sign in with Google' : 'Preparing Google sign-in'} iconOnly={!showLabel} onPress={signInWithGoogle} />
    <FormFeedback error={error} message={message} />
  </View>;
}

function WebGoogleSignInButton({ showLabel }: { showLabel: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const busyRef = useRef(false);
  const handledResponse = useRef(false);
  const { acceptTokens } = useAuth();
  const [request, response, promptAsync] = useIdTokenAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    selectAccount: true,
    scopes: ['openid', 'email', 'profile'],
  });

  useEffect(() => {
    if (response?.type === 'error' && busyRef.current) {
      busyRef.current = false;
      setBusy(false);
      setError(true);
      setMessage(response.error?.message || 'Google sign-in failed. Please try again.');
      return;
    }
    if (response?.type !== 'success' || !response.params.id_token || handledResponse.current) return;
    handledResponse.current = true;
    void (async () => {
      try {
        await acceptTokens(await authApi.google({ idToken: response.params.id_token }));
        router.replace('/dashboard');
      } catch (caught) {
        setError(true);
        setMessage(caught instanceof Error ? caught.message : 'Google sign-in failed. Please try again.');
        busyRef.current = false;
        setBusy(false);
      }
    })();
  }, [acceptTokens, response]);

  const signInWithGoogle = async () => {
    if (busyRef.current) return;
    if (!request) {
      setError(true);
      setMessage('Google sign-in is still initializing. Please try again.');
      return;
    }
    busyRef.current = true;
    handledResponse.current = false;
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      const result = await promptAsync();
      if (result.type === 'cancel' || result.type === 'dismiss') {
        busyRef.current = false;
        setBusy(false);
        setMessage('Google sign-in was cancelled.');
      } else if (result.type === 'error') {
        busyRef.current = false;
        setBusy(false);
        setError(true);
        setMessage(result.error?.message || 'Google sign-in failed. Please try again.');
      }
      // On native, Expo exchanges Google's authorization code for an ID token;
      // the response effect completes the app login once that exchange finishes.
    } catch (caught) {
      busyRef.current = false;
      setBusy(false);
      setError(true);
      setMessage(caught instanceof Error ? caught.message : 'Google sign-in failed. Please try again.');
    }
  };

  return <View style={styles.googleControl}>
    <OutlineButton disabled={busy} icon={<IconifyIcon name="logos:google-icon" size={16} />} label={showLabel ? 'Continue with Google' : ''} accessibilityLabel={busy ? 'Connecting to Google' : showLabel ? 'Continue with Google' : 'Sign in with Google'} iconOnly={!showLabel} onPress={signInWithGoogle} />
    <FormFeedback error={error} message={message} />
  </View>;
}

function Divider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function AuthSwitch({ label, link, onPress }: { label: string; link: string; onPress: () => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchMuted}>{label} </Text>
      <Pressable accessibilityRole="link" hitSlop={8} onPress={onPress}>
        <Text style={styles.switchLink}>{link}</Text>
      </Pressable>
    </View>
  );
}

function SocialRow() {
  return (
    <View style={styles.socialRow}>
      <View style={{ flex: 1 }}><GoogleSignInButton /></View>
      <Pressable accessibilityLabel="Continue with Apple" accessibilityRole="button" style={styles.socialButton}>
        <IconifyIcon color="#FFFFFF" name="simple-icons:apple" size={18} />
      </Pressable>
    </View>
  );
}

export function SignInScreen() {
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { acceptTokens } = useAuth();
  const action = useAction();
  const signIn = () => action.run(async () => { const tokens = await authApi.signin({ email: email.trim(), password }); await acceptTokens(tokens); router.replace('/dashboard'); });

  if (emailMode) {
    return (
      <AuthFrame
        footer={
          <>
            <PrimaryButton label={action.busy ? 'Logging in…' : 'Log In'} onPress={signIn} />
            <AuthSwitch label="New to Taskvyn?" link="Sign Up" onPress={() => router.replace('/sign-up')} />
            <FormFeedback error={action.error} message={action.message} />
          </>
        }
        onBack={() => setEmailMode(false)}
        subtitle="Welcome back. Enter your details to continue."
        title="Log in with email">
        <View style={styles.form}>
          <Field autoComplete="email" icon="lucide:mail" keyboardType="email-address" label="Email" onChangeText={setEmail} placeholder="you@example.com" value={email} />
          <Field autoComplete="current-password" icon="lucide:lock-keyhole" label="Password" onChangeText={setPassword} password placeholder="Enter your password" value={password} />
          <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')} style={styles.forgotLink}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        </View>
      </AuthFrame>
    );
  }

  return <SignInMethods onEmail={() => setEmailMode(true)} />;
}

/** Original sign-in layout: close button, centered brand + heading, options at the bottom. */
function SignInMethods({ onEmail }: { onEmail: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.frame, styles.methodsFrame]}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          hitSlop={14}
          onPress={() => router.replace('/')}
          style={({ pressed }) => [styles.methodsClose, pressed && styles.iconPressed]}>
          <IconifyIcon color="#FFFFFF" name="lucide:x" size={24} />
        </Pressable>
        <View style={styles.methodsHeading}>
          <View style={styles.brandRow}>
            <Image contentFit="contain" source={require('@/assets/taskvyn.icon/white.svg')} style={styles.methodsLogo} />
            <Text style={styles.methodsBrand}>
              Taskvyn <Text style={styles.methodsBrandLight}>account</Text>
            </Text>
          </View>
          <Text style={styles.methodsTitle}>{'Log in to Taskvyn using\nyour preferred method!'}</Text>
        </View>
        <View style={styles.socialStack}>
          <OutlineButton icon={<IconifyIcon color="#FFFFFF" name="lucide:mail" size={17} />} label="Continue with email" onPress={onEmail} />
          <GoogleSignInButton showLabel />
          <OutlineButton icon={<IconifyIcon color="#FFFFFF" name="simple-icons:apple" size={17} />} label="Continue with Apple" />
        </View>
        <AuthSwitch label="New to Taskvyn?" link="Sign Up" onPress={() => router.replace('/sign-up')} />
      </View>
    </View>
  );
}

export function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const action = useAction();
  const createAccount = () => action.run(async () => {
    const result = await authApi.signup({ name: name.trim(), email: email.trim(), password });
    router.push({ pathname: '/verify-email', params: { email: result.email, flow: 'signup', notice: result.message } });
  });
  return (
    <AuthFrame
      footer={
        <>
          <PrimaryButton label={action.busy ? 'Creating account…' : 'Create Account'} onPress={createAccount} />
          <AuthSwitch label="Already have an account?" link="Log In" onPress={() => router.replace('/sign-in')} />
          <FormFeedback error={action.error} message={action.message} />
        </>
      }
      subtitle="Start building automations in minutes." title="Create your account">
      <View style={styles.form}>
        <Field autoCapitalize="words" autoComplete="name" icon="lucide:user" label="Full name" onChangeText={setName} placeholder="Jane Cooper" value={name} />
        <Field autoComplete="email" icon="lucide:mail" keyboardType="email-address" label="Email" onChangeText={setEmail} placeholder="you@example.com" value={email} />
        <Field autoComplete="new-password" icon="lucide:lock-keyhole" label="Password" onChangeText={setPassword} password placeholder="Create a password" value={password} />
        <Text style={styles.helper}>At least 8 characters, including a number and a symbol.</Text>
      </View>
      <Divider label="or sign up with" />
      <SocialRow />
    </AuthFrame>
  );
}

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const action = useAction();
  const requestCode = () => action.run(async () => {
    await authApi.forgotPassword(email.trim());
    router.push({ pathname: '/verify-email', params: { email: email.trim(), flow: 'reset' } });
  });
  return (
    <AuthFrame
      footer={
        <>
          <PrimaryButton label={action.busy ? 'Sending…' : 'Send Code'} onPress={requestCode} />
          <Pressable accessibilityRole="link" onPress={() => router.replace('/sign-in')} style={styles.centerLink}>
            <IconifyIcon color="#FFFFFF" name="lucide:arrow-left" size={14} />
            <Text style={styles.centerLinkText}>Back to Log In</Text>
          </Pressable>
          <FormFeedback error={action.error} message={action.message} />
        </>
      }
      subtitle="Enter your email and we'll send you a 6-digit code to reset your password." title="Forgot password?">
      <Field autoComplete="email" icon="lucide:mail" keyboardType="email-address" label="Email" onChangeText={setEmail} placeholder="you@example.com" value={email} />
    </AuthFrame>
  );
}
export function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string; flow?: string; notice?: string }>();
  const email = Array.isArray(params.email) ? params.email[0] : params.email ?? '';
  const flow = Array.isArray(params.flow) ? params.flow[0] : params.flow ?? 'signup';
  const notice = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const refs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);

  const { acceptTokens } = useAuth();
  const action = useAction();
  const verify = () => action.run(async () => {
    const code = digits.join('');
    if (code.length !== 6) throw new Error('Enter the 6-digit code.');
    if (flow === 'reset') { router.push({ pathname: '/reset-password', params: { email, code } }); return; }
    await acceptTokens(await authApi.verifyEmail({ email, code }));
    router.replace('/dashboard');
  });
  const resend = () => action.run(async () => {
    const result = await authApi.resendOtp({ email, purpose: flow === 'reset' ? 'password-reset' : 'verification' });
    action.setNotice(result.message);
  });

  const updateDigit = (value: string, index: number) => {
    const next = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => current.map((d, i) => (i === index ? next : d)));
    if (next && index < 5) refs.current[index + 1]?.focus();
  };

  return (
    <AuthFrame
      footer={
        <>
          <PrimaryButton label={action.busy ? 'Please wait…' : flow === 'reset' ? 'Continue' : 'Verify Email'} onPress={verify} />
          <AuthSwitch label="Didn’t receive the code?" link="Resend" onPress={resend} />
          {notice ? <FormFeedback message={notice} /> : null}
          <FormFeedback error={action.error} message={action.message} />
        </>
      }
      subtitle={`We sent a 6-digit code to ${email || 'your email'}. Enter it below to continue.`} title={flow === 'reset' ? 'Reset your password' : 'Verify your email'}>
      <View style={styles.otpRow}>
        {digits.map((digit, index) => (
          <TextInput
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            accessibilityLabel={`Verification digit ${index + 1}`}
            autoFocus={index === 0}
            keyboardType="number-pad"
            maxLength={1}
            onChangeText={(v) => updateDigit(v, index)}
            onFocus={() => setFocusedIndex(index)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus();
            }}
            selectionColor={ACCENT}
            style={[styles.otpInput, digit ? styles.otpFilled : null, focusedIndex === index && styles.otpFocused]}
            value={digit}
          />
        ))}
      </View>
    </AuthFrame>
  );
}

export function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string; code?: string }>();
  const email = Array.isArray(params.email) ? params.email[0] : params.email ?? '';
  const code = Array.isArray(params.code) ? params.code[0] : params.code ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const action = useAction();
  const reset = () => action.run(async () => {
    if (password !== confirmation) throw new Error('Passwords do not match.');
    await authApi.resetPassword({ email, code, password });
    router.replace('/sign-in');
  });
  return (
    <AuthFrame
      footer={<><PrimaryButton label={action.busy ? 'Updating…' : 'Reset Password'} onPress={reset} /><FormFeedback error={action.error} message={action.message} /></>}
      subtitle="Your new password must be different from ones you've used before." title="Set a new password">
      <View style={styles.form}>
        <Field autoComplete="new-password" icon="lucide:lock-keyhole" label="New password" onChangeText={setPassword} password placeholder="Enter new password" value={password} />
        <Field autoComplete="new-password" icon="lucide:shield-check" label="Confirm password" onChangeText={setConfirmation} password placeholder="Re-enter new password" value={confirmation} />
        <Text style={styles.helper}>At least 8 characters, including a number and a symbol.</Text>
      </View>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#000000', flex: 1 },
  glow: {
    experimental_backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.07), rgba(0,0,0,0) 60%)',
    height: 420,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  } as object,
  scroll: { flexGrow: 1 },
  methodsFrame: { flex: 1 },
  methodsClose: { alignItems: 'center', alignSelf: 'flex-end', height: 44, justifyContent: 'center', width: 44 },
  methodsHeading: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingVertical: 32 },
  methodsLogo: { height: 20, width: 20 },
  methodsBrand: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  methodsBrandLight: { fontWeight: '400' },
  methodsTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 29,
    marginTop: 16,
    textAlign: 'center',
  },
  footer: { marginTop: 'auto', paddingTop: 28 },
  frame: { alignSelf: 'center', flex: 1, maxWidth: 480, paddingHorizontal: 28, width: '100%' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 26 },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 11,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  backButtonSpacer: { width: 34 },
  iconPressed: { opacity: 0.6, transform: [{ scale: 0.94 }] },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  brandLogo: { height: 18, width: 18 },
  brandName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: -0.6 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.5, lineHeight: 28 },
  subtitle: { color: '#8E8E94', fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  content: { marginTop: 22 },
  form: { gap: 13 },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: '#C9C9CE', fontSize: 12, fontWeight: '600', marginLeft: 4 },
  field: {
    alignItems: 'center',
    backgroundColor: '#0E0E10',
    borderColor: '#26262A',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
  },
  fieldFocused: { backgroundColor: '#141416', borderColor: '#8A8A90' },
  input: { color: '#FFFFFF', flex: 1, fontSize: 14.5, height: '100%', outlineStyle: 'none' } as object,
  forgotLink: { alignSelf: 'flex-end', marginTop: -4 },
  forgotText: { color: ACCENT, fontSize: 13, fontWeight: '700' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: ACCENT,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    height: 50,
    justifyContent: 'center',
    marginTop: 6,
  },
  pressed: { opacity: 0.86, transform: [{ scale: 0.985 }] },
  primaryButtonText: { color: INK, fontSize: 15, fontWeight: '800' },
  socialStack: { gap: 12 },
  outlineButton: {
    alignItems: 'center',
    backgroundColor: '#0B0B0D',
    borderColor: '#26262A',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    height: 42,
    justifyContent: 'center',
  },
  outlinePressed: { backgroundColor: '#141417', borderColor: '#45454B', transform: [{ scale: 0.985 }] },
  outlineDisabled: { opacity: 0.58 },
  outlineIconOnly: { alignItems: 'center', justifyContent: 'center' },
  googleControl: { gap: 2 },
  outlineIcon: { left: 22, position: 'absolute' },
  outlineIconCentered: { position: 'relative' },
  outlineLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  divider: { alignItems: 'center', flexDirection: 'row', gap: 12, marginVertical: 20 },
  dividerLine: { backgroundColor: '#222226', flex: 1, height: 1 },
  dividerText: { color: '#6E6E74', fontSize: 12 },
  socialRow: { flexDirection: 'row', gap: 12 },
  socialButton: {
    alignItems: 'center',
    backgroundColor: '#0B0B0D',
    borderColor: '#26262A',
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  switchMuted: { color: '#7A7A80', fontSize: 13 },
  switchLink: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  helper: { color: '#6E6E74', fontSize: 12, lineHeight: 16, marginLeft: 4, marginTop: -6 },
  centerLink: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: 6, marginTop: 20 },
  centerLinkText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  otpRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginBottom: 22 },
  otpInput: {
    backgroundColor: '#0E0E10',
    borderColor: '#26262A',
    borderRadius: 13,
    borderWidth: 1,
    color: '#FFFFFF',
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    height: 50,
    maxWidth: 64,
    outlineStyle: 'none',
    textAlign: 'center',
  } as object,
  otpFilled: { borderColor: '#3A3A40' },
  otpFocused: { backgroundColor: '#141416', borderColor: '#8A8A90' },
});
