"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  List,
  ShoppingBag,
  User,
  X,
} from "@phosphor-icons/react";
import Localized from "../i18n/Localized";
import { LanguagePicker, useSiteLocale } from "../i18n/SiteLocale";
import { useSiteSettings } from "../platform/SiteSettings";
import { menuName } from "./brands";
import ThemeToggle from "./ThemeToggle";

const services = [
  ["tourism", "گردشگری"],
  ["craft", "صنایع‌دستی"],
  ["beauty", "زیبایی"],
  ["ai", "هوش مصنوعی"],
] as const;

type SiteHeaderProps = {
  home?: boolean;
  onTrackRequest?: () => void;
};

/** Shared navigation uses the native dialog's focus trap and inert backdrop. */
export default function SiteHeader({
  home = false,
  onTrackRequest,
}: SiteHeaderProps) {
  const { locale } = useSiteLocale();
  const settings = useSiteSettings();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const menuSession = useRef<{ previousOverflow: string } | null>(null);
  const backdropPressed = useRef(false);
  const menuId = useId();
  const titleId = useId();
  const Arrow = locale === "en" ? ArrowRight : ArrowLeft;

  const releaseMenu = useCallback((restoreFocus = true) => {
    const session = menuSession.current;
    if (!session) return;
    menuSession.current = null;
    backdropPressed.current = false;
    document.body.style.overflow = session.previousOverflow;
    if (restoreFocus && trigger.current?.isConnected) {
      trigger.current.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    const element = dialog.current;
    return () => {
      if (element?.open) element.close();
      releaseMenu(false);
    };
  }, [releaseMenu]);

  function openMenu() {
    const element = dialog.current;
    if (!element || element.open) return;
    menuSession.current = { previousOverflow: document.body.style.overflow };
    element.showModal();
    document.body.style.overflow = "hidden";
    setOpen(true);
    closeButton.current?.focus({ preventScroll: true });
  }

  function closeMenu() {
    if (dialog.current?.open) dialog.current.close();
    // Complete cleanup now, before a link or tracking action opens another view.
    releaseMenu();
    setOpen(false);
  }

  function outsideDialog(element: HTMLDialogElement, x: number, y: number) {
    const bounds = element.getBoundingClientRect();
    return (
      x < bounds.left ||
      x > bounds.right ||
      y < bounds.top ||
      y > bounds.bottom
    );
  }

  return (
    <Localized>
      <header className="discovery-header">
        <div className="discovery-header-inner">
          <a
            className="discovery-brand"
            href="/"
            aria-label="بازگشت به صفحه اصلی"
          >
            <span>
              <strong translate={settings.site_name ? "no" : undefined}>
                {settings.site_name || (locale === "en" ? "Homanet" : "هما نت")}
              </strong>
              <small>باشگاه مشتریان</small>
            </span>
            <img
              src={settings.site_logo || "/assets/brand-mark.png"}
              width={48}
              height={48}
              alt=""
            />
          </a>
          <nav className="discovery-desktop-nav" aria-label="منوی اصلی">
            <a href={home ? "#worlds" : "/#worlds"}>خدمات هما</a>
            <a href="/shop">فروشگاه</a>
            <a href="/club">باشگاه مشتریان</a>
            <a href="/about">درباره ما</a>
          </nav>
          <div className="discovery-header-actions">
            <div className="discovery-desktop-preferences">
              <LanguagePicker />
              <ThemeToggle />
            </div>
            <a
              className="discovery-icon discovery-cart"
              href="/cart"
              aria-label="سبد خرید"
            >
              <ShoppingBag size={25} weight="light" aria-hidden="true" />
            </a>
            <a
              className="discovery-icon"
              href="/account"
              aria-label="حساب کاربری"
            >
              <User size={26} weight="light" aria-hidden="true" />
            </a>
            <button
              ref={trigger}
              type="button"
              className="discovery-icon discovery-menu-trigger"
              aria-label="باز کردن منو"
              aria-expanded={open}
              aria-controls={menuId}
              aria-haspopup="dialog"
              onClick={openMenu}
            >
              <List size={29} weight="regular" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      <dialog
        ref={dialog}
        id={menuId}
        className="discovery-menu"
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          closeMenu();
        }}
        onClose={(event) => {
          // A queued close event must not affect a freshly reopened menu.
          if (event.currentTarget.open) return;
          releaseMenu();
          setOpen(false);
        }}
        onPointerDown={(event) => {
          backdropPressed.current =
            event.target === event.currentTarget &&
            outsideDialog(event.currentTarget, event.clientX, event.clientY);
        }}
        onClick={(event) => {
          if (
            backdropPressed.current &&
            event.target === event.currentTarget &&
            outsideDialog(event.currentTarget, event.clientX, event.clientY)
          ) {
            closeMenu();
          }
          backdropPressed.current = false;
        }}
      >
        <div className="discovery-menu-panel">
          <div className="discovery-menu-heading">
            <h2 id={titleId}>دنیای هما</h2>
            <button
              ref={closeButton}
              type="button"
              className="discovery-icon"
              aria-label="بستن منو"
              onClick={closeMenu}
            >
              <X size={26} aria-hidden="true" />
            </button>
          </div>
          <nav
            aria-label="خدمات و صفحات سایت"
            onClick={(event) => {
              if ((event.target as Element).closest("a[href]")) closeMenu();
            }}
          >
            <div className="discovery-menu-services">
              {services.map(([sector, title]) => (
                <Localized key={sector}>
                  <a href={`/worlds/${sector}`}>
                    <span className="discovery-menu-service-copy">
                      <strong>{title}</strong>
                      <small>{menuName(sector)}</small>
                    </span>
                    <Arrow size={20} aria-hidden="true" />
                  </a>
                </Localized>
              ))}
            </div>
            <a className="discovery-menu-shop" href="/shop">
              مشاهده فروشگاه
              <ShoppingBag size={22} aria-hidden="true" />
            </a>
            <div className="discovery-menu-links">
              <a href="/account">حساب کاربری</a>
              <a href="/cart">سبد خرید</a>
              <a href="/club">باشگاه مشتریان</a>
              <a href="/club/ranks">هشت رتبه باشگاه</a>
              <a href="/income-plan">طرح درآمد</a>
              <a href="/worlds/leather">چرم ایران</a>
              <a href="/heritage">روایت ایران و نمادها</a>
              <a href="/merchants">پذیرندگان</a>
              <a href="/about">درباره ما</a>
              <a href="/contact">ارتباط با ما</a>
              <a href="/support">پشتیبانی و تیکت</a>
              <a href="/help">راهنمای خرید</a>
              <a href="/account?tab=orders">پیگیری سفارش‌ها</a>
              <a href="/#partnership">همکاری با ما</a>
              {onTrackRequest && (
                <button
                  type="button"
                  className="discovery-menu-tracking"
                  onClick={() => {
                    closeMenu();
                    onTrackRequest();
                  }}
                >
                  پیگیری درخواست
                </button>
              )}
            </div>
          </nav>
          <div className="discovery-menu-preferences">
            <LanguagePicker />
            <ThemeToggle />
          </div>
        </div>
      </dialog>
    </Localized>
  );
}
