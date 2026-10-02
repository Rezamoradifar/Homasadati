"use client";
import { useEffect, useRef, useState } from "react";

/** The eNamad trust seal. eNamad requires its embed code on the site
 * unchanged (and no rel="noopener noreferrer" on the link), so the snippet
 * below is emitted character for character as eNamad issues it. The owner's
 * eNamad logo sits behind it on the wrapper: it shows while the live seal
 * loads and stays if eNamad's image cannot be reached (e.g. behind a VPN). */
const snippet = (id: string, code: string) =>
  `<a referrerpolicy='origin' target='_blank' href='https://trustseal.enamad.ir/?id=${id}&Code=${code}'>` +
  `<img referrerpolicy='origin' src='https://trustseal.enamad.ir/logo.aspx?id=${id}&Code=${code}' alt='' style='cursor:pointer' code='${code}'></a>`;

export default function EnamadSeal({ id, code, className }: { id: string; code: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<"loading" | "live" | "failed">("loading");
  useEffect(() => {
    const img = box.current?.querySelector("img");
    if (!img) return;
    const settle = () => setState(img.naturalWidth >= 20 ? "live" : "failed");
    const fail = () => setState("failed");
    if (img.complete) return settle();
    img.addEventListener("load", settle);
    img.addEventListener("error", fail);
    return () => {
      img.removeEventListener("load", settle);
      img.removeEventListener("error", fail);
    };
  }, []);
  // Only digits and letters ever reach the markup (checked by the callers too).
  if (!/^\d{3,12}$/.test(id) || !/^[A-Za-z0-9]{8,64}$/.test(code)) return null;
  return (
    <span
      ref={box}
      className={`enamad-seal enamad-${state} ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: snippet(id, code) }}
    />
  );
}
