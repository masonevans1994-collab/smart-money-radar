import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { SCORE_GUIDE } from "./logic";
import { fonts, type, type Palette, useColors } from "./theme";

const SECTIONS: [string, string[]][] = [
  ["What Radar shows", [
    "Every day the U.S. government signs contracts with companies, from fighter jets to hospital supplies. Some of those companies are public, which means anyone can buy a piece of them as stock.",
    "Radar finds the contracts that went to public companies and shows how their stock has moved since.",
  ]],
  ["Do contracts move stocks?", [
    "Mostly, no. We looked at 1,817 government awards of $25M or more to 49 public companies over three years. A month later the stock had beaten the market 51% of the time: a coin flip.",
    "For giant companies (worth over $50B) a new contract is routine and the stock barely notices. The dollar amount doesn't matter much either: $25M awards and $500M awards behaved about the same.",
    "What seems to matter is size compared with the company. In the rare cases where one award was worth more than 10% of the whole company, the stock beat the market 5 times out of 6. That's too few cases to rely on, and the next group down (3% to 10%) did worse than the market. Use \"Big for the company\" to see these first.",
    "And by the time an award shows up in public records, often days after signing, professional traders have usually already reacted to the company's own announcement.",
  ]],
  ["How to read a card", [
    "The gold number is the contract's value. Under it is the company and its stock symbol (like FLR for Fluor). Search that symbol in any investing app to look the company up.",
    "The little bar chart is the stock price each day. The gold bar is the day the contract was signed. Green bars mean the price is higher than on that day, red means lower.",
  ]],
  ["What happened last time", [
    "For each award, Radar looks back three years at that company's past government deals of $25M or more and checks how its stock moved in the 30 days after each one, compared with the market.",
    "The headline picks the past deal closest in size. It's real history, not a forecast: a stock that went up after the last deal can go down after this one.",
  ]],
  ["What the score means", SCORE_GUIDE.map(([r, t]) => `${r}: ${t}`)],
  ["The Record tab", [
    "The Record tab adds up every award Radar has tracked and shows how often the stock did better than the market afterward. So far, for the giant companies that win most contracts, a new award has usually been a non-event for the stock. Smaller companies react more.",
  ]],
  ["Congress and insiders", [
    "Members of Congress and company executives have to report when they buy or sell stock. Radar shows those trades and notes when a trade happened shortly before a related contract. That's a fact about timing only, not a claim that anyone did anything wrong.",
    "Do insider buys predict anything? We checked 1,460 executive purchases from the past three years. There was a small bump in the first week, usually gone before most people would see it. Six months later the stock had trailed the market about two times out of three, even compared with other small companies. Several insiders buying at once did no better.",
  ]],
  ["Calls, streaks and milestones", [
    "On any award you can make a call: will the stock be higher, lower or about the same in 30 days? It's a guess for learning, with no money involved. The You tab keeps score, along with your check-in streak and milestones.",
  ]],
  ["Before you invest any money", [
    "Radar is for information only. It's not financial advice, and it never tells you what to buy.",
    "Only invest money you could afford to lose. Putting it all in one company is riskier than spreading it out.",
    "If you're unsure, a licensed financial adviser can help you decide what fits your situation.",
  ]],
];

export function Guide({ visible, onClose, stacked, onLegal }: {
  visible: boolean; onClose: () => void; stacked?: boolean; onLegal: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
          <View style={styles.bar}>
            <Text style={styles.barTitle}>How Radar works</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.done}>{stacked ? "‹ Back" : "Done"}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {SECTIONS.map(([title, paras]) => (
              <View key={title} style={styles.section}>
                <Text style={styles.title}>{title}</Text>
                {paras.map((p) => <Text key={p} style={styles.p}>{p}</Text>)}
              </View>
            ))}
            <Pressable onPress={onLegal} style={styles.legalBtn} accessibilityRole="link">
              <Text style={styles.legalText}>Read the full disclaimers</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14 },
  barTitle: { ...type.title, color: colors.text },
  done: { fontFamily: fonts.semibold, fontSize: 16, color: colors.gold },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  section: { marginTop: 18, gap: 8 },
  title: { ...type.lead, fontFamily: fonts.bold, color: colors.text },
  p: { ...type.body, fontSize: 15, lineHeight: 22, color: colors.soft },
  legalBtn: { marginTop: 24 },
  legalText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.gold },
});
