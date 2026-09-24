import { useEffect, useState } from "react";
import { Button, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const apiUrl = (
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  (Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://127.0.0.1:8000")
).replace(/\/+$/, "");

const connectionMessages = {
  checking: "Connecting to backend…",
  connected: "Backend connected",
  error: "Could not connect to backend",
};

export default function Index() {
  const [connection, setConnection] =
    useState<keyof typeof connectionMessages>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    setConnection("checking");

    async function checkHealth() {
      try {
        const response = await fetch(`${apiUrl}/health`, {
          method: "GET",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Health request failed: ${response.status}`);
        }

        const data = await response.json();
        if (data?.status !== "ok") {
          throw new Error("Unexpected health response");
        }

        if (active) setConnection("connected");
      } catch {
        if (active) setConnection("error");
      } finally {
        clearTimeout(timeout);
      }
    }

    void checkHealth();

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.connectionSection}>
          <Text style={styles.connectionStatus} accessibilityLiveRegion="polite">
            {connectionMessages[connection]}
          </Text>
          {connection === "error" && (
            <Button
              title="Retry connection"
              onPress={() => setAttempt((previous) => previous + 1)}
            />
          )}
        </View>

        <Text style={styles.prompt}>Who did you meet?</Text>

        <Pressable
          style={styles.micButton}
          disabled
          accessibilityRole="button"
          accessibilityLabel="Microphone (coming soon)"
          accessibilityState={{ disabled: true }}
        >
          <Text style={styles.micIcon}>🎙</Text>
        </Pressable>

        <Text style={styles.hint}>Recording coming soon</Text>

        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Contacts</Text>
          <Text style={styles.placeholder}>No contacts yet</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  prompt: {
    fontSize: 28,
    fontWeight: "600",
    color: "#111111",
    marginBottom: 40,
  },
  connectionSection: {
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  connectionStatus: {
    fontSize: 15,
    color: "#333333",
    textAlign: "center",
  },
  micButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#666666",
    alignItems: "center",
    justifyContent: "center",
  },
  micIcon: {
    fontSize: 36,
  },
  hint: {
    marginTop: 16,
    fontSize: 16,
    color: "#333333",
  },
  recentSection: {
    marginTop: 56,
    alignSelf: "stretch",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111111",
    marginBottom: 12,
  },
  placeholder: {
    fontSize: 15,
    color: "#888888",
  },
});
