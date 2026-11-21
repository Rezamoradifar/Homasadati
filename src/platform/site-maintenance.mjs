import {readFileSync} from 'node:fs';
import {join} from 'node:path';

// This release intentionally starts in maintenance mode. A local override is
// kept outside Git so the owner's on/off choice survives future deployments.
export function siteMaintenanceState(root = process.cwd()) {
  const path = join(root, 'data', 'site-maintenance.json');
  try {
    const state = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof state.enabled !== 'boolean') throw new Error('Invalid maintenance state');
    return {enabled: state.enabled, source: 'override', path};
  } catch (error) {
    return {enabled: true, source: error?.code === 'ENOENT' ? 'default' : 'invalid', path};
  }
}

export function siteMaintenanceHtml(root = process.cwd()) {
  try {
    return readFileSync(join(root, 'public', 'site-maintenance.html'), 'utf8');
  } catch {
    // Preserve the intentional 503 response if a deployment asset is missing.
    return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>در حال به‌روزرسانی | هما نت</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#143d3e;color:#f5eee2;font:16px/2 Tahoma,sans-serif}main{max-width:34rem;padding:2rem;text-align:center}h1{font-size:1.7rem}a{color:#e9ae8c;display:inline-block;padding:1rem}</style></head><body><main><h1>در حال به‌روزرسانی هما نت هستیم</h1><p>از همراهی شما سپاسگزاریم.</p><a href="/">بررسی دوباره</a><a href="mailto:info@homanets.com">ارتباط با ما</a></main></body></html>';
  }
}

/** @param {string} pathname */
export function bypassSiteMaintenance(pathname) {
  // Keep operations, authenticated administration and payment callbacks working.
  // These are routing exceptions only; their existing access checks still run.
  const prefixes = [
    '/api', '/admin', '/assets', '/fonts', '/_next/static', '/_next/image',
    '/payment/result', '/unsubscribe', '/legal',
  ];
  return prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    || ['/favicon.ico', '/icon.png', '/apple-icon.png'].includes(pathname);
}
