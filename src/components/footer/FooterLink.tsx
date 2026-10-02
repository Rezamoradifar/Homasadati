'use client';
import {useTranslations} from 'next-intl';
import type {FooterLinkProps} from './types';
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ceb798] focus-visible:ring-offset-4 focus-visible:ring-offset-[#212834]';

export function FooterLink({labelKey, ariaLabelKey, icon, className = '', target, rel, ...props}: FooterLinkProps) {
  const t = useTranslations('Footer');
  const safeRel = target === '_blank' ? Array.from(new Set(`${rel ?? ''} noopener noreferrer`.trim().split(/\s+/))).join(' ') : rel;
  return <a {...props} target={target} rel={safeRel} aria-label={ariaLabelKey ? t(ariaLabelKey) : undefined}
    className={`inline-flex min-h-11 items-center gap-2 rounded-sm text-sm text-[#d5e1e5] underline-offset-4 transition-colors hover:text-[#d8c7af] hover:underline motion-reduce:transition-none ${focusRing} ${className}`}>
    {icon && <span aria-hidden="true">{icon}</span>}{t(labelKey)}
  </a>;
}
