"use client";
import { useState } from 'react';
import { useSiteLocale } from '../i18n/SiteLocale';
import { memberKitCopy } from './member-kit-content';
import { memberLearningCopy } from './member-learning-content';
import './member-kit.css';

export default function MemberKit() {
  const {locale}=useSiteLocale();
  const c=memberKitCopy[locale], learning=memberLearningCopy[locale];
  const [feedback,setFeedback]=useState('');
  const resources=[
    {title:c.guide,note:c.guideNote,href:'/member-kit/guide-fa.pdf',download:true,label:c.download},
    {title:c.presentation,note:c.presentationNote,href:'/income-plan/presentation',download:false,label:c.view},
    {title:c.image,note:c.imageNote,href:'/member-kit/introduction-fa.png',download:true,label:c.download},
  ];
  return <section className="member-kit" aria-labelledby="member-kit-title" dir={locale==='en'?'ltr':'rtl'}>
    <header className="member-kit-heading"><div><span lang="en" translate="no">HOMANET</span><h2 id="member-kit-title">{c.title}</h2><p>{c.subtitle}</p></div><img src="/assets/brand/homanet-mark-orange.png" width="64" height="64" alt=""/></header>
    <h3>{c.resourcesTitle}</h3>
    <div className="member-kit-resources">{resources.map(r=><article key={r.href}><h4>{r.title}</h4><p>{r.note}</p><a href={r.href} download={r.download||undefined}>{r.label}<span aria-hidden="true"> ↗</span></a></article>)}</div>
    <h3>{learning.title}</h3><p>{learning.description}</p>
    <ol className="member-kit-learning">{learning.steps.map((step,i)=><li key={step.image}><img src={'/member-kit/stories/'+step.image+'.png'} alt="" width="1080" height="1920" loading="lazy" decoding="async"/><div><span className="member-kit-step">{String(i+1).padStart(2,'0')}</span><h4>{step.title}</h4><p>{step.text}</p><a href={step.href}>{learning.open}<span className="sr-only">: {step.title}</span></a></div></li>)}</ol>
    <section className="member-kit-story-download"><h3>{learning.stories}</h3><p>{learning.storyNote}</p><a href="/member-kit/stories-fa.zip" download>{learning.download}</a></section>
    <section className="member-kit-faq" aria-labelledby="member-kit-faq-title"><h3 id="member-kit-faq-title">{learning.faqTitle}</h3>{learning.faq.map(f=><details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</section>
    <h3>{c.templatesTitle}</h3>
    <p className="member-kit-feedback" role="status">{feedback}</p>
    <div className="member-kit-templates">{c.templates.map((t,i)=><article key={t.title}><header><span aria-hidden="true">{String(i+1).padStart(2,'0')}</span><h4>{t.title}</h4></header><p className="member-kit-copy" dir="auto">{t.text}</p><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(t.text);setFeedback(c.copied);}catch{setFeedback(c.copyError);}}}>{c.copy}<span className="sr-only">: {t.title}</span></button></article>)}</div>
    <p className="member-kit-note">{c.note}</p>
  </section>;
}
