// Who the user is, so Nomi can tailor examples and understand "my school".
// Stored on the Supabase account (user_metadata.nomi_profile); no database table.
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./supabase.ts";

export type Persona = "student" | "working" | "founder" | "other";

export type UserProfile = {
  persona: Persona;
  school?: string;
  major?: string;
  year?: string;
  // For Plan Events: where to look for events, and what you're into.
  city?: string;
  interests?: string[];
};

export function profileFrom(session: Session | null): UserProfile | null {
  const raw = session?.user.user_metadata?.nomi_profile as UserProfile | undefined;
  return raw && raw.persona ? raw : null;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.updateUser({ data: { nomi_profile: profile } });
  if (error) throw error;
}

// What the extraction model should know about the speaker.
export function extractionContext(profile: UserProfile | null) {
  if (!profile) return undefined;
  return { persona: profile.persona, school: profile.school || null, major: profile.major || null };
}

// Example lines, tailored to the kind of person using Nomi.
export function examples(profile: UserProfile | null) {
  if (profile?.persona === "student") {
    return {
      note: "Met Priya at the career fair. She’s a senior in CS, interning at Stripe this summer, and offered to refer me. I should send her my resume by Friday.",
      prompt: "Met someone in class, at a club, or at a career fair?",
      searches: [
        "Who did I meet at the career fair?",
        "Who’s in my classes?",
        "Who works at companies I want to intern at?",
        "Who should I build a startup with for chemistry?",
      ],
      followUp: "e.g. Send my resume by Friday",
    };
  }
  return {
    note: "I met Jason Chen at a founders mixer. He’s building a robotics startup and looking for designers. I should reach out next week.",
    prompt: "Tell Nomi in a sentence or two. It remembers the rest.",
    searches: [
      "Who did I meet in the last two weeks?",
      "Who is working on robotics?",
      "Who did I promise to follow up with?",
      "Who could help me raise money?",
    ],
    followUp: "e.g. Send the deck next week",
  };
}
