"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";

export type OrgRole = "owner" | "admin" | "member";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  orgRole: OrgRole | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function shouldBlockForAuthEvent(event: AuthChangeEvent) {
  return event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgRole, setOrgRole] = useState<OrgRole | null>(null);

  const resolveOrgRole = async (nextUser: User | null) => {
    if (!nextUser) {
      setOrgRole(null);
      return;
    }

    try {
      const { data: memberRow } = await supabase
        .from("organization_members")
        .select("role")
        .eq("user_id", nextUser.id)
        .limit(1)
        .maybeSingle();

      const nextRole = memberRow?.role;
      if (nextRole === "owner" || nextRole === "admin" || nextRole === "member") {
        setOrgRole(nextRole);
        return;
      }
      setOrgRole(null);
    } catch {
      setOrgRole(null);
    }
  };

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        setLoading(true);
        const nextUser = session?.user ?? null;
        setSession(session);
        setUser(nextUser);
        await resolveOrgRole(nextUser);
      })
      .catch(() => {
        setSession(null);
        setUser(null);
        setOrgRole(null);
      })
      .finally(() => {
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (shouldBlockForAuthEvent(event)) {
          setLoading(true);
        }
        try {
          let nextSession = session;

          // In some resume/focus cycles Supabase may emit a transient null session.
          // Recheck before clearing user-related state unless this is an actual sign-out.
          if (!nextSession && event !== "SIGNED_OUT") {
            const { data } = await supabase.auth.getSession();
            nextSession = data.session;
          }

          if (!nextSession && event !== "SIGNED_OUT") {
            return;
          }

          setSession(nextSession);
          const nextUser = nextSession?.user ?? null;
          setUser(nextUser);
          await resolveOrgRole(nextUser);
        } catch {
          setSession(null);
          setUser(null);
          setOrgRole(null);
        } finally {
          if (shouldBlockForAuthEvent(event)) {
            setLoading(false);
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setOrgRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, orgRole, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
