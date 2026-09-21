"use client";
import { useEffect, useRef, useState } from "react";
export const tourismNarration =
  "ایران را می‌توان آرام‌تر شناخت؛ در سایه ستون‌های پارسه، در کوچه‌های یزد و در گفت‌وگو با هنرمندی که نقش‌های کهن را به زندگی امروز می‌آورد. در همای سعادت، سفر فرصتی برای دیدن، شنیدن و همراه شدن با فرهنگ زنده ایران است. مقصد و زمان سفر را با کارگزار گردشگری هماهنگ کنید تا برنامه متناسب با علاقه، بودجه و نیاز شما بررسی شود. اعضای واجد شرایط باشگاه، می‌توانند برای استفاده از اعتبار کارت سفر خود، دست‌کم هفت روز کاری پیش از سفر درخواست هماهنگی ثبت کنند.";
export default function PersianNarration() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]),
    [speaking, setSpeaking] = useState(false),
    [error, setError] = useState("");
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const file = process.env.NEXT_PUBLIC_TOURISM_NARRATION_FA_URL;
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const sync = () =>
      setVoices(synth.getVoices().filter((v) => /^fa(?:[-_]|$)/i.test(v.lang)));
    sync();
    synth.addEventListener("voiceschanged", sync);
    return () => {
      synth.removeEventListener("voiceschanged", sync);
      synth.cancel();
    };
  }, []);
  function speak() {
    setError("");
    if (!voices.length) {
      setError(
        "صدای فارسی روی این مرورگر نصب نیست. متن روایت در همین بخش در دسترس است؛ فایل گویندگی فارسی هنوز بارگذاری نشده است.",
      );
      return;
    }
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(tourismNarration);
    u.lang = "fa-IR";
    u.voice = voices[0];
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = (event) => {
      setSpeaking(false);
      if (!["canceled", "interrupted"].includes(event.error)) setError("پخش روایت متوقف شد؛ دوباره تلاش کنید.");
    };
    utterance.current = u;
    setSpeaking(true);
    speechSynthesis.speak(u);
  }
  return (
    <div className="persian-narration" lang="fa">
      {file ? (
        <audio
          controls
          preload="none"
          src={file}
          aria-label="روایت فارسی گردشگری"
          onError={() => setError("فایل صدای فارسی بارگذاری نشد.")}
        />
      ) : (
        <>
          <button
            type="button"
            className="commerce-button gold"
            onClick={speak}
            aria-pressed={speaking}
          >
            {speaking ? "توقف روایت فارسی" : "شنیدن روایت فارسی"}
          </button>
          <small>خوانش با صدای فارسی دستگاه؛ صدای ضبط‌شده گوینده نیست.</small>
        </>
      )}
      <p role="status">{error}</p>
    </div>
  );
}
