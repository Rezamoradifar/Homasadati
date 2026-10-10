"use client";
import { ManagerActivationBadge } from "./ManagerActivationBadge";
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
  managerActivated?: boolean;
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
  const [selected,setSelected]=useState(1);
  const flat=(n:RecordData):RecordData[]=>[n,...(n.left?flat(n.left):[]),...(n.right?flat(n.right):[])];
  const nodes=flat(data.tree), current=nodes.find(n=>n.desk===selected) || nodes[0];
  const four = data.directs.length === 4;
  const full = data.version === "seven-level-manual-2026-10-07";
  const next=data.directs.find((d:RecordData)=>d.ordinal===data.nextReferralOrdinal&&d.enabled&&!d.member);
  const labels=["جایگاه اصلی","چپ","راست","چپ · چپ","چپ · راست","راست · چپ","راست · راست"];
  return <section className={"personal-positions refined-positions"+(data.managerActivated?" manager-activated":"")} dir="ltr" data-position-version={data.version || "aa-2026-10-06"} data-tree-design="2026-10-06-refined">
    <header className="position-header" dir="rtl"><div><span className="position-eyebrow">باشگاه هما نت</span><h3>جایگاه‌های من</h3><p>کارت خریداری‌شده مشخص می‌کند چند جایگاه از جایگاه‌های ۱ تا ۷ روشن باشد.</p></div><div className="position-count"><strong>{data.desks.toLocaleString("fa-IR")}<small> / ۷</small></strong><span>جایگاه فعال</span></div></header>
    {data.member&&<div className="position-owner" dir="rtl"><img src="/assets/brand/homanet-mark-orange.png" alt="هما نت"/><div><strong>{data.member.name}</strong><ManagerActivationBadge active={data.managerActivated}/><small dir="ltr">{data.member.referral_code}</small></div></div>}
    {data.company&&<div className="position-company-note" dir="rtl" role="status"><strong>{data.company.exempt ? "جایگاه‌های دائماً فعال" : data.company.status==="qualified"?"شرط خرید واقعی تکمیل شد":data.company.status==="suspended"?"جایگاه شرکتی معلق است":"جایگاه شرکتی با مهلت خرید"}</strong>{data.company.exempt ? <p>این حساب شرط خرید و مهلت زمانی ندارد.</p> : <p>خرید واقعی: {amount(data.company.realPurchaseToman)} از ۲۰ میلیون تومان · {Number(data.company.remainingDays).toLocaleString("fa-IR")} روز باقی‌مانده</p>}</div>}
    <div className="position-legend" dir="rtl"><span><i className="is-active"/>فعال</span><span><i/>خاموش</span><strong>ظرفیت معرفی مستقیم: {data.directCapacity.toLocaleString("fa-IR")}</strong></div>
    <details className="position-help" dir="rtl"><summary>راهنمای استفاده از نقشه جایگاه‌ها</summary><ol><li>این هفت خانه، جایگاه‌های همین حساب هستند. یک جایگاه را لمس کنید تا حجم چپ، راست و سیوینگ آن را ببینید.</li><li>شاخه‌های پایین نقشه محل ورود اعضای جدید هستند. محل هر ورودی را قبل از ارسال دعوت در پنل دعوت انتخاب کنید.</li><li>با ثبت‌نام هر عضو، انتخاب محل مصرف می‌شود؛ برای نفر بعد دوباره انتخاب کنید. حجم فقط از خریدهای بعد از فعال‌شدن همان جایگاه محاسبه می‌شود.</li></ol><a className="portal-button secondary" href="/account?tab=network">انتخاب محل و لینک دعوت</a></details>
    {full&&<p className="position-next-entry" dir="rtl" role="status">{next ? <>ورودی بعدی: شاخه {Number(next.ordinal).toLocaleString("fa-IR")} · جایگاه {Number(next.desk).toLocaleString("fa-IR")} · {next.leg==="left"?"چپ":"راست"}</> : "محل ورودی بعدی انتخاب نشده است؛ پیش از اشتراک‌گذاری دعوت، یک شاخه خالی انتخاب کنید."}</p>}
    <div className="position-map-scroll" role="region" aria-label="نقشه هفت جایگاه و شاخه‌ها" tabIndex={0}><div className="position-diagram">
    {[ [1], [2,3], [4,5,6,7] ].map((row,i)=><div key={i}>{i>0 && <svg className="personal-connectors" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true"><path d={i===1?"M200 0 C200 12 100 8 100 20 M200 0 C200 12 300 8 300 20":"M100 0 C100 12 50 8 50 20 M100 0 C100 12 150 8 150 20 M300 0 C300 12 250 8 250 20 M300 0 C300 12 350 8 350 20"}/></svg>}<div className={"personal-position-row row-"+i}>{row.map(desk=>{const n=nodes.find(n=>n.desk===desk)!;return <button type="button" key={desk} className={"personal-position "+(n.active?"lit":"dark")+(selected===desk?" selected":"")} dir="rtl" aria-label={"جایگاه "+desk+" "+(n.active?"فعال":"خاموش")} aria-pressed={selected===desk} onClick={()=>setSelected(desk)}><img className="position-brand" src="/assets/brand/homanet-mark-orange.png" alt=""/><span className="position-status-dot"/><strong>{desk.toLocaleString("fa-IR")}</strong><small>{n.active?"فعال":"خاموش"}</small>{data.member&&<span className="position-holder">{data.member.name}</span>}</button>})}</div></div>)}
    <svg className="personal-connectors direct-connectors" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true"><path d={four ? "M50 0 L50 20 M150 0 L150 20 M250 0 L250 20 M350 0 L350 20" : "M50 0 L25 20 M50 0 L75 20 M150 0 L125 20 M150 0 L175 20 M250 0 L225 20 M250 0 L275 20 M350 0 L325 20 M350 0 L375 20"}/></svg>
    <div className="personal-direct-row" style={four ? {gridTemplateColumns:"repeat(4,minmax(0,1fr))"} : undefined}>{(four ? [1,2,3,4] : [1,5,3,6,4,7,8,2]).map(ordinal=>{const d=data.directs.find((x:RecordData)=>x.ordinal===ordinal);return <button type="button" key={ordinal} className={"personal-direct "+(d.enabled?"enabled":"locked")+(d.member?" occupied":"")+(d.member?.managerActivated?" manager-activated":"")+(next?.ordinal===ordinal?" next-entry":"")} disabled={!d.member} onClick={()=>onOpen(d.member.child_id)} aria-label={(four ? "رفرال جایگاه " : full ? "شاخه " : "دایرکت ")+(four ? ordinal+3 : ordinal).toLocaleString("fa-IR")+(full ? " · جایگاه "+d.desk.toLocaleString("fa-IR")+" · "+(d.leg==="left"?"چپ":"راست") : "")+" "+(d.member?.name || (d.enabled?"جای خالی":"قفل"))+(d.member?.managerActivated?" · فعال‌شده توسط مدیر":"")} title={(full ? "جایگاه "+d.desk.toLocaleString("fa-IR")+" · "+(d.leg==="left"?"چپ":"راست")+" · " : "")+(d.member?.name || (d.enabled?"جای خالی":"قفل"))+(d.member?.managerActivated?" · فعال‌شده توسط مدیر":"")} dir="rtl"><strong>{(four ? ordinal+3 : ordinal).toLocaleString("fa-IR")}</strong><span aria-hidden="true">{d.member?"●":d.enabled?"+":"−"}</span>{d.member?.managerActivated&&<span className="direct-manager-label">مدیر</span>}{next?.ordinal===ordinal&&<span className="next-entry-label">ورودی بعدی</span>}{full&&<small>جایگاه {d.desk.toLocaleString("fa-IR")} · {d.leg==="left"?"چپ":"راست"}</small>}</button>})}</div>
    <span className="position-direct-caption" dir="rtl">{four ? "یک کد دعوت · انتخاب محل هر ورودی در پنل دعوت · جایگاه‌های ۴ تا ۷" : full ? "محل هر ورودی را با انتخاب جایگاه و سمت شاخه در پنل دعوت مشخص کنید." : "معرفی‌های مستقیم"}</span>
    <p className="position-diagram-hint" dir="rtl">برای دیدن جزئیات، یک جایگاه را لمس کنید.</p></div></div>
    <details className="position-branch-list"><summary>فهرست شاخه‌ها و اعضا</summary><ul dir="rtl">
      {data.directs.map((d:RecordData)=><li key={d.ordinal}>
        <div><strong>{full ? "شاخه " : "ورودی "}{Number(d.ordinal).toLocaleString("fa-IR")}</strong><small>{full ? "جایگاه "+Number(d.desk).toLocaleString("fa-IR")+" · "+(d.leg==="left"?"چپ":"راست") : ""}</small></div>
        <div>{d.member ? <><button type="button" className="portal-button secondary" onClick={()=>onOpen(d.member.child_id)}><bdi translate="no">{d.member.name}</bdi></button><ManagerActivationBadge active={d.member.managerActivated}/></> : <span className="branch-state">{d.enabled ? "جای خالی" : "ظرفیت باز نشده"}</span>}</div>
      </li>)}
    </ul></details>
    <div className="position-inspector" dir="rtl" aria-live="polite"><div className="position-inspector-title"><div><span>جایگاه {selected.toLocaleString("fa-IR")}</span><strong>{labels[selected-1]}</strong></div><span className={"position-badge "+(current.active?"active":"inactive")}>{current.active?"فعال":"خاموش"}</span></div>
    <div className="position-sales"><div><span>فروش این هفته</span><strong>{amount(current.weeklySales || 0)}<small> تومان</small></strong></div><div><span>مجموع فروش</span><strong>{amount(current.totalSales || 0)}<small> تومان</small></strong></div></div>
    <div className="position-leg-details"><div><span>شاخهٔ چپ</span><strong>{amount(current.leftVolume)} <small>تومان</small></strong><p>سیوینگ: <b>{amount(current.savings.left)}</b></p></div><div><span>شاخهٔ راست</span><strong>{amount(current.rightVolume)} <small>تومان</small></strong><p>سیوینگ: <b>{amount(current.savings.right)}</b></p></div></div>
    </div><p className="position-volume-note" dir="rtl">حجم این جایگاه از خریدهای پس از فعال‌شدن آن محاسبه می‌شود؛ خریدهای قبل از فعال‌سازی پورسانت ندارند.</p><p className="position-purchase-note" dir="rtl">هر ۱۰ میلیون تومان خرید واجد شرایط و پرداخت‌شده، یک جایگاه را روشن می‌کند. محاسبهٔ پورسانت پس از پایان مهلت برگشت خرید انجام می‌شود.</p>
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
      className={"tree-node" + (n.active ? " active" : "") + (root ? " root" : "") + (n.managerActivated ? " manager-activated" : "")}
      onClick={() => onOpen(n.id)}
      title={root ? undefined : "نمایش درخت از این عضو"}
    >
      <span className="tree-avatar" aria-hidden="true">
        {initials(n.name)}
      </span>
      <strong>{n.name}</strong>
      <ManagerActivationBadge active={n.managerActivated}/>
      <small>
        {n.active || n.managerActivated ? "فعال" : "غیرفعال"}
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
            {!admin && <a className="portal-button secondary" href="#referral-invitation">شبکه و دعوت</a>}
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
                    {m.path?.length>0&&<span className="search-member-route">{m.pathDepth>8 ? "… / " : ""}{m.path.map((p:RecordData)=>p.name).join(" / ")}</span>}
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
