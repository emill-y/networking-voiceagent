import { useSession } from "@/hooks/useSession";
import { profileFrom, type UserProfile } from "@/lib/profile";

export function useProfile(): UserProfile | null {
  const { session } = useSession();
  return profileFrom(session);
}
