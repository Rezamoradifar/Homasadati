import { randomUUID } from "node:crypto";
import { sevenLevelCards } from "./card-levels";
import { productSchema } from "./validation";
import { atomic, now, one, run } from "./schema";
import { audit } from "./security";
import { travelCardArtwork } from "./travel-card-art";

/** The displayed seven-card minimums are initial sale prices.
 * Made-to-order physical cards do not consume future tour seats.
 * Existing SKUs, including manual pricing/unpublishing, are preserved. */
export const travelCardSku = (level: number) => "HN-TR-CARD-" + String(level).padStart(2, "0");

export function seedTravelCardProducts(actor: string) {
  return atomic(() => {
    const stats = { added: 0, existing: 0 };
    for (const tier of sevenLevelCards) {
      const sku = travelCardSku(tier.level);
      const existing = one(
        "SELECT p.id,p.images,p.vertical,p.subtype FROM p_product_details d JOIN p_products p ON p.id=d.product_id WHERE d.sku=?", sku
      );
      if (existing) {
        stats.existing++;
        // Older seeded cards had no images. Add artwork only to untouched,
        // image-less official card SKUs; never overwrite staff selections.
        const seedReason = "ثبت اولیه کارت‌های قابل خرید طبق مبالغ هفت سطح؛ قیمت و وضعیت دستی مدیریت حفظ می‌شود";
        const edited = one(
          "SELECT id FROM p_audit WHERE entity_id=? AND action='product.save' AND reason<>? LIMIT 1",
          existing.id, seedReason
        );
        if (existing.vertical === "tourism" && existing.subtype === "travel_card" &&
            existing.images === "[]" && !edited) {
          const at = now();
          if (run(
            "UPDATE p_products SET images=?,updated_at=? WHERE id=? AND images='[]'",
            JSON.stringify([travelCardArtwork[tier.level]]), at, existing.id
          ).changes) {
            audit(actor,"product.artwork.seed",existing.id,{images:[]},
              {images:[travelCardArtwork[tier.level]]},
              "افزودن عکس به کارت موجود بدون تغییر قیمت، موجودی یا وضعیت انتشار");
          }
        }
        continue;
      }
      const product = productSchema.parse({
        title: "کارت گردشگری " + tier.name,
        description: "کارت فیزیکی گردشگری هما نت. قیمت درج‌شده مربوط به خود کارت است؛ پس از تأیید پرداخت کارت به نام خریدار صادر و به نشانی ثبت‌شده ارسال می‌شود. مقصد، زمان، ظرفیت و جزئیات سفر بعداً با مجموعه هماهنگ می‌شود. خرید کارت به‌معنی رزرو تور نیست.",
        vertical: "tourism",
        subtype: "travel_card",
        price: tier.minToman,
        stock: 0,
        images: [travelCardArtwork[tier.level]],
        taxonomy: [],
        published: true,
        duration_days: 365,
        cancel_hours: 24,
        details: {
          sku,
          family: "tourism-cards",
          titleEn: tier.english + " travel card",
          descriptionEn: "Physical travel card; destination and date arranged separately after verified payment and shipment. Buying the card is not a tour reservation.",
          brand: "هما نت",
          vatStatus: "review",
          shippingNote: "صدور کارت پس از تأیید پرداخت؛ ارسال به نشانی ثبت‌شده. برنامه سفر بعداً انتخاب می‌شود.",
          features: "کارت فیزیکی با شناسه اختصاصی\nپیگیری سفارش و ارسال\nانتخاب سفر پس از دریافت کارت",
        },
      });
      const id = randomUUID(), at = now();
      run(
        "INSERT INTO p_products(id,title,description,vertical,subtype,price,stock,images,taxonomy,published,duration_days,cancel_hours,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id, product.title, product.description, product.vertical, product.subtype,
        product.price, product.stock, JSON.stringify(product.images),
        JSON.stringify(product.taxonomy), Number(product.published),
        product.duration_days, product.cancel_hours, at, at,
      );
      run(
        "INSERT INTO p_product_details(product_id,sku,family,details,updated_at) VALUES(?,?,?,?,?)",
        id, sku, product.details!.family, JSON.stringify(product.details), at,
      );
      audit(actor, "product.save", id, null,
        { sku, title: product.title, price: product.price, subtype: "travel_card" },
        "ثبت اولیه کارت‌های قابل خرید طبق مبالغ هفت سطح؛ قیمت و وضعیت دستی مدیریت حفظ می‌شود");
      stats.added++;
    }
    return stats;
  });
}
