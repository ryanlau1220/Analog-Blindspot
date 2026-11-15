import { useEffect, useRef, useState } from "react";

/** A quiet, original synthesized ambient bed; audio starts only on request. */
export function AmbientSound() {
  const engine = useRef<{ context: AudioContext; timer: number } | null>(null);
  const starting = useRef(false);
  const mounted = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => {
      if (!document.hidden || !engine.current) return;
      window.clearInterval(engine.current.timer);
      void engine.current.context.close();
      engine.current = null;
      setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (engine.current) {
        window.clearInterval(engine.current.timer);
        void engine.current.context.close();
        engine.current = null;
      }
    };
  }, []);

  const stop = () => {
    const current = engine.current;
    if (!current) return;
    engine.current = null;
    window.clearInterval(current.timer);
    void current.context.close();
    setPlaying(false);
  };

  const start = async () => {
    if (starting.current || engine.current) return;
    starting.current = true;
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      await context.resume();
      if (!mounted.current || document.hidden) {
        await context.close();
        return;
      }
      const audio = context;
      const master = context.createGain();
      master.gain.value = 0.045;
      master.connect(context.destination);
      const chords = [
        [110, 164.81, 220],
        [98, 146.83, 196],
        [87.31, 130.81, 174.61],
        [98, 146.83, 196],
      ];
      let step = 0;
      const playChord = () => {
        const startTime = audio.currentTime;
        for (const [i, frequency] of (chords[step % chords.length] ?? []).entries()) {
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(i === 0 ? 0.22 : 0.12, startTime + 1.5);
          gain.gain.linearRampToValueAtTime(0, startTime + 6.8);
          oscillator.connect(gain).connect(master);
          oscillator.start(startTime);
          oscillator.stop(startTime + 6.9);
        }
        step++;
      };
      playChord();
      engine.current = { context, timer: window.setInterval(playChord, 6000) };
      setPlaying(true);
    } catch {
      if (context && context.state !== "closed") void context.close();
      setUnavailable(true);
    } finally {
      starting.current = false;
    }
  };

  return (
    <button
      type="button"
      data-testid="ambient-toggle"
      aria-label={playing ? "Turn ambient sound off" : "Turn ambient sound on"}
      title={unavailable ? "Audio unavailable in this browser" : "Optional ambient sound"}
      disabled={unavailable}
      onClick={() => (playing ? stop() : void start())}
      className={`ab-sound-toggle ${playing ? "is-playing" : ""}`}
    >
      <span aria-hidden="true" className="ab-sound-icon">
        {playing ? "♫" : "♪"}
      </span>
      <span className="hidden xl:inline">{playing ? "Sound on" : "Sound off"}</span>
    </button>
  );
}
