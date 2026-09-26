"use client";

import Localized from "../src/i18n/Localized";
import {useEffect, useRef, useState} from "react";

// The same film previously used in HeritageHero on the homepage.
const source = process.env.NEXT_PUBLIC_HERO_VIDEO_URL ||
  "https://upload.wikimedia.org/wikipedia/commons/5/53/Persepolis%2C_Hauptstadt_Persiens_%28CC_BY-SA_4.0%29.webm";

export default function TourismHeroVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const connection=(navigator as Navigator & {connection?:{saveData?:boolean;effectiveType?:string}}).connection;
    const saveData=connection?.saveData||["slow-2g","2g"].includes(connection?.effectiveType||"");
    let visible = false;
    const sync = () => {
      if (visible && !document.hidden && !reduced.matches && !saveData && !userPaused.current) {
        element.muted = true;
        void element.play().catch(() => setPlaying(false));
      } else element.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }, {threshold: 0.15});
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduced.removeEventListener("change", sync);
    };
  }, []);

  async function toggle() {
    const element = video.current;
    if (!element) return;
    if (playing) {
      userPaused.current = true;
      element.pause();
      return;
    }
    userPaused.current = false;
    setNotice("");
    if (failed) { setFailed(false); element.load(); }
    try { element.muted = true; await element.play(); }
    catch { setNotice("پخش خودکار ممکن نشد؛ برای پخش دوباره لمس کنید."); }
  }

  return <Localized><>
    <img className="tourism-video-poster" src="/assets/backdrop/persepolis.webp" alt="بازآفرینی هنری تخت‌جمشید" fetchPriority="high" />
    <video ref={video} className="tourism-hero-video" muted loop playsInline
      src={source} preload="none" poster="/assets/backdrop/persepolis.webp"
      aria-label="ویدیوی پس‌زمینه گردشگری؛ بازسازی تخت‌جمشید"
      onPlaying={() => {setPlaying(true);setNotice("");}}
      onPause={() => setPlaying(false)}
      onError={() => {setFailed(true);setPlaying(false);setNotice("ویدیو بارگذاری نشد؛ برای تلاش دوباره لمس کنید.");}}
      style={failed ? {visibility: "hidden"} : undefined} />
    <div className="tourism-video-controls">
      <button type="button" onClick={toggle} aria-pressed={playing}>
        {failed ? "تلاش دوباره" : playing ? "توقف ویدیو" : "پخش ویدیو"}
      </button>
      <a href="#tourism-media-credit">تخت‌جمشید · Terra X</a>
      <span role="status">{notice}</span>
    </div>
  </></Localized>;
}
