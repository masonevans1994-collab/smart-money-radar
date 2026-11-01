# Smart Money Radar: mobile app (iPhone + Android)

React Native app built with Expo. One codebase runs on both platforms.

## What's in it

- **Feed** of ranked signals with a 0–100 score and the top reasons
- **Tabs:** Top, Insiders, Congress, ★ Watchlist
- **Search** by ticker, person or company
- **Detail sheet:** full "why it scored" list, trade details, link to the original filing
- **Watchlist** saved on the device
- **Pull to refresh**; works offline with the last downloaded data
- Built-in demo data until you connect the live feed

## Run it on your phone (about 10 minutes, needs a computer once)

1. Install Node.js 20+ on a Mac or PC.
2. Install the free **Expo Go** app on your phone (App Store / Play Store).
3. In this folder:
   ```bash
   npm install
   npm run upgrade     # matches the latest Expo version that Expo Go supports
   npx expo start
   ```
4. Scan the QR code: iPhone Camera app, or the scanner in Expo Go on Android.
   The app opens on your phone and reloads every time you save a file.

## Connect live data

1. Push this whole repo to GitHub and follow the steps at the top of
   `.github/workflows/radar.yml` (add the `SEC_USER_AGENT` secret, turn on Pages).
2. Put the feed URL in `src/config.ts`:
   `export const FEED_URL = "https://YOUR-USER.github.io/smart-money-radar/signals.json";`

## Publish to the App Store / Google Play

```bash
npm install -g eas-cli
eas login
eas build --platform all     # builds in Expo's cloud, no Mac required
eas submit --platform ios    # and --platform android
```

You need an Apple Developer account ($99/year) and a Google Play developer
account ($25 one-time). Finance apps get extra review, so keep the "not
investment advice" wording and a privacy policy link.

## Code map

| File | What it does |
|---|---|
| `App.tsx` | Main screen: header, stats, tabs, search, list |
| `src/SignalCard.tsx` | One row in the feed |
| `src/SignalDetail.tsx` | Full-screen detail sheet |
| `src/data.ts` | Downloads the feed, caches it, stores the watchlist |
| `src/logic.ts` | Filtering and formatting (no UI code) |
| `src/config.ts` | Your feed URL |
| `src/demo.json` | Made-up sample data |
