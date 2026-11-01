import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { agencyLabel, compareRows, shortName } from "./logic";
import { fonts, type, type Palette, useColors } from "./theme";
import type { Signal } from "./types";

export function Compare({ items, onOpen, onClose }: {
  items: Signal[] | null; onOpen: (s: Signal) => void; onClose: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!items || items.length < 2) return null;
  const rows = compareRows(items);
  const first = items[0];
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
          <View style={styles.bar}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.done}>‹ Back</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.kicker}>Recent winners from {agencyLabel(first)}</Text>
            <Text style={styles.title}>Side by side</Text>
            <Text style={styles.intro}>
              {rows.some((r) => r.label === "Share of company")
                ? "Same agency, different companies. The useful line is \"Share of company\": the same dollars matter far more to a small company than a giant one."
                : "Same agency, different companies. Remember the same dollars matter far more to a small company than a giant one."}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableWrap}>
              <View>
                <View style={styles.row}>
                  <View style={styles.labelCell} />
                  {items.map((it) => (
                    <Pressable key={it.ticker} style={styles.headCell} onPress={() => onOpen(it)}
                      accessibilityRole="button">
                      <Text style={styles.headTicker}>{it.ticker}</Text>
                      <Text style={styles.headName} numberOfLines={2}>
                        {shortName(it)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {rows.map((r, i) => (
                  <View key={r.label} style={[styles.row, i % 2 === 0 && styles.rowAlt]}>
                    <View style={styles.labelCell}><Text style={styles.label}>{r.label}</Text></View>
                    {r.values.map((v, j) => (
                      <View key={j} style={styles.cell}>
                        <Text style={[styles.value, r.label === "Deal" && { color: colors.gold, fontFamily: fonts.bold },
                          r.label === "Stock since" && v.startsWith("up") && { color: colors.up },
                          r.label === "Stock since" && v.startsWith("down") && { color: colors.down }]}>
                          {v}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.foot}>
              "Group since" is how similar stocks moved over the same days. "After past deals" is how often
              the stock beat the market in the month after this company's past awards. Past moves don't
              predict future ones. Not investment advice.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  bar: { paddingHorizontal: 20, paddingVertical: 14 },
  done: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  kicker: { ...type.bodyStrong, color: colors.muted },
  title: { ...type.hero, fontSize: 30, lineHeight: 36, color: colors.text, marginTop: 2 },
  intro: { ...type.body, fontSize: 15, lineHeight: 22, color: colors.soft, marginTop: 10, marginBottom: 16 },
  tableWrap: { paddingRight: 20 },
  row: { flexDirection: "row", alignItems: "stretch" },
  rowAlt: { backgroundColor: colors.panel, borderRadius: 8 },
  labelCell: { width: 118, paddingVertical: 10, paddingHorizontal: 8, justifyContent: "center" },
  label: { ...type.small, fontFamily: fonts.semibold, color: colors.muted },
  headCell: { width: 120, paddingVertical: 10, paddingHorizontal: 8, gap: 2 },
  headTicker: { fontFamily: fonts.bold, fontSize: 16, color: colors.gold },
  headName: { ...type.small, color: colors.soft },
  cell: { width: 120, paddingVertical: 10, paddingHorizontal: 8, justifyContent: "center" },
  value: { ...type.body, color: colors.text },
  foot: { ...type.small, color: colors.muted, marginTop: 18 },
});
