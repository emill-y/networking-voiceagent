import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Divider } from "@/components/Divider";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { localToday } from "@/lib/dates";
import { contactsSupported } from "@/lib/deviceContacts";
import { colors, spacing, type } from "@/lib/theme";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { deleteAccount, deleteAllData, exportData } from "@/services/nomi";

export default function You() {
  const router = useRouter();
  const { session } = useSession();
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
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
        <Text style={type.meta}>Back</Text>
      </Pressable>
      <Text style={[type.display, styles.title]}>You</Text>
      {who ? <Text style={[type.body, styles.who]}>Signed in as {who}</Text> : null}

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
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  who: {
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
    color: colors.muted,
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
