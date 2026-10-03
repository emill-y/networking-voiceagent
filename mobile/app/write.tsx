import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";

import { CloseButton } from "@/components/CloseButton";
import { Button } from "@/components/Button";
import { Page } from "@/components/Page";
import { useProfile } from "@/hooks/useProfile";
import { examples } from "@/lib/profile";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

// For moments when speaking out loud isn't possible: type the same kind of note.
export default function Write() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const router = useRouter();
  const [text, setText] = useState("");
  const profile = useProfile();

  return (
    <Page>
      <CloseButton />
      <Text style={[type.display, styles.title]}>Tell me about them.</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        placeholder={examples(profile).note}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        accessibilityLabel="Your note"
        style={styles.input}
      />
      <Button variant="primary" size="lg"
        title="Remember this"
        disabled={!text.trim()}
        onPress={() => router.replace({ pathname: "/review", params: { transcript: text.trim() } })}
      />
    </Page>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
  title: {
    marginTop: space.xl,
    marginBottom: space.lg,
  },
  input: {
    minHeight: 200,
    backgroundColor: colors.sunken,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.lg,
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
    textAlignVertical: "top",
    outlineStyle: "none",
  } as object,
}),
);
