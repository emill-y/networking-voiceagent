import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { supabase } from "@/lib/supabase";
import { colors, spacing, type } from "@/lib/theme";

// Google and magic links land here with ?code=… (or ?error_description=…).
// Exchanging the code creates the session; then we go home.
export default function AuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function finish() {
      if (!supabase) return;
      // On Android the browser sheet and this screen can both receive the
      // same code; if we're already signed in, there's nothing to do.
      const { data } = await supabase.auth.getSession();
      if (data.session) return router.replace("/");

      const problem = params.error_description ?? params.error;
      if (problem) throw new Error(problem);
      if (!params.code) throw new Error("That sign-in link is incomplete.");
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
      if (exchangeError) throw exchangeError;
      router.replace("/");
    }
    finish().catch((e) => {
      if (active) setError(e instanceof Error ? e.message : "Sign-in didn’t work.");
    });
    return () => {
      active = false;
    };
  }, [params.code, params.error, params.error_description, router]);

  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={[type.title, styles.text]}>That link didn’t work.</Text>
            <Text style={[type.body, styles.text]}>{error}</Text>
            <Text style={[type.meta, styles.text]}>
              Links work once, on the device that asked for them, for about an hour.
            </Text>
            <View style={styles.action}>
              <Button title="Back to sign in" onPress={() => router.replace("/sign-in")} />
            </View>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={[type.meta, styles.text]}>Signing you in…</Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  text: {
    textAlign: "center",
  },
  action: {
    alignSelf: "stretch",
    marginTop: spacing.lg,
  },
});
