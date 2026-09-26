"use client";
import { useState } from "react";
import { Heart } from "lucide-react";
import Localized from "../i18n/Localized";
import { amount, api, date, labels } from "./client";
import { DataState, useData } from "./Widgets";

/** Heart toggle saved to the member's wishlist in the database. */
export function WishButton({ productId, initial }: { productId: string; initial: boolean }) {
  const [on, setOn] = useState(initial),
    [busy, setBusy] = useState(false);
  return (
    <Localized>
      <button
        type="button"
        className={"wish-button" + (on ? " on" : "")}
        aria-pressed={on}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            if (on) await api("wishlist/" + productId, "DELETE");
            else await api("wishlist", "POST", { productId });
            setOn(!on);
          } catch {
            /* the state stays as it was */
          } finally {
            setBusy(false);
          }
        }}
      >
        <Heart size={18} aria-hidden="true" fill={on ? "currentColor" : "none"} />
        {on ? "در علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
      </button>
    </Localized>
  );
}

export function Wishlist({ refresh, onNavigate }: { refresh: number; onNavigate: (tab: string) => void }) {
  const [version, setVersion] = useState(0);
  const s = useData("wishlist", refresh + version);
  return (
    <Localized>
      <DataState state={s}>
        {(d) =>
          d.rows.length ? (
            <div className="wishlist-grid">
              {d.rows.map((p: Record<string, any>) => {
                const image = JSON.parse(p.images || "[]")[0];
                return (
                  <article key={p.id} className="portal-card wishlist-item">
                    {image && <img src={image} alt={p.title} loading="lazy" />}
                    <small>{labels[p.vertical]}</small>
                    <h2>{p.title}</h2>
                    <strong>{amount(p.price)} تومان</strong>
                    <small>{p.stock > 0 ? "موجود" : "ناموجود"} · افزوده‌شده در {date(p.created_at)}</small>
                    <div className="auth-actions">
                      <button className="portal-button" onClick={() => onNavigate("catalog")}>
                        خرید
                      </button>
                      <button
                        className="portal-button secondary"
                        onClick={async () => {
                          await api("wishlist/" + p.id, "DELETE");
                          setVersion((n) => n + 1);
                        }}
                      >
                        حذف
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="portal-empty">
              هنوز محصولی به علاقه‌مندی‌ها اضافه نکرده‌اید. در بخش خرید، روی «افزودن به علاقه‌مندی‌ها» بزنید.
            </p>
          )
        }
      </DataState>
    </Localized>
  );
}
