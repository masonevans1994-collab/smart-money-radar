// Opens the built app at phone size and fails the build if it doesn't render.
import { chromium } from "playwright";

const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url, { waitUntil: "networkidle" });
await page.getByText("Radar", { exact: false }).first().waitFor({ timeout: 20000 });
const start = page.getByText(/show me the awards/i);
if (await start.count()) { await start.click(); await page.waitForTimeout(500); }
const text = await page.locator("body").innerText();
const cards = (text.match(/since (signed|traded) [A-Z][a-z]{2} \d{1,2}/g) || []).length;
console.log("--- app text (first 1200 chars) ---\n" + text.slice(0, 1200));
console.log(`--- cards rendered: ${cards}; page errors: ${errors.length}`);
errors.forEach((e) => console.log("PAGE ERROR:", e));
await browser.close();
if (errors.length || cards === 0) process.exit(1);
