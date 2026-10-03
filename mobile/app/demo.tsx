import { useRouter } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { PageLoader } from "@/components/OrbitLoader";
import { startDemo } from "@/lib/demo";
import { useTheme } from "@/lib/theme";

// /app/demo: switch to the made-up demo network and open Home.
export default function Demo() {
  const router = useRouter();
  const { colors } = useTheme();
  useEffect(() => {
    startDemo();
    const timer = setTimeout(() => router.replace("/"), 50);
    return () => clearTimeout(timer);
  }, [router]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageLoader label="Opening the demo" />
    </View>
  );
}
