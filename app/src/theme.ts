import { createContext, useContext } from "react";

// Two palettes, same roles. Navy ink + brass gold in the dark; paper + ink in the light.
export const DARK = {
  bg: "#0E1A2B", panel: "#15243A", raised: "#1C2E48", line: "#26395A",
  text: "#EEF2F7", soft: "#C3CEDC", muted: "#8698B0",
  gold: "#E2B33C", up: "#4FB286", down: "#E0685A", seal: "#C8432F",
  flagText: "#F3B4A8", flagBg: "#3a2f10", standoutBg: "#173a33",
  onGold: "#0E1A2B",
};
export const LIGHT: typeof DARK = {
  bg: "#F6F4EE", panel: "#FFFFFF", raised: "#EDE9DF", line: "#D9D4C7",
  text: "#14213A", soft: "#3F4D66", muted: "#6B7891",
  gold: "#9A6B00", up: "#1F7A4D", down: "#B4362A", seal: "#B4362A",
  flagText: "#8A2B1F", flagBg: "#FBEFC9", standoutBg: "#DDF1E6",
  onGold: "#FFFFFF",
};
export type Palette = typeof DARK;
export type Scheme = "dark" | "light";

export const ThemeContext = createContext<Palette>(DARK);
export const useColors = (): Palette => useContext(ThemeContext);

// Kept so existing imports keep compiling; prefer useColors() in components.
export const colors = DARK;

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
