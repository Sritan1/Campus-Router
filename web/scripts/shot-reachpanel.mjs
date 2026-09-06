import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();

async function open(height) {
  await page.setViewportSize({ width: 1500, height });
  await page.goto("http://localhost:3000/?from=ARC", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Reach", exact: true }).click();
  await page.getByRole("button", { name: "15 min", exact: true }).click();
  await page.getByRole("button", { name: "Show reach" }).click();
  await page.waitForSelector(".reach-list", { timeout: 25000 });
  await page.waitForTimeout(900);
}

function rows() {
  return page.locator(".reach-row").count();
}

await open(950);
let box = await page.locator(".sidebar").boundingBox();
await page.screenshot({ path: "scripts/shots/reach-done.png", clip: box });
const tall = await rows();
console.log("tall window  rows shown:", tall);

await page.getByRole("button", { name: /and \d+ more/ }).click();
await page.waitForTimeout(500);
const opened = await rows();
console.log("after expanding:", opened);
box = await page.locator(".sidebar").boundingBox();
await page.screenshot({ path: "scripts/shots/reach-expanded.png", clip: box });

await open(620);
const short = await rows();
console.log("short window rows shown:", short);
box = await page.locator(".sidebar").boundingBox();
await page.screenshot({ path: "scripts/shots/reach-short.png", clip: box });

await browser.close();
