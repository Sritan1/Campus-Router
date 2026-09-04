import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1420, height: 900 });

// bfs explores the widest, so it is the one that used to run off screen
for (const algorithm of ["BFS", "Dijkstra"]) {
  await page.goto("http://localhost:3000/lab?from=ARC&to=CDRLC", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: new RegExp(`^${algorithm}`) }).first().click();
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "Find route", exact: true })
    .click();
  await page.waitForSelector(".lane", { timeout: 25000 });
  await page.waitForTimeout(5600);

  const map = await page.locator(".map-wrap").boundingBox();
  await page.screenshot({
    path: `scripts/shots/single-${algorithm.toLowerCase()}.png`,
    clip: map,
  });
  console.log(`saved single-${algorithm.toLowerCase()}.png`);
}

await browser.close();
