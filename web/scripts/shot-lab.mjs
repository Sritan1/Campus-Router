import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1500, height: 950 });
await page.goto("http://localhost:3000/lab?from=ARC&to=CDRLC", {
  waitUntil: "networkidle",
});
await page.waitForSelector(".card", { timeout: 20000 });
await page.waitForTimeout(700);

const box = await page.locator(".sidebar").boundingBox();
await page.screenshot({ path: "scripts/shots/lab-idle.png", clip: box });
console.log("saved lab-idle.png");

await page.getByRole("button", { name: /Race mode/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "scripts/shots/lab-race.png", clip: box });
console.log("saved lab-race.png");

await browser.close();
