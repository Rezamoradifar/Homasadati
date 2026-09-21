"use client";
import { useEffect, useRef, useState } from "react";
import Localized from "../i18n/Localized";
import { useSiteLocale } from "../i18n/SiteLocale";
import { api, RecordData } from "./client";
import { useCaptcha } from "./Captcha";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: Record<string, unknown>) => void;
          renderButton: (
            el: HTMLElement,
            options: Record<string, unknown>,
          ) => void;
        };
      };
    };
  }
}
let loading: Promise<void> | undefined;
function loadGoogle() {
  if (window.google) return Promise.resolve();
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        loading = undefined;
        reject(new Error("اتصال به گوگل برقرار نشد؛ دوباره تلاش کنید."));
      };
      document.head.appendChild(script);
    });
  return loading;
}
export default function GoogleAccess({
  intent,
  onComplete,
}: {
  intent: "login" | "register" | "link";
  onComplete: (data: RecordData) => void;
}) {
  const { locale } = useSiteLocale(),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [started, setStarted] = useState(false),
    [error, setError] = useState(""),
    [ticket, setTicket] = useState<RecordData | null>(null),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [recovery, setRecovery] = useState(false);
  const host = useRef<HTMLDivElement>(null),
    alive = useRef(true),
    captcha = useCaptcha("login");
  useEffect(() => {
    alive.current = true;
    api("auth/config")
      .then((c) => {
        if (alive.current) setEnabled(!!c.googleEnabled);
      })
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);
  async function start() {
    if (busy || !captcha.ready) return;
    setBusy(true);
    setError("");
    try {
      const c = await api("auth/google-challenge", "POST", {
        intent,
        captchaToken: captcha.token,
      });
      await loadGoogle();
      if (!alive.current || !host.current) return;
      window.google!.accounts.id.initialize({
        client_id: c.clientId,
        nonce: c.nonce,
        auto_select: false,
        callback: async (response: { credential: string }) => {
          if (!alive.current) return;
          setBusy(true);
          try {
            const result = await api("auth/google", "POST", {
              intent,
              challenge: c.challenge,
              credential: response.credential,
              ...(intent === "link"
                ? {
                    password,
                    ...(recovery ? { recoveryCode: code } : { totp: code }),
                  }
                : {}),
            });
            if (!alive.current) return;
            if (intent === "login") {
              setTicket(result);
              setCode("");
            } else onComplete(result);
          } catch (e) {
            if (alive.current) {
              setError((e as Error).message);
              setStarted(false);
            }
          } finally {
            if (alive.current) {
              setBusy(false);
              captcha.reset();
            }
          }
        },
      });
      host.current.replaceChildren();
      window.google!.accounts.id.renderButton(host.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        width: Math.max(
          200,
          Math.min(240, (host.current.parentElement?.clientWidth || 264) - 24),
        ),
        locale,
        text: intent === "link" ? "continue_with" : "signin_with",
      });
      setStarted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      captcha.reset();
    }
  }
  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ticket || !captcha.ready) return;
    setBusy(true);
    setError("");
    try {
      onComplete(
        await api("auth/google-login", "POST", {
          ticket: ticket.googleTicket,
          captchaToken: captcha.token,
          ...(recovery ? { recoveryCode: code } : { totp: code }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      captcha.reset();
    }
  }
  if (!enabled) return null;
  return (
    <Localized>
      <section className="google-access" aria-label="حساب گوگل">
        <h3>{intent === "link" ? "اتصال حساب گوگل" : "ادامه با گوگل"}</h3>
        {error && <p role="alert">{error}</p>}
        {intent === "link" && !started && (
          <>
            <p>
              برای اتصال، رمز فعلی و عامل دوم حساب خود را وارد کنید. پس از اتصال
              دوباره وارد شوید.
            </p>
            <label>
              رمز عبور فعلی
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </label>
          </>
        )}
        {((intent === "link" && !started) || ticket?.twoFactor) && (
          <>
            <label>
              {recovery ? "کد بازیابی یک‌بارمصرف" : "کد برنامه رمزساز"}
              <input
                dir="ltr"
                autoComplete="one-time-code"
                value={code}
                maxLength={30}
                onChange={(e) => setCode(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={recovery}
                onChange={(e) => {
                  setRecovery(e.target.checked);
                  setCode("");
                }}
              />
              استفاده از کد بازیابی
            </label>
          </>
        )}
        {!started && !ticket && (
          <>
            {captcha.element}
            <button
              type="button"
              className="portal-button secondary"
              onClick={start}
              disabled={
                busy || !captcha.ready || (intent === "link" && !password)
              }
            >
              استفاده از حساب گوگل
            </button>
          </>
        )}
        <div ref={host} hidden={!started || !!ticket} />
        {started && !ticket && (
          <button
            type="button"
            className="portal-button secondary"
            onClick={() => {
              setStarted(false);
              host.current?.replaceChildren();
            }}
            disabled={busy}
          >
            شروع دوباره
          </button>
        )}
        {ticket && (
          <form onSubmit={finish}>
            {captcha.element}
            <button className="portal-button" disabled={busy || !captcha.ready}>
              تأیید و ورود
            </button>
            <button
              type="button"
              className="portal-button secondary"
              disabled={busy}
              onClick={() => {
                setTicket(null);
                setStarted(false);
                setCode("");
                setError("");
                host.current?.replaceChildren();
                captcha.reset();
              }}
            >
              شروع دوباره
            </button>
          </form>
        )}
      </section>
    </Localized>
  );
}
