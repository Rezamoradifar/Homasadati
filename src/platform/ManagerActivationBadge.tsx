"use client";

/** Text accompanies colour so activation provenance is never colour-only. */
export function ManagerActivationBadge({active}:{active?:boolean}) {
  return active ? <span className="manager-activation-badge"><span aria-hidden="true" className="manager-activation-dot"/>فعال‌شده توسط مدیر</span> : null;
}
