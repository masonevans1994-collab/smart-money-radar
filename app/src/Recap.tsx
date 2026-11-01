import { useMemo } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { agencyLabel, amountLabel, moveLabel, type Recap as RecapData, recapShareText, shortName } from "./logic";
import { fonts, type, type Palette, useColors } from "./theme";
import type { Signal } from "./types";

export function RecapCard({ recap, onOpen, onDismiss, note }: {
  recap: RecapData; onOpen: (s: Signal) => void; onDismiss: () => void; note?: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Your week in contracts</Text>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <Pressable onPress={() => Share.share({ message: recapShareText(recap) }).catch(() => {})}
            hitSlop={10} accessibilityRole="button">
            <Text style={styles.dismiss}>Share</Text>
          </Pressable>
          <Pressable onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
            <Text style={styles.dismiss}>Hide</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.period}>{recap.periodLabel}{note ? ` · ${note}` : ""}</Text>
      {/* The big number above already says the total; this card adds the rest. */}
      <Text style={styles.line} maxFontSizeMultiplier={1.6}>
        <Text style={styles.strong}>{recap.count}</Text> contract{recap.count === 1 ? "" : "s"} signed
        {recap.topAgency ? `, most of the money from ${recap.topAgency}` : ""}.
      </Text>
      {recap.biggest && (
        <Pressable onPress={() => onOpen(recap.biggest!)} style={styles.row} accessibilityRole="button">
          <Text style={styles.rowLabel}>Biggest</Text>
          <Text style={styles.rowText} numberOfLines={2}>
            {amountLabel(recap.biggest)} to {shortName(recap.biggest)} from {agencyLabel(recap.biggest)}
          </Text>
        </Pressable>
      )}
      {recap.bestMover && (
        <Pressable onPress={() => onOpen(recap.bestMover!)} style={styles.row} accessibilityRole="button">
          <Text style={styles.rowLabel}>Best mover</Text>
          <Text style={styles.rowText} numberOfLines={2}>
            {shortName(recap.bestMover)}, {moveLabel(recap.bestMover)?.toLowerCase().replace("stock ", "")} since its award
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 16, backgroundColor: colors.panel, borderRadius: 16, padding: 16, gap: 6 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { ...type.lead, fontFamily: fonts.bold, color: colors.text },
  dismiss: { ...type.small, fontFamily: fonts.semibold, color: colors.muted },
  period: { ...type.small, color: colors.muted },
  line: { ...type.body, fontSize: 15, lineHeight: 22, color: colors.soft, marginTop: 4 },
  strong: { fontFamily: fonts.bold, color: colors.text, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 6 },
  rowLabel: { ...type.small, fontFamily: fonts.semibold, color: colors.muted, width: 78, paddingTop: 2 },
  rowText: { ...type.body, color: colors.text, flex: 1 },
});
