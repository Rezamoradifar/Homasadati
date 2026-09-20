"use client";
import { useEffect, useState } from "react";
export type BasketItem = { productId: string; quantity: number };
const key = "homa-basket-v1";
function read(): BasketItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v)
      ? v
          .filter(
            (x) =>
              /^[a-f\d-]{36}$/.test(x.productId) &&
              Number.isInteger(x.quantity) &&
              x.quantity >= 1 &&
              x.quantity <= 100,
          )
          .slice(0, 30)
      : [];
  } catch {
    return [];
  }
}
export function writeBasket(items: BasketItem[]) {
  localStorage.setItem(key, JSON.stringify(items));
  window.dispatchEvent(new Event("homa-basket"));
}
export function addToBasket(productId: string, quantity: number) {
  const items = read(),
    old = items.find((x) => x.productId === productId);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100)
    throw new Error("تعداد معتبر وارد کنید.");
  if (old) {
    if (old.quantity + quantity > 100)
      throw new Error("حداکثر ۱۰۰ واحد از هر کالا مجاز است.");
    old.quantity += quantity;
  } else {
    if (items.length >= 30)
      throw new Error("حداکثر ۳۰ نوع کالا در هر سبد مجاز است.");
    items.push({ productId, quantity });
  }
  writeBasket(items);
}
export function useBasket() {
  const [items, set] = useState<BasketItem[]>([]),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => {
      set(read());
      setReady(true);
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("homa-basket", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("homa-basket", sync);
    };
  }, []);
  return { items, ready };
}
