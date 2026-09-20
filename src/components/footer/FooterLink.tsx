'use client';
import {useTranslations} from 'next-intl';
import type {FooterLinkProps} from './types';
export const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DCC38A] focus-visible:ring-offset-4 focus-visible:ring-offset-[#18263D]';

export function FooterLink({labelKey, ariaLabelKey, icon, className = '', target, rel, ...props}: FooterLinkProps) {
  const t = useTranslations('Footer');
  const safeRel = target === '_blank' ? Array.from(new Set(`${rel ?? ''} noopener noreferrer`.trim().split(/\s+/))).join(' ') : rel;
  return <a {...props} target={target} rel={safeRel} aria-label={ariaLabelKey ? t(ariaLabelKey) : undefined}
    className={`inline-flex min-h-11 items-center gap-2 rounded-sm text-sm text-[#D5DCE5] underline-offset-4 transition-colors hover:text-[#EDD39A] hover:underline motion-reduce:transition-none ${focusRing} ${className}`}>
    {icon && <span aria-hidden="true">{icon}</span>}{t(labelKey)}
  </a>;
}
