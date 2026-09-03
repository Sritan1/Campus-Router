import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1000 });
await page.goto("http://localhost:3000/lab?from=ARC&to=CDRLC&race=1", {
  waitUntil: "networkidle",
});
await page.waitForTimeout(900);
await page.getByRole("button", { name: "Race", exact: true }).first().click();
await page.waitForSelector(".panel-map", { timeout: 20000 });
await page.waitForTimeout(6500);
await page.screenshot({ path: "scripts/shots/grid-after.png" });
console.log("saved grid-after.png");
await browser.close();
