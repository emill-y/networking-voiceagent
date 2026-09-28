import {
  InterTight_500Medium_Italic,
  InterTight_600SemiBold,
  InterTight_700Bold,
  useFonts,
} from "@expo-google-fonts/inter-tight";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Sidebar } from "@/components/Sidebar";
import { showsTabBar, TabBar } from "@/components/TabBar";
import { useDesktop } from "@/hooks/useDesktop";
import { SessionProvider, useSession } from "@/hooks/useSession";
import { profileFrom } from "@/lib/profile";
import { openWithoutSignIn, signInMissing } from "@/lib/supabase";
import { colors, type } from "@/lib/theme";

// Keep the splash screen up until the serif and any saved session are ready,
// so titles never flash in the fallback font and signed-in users never see
// the sign-in screen flicker.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    // Needed for pinch/pan gestures (the network map) on every platform.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts({
    InterTight_500Medium_Italic,
    InterTight_600SemiBold,
    InterTight_700Bold,
  });
  const { session, loading } = useSession();
  const desktop = useDesktop();
  const pathname = usePathname();
  const ready = (fontsLoaded || !!fontError) && !loading;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  if (signInMissing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: 32, gap: 12 }}>
        <StatusBar style="light" />
        <Text style={type.title}>Nomi is being set up</Text>
        <Text style={type.body}>
          Sign-in isn’t configured for this build yet. Please check back soon.
        </Text>
      </View>
    );
  }

  // Without Supabase configured (local development only), everything is open.
  const signedIn = openWithoutSignIn || !!session;
  // New accounts answer one welcome question before the app opens.
  const onboarded = openWithoutSignIn || !!profileFrom(session);

  const stack = (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade",
        }}
      >
        {/* Protected screens are only reachable when their guard is true;
            Expo Router redirects to the first allowed screen otherwise. */}
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="welcome" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
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
          <Stack.Screen name="import-contacts" />
          <Stack.Screen name="network" />
          <Stack.Screen name="edit-profile" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        {/* Reachable either way: sign-in links arrive here. */}
        <Stack.Screen name="auth/callback" />
      </Stack>
  );

  return (
    <>
      <StatusBar style="light" />
      {desktop && signedIn && onboarded ? (
        // Wide browser windows: persistent sidebar next to the current screen.
        <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.background }}>
          <Sidebar />
          <View style={{ flex: 1 }}>{stack}</View>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          {stack}
          {signedIn && onboarded && showsTabBar(pathname) && <TabBar />}
        </View>
      )}
    </>
  );
}
