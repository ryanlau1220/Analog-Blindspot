// Browser smoke test against the production build. No network services or secrets are required.
import { chromium } from "playwright-core";
import { preview } from "vite";

const server = await preview({ preview: { port: 4318, strictPort: true, open: false } });
const base = server.resolvedUrls?.local?.[0];
if (!base) throw new Error("Preview server has no local URL");
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const failures = [];
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1366, height: 768 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => failures.push(`${name}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`${name}: ${message.text()}`);
    });
    page.on("requestfailed", (request) => failures.push(`${name}: request failed ${request.url()}`));
    page.on("response", (response) => {
      if (response.status() >= 400) failures.push(`${name}: HTTP ${response.status()} ${response.url()}`);
    });
    try {
      await page.goto(`${base}?test=1#scene=experiment`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.__ab?.readyKey === "earth/10m", null, { timeout: 60000 });
      await page.getByTestId("exp-site-lanzarote").click();
      await page.getByTestId("variant-30m").click();
      await page.waitForFunction(() => window.__ab?.readyKey === "lanzarote/30m", null, { timeout: 60000 });
      await page.getByText("Not measurable at 30 m", { exact: false }).first().waitFor();
      await page.getByRole("button", { name: "Evidence", exact: true }).click();
      await page.getByTestId("evidence-drawer").waitFor();
      await page.goto(`${base}#brief`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: /Field Validation Brief/ }).waitFor();
      console.log(`${name}: terrain switching, missing-data label, evidence and brief passed`);
    } finally {
      await page.close();
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
} finally {
  await browser.close();
  await server.close();
}
