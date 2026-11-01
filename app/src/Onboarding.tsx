import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { colors, fonts, type } from "./theme";

const POINTS: [string, string][] = [
  ["Federal contract wins", "When the government awards a public company a contract, you see the amount, the agency and how the stock has moved since."],
  ["Why each one matters", "Every award gets a score from 0 to 100, with the reasons spelled out: size next to the company, its biggest win in years, or members of Congress who bought first."],
  ["Straight from the record", "Everything comes from public government data: USAspending.gov, SEC filings and congressional disclosures. Tap any item to open the original."],
];

export function Onboarding({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onDone}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
          <View style={styles.body}>
            <Text style={styles.brand}>Radar</Text>
            <Text style={styles.title}>Follow the money the government awards.</Text>
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
              For information only. Radar is not investment advice, and past results don't
              predict future ones.
            </Text>
            <Pressable style={styles.button} onPress={onDone} accessibilityRole="button">
              <Text style={styles.buttonText}>Show me the awards</Text>
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
  legal: { ...type.small, color: colors.muted },
  button: { backgroundColor: colors.gold, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  buttonText: { fontFamily: fonts.bold, fontSize: 16, color: colors.bg },
});
