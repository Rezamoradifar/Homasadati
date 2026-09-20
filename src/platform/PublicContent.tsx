"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useData } from "./Widgets";
export default function PublicContent() {
  const t = useTranslations("Editorial");
  const [version, setVersion] = useState(0);
  const state = useData("content", version);
  if (state.loading) return null;
  if (state.error)
    return (
      <aside className="cms-public" role="status">
        <p>{t("cmsError")}</p>
        <button onClick={() => setVersion((n) => n + 1)}>
          {t("cmsRetry")}
        </button>
      </aside>
    );
  const rows = state.data?.rows || [];
  if (!rows.length) return null;
  return (
    <section
      className="cms-public editorial-section"
      aria-label={t("cmsTitle")}
    >
      {rows
        .filter((r: any) => r.kind === "banner")
        .map((r: any) => (
          <article key={r.id}>
            {r.image && <img src={r.image} alt="" />}
            <div>
              <h2>{r.title}</h2>
              <p>{r.body.slice(0, 400)}</p>
              <a href={"/pages/" + r.slug}>{t("cmsRead")}</a>
            </div>
          </article>
        ))}
      <div className="cms-public-links">
        {rows
          .filter((r: any) => r.kind !== "banner")
          .map((r: any) => (
            <a key={r.id} href={"/pages/" + r.slug}>
              {r.title}
            </a>
          ))}
      </div>
    </section>
  );
}
