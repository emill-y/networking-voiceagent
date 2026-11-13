import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/Input";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { ApiError } from "@/lib/api";
import { makeStyles, space, useTheme } from "@/lib/theme";
import { renameSession } from "@/services/nomi";
import type { AmbientSession } from "@/types/api";

type Props = {
  session: AmbientSession;
  onRenamed: (session: AmbientSession) => void;
  variant?: "display" | "overline";
};

// A session's name, with a pencil to rename it. Works any time, including
// after the session ended (Nomi names untitled sessions from the conversation).
export function SessionTitle({ session, onRenamed, variant = "display" }: Props) {
  const s = useStyles();
  const toast = useToast();
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session.title ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      onRenamed(await renameSession(session.id, value.trim() || null));
      setEditing(false);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Couldn’t rename the session.", "danger");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <View style={s.edit}>
        <Input value={value} onChangeText={setValue} placeholder="Name this session" autoFocus maxLength={120}
          accessibilityLabel="Session name" returnKeyType="done" onSubmitEditing={() => void save()} />
        <View style={s.buttons}>
          <Button title="Save" variant="primary" size="sm" loading={saving} onPress={() => void save()} />
          <Button title="Cancel" variant="ghost" size="sm" onPress={() => { setValue(session.title ?? ""); setEditing(false); }} />
        </View>
      </View>
    );
  }

  return (
    <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel="Rename session" style={s.row} hitSlop={6}>
      <Txt variant={variant} accessibilityRole={variant === "display" ? "header" : undefined} style={s.title}>
        {session.title ?? "Untitled session"}
      </Txt>
      <Icon name="pen" size={variant === "display" ? 18 : 13} color={colors.textTertiary} />
    </Pressable>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" },
    title: { flexShrink: 1 },
    edit: { gap: space.xs },
    buttons: { flexDirection: "row", gap: space.xs },
  }),
);
