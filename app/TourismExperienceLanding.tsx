"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  Compass,
  Headset,
  MagnifyingGlass,
  MapPin,
  ShieldCheck,
  Sparkle,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import { useRef, useState, type FormEvent } from "react";
import ResponsiveImage from "../src/components/media/ResponsiveImage";
import { useSiteLocale } from "../src/i18n/SiteLocale";
import copy from "./tourism-experience-copy.json";

type Destination = "shiraz" | "isfahan" | "persepolis" | "north" | "kish";
type Experience = "nature" | "culture" | "food" | "stay";

const destinations: { id: Destination; image: string }[] = [
  { id: "shiraz", image: "/assets/heritage/garden.webp" },
  { id: "isfahan", image: "/assets/heritage/isfahan.webp" },
  { id: "persepolis", image: "/assets/heritage/persepolis.webp" },
  { id: "north", image: "/assets/tourism/northern-iran.svg" },
  { id: "kish", image: "/assets/tourism/kish-island.svg" },
];

const experiences: { id: Experience; image: string }[] = [
  { id: "nature", image: "/assets/heritage/yazd.webp" },
  { id: "culture", image: "/assets/heritage/lotfollah.webp" },
  { id: "food", image: "/assets/heritage/tabriz.webp" },
  { id: "stay", image: "/assets/heritage/bam.webp" },
];

