import { all, atomic, platformDb } from "./schema";
import { z } from "zod";
import { experiencePages, experienceKinds } from "./experience-model";
export const experienceBatch=z.object({events:z.array(z.object({
  page:z.enum(experiencePages),kind:z.enum(experienceKinds),duration:z.number().finite().min(0).max(120000),
}).strict()).min(1).max(12)}).strict();

/** Anonymous, bounded daily counters. Client observations are diagnostic, not uptime proof. */
export function recordExperience(input:unknown) {
  const {events}=experienceBatch.parse(input), db=platformDb(),day=new Date().toISOString().slice(0,10);
  const cutoff=new Date(Date.now()-13*86400000).toISOString().slice(0,10);
  atomic(()=>{
    db.prepare("DELETE FROM p_experience_daily WHERE day<?").run(cutoff);
    const insert=db.prepare(`INSERT INTO p_experience_daily VALUES(?,?,?,1,?,?,?)
      ON CONFLICT(day,page,kind) DO UPDATE SET samples=samples+1,total_ms=total_ms+excluded.total_ms,
      max_ms=MAX(max_ms,excluded.max_ms),slow=slow+excluded.slow`);
    for(const e of events) {
      const duration=Math.round(e.duration),threshold=e.kind==="ttfb"?800:e.kind==="lcp"?2500:4000;
      insert.run(day,e.page,e.kind,duration,duration,Number(duration>threshold));
    }
  });
}
export function experienceSummary() {
  platformDb();
  const cutoff=new Date(Date.now()-13*86400000).toISOString().slice(0,10);
  return {days:14,rows:all(`SELECT page,kind,SUM(samples) samples,
    ROUND(1.0*SUM(total_ms)/SUM(samples)) averageMs,MAX(max_ms) maxMs,SUM(slow) slow
    FROM p_experience_daily WHERE day>=? GROUP BY page,kind ORDER BY page,kind`,cutoff)};
}
