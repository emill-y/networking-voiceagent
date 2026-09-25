import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Divider } from "@/components/Divider";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { localToday } from "@/lib/dates";
import { colors, spacing, type } from "@/lib/theme";
import { deleteAllData, exportData } from "@/services/nomi";

export default function You() {
  const router = useRouter();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
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

  return (
    <Screen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
        <Text style={type.meta}>Back</Text>
      </Pressable>
      <Text style={[type.display, styles.title]}>You</Text>

      <Text style={type.label}>Your memories are yours</Text>
      <View style={styles.principles}>
        <Text style={type.body}>Nomi only listens while you’re recording, and says so on screen.</Text>
        <Text style={type.body}>Recordings are deleted as soon as they’re transcribed.</Text>
        <Text style={type.body}>Nothing is looked up about people behind your back, and nothing is sent to them.</Text>
      </View>

      <Divider />
      <View style={styles.actions}>
        <Button title="Export my memories" variant="quiet" onPress={() => void exportMemories()}
          loading={busy === "export"} />
        <Button title="Delete everything" variant="danger" onPress={() => void deleteEverything()}
          loading={busy === "delete"} />
      </View>
      {message && <Text style={[type.meta, styles.message]}>{message}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
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
