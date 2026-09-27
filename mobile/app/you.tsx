import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Share, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip, ChipRow } from "@/components/Chip";
import { Monogram } from "@/components/Monogram";
import { useProfile } from "@/hooks/useProfile";
import { Divider } from "@/components/Divider";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { localToday } from "@/lib/dates";
import { contactsSupported } from "@/lib/deviceContacts";
import { colors, fonts, spacing, type } from "@/lib/theme";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { deleteAccount, deleteAllData, exportData } from "@/services/nomi";

export default function You() {
  const router = useRouter();
  const { session } = useSession();
  const profile = useProfile();
  const [busy, setBusy] = useState<"export" | "delete" | "account" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function exportMemories() {
    setBusy("export");
    setMessage(null);
    try {
      const data = await exportData();
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `nomi-export-${localToday()}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ title: "Nomi export", message: json });
      }
      setMessage(`Exported ${data.contacts.length} people.`);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Export didn’t work.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteEverything() {
    const ok = await confirm(
      "Delete everything?",
      "Every person, moment, transcript and follow-up will be permanently deleted.",
      "Delete everything",
    );
    if (!ok) return;
    setBusy("delete");
    try {
      await deleteAllData();
      router.replace("/");
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Couldn’t delete your data.");
      setBusy(null);
    }
  }

  async function removeAccount() {
    const ok = await confirm(
      "Delete your account?",
      "Your account and every memory in it will be permanently deleted.",
      "Delete account",
    );
    if (!ok) return;
    setBusy("account");
    try {
      await deleteAccount();
      await supabase?.auth.signOut();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Couldn’t delete your account.");
      setBusy(null);
    }
  }

  const who = session?.user.email ?? session?.user.phone;

  return (
    <Screen>
      <Text style={[type.display, styles.title]}>You</Text>

      {session && (
        <Card style={styles.account}>
          <View style={styles.accountRow}>
            <Monogram name={(session.user.user_metadata?.full_name as string | undefined) ?? who ?? "You"} size={56} />
            <View style={styles.accountText}>
              <Text style={styles.accountName} numberOfLines={1}>
                {(session.user.user_metadata?.full_name as string | undefined) ?? who}
              </Text>
              <Text style={type.meta}>
                {profile?.persona === "student"
                  ? [profile.major, profile.school, profile.year].filter(Boolean).join(" · ") || "Student"
                  : profile?.persona === "working"
                    ? "Working"
                    : profile?.persona === "founder"
                      ? "Building something"
                      : "Meeting people"}
              </Text>
            </View>
          </View>
          <ChipRow>
            <Chip icon="pen" label="Edit profile"
              onPress={() => router.push({ pathname: "/edit-profile", params: { edit: "1" } })} />
          </ChipRow>
        </Card>
      )}

      <Text style={type.label}>Your memories are yours</Text>
      <View style={styles.principles}>
        <Text style={type.body}>Nomi only listens while you’re recording, and says so on screen.</Text>
        <Text style={type.body}>Recordings are deleted as soon as they’re transcribed.</Text>
        <Text style={type.body}>Nothing is looked up about people behind your back, and nothing is sent to them.</Text>
        <Text style={type.body}>Your address book stays on your phone; only people you pick are added.</Text>
      </View>

      <Divider />
      <View style={styles.actions}>
        {contactsSupported && (
          <Button title="Import from contacts" variant="quiet"
            onPress={() => router.push("/import-contacts")} />
        )}
        <Button title="Export my memories" variant="quiet" onPress={() => void exportMemories()}
          loading={busy === "export"} />
        <Button title="Delete all memories" variant="danger" onPress={() => void deleteEverything()}
          loading={busy === "delete"} />
      </View>
      {session && (
        <>
          <Divider />
          <View style={styles.actions}>
            <Button title="Sign out" variant="quiet" onPress={() => void supabase?.auth.signOut()} />
            <Button title="Delete my account" variant="danger" onPress={() => void removeAccount()}
              loading={busy === "account"} />
          </View>
        </>
      )}
      {message && <Text style={[type.meta, styles.message]}>{message}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  account: {
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  accountText: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    fontFamily: fonts.serifBold,
    fontSize: 22,
    color: colors.text,
  },
  principles: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  actions: {
    gap: spacing.md,
  },
  message: {
    marginTop: spacing.md,
    color: colors.accent,
  },
});
