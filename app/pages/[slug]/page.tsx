
import Localized from "../../../src/i18n/Localized";
import { notFound } from "next/navigation";
import { one } from "../../../src/platform/schema";
export const dynamic = "force-dynamic";
export default async function ContentPage({
  params: pendingParams,
}: {
  params: Promise<{ slug: string }>;
}) {
  const params = await pendingParams;
  const p = one(
    "SELECT * FROM p_content WHERE slug=? AND published=1",
    params.slug,
  );
  if (!p) notFound();
  return (
    <Localized><main
      dir="rtl"
      style={{
        fontFamily: "var(--font-fa)",
        maxWidth: 900,
        margin: "50px auto",
        padding: 25,
        lineHeight: 2,
        color: "#183f33",
      }}
    >
      <a href="/">همای سعادت</a>
      <h1 style={{ fontSize: 36, marginBlock: 30 }}>{p.title}</h1>
      {p.image && (
        <img
          src={p.image}
          alt=""
          style={{ width: "100%", maxHeight: 440, objectFit: "cover" }}
        />
      )}
      <div style={{ whiteSpace: "pre-wrap", marginBlock: 30 }}>{p.body}</div>
      <a href="/account">ورود به حساب کاربری</a>
    </main></Localized>
  );
}
