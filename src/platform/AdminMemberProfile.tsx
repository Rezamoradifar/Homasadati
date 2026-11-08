"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useSiteLocale } from "../i18n/SiteLocale";
import { api, PlatformApiError } from "./client";
import type { AdminMemberProfileData } from "./admin-member-profile-types";
import memberCopy from "./admin-member-copy.json";
import "./admin-member.css";

type Personal = AdminMemberProfileData["personal"];
type Address = AdminMemberProfileData["addresses"][number];
type DraftAddress = Omit<Address, "id"> & { id?: string; key: string };
type Draft = { personal: Personal; addresses: DraftAddress[]; deleteIds: string[]; reason: string };
type ProfileState = { id: string; data: AdminMemberProfileData | null; draft: Draft | null; loading: boolean; error: string };
function draftFrom(data: AdminMemberProfileData): Draft {
  return {
    personal: { ...data.personal, preferences: { ...data.personal.preferences }, interests: [...data.personal.interests] },
    addresses: data.addresses.map(address => ({ ...address, key: address.id })),
    deleteIds: [], reason: "",
  };
}

export default function AdminMemberProfile({ userId, onChange }: { userId: string; onChange?: (profile: AdminMemberProfileData) => void }) {
  const { locale } = useSiteLocale();
  const copy = memberCopy[locale];
  const uid = useId();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ProfileState>({ id: userId, data: null, draft: null, loading: true, error: "" });
  const [saveState, setSaveState] = useState<{ id: string; busy: boolean; error: string; saved: boolean }>({ id: userId, busy: false, error: "", saved: false });
  const generation = useRef(0);
  const selected = useRef(userId);
  const addressSequence = useRef(0);
  const saveLock = useRef<number | null>(null);
  selected.current = userId;
  useEffect(() => {
    let current = true;
    generation.current += 1;
    setState({ id: userId, data: null, draft: null, loading: true, error: "" });
    setSaveState({ id: userId, busy: false, error: "", saved: false });
    api("admin/users/" + encodeURIComponent(userId) + "/profile").then(result => {
      if (!current) return;
      const data = result as unknown as AdminMemberProfileData;
      setState({ id: userId, data, draft: draftFrom(data), loading: false, error: "" });
    }).catch((error: unknown) => {
      if (current) setState({ id: userId, data: null, draft: null, loading: false, error: error instanceof PlatformApiError ? error.code : "generic" });
    });
    return () => { current = false; generation.current += 1; };
  }, [userId, attempt]);
  const active = state.id === userId ? state : { id: userId, data: null, draft: null, loading: true, error: "" };
  const saving = saveState.id === userId && saveState.busy;
  const saveError = saveState.id === userId ? saveState.error : "";
  const errors = copy.errors as Record<string, string>;
  function updateDraft(change: (draft: Draft) => Draft) {
    setState(previous => previous.id === userId && previous.draft ? { ...previous, draft: change(previous.draft) } : previous);
    setSaveState(previous => previous.id === userId ? { ...previous, saved: false, error: "" } : previous);
  }
  function personal<K extends keyof Personal>(key: K, value: Personal[K]) {
    updateDraft(draft => ({ ...draft, personal: { ...draft.personal, [key]: value } }));
  }
  function updateAddress(key: string, field: keyof Omit<Address, "id">, value: string) {
    updateDraft(draft => ({ ...draft, addresses: draft.addresses.map(address => address.key === key ? { ...address, [field]: value } : address) }));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active.data || !active.draft || saving || saveLock.current === generation.current) return;
    const currentGeneration = generation.current;
    const targetId = userId;
    const draft = active.draft;
    saveLock.current = currentGeneration;
    setSaveState({ id: targetId, busy: true, error: "", saved: false });
    try {
      const result = await api("admin/users/" + encodeURIComponent(targetId) + "/profile", "PATCH", {
        expectedVersion: active.data.version,
        personal: { ...draft.personal, name: [draft.personal.firstName, draft.personal.lastName].filter(Boolean).join(" ").trim() || draft.personal.name },
        addresses: { upsert: draft.addresses.map(({ key: _key, ...address }) => address), deleteIds: draft.deleteIds },
        reason: draft.reason.trim(),
      });
      if (selected.current !== targetId || generation.current !== currentGeneration) return;
      const data = result as unknown as AdminMemberProfileData;
      setState({ id: targetId, data, draft: draftFrom(data), loading: false, error: "" });
      setSaveState({ id: targetId, busy: false, error: "", saved: true });
      onChange?.(data);
    } catch (error: unknown) {
      if (selected.current === targetId && generation.current === currentGeneration) setSaveState({ id: targetId, busy: false, error: error instanceof PlatformApiError ? error.code : "generic", saved: false });
    } finally {
      if (saveLock.current === currentGeneration) saveLock.current = null;
    }
  }
  const numbers = locale === "en" ? "en-US" : locale === "ar" ? "ar" : "fa-IR";
  const date = (value: string | null) => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat(numbers, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(value)) : copy.missing;

  return <section className="admin-member-profile" dir={locale === "en" ? "ltr" : "rtl"} aria-labelledby={`${uid}-title`}>
    <header><h3 id={`${uid}-title`}>{copy.title}</h3><p>{copy.intro}</p></header>
    {active.loading && <p role="status">{copy.loading}</p>}
    {active.error && <div role="alert" className="admin-member-alert"><p>{errors[active.error] || errors.generic}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button></div>}
    {active.data && active.draft && <>
      <details className="admin-member-metadata">
        <summary>{copy.metadata}</summary>
        <dl>
          <div><dt>{copy.memberId}</dt><dd translate="no"><bdi>{active.data.id}</bdi></dd></div>
          <div><dt>{copy.role}</dt><dd>{(copy.roles as Record<string, string>)[active.data.membership.role] || active.data.membership.role}</dd></div>
          <div><dt>{copy.createdAt}</dt><dd translate="no">{date(active.data.membership.createdAt)}</dd></div>
          <div><dt>{copy.lastSeen}</dt><dd translate="no">{date(active.data.membership.lastSeen)}</dd></div>
          <div><dt>{copy.blocked}</dt><dd>{active.data.membership.blocked ? copy.yes : copy.no}</dd></div>
          <div><dt>{copy.referralCode}</dt><dd translate="no"><bdi>{active.data.membership.referralCode || copy.missing}</bdi></dd></div>
          <div><dt>{copy.contactVerifiedAt}</dt><dd translate="no">{date(active.data.membership.contactVerifiedAt)}</dd></div>
          <div><dt>{copy.detailsUpdatedAt}</dt><dd translate="no">{date(active.data.membership.detailsUpdatedAt)}</dd></div>
          <div><dt>{copy.consentVersion}</dt><dd translate="no">{active.data.membership.consent?.version || copy.missing}</dd></div>
          <div><dt>{copy.consentAcceptedAt}</dt><dd translate="no">{date(active.data.membership.consent?.acceptedAt || null)}</dd></div>
        </dl><p>{copy.metadataHint}</p>
      </details>
      <form onSubmit={save} aria-label={copy.title}>
        <fieldset disabled={saving} className="admin-member-fields">
          <legend>{copy.personal}</legend>
          <div className="admin-member-grid">
            <label>{copy.firstName}<input value={active.draft.personal.firstName} onChange={event => personal("firstName", event.target.value)} maxLength={200} autoComplete="off" /></label>
            <label>{copy.lastName}<input value={active.draft.personal.lastName} onChange={event => personal("lastName", event.target.value)} maxLength={200} autoComplete="off" /></label>
            <label>{copy.email}<input type="email" dir="ltr" value={active.draft.personal.email || ""} onChange={event => personal("email", event.target.value || null)} maxLength={254} autoComplete="off" /></label>
            <label>{copy.phone}<input type="tel" dir="ltr" value={active.draft.personal.phone || ""} onChange={event => personal("phone", event.target.value || null)} maxLength={32} autoComplete="off" /></label>
            <label>{copy.nationalId}<input inputMode="numeric" dir="ltr" value={active.draft.personal.nationalId || ""} onChange={event => personal("nationalId", event.target.value || null)} maxLength={10} autoComplete="off" /></label>
            <label>{copy.occupation}<input value={active.draft.personal.occupation} onChange={event => personal("occupation", event.target.value)} maxLength={120} autoComplete="off" /></label>
            <label>{copy.country}<input value={active.draft.personal.country} onChange={event => personal("country", event.target.value)} maxLength={200} autoComplete="off" /></label>
            <label>{copy.city}<input value={active.draft.personal.city} onChange={event => personal("city", event.target.value)} maxLength={200} autoComplete="off" /></label>
            <label>{copy.language}<select value={active.draft.personal.language} onChange={event => personal("language", event.target.value as Personal["language"])}>{Object.entries(copy.languages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <p className="admin-member-hint">{copy.contactHint}</p>
          <p className="admin-member-hint">{copy.identityHint}</p>
          <fieldset className="admin-member-options"><legend>{copy.interests}</legend>{Object.entries(copy.verticals).map(([value, label]) => <label key={value}><input type="checkbox" checked={active.draft!.personal.interests.includes(value as Personal["interests"][number])} onChange={event => personal("interests", event.target.checked ? [...active.draft!.personal.interests, value as Personal["interests"][number]] : active.draft!.personal.interests.filter(item => item !== value))} />{label}</label>)}</fieldset>
          <fieldset className="admin-member-options"><legend>{copy.preferences}</legend>{([ ["email", copy.emailNotifications], ["sms", copy.smsNotifications], ["inApp", copy.inAppNotifications] ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={active.draft!.personal.preferences[key]} onChange={event => personal("preferences", { ...active.draft!.personal.preferences, [key]: event.target.checked })} />{label}</label>)}</fieldset>
          <section className="admin-member-addresses" aria-labelledby={`${uid}-addresses`}>
            <h4 id={`${uid}-addresses`}>{copy.addresses}</h4><p className="admin-member-hint">{copy.addressHint}</p>
            {!active.draft.addresses.length && <p>{copy.noAddresses}</p>}
            {active.draft.addresses.map((address, index) => <fieldset className="admin-member-address" key={address.key}>
              <legend>{copy.address} {(index + 1).toLocaleString(numbers)}</legend>
              <div className="admin-member-grid">
                {([ ["label", copy.addressLabel, 200], ["country", copy.country, 200], ["city", copy.city, 200], ["postalCode", copy.postalCode, 30] ] as const).map(([key, label, max]) => <label key={key}>{label}<input required value={address[key]} onChange={event => updateAddress(address.key, key, event.target.value)} minLength={key === "postalCode" ? 3 : 1} maxLength={max} dir={key === "postalCode" ? "ltr" : undefined} autoComplete="off" /></label>)}
                <label className="admin-member-full">{copy.fullAddress}<textarea required value={address.address} onChange={event => updateAddress(address.key, "address", event.target.value)} minLength={5} maxLength={1000} rows={3} /></label>
              </div>
              <button type="button" className="admin-member-remove" aria-label={`${copy.removeAddress} ${(index + 1).toLocaleString(numbers)}`} onClick={() => updateDraft(draft => ({ ...draft, addresses: draft.addresses.filter(item => item.key !== address.key), deleteIds: address.id ? [...draft.deleteIds, address.id] : draft.deleteIds }))}>{copy.removeAddress}</button>
            </fieldset>)}
            <button type="button" onClick={() => { const key = `new-${++addressSequence.current}`; updateDraft(draft => ({ ...draft, addresses: [...draft.addresses, { key, label: "", country: "", city: "", postalCode: "", address: "" }] })); }}>{copy.addAddress}</button>
          </section>
          <label className="admin-member-reason">{copy.reason}<textarea required minLength={1} maxLength={200} rows={3} value={active.draft.reason} onChange={event => updateDraft(draft => ({ ...draft, reason: event.target.value }))} aria-describedby={`${uid}-reason-hint`} /></label>
          <p id={`${uid}-reason-hint`} className="admin-member-hint">{copy.reasonHint}</p>
          {saveError && <div role="alert" className="admin-member-alert"><p>{errors[saveError] || errors.generic}</p>{saveError === "profile_changed" && <button type="button" onClick={() => setAttempt(value => value + 1)}>{copy.retry}</button>}</div>}
          {saveState.id === userId && saveState.saved && <p role="status" className="admin-member-success">{copy.saved}</p>}
          <button type="submit" className="admin-member-save" disabled={saving}>{saving ? copy.saving : copy.save}</button>
        </fieldset>
      </form>
    </>}
  </section>;
}
