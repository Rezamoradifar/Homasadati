const ranks = [
 ['جوانه','Javaneh','jade'], ['سرو','Sarv','forest'], ['فیروزه','Turquoise','turquoise'],
 ['یاقوت','Ruby','ruby'], ['زمرد','Emerald','emerald'], ['پارسه','Parseh','gold'], ['سیمرغ','Simurgh','obsidian'],
];
export default function ClubCards({locale = "fa"}: {locale?: string}){
 const fa=locale!=='en';
 return <section className="club-preview content-section" aria-labelledby="ranks-title">
  <div className="section-heading"><div><p className="eyebrow">HOMA PRIVILEGE</p><h2 id="ranks-title">{fa?'هفت رتبه، هفت رنگ همراهی':'Seven ranks. Your next chapter.'}</h2></div><a className="editorial-link" href="/club/ranks">{fa?'شناخت رتبه‌ها و شرایط کارت سفر':'Explore ranks and travel cards'} <span aria-hidden="true">{fa?'←':'→'}</span></a></div>
  <div className="club-preview-grid">{ranks.map(([name,en,tone],i)=><a href="/club/ranks" className={'rank-card rank-'+tone} key={tone} aria-label={fa?'رتبه '+name:en+' rank'}><div className="rank-art"><span>HOMA PRIVILEGE</span><img src="/assets/brand-mark.png" alt="" loading="lazy"/><small dir="ltr">{String(i+1).padStart(2,'0')} / 07</small><h3>{fa?name:en}</h3></div></a>)}</div>
  <p className="club-preview-note">{fa?'کارت سفر به نام عضو واجد شرایط صادر می‌شود. شرایط احراز هر رتبه و وضعیت فعال‌بودن مزایا را در صفحه باشگاه ببینید.':'Travel cards are issued to eligible members. See qualification requirements and benefit availability in the club.'}</p>
 </section>
}
