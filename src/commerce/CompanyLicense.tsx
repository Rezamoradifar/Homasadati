"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowsIn,
  DownloadSimple,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  X,
} from "@phosphor-icons/react";
import ResponsiveImage from "../components/media/ResponsiveImage";
import { useSiteLocale } from "../i18n/SiteLocale";
import copy from "./company-license-copy.json";
import "./company-license.css";

type Props = {
  file: string;
  title: string;
  width: number;
  height: number;
  children: ReactNode;
};

function outsideDialog(dialog: HTMLDialogElement, x: number, y: number) {
  const bounds = dialog.getBoundingClientRect();
  return (
    x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom
  );
}

export default function CompanyLicense({
  file,
  title,
  width,
  height,
  children,
}: Props) {
  const { locale } = useSiteLocale();
  const text = copy[locale];
  const src = `/assets/licenses/${file}.jpg`;
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const session = useRef<{ overflow: string; trigger: HTMLElement } | null>(
    null,
  );
  const backdropPressed = useRef(false);
  const center = useRef<{ x: number; y: number } | null>(null);
  const pan = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(width);

  const release = useCallback((restoreFocus = true) => {
    const active = session.current;
    if (!active) return;
    session.current = null;
    backdropPressed.current = false;
    pan.current = null;
    center.current = null;
    document.body.style.overflow = active.overflow;
    if (restoreFocus && active.trigger.isConnected)
      active.trigger.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const element = dialog.current;
    return () => {
      if (element?.open) element.close();
      release(false);
    };
  }, [release]);

  useLayoutEffect(() => {
    const area = viewport.current;
    if (!open || !area) return;
    const fit = () =>
      setFitWidth(
        Math.max(
          1,
          Math.min(
            width,
            area.clientWidth - 32,
            ((area.clientHeight - 32) * width) / height,
          ),
        ),
      );
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [open, width, height]);

  useLayoutEffect(() => {
    const area = viewport.current;
    const photo = image.current;
    if (!open || !area || !photo) return;
    if (zoom === 1) {
      area.scrollLeft = 0;
      area.scrollTop = 0;
    } else if (center.current) {
      const bounds = area.getBoundingClientRect();
      const picture = photo.getBoundingClientRect();
      area.scrollLeft +=
        picture.left +
        picture.width * center.current.x -
        bounds.left -
        area.clientLeft -
        area.clientWidth / 2;
      area.scrollTop +=
        picture.top +
        picture.height * center.current.y -
        bounds.top -
        area.clientTop -
        area.clientHeight / 2;
    }
    center.current = null;
  }, [open, zoom, fitWidth]);

  function show(trigger: HTMLElement) {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    session.current = { overflow: document.body.style.overflow, trigger };
    document.body.style.overflow = "hidden";
    setZoom(1);
    setOpen(true);
    closeButton.current?.focus({ preventScroll: true });
  }

  function close() {
    if (dialog.current?.open) dialog.current.close();
    release();
    setOpen(false);
  }

  function changeZoom(value: number) {
    const area = viewport.current;
    const photo = image.current;
    if (area && photo) {
      const bounds = area.getBoundingClientRect();
      const picture = photo.getBoundingClientRect();
      center.current = {
        x:
          (bounds.left +
            area.clientLeft +
            area.clientWidth / 2 -
            picture.left) /
          picture.width,
        y:
          (bounds.top + area.clientTop + area.clientHeight / 2 - picture.top) /
          picture.height,
      };
    }
    setZoom(Math.min(4, Math.max(1, value)));
  }

  return (
    <article className="license-card company-license-card">
      <button
        type="button"
        className="license-preview company-license-preview"
        aria-label={`${text.enlarge}: ${title}`}
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={(event) => show(event.currentTarget)}
      >
        <ResponsiveImage
          src={src}
          alt={title}
          sizes="(max-width: 700px) 90vw, 44vw"
          quality={95}
        />
      </button>
      <div className="license-copy">
        {children}
        <div className="company-license-actions">
          <button
            type="button"
            className="company-license-action"
            aria-haspopup="dialog"
            aria-controls={id}
            onClick={(event) => show(event.currentTarget)}
          >
            <MagnifyingGlassPlus size={20} aria-hidden="true" />
            {text.enlarge}
          </button>
          <a
            className="company-license-action"
            href={src}
            download={`${file}.jpg`}
          >
            <DownloadSimple size={20} aria-hidden="true" />
            {text.download}
          </a>
        </div>
      </div>
      <dialog
        ref={dialog}
        id={id}
        className="company-license-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
        dir={locale === "en" ? "ltr" : "rtl"}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={(event) => {
          // Ignore a queued close event if the viewer has already reopened.
          if (event.currentTarget.open) return;
          release();
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
          )
            close();
          backdropPressed.current = false;
        }}
      >
        <header className="company-license-dialog-header">
          <h2 id={`${id}-title`} className="company-license-title">
            {title}
          </h2>
          <button
            ref={closeButton}
            type="button"
            className="company-license-action"
            onClick={close}
          >
            <X size={20} aria-hidden="true" />
            {text.close}
          </button>
        </header>
        <div className="company-license-toolbar">
          <div
            className="company-license-zoom"
            role="group"
            aria-label={text.zoom}
          >
            <button
              type="button"
              className="company-license-action"
              aria-label={text.zoomOut}
              title={text.zoomOut}
              disabled={zoom <= 1}
              onClick={() => changeZoom(zoom - 0.5)}
            >
              <MagnifyingGlassMinus size={22} aria-hidden="true" />
            </button>
            <output
              className="company-license-scale"
              aria-live="polite"
              aria-label={text.zoom}
            >
              {new Intl.NumberFormat(locale, {
                style: "percent",
                maximumFractionDigits: 0,
              }).format(zoom)}
            </output>
            <button
              type="button"
              className="company-license-action"
              aria-label={text.zoomIn}
              title={text.zoomIn}
              disabled={zoom >= 4}
              onClick={() => changeZoom(zoom + 0.5)}
            >
              <MagnifyingGlassPlus size={22} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="company-license-action"
              onClick={() => changeZoom(1)}
            >
              <ArrowsIn size={20} aria-hidden="true" />
              {text.fit}
            </button>
          </div>
          <a
            className="company-license-action"
            href={src}
            download={`${file}.jpg`}
          >
            <DownloadSimple size={20} aria-hidden="true" />
            {text.download}
          </a>
        </div>
        <div
          ref={viewport}
          className="company-license-viewport"
          role="region"
          aria-label={`${text.imageRegion}: ${title}`}
          tabIndex={0}
          data-zoomed={zoom > 1}
          onPointerDown={(event) => {
            if (
              event.pointerType !== "mouse" ||
              event.button !== 0 ||
              zoom <= 1
            )
              return;
            const area = event.currentTarget;
            pan.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
              left: area.scrollLeft,
              top: area.scrollTop,
            };
            area.setPointerCapture(event.pointerId);
            area.focus({ preventScroll: true });
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            const start = pan.current;
            if (!start || start.id !== event.pointerId) return;
            event.currentTarget.scrollLeft =
              start.left + start.x - event.clientX;
            event.currentTarget.scrollTop = start.top + start.y - event.clientY;
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            pan.current = null;
          }}
          onPointerCancel={() => {
            pan.current = null;
          }}
          onLostPointerCapture={() => {
            pan.current = null;
          }}
        >
          <div className="company-license-canvas">
            {open && (
              <img
                ref={image}
                className="company-license-image"
                src={src}
                alt={title}
                width={width}
                height={height}
                style={{
                  width: fitWidth * zoom,
                  height: (fitWidth * zoom * height) / width,
                }}
                draggable={false}
              />
            )}
          </div>
        </div>
        <p id={`${id}-hint`} className="company-license-hint">
          {text.hint}
        </p>
      </dialog>
    </article>
  );
}
