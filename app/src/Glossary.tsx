import { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { GLOSSARY } from "./glossaryTerms";
import { fonts, type, type Palette, useColors } from "./theme";

export function Glossary({ visible, onClose, stacked, focus }: {
  visible: boolean; onClose: () => void; stacked?: boolean; focus?: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const ordered = focus
    ? [...GLOSSARY].sort((a, b) => Number(b[0] === focus) - Number(a[0] === focus)) : GLOSSARY;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.wrap} edges={["top", "bottom"]}>
          <View style={styles.bar}>
            <Text style={styles.barTitle}>Plain-English glossary</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.done}>{stacked ? "‹ Back" : "Done"}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {ordered.map(([term, def]) => (
              <View key={term} style={[styles.entry, term === focus && styles.focus]}>
                <Text style={styles.term}>{term}</Text>
                <Text style={styles.def}>{def}</Text>
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
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 10 },
  entry: { backgroundColor: colors.panel, borderRadius: 14, padding: 14, gap: 4 },
  focus: { borderLeftWidth: 3, borderLeftColor: colors.gold },
  term: { ...type.bodyStrong, fontSize: 15, color: colors.text },
  def: { ...type.body, color: colors.soft },
});
