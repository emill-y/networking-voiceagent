import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { supabase, withTimeout } from "@/lib/supabase";

type SessionState = {
  session: Session | null;
  loading: boolean;
};

const SessionContext = createContext<SessionState>({ session: null, loading: true });

// Tracks the signed-in user for the whole app. Supabase restores the saved
// session on launch and notifies us on sign-in, sign-out and token refresh.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: !!supabase });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    // Don't hold the whole app on a blank screen if Supabase is slow.
    withTimeout(supabase.auth.getSession(), 8000)
      .then(({ data }) => active && setState({ session: data.session, loading: false }))
      .catch(() => active && setState({ session: null, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
