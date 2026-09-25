import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { supabase } from "@/lib/supabase";
import { colors, spacing, type } from "@/lib/theme";

// Email and password only for now; phone sign-in would need a paid SMS
// provider. After a successful sign-in, the session listener in _layout switches the
// app to the signed-in screens; nothing here needs to navigate.
export default function SignIn() {
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const emailSubmit = () =>
    run(async () => {
      const credentials = { email: email.trim(), password };
      if (creating) {
        const { data, error } = await supabase!.auth.signUp(credentials);
        if (error) throw error;
        // With email confirmation on, there's no session until the link is clicked.
        if (!data.session) setNotice("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase!.auth.signInWithPassword(credentials);
        if (error) throw error;
      }
    });

  return (
    <Screen>
      <Text style={styles.wordmark}>Nomi</Text>
      <Text style={[type.display, styles.title]}>
        {creating ? "Begin remembering." : "Welcome back."}
      </Text>
      <Text style={[type.meta, styles.intro]}>
        Your memories are private to you and stay with your account.
      </Text>

      <View style={styles.form}>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address"
          autoCapitalize="none" autoCorrect={false} />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry
          autoCapitalize="none" autoCorrect={false}
          hint={creating ? "At least 8 characters" : undefined} />
        <Button
          title={creating ? "Create account" : "Sign in"}
          onPress={() => void emailSubmit()}
          loading={busy}
          disabled={!email.trim() || password.length < (creating ? 8 : 1)}
        />
        <Pressable onPress={() => setCreating((v) => !v)} accessibilityRole="button" hitSlop={8}>
          <Text style={[type.meta, styles.switch]}>
            {creating ? "Already have an account? Sign in" : "New here? Create an account"}
          </Text>
        </Pressable>
      </View>

      {notice && <Text style={[type.meta, styles.notice]}>{notice}</Text>}
      {error && <Text style={[type.meta, styles.error]} accessibilityLiveRegion="polite">{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    ...type.heading,
    color: colors.muted,
    letterSpacing: 1,
  },
  title: {
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  intro: {
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },
  switch: {
    textAlign: "center",
    marginTop: spacing.sm,
  },
  notice: {
    marginTop: spacing.lg,
    color: colors.accent,
  },
  error: {
    marginTop: spacing.lg,
    color: colors.danger,
  },
});
