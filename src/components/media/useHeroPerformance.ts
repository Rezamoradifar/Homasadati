"use client";

import { useEffect, useRef, type PointerEvent } from "react";

/**
 * Homepage hero budget:
 * - stop GPU/CSS animation outside the viewport and in hidden tabs
 * - honor reduced motion and Save-Data
 * - coalesce pointer-driven 3D transforms to one update per animation frame
 * - never attach a scroll or mousemove listener to the entire document
 */
export function useHeroPerformance() {
  const heroRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<[string, string] | null>(null);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    let inView = true;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const dataSaver = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

    const refresh = () => {
      const active = inView && !document.hidden && !motion?.matches && !dataSaver;
      hero.dataset.homaMotion = active ? "running" : "paused";
      if (!active) {
        if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        pendingRef.current = null;
        hero.style.removeProperty("--homa-tilt-x");
        hero.style.removeProperty("--homa-tilt-y");
      }
    };

    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
          inView = Boolean(entry?.isIntersecting);
          refresh();
        }, { threshold: 0.01 })
      : null;
    observer?.observe(hero);
    document.addEventListener("visibilitychange", refresh);
    motion?.addEventListener?.("change", refresh);
    refresh();

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", refresh);
      motion?.removeEventListener?.("change", refresh);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      pendingRef.current = null;
    };
  }, []);

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "mouse") return;
    const hero = heroRef.current;
    if (!hero || hero.dataset.homaMotion !== "running") return;

    const bounds = hero.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = ((.5 - (event.clientY - bounds.top) / bounds.height) * 7).toFixed(2) + "deg";
    const y = (((event.clientX - bounds.left) / bounds.width - .5) * 8).toFixed(2) + "deg";
    pendingRef.current = [x, y];

    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pair = pendingRef.current;
      const node = heroRef.current;
      pendingRef.current = null;
      if (node && pair && node.dataset.homaMotion === "running") {
        node.style.setProperty("--homa-tilt-x", pair[0]);
        node.style.setProperty("--homa-tilt-y", pair[1]);
      }
    });
  };

  const onPointerLeave = () => {
    const hero = heroRef.current;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingRef.current = null;
    hero?.style.removeProperty("--homa-tilt-x");
    hero?.style.removeProperty("--homa-tilt-y");
  };

  return { heroRef, onPointerMove, onPointerLeave };
}
