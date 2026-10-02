"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
export function useAutoGallery(
  target: RefObject<HTMLElement>,
  advance: () => void,
  delay = 6500,
  /** Hero use: wait for interaction (or 12s after load) before the first change. */
  holdAtStart = false,
) {
  const [paused, setPaused] = useState(false),
    [allowed, setAllowed] = useState(false),
    [visible, setVisible] = useState(false);
  const callback = useRef(advance);
  callback.current = advance;
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const connection=(navigator as Navigator & {connection?:{saveData?:boolean;effectiveType?:string}}).connection;
    const sync = () => setAllowed(!media.matches && !document.hidden && !connection?.saveData && !["slow-2g","2g"].includes(connection?.effectiveType||""));
    sync();
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.15 },
    );
    if (target.current) observer.observe(target.current);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [target]);
  // Hold the first change until the visitor interacts or has been on the
  // page a while, so the opening image stays the page's largest paint and
  // nothing competes with loading.
  const [loaded, setLoaded] = useState(!holdAtStart);
  useEffect(() => {
    if (!holdAtStart) return;
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    let timer = 0;
    const done = () => setLoaded(true);
    const arm = () => (timer = window.setTimeout(done, 12000));
    events.forEach((e) => window.addEventListener(e, done, { once: true, passive: true }));
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("load", arm);
      events.forEach((e) => window.removeEventListener(e, done));
    };
  }, [holdAtStart]);
  useEffect(() => {
    if (paused || !allowed || !visible || !loaded) return;
    const timer = setInterval(() => callback.current(), delay);
    return () => clearInterval(timer);
  }, [paused, allowed, visible, loaded, delay]);
  return {
    paused: paused || !allowed,
    pause: () => setPaused(true),
    toggle: () => setPaused((v) => !v),
  };
}
