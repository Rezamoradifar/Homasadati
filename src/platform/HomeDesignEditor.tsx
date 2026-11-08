'use client';

import { useEffect, useState } from 'react';
import { api } from './client';
import { MediaInput } from './MediaInput';
import { homeDefaults, homeLocales } from './home-design-model';

type Values = Record<string, string>;
const names = { fa: 'فارسی', en: 'انگلیسی', ar: 'عربی' } as const;
const heroLabels: Record<string,string> = { eyebrow: 'متن بالای عنوان', hero: 'عنوان اصلی', sub: 'زیرعنوان', line: 'توضیح', explore: 'دکمهٔ اول', story: 'دکمهٔ دوم', quote: 'نقل‌قول' };

export default function HomeDesignEditor() {
  const [values, setValues] = useState<Values | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api('admin/homepage-design').then(r => { if(active) setValues(r.values as Values); })
      .catch(() => { if(active) setMessage('دریافت تنظیمات صفحهٔ اول ممکن نشد.'); });
    return () => { active = false; };
  }, []);
  return <section className="portal-card" aria-labelledby="home-design-title">
    <h2 id="home-design-title">طراحی صفحهٔ اول</h2>
    <p>تصویر و متن بخش‌های صفحهٔ اول را تغییر دهید. برای بازگرداندن متن پیش‌فرض، کادر را خالی بگذارید.</p>
    {message && <p role="status">{message}</p>}
    {!values ? <p>در حال دریافت تنظیمات…</p> : <form onSubmit={async e => {
      e.preventDefault();
      const form = e.currentTarget;
      if (form.querySelector('[data-uploading="true"]')) { setMessage('منتظر پایان بارگذاری تصویر بمانید.'); return; }
      const formData = new FormData(form);
      const next = Object.fromEntries(Object.keys(homeDefaults).map(key => [key, String(formData.get(key) || '')]));
      setBusy(true); setMessage('');
      try { const result = await api('admin/homepage-design','PATCH',{values: next}); setValues(result.values as Values); setMessage('تغییرات صفحهٔ اول ذخیره و منتشر شد.'); }
      catch (err) { setMessage(err instanceof Error ? err.message : 'ذخیره انجام نشد.'); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy}>
        <details open><summary>تصاویر صفحهٔ اول</summary>
          <label>تصویر اصلی <MediaInput name="image.hero" initial={values['image.hero'] || ''} single /></label>
          <label>تصویر بخش معرفی <MediaInput name="image.story" initial={values['image.story'] || ''} single /></label>
        </details>
        {homeLocales.map(locale => <details key={locale} open={locale === 'fa'}><summary>متن‌های {names[locale]}</summary>
          {Object.entries(homeDefaults).filter(([key]) => key.startsWith(`${locale}.`)).map(([key, fallback]) => {
            const short = key.split('.').pop() || key;
            const label = key.includes('.hero.') ? heroLabels[short] || short : fallback;
            return <label key={key} style={{display:'block',margin:'12px 0'}}>{label}
              <textarea name={key} defaultValue={values[key] ?? fallback} maxLength={1000} rows={2} style={{display:'block',width:'100%'}} />
            </label>;
          })}
        </details>)}
        <button className="portal-button" type="submit">{busy ? 'در حال ذخیره…' : 'ذخیره و انتشار صفحهٔ اول'}</button>{' '}
        <a href="/" target="_blank" rel="noopener noreferrer">دیدن صفحهٔ اول</a>
      </fieldset>
    </form>}
  </section>;
}
