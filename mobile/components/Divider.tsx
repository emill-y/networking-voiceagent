import { StyleSheet, View } from "react-native";

import { makeStyles } from "@/lib/theme";

export function Divider({ inset = 0 }: { inset?: number }) {
  const s = useStyles();
  return <View style={[s.line, { marginLeft: inset }]} />;
}

const useStyles = makeStyles(({ colors }) =>
  StyleSheet.create({ line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong } }),
);
