import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { colors, fonts, type } from "./theme";

const POINTS: [string, string][] = [
  ["See where the money goes", "When the government hires a company you can invest in, Radar shows how much, for what, and what the company's stock has done since."],
  ["Explained in plain English", "No trading experience needed. Every item says what happened, why people watch it and what to keep in mind."],
  ["Straight from public records", "Everything comes from government data anyone can check. Tap any item to see the original record."],
];

export function Onboarding({ visible, onDone, onLegal }: {
  visible: boolean; onDone: () => void; onLegal: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDone}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
          <View style={styles.body}>
            <Text style={styles.brand}>Radar</Text>
            <Text style={styles.title}>Follow the money the government spends.</Text>
            {POINTS.map(([h, b]) => (
              <View key={h} style={styles.point}>
                <View style={styles.rule} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pointHead}>{h}</Text>
                  <Text style={styles.pointBody}>{b}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.footer}>
            <Text style={styles.legal}>
              Radar is for information only. It isn't investment advice, it never tells you to buy
              or sell, and stocks can lose value. Public records can contain errors.
            </Text>
            <Pressable onPress={onLegal} hitSlop={8} accessibilityRole="link">
              <Text style={styles.link}>Read the full disclaimers</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={onDone} accessibilityRole="button">
              <Text style={styles.buttonText}>I understand, show me the awards</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: "space-between" },
  body: { paddingHorizontal: 24, paddingTop: 40 },
  brand: { fontFamily: fonts.black, fontSize: 18, color: colors.gold },
  title: { ...type.hero, fontSize: 34, lineHeight: 40, color: colors.text, marginTop: 16, marginBottom: 28 },
  point: { flexDirection: "row", gap: 14, marginBottom: 22 },
  rule: { width: 3, borderRadius: 2, backgroundColor: colors.gold },
  pointHead: { ...type.lead, fontFamily: fonts.bold, color: colors.text },
  pointBody: { ...type.body, color: colors.soft, marginTop: 4 },
  footer: { paddingHorizontal: 24, paddingBottom: 16, gap: 14 },
  legal: { ...type.body, color: colors.soft },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gold },
  button: { backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  buttonText: { fontFamily: fonts.bold, fontSize: 16, color: colors.bg },
});
