import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Txt } from "@/components/Txt";
import { setConfirmHandler, type ConfirmRequest } from "@/lib/confirm";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

// The pop-up behind confirm() ("Delete Maya Singh?"), drawn in Nomi's own
// style on every platform. Mounted once, in the root layout.
export function ConfirmDialog() {
  const s = useStyles();
  const { colors } = useTheme();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => setConfirmHandler(setRequest), []);

  const answer = (yes: boolean) => {
    request?.resolve(yes);
    setRequest(null);
  };

  // Escape cancels, Enter confirms (web keyboards).
  useEffect(() => {
    if (!request || Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
      if (e.key === "Enter") answer(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => answer(false)}>
      <View style={s.backdrop}>
        {/* Tapping outside the card cancels. It's a layer behind the card, not around it (a button can't hold buttons). */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => answer(false)} accessibilityLabel="Cancel" />
        <View style={s.card} accessibilityRole="alert" accessibilityViewIsModal>
          <View style={s.iconWrap}>
            <Icon name="trash" size={20} color={colors.danger} />
          </View>
          <Txt variant="title" align="center">{request?.title}</Txt>
          {request?.message ? <Txt variant="bodySecondary" align="center">{request.message}</Txt> : null}
          <View style={s.buttons}>
            <Button title="Cancel" variant="secondary" onPress={() => answer(false)} style={s.button} />
            <Button title={request?.action ?? "Delete"} variant="danger" icon="trash" onPress={() => answer(true)} style={s.button} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, shadow }) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: space.lg,
      backgroundColor: "rgba(20, 18, 15, 0.45)",
    },
    card: {
      width: "100%",
      maxWidth: 380,
      alignItems: "center",
      gap: space.sm,
      padding: space.lg,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      ...shadow.raised,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.dangerSoft,
      marginBottom: space.xxs,
    },
    buttons: { flexDirection: "row", gap: space.xs, alignSelf: "stretch", marginTop: space.sm },
    button: { flex: 1 },
  }),
);
