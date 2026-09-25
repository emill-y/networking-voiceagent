import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { spacing, type } from "@/lib/theme";

// Placeholder until upload and transcription land (Milestones 6–7).
export default function Review() {
  const router = useRouter();
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  return (
    <Screen>
      <Text style={type.title}>Recording saved on this device.</Text>
      <Text style={[type.meta, styles.uri]} numberOfLines={2}>{uri}</Text>
      <Button title="Done" onPress={() => router.replace("/")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  uri: { marginVertical: spacing.lg },
});
