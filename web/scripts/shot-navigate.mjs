import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1420, height: 900 });
await page.goto("http://localhost:3000/?from=ARC&to=CDRLC", {
  waitUntil: "networkidle",
});
await page.waitForSelector(".preference", { timeout: 20000 });
await page.waitForTimeout(900);

await page.screenshot({ path: "scripts/shots/navigate-idle.png" });
console.log("saved navigate-idle.png");

const box = await page.locator(".sidebar").boundingBox();
await page.screenshot({ path: "scripts/shots/navigate-sidebar.png", clip: box });
console.log("saved navigate-sidebar.png");

await browser.close();
