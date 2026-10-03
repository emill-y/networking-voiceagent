import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Toast";
import { Txt } from "@/components/Txt";
import type { useCalendar } from "@/hooks/useCalendar";
import { calendarNotice } from "@/lib/calendarConnect";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

// One line about Google Calendar when it needs attention: not connected yet,
// or Google wants a new sign-in. Nothing when all is well.
export function CalendarBanner({ calendar, prompt }: { calendar: ReturnType<typeof useCalendar>; prompt: string }) {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ calendar?: string }>();

  // Back from Google: say how it went, once.
  useEffect(() => {
    const notice = params.calendar ? calendarNotice[params.calendar] : null;
    if (notice) toast.show(notice.text, notice.ok ? "success" : "danger");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.calendar]);

  if (calendar.state === "needs_reauth") {
    return (
      <View style={[s.banner, s.warn]}>
        <Icon name="alert" size={16} color={colors.warning} />
        <Txt variant="small" style={s.text}>Google Calendar needs you to sign in again.</Txt>
        <Button title="Reconnect" size="sm" variant="secondary" loading={calendar.busy === "connect"} onPress={() => void calendar.connect()} />
      </View>
    );
  }
  if (calendar.state === "disconnected") {
    return (
      <View style={s.banner}>
        <Icon name="calendar" size={16} color={colors.textSecondary} />
        <Txt variant="small" style={s.text}>{prompt}</Txt>
        <Button title="Connect" size="sm" variant="secondary" loading={calendar.busy === "connect"} onPress={() => void calendar.connect()} />
      </View>
    );
  }
  return null;
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      paddingVertical: space.xs,
      paddingLeft: space.md,
      paddingRight: space.xs,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    warn: { borderColor: colors.warning, backgroundColor: colors.warningSoft },
    text: { flex: 1, color: colors.text },
  }),
);
