'use client';
import {useId, useState} from 'react';
import {useTranslations} from 'next-intl';
import {ChevronDown} from 'lucide-react';
import {FooterLink, focusRing} from './FooterLink';
import type {FooterColumnProps} from './types';

export function FooterColumn({titleKey, links = [], children, defaultOpen = false, className = ''}: FooterColumnProps) {
  const t = useTranslations('Footer');
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  return <section className={`min-w-0 border-b border-white/15 py-2 md:border-0 md:py-0 ${className}`}>
    <h2 className="text-base font-semibold text-[#F5EAD4]">
      <span className="hidden md:block md:mb-4">{t(titleKey)}</span>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={`${id}-panel`}
        className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-sm text-start md:hidden ${focusRing}`}>
        {t(titleKey)}<ChevronDown aria-hidden="true" size={18} className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
    </h2>
    <div id={`${id}-panel`} className={`${open ? 'block' : 'hidden'} pb-4 md:block md:pb-0`}>
      {children}
      {links.length > 0 && <ul>{links.map(link => <li key={`${link.labelKey}:${link.href}`}><FooterLink {...link} /></li>)}</ul>}
    </div>
  </section>;
}
