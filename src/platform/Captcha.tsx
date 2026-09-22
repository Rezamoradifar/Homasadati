"use client";

import Localized from "../i18n/Localized";
import { useEffect, useRef, useState } from "react";
import { api } from "./client";
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let loading: Promise<void> | undefined;
function loadWidget() {
  if (window.turnstile) return Promise.resolve();
  if (!loading)
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        loading = undefined;
        reject(
          new Error(
            "کپچا بارگذاری نشد؛ اتصال اینترنت را بررسی و دوباره تلاش کنید.",
          ),
        );
      };
      document.head.appendChild(script);
    });
  return loading;
}
export function Captcha({
  action,
  onToken,
  onReady,
}: {
  action: string;
  onToken: (token: string) => void;
  onReady: (ready: boolean) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false,
      widget: string | undefined;
    onToken("");
    onReady(false);
    setError("");
    (async () => {
      try {
        const config = await api("auth/config?action=" + encodeURIComponent(action));
        if (disposed) return;
        if (!config.ready)
          throw new Error(
            "ثبت‌نام و ورود امن در حال آماده‌سازی است. کمی بعد دوباره مراجعه کنید.",
          );
        if (!config.required) {
          onReady(true);
          return;
        }
        await loadWidget();
        if (disposed || !container.current) return;
        widget = window.turnstile!.render(container.current, {
          sitekey: config.siteKey,
          action: action === "admin-password-login" ? "login" : action,
          theme: "auto",
          size: "flexible",
          callback: (token: string) => {
            onToken(token);
            onReady(true);
            setError("");
          },
          "expired-callback": () => {
            onToken("");
            onReady(false);
            setError("اعتبار کپچا پایان یافت؛ دوباره بررسی کنید.");
          },
          "error-callback": () => {
            onToken("");
            onReady(false);
            setError("بررسی امنیتی انجام نشد؛ دوباره تلاش کنید.");
          },
        });
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      }
    })();
    return () => {
      disposed = true;
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [action, onReady, onToken, retry]);
  return (
    <Localized><div className="auth-captcha">
      <div ref={container} />
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="portal-button secondary"
            onClick={() => setRetry((n) => n + 1)}
          >
            بررسی دوباره
          </button>
        </div>
      )}
    </div></Localized>
  );
}
export function useCaptcha(action: string) {
  const [token, setToken] = useState(""),
    [ready, setReady] = useState(false),
    [epoch, setEpoch] = useState(0);
  return {
    token,
    ready,
    reset: () => {
      setToken("");
      setReady(false);
      setEpoch((n) => n + 1);
    },
    element: (
      <Localized key={action + epoch}><Captcha
        action={action}
        onToken={setToken}
        onReady={setReady}
      /></Localized>
    ),
  };
}
