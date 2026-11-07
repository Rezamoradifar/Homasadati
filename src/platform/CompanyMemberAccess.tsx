"use client";

import { useEffect, useRef, useState } from "react";
import { useSiteLocale } from "../i18n/SiteLocale";
import { api } from "./client";
import companyCopy from "./company-member-copy.json";
import "./company-member.css";

export type CompanyMemberContext = {
  actorId: string;
  actorName: string;
  targetId: string;
  targetName: string;
  expiresAt: string;
};

export async function endCompanyMemberAccess(userId: string | null) {
  if (userId) await api("admin/member-access", "DELETE", { userId });
  const url = new URL(window.location.href);
  url.searchParams.delete("companyMember");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export function CompanyMemberAccessButton({ userId, name }: { userId: string; name: string }) {
  const { locale } = useSiteLocale();
  const copy = companyCopy[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [ready, setReady] = useState<{ id: string; url: string } | null>(null);
  const alive = useRef(true);
  const latest = useRef(userId);
  latest.current = userId;
  const starting = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function begin() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setError(null);
    setReady(null);
    const selectedId = userId;
    let popup: Window | null = null;
    try { popup = window.open("about:blank", "_blank"); if (popup) popup.opener = null; } catch { /* The visible link below supports blocked popups. */ }
    try {
      await api("admin/member-access", "POST", { userId: selectedId });
      if (!alive.current || latest.current !== selectedId) { popup?.close(); return; }
      const url = "/account?companyMember=" + encodeURIComponent(selectedId);
      setReady({ id: selectedId, url });
      if (popup && !popup.closed) popup.location.href = url;
    } catch (failure) {
      popup?.close();
      if (alive.current && latest.current === selectedId)
        setError({ id: selectedId, text: failure instanceof Error ? failure.message : copy.error });
    } finally {
      starting.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <section className="company-member-entry" aria-label={copy.startTitle}>
    <h3>{copy.startTitle}</h3>
    <p>{copy.startDescription}</p>
    <p><bdi translate="no">{name}</bdi></p>
    <button className="portal-button company-member-button" type="button" disabled={busy} onClick={begin}>{busy ? copy.starting : copy.startButton}</button>
    {error?.id === userId && <p role="alert">{error.text}</p>}
    {ready?.id === userId && <div className="company-member-ready"><p>{copy.readyNote}</p><a href={ready.url} target="_blank" rel="noopener noreferrer">{copy.readyLink}</a></div>}
  </section>;
}

function CompanyAccessExit({ onExit }: { onExit: () => Promise<void> }) {
  const { locale } = useSiteLocale();
  const copy = companyCopy[locale];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="company-member-exit">
    <button className="portal-button company-member-button" type="button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await onExit(); } catch (failure) { setError(failure instanceof Error ? failure.message : copy.error); }
      finally { setBusy(false); }
    }}>{busy ? copy.exiting : copy.exit}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function CompanyMemberAccessBanner({ access, onExit }: { access: CompanyMemberContext; onExit: () => Promise<void> }) {
  const { locale } = useSiteLocale();
  const copy = companyCopy[locale];
  const expires = new Date(access.expiresAt);
  return <section className="company-member-banner" aria-label={copy.bannerTitle}>
    <div className="company-member-banner-heading"><strong>{copy.bannerTitle}</strong><span>{copy.memberLabel} <bdi translate="no">{access.targetName}</bdi></span></div>
    <p>{copy.actorLabel} <bdi translate="no">{access.actorName}</bdi>{Number.isFinite(expires.getTime()) && <> · {copy.expiresLabel} <time dateTime={access.expiresAt}>{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(expires)}</time></>}</p>
    <p>{copy.limitNote}</p>
    <div className="company-member-actions"><a className="portal-button" href="/admin?tab=users">{copy.backToCompany}</a><CompanyAccessExit onExit={onExit} /></div>
  </section>;
}

export function CompanyMemberAccessUnavailable({ message, onExit }: { message?: string; onExit: () => Promise<void> }) {
  const { locale } = useSiteLocale();
  const copy = companyCopy[locale];
  return <main className="portal-card company-member-unavailable">
    <h1>{copy.deniedTitle}</h1><p role="alert">{message || copy.denied}</p>
    <div className="company-member-actions"><a className="portal-button" href="/admin?tab=users">{copy.backToCompany}</a><CompanyAccessExit onExit={onExit} /></div>
  </main>;
}

export function CompanyMemberRestrictedAction() {
  const { locale } = useSiteLocale();
  const copy = companyCopy[locale];
  return <section className="portal-card company-member-restricted"><p>{copy.operationBlocked}</p><a className="portal-button" href="/admin?tab=users">{copy.managementLink}</a></section>;
}
