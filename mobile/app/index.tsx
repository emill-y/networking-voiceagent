import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Index() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
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
