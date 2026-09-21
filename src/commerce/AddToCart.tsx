"use client";

import Localized from "../i18n/Localized";
import { useState } from "react";
import { addToBasket } from "./basket";
export default function AddToCart({
  id,
  stock,
}: {
  id: string;
  stock: number;
}) {
  const [quantity, setQuantity] = useState(1),
    [notice, setNotice] = useState("");
  return (
    <Localized><form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          if (quantity > stock) throw new Error("تعداد بیشتر از موجودی است.");
          addToBasket(id, quantity);
          setNotice("به سبد خرید اضافه شد.");
        } catch (e) {
          setNotice(
            e instanceof Error ? e.message : "ذخیره سبد در مرورگر ممکن نشد.",
          );
        }
      }}
    >
      <div className="store-cta">
        <label>
          تعداد{" "}
          <input
            aria-label="تعداد خرید"
            type="number"
            min="1"
            max={Math.min(stock, 100)}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            required
          />
        </label>
        <button className="commerce-button" disabled={stock === 0}>
          {stock ? "افزودن به سبد خرید" : "ناموجود"}
        </button>
        <a href="/cart">مشاهده سبد ←</a>
      </div>
      {notice && <p role="status">{notice}</p>}
    </form></Localized>
  );
}
