import { Platform } from "react-native";

// Where the app downloads signals from. The GitHub Action publishes it here.
// Set to "" to always use the built-in demo data.
const PUBLISHED = "https://masonevans1994-collab.github.io/smart-money-radar/signals.json";

// On the web the feed sits next to the app, so load it from there: the build's
// own checks then test the data they were built with, and a copy of the site
// hosted anywhere else keeps working.
export const FEED_URL =
  Platform.OS === "web" && typeof location !== "undefined" && location.protocol.startsWith("http")
    ? new URL("signals.json", location.href).toString()
    : PUBLISHED;
