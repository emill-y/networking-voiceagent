import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { normalizePhone } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
import { colors, radius, spacing, type } from "@/lib/theme";

type Method = "email" | "phone";

// After a successful sign-in, the session listener in _layout switches the
// app to the signed-in screens; nothing here needs to navigate.
export default function SignIn() {
  const [method, setMethod] = useState<Method>("email");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
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

  const sendCode = () =>
    run(async () => {
      const normalized = normalizePhone(phone);
      if (!normalized) throw new Error("Enter your number with its country code, like +1 415 555 0123.");
      const { error } = await supabase!.auth.signInWithOtp({ phone: normalized });
      if (error) throw error;
      setCodeSentTo(normalized);
      setCode("");
    });

  const verifyCode = () =>
    run(async () => {
      const { error } = await supabase!.auth.verifyOtp({
        phone: codeSentTo!,
        token: code.trim(),
        type: "sms",
      });
      if (error) throw error;
    });

  return (
    <Screen>
      <Text style={styles.wordmark}>Nomi</Text>
      <Text style={[type.display, styles.title]}>
        {creating ? "Begin remembering." : "Welcome back."}
      </Text>
      <Text style={type.meta}>
        Your memories are private to you and stay with your account.
      </Text>

      <View style={styles.tabs} accessibilityRole="tablist">
        {(["email", "phone"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => {
              setMethod(m);
              setError(null);
              setNotice(null);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: method === m }}
            style={[styles.tab, method === m && styles.tabSelected]}
          >
            <Text style={[styles.tabText, method === m && styles.tabTextSelected]}>
              {m === "email" ? "Email" : "Phone"}
            </Text>
          </Pressable>
        ))}
      </View>

      {method === "email" ? (
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
      ) : codeSentTo ? (
        <View style={styles.form}>
          <Text style={type.body}>We texted a code to {codeSentTo}.</Text>
          <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad"
            autoCapitalize="none" autoCorrect={false} textContentType="oneTimeCode" />
          <Button title="Verify" onPress={() => void verifyCode()} loading={busy}
            disabled={code.trim().length < 6} />
          <Pressable onPress={() => setCodeSentTo(null)} accessibilityRole="button" hitSlop={8}>
            <Text style={[type.meta, styles.switch]}>Use a different number</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad"
            autoCapitalize="none" autoCorrect={false} textContentType="telephoneNumber"
            placeholder="+1 415 555 0123" hint="We’ll text you a one-time code." />
          <Button title="Text me a code" onPress={() => void sendCode()} loading={busy}
            disabled={!phone.trim()} />
        </View>
      )}

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
  tabs: {
    flexDirection: "row",
    alignSelf: "flex-start",
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  tabSelected: {
    backgroundColor: colors.raised,
  },
  tabText: {
    fontSize: 14,
    color: colors.muted,
  },
  tabTextSelected: {
    color: colors.text,
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
