import premium from '../../app/premium-home-copy.json';
import { copy as landing } from '../../app/landing-copy';

export const homeLocales = ['fa', 'en', 'ar'] as const;
export const heroKeys = ['eyebrow', 'hero', 'sub', 'line', 'explore', 'story', 'quote'] as const;
export const homeDefaults: Record<string, string> = {};
for (const locale of homeLocales) {
  for (const [key, value] of Object.entries(premium[locale])) {
    if (typeof value === 'string') homeDefaults[`${locale}.premium.${key}`] = value;
  }
  for (const key of heroKeys) homeDefaults[`${locale}.hero.${key}`] = landing[locale][key];
  for (const [key, value] of Object.entries({ rankMember:'Member', rankSilver:'Silver', rankGold:'Gold', rankPlatinum:'Platinum', rankVip:'VIP' })) homeDefaults[`${locale}.premium.${key}`] = value;
}
homeDefaults['image.hero'] = '';
homeDefaults['image.story'] = '';
