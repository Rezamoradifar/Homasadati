"use client";
import { useState } from "react";
import Localized from "../src/i18n/Localized";

/** A slow cinematic motion made from the site's own backdrop photos: each one
 * drifts and zooms gently while they crossfade in turn. Pure CSS; it stands
 * still when the visitor prefers reduced motion and can be paused. */
const scenes = [
  ["persepolis", "تخت‌جمشید"],
  ["pasargadae", "پاسارگاد"],
  ["isfahan", "اصفهان"],
  ["yazd", "یزد"],
];

export default function HeroMotion() {
  const [paused, setPaused] = useState(false);
  return (
    <Localized>
      <div className={"hero-motion" + (paused ? " paused" : "")} aria-hidden="true">
        {scenes.map(([file], i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={file}
            src={`/assets/backdrop/${file}.webp`}
            alt=""
            fetchPriority={i === 0 ? "high" : "low"}
            loading={i === 0 ? "eager" : "lazy"}
            style={{ animationDelay: `${i * 7}s` }}
          />
        ))}
      </div>
      <div className="hero-motion-controls">
        <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? "ادامهٔ نمایش" : "توقف نمایش"}
        </button>
        <span>{scenes.map(([, name]) => name).join(" · ")}</span>
      </div>
    </Localized>
  );
}
