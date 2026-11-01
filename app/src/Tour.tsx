import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, type, type Palette, useColors } from "./theme";

const STEPS: [string, string][] = [
  ["The gold number is the contract", "It's how much the government agreed to pay. Bigger isn't always better: what matters is how big it is for that company."],
  ["The circle is the score", "0 to 100 for how unusual this is. 70 and up stands out. Tap any score to see exactly why."],
  ["The little chart is the stock", "One bar per day. The gold bar is the day the contract was signed; green means the price is higher since then, red means lower."],
];

/** Three quick callouts shown once, above the first card. */
export function Tour({ onDone }: { onDone: () => void }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;
  return (
    <View style={styles.box} accessibilityRole="summary">
      <Text style={styles.step}>Quick tour, {i + 1} of {STEPS.length}</Text>
      <Text style={styles.title}>{STEPS[i][0]}</Text>
      <Text style={styles.body}>{STEPS[i][1]}</Text>
      <View style={styles.row}>
        <Pressable onPress={onDone} hitSlop={8} accessibilityRole="button">
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
        <Pressable onPress={() => (last ? onDone() : setI(i + 1))} style={styles.next} accessibilityRole="button">
          <Text style={styles.nextText}>{last ? "Got it" : "Next"}</Text>
        </Pressable>
      </View>
      <View style={styles.arrow} />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  box: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: colors.gold, borderRadius: 16,
    padding: 16, gap: 6 },
  step: { ...type.small, fontFamily: fonts.semibold, color: colors.onGold, opacity: 0.8 },
  title: { ...type.lead, fontFamily: fonts.bold, color: colors.onGold },
  body: { ...type.body, color: colors.onGold },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  skip: { fontFamily: fonts.semibold, fontSize: 14, color: colors.onGold, opacity: 0.8 },
  next: { backgroundColor: colors.onGold, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  nextText: { fontFamily: fonts.bold, fontSize: 14, color: colors.gold },
  arrow: { position: "absolute", bottom: -8, left: 36, width: 16, height: 16, backgroundColor: colors.gold,
    transform: [{ rotate: "45deg" }] },
});
