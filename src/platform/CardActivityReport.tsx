"use client";
import {amount,date,RecordData} from "./client";
import {Pagination,Stat,Table} from "./Widgets";
export function CardActivityReport({data,page,onPage}:{data:RecordData;page:number;onPage:(n:number)=>void}) {
  return <section className="portal-card card-activity-report"><h2>گزارش حجم و پاداش جایگاه‌ها</h2><p>حجم هر جایگاه جداگانه محاسبه می‌شود؛ حجم چند جایگاه را نباید به‌عنوان فروش یکتای شبکه جمع کرد.</p>{!data.live&&<p className="portal-notice">تسویهٔ این پلن هنوز فعال نشده است.</p>}
    <div className="portal-stats"><Stat label="سقف هفتگی جایگاه‌های فعال" value={data.weeklyCap}/><Stat label="پاداش نقدی در انتظار آزادسازی" value={data.summary.pendingCash}/><Stat label="ووچر در انتظار آزادسازی" value={data.summary.pendingVoucher}/><Stat label="مانده ووچر خرید" value={data.voucherBalance}/></div>
    <p className="portal-notice">نزدیک‌ترین زمان آزادسازی: {data.summary.nextRelease?date(data.summary.nextRelease):"پاداشی در انتظار آزادسازی نیست"}</p>
    <div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>جایگاه</th><th>وضعیت</th><th>حجم ورودی چپ</th><th>حجم ورودی راست</th><th>مانده چپ</th><th>مانده راست</th><th>حجم تطبیق‌شده هر سمت</th></tr></thead><tbody>{data.positions.map((p:RecordData)=><tr key={p.desk}><th>{amount(p.desk)}</th><td>{p.active?"فعال":"خاموش"}</td><td>{amount(p.left.total)}</td><td>{amount(p.right.total)}</td><td>{amount(p.left.remaining)}</td><td>{amount(p.right.remaining)}</td><td>{amount(p.left.consumed)} / {amount(p.right.consumed)}</td></tr>)}</tbody></table></div>
    <p className="portal-muted">مبالغ به تومان است. مانده حجم، پاداش قطعی نیست؛ تطبیق و تسویه تابع شرایط پلن و بودجه است.</p><h3>سابقه پاداش و آزادسازی</h3>
    <Table rows={data.matches.map((m:RecordData)=>({...m,kindLabel:m.kind==='voucher'?"ووچر":"نقدی",statusLabel:m.void?"برگشت‌شده":m.status==='pending'?"در انتظار آزادسازی":m.status==='released'?"آزادشده":m.status==='cancelled'?"لغوشده":"فلش‌شده"}))} columns={[["week","هفته"],["desk","جایگاه"],["kindLabel","نوع"],["amount","پاداش ثبت‌شده","money"],["flushed","مبلغ فلش‌شده","money"],["statusLabel","وضعیت"],["release_at","زمان آزادسازی","date"]]}/><Pagination page={page} more={data.hasMore} onChange={onPage}/>
  </section>;
}
