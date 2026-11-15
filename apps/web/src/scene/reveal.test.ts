import { afterEach, expect, it, vi } from "vitest";
import { startReveal } from "./reveal";

afterEach(() => vi.unstubAllGlobals());

function clock() {
  let now = 0;
  let next: FrameRequestCallback | undefined;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    next = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    next = undefined;
  });
  return (elapsed: number) => {
    now = elapsed;
    const callback = next;
    next = undefined;
    callback?.(now);
  };
}

afterEach(() => vi.restoreAllMocks());

it("finishes after 3.6 seconds even with 600 ms frame gaps", () => {
  const frame = clock();
  const update = vi.fn();
  const complete = vi.fn();
  startReveal(update, complete);
  for (let time = 600; time <= 3600; time += 600) frame(time);
  expect(update.mock.lastCall?.[0]).toBeCloseTo(0.08);
  expect(complete).toHaveBeenCalledTimes(1);
});

it("finishes on the first delivered frame if rendering stalls past the duration", () => {
  const frame = clock();
  const update = vi.fn();
  const complete = vi.fn();
  startReveal(update, complete);
  frame(5000);
  expect(update.mock.lastCall?.[0]).toBeCloseTo(0.08);
  expect(complete).toHaveBeenCalledTimes(1);
});

it("cancellation prevents further updates and completion", () => {
  const frame = clock();
  const update = vi.fn();
  const complete = vi.fn();
  const cancel = startReveal(update, complete);
  frame(600);
  cancel();
  const count = update.mock.calls.length;
  frame(5000);
  expect(update).toHaveBeenCalledTimes(count);
  expect(complete).not.toHaveBeenCalled();
});
