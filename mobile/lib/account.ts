// How the signed-in person is shown: their name and a one-line description.
import type { Session } from "@supabase/supabase-js";

import type { UserProfile } from "./profile.ts";

export function displayName(session: Session | null): string {
  const meta = session?.user.user_metadata ?? {};
  const name = (meta.full_name as string | undefined) ?? (meta.name as string | undefined);
  return name?.trim() || session?.user.email || "You";
}

// "IEOR · UC Berkeley · First year" for students; a short phrase otherwise.
export function profileLine(profile: UserProfile | null): string {
  if (profile?.persona === "student") {
    return [profile.major, profile.school, profile.year].filter(Boolean).join(" · ") || "Student";
  }
  if (profile?.persona === "working") return "Working";
  if (profile?.persona === "founder") return "Building something";
  return "Meeting people";
}
