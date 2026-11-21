import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, authApi, clearTokens, hasStoredSession, saveTokens } from './auth-api';

export type Profile = { id: string; name: string; email: string; avatarUrl?: string | null; isEmailVerified: boolean };
type AuthContextValue = { user: Profile | null; loading: boolean; acceptTokens: (tokens: Parameters<typeof saveTokens>[0]) => Promise<void>; signOut: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!(await hasStoredSession())) return;
      // Retry transient failures (server waking up, flaky network) instead of
      // wiping a valid session on the first failed request after a reload.
      for (let attempt = 0; attempt < 3 && alive; attempt++) {
        try { const profile = await authApi.me(); if (alive) setUser(profile); return; } catch (error) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 404)) { await clearTokens(); return; }
          await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        }
      }
    })().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const acceptTokens = useCallback(async (tokens: Parameters<typeof saveTokens>[0]) => {
    await saveTokens(tokens);
    const profile = await authApi.me();
    setUser(profile);
  }, []);
  const signOut = useCallback(async () => { const currentUser = user; setUser(null); if (currentUser) await authApi.logout(); else await clearTokens(); }, [user]);
  const value = useMemo(() => ({ user, loading, acceptTokens, signOut }), [user, loading, acceptTokens, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
