import {
  CormorantGaramond_500Medium,
  CormorantGaramond_500Medium_Italic,
  CormorantGaramond_600SemiBold,
  useFonts,
} from "@expo-google-fonts/cormorant-garamond";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { SessionProvider, useSession } from "@/hooks/useSession";
import { authEnabled } from "@/lib/supabase";
import { colors } from "@/lib/theme";

// Keep the splash screen up until the serif and any saved session are ready,
// so titles never flash in the fallback font and signed-in users never see
// the sign-in screen flicker.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
    CormorantGaramond_600SemiBold,
  });
  const { session, loading } = useSession();
  const ready = (fontsLoaded || !!fontError) && !loading;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  // Without Supabase configured (local development), everything is open.
  const signedIn = !authEnabled || !!session;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade",
        }}
      >
        {/* Protected screens are only reachable when their guard is true;
            Expo Router redirects to the first allowed screen otherwise. */}
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" />
          <Stack.Screen name="record" />
          <Stack.Screen name="write" />
          <Stack.Screen name="review" />
          <Stack.Screen name="people/index" />
          <Stack.Screen name="people/[id]/index" />
          <Stack.Screen name="people/[id]/edit" />
          <Stack.Screen name="follow-ups" />
          <Stack.Screen name="search" />
          <Stack.Screen name="you" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
