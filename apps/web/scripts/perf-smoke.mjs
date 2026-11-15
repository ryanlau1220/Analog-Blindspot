// Performance smoke test for the 3D slice.
//
//   pnpm build && pnpm perf
//
// Serves dist/ with `vite preview`, drives the app through every site/variant
// and an out-of-order sequence via the `?test=1` hook, and records load time,
// frame rate, draw calls and triangles. Uses a system Chrome (override with
// CHROME=/path) through playwright-core. Headless Chrome renders with
// the best GL it finds; without a GPU that is a software rasteriser, so frame
// rates there only catch gross regressions.
//
// Fails on: console/page errors, failed requests, a variant not becoming ready
// within READY_MS, mean FPS below MIN_FPS, or data transfer above DATA_BUDGET.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { preview } from "vite";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "perf-results");
const READY_MS = Number(process.env.READY_MS ?? 15000);
// FPS floor: 30 on a hardware GPU; 2 on software rasterisers (SwiftShader/llvmpipe),
// where the check only catches pathological regressions. Override with MIN_FPS.
const HW_MIN_FPS = 30;
const SW_MIN_FPS = 2;
// Three sites, every variant visited: 9.4 MB of assets in total (Phase D adds Lanzarote).
const DATA_BUDGET = 12 * 1024 * 1024;
const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome";

