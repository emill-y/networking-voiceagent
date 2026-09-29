import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Share, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Monogram } from "@/components/Monogram";
import { PageHeader } from "@/components/PageHeader";
import { PillButton } from "@/components/PillButton";
import { Screen } from "@/components/Screen";
import { useProfile } from "@/hooks/useProfile";
import { displayName, profileLine } from "@/lib/account";
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

  const name = displayName(session);

  return (
    <Screen>
      <PageHeader eyebrow="Account" title="You" />

      {session && (
        <Card style={styles.card}>
          <View style={styles.accountRow}>
            <Monogram name={name} size={64} />
            <View style={styles.accountText}>
              <Text style={styles.accountName} numberOfLines={1}>{name}</Text>
              <Text style={styles.accountLine}>{profileLine(profile)}</Text>
            </View>
          </View>
          <PillButton title="Edit profile"
            onPress={() => router.push({ pathname: "/edit-profile", params: { edit: "1" } })} />
        </Card>
      )}

      <Card style={styles.card}>
        <Text style={type.heading}>Your memories are yours</Text>
        <Text style={styles.body}>
          Export your saved people and notes whenever you like. Nomi only listens while you’re
          recording, never looks people up behind your back, and never sells your data.
        </Text>
        <View style={styles.buttons}>
          <PillButton title="Export my memories" icon="check" onPress={() => void exportMemories()}
            loading={busy === "export"} />
          {contactsSupported && (
            <PillButton title="Import from contacts" icon="people" onPress={() => router.push("/import-contacts")} />
          )}
        </View>
      </Card>

      {session && (
        <Card style={styles.card}>
          <Text style={type.heading}>Account</Text>
          <Text style={styles.body}>Signed in as {session.user.email ?? name}.</Text>
          <PillButton title="Sign out" onPress={() => void supabase?.auth.signOut()} />
          <View style={styles.divider} />
          <Text style={styles.danger}>Danger zone</Text>
          <Text style={styles.body}>
            These permanently remove what you’ve saved. You’ll be asked to confirm, and told
            exactly what will be deleted, first.
          </Text>
          <View style={styles.buttons}>
            <PillButton title="Delete all memories" variant="danger" onPress={() => void deleteEverything()}
              loading={busy === "delete"} />
            <PillButton title="Delete my account" variant="danger" onPress={() => void removeAccount()}
              loading={busy === "account"} />
          </View>
        </Card>
      )}
      {message && <Text style={[type.meta, styles.message]}>{message}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  accountText: {
    flex: 1,
    gap: 4,
  },
  accountName: {
    fontFamily: fonts.serifBold,
    fontSize: 24,
    color: colors.text,
  },
  accountLine: {
    fontSize: 16,
    color: colors.muted,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  buttons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginVertical: spacing.sm,
  },
  danger: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    color: "#FFB4A8",
  },
  message: {
    marginTop: spacing.md,
    color: colors.accent,
  },
});
