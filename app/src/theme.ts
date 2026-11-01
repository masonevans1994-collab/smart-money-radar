// Federal-ledger palette: navy ink, one brass-gold accent reserved for
// award money, muted market green/red, and a seal red for conflict flags.
export const colors = {
  bg: "#0E1A2B",       // federal navy ink
  panel: "#15243A",    // raised surface
  raised: "#1C2E48",   // pressed / selected surface
  line: "#26395A",     // hairlines
  text: "#EEF2F7",     // paper white
  soft: "#C3CEDC",     // secondary text
  muted: "#8698B0",    // tertiary text
  gold: "#E2B33C",     // award amounts only
  up: "#4FB286",
  down: "#E0685A",
  seal: "#C8432F",     // committee conflict
  // aliases kept for older components
  accent: "#4FB286",
  warn: "#E2B33C",
  sell: "#E0685A",
  chip: "#1C2E48",
};

// Public Sans: the typeface the U.S. government built for its own sites.
export const fonts = {
  regular: "PublicSans_400Regular",
  medium: "PublicSans_500Medium",
  semibold: "PublicSans_600SemiBold",
  bold: "PublicSans_700Bold",
  black: "PublicSans_900Black",
};

// Type scale (px): 12 / 14 / 16 / 20 / 28 / 40
export const type = {
  small: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  lead: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
  title: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 },
  amount: { fontFamily: fonts.black, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
  hero: { fontFamily: fonts.black, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
};
