import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabaseClient";
import type { User } from "@/types/types";

const TOKEN_KEY = "debacu_eval_token";
const USER_KEY = "debacu_eval_user";

type EvalAuthState = {
  token: string | null;
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => Promise<void>;
  updateUser: (user: User) => void;
};

const EvalAuthContext = createContext<EvalAuthState | undefined>(undefined);

export function EvalAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const storedToken = data.session?.access_token ?? null;
        const storedUser = localStorage.getItem(USER_KEY);

        setToken(storedToken);
        setUser(storedUser ? (JSON.parse(storedUser) as User) : null);
      } catch (error) {
        console.error("EvalAuth bootstrap error:", error);
        if (!mounted) return;
        setToken(null);
        setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
      if (!session) {
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = (t: string, u: User) => {
    setToken(t);
    setUser(u);
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  };

  const updateUser = (u: User) => {
    setUser(u);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const value = useMemo<EvalAuthState>(
    () => ({
      token,
      user,
      loading,
      signIn,
      signOut,
      updateUser,
    }),
    [token, user, loading, signIn, signOut, updateUser]
  );

  return <EvalAuthContext.Provider value={value}>{children}</EvalAuthContext.Provider>;
}

export function useEvalAuth() {
  const ctx = useContext(EvalAuthContext);
  if (!ctx) throw new Error("useEvalAuth must be used within <EvalAuthProvider />");
  return ctx;
}
