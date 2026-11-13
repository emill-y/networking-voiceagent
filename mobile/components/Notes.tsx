import { StyleSheet, View } from "react-native";

import { Txt } from "@/components/Txt";
import { makeStyles, space } from "@/lib/theme";

// Session notes, written like meeting notes: "## Section" lines are headings,
// every other line is a bullet. Lines starting "Unsure:" are shown quieter.
export function notesLines(text: string | string[] | null | undefined): string[] {
  const lines = Array.isArray(text) ? text : (text ?? "").split("\n");
  return lines.map((l) => l.trim()).filter(Boolean);
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
    heading: { marginTop: space.xs },
    first: { marginTop: 0 },
    row: { flexDirection: "row", alignItems: "flex-start", gap: space.xs },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textTertiary, marginTop: 9 },
    text: { flex: 1, minWidth: 0 },
  }),
);