export default function TourismExperienceLanding() {
  const { locale } = useSiteLocale();
  const c = copy[locale];
  const Arrow = locale === "en" ? ArrowRight : ArrowLeft;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLFormElement>(null);
  const keyRef = useRef("");
  const [destination, setDestination] = useState<Destination | "">("");
  const [date, setDate] = useState("");
  const [travelers, setTravelers] = useState(2);
  const [experience, setExperience] = useState<Experience | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [copied, setCopied] = useState(false);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tehran" });
  const chosenDestination = destination ? c.destinations[destination].name : c.inquiry.none;
  const chosenExperience = experience ? c.experiences[experience].name : c.inquiry.none;

  function openInquiry(nextDestination?: Destination, nextExperience?: Experience) {
    if (nextDestination) setDestination(nextDestination);
    if (nextExperience) setExperience(nextExperience);
    setError("");
    setCopied(false);
    setTrackingCode("");
    keyRef.current = "";
    dialogRef.current?.showModal();
  }

  function closeInquiry() {
    if (!busy) dialogRef.current?.close();
  }

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || trackingCode) return;
    if (name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !consent) {
      setError(c.inquiry.invalid);
      return;
    }
    setBusy(true);
    setError("");
    const message = [
      `${c.inquiry.destination}: ${chosenDestination}`,
      `${c.inquiry.date}: ${date || c.inquiry.none}`,
      `${c.inquiry.travelers}: ${travelers}`,
      `${c.experiencesHeader.title}: ${chosenExperience}`,
      notes.trim(),
    ].filter(Boolean).join("\n");
    try {
      keyRef.current ||= crypto.randomUUID();
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": keyRef.current,
        },
        body: JSON.stringify({
          kind: "enquiry",
          name: name.trim(),
          email: email.trim(),
          interest: `${c.inquiry.title} · ${chosenDestination}`.slice(0, 200),
          message,
          locale,
          currency: "IRR",
          consent: true,
        }),
      });
      if (!response.ok) throw new Error(response.status === 429 ? c.inquiry.rateError : c.inquiry.error);
      const result: { trackingCode?: string } = await response.json();
      if (!result.trackingCode) throw new Error(c.inquiry.error);
      setTrackingCode(result.trackingCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : c.inquiry.error);
    } finally {
      setBusy(false);
    }
  }

  function startNewInquiry() {
    setTrackingCode("");
    setError("");
    setNotes("");
    setConsent(false);
    keyRef.current = "";
  }

  async function copyTracking() {
    try {
      await navigator.clipboard.writeText(trackingCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="tourism-immersive" dir={locale === "en" ? "ltr" : "rtl"}>
      <section className="tourism-hero" aria-labelledby="tourism-main-title">
        <div className="tourism-hero-photo" aria-hidden="true">
          <ResponsiveImage
            src="/assets/heritage/isfahan.webp"
            alt=""
            sizes="100vw"
            fetchPriority="high"
            loading="eager"
            quality={68}
          />
        </div>
        <div className="tourism-hero-arch" aria-hidden="true">
          <ResponsiveImage src="/assets/heritage/lotfollah.webp" alt="" sizes="(max-width:1100px) 32vw, 28vw" loading="lazy" quality={63} />
        </div>
        <div className="tourism-hero-content">
          <p className="tourism-kicker">{c.hero.eyebrow}</p>
          <h1 id="tourism-main-title">
            <span>{c.hero.first}</span> {c.hero.last}
          </h1>
          <p className="tourism-hero-lead">{c.hero.description}</p>

          <form ref={searchRef} className="tourism-search" onSubmit={event => { event.preventDefault(); openInquiry(); }} aria-label={c.inquiry.title}>
            <label className="tourism-search-field tourism-search-destination">
              <MapPin aria-hidden="true" size={25} />
              <span>
                <strong>{c.hero.destination}</strong>
                <select value={destination} onChange={event => { setDestination(event.target.value as Destination | ""); setExperience(""); }} aria-label={c.hero.destination}>
                  <option value="">{c.hero.destinationPlaceholder}</option>
                  {destinations.map(item => <option key={item.id} value={item.id}>{c.destinations[item.id].name}</option>)}
                </select>
              </span>
            </label>
            <label className="tourism-search-field tourism-search-date">
              <CalendarBlank aria-hidden="true" size={24} />
              <span>
                <strong>{c.hero.date}</strong>
                <input type="date" value={date} min={today} onChange={event => setDate(event.target.value)} aria-label={c.hero.date} />
              </span>
            </label>
            <label className="tourism-search-field tourism-search-travelers">
              <UsersThree aria-hidden="true" size={26} />
              <span>
                <strong>{c.hero.travelers}</strong>
                <select value={travelers} onChange={event => setTravelers(Number(event.target.value))} aria-label={c.hero.travelers}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(number => <option key={number} value={number}>{number} {c.hero.passenger}</option>)}
                </select>
              </span>
            </label>
            <button className="tourism-search-submit" type="submit">
              <MagnifyingGlass size={22} aria-hidden="true" />
              {c.hero.request}
            </button>
          </form>
          <div className="tourism-search-subline">
            <span>{c.hero.disclaimer}</span>
            <a href="/shop?vertical=tourism">{c.hero.offers} <Arrow size={14} aria-hidden="true" /></a>
          </div>
        </div>

        <div className="tourism-features" aria-label={c.hero.description}>
          {[ShieldCheck, Sparkle, Compass, Headset].map((Icon, i) => (
            <div className="tourism-feature" key={c.highlights[i].title}>
              <Icon size={28} aria-hidden="true" weight="light" />
              <strong>{c.highlights[i].title}</strong>
              <span>{c.highlights[i].text}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="tourism-content">
        <section className="tourism-feature-section" id="tourism-destinations" aria-labelledby="tourism-destinations-title">
          <div className="tourism-section-heading">
            <h2 id="tourism-destinations-title">{c.destinationsHeader.title}</h2>
            <a href="/shop?vertical=tourism">{c.destinationsHeader.all} <Arrow size={17} aria-hidden="true" /></a>
          </div>
          <div className="tourism-destination-grid">
            {destinations.map(item => (
              <article className="tourism-destination-card" key={item.id}>
                <ResponsiveImage src={item.image} alt="" loading="lazy" sizes="(max-width:640px) 78vw, (max-width:1080px) 45vw, 20vw" quality={66} />
                <div className="tourism-destination-info">
                  <h3>{c.destinations[item.id].name}</h3>
                  <p>{c.destinations[item.id].description}</p>
                </div>
                <button
                  type="button"
                  aria-label={`${c.destinationsHeader.select}: ${c.destinations[item.id].name}`}
                  onClick={() => openInquiry(item.id)}
                >
                  <Arrow aria-hidden="true" size={18} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="tourism-feature-section" id="tourism-experiences" aria-labelledby="tourism-experiences-title">
          <div className="tourism-section-heading">
            <h2 id="tourism-experiences-title">{c.experiencesHeader.title}</h2>
            <a href="/shop?vertical=tourism">{c.experiencesHeader.all} <Arrow size={17} aria-hidden="true" /></a>
          </div>
          <div className="tourism-experience-grid">
            {experiences.map(item => (
              <article className="tourism-experience-card" key={item.id}>
                <ResponsiveImage src={item.image} alt="" loading="lazy" sizes="(max-width:640px) 70vw, (max-width:1050px) 44vw, 23vw" quality={66} />
                <div className="tourism-experience-info">
                  <h3>{c.experiences[item.id].name}</h3>
                  <p>{c.experiences[item.id].description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openInquiry(undefined, item.id)}
                  aria-label={`${c.experiencesHeader.explore}: ${c.experiences[item.id].name}`}
                >
                  <Arrow size={18} aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="tourism-invitation" aria-labelledby="tourism-invitation-title">
          <div>
            <p className="tourism-kicker">{c.hero.eyebrow}</p>
            <h2 id="tourism-invitation-title">{c.bottom.title}</h2>
            <p>{c.bottom.description}</p>
          </div>
          <div className="tourism-invitation-actions">
            <button type="button" onClick={() => openInquiry()}>{c.bottom.start} <Arrow size={20} aria-hidden="true" /></button>
            <a href="/shop?vertical=tourism">{c.bottom.catalog}</a>
          </div>
        </section>
      </div>

      <dialog className="tourism-dialog" ref={dialogRef} aria-labelledby="tourism-inquiry-title" onClose={() => setError("")}>
        <div className="tourism-dialog-top">
          <h2 id="tourism-inquiry-title">{trackingCode ? c.inquiry.successTitle : c.inquiry.title}</h2>
          <button type="button" aria-label={c.inquiry.close} onClick={closeInquiry} disabled={busy}><X size={23} aria-hidden="true" /></button>
        </div>
        {trackingCode ? (
          <div className="tourism-dialog-success" role="status">
            <CheckCircle size={40} weight="duotone" aria-hidden="true" />
            <p>{c.inquiry.successText}</p>
            <label>{c.inquiry.tracking}
              <output dir="ltr" className="tourism-tracking-code">{trackingCode}</output>
            </label>
            <div className="tourism-dialog-actions">
              <button type="button" onClick={copyTracking}>{copied ? c.inquiry.copied : c.inquiry.copy}</button>
              <a href="/support">{c.inquiry.support}</a>
              <button type="button" onClick={startNewInquiry}>{c.inquiry.restart}</button>
            </div>
          </div>
        ) : (
          <form className="tourism-inquiry-form" onSubmit={submitInquiry}>
            <p>{c.inquiry.description}</p>
            <dl className="tourism-inquiry-summary">
              <div><dt>{c.inquiry.destination}</dt><dd>{chosenDestination}</dd></div>
              <div><dt>{c.inquiry.date}</dt><dd>{date || c.inquiry.none}</dd></div>
              <div><dt>{c.inquiry.travelers}</dt><dd>{travelers}</dd></div>
            </dl>
            <label>{c.inquiry.name}
              <input autoComplete="name" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={100} required />
            </label>
            <label>{c.inquiry.email}
              <input type="email" autoComplete="email" inputMode="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required />
            </label>
            <label>{c.inquiry.notes}
              <textarea value={notes} onChange={event => setNotes(event.target.value)} maxLength={1500} rows={3} placeholder={c.inquiry.notesPlaceholder} />
            </label>
            <label className="tourism-consent">
              <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required />
              <span>{c.inquiry.consent}</span>
            </label>
            {error && <p role="alert" className="tourism-inquiry-error">{error}</p>}
            <div className="tourism-dialog-actions">
              <button type="submit" disabled={busy || !consent}>{busy ? c.inquiry.sending : c.inquiry.submit}</button>
              <button type="button" onClick={closeInquiry} disabled={busy}>{c.inquiry.close}</button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
