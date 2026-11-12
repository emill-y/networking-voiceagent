import { InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold, useFonts } from "@expo-google-fonts/inter-tight";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader";
import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { Sidebar } from "@/components/Sidebar";
import { showsTabBar, TabBar } from "@/components/TabBar";
import { ToastProvider } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import { AccountProvider } from "@/hooks/useAccount";
import { useDesktop } from "@/hooks/useDesktop";
import { LiveSessionProvider, useLiveSession } from "@/hooks/useLiveSession";
import { SessionProvider, useSession } from "@/hooks/useSession";
import { isDemo, subscribeDemo } from "@/lib/demo";
import { openWithoutSignIn, signInMissing } from "@/lib/supabase";
import { radius, space, ThemeProvider, useTheme } from "@/lib/theme";

// Keep the splash screen up until fonts and any saved sign-in are ready, so
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
  const [fontsLoaded, fontError] = useFonts({ InterTight_500Medium, InterTight_600SemiBold, InterTight_700Bold, Newsreader_500Medium });
  const { session, loading } = useSession();
  const { colors } = useTheme();
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
        <StatusBar style="dark" />
        <EmptyState icon="clock" title="Nomi is being set up" body="Sign-in isn’t available on this build yet." />
      </View>
    );
  }

  // Without Supabase configured (local development only), everything is open.
  const inApp = openWithoutSignIn || demo || !!session;

  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "fade" }}>
      {/* Protected screens are only reachable when their guard is true;
          Expo Router redirects to the first allowed screen otherwise. */}
      <Stack.Protected guard={inApp}>
        <Stack.Screen name="index" />
        <Stack.Screen name="session" />
        <Stack.Screen name="sessions/[id]/index" />
        <Stack.Screen name="sessions/[id]/review" />
        <Stack.Screen name="search" />
        <Stack.Screen name="network" />
        <Stack.Screen name="contacts/[id]/index" />
        <Stack.Screen name="contacts/[id]/edit" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="voice" />
      </Stack.Protected>
      <Stack.Protected guard={!inApp}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      {/* Reachable either way: sign-in links and the demo arrive here. */}
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="demo" />
    </Stack>
  );

  // The session keeps recording above every screen, so it lives here.
  return (
    <LiveSessionProvider>
      <StatusBar style="dark" />
      {desktop && inApp ? (
        // Wide windows: persistent sidebar next to the current screen.
        <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.bg }}>
          <Sidebar />
          <View style={{ flex: 1 }}>
            {stack}
            <RecordingPill />
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          {stack}
          {inApp && showsTabBar(pathname) && <TabBar />}
          {inApp && <RecordingPill />}
        </View>
      )}
    </LiveSessionProvider>
  );
}

// While a session records and you're elsewhere in the app, a small pill at
// the top takes you back to it.
function RecordingPill() {
  const live = useLiveSession();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors, shadow } = useTheme();
  if (live.stage !== "live" || pathname === "/session" || pathname === "/") return null;
  const n = live.people.filter((p) => p.name || p.label).length;
  return (
    <View pointerEvents="box-none" style={[pill.wrap, { top: insets.top + space.xs }]}>
      <Pressable onPress={() => router.push("/session")} accessibilityRole="button" accessibilityLabel="Return to the session that's recording"
        style={[pill.pill, { backgroundColor: colors.text }, shadow.raised]}>
        <View style={[pill.dot, { backgroundColor: "#5FD08F" }]} />
        <Txt variant="caption" weight="600" style={{ color: colors.onAccent }}>
          Recording{live.session?.title ? ` · ${live.session.title}` : ""}{n ? ` · ${n} ${n === 1 ? "person" : "people"}` : ""}
        </Txt>
      </Pressable>
    </View>
  );
}

const pill = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.sm, paddingVertical: 6, borderRadius: radius.pill },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
