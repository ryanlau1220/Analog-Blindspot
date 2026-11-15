// Screenshot each story chapter from the production build.
//
//   pnpm build && node scripts/screens.mjs <out-dir> [WxH ...]
//
// Drives the story through the ?test=1 hook, waits until the chapter's terrain
// has rendered, lets the camera settle, then captures the viewport. A hard
// timer kills the run so it can never hang.
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const out = resolve(process.argv[2] ?? join(ROOT, "screens"));
const sizes = (process.argv.slice(3).length ? process.argv.slice(3) : ["1366x768"]).map((s) =>
  s.split("x").map(Number),
);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 2600);
const killer = setTimeout(
  () => {
    console.error("screens: hard timeout");
    process.exit(2);
  },
  Number(process.env.HARD_MS ?? 240000),
);

mkdirSync(out, { recursive: true });
const server = await preview({ root: ROOT, preview: { port: 4321, strictPort: false, open: false } });
const base = server.resolvedUrls?.local?.[0] ?? "http://localhost:4321/";
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const errors = [];
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => errors.push(`${w}x${h}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${w}x${h} console: ${m.text()}`));
  await page.goto(`${base}?test=1`);
  await page.waitForFunction(() => window.__ab?.storyDispatch && window.__ab.readyKey, null, {
    timeout: 30000,
  });
  const n = await page.evaluate(() => document.querySelectorAll("[data-testid^=chapter-]").length || 5);
  for (let i = 0; i < n; i++) {
    await page.evaluate((k) => window.__ab.storyDispatch({ type: "goTo", scene: k }), i);
    await page.waitForFunction((k) => window.__ab.story?.scene === k && window.__ab.readyKey !== null, i, {
      timeout: 30000,
    });
    await page.waitForTimeout(SETTLE_MS);
    const file = join(out, `${w}x${h}_chapter${i + 1}.png`);
    await page.screenshot({ path: file });
    console.log(`saved ${file}`);
  }
  await page.close();
}
await browser.close();
await server.close();
clearTimeout(killer);
if (errors.length) console.log(`page errors:\n  ${errors.join("\n  ")}`);
process.exit(0);
