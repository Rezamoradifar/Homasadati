"use client";
import { useState } from "react";
import ResponsiveImage from "../components/media/ResponsiveImage";
import Localized from "../i18n/Localized";
export default function ProductGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [selected, setSelected] = useState(0);
  if (!images.length)
    return (
      <Localized>
        <p className="shop-empty">تصویر محصول هنوز ثبت نشده است.</p>
      </Localized>
    );
  return (
    <Localized>
      <section className="product-gallery" aria-label="تصاویر محصول">
        <div className="product-gallery-main">
          <ResponsiveImage
            src={images[selected]}
            alt={`${title} — تصویر ${selected + 1}`}
            sizes="(max-width: 700px) 90vw, 46vw"
            loading="eager"
          />
        </div>
        {images.length > 1 && (
          <div
            className="product-gallery-thumbs"
            role="group"
            aria-label="انتخاب تصویر محصول"
          >
            {images.map((src, i) => (
              <button
                key={src + i}
                type="button"
                aria-label={`تصویر ${i + 1}`}
                aria-pressed={i === selected}
                onClick={() => setSelected(i)}
              >
                <ResponsiveImage src={src} alt="" sizes="80px" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        <p className="product-gallery-count" aria-live="polite">
          {selected + 1} / {images.length}
        </p>
      </section>
    </Localized>
  );
}
