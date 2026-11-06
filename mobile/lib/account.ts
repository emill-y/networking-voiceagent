// How the signed-in person is shown.
import type { Session } from "@supabase/supabase-js";

export function displayName(session: Session | null): string {
  const meta = session?.user.user_metadata ?? {};
  const name = (meta.full_name as string | undefined) ?? (meta.name as string | undefined);
  return name?.trim() || session?.user.email || "You";
}
