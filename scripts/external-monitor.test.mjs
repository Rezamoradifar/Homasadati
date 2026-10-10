// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {probe,shouldAlert} from './external-monitor.mjs';
it('checks public homepage and health without cookies or raw response contents',async()=>{
 const request=vi.fn(async url=>String(url).endsWith('/api/health')?Response.json({status:'ok'}):new Response('<html>Private test text</html>',{headers:{'content-type':'text/html'}}));
 const report=await probe('https://homanets.com',request);expect(report.status).toBe('ok');expect(request).toHaveBeenCalledTimes(2);expect(JSON.stringify(report)).not.toContain('Private test text');expect(request.mock.calls[0][1].redirect).toBe('error');
});
it('detects invalid health replies and network outages, and rejects credentialed origins',async()=>{
 expect((await probe('https://homanets.com',async()=>Response.json({status:'unavailable'}))).status).toBe('unavailable');expect((await probe('https://homanets.com',async()=>{throw Error('private failure');})).checks.every(c=>!c.ok)).toBe(true);await expect(probe('https://user:secret@homanets.com')).rejects.toThrow();
});
it('retries failed alerts, limits repeated outage alerts and signals recovery only after a delivered outage',()=>{
 const at=5000000;expect(shouldAlert({status:'unavailable',lastAlert:at},{status:'unavailable'},at)).toBe(true);expect(shouldAlert({alertStatus:'unavailable',lastAlert:at},{status:'unavailable'},at+1000)).toBe(false);expect(shouldAlert({alertStatus:'unavailable',lastAlert:at},{status:'unavailable'},at+3600000)).toBe(true);expect(shouldAlert({alertStatus:'unavailable'},{status:'ok'},at)).toBe(true);expect(shouldAlert(undefined,{status:'ok'},at)).toBe(false);
});
