import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import Animated, { FadeInDown } from "react-native-reanimated";

import { Button } from "@/components/Button";
import { Constellation } from "@/components/Constellation";
import { Field } from "@/components/Field";
import { Screen } from "@/components/Screen";
import {
  appleSignInSupported,
  authRedirectUrl,
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
      <Animated.View entering={FadeInDown.duration(700)} style={styles.art}>
        <Constellation size={260} />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).duration(700)}>
        <Text style={styles.wordmark}>Nomi</Text>
        <Text style={[type.display, styles.title]}>Never forget a person again.</Text>
        <Text style={styles.intro}>
          Say who you met in a sentence. Nomi remembers their name, what you talked
          about, and what you promised to do next. Private to you.
        </Text>
      </Animated.View>

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

      {__DEV__ && (
        // Development only: Supabase must list this exact address under
        // Authentication -> URL Configuration -> Redirect URLs, or sign-in
        // links fall back to the Site URL (often http://localhost:3000).
        <Text style={[type.meta, styles.devHint]} selectable>
          Dev: sign-in returns to {authRedirectUrl()}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  art: {
    alignItems: "center",
    marginTop: spacing.sm,
  },
  wordmark: {
    ...type.heading,
    color: colors.accent,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontSize: 16,
  },
  title: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    fontSize: 40,
    lineHeight: 44,
  },
  intro: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.muted,
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
  devHint: {
    marginTop: spacing.xl,
    color: colors.faint,
  },
});
