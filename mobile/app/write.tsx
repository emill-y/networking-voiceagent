import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

import { CloseButton } from "@/components/CloseButton";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { useProfile } from "@/hooks/useProfile";
import { examples } from "@/lib/profile";
import { colors, radius, spacing, type } from "@/lib/theme";

// For moments when speaking out loud isn't possible: type the same kind of note.
export default function Write() {
  const router = useRouter();
  const [text, setText] = useState("");
  const profile = useProfile();

  return (
    <Screen>
      <CloseButton />
      <Text style={[type.display, styles.title]}>Tell me about them.</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        placeholder={examples(profile).note}
        placeholderTextColor={colors.faint}
        selectionColor={colors.accent}
        accessibilityLabel="Your note"
        style={styles.input}
      />
      <Button
        title="Remember this"
        disabled={!text.trim()}
        onPress={() => router.replace({ pathname: "/review", params: { transcript: text.trim() } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  input: {
    minHeight: 200,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
    textAlignVertical: "top",
  },
});
