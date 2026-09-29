"use client";
import { useEffect, useRef, useState } from "react";

/** The eNamad trust seal. The live image is served by eNamad itself (as its
 * rules require) and links to the verification page. If that image cannot
 * load — eNamad's server is unreachable, e.g. behind a VPN — a local copy of
 * the eNamad logo is shown instead, with the same verification link. */
export default function EnamadSeal({ id, code, className }: { id: string; code: string; className?: string }) {
  const [fallback, setFallback] = useState(false);
  const live = useRef<HTMLImageElement>(null);
  // The image may fail before the page's script runs, when onError is missed.
  useEffect(() => {
    const img = live.current;
    if (img?.complete && img.naturalWidth < 20) setFallback(true);
  }, []);
  const query = `id=${encodeURIComponent(id)}&Code=${encodeURIComponent(code)}`;
  return (
    <a
      className={"enamad-seal " + (className || "")}
      href={`https://trustseal.enamad.ir/?${query}`}
      target="_blank"
      rel="noopener"
      referrerPolicy="origin"
      aria-label="نماد اعتماد الکترونیکی؛ استعلام در سایت اینماد"
    >
      {fallback ? (
        <img className="enamad-seal-logo" src="/assets/licenses/enamad-seal.png" alt="نماد اعتماد الکترونیکی" width={167} height={58} />
      ) : (
        <img
          ref={live}
          className="enamad-seal-live"
          src={`https://trustseal.enamad.ir/logo.aspx?${query}`}
          alt="نماد اعتماد الکترونیکی"
          referrerPolicy="origin"
          width={96}
          height={104}
          style={{ cursor: "pointer" }}
          onError={() => setFallback(true)}
          onLoad={(e) => {
            // eNamad answers an inactive seal with a blank pixel.
            if (e.currentTarget.naturalWidth < 20) setFallback(true);
          }}
        />
      )}
    </a>
  );
}
