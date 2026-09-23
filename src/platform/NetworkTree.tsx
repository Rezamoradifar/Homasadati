"use client";
import { useState } from "react";
import Localized from "../i18n/Localized";
import { amount, api, date, RecordData } from "./client";
import { DataState, useData } from "./Widgets";

type Leg = { members: number; volume: number; carry: number };
type TreeNode = {
  id: string;
  name: string;
  joinedAt: string;
  active: boolean;
  personalVolume: number;
  level: number;
  sponsoredByRoot: boolean;
  left: Leg;
  right: Leg;
  children: { left: TreeNode | null; right: TreeNode | null } | null;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

function NodeCard({ n, onOpen, root }: { n: TreeNode; onOpen: (id: string) => void; root: boolean }) {
  return (
    <button
      type="button"
      dir="rtl"
      className={"tree-node" + (n.active ? " active" : "") + (root ? " root" : "")}
      onClick={() => onOpen(n.id)}
      title={root ? undefined : "نمایش درخت از این عضو"}
    >
      <span className="tree-avatar" aria-hidden="true">
        {initials(n.name)}
      </span>
      <strong>{n.name}</strong>
      <small>
        {n.active ? "فعال" : "غیرفعال"}
        {n.level ? " · کارت " + n.level.toLocaleString("fa-IR") : ""}
        {n.sponsoredByRoot && !root ? " · معرفی مستقیم" : ""}
      </small>
      <span className="tree-legs">
        <span>چپ {n.left.members.toLocaleString("fa-IR")}</span>
        <span>راست {n.right.members.toLocaleString("fa-IR")}</span>
      </span>
    </button>
  );
}

function Branch({ n, onOpen, root = false }: { n: TreeNode | null; onOpen: (id: string) => void; root?: boolean }) {
  if (!n)
    return (
      <li>
        <span className="tree-node empty">جای خالی</span>
      </li>
    );
  return (
    <li>
      <NodeCard n={n} onOpen={onOpen} root={root} />
      {n.children && (n.children.left || n.children.right) && (
        <ul>
          <Branch n={n.children.left} onOpen={onOpen} />
          <Branch n={n.children.right} onOpen={onOpen} />
        </ul>
      )}
    </li>
  );
}

function LegSummary({ label, leg }: { label: string; leg: Leg }) {
  return (
    <div className="tree-leg-summary">
      <h3>{label}</h3>
      <dl>
        <div>
          <dt>تعداد اعضا</dt>
          <dd>{leg.members.toLocaleString("fa-IR")}</dd>
        </div>
        <div>
          <dt>حجم خرید کل</dt>
          <dd>{amount(leg.volume)}</dd>
        </div>
        <div>
          <dt>حجم باقی‌مانده برای تعادل</dt>
          <dd>{amount(leg.carry)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Binary placement tree with left/right member counts and purchase volume,
 * re-rooted by clicking a member. Everything is read live from the API. */
export function NetworkTree({ user, refresh, admin = false }: { user: RecordData; refresh: number; admin?: boolean }) {
  const [root, setRoot] = useState<string>(user.id),
    [depth, setDepth] = useState(3),
    [query, setQuery] = useState(""),
    [matches, setMatches] = useState<RecordData[] | null>(null),
    [searchError, setSearchError] = useState("");
  const s = useData(`${admin ? "admin/" : ""}network-tree?root=${root}&depth=${depth}`, refresh);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearchError("");
    try {
      const r = admin
        ? await api(`admin/network-tree?root=${root}&depth=1&q=${encodeURIComponent(query)}`)
        : await api("network-search?q=" + encodeURIComponent(query));
      setMatches(admin ? r.matches : r.rows);
    } catch (err) {
      setSearchError((err as Error).message);
    }
  }
  return (
    <Localized>
      <div className="portal-card network-tree">
        <div className="network-tree-head">
          <h2>درخت شبکهٔ باینری</h2>
          <div className="network-tree-tools">
            <label>
              عمق نمایش
              <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
                {[2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>
                    {d.toLocaleString("fa-IR")} سطح
                  </option>
                ))}
              </select>
            </label>
            {root !== user.id && (
              <button type="button" className="portal-button secondary" onClick={() => setRoot(user.id)}>
                {admin ? "بازگشت به ابتدا" : "بازگشت به جایگاه من"}
              </button>
            )}
          </div>
        </div>
        <form className="network-tree-search" onSubmit={search} role="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جست‌وجوی عضو با نام یا کد معرف"
            aria-label="جست‌وجوی عضو در شبکه"
            maxLength={200}
          />
          <button className="portal-button secondary" disabled={query.trim().length < 2}>
            جست‌وجو
          </button>
        </form>
        {searchError && <p role="alert">{searchError}</p>}
        {matches && (
          <ul className="network-tree-matches">
            {matches.length ? (
              matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setRoot(m.id);
                      setMatches(null);
                    }}
                  >
                    {m.name} <small dir="ltr">{m.referral_code}</small>
                  </button>
                </li>
              ))
            ) : (
              <li>عضوی با این مشخصات در زیرمجموعهٔ شما نیست.</li>
            )}
          </ul>
        )}
        <DataState state={s}>
          {(d) => (
            <>
              {d.path.length > 1 && (
                <nav className="network-tree-path" aria-label="مسیر در شبکه">
                  {d.path.map((p: RecordData, i: number) => (
                    <span key={p.id}>
                      {i > 0 && " › "}
                      {i === d.path.length - 1 ? (
                        <strong>{p.name}</strong>
                      ) : (
                        <button type="button" onClick={() => setRoot(p.id)}>
                          {p.name}
                        </button>
                      )}
                    </span>
                  ))}
                </nav>
              )}
              <div className="network-tree-summary">
                <LegSummary label="شاخهٔ چپ" leg={d.tree.left} />
                <div className="tree-root-stats">
                  <span>خرید شخصی</span>
                  <strong>{amount(d.tree.personalVolume)}</strong>
                  <small>عضویت از {date(d.tree.joinedAt)}</small>
                </div>
                <LegSummary label="شاخهٔ راست" leg={d.tree.right} />
              </div>
              <div className="network-tree-canvas" dir="ltr">
                <ul className="tree">
                  <Branch n={d.tree} onOpen={setRoot} root />
                </ul>
              </div>
              <p className="network-tree-note">
                عضو «فعال» در {Number(d.activeDays).toLocaleString("fa-IR")} روز گذشته خرید پرداخت‌شده دارد. حجم هر
                شاخه جمع خریدهای پرداخت‌شده و برگشت‌نخوردهٔ همهٔ اعضای آن شاخه است.
              </p>
            </>
          )}
        </DataState>
      </div>
    </Localized>
  );
}
