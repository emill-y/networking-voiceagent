import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Screen } from "@/components/Screen";
import {
  appleSignInSupported,
  sendMagicLink,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from "@/lib/auth";
import { colors, radius, spacing, type } from "@/lib/theme";

// Apple (iPhone), Google, or a link sent to your email. No passwords.
// After sign-in, the session listener in _layout shows the app.
export default function SignIn() {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"apple" | "google" | "email" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (appleSignInSupported) {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => undefined);
    }
  }, []);

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <Text style={styles.wordmark}>Nomi</Text>
      <Text style={[type.display, styles.title]}>Remember everyone.</Text>
      <Text style={[type.meta, styles.intro]}>
        Your memories are private to you and stay with your account.
      </Text>

      {sentTo ? (
        <View style={styles.form}>
          <Text style={[type.heading, styles.sentTitle]}>Check your email.</Text>
          <Text style={type.body}>
            We sent a sign-in link to {sentTo}. Open it on this device.
          </Text>
          <Field label="Or enter the code from the email" value={code} onChangeText={setCode}
            keyboardType="number-pad" autoCapitalize="none" autoCorrect={false}
            textContentType="oneTimeCode" />
          <Button title="Sign in with code" onPress={() => void run("code", () => verifyEmailCode(sentTo, code))}
            loading={busy === "code"} disabled={code.trim().length < 6} />
          <Pressable onPress={() => { setSentTo(null); setCode(""); setError(null); }}
            accessibilityRole="button" hitSlop={8}>
            <Text style={[type.meta, styles.center]}>Use a different email</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.form}>
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={radius.pill}
              style={styles.appleButton}
              onPress={() => void run("apple", signInWithApple)}
            />
          )}
          <Button title="Continue with Google" variant="quiet"
            onPress={() => void run("google", signInWithGoogle)} loading={busy === "google"} />

          <View style={styles.or}>
            <View style={styles.rule} />
            <Text style={type.meta}>or</Text>
            <View style={styles.rule} />
          </View>

          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" />
          <Button title="Email me a sign-in link"
            onPress={() => void run("email", async () => {
              await sendMagicLink(email);
              setSentTo(email.trim());
            })}
            loading={busy === "email"} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />
        </View>
      )}

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
  sentTitle: {
    marginBottom: -spacing.xs,
  },
  appleButton: {
    height: 48,
  },
  or: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  center: {
    textAlign: "center",
    marginTop: spacing.sm,
  },
  error: {
    marginTop: spacing.lg,
    color: colors.danger,
  },
});
