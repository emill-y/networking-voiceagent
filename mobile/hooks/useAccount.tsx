import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { useSession } from "@/hooks/useSession";
import { displayName } from "@/lib/account";
import { isDemo } from "@/lib/demo";
import { getMyProfile } from "@/services/nomi";

type Account = {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  inviteCode: string | null;
  refresh: () => void;
};

const AccountContext = createContext<Account>({ name: "You", email: null, avatarUrl: null, inviteCode: null, refresh: () => undefined });

// Who's signed in, with the photo they uploaded (or their Google photo).
export function AccountProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [profile, setProfile] = useState<{ avatarUrl: string | null; displayName: string | null; inviteCode: string | null } | null>(null);
  const userId = session?.user.id;

  const refresh = useCallback(() => {
    if (!userId && !isDemo()) return;
    getMyProfile().then(setProfile).catch(() => undefined);
  }, [userId]);

  useEffect(refresh, [refresh]);

  const meta = session?.user.user_metadata ?? {};
  const value: Account = {
    name: profile?.displayName || (isDemo() ? "Eisha Yadav" : displayName(session)),
    email: isDemo() ? "eisha@nomi.demo" : (session?.user.email ?? null),
    avatarUrl: profile?.avatarUrl ?? ((meta.avatar_url as string | undefined) || (meta.picture as string | undefined) || null),
    inviteCode: profile?.inviteCode ?? null,
    refresh,
  };
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): Account {
  return useContext(AccountContext);
}
