"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MusicNotes, Pause } from "@phosphor-icons/react";
import { useSiteLocale } from "../../i18n/SiteLocale";

const PREFERENCE = "homa-calm-music";
const STEP_SECONDS = 0.74;
const VOLUME = 0.17;
const SCALE = [293.66, 311.13, 369.99, 392, 440, 466.16, 523.25, 587.33];
// Original slow instrumental phrase: Persian-inspired santur plucks and soft
// bowed-string tones. No third-party recording, streaming or tracking.
const MELODY = [0, 2, 3, 4, 6, 4, 3, 2, 1, 0, -1, 2, 3, 4, 2, 0,
  0, 1, 2, 3, 6, 4, 3, 2, 0, -1, 3, 2, 1, 0, -1, -1];
const ARPEGGIO = [0, 4, 2, 3, 0, 4, 6, 3, 0, 4, 2, 1, 0, 4, 3, 2];
const copy = {
  fa: { play: "پخش موسیقی آرام", pause: "توقف موسیقی", caption: "نغمه بی‌کلام ایرانی", failed: "پخش صدا در این مرورگر ممکن نیست" },
  en: { play: "Play calming music", pause: "Pause music", caption: "Persian-inspired instrumental", failed: "Audio is unavailable in this browser" },
  ar: { play: "تشغيل موسيقى هادئة", pause: "إيقاف الموسيقى", caption: "موسيقى مستوحاة من التراث الإيراني", failed: "الصوت غير متاح في هذا المتصفح" },
} as const;

type Engine = {
  context: AudioContext;
  master: GainNode;
  timer: ReturnType<typeof setInterval> | null;
  sleeper: ReturnType<typeof setTimeout> | null;
  cursor: number;
  nextTime: number;
};

