import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1420, height: 900 });

for (const minutes of ["5 min", "15 min"]) {
  await page.goto("http://localhost:3000/?from=ARC", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Reach", exact: true }).click();
  await page.getByRole("button", { name: minutes, exact: true }).click();
  await page.getByRole("button", { name: "Show reach" }).click();
  await page.waitForSelector(".reach-list", { timeout: 25000 });
  await page.waitForTimeout(1400);

  const map = await page.locator(".map-wrap").boundingBox();
  const name = minutes.replace(" ", "");
  await page.screenshot({ path: `scripts/shots/reach-map-${name}.png`, clip: map });
  console.log(`saved reach-map-${name}.png`);
}

await browser.close();
