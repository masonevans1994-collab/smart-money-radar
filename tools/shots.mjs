// Phone-size screenshots of the redesign preview, for review.
import { chromium } from "playwright";

const [url, outDir] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/1-welcome.png` });
const start = page.getByText("Show me the awards", { exact: true });
if (await start.count()) await start.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/2-contracts.png` });
const first = page.locator('[aria-label*="score"]').first();
if (await first.count()) {
  await first.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/3-detail.png` });
  const why = page.getByText("Score?", { exact: true });
  if (await why.count()) {
    await why.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/3b-score-explained.png` });
  }
  await page.getByText("Done", { exact: true }).click();
}
await page.getByText("Congress", { exact: true }).last().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/5-congress.png` });
await page.getByText("Record", { exact: true }).last().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/4-record.png` });
console.log(`screens saved; page errors: ${errors.length}`);
errors.forEach((e) => console.log("PAGE ERROR:", e));
await browser.close();
