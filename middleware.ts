import {NextRequest, NextResponse} from 'next/server';
import {bypassSiteMaintenance, siteMaintenanceHtml, siteMaintenanceState} from './src/platform/site-maintenance.mjs';

export const config = {runtime: 'nodejs'};

export function middleware(request: NextRequest) {
  if (bypassSiteMaintenance(request.nextUrl.pathname) || !siteMaintenanceState().enabled) {
    return NextResponse.next();
  }

  return new NextResponse(request.method === 'HEAD' ? null : siteMaintenanceHtml(), {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Retry-After': '300',
      'X-Homa-Maintenance': 'active',
    },
  });
}
