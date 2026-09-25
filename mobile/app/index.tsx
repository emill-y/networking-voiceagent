import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Divider } from "@/components/Divider";
import { MicButton } from "@/components/MicButton";
import { Screen } from "@/components/Screen";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { colors, spacing, type } from "@/lib/theme";

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const router = useRouter();
  const health = useBackendHealth();

  return (
    <Screen>
      <Text style={styles.wordmark}>Nomi</Text>

      <View style={styles.hero}>
        <Text style={type.meta}>{greeting()}</Text>
        <Text style={[type.display, styles.prompt]}>Who did you meet?</Text>

        <MicButton
          onPress={() => router.push("/record")}
          accessibilityLabel="Record a new memory"
        />
        <Text style={[type.meta, styles.hint]}>Tap to record</Text>
      </View>

      {health.state === "error" && (
        <Pressable onPress={health.retry} accessibilityRole="button" style={styles.offline}>
          <Text style={[type.meta, styles.offlineText]}>
            Can’t reach Nomi’s backend. Tap to retry.
          </Text>
        </Pressable>
      )}

      <Divider />

      <Text style={type.label}>Recent people</Text>
      <Text style={[type.body, styles.empty]}>
        No one yet. The people you meet will gather here.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    ...type.heading,
    color: colors.muted,
    letterSpacing: 1,
  },
  hero: {
    alignItems: "center",
    paddingTop: spacing.xl,
  },
  prompt: {
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  hint: {
    marginTop: spacing.xs,
  },
  offline: {
    marginTop: spacing.lg,
    alignSelf: "center",
    paddingVertical: spacing.sm,
  },
  offlineText: {
    color: colors.danger,
    textAlign: "center",
  },
  empty: {
    marginTop: spacing.sm,
    color: colors.muted,
  },
});
