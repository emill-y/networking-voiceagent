import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Txt } from "@/components/Txt";
import { makeStyles, space } from "@/lib/theme";

// Session notes, written like meeting notes: "## Section" lines are headings,
// every other line is a bullet. Lines starting "Unsure:" are shown quieter.
export function notesLines(text: string | string[] | null | undefined): string[] {
  const lines = Array.isArray(text) ? text : (text ?? "").split("\n");
  return lines.map((l) => l.trim()).filter(Boolean);
}

// The short version shown first: the "In short" section if there is one,
// otherwise the first few bullets.
export function shortNotes(lines: string[]): string[] {
  const start = lines.findIndex((l) => /^#+\s*in short\b/i.test(l));
  if (start >= 0) {
    const end = lines.findIndex((l, i) => i > start && l.startsWith("#"));
    return lines.slice(start + 1, end < 0 ? undefined : end);
  }
  return lines.filter((l) => !l.startsWith("#")).slice(0, 3);
}

// Notes that open up: the short version, then "Open full notes" for the rest.
export function ExpandableNotes({ lines, startOpen = false }: { lines: string[]; startOpen?: boolean }) {
  const s = useStyles();
  const [open, setOpen] = useState(startOpen);
  const short = shortNotes(lines);
  const bullets = lines.filter((l) => !l.startsWith("#")).length;
  const more = bullets - short.length;
  if (!lines.length) return null;
  return (
    <View style={s.expandable}>
      <Notes lines={open || more <= 0 ? lines : short} />
      {more > 0 && (
        <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={8}
          style={({ pressed }) => [s.toggle, pressed && { opacity: 0.6 }]}>
          <Txt variant="small" weight="600">{open ? "Close full notes" : `Open full notes · ${more} more`}</Txt>
        </Pressable>
      )}
    </View>
  );
}

export function Notes({ lines, limit }: { lines: string[]; limit?: number }) {
  const s = useStyles();
  const shown = limit ? lines.slice(0, limit) : [...lines];
  while (limit && shown.length && shown[shown.length - 1].startsWith("#")) shown.pop(); // no heading left hanging
  return (
    <View style={s.wrap}>
      {shown.map((line, i) =>
        line.startsWith("#") ? (
          <Txt key={i} variant="overline" style={[s.heading, i === 0 && s.first]}>{line.replace(/^#+\s*/, "")}</Txt>
        ) : (
          <View key={i} style={s.row}>
            <View style={s.dot} />
            <Txt variant="small" tone={/^unsure:/i.test(line) ? "tertiary" : "default"} style={s.text}>
              {line.replace(/^[-•*]\s*/, "")}
            </Txt>
          </View>
        ),
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({
    wrap: { gap: 6, alignSelf: "stretch" },
    expandable: { gap: space.xs, alignSelf: "stretch" },
    toggle: {
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: space.sm,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.borderStrong,
    },
    heading: { marginTop: space.xs },
    first: { marginTop: 0 },
    row: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textTertiary, marginTop: 9 },
    text: { flex: 1, minWidth: 0 },
  }),
);
