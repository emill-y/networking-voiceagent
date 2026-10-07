import {
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
  useFonts,
} from "@expo-google-fonts/inter-tight";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useSyncExternalStore } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { EmptyState } from "@/components/EmptyState";
import { Sidebar } from "@/components/Sidebar";
import { showsTabBar, TabBar } from "@/components/TabBar";
import { ToastProvider } from "@/components/Toast";
import { AccountProvider } from "@/hooks/useAccount";
import { useDesktop } from "@/hooks/useDesktop";
import { SessionProvider, useSession } from "@/hooks/useSession";
import { isDemo, subscribeDemo } from "@/lib/demo";
import { profileFrom } from "@/lib/profile";
import { openWithoutSignIn, signInMissing } from "@/lib/supabase";
import { ThemeProvider, useTheme } from "@/lib/theme";

// Keep the splash screen up until fonts and any saved session are ready, so
// signed-in users never see the sign-in screen flicker.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  );
}

function Root() {
  const { colors } = useTheme();
  return (
    // Needed for pinch/pan gestures (the network map) on every platform.
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SessionProvider>
        <AccountProvider>
          <ToastProvider>
            <RootNavigator />
          </ToastProvider>
        </AccountProvider>
      </SessionProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const [fontsLoaded, fontError] = useFonts({ InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold });
  const { session, loading } = useSession();
  const { colors, mode } = useTheme();
  const desktop = useDesktop();
  const pathname = usePathname();
  const demo = useSyncExternalStore(subscribeDemo, isDemo, isDemo);
  const ready = (fontsLoaded || !!fontError) && !loading;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  if (signInMissing && !demo && pathname !== "/demo") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center" }}>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
        <EmptyState icon="clock" title="Nomi is being set up" body="Sign-in isn’t available on this build yet." />
      </View>
    );
  }

  // Without Supabase configured (local development only), everything is open.
  const signedIn = openWithoutSignIn || demo || !!session;
  // New accounts answer one welcome question before the app opens.
  const onboarded = openWithoutSignIn || demo || !!profileFrom(session);
  const inApp = signedIn && onboarded;

  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "fade" }}>
      {/* Protected screens are only reachable when their guard is true;
          Expo Router redirects to the first allowed screen otherwise. */}
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
      <Stack.Protected guard={inApp}>
        <Stack.Screen name="index" />
        <Stack.Screen name="record" />
        <Stack.Screen name="session" />
        <Stack.Screen name="write" />
        <Stack.Screen name="review" />
        <Stack.Screen name="contacts/index" />
        <Stack.Screen name="contacts/[id]/index" />
        <Stack.Screen name="contacts/[id]/edit" />
        <Stack.Screen name="follow-ups" />
        <Stack.Screen name="events" />
        <Stack.Screen name="search" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="invite" />
        <Stack.Screen name="shared/[token]" />
        <Stack.Screen name="import-contacts" />
        <Stack.Screen name="network" />
        <Stack.Screen name="edit-profile" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      {/* Reachable either way: sign-in links and the demo arrive here. */}
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="demo" />
    </Stack>
  );

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      {desktop && inApp ? (
        // Wide windows: persistent sidebar next to the current screen.
        <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}>
          <Sidebar />
          <View style={{ flex: 1 }}>{stack}</View>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          {stack}
          {inApp && showsTabBar(pathname) && <TabBar />}
        </View>
      )}
    </>
  );
}
