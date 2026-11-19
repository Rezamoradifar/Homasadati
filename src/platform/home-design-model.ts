import parseh from '../../app/parseh-copy.json';
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
// Older clients can still read and write their keys. The current editor only
// offers fields actually displayed by the public homepage.
export const editableHomeDefaults: Record<string, string> = { 'image.hero': '', 'image.story': '' };
for (const locale of homeLocales) {
  const c = parseh[locale];
  editableHomeDefaults[`${locale}.hero.hero`] = c.hero;
  editableHomeDefaults[`${locale}.hero.explore`] = c.discover;
  for (const key of ['services', 'featured', 'club', 'clubEntry', 'journal', 'kashan', 'read'] as const) {
    editableHomeDefaults[`${locale}.parseh.${key}`] = c[key];
  }
}
Object.assign(homeDefaults, editableHomeDefaults);
