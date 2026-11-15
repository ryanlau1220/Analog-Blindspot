/** Keep the 3.6 s reveal bounded even when software WebGL drops frames. */
export function startReveal(onUpdate: (split: number) => void, onComplete: () => void): () => void {
  const started = performance.now();
  let frame = 0;
  let cancelled = false;
  onUpdate(0.92);
  const tick = () => {
    if (cancelled) return;
    const progress = Math.min((performance.now() - started) / 3600, 1);
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    onUpdate(0.92 - 0.84 * eased);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else onComplete();
  };
  frame = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}
