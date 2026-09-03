import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1420, height: 830 });
await page.goto("http://localhost:3000/lab?from=ARC&to=CDRLC&race=1", {
  waitUntil: "networkidle",
});
await page.waitForTimeout(900);
await page.getByRole("button", { name: "Race all four", exact: true }).click();
await page.waitForSelector(".winners", { timeout: 25000 });
await page.waitForTimeout(6000);

await page.screenshot({ path: "scripts/shots/race-results.png" });
console.log("saved race-results.png");

const box = await page.locator(".sidebar").boundingBox();
await page.screenshot({ path: "scripts/shots/race-sidebar.png", clip: box });
console.log("saved race-sidebar.png");

await page.getByRole("button", { name: "Compare table" }).click();
await page.waitForSelector(".compare", { timeout: 10000 });
await page.waitForTimeout(600);
await page.screenshot({ path: "scripts/shots/race-table.png" });
console.log("saved race-table.png");

await browser.close();
