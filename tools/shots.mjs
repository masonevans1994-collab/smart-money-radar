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
const start = page.getByText(/show me the awards/i);
if (await start.count()) await start.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/2-contracts.png` });
const first = page.locator('[aria-label*="score"]').first();
if (await first.count()) {
  await first.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/3-detail.png` });
  // Lower half of the detail page: scroll the modal's own scroll view.
  for (let i = 1; i <= 3; i++) {
    await page.mouse.move(195, 600);
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/3-detail-${i}.png` });
  }
  await page.mouse.wheel(0, -4000);
  await page.waitForTimeout(300);
  // Save it, then open the company page.
  const save = page.getByText(/^☆ Save$/);
  if (await save.count()) { await save.first().click(); await page.waitForTimeout(200); }
  const companyLink = page.locator('[aria-label^="More about"]').first();
  if (await companyLink.count()) {
    await companyLink.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${outDir}/3d-company.png` });
    await page.getByText("‹ Back", { exact: true }).click();
    await page.waitForTimeout(300);
  }
  const cmp = page.getByText(/Compare with other/);
  if (await cmp.count()) {
    await cmp.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/3c-compare.png` });
    console.log("compare: " + (await page.locator("body").innerText()).replace(/\n+/g, " | ").slice(0, 600));
    await page.getByText("‹ Back", { exact: true }).click();
    await page.waitForTimeout(300);
  }
  const why = page.getByText("Score?", { exact: true });
  if (await why.count()) {
    await why.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/3b-score-explained.png` });
  }
  await page.getByText("Done", { exact: true }).click();
}
await page.getByText("Saved", { exact: true }).last().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/4b-saved.png` });
await page.getByText("People", { exact: true }).last().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/5-people.png` });
await page.getByText("You", { exact: true }).last().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/6-you.png` });
await page.getByText("Record", { exact: true }).last().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/4-record.png` });
console.log(`screens saved; page errors: ${errors.length}`);
errors.forEach((e) => console.log("PAGE ERROR:", e));
await browser.close();
