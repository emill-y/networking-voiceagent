import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Screen } from "@/components/Screen";
import { ApiError } from "@/lib/api";
import { colors, spacing, type } from "@/lib/theme";
import { getContact, updateContact } from "@/services/nomi";
import type { ContactDetail, ContactUpdate } from "@/types/api";

type EditableField = keyof ContactUpdate;

const FIELDS: { key: EditableField; label: string; multiline?: boolean; keyboard?: "email-address" | "phone-pad" | "url" }[] = [
  { key: "name", label: "Name" },
  { key: "role", label: "Role" },
  { key: "company", label: "Company" },
  { key: "school", label: "School" },
  { key: "major", label: "Studies" },
  { key: "location", label: "Based in" },
  { key: "summary", label: "In a sentence", multiline: true },
  { key: "email", label: "Email", keyboard: "email-address" },
  { key: "phone", label: "Phone", keyboard: "phone-pad" },
  { key: "linkedinUrl", label: "LinkedIn", keyboard: "url" },
  { key: "websiteUrl", label: "Website", keyboard: "url" },
];

export default function EditPerson() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [original, setOriginal] = useState<ContactDetail | null>(null);
  const [values, setValues] = useState<Record<EditableField, string>>(
    {} as Record<EditableField, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getContact(id)
      .then((person) => {
        setOriginal(person);
        setValues(
          Object.fromEntries(FIELDS.map(({ key }) => [key, person[key] ?? ""])) as Record<
            EditableField,
            string
          >,
        );
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn’t load this person."));
  }, [id]);

  async function save() {
    if (!original) return;
    // Send only what changed; empty text clears a field.
    const changes: Record<string, string | null> = {};
    for (const { key } of FIELDS) {
      const next = values[key].trim();
      if (next !== (original[key] ?? "")) changes[key] = next || null;
    }
    if (Object.keys(changes).length === 0) {
      router.back();
      return;
    }
    setSaving(true);
    try {
      await updateContact(original.id, changes as ContactUpdate);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t save changes.");
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
        <Text style={type.meta}>Cancel</Text>
      </Pressable>
      <Text style={[type.title, styles.title]}>Edit</Text>

      {!original ? (
        <View style={styles.loading}>
          {error ? <Text style={type.body}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      ) : (
        <View style={styles.form}>
          {FIELDS.map(({ key, label, multiline, keyboard }) => (
            <Field
              key={key}
              label={label}
              value={values[key]}
              multiline={multiline}
              keyboardType={keyboard}
              autoCapitalize={keyboard ? "none" : key === "name" ? "words" : "sentences"}
              onChangeText={(value) => setValues((current) => ({ ...current, [key]: value }))}
            />
          ))}
          {error && <Text style={[type.meta, styles.error]}>{error}</Text>}
          <Button
            title="Save"
            onPress={() => void save()}
            loading={saving}
            disabled={!values.name?.trim()}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
  },
  form: {
    gap: spacing.md,
  },
  error: {
    color: colors.danger,
  },
});