const server = await preview({ root: ROOT, preview: { port: 4317, strictPort: true, open: false } });
const base = server.resolvedUrls?.local?.[0] ?? "http://localhost:4317/";
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  // Prefer a real GPU; allow the software fallback when there is none.
  args: ["--ignore-gpu-blocklist", "--enable-gpu", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
let dataBytes = 0;
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) =>
  problems.push(`pageerror after ${results.length} scenarios: ${(e.stack ?? e.message).slice(0, 1500)}`),
);
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()}: ${r.url()}`));
page.on("response", async (r) => {
  if (r.url().includes("/data/") && r.ok()) {
    const len =
      Number(r.headers()["content-length"] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
    dataBytes += len;
  }
});

mkdirSync(OUT, { recursive: true });

async function waitReady(key) {
  const t0 = Date.now();
  await page.waitForFunction((k) => window.__ab?.readyKey === k, key, { timeout: READY_MS });
  return Date.now() - t0;
}

async function measureFps(ms = 2500) {
  return page.evaluate(
    (dur) =>
      new Promise((resolve) => {
        const times = [];
        const start = performance.now();
        const tick = (t) => {
          times.push(t);
          if (t - start < dur) requestAnimationFrame(tick);
          else {
            const dts = times
              .slice(1)
              .map((v, i) => v - times[i])
              .sort((a, b) => a - b);
            const p95 = dts[Math.floor(dts.length * 0.95)] ?? 0;
            resolve({ fps: (times.length - 1) / ((times.at(-1) - times[0]) / 1000), p95_frame_ms: p95 });
          }
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

const dispatch = (a) => page.evaluate((x) => window.__ab.dispatch(x), a);
// Short horizontal orbit drags, alternating direction so the view does not
// drift between scenarios (the frames measured include damping motion).
let spinDir = 1;
const spin = async () => {
  if (process.env.NO_SPIN) return;
  await page.mouse.move(640, 260);
  await page.mouse.down();
  await page.mouse.move(640 + 60 * spinDir, 260, { steps: 20 });
  await page.mouse.up();
  spinDir = -spinDir;
};

const scenarios = [
  { name: "moon_4m", key: "moon/4m", actions: [] },
  {
    name: "moon_cutaway_x2",
    key: "moon/4m",
    actions: [
      { type: "toggleCutaway" },
      { type: "setCutPosition", position: 0.5 },
      { type: "setExaggeration", value: 2 },
    ],
  },
  {
    name: "moon_orthophoto",
    key: "moon/4m",
    actions: [
      { type: "toggleCutaway" },
      { type: "setExaggeration", value: 1 },
      { type: "setDrape", drape: "orthophoto" },
    ],
  },
  { name: "earth_0p5m", key: "earth/0p5m", actions: [{ type: "selectSite", site: "earth" }] },
  { name: "earth_4m", key: "earth/4m", actions: [{ type: "selectVariant", variantId: "4m" }] },
  { name: "earth_10m", key: "earth/10m", actions: [{ type: "selectVariant", variantId: "10m" }] },
  { name: "earth_30m", key: "earth/30m", actions: [{ type: "selectVariant", variantId: "30m" }] },
  { name: "lanzarote_2m", key: "lanzarote/2m", actions: [{ type: "selectSite", site: "lanzarote" }] },
  { name: "lanzarote_30m", key: "lanzarote/30m", actions: [{ type: "selectVariant", variantId: "30m" }] },
  { name: "earth_return", key: "earth/0p5m", actions: [{ type: "selectSite", site: "earth" }] },
  {
    name: "earth_0p5m_cutaway_x4",
    key: "earth/0p5m",
    actions: [
      { type: "selectVariant", variantId: "0p5m" },
      { type: "toggleCutaway" },
      { type: "setCutPosition", position: 0.42 },
      { type: "setExaggeration", value: 4 },
    ],
  },
];

const results = [];
const t0 = Date.now();
await page.goto(`${base}?test=1`);
const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
const software = /swiftshader|llvmpipe|softpipe/i.test(renderer);
const MIN_FPS = Number(process.env.MIN_FPS ?? (software ? SW_MIN_FPS : HW_MIN_FPS));
console.log(`renderer: ${renderer} (${software ? "software" : "hardware"}), min fps ${MIN_FPS}`);
for (const sc of scenarios) {
  for (const a of sc.actions) await dispatch(a);
  const ready_ms = await waitReady(sc.key);
  await page.waitForTimeout(1600); // let the camera tween finish
  await spin();
  const camera_before = await page.evaluate(() => window.__ab.camera);
  const fps = await measureFps();
  const render = await page.evaluate(() => ({ ...window.__ab.render, camera: window.__ab.camera }));
  await page.screenshot({ path: join(OUT, `${sc.name}.png`) });
  results.push({ scenario: sc.name, ready_ms, ...fps, ...render });
  console.log(
    `${sc.name.padEnd(24)} ready ${String(ready_ms).padStart(5)} ms  ${fps.fps.toFixed(1)} fps  p95 ${fps.p95_frame_ms.toFixed(1)} ms  ${render?.triangles} tris  cam ${camera_before} -> ${render?.camera}`,
  );
}

// Out-of-order burst: no waiting between actions; final state must render correctly.
for (const a of [
  { type: "selectVariant", variantId: "30m" },
  { type: "selectSite", site: "moon" },
  { type: "setExaggeration", value: 1 },
  { type: "selectSite", site: "earth" },
  { type: "selectVariant", variantId: "10m" },
  { type: "selectSite", site: "moon" },
])
  await dispatch(a);
const burst_ready_ms = await waitReady("moon/4m");
await page.waitForTimeout(1800);
const cam = await page.evaluate(() => window.__ab.state);
await page.screenshot({ path: join(OUT, "out_of_order_final.png") });
// Story: chapters entered out of order, each must render its own site/variant.
const storyDispatch = (a) => page.evaluate((x) => window.__ab.storyDispatch(x), a);
const chapterKeys = [
  [4, "moon/4m"],
  [0, "moon/4m"],
  [3, "earth/10m"],
  [1, "moon/4m"],
  [2, "earth/0p5m"],
];
const story = [];
for (const [i, key] of chapterKeys) {
  await storyDispatch({ type: "goTo", scene: Number(i) });
  const ready_ms = await waitReady(key);
  await page.waitForTimeout(1900);
  const s = await page.evaluate(() => ({ story: window.__ab.story, state: window.__ab.state }));
  const panel = await page.locator('[data-testid="story-panel"]').count();
  if (!panel) problems.push(`story panel missing at chapter ${i}`);
  if (s.story.scene !== Number(i)) problems.push(`chapter ${i}: story at ${s.story.scene}`);
  await page.screenshot({ path: join(OUT, `story_${i}.png`) });
  story.push({
    chapter: Number(i),
    ready_ms,
    site: s.state.site,
    variant: s.state.variantId,
    view: s.state.view,
  });
  console.log(
    `story chapter ${i}: ready ${ready_ms} ms, ${s.state.site}/${s.state.variantId} ${s.state.view}`,
  );
}

// Guided replay from the start must reach the last chapter and stop by itself.
await storyDispatch({ type: "goTo", scene: 0 });
await storyDispatch({ type: "play" });
const replayT0 = Date.now();
await page.waitForFunction(() => window.__ab.story?.playing === true, null, { timeout: 5000 });
await page.waitForFunction(() => window.__ab.story && !window.__ab.story.playing, null, { timeout: 120000 });
const replay = {
  seconds: (Date.now() - replayT0) / 1000,
  final: await page.evaluate(() => window.__ab.story),
};
if (replay.final.scene !== 4) problems.push(`replay ended at chapter ${replay.final.scene}`);
console.log(`guided replay: ${replay.seconds.toFixed(1)} s, ended at chapter ${replay.final.scene}`);

// Phone-sized viewport, deep-linked chapter.
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
phone.on("pageerror", (e) => problems.push(`phone pageerror: ${e.message}`));
await phone.goto(`${base}?test=1#scene=blindspot`);
await phone.waitForFunction(
  () => window.__ab?.readyKey === "moon/4m" && window.__ab.story?.scene === 1,
  null,
  {
    timeout: READY_MS,
  },
);
await phone.waitForTimeout(2000);
await phone.screenshot({ path: join(OUT, "phone_blindspot.png") });
await phone.close();

const total_s = (Date.now() - t0) / 1000;

const failures = [...problems];
for (const r of results)
  if (r.fps < MIN_FPS) failures.push(`${r.scenario}: ${r.fps.toFixed(1)} fps < ${MIN_FPS}`);
if (dataBytes > DATA_BUDGET) failures.push(`data transfer ${dataBytes} > ${DATA_BUDGET}`);
if (cam.site !== "moon" || cam.variantId !== "4m")
  failures.push(`out-of-order final state wrong: ${JSON.stringify(cam)}`);

const report = {
  when: new Date().toISOString(),
  renderer,
  software_renderer: software,
  min_fps: MIN_FPS,
  chrome: browser.version(),
  viewport: "1280x800",
  results,
  out_of_order: { ready_ms: burst_ready_ms, final_state: cam },
  story,
  replay,
  data_bytes: dataBytes,
  total_s,
  failures,
};
writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `data ${(dataBytes / 1e6).toFixed(2)} MB, out-of-order ready ${burst_ready_ms} ms, total ${total_s.toFixed(1)} s`,
);
await browser.close();
await server.close();
if (failures.length) {
  console.error(`FAIL\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("PASS");
