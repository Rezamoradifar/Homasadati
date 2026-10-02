import {CreditCard, BadgeCheck, Instagram, Linkedin, Youtube} from 'lucide-react';
import type {FooterBadge, FooterSocial} from './types';
/** Demonstration destinations only. Replace with verified Homanet profiles. */
export const demoSocials: FooterSocial[] = [
  {id: 'instagram', labelKey: 'socials.instagram', href: 'https://www.instagram.com/', icon: <Instagram size={18} />},
  {id: 'linkedin', labelKey: 'socials.linkedin', href: 'https://www.linkedin.com/', icon: <Linkedin size={18} />},
  {id: 'youtube', labelKey: 'socials.youtube', href: 'https://www.youtube.com/', icon: <Youtube size={18} />}
];
export const demoPayments: FooterBadge[] = [
  {id: 'visa', labelKey: 'payments.visa', icon: <CreditCard size={20} />},
  {id: 'mastercard', labelKey: 'payments.mastercard', icon: <svg width="28" height="20" viewBox="0 0 28 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor"/><circle cx="18" cy="10" r="8" stroke="currentColor"/></svg>},
  {id: 'paypal', labelKey: 'payments.paypal', icon: <CreditCard size={20} />}
];
export const demoCertifications: FooterBadge[] = [
  {id: 'sample', labelKey: 'certifications.sample', icon: <BadgeCheck size={20} />}
];
