"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
export function useAutoGallery(
  target: RefObject<HTMLElement>,
  advance: () => void,
  delay = 6500,
) {
  const [paused, setPaused] = useState(false),
    [allowed, setAllowed] = useState(false),
    [visible, setVisible] = useState(false);
  const callback = useRef(advance);
  callback.current = advance;
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setAllowed(!media.matches && !document.hidden);
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
  useEffect(() => {
    if (paused || !allowed || !visible) return;
    const timer = setInterval(() => callback.current(), delay);
    return () => clearInterval(timer);
  }, [paused, allowed, visible, delay]);
  return {
    paused: paused || !allowed,
    pause: () => setPaused(true),
    toggle: () => setPaused((v) => !v),
  };
}
