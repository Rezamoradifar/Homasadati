import {z} from 'zod';
import {contact,id,password,text} from './validation';
export const TERMS_VERSION='2026-09-20-v1';
export const referralCode=z.string().trim().toLowerCase().regex(/^[a-z0-9-]{4,40}$/,'کد معرف معتبر نیست');
export const memberDetailsSchema=z.object({
 firstName:text,lastName:text,country:text,city:text,
 occupation:z.string().trim().max(120).default(''),
 language:z.enum(['fa','en','ar']).default('fa'),
 interests:z.array(z.enum(['tourism','craft','beauty','ai','leather'])).max(5).default([]),
}).strict();
export const registrationSchema=z.object({
 target:contact,password,challenge:id,code:z.string().regex(/^\d{6}$/),
 referral:z.union([z.literal(''),referralCode]).optional(),
 details:memberDetailsSchema,
 termsAccepted:z.literal(true),privacyAccepted:z.literal(true),adultConfirmed:z.literal(true),
 termsVersion:z.literal(TERMS_VERSION),marketingConsent:z.boolean().default(false),
}).strict();
