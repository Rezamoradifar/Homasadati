export const experienceKinds = ["navigation","ttfb","lcp","api_slow","api_network","api_timeout","api_server","api_invalid","runtime","resource"] as const;
export const experiencePages = ["home","account","admin","register","shop","cart","checkout","payment","other"] as const;
export type ExperienceEvent = {page:typeof experiencePages[number];kind:typeof experienceKinds[number];duration:number};
/** Only coarse route groups leave the browser; no queries, codes or member IDs. */
export function experiencePage(path:string):ExperienceEvent["page"] {
  const part=path.split(/[?#]/)[0].split("/").filter(Boolean)[0] || "home";
  return (experiencePages as readonly string[]).includes(part)?part as ExperienceEvent["page"]:"other";
}
