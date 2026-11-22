import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import {
  ConnectedAccount, connectionsApi, FieldDefinition, IntegrationApp, integrationsApi, OperationDefinition,
} from '@/auth/auth-api';
import { IconifyIcon } from '@/components/iconify-icon';

/** Configuration of one canvas node. Saved into the workflow on publish. */
export type StepDraft = {
  operation?: string;
  connectionId?: string;
  input: Record<string, unknown>;
  /** Example output used to offer field mapping in later steps. */
  sample?: Record<string, unknown>;
};

/** Data offered for mapping into an action field. */
export type MappingSource = { label: string; prefix: string; sample: Record<string, unknown> };

type Props = {
  app: { id: string; label: string; icon: `${string}:${string}`; bg: string };
  role: 'trigger' | 'action';
  stepNumber: number;
  value: StepDraft;
  sources: MappingSource[];
  anim: Animated.Value;
  onChange: (draft: StepDraft, operationName?: string) => void;
  onClose: () => void;
  onChangeApp: () => void;
};

export function StepConfigDrawer({ app, role, stepNumber, value, sources, anim, onChange, onClose, onChangeApp }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [tab, setTab] = useState<'Setup' | 'Test'>('Setup');
  const [catalog, setCatalog] = useState<IntegrationApp | null | undefined>(undefined);
  const [catalogError, setCatalogError] = useState('');
  const [operationsOpen, setOperationsOpen] = useState(!value.operation);

  useEffect(() => {
    let alive = true;
    integrationsApi.catalog()
      .then((apps) => { if (alive) setCatalog(apps.find((item) => item.key === app.id) ?? null); })
      .catch((error: unknown) => { if (alive) setCatalogError(error instanceof Error ? error.message : 'Could not load apps.'); });
    return () => { alive = false; };
  }, [app.id]);

  const operations: OperationDefinition[] = catalog ? (role === 'trigger' ? catalog.triggers : catalog.actions) : [];
  const operation = operations.find((item) => item.key === value.operation);
  const missingRequired = operation?.inputFields.some((field) => field.required && isBlank(value.input[field.key])) ?? true;
  const needsAccount = catalog?.auth.type === 'oauth2';
  const ready = Boolean(operation) && (!needsAccount || Boolean(value.connectionId)) && !missingRequired;

  const update = (patch: Partial<StepDraft>) => onChange({ ...value, ...patch }, (patch.operation ? operations.find((item) => item.key === patch.operation) : operation)?.name);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  const scrimOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.42] });

  return <View style={styles.layer}>
    <Animated.View style={[styles.scrim, { opacity: scrimOpacity }]}><Pressable accessibilityLabel="Close configuration" onPress={onClose} style={{ flex: 1 }} /></Animated.View>
    <Animated.View style={[styles.drawer, { paddingBottom: Math.max(insets.bottom, 16), transform: [{ translateY }] }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: app.bg }]}><IconifyIcon name={app.icon} size={24} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>STEP {stepNumber} · {role === 'trigger' ? 'TRIGGER' : 'ACTION'}</Text>
          <Text numberOfLines={1} style={styles.title}>{operation?.name ?? (role === 'trigger' ? 'Select the event' : 'Select the action')}</Text>
        </View>
        <Pressable accessibilityLabel="Close configuration" onPress={onClose} style={styles.closeBtn}><IconifyIcon color="#1B1C1E" name="lucide:x" size={20} /></Pressable>
      </View>
      <View style={styles.tabs}>
        {(['Setup', 'Test'] as const).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}><Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text></Pressable>)}
      </View>

      {catalog === undefined && !catalogError ? <View style={styles.center}><ActivityIndicator color="#555850" /></View> : null}
      {catalogError ? <View style={styles.content}><Text style={styles.error}>{catalogError}</Text></View> : null}
      {catalog === null ? <View style={styles.content}>
        <AppRow app={app} onChangeApp={onChangeApp} />
        <Text style={styles.hint}>{app.label} isn’t available for automations yet. Choose a supported app such as Gmail, Google Sheets, Google Calendar, Google Drive or Google Forms.</Text>
      </View> : null}

      {catalog && tab === 'Setup' ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppRow app={app} onChangeApp={onChangeApp} />

        <Text style={styles.label}>{role === 'trigger' ? 'TRIGGER EVENT' : 'ACTION EVENT'} <Text style={styles.required}>*</Text></Text>
        <Text style={styles.hint}>{role === 'trigger' ? 'Choose what starts this workflow.' : 'Choose what this step does.'}</Text>
        <Pressable accessibilityRole="button" onPress={() => setOperationsOpen((open) => !open)} style={styles.select}>
          <Text style={[styles.selectText, !operation && styles.placeholder]}>{operation?.name ?? 'Select an event'}</Text>
          <IconifyIcon color="#747771" name={operationsOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'} size={17} />
        </Pressable>
        {operationsOpen ? <View style={styles.options}>{operations.map((item) => <Pressable key={item.key} accessibilityRole="radio" accessibilityState={{ selected: item.key === value.operation }} onPress={() => {
          update({ operation: item.key, input: defaults(item.inputFields), sample: item.sample });
          setOperationsOpen(false);
        }} style={[styles.option, item.key === value.operation && styles.optionSelected]}>
          <Radio selected={item.key === value.operation} />
          <View style={{ flex: 1 }}><Text style={styles.optionText}>{item.name}</Text><Text style={styles.optionHint}>{item.description}</Text></View>
        </Pressable>)}</View> : <View style={{ height: 20 }} />}

        {needsAccount && catalog.auth.type === 'oauth2' ? <>
          <Text style={styles.label}>ACCOUNT <Text style={styles.required}>*</Text></Text>
          <AccountPicker appKey={catalog.key} appName={catalog.name} provider={catalog.auth.provider} value={value.connectionId} onChange={(connectionId) => update({ connectionId })} />
        </> : null}

        {operation ? <>
          <Text style={[styles.label, { marginTop: 22 }]}>{role === 'trigger' ? 'TRIGGER SETTINGS' : 'FIELDS'}</Text>
          {operation.inputFields.length === 0 ? <Text style={styles.hint}>No settings needed.</Text> : null}
          {operation.inputFields.map((field) => <FieldInput key={field.key} appKey={catalog.key} field={field} connectionId={value.connectionId} input={value.input}
            sources={role === 'action' ? sources : []} value={value.input[field.key]} onChange={(next) => update({ input: { ...value.input, [field.key]: next } })} />)}
        </> : null}
      </ScrollView> : null}

      {catalog && tab === 'Test' ? <TestPanel app={catalog} role={role} draft={value} ready={ready} onSample={(sample) => update({ sample })} /> : null}

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" disabled={!ready} onPress={onClose} style={[styles.continue, !ready && styles.continueDisabled]}>
          <Text style={styles.continueText}>{ready ? 'Done' : 'Complete the required fields'}</Text>
          {ready ? <IconifyIcon color="#FFFFFF" name="lucide:check" size={17} /> : null}
        </Pressable>
      </View>
    </Animated.View>
  </View>;
}

