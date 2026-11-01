# Publishing Radar to the App Store and Google Play

Everything below is prepared; the steps that need you are marked **You**.

## Before you submit (strongly recommended)

1. **Lawyer review** of the app and the Disclaimers page (securities + media law).
2. **Licensed stock-price data.** The free price feed used today is fine for personal
   use, but its terms don't allow republishing. Pick a provider whose plan allows
   display in a public app, then swap the source in `radar/prices.py`.

## Accounts (**You**)

- Apple Developer Program: $99/year, developer.apple.com/programs
- Google Play Console: $25 one-time, play.google.com/console
- Expo account (free): expo.dev

## Build and submit

```bash
cd app
npm install
npx expo install --fix
npm install -g eas-cli
eas login
eas build --platform all --profile production   # builds in Expo's cloud; no Mac needed
eas submit --platform ios                          # then: eas submit --platform android
```

`eas build --profile preview` makes an install link you can open on your own phone
before going to the stores.

## Store listing (draft)

**Name:** Radar: Government Contracts
**Subtitle (iOS, 30 chars):** Where federal money is going
**Category:** News (secondary: Finance)
**Age rating:** 4+ / Everyone (no objectionable content, no purchases)

**Description:**

> Radar shows when the U.S. government awards contracts to companies whose stock
> anyone can buy, explained in plain English.
>
> • See new federal contracts to public companies, newest first
> • Understand each one: who was hired, for what, how big it is for the company
> • See how the company's stock has moved since the contract was signed
> • Spot when members of Congress or company executives traded the same stock
> • Learn as you go with a simple guide; no investing experience needed
>
> Everything comes from public government records, with a link to the original.
>
> Radar is for information only. It is not investment advice and does not
> recommend buying or selling any security. Stocks can lose value.

**Keywords (iOS, 100 chars):**
`government contracts,federal spending,defense,stocks,congress trades,insider,public records,news`

Avoid "make money", "profit", "beat the market" or similar claims anywhere in
the listing or screenshots; app reviewers and regulators treat those as promises.

## Privacy answers

- **Apple App Privacy:** Data Not Collected. No tracking. (The app stores your
  saved stocks on the device only and has no accounts or analytics.)
- **Google Play Data safety:** No data collected, no data shared.
- **Privacy policy URL:** https://masonevans1994-collab.github.io/smart-money-radar/privacy.html

## Notes for App Review

> Radar displays public U.S. government records (USAspending.gov contract awards,
> SEC filings, congressional disclosures) with plain-English explanations. It has
> no accounts, no purchases and no trading features, and it does not give
> personalized advice. Disclaimers appear at first launch and on every screen.
