"use client";
import { useEffect, useRef, useState } from "react";

/** The eNamad trust seal, emitted exactly as eNamad's official embed code
 * (link and image served by trustseal.enamad.ir, referrerpolicy="origin",
 * code attribute). The owner's eNamad logo sits behind it: it shows while
 * the live seal loads and stays if eNamad's image cannot be loaded. */
export default function EnamadSeal({ id, code, className }: { id: string; code: string; className?: string }) {
  const query = `id=${encodeURIComponent(id)}&Code=${encodeURIComponent(code)}`;
  const live = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "live" | "failed">("loading");
  useEffect(() => {
    const img = live.current;
    // The image may settle before this script runs, when its events are missed.
    if (img?.complete) setState(img.naturalWidth >= 20 ? "live" : "failed");
  }, []);
  return (
    <a
      className={`enamad-seal enamad-${state} ${className || ""}`}
      referrerPolicy="origin"
      target="_blank"
      href={`https://trustseal.enamad.ir/?${query}`}
      aria-label="نماد اعتماد الکترونیکی؛ استعلام در سایت اینماد"
    >
      <img
        ref={live}
        referrerPolicy="origin"
        src={`https://trustseal.enamad.ir/logo.aspx?${query}`}
        alt=""
        style={{ cursor: "pointer" }}
        {...{ code }}
        onLoad={(e) => setState(e.currentTarget.naturalWidth >= 20 ? "live" : "failed")}
        onError={() => setState("failed")}
      />
    </a>
  );
}
