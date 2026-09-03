import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1500, height: 950 });
await page.goto("http://localhost:3000/?from=BSB&to=SES", {
  waitUntil: "networkidle",
});
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /find route/i }).first().click();
await page.waitForSelector(".headline-distance", { timeout: 20000 });
await page.waitForTimeout(1200);

const panel = await page.locator(".sidebar").boundingBox();
await page.screenshot({ path: "scripts/shots/navigate-panel.png", clip: panel });
console.log("saved navigate-panel.png");
await browser.close();
