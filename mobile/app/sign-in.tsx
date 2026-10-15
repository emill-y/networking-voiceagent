import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Backdrop } from "@/components/Backdrop";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { LogoMark } from "@/components/Logo";
import { Txt } from "@/components/Txt";
import {
  appleSignInSupported,
  authRedirectUrl,
  sendMagicLink,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
} from "@/lib/auth";
import { makeStyles, radius, space } from "@/lib/theme";

// Apple (iPhone), Google, or a link sent to your email. No passwords.
// After sign-in, the session listener in _layout shows the app.
export default function SignIn() {
  const s = useStyles();
  const router = useRouter();
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
    <SafeAreaView style={s.safe}>
      <Backdrop />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.column}>
          <View style={s.brand}>
            <LogoMark size={44} />
            <Txt variant="display" align="center">Welcome to Nomi</Txt>
            <Txt variant="bodySecondary" align="center">Your second brain for the people you meet.</Txt>
          </View>

          <Card padding="lg" style={s.card}>
            {sentTo ? (
              <>
                <Txt variant="heading">Check your email</Txt>
                <Txt variant="small">We sent a sign-in link to {sentTo}. Open it on this device, or enter the code.</Txt>
                <Input label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoCapitalize="none"
                  autoCorrect={false} textContentType="oneTimeCode" placeholder="123456" />
                <Button title="Sign in" variant="primary" fullWidth loading={busy === "code"}
                  disabled={code.trim().length < 6} onPress={() => void run("code", () => verifyEmailCode(sentTo, code))} />
                <Pressable onPress={() => { setSentTo(null); setCode(""); setError(null); }} accessibilityRole="button" hitSlop={8}>
                  <Txt variant="small" tone="secondary" align="center">Use a different email</Txt>
                </Pressable>
              </>
            ) : (
              <>
                {appleAvailable && (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                    cornerRadius={radius.md}
                    style={s.apple}
                    onPress={() => void run("apple", signInWithApple)}
                  />
                )}
                <Button title="Continue with Google" fullWidth size="lg" loading={busy === "google"}
                  onPress={() => void run("google", signInWithGoogle)} />
                <View style={s.or}>
                  <View style={s.rule} />
                  <Txt variant="caption">or</Txt>
                  <View style={s.rule} />
                </View>
                <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
                  autoCorrect={false} textContentType="emailAddress" placeholder="you@school.edu"
                  onSubmitEditing={() => /^\S+@\S+\.\S+$/.test(email.trim()) && void run("email", async () => {
                    await sendMagicLink(email);
                    setSentTo(email.trim());
                  })} />
                <Button title="Email me a sign-in link" variant="primary" fullWidth size="lg" loading={busy === "email"}
                  disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}
                  onPress={() => void run("email", async () => {
                    await sendMagicLink(email);
                    setSentTo(email.trim());
                  })} />
              </>
            )}
            {error ? <Txt variant="small" tone="danger" accessibilityLiveRegion="polite">{error}</Txt> : null}
          </Card>

          {/* Look around first with a made-up network; nothing is saved. */}
          <Button title="Explore the demo" variant="ghost" onPress={() => router.push("/demo")} accessibilityLabel="Explore the demo with sample contacts" />

          <Txt variant="caption" align="center">Private to you. Read our privacy policy at nomi-connect.vercel.app/privacy.</Txt>
          {__DEV__ && (
            // Supabase must list this exact address under Redirect URLs.
            <Txt variant="caption" align="center" selectable>Dev: sign-in returns to {authRedirectUrl()}</Txt>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { flexGrow: 1, justifyContent: "center", padding: space.md },
    column: { width: "100%", maxWidth: 400, alignSelf: "center", gap: space.lg },
    brand: { alignItems: "center", gap: space.xs },
    card: { gap: space.sm },
    apple: { height: 48 },
    or: { flexDirection: "row", alignItems: "center", gap: space.sm, marginVertical: space.xxs },
    rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  }),
);