function scheduleVoice(engine: Engine, frequency: number, at: number, seconds: number, kind: "bow" | "santur") {
  const ctx = engine.context;
  const sound = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const end = at + seconds;
  sound.type = kind === "bow" ? "triangle" : "sine";
  sound.frequency.setValueAtTime(frequency, at);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(kind === "bow" ? 1050 : 2300, at);
  gain.gain.setValueAtTime(0.0001, at);
  if (kind === "bow") {
    gain.gain.exponentialRampToValueAtTime(0.075, at + .24);
    gain.gain.setValueAtTime(0.07, Math.max(at + .25, end - .38));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
  } else {
    gain.gain.exponentialRampToValueAtTime(0.105, at + .015);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
  }
  sound.connect(filter);
  filter.connect(gain);
  gain.connect(engine.master);
  sound.onended = () => {
    sound.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
  sound.start(at);
  sound.stop(end + .02);
}

function createEngine(): Engine | null {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.setValueAtTime(0, context.currentTime);
  master.connect(context.destination);

  const echo = context.createDelay(.8);
  const feedback = context.createGain();
  const returnGain = context.createGain();
  echo.delayTime.value = .29;
  feedback.gain.value = .13;
  returnGain.gain.value = .12;
  master.connect(echo);
  echo.connect(feedback);
  feedback.connect(echo);
  echo.connect(returnGain);
  returnGain.connect(context.destination);
  return { context, master, timer: null, sleeper: null, cursor: 0, nextTime: 0 };
}

function schedulePhrase(engine: Engine) {
  if (engine.context.state !== "running") return;
  while (engine.nextTime < engine.context.currentTime + .45) {
    const beat = engine.cursor++;
    const at = engine.nextTime;
    const note = MELODY[beat % MELODY.length];
    const pluck = ARPEGGIO[beat % ARPEGGIO.length];
    if (note >= 0 && beat % 2 === 0) {
      scheduleVoice(engine, SCALE[note], at, STEP_SECONDS * 1.95, "bow");
    }
    scheduleVoice(engine, SCALE[pluck] * (beat % 4 === 3 ? .5 : 1), at, .85, "santur");
    if (beat % 8 === 0) {
      scheduleVoice(engine, SCALE[0] / 2, at, STEP_SECONDS * 6.5, "bow");
    }
    engine.nextTime += STEP_SECONDS;
  }
}

function haltEngine(engine: Engine) {
  if (engine.timer !== null) {
    clearInterval(engine.timer);
    engine.timer = null;
  }
  if (engine.sleeper !== null) {
    clearTimeout(engine.sleeper);
    engine.sleeper = null;
  }
  const at = engine.context.currentTime;
  engine.master.gain.cancelScheduledValues(at);
  engine.master.gain.setTargetAtTime(0, at, .12);
  engine.sleeper = setTimeout(() => {
    if (engine.context.state === "running") void engine.context.suspend().catch(() => {});
    engine.sleeper = null;
  }, 370);
}

export default function HomaAmbientMusic() {
  const { locale } = useSiteLocale();
  const t = copy[locale];
  const engineRef = useRef<Engine | null>(null);
  const playingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const start = useCallback(async () => {
    try {
      let engine = engineRef.current;
      if (!engine) {
        engine = createEngine();
        if (!engine) throw new Error("AudioContext unsupported");
        engineRef.current = engine;
      }
      if (engine.sleeper !== null) {
        clearTimeout(engine.sleeper);
        engine.sleeper = null;
      }
      await engine.context.resume();
      if (engine.context.state !== "running") throw new Error("AudioContext blocked");
      engine.nextTime = engine.context.currentTime + .08;
      engine.cursor = 0;
      engine.master.gain.cancelScheduledValues(engine.context.currentTime);
      engine.master.gain.setTargetAtTime(VOLUME, engine.context.currentTime, .38);
      if (engine.timer !== null) clearInterval(engine.timer);
      schedulePhrase(engine);
      engine.timer = setInterval(() => schedulePhrase(engine), 200);
      playingRef.current = true;
      setPlaying(true);
      setFailed(false);
    } catch {
      playingRef.current = false;
      setPlaying(false);
      setFailed(true);
    }
  }, []);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (engine) haltEngine(engine);
    playingRef.current = false;
    setPlaying(false);
  }, []);

  // Do not play before consent. On a returning visit that opted in earlier,
  // start only after a subsequent real user gesture (mobile autoplay policy).
  useEffect(() => {
    let remembered = false;
    try { remembered = localStorage.getItem(PREFERENCE) === "on"; } catch {}
    if (!remembered) return;
    const activate = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".homa-ambient-control")) return;
      if (event instanceof KeyboardEvent && !["Enter", " ", "Spacebar"].includes(event.key)) return;
      document.removeEventListener("pointerdown", activate, true);
      document.removeEventListener("keydown", activate, true);
      void start();
    };
    document.addEventListener("pointerdown", activate, true);
    document.addEventListener("keydown", activate, true);
    return () => {
      document.removeEventListener("pointerdown", activate, true);
      document.removeEventListener("keydown", activate, true);
    };
  }, [start]);

  useEffect(() => {
    const visibility = () => {
      const engine = engineRef.current;
      if (!engine || !playingRef.current) return;
      if (document.hidden) {
        void engine.context.suspend().catch(() => {});
      } else {
        void engine.context.resume().then(() => {
          engine.nextTime = engine.context.currentTime + .08;
        }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      const engine = engineRef.current;
      engineRef.current = null;
      if (engine) {
        if (engine.timer !== null) clearInterval(engine.timer);
        if (engine.sleeper !== null) clearTimeout(engine.sleeper);
        void engine.context.close().catch(() => {});
      }
    };
  }, []);

  return (
    <button
      type="button"
      className={"homa-ambient-control" + (playing ? " is-playing" : "")}
      aria-label={playing ? t.pause : t.play}
      aria-pressed={playing}
      title={failed ? t.failed : playing ? t.pause : t.play}
      onClick={() => {
        try {
          localStorage.setItem(PREFERENCE, playingRef.current ? "off" : "on");
        } catch {}
        if (playingRef.current) stop();
        else void start();
      }}
    >
      <span className="homa-ambient-icon" aria-hidden="true">
        {playing ? <Pause size={21} weight="fill" /> : <MusicNotes size={21} weight="duotone" />}
      </span>
      <span className="homa-ambient-label">
        <strong>{playing ? t.pause : t.play}</strong>
        <small>{t.caption}</small>
      </span>
      <span className="homa-ambient-bars" aria-hidden="true"><i/><i/><i/><i/></span>
    </button>
  );
}
