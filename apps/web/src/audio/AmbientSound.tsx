import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** A quiet, original synthesized ambient bed; audio starts only on request. */
export function AmbientSound() {
  const engine = useRef<{ context: AudioContext; timer: number; master: GainNode } | null>(null);
  const starting = useRef(false);
  const mounted = useRef(false);
  const [volume, setVolume] = useState(35);
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
    current.master.gain.setTargetAtTime(0, current.context.currentTime, 0.04);
    window.setTimeout(() => {
      void current.context.close();
    }, 200);
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
      master.gain.value = volume / 100;
      master.connect(context.destination);
      const chords = [
        [220, 329.63, 440],
        [196, 293.66, 392],
        [174.61, 261.63, 349.23],
        [196, 293.66, 392],
      ];
      let step = 0;
      const playChord = () => {
        const startTime = audio.currentTime;
        for (const [i, frequency] of (chords[step % chords.length] ?? []).entries()) {
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.type = i === 0 ? "sine" : "triangle";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(i === 0 ? 0.22 : 0.12, startTime + 1.5);
          gain.gain.linearRampToValueAtTime(0, startTime + 6.8);
          oscillator.connect(gain).connect(master);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
          oscillator.start(startTime);
          oscillator.stop(startTime + 6.9);
        }
        step++;
      };
      playChord();
      engine.current = { context, master, timer: window.setInterval(playChord, 6000) };
      setPlaying(true);
    } catch {
      if (context && context.state !== "closed") void context.close();
      setUnavailable(true);
    } finally {
      starting.current = false;
    }
  };

  return (
    <div className="relative">
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
          {playing ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </span>
        <span className="hidden sm:inline">{playing ? "Sound on" : "Enable sound"}</span>
      </button>
      {playing && (
        <label className="ab-volume">
          Volume
          <input
            aria-label="Ambient volume"
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              const current = engine.current;
              if (current) current.master.gain.setTargetAtTime(next / 100, current.context.currentTime, 0.08);
            }}
          />
          <span>{volume}%</span>
        </label>
      )}
      {unavailable && (
        <span role="status" className="ab-volume">
          Audio unavailable
        </span>
      )}
    </div>
  );
}
