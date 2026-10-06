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
  weeklyPersonalVolume: number;
  weeklySales: number;
  totalSales: number;
  savings: {left:number;right:number};
  level: number;
  sponsoredByRoot: boolean;
  left: Leg;
  right: Leg;
  children: { left: TreeNode | null; right: TreeNode | null } | null;
};

export function PersonalPositions({data,onOpen}:{data:RecordData;onOpen:(id:string)=>void}) {
  const flat=(n:RecordData):RecordData[]=>[n,...(n.left?flat(n.left):[]),...(n.right?flat(n.right):[])];
  const nodes=flat(data.tree);
  return <section className="personal-positions" dir="ltr" data-position-version="aa-2026-10-06">
    <div className="personal-position-summary" dir="rtl"><strong>جایگاه‌های من</strong><span>{data.desks.toLocaleString("fa-IR")} / ۷</span><small>ظرفیت معرفی مستقیم: {data.directCapacity.toLocaleString("fa-IR")}</small></div>
    {[ [1], [2,3], [4,5,6,7] ].map((row,i)=><div key={i}>{i>0 && <svg className="personal-connectors" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true"><path d={i===1?"M200 0 L100 20 M200 0 L300 20":"M100 0 L50 20 M100 0 L150 20 M300 0 L250 20 M300 0 L350 20"}/></svg>}<div className={"personal-position-row row-"+i}>{row.map(desk=>{const n=nodes.find(n=>n.desk===desk)!;return <div key={desk} className={"personal-position "+(n.active?"lit":"dark")} dir="rtl" aria-label={"جایگاه "+desk+" "+(n.active?"فعال":"خاموش")}><strong>{desk.toLocaleString("fa-IR")}</strong><small>{n.active?"فعال":"خاموش"}</small><details><summary>حجم و سیوینگ</summary><span>فروش هفته: {amount(n.weeklySales || 0)}</span><span>مجموع فروش: {amount(n.totalSales || 0)}</span><span>چپ: {amount(n.leftVolume)}</span><span>راست: {amount(n.rightVolume)}</span><span>سیوینگ چپ: {amount(n.savings.left)}</span><span>سیوینگ راست: {amount(n.savings.right)}</span></details></div>})}</div></div>)}
    <svg className="personal-connectors" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true"><path d="M50 0 L25 20 M50 0 L75 20 M150 0 L125 20 M150 0 L175 20 M250 0 L225 20 M250 0 L275 20 M350 0 L325 20 M350 0 L375 20"/></svg>
    <div className="personal-direct-row">{[1,5,3,6,4,7,8,2].map(ordinal=>{const d=data.directs.find((x:RecordData)=>x.ordinal===ordinal);return <button key={ordinal} className={"personal-direct "+(d.enabled?"enabled":"locked")} disabled={!d.member} onClick={()=>onOpen(d.member.child_id)} title={d.path} dir="rtl"><strong>دایرکت {ordinal.toLocaleString("fa-IR")}</strong><small>{d.member?.name || (d.enabled?"جای خالی":"قفل")}</small></button>})}</div>
    <p dir="rtl">هر ۱۰ میلیون تومان خرید واجد شرایط و پرداخت‌شده، یک جایگاه را روشن می‌کند. محاسبهٔ پورسانت پس از پایان مهلت برگشت خرید انجام می‌شود.</p>
  </section>;
}

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
      <small>خرید شخصی هفته: {amount(n.weeklyPersonalVolume)}</small>
      <small>فروش شبکه این هفته: {amount(n.weeklySales)}</small>
      <small>مجموع فروش شبکه: {amount(n.totalSales)}</small>
      <small>سیوینگ چپ: {amount(n.savings.left)} · سیوینگ راست: {amount(n.savings.right)}</small>
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
    <div className="tree-leg-summary" dir="rtl">
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
              {d.positions && <PersonalPositions data={d.positions} onOpen={setRoot}/>}
              {!d.positions && <>
              <div className="network-tree-summary" dir="ltr">
                <LegSummary label="شاخهٔ چپ" leg={d.tree.left} />
                <div className="tree-root-stats" dir="rtl">
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
              </>}
            </>
          )}
        </DataState>
      </div>
    </Localized>
  );
}
