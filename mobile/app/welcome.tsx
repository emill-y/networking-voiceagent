import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Button } from "@/components/Button";
import { Input as Field } from "@/components/Input";
import { Icon, type IconName } from "@/components/Icon";
import { Page } from "@/components/Page";
import { useProfile } from "@/hooks/useProfile";
import { saveProfile, type Persona } from "@/lib/profile";
import { font, makeStyles, radius, space, useTheme } from "@/lib/theme";

const PERSONAS: { value: Persona; title: string; line: string; icon: IconName }[] = [
  { value: "student", title: "Student", line: "Classmates, professors, clubs, career fairs", icon: "spark" },
  { value: "working", title: "Working", line: "Colleagues, clients, conferences", icon: "people" },
  { value: "founder", title: "Building something", line: "Investors, founders, early users", icon: "map" },
  { value: "other", title: "Just meeting people", line: "Anyone worth remembering", icon: "user" },
];

const YEARS = ["First year", "Second year", "Third year", "Fourth year", "Grad"];

// One quick step after sign-in, so Nomi can tailor examples and understand
// "my school" or "a classmate". Editable later from You.
export default function Welcome() {
  const styles = useStyles();
  const { colors, type } = useTheme();
  const router = useRouter();
  const existing = useProfile();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const [persona, setPersona] = useState<Persona | null>(existing?.persona ?? null);
  const [school, setSchool] = useState(existing?.school ?? "");
  const [major, setMajor] = useState(existing?.major ?? "");
  const [year, setYear] = useState(existing?.year ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    if (!persona) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfile(
        persona === "student"
          ? { persona, school: school.trim(), major: major.trim(), year }
          : { persona },
      );
      // The session updates and the app opens; when editing, go back.
      if (edit) router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save that.");
      setSaving(false);
    }
  }

  return (
    <Page>
      <Animated.View entering={FadeInDown.duration(500)}>
        <Text style={styles.kicker}>{edit ? "Your profile" : "Welcome to Nomi"}</Text>
        <Text style={[type.display, styles.title]}>What brings you here?</Text>
        <Text style={styles.sub}>So Nomi’s suggestions fit your life. You can change this anytime.</Text>
      </Animated.View>

      <View style={styles.options}>
        {PERSONAS.map((p, i) => {
          const selected = persona === p.value;
          return (
            <Animated.View key={p.value} entering={FadeInDown.delay(80 + i * 60).duration(450)}>
              <Pressable
                onPress={() => setPersona(p.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
              >
                <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                  <Icon name={p.icon} size={20} color={selected ? colors.bg : colors.text} />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{p.title}</Text>
                  <Text style={type.small}>{p.line}</Text>
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      {persona === "student" && (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.student}>
          <Field label="School" value={school} onChangeText={setSchool} autoCapitalize="words"
            placeholder="e.g. UC Berkeley" />
          <Field label="Studying" value={major} onChangeText={setMajor} autoCapitalize="words"
            placeholder="e.g. Computer Science" />
          <Text style={type.overline}>Year</Text>
          <View style={styles.years}>
            {YEARS.map((y) => (
              <Pressable key={y} onPress={() => setYear(y === year ? "" : y)} accessibilityRole="radio"
                accessibilityState={{ selected: y === year }}
                style={[styles.year, y === year && styles.yearSelected]}>
                <Text style={[styles.yearText, y === year && styles.yearTextSelected]}>{y}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}

      {error && <Text style={[type.small, styles.error]}>{error}</Text>}
      <View style={styles.cta}>
        <Button variant="primary" size="lg" title={edit ? "Save" : "Start remembering"} onPress={() => void finish()}
          disabled={!persona || (persona === "student" && !school.trim())} loading={saving} />
      </View>
    </Page>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
  kicker: {
    marginTop: space.lg,
    fontSize: 13,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.accent,
  },
  title: {
    marginTop: space.xs,
  },
  sub: {
    marginTop: space.xxs,
    fontFamily: font.medium,
    fontSize: 19,
    color: colors.textSecondary,
  },
  options: {
    marginTop: space.xl,
    gap: space.xs,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: {
    borderColor: colors.support,
    backgroundColor: "rgba(201, 183, 156, 0.10)",
  },
  pressed: {
    opacity: 0.85,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(242, 238, 232, 0.07)",
  },
  optionIconSelected: {
    backgroundColor: colors.supportText,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontFamily: font.headingBold,
    fontSize: 21,
    color: colors.text,
  },
  student: {
    marginTop: space.xl,
    gap: space.md,
  },
  years: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.xs,
  },
  year: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  yearSelected: {
    backgroundColor: colors.supportText,
    borderColor: colors.supportText,
  },
  yearText: {
    fontSize: 14,
    color: colors.text,
  },
  yearTextSelected: {
    color: colors.bg,
    fontWeight: "600",
  },
  error: {
    marginTop: space.md,
    color: colors.danger,
  },
  cta: {
    marginTop: space.xl,
  },
}),
);
