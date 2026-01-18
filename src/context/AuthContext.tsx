import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabaseClient";
import type { Session, User } from "@supabase/supabase-js";

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("getSession error:", error);
      setSession(null);
      setUser(null);
      return;
    }
    setSession(data.session ?? null);
    setUser(data.session?.user ?? null);
  };

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      setLoading(true);
      await refreshSession();
      if (mounted) setLoading(false);
    };

    void boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };

  const value = useMemo<AuthState>(
    () => ({ session, user, loading, signOut, refreshSession }),
    [session, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider />");
  return ctx;
}
