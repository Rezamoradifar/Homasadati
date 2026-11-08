import { z } from 'zod';
import { atomic } from './schema';
import { audit } from './security';
import { setting, saveSetting } from './providers';
import { httpsImage } from './validation';
import { homeDefaults } from './home-design-model';
import { ApiError } from '../server/http';

const storageKey = 'homepage_design';
export function homeDesign(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(setting(storageKey) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => Object.hasOwn(homeDefaults, key) && typeof value === 'string')) as Record<string, string>;
  } catch { return {}; }
}
export function saveHomeDesign(actor: string, input: unknown) {
  const inputValues = z.object({ values: z.record(z.string().max(1000)) }).strict().parse(input).values;
  const values: Record<string, string> = {};
  for (const [key, raw] of Object.entries(inputValues)) {
    if (!Object.hasOwn(homeDefaults, key)) throw new ApiError(400, 'invalid_input');
    const value = raw.trim();
    if (key.startsWith('image.')) httpsImage.parse(value);
    if (value) values[key] = value;
  }
  atomic(() => {
    const before = homeDesign();
    saveSetting(storageKey, JSON.stringify(values), false);
    audit(actor, 'homepage.design', storageKey, before, values, '');
  });
  return { values };
}
