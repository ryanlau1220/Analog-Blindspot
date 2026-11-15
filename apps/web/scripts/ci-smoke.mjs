// Browser smoke test against the production build. No network services or secrets are required.
import { mkdir } from "node:fs/promises";
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
await mkdir("../../tmp/motion-review", { recursive: true });
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1366, height: 768 }],
    ["mobile", { width: 390, height: 844 }],
    ["small mobile", { width: 320, height: 844 }],
  ]) {
    const page = await browser.newPage({
      viewport,
      reducedMotion: name === "small mobile" ? "reduce" : "no-preference",
    });
    page.setDefaultTimeout(20000);
    await page.addInitScript(() => {
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (destination, ...rest) {
        if (destination instanceof AudioDestinationNode) {
          const meter = this.context.createAnalyser();
          connect.call(this, meter);
          connect.call(meter, destination);
          window.__audioMeter = meter;
          return destination;
        }
        return connect.call(this, destination, ...rest);
      };
    });
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
      const sound = page.getByTestId("ambient-toggle");
      const soundBounds = await sound.boundingBox();
      if (!soundBounds || soundBounds.x < 0 || soundBounds.x + soundBounds.width > viewport.width)
        throw new Error(`${name}: sound control is outside the viewport`);
      if ((await sound.getAttribute("aria-label")) !== "Turn ambient sound on")
        throw new Error("Sound was not off initially");
      await sound.click();
      await page.getByRole("button", { name: "Turn ambient sound off" }).waitFor();
      await page.waitForFunction(() => {
        const meter = window.__audioMeter;
        if (meter?.context.state !== "running") return false;
        const samples = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(samples);
        return samples.some((value) => Math.abs(value) > 0.005);
      });
      await page.getByRole("slider", { name: "Ambient volume" }).fill("65");
      if ((await page.getByRole("slider", { name: "Ambient volume" }).inputValue()) !== "65")
        throw new Error("Audio volume did not update");
      await sound.click();
      await page.getByRole("button", { name: "Turn ambient sound on" }).waitFor();
      await page.getByTestId("focus-lab").click();
      if ((await page.getByTestId("focus-lab").getAttribute("aria-pressed")) !== "true")
        throw new Error("Focus mode did not open");
      const split = page.getByTestId("split-handle");
      await split.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(
        () => document.querySelector('[data-testid="split-handle"]')?.getAttribute("aria-valuenow") === "55",
      );
      if ((await page.evaluate(() => window.__ab.story.scene)) !== 3)
        throw new Error("Split keyboard interaction navigated away from the experiment");
      await page.getByTestId("reveal-sweep").click();
      if (name !== "small mobile") {
        await page.getByRole("button", { name: "Stop reveal" }).waitFor();
        await page.waitForFunction(
          () =>
            Number(document.querySelector('[data-testid="split-handle"]')?.getAttribute("aria-valuenow")) <
            85,
        );
        await page.getByRole("button", { name: "Stop reveal" }).click();
      } else {
        if ((await split.getAttribute("aria-valuenow")) !== "50")
          throw new Error("Reduced-motion reveal should be static");
      }
      await page.screenshot({ path: `../../tmp/motion-review/${name}-focus.png` });
      await page.getByTestId("focus-lab").click();
      await page.getByTestId("scroll-toggle").click();
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="journey-scroll"]');
        return Math.round(el.scrollTop / el.clientHeight) === 3;
      });
      if ((await page.locator("canvas").evaluate((el) => getComputedStyle(el).touchAction)) !== "pan-y")
        throw new Error("Canvas blocks native touch scrolling");
      await page.getByTestId("journey-scroll").evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.waitForFunction(() => window.__ab.story.scene === 0);
      await page.getByTestId("journey-scroll").evaluate((el) => {
        el.scrollTop = el.clientHeight * 3;
      });
      await page.waitForFunction(() => window.__ab.story.scene === 3);
      await page.getByTestId("chapter-search").click();
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="journey-scroll"]');
        return window.__ab.story.scene === 2 && Math.round(el.scrollTop / el.clientHeight) === 2;
      });
      await page.getByTestId("scroll-toggle").click();
      await page.getByTestId("chapter-experiment").click();
      await page.getByTestId("exp-site-lanzarote").click();
      await page.getByTestId("variant-30m").click();
      await page.waitForFunction(() => window.__ab?.readyKey === "lanzarote/30m", null, { timeout: 60000 });
      await page.getByText("Not measurable at 30 m", { exact: false }).first().waitFor();
      if (name === "desktop") await page.getByText("30 m grid: too few cells", { exact: false }).waitFor();
      await page.getByRole("button", { name: "Evidence", exact: true }).click();
      await page.getByTestId("evidence-drawer").waitFor();
      await page.goto(`${base}#brief`, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: /Field Validation Brief/ }).waitFor();
      console.log(
        `${name}: audio signal/volume, focus, reveal, scroll navigation, terrain, evidence and brief passed`,
      );
    } finally {
      await page.close();
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
} finally {
  await browser.close();
  await server.close();
}
