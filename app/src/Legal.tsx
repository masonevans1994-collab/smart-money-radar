import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { fonts, type, type Palette, useColors } from "./theme";

export const SHORT_DISCLAIMER =
  "For information only. Not investment advice. Radar doesn't recommend buying or selling anything.";

const SECTIONS: [string, string[]][] = [
  ["Not investment advice", [
    "Radar is an information service. Nothing in it is financial, investment, legal or tax advice, and nothing in it is a recommendation or offer to buy or sell any security.",
    "Radar is not a registered investment adviser or broker-dealer. The same information is shown to everyone; it is not tailored to your situation.",
    "Scores, labels such as \"Stands out\", and track-record figures describe how unusual a public record is. They are not ratings of whether a stock is a good investment.",
  ]],
  ["Investing involves risk", [
    "Stock prices go down as well as up, and you can lose some or all of the money you invest. Past price moves, including those shown in the track record, do not predict future results.",
    "Track-record figures are calculated from daily closing prices. They are not results of actual trades and do not include fees, taxes or the delay before news becomes public.",
    "Consider talking to a licensed financial professional before making investment decisions.",
  ]],
  ["Accuracy of information", [
    "Radar collects public records automatically. Records can be incomplete, delayed, revised or matched to the wrong company. Prices may be delayed and may contain errors.",
    "Always check the original record (use \"Open the official record\") before relying on anything shown here.",
  ]],
  ["People named in public records", [
    "Radar shows trades and committee memberships exactly as reported in public filings. Showing that a trade happened before a contract award, or that a member sits on a related committee, is a statement of timing only. It does not suggest that anyone acted improperly or had non-public information.",
  ]],
  ["Congressional disclosure data", [
    "Congressional financial disclosures are public under the STOCK Act. Federal law (5 U.S.C. § 13107) prohibits using them for any unlawful purpose, for commercial purposes other than news and communications media for dissemination to the general public, for determining credit ratings, or for soliciting money. Radar presents them free of charge for public information.",
  ]],
  ["Sources", [
    "Contract awards: USAspending.gov (U.S. Department of the Treasury) and Department of War announcements. Company filings and insider trades: U.S. Securities and Exchange Commission EDGAR. Congressional trades: Clerk of the U.S. House of Representatives and U.S. Senate Office of Public Records. Committee rosters: the public-domain congress-legislators project. Stock symbols: Nasdaq Trader symbol directory. Daily stock prices: third-party market data, which may be delayed.",
    "Radar is not affiliated with or endorsed by any government agency or company shown.",
  ]],
  ["Your privacy", [
    "Radar has no accounts and doesn't collect personal information. Your saved stocks and settings are stored only on your device.",
  ]],
];

export function Legal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
          <View style={styles.bar}>
            <Text style={styles.barTitle}>Disclaimers</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {SECTIONS.map(([title, paras]) => (
              <View key={title} style={styles.section}>
                <Text style={styles.title}>{title}</Text>
                {paras.map((p) => <Text key={p} style={styles.p}>{p}</Text>)}
              </View>
            ))}
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
  p: { ...type.body, color: colors.soft },
});
