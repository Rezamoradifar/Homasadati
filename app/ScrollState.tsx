"use client";
import { useEffect } from "react";

/** Site-wide scroll effects, set up once from the root layout:
 * - `data-scrolled` on <html> once the page has moved, so the header can
 *   switch to its compact glass state (pure CSS, no re-render);
 * - a gentle fade-and-rise for top-level sections as they enter view.
 * Sections already on screen, and everything under reduced motion, are left
 * as they are, so nothing flashes or shifts. */
export default function ScrollState() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      root.toggleAttribute("data-scrolled", window.scrollY > 24);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });

    let observer: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            (e.target as HTMLElement).dataset.reveal = "in";
            observer!.unobserve(e.target);
          }),
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
      );
      document.querySelectorAll<HTMLElement>("main > section:not(.hero), main > .content-section").forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) return;
        el.dataset.reveal = "";
        observer!.observe(el);
      });
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);
  return null;
}
