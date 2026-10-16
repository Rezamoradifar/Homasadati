"use client";
import Registration from "./Registration";

/** Preserve the existing registration flow and its post-login full reload. */
export default function RegistrationEntry() {
  const toAccount = () => window.location.assign("/account");
  return <Registration onBack={toAccount} onLogin={toAccount} />;
}
