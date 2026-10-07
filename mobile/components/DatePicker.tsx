import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { Icon } from "@/components/Icon";
import { addDays, friendly, monthGrid, monthTitle, nextMonday, parts } from "@/lib/calendar";
import { isDateString, localToday } from "@/lib/dates";
import { makeStyles, radius, space, useTheme } from "@/lib/theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

type Props = {
  label: string;
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void;
};

// A tap-to-open calendar that works the same on iPhone, Android and the web.
export function DatePicker({ label, value, onChange }: Props) {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const today = localToday();
  const selected = isDateString(value) ? value : "";
  const [open, setOpen] = useState(false);
  const start = parts(selected || today);
  const [view, setView] = useState({ year: start.year, month: start.month });

  function toggle() {
    if (!open) setView({ year: start.year, month: start.month });
    setOpen(!open);
  }

  function pick(date: string) {
    onChange(date);
    setOpen(false);
  }

  function shift(months: number) {
    setView(({ year, month }) => {
      const next = new Date(year, month + months, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  const quick: [string, string][] = [
    ["Today", today],
    ["Tomorrow", addDays(today, 1)],
    ["Next Monday", nextMonday(today)],
    ["In 2 weeks", addDays(today, 14)],
  ];

  return (
    <View style={styles.wrapper}>
      <Text style={type.label}>{label}</Text>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected ? friendly(selected, today) : "no date"}. Choose a date`}
        style={[styles.field, open && styles.fieldOpen]}
      >
        <Icon name="calendar" size={16} color={selected ? colors.supportText : colors.textTertiary} />
        <Text style={[styles.fieldText, !selected && styles.placeholder]}>
          {selected ? friendly(selected, today) : "Pick a date (optional)"}
        </Text>
        {selected ? (
          <Pressable onPress={() => onChange("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear date">
            <Icon name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </Pressable>

      {open && (
        <Animated.View entering={FadeIn.duration(180)} style={styles.panel}>
          <View style={styles.quick}>
            {quick.map(([name, date]) => (
              <Pressable
                key={name}
                onPress={() => pick(date)}
                accessibilityRole="button"
                style={[styles.chip, selected === date && styles.chipOn]}
              >
                <Text style={[styles.chipText, selected === date && styles.chipTextOn]}>{name}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.header}>
            <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous month"
              style={[styles.nav, styles.flip]}>
              <Icon name="chevron" size={18} color={colors.text} />
            </Pressable>
            <Text style={styles.month}>{monthTitle(view.year, view.month)}</Text>
            <Pressable onPress={() => shift(1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Next month"
              style={styles.nav}>
              <Icon name="chevron" size={18} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.row}>
            {WEEKDAYS.map((d, i) => (
              <Text key={i} style={[styles.cell, styles.weekday]}>{d}</Text>
            ))}
          </View>
          {monthGrid(view.year, view.month).map((week, r) => (
            <View key={r} style={styles.row}>
              {week.map((date, c) => {
                if (!date) return <View key={c} style={styles.cell} />;
                const isSelected = date === selected;
                const isToday = date === today;
                const past = date < today;
                return (
                  <Pressable
                    key={c}
                    onPress={() => pick(date)}
                    accessibilityRole="button"
                    accessibilityLabel={friendly(date, today)}
                    accessibilityState={{ selected: isSelected }}
                    style={({ pressed }) => [styles.cell, styles.day, pressed && styles.dayPressed, isSelected && styles.daySelected]}
                  >
                    <Text style={[styles.dayText, past && styles.dayPast, isToday && styles.dayToday, isSelected && styles.daySelectedText]}>
                      {parts(date).day}
                    </Text>
                    {isToday && !isSelected ? <View style={styles.todayDot} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
  wrapper: { gap: space.xs },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm,
    minHeight: 40,
    borderRadius: radius.md,
    backgroundColor: colors.sunken,
    borderWidth: 1,
    borderColor: "transparent",
  },
  fieldOpen: { borderColor: colors.support },
  fieldText: { flex: 1, fontSize: 15, color: colors.text },
  placeholder: { color: colors.textTertiary },
  panel: {
    marginTop: space.xxs,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.sunken,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: space.xxs, marginBottom: space.xs },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHover,
  },
  chipOn: { backgroundColor: colors.support },
  chipText: { fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.bg, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  nav: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceHover },
  flip: { transform: [{ scaleX: -1 }] },
  month: { fontSize: 16, fontWeight: "600", color: colors.text },
  row: { flexDirection: "row" },
  cell: { flex: 1, aspectRatio: 1, maxHeight: 44, alignItems: "center", justifyContent: "center" },
  weekday: { fontSize: 12, color: colors.textTertiary, textAlign: "center", textAlignVertical: "center" },
  day: { borderRadius: 999 },
  dayPressed: { backgroundColor: colors.surfaceHover },
  daySelected: { backgroundColor: colors.support },
  dayText: { fontSize: 15, color: colors.text },
  dayPast: { color: colors.textTertiary },
  dayToday: { color: colors.supportText, fontWeight: "700" },
  daySelectedText: { color: colors.bg, fontWeight: "700" },
  todayDot: { position: "absolute", bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.supportText },
}),
);
