// drives a real browser for the layout and screen states unit tests cannot see.
// pass a url to check somewhere other than localhost

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const shots = "scripts/shots";
mkdirSync(shots, { recursive: true });

let failures = 0;
let checks = 0;

function check(name, ok, detail = "") {
  checks++;
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}  ${detail}`);
  }
}

async function boxes(page) {
  return page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return { map: pick(".map-wrap"), sidebar: pick(".sidebar"), body: pick(".body") };
  });
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => {
  failures++;
  console.log(`  FAIL uncaught page error  ${e.message}`);
});

try {
  console.log("\nwide screen");
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".sidebar");

  let b = await boxes(page);
  check("sidebar sits beside the map", b.sidebar.x > b.map.x + b.map.w - 5,
        `map ends ${b.map.x + b.map.w}, sidebar starts ${b.sidebar.x}`);
  // matches the sidebar width in globals.css
  check("sidebar is the planned width", Math.abs(b.sidebar.w - 420) < 3, `${b.sidebar.w}px`);
  await page.screenshot({ path: `${shots}/wide.png` });

  console.log("\nnarrow screen, under the 900px breakpoint");
  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(400);
  b = await boxes(page);
  check("sidebar drops under the map", b.sidebar.y > b.map.y + b.map.h - 5,
        `map ends ${b.map.y + b.map.h}, sidebar starts ${b.sidebar.y}`);
  check("sidebar goes full width", b.sidebar.w > 690, `${b.sidebar.w}px`);
  check("nothing scrolls sideways",
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        await page.evaluate(() => `${document.documentElement.scrollWidth} > ${window.innerWidth}`));
  await page.screenshot({ path: `${shots}/narrow.png`, fullPage: true });

  console.log("\nsearching and routing");
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${base}/?from=SEO&to=LCC`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  check("a shared link fills both ends",
        (await page.locator(".search-value").first().innerText()).includes("Science"),
        await page.locator(".search-value").first().innerText());

  await page.getByRole("button", { name: "Find route" }).first().click();
  await page.waitForSelector(".headline-distance", { timeout: 15000 });
  const distance = await page.locator(".headline-distance").innerText();
  check("navigate shows a distance", /mi|m/.test(distance), distance);
  check("the invite into the lab appears", await page.locator(".invite").count() > 0);
  const invite = await page.locator(".invite-headline").innerText();
  console.log(`       invite reads: "${invite}"`);
  await page.screenshot({ path: `${shots}/navigate.png` });

  // the steps have to add up to the route. both building links once went missing,
  // which only adding up the screen shows
  const stepSum = await page.evaluate(() =>
    [...document.querySelectorAll(".step-metres")]
      .reduce((total, el) => total + parseInt(el.textContent, 10), 0));
  const headline = parseInt((await page.locator(".headline-distance").innerText()), 10);
  check("the steps add up to the route",
        Math.abs(stepSum - headline) <= 2, `steps ${stepSum} m against ${headline} m`);

  // the crossings stat has to match its lines, since merging once changed the number
  const crossingStat = await page.evaluate(() => {
    const stat = [...document.querySelectorAll(".stat")]
      .find((el) => el.textContent.includes("crossings"));
    return stat ? parseInt(stat.textContent, 10) : -1;
  });
  const crossingLines = await page.locator("li.step.is-crossing").count();
  check("the crossings count matches the lines under it",
        crossingStat === crossingLines, `stat ${crossingStat}, lines ${crossingLines}`);


  console.log("\nthe lab");
  await page.locator(".invite").click();
  await page.waitForURL("**/lab**");
  check("the lab keeps both ends", page.url().includes("from=SEO") && page.url().includes("to=LCC"), page.url());
  await page.getByRole("button", { name: "Race", exact: true }).first().click();
  await page.waitForSelector(".panel-map", { timeout: 15000 });
  check("four panels, one per algorithm", await page.locator(".panel-map").count() === 4,
        `${await page.locator(".panel-map").count()} panels`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${shots}/race.png` });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${shots}/race-done.png` });

  // new route keeps the pair, or trying another algorithm means retyping both
  await page.getByRole("button", { name: "New route" }).click();
  await page.waitForTimeout(600);
  check("new route keeps both ends",
        page.url().includes("from=SEO") && page.url().includes("to=LCC"), page.url());

  // racing from one result has to run, not just flip a flag
  await page.getByRole("button", { name: /^Dijkstra/ }).first().click();
  await page.getByRole("complementary")
    .getByRole("button", { name: "Find route", exact: true }).click();
  await page.waitForSelector(".lane", { timeout: 15000 });
  await page.waitForTimeout(5200);
  check("one algorithm offers a race instead of a table",
        await page.getByRole("button", { name: "Compare table" }).count() === 0);
  await page.getByRole("button", { name: "Race all four", exact: true }).click();
  await page.waitForTimeout(6500);
  check("racing from one result runs in a single click",
        await page.locator(".lane").count() === 4,
        `${await page.locator(".lane").count()} lanes`);

  // changing mode reroutes on its own. erf to ses, since step free really is longer there
  console.log("\nchanging mode");
  await page.goto(`${base}/?from=ERF&to=SES`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Find route" }).first().click();
  await page.waitForSelector(".headline-distance", { timeout: 15000 });
  const shortest = await page.locator(".headline-distance").innerText();

  await page.getByRole("button", { name: "Accessible", exact: true }).click();
  await page.waitForSelector(".headline-distance", { timeout: 15000 });
  await page.waitForTimeout(800);
  const stepFree = await page.locator(".headline-distance").innerText();
  check("changing mode reroutes without asking again",
        stepFree !== shortest, `${shortest} then ${stepFree}`);

  console.log("\nbackend down");
  await page.route("**/api/**", (r) => r.abort());
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".fatal-title", { timeout: 15000 });
  check("says it cannot reach the service", await page.locator(".fatal-title").count() > 0);
  await page.screenshot({ path: `${shots}/backend-down.png` });
} finally {
  await browser.close();
}

console.log("");
console.log(failures === 0 ? `all ${checks} checks passed` : `${failures} of ${checks} failed`);
process.exit(failures === 0 ? 0 : 1);