function AppRow({ app, onChangeApp }: { app: Props['app']; onChangeApp: () => void }) {
  return <>
    <Text style={styles.label}>APP</Text>
    <View style={styles.appRow}>
      <View style={[styles.smallIcon, { backgroundColor: app.bg }]}><IconifyIcon name={app.icon} size={20} /></View>
      <Text style={styles.appName}>{app.label}</Text>
      <Pressable accessibilityRole="button" onPress={onChangeApp}><Text style={styles.change}>Change</Text></Pressable>
    </View>
  </>;
}

function Radio({ selected }: { selected: boolean }) {
  return <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>{selected ? <View style={styles.radioInner} /> : null}</View>;
}

/** Lists every account of the provider; users may connect as many accounts as they like. */
function AccountPicker({ appKey, appName, provider, value, onChange }: { appKey: string; appName: string; provider: string; value?: string; onChange: (id: string | undefined) => void }) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  const load = useCallback(() => connectionsApi.list({ app: appKey }).then((result) => {
    setAccounts(result);
    return result;
  }).catch((error: unknown) => {
    setIsError(true);
    setMessage(error instanceof Error ? error.message : 'Could not load accounts.');
    return null;
  }).finally(() => setLoading(false)), [appKey]);

  useEffect(() => {
    let alive = true;
    connectionsApi.list({ app: appKey })
      .then((result) => { if (alive) setAccounts(result); })
      .catch((error: unknown) => {
        if (!alive) return;
        setIsError(true);
        setMessage(error instanceof Error ? error.message : 'Could not load accounts.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [appKey]);

  const connect = async () => {
    if (busy) return;
    setBusy(true); setMessage(''); setIsError(false);
    try {
      const flow = await connectionsApi.beginConnect(provider, [appKey]);
      const result = await WebBrowser.openAuthSessionAsync(flow.authorizationUrl, flow.callbackUrl);
      if (result.type !== 'success' || !result.url) { setMessage('Authorization was cancelled.'); return; }
      const params = Linking.parse(result.url).queryParams ?? {};
      const status = typeof params.status === 'string' ? params.status : '';
      if (status === 'cancelled') { setMessage('Authorization was cancelled.'); return; }
      if (status === 'missing_permissions') throw new Error(`Please allow every permission ${appName} needs, then try again.`);
      if (status !== 'connected') throw new Error('The account could not be connected. Please try again.');
      await load();
      if (typeof params.connectionId === 'string') onChange(params.connectionId);
      setMessage('Account connected.');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'The account could not be connected.');
    } finally {
      setBusy(false);
    }
  };

  if (Platform.OS === 'web') return <Text style={styles.note}>Connect accounts from the Taskvyn Android or iOS app.</Text>;

  return <View>
    {loading ? <View style={styles.row}><ActivityIndicator color="#555850" size="small" /><Text style={styles.note}>Loading accounts…</Text></View> : null}
    {!loading && accounts.length === 0 ? <Text style={styles.hint}>Connect the account this step should use.</Text> : null}
    {accounts.map((account) => {
      const authorized = account.authorizedApps.includes(appKey);
      const usable = authorized && account.status !== 'REVOKED' && account.status !== 'ERROR';
      const selected = value === account.id;
      return <Pressable key={account.id} accessibilityRole="radio" accessibilityState={{ selected, disabled: !usable }} disabled={!usable}
        onPress={() => onChange(account.id)} style={[styles.account, selected && styles.accountSelected, !usable && styles.accountDisabled]}>
        <Radio selected={selected} />
        <View style={{ flex: 1 }}>
          {account.displayName ? <Text style={styles.accountName}>{account.displayName}</Text> : null}
          <Text selectable style={styles.accountEmail}>{account.accountEmail}</Text>
          {!authorized ? <Text style={styles.warning}>Needs permission for {appName} — reconnect below.</Text> : null}
          {account.status === 'REVOKED' || account.status === 'ERROR' ? <Text style={styles.warning}>Access was revoked — reconnect below.</Text> : null}
        </View>
      </Pressable>;
    })}
    <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => void connect()} style={[styles.connect, (busy || loading) && styles.connectDisabled]}>
      {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <IconifyIcon color="#FFFFFF" name="lucide:plus" size={16} />}
      <Text style={styles.connectText}>{busy ? 'Waiting for authorization…' : accounts.length ? 'Connect another account / reconnect' : `Connect ${appName}`}</Text>
    </Pressable>
    {message ? <Text accessibilityRole="alert" style={[styles.message, isError && styles.error]}>{message}</Text> : null}
  </View>;
}

function FieldInput({ appKey, field, value, input, connectionId, sources, onChange }: {
  appKey: string; field: FieldDefinition; value: unknown; input: Record<string, unknown>; connectionId?: string;
  sources: MappingSource[]; onChange: (value: unknown) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [choices, setChoices] = useState<{ label: string; value: string }[] | null>(field.options ?? null);
  const [loadingChoices, setLoadingChoices] = useState(false);
  const [choiceError, setChoiceError] = useState('');
  const text = value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);

  const loadChoices = async () => {
    if (!field.dynamicOptions) return;
    setLoadingChoices(true); setChoiceError('');
    try {
      setChoices(await integrationsApi.options(appKey, field.dynamicOptions, connectionId, input));
    } catch (error) {
      setChoiceError(error instanceof Error ? error.message : 'Could not load choices.');
    } finally {
      setLoadingChoices(false);
    }
  };

  const chips = useMemo(() => sources.flatMap((source) => Object.entries(source.sample)
    .filter(([, sample]) => sample === null || ['string', 'number', 'boolean'].includes(typeof sample))
    .slice(0, 30)
    .map(([key, sample]) => ({ token: `{{${source.prefix}.${key}}}`, label: `${source.label}: ${key}`, sample: String(sample ?? '') }))), [sources]);

  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{field.label}{field.required ? <Text style={styles.required}> *</Text> : null}</Text>
    {field.helpText ? <Text style={styles.hint}>{field.helpText}</Text> : null}

    {field.type === 'boolean' ? <Pressable accessibilityRole="switch" accessibilityState={{ checked: value === true }} onPress={() => onChange(!(value === true))} style={styles.toggleRow}>
      <View style={[styles.toggle, value === true && styles.toggleOn]}><View style={[styles.knob, value === true && styles.knobOn]} /></View>
      <Text style={styles.selectText}>{value === true ? 'Yes' : 'No'}</Text>
    </Pressable> : <>
      {field.type === 'select' && choices ? <View style={styles.choiceWrap}>{choices.map((choice) => <Pressable key={choice.value} accessibilityRole="radio" accessibilityState={{ selected: value === choice.value }}
        onPress={() => onChange(choice.value)} style={[styles.choice, value === choice.value && styles.choiceSelected]}>
        <Text style={[styles.choiceText, value === choice.value && styles.choiceTextSelected]}>{choice.label}</Text>
      </Pressable>)}</View> : null}
      {field.dynamicOptions ? <Pressable accessibilityRole="button" disabled={!connectionId || loadingChoices} onPress={() => void loadChoices()} style={styles.loadChoices}>
        {loadingChoices ? <ActivityIndicator size="small" color="#555850" /> : <IconifyIcon color="#42454A" name="lucide:refresh-cw" size={13} />}
        <Text style={styles.loadChoicesText}>{connectionId ? choices ? 'Reload choices' : 'Load choices from account' : 'Choose an account to load choices'}</Text>
      </Pressable> : null}
      {choiceError ? <Text style={[styles.message, styles.error]}>{choiceError}</Text> : null}
      {field.type === 'select' && field.options && !field.dynamicOptions ? null : <TextInput
        accessibilityLabel={field.label}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={field.type === 'text' || field.type === 'json'}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        placeholder={field.placeholder ?? (field.type === 'select' ? 'Or type a value' : '')}
        placeholderTextColor="#A4A6A0"
        keyboardType={field.type === 'number' ? 'numeric' : field.type === 'email' ? 'email-address' : 'default'}
        style={[styles.input, (field.type === 'text' || field.type === 'json') && styles.inputMultiline]}
        value={text}
      />}
    </>}

    {focused && chips.length ? <View>
      <Text style={styles.mapHint}>Insert data from earlier steps</Text>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {chips.map((chip) => <Pressable key={chip.token} onPress={() => onChange(`${text}${chip.token}`)} style={styles.chip}>
          <Text numberOfLines={1} style={styles.chipLabel}>{chip.label}</Text>
          {chip.sample ? <Text numberOfLines={1} style={styles.chipSample}>{chip.sample}</Text> : null}
        </Pressable>)}
      </ScrollView>
    </View> : null}
  </View>;
}

function TestPanel({ app, role, draft, ready, onSample }: { app: IntegrationApp; role: 'trigger' | 'action'; draft: StepDraft; ready: boolean; onSample: (sample: Record<string, unknown>) => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ data: Record<string, unknown>; usedSample: boolean } | null>(null);
  const [error, setError] = useState('');

  const test = async () => {
    if (!draft.operation) return;
    setLoading(true); setError('');
    try {
      const response = await integrationsApi.testTrigger(app.key, draft.operation, draft.connectionId, draft.input);
      const data = response.items[0]?.data ?? response.sample;
      setResult({ data, usedSample: response.usedSample });
      onSample(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The trigger could not be tested.');
    } finally {
      setLoading(false);
    }
  };

  if (role === 'action') {
    return <View style={[styles.content, { flex: 1 }]}>
      <Text style={styles.hint}>Actions make real changes, so they only run when the workflow runs. Use “Run once” on the canvas to test the whole workflow with your latest trigger data.</Text>
    </View>;
  }
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.hint}>Find recent {app.name} data to confirm the trigger is set up correctly and to map fields in later steps.</Text>
    <Pressable accessibilityRole="button" disabled={!ready || loading} onPress={() => void test()} style={[styles.connect, (!ready || loading) && styles.connectDisabled]}>
      {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <IconifyIcon color="#FFFFFF" name="lucide:flask-conical" size={16} />}
      <Text style={styles.connectText}>{loading ? 'Testing…' : ready ? 'Test trigger' : 'Finish setup first'}</Text>
    </Pressable>
    {error ? <Text style={[styles.message, styles.error]}>{error}</Text> : null}
    {result ? <View style={styles.result}>
      <Text style={styles.resultTitle}>{result.usedSample ? 'No recent data found — showing example data' : 'Found recent data'}</Text>
      {Object.entries(result.data).slice(0, 25).map(([key, item]) => <View key={key} style={styles.resultRow}>
        <Text style={styles.resultKey}>{key}</Text>
        <Text numberOfLines={3} selectable style={styles.resultValue}>{typeof item === 'object' ? JSON.stringify(item) : String(item)}</Text>
      </View>)}
    </View> : null}
  </ScrollView>;
}

function defaults(fields: FieldDefinition[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter((field) => field.default !== undefined).map((field) => [field.key, field.default]));
}

function isBlank(value: unknown) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 100, elevation: 100 } as object,
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: '#0E0F11' } as object,
  drawer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '88%',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF',
    paddingHorizontal: 22, overflow: 'hidden', shadowColor: '#101114', shadowOpacity: 0.18,
    shadowRadius: 32, shadowOffset: { width: 0, height: -8 }, elevation: 30,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 22, paddingBottom: 18 },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '700', color: '#858781', letterSpacing: 0.7 },
  title: { marginTop: 3, fontSize: 19, fontWeight: '700', color: '#1B1C1E', letterSpacing: -0.4 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ECEDEA', gap: 24 },
  tab: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#141518' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#898B85' },
  tabTextActive: { color: '#141518' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: 22, paddingBottom: 32 },
  label: { fontSize: 10, fontWeight: '800', color: '#777A74', letterSpacing: 0.8, marginBottom: 10, marginTop: 8 },
  required: { color: '#E5484D' },
  hint: { color: '#858781', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  appRow: { minHeight: 58, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E8E9E6', borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 22 },
  smallIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  appName: { flex: 1, color: '#222326', fontSize: 14, fontWeight: '600' },
  change: { color: '#42454A', fontSize: 13, fontWeight: '700', padding: 8 },
  select: { minHeight: 48, borderWidth: 1, borderColor: '#E1E3DF', borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { fontSize: 13, color: '#292A2C', fontWeight: '500' },
  placeholder: { color: '#9A9C96' },
  options: { borderWidth: 1, borderColor: '#E8E9E6', borderRadius: 13, overflow: 'hidden', marginTop: 8, marginBottom: 20 },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0EE' },
  optionSelected: { backgroundColor: '#F8F8F6' },
  optionText: { fontSize: 13, color: '#292A2C', fontWeight: '600' },
  optionHint: { fontSize: 11, color: '#8B8D87', marginTop: 2, lineHeight: 15 },
  radioOuter: { width: 17, height: 17, borderRadius: 9, borderWidth: 1.5, borderColor: '#B7BAB3', alignItems: 'center', justifyContent: 'center' },
  radioOuterSelected: { borderColor: '#242528' },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#242528' },
  row: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  note: { marginTop: 8, fontSize: 11, color: '#8B8D87' },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderWidth: 1, borderColor: '#E8E9E6', borderRadius: 13, marginBottom: 8 },
  accountSelected: { borderColor: '#242528', backgroundColor: '#FAFAF9' },
  accountDisabled: { opacity: 0.7 },
  accountName: { color: '#242528', fontSize: 13, fontWeight: '700' },
  accountEmail: { color: '#4E514B', fontSize: 12 },
  warning: { color: '#A86510', fontSize: 11, fontWeight: '600', marginTop: 3 },
  connect: { minHeight: 44, marginTop: 6, borderRadius: 11, paddingHorizontal: 14, backgroundColor: '#1C1D1F', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  connectDisabled: { opacity: 0.55 },
  connectText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  message: { color: '#21825B', fontSize: 11, lineHeight: 16, marginTop: 8 },
  error: { color: '#B42318', fontSize: 12, lineHeight: 17 },
  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#242528', marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#E1E3DF', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, fontSize: 13, color: '#1B1C1E' },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  choice: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: '#E1E3DF' },
  choiceSelected: { backgroundColor: '#1C1D1F', borderColor: '#1C1D1F' },
  choiceText: { fontSize: 12, color: '#3A3C38', fontWeight: '600' },
  choiceTextSelected: { color: '#FFFFFF' },
  loadChoices: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 8 },
  loadChoicesText: { fontSize: 12, color: '#42454A', fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggle: { width: 42, height: 24, borderRadius: 12, backgroundColor: '#D9DAD7', padding: 3 },
  toggleOn: { backgroundColor: '#1C1D1F' },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
  knobOn: { transform: [{ translateX: 18 }] },
  mapHint: { fontSize: 11, color: '#777A74', fontWeight: '700', marginTop: 8, marginBottom: 6 },
  chip: { maxWidth: 190, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F1F2F0' },
  chipLabel: { fontSize: 11, fontWeight: '700', color: '#2A2B2D' },
  chipSample: { fontSize: 10, color: '#7A7C76', marginTop: 1 },
  result: { marginTop: 16, borderWidth: 1, borderColor: '#E8E9E6', borderRadius: 13, padding: 12 },
  resultTitle: { fontSize: 12, fontWeight: '700', color: '#242528', marginBottom: 8 },
  resultRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F2F2F0' },
  resultKey: { fontSize: 11, fontWeight: '700', color: '#5A5D56' },
  resultValue: { fontSize: 12, color: '#242528', marginTop: 2 },
  footer: { paddingTop: 12, borderTopWidth: 1, borderTopColor: '#ECEDEA' },
  continue: { height: 48, borderRadius: 13, backgroundColor: '#17181A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  continueDisabled: { backgroundColor: '#BFC1BC' },
  continueText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
