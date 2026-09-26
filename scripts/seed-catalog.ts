// Adds the starter catalogue in src/platform/default-catalog.json.
//   node --import tsx scripts/seed-catalog.ts            → adds missing products as drafts
//   node --import tsx scripts/seed-catalog.ts --publish  → also publishes the starter products
//   node --import tsx scripts/seed-catalog.ts --remove   → takes the starter products off the shop:
//     deletes those never ordered and never edited by staff; unpublishes the rest
// Products are matched by SKU: an existing product (even one the admin has
// edited) is never overwritten or duplicated. Every write is audited.
import { randomUUID } from "node:crypto";
import catalog from "../src/platform/default-catalog.json";
import { atomic, now, one, platformDb, run } from "../src/platform/schema";
import { audit } from "../src/platform/security";
import { productSchema } from "../src/platform/validation";

type Vertical = keyof typeof catalog.defaults;
const publish = process.argv.includes("--publish");
const remove = process.argv.includes("--remove");

/** Starter products leave the shop. One with orders, subscriptions or travel
 * requests, or one staff have edited (e.g. given a real photo), is only
 * unpublished so no record or work is lost; the rest are deleted. */
function removeStarters(actor: string) {
  let deleted = 0,
    hidden = 0;
  for (const item of catalog.products) {
    const found = one("SELECT product_id FROM p_product_details WHERE sku=?", item.sku);
    if (!found) continue;
    const id = found.product_id;
    const product = one("SELECT * FROM p_products WHERE id=?", id);
    if (!product) continue;
    const used = ["p_orders", "p_subscriptions", "p_travel_requests"].some((t) =>
      one(`SELECT 1 FROM ${t} WHERE product_id=? LIMIT 1`, id),
    );
    const edited = one(
      "SELECT 1 FROM p_audit WHERE entity_id=? AND action='product.save' AND reason<>'starter catalogue' LIMIT 1",
      id,
    );
    atomic(() => {
      if (used || edited) {
        if (product.published) {
          run("UPDATE p_products SET published=0,updated_at=? WHERE id=?", now(), id);
          audit(actor, "product.unpublish", id, { published: 1 }, { published: 0 }, "starter catalogue removed");
          hidden++;
        }
        return;
      }
      run("DELETE FROM p_wishlist WHERE product_id=?", id);
      run("DELETE FROM p_product_merchants WHERE product_id=?", id);
      run("DELETE FROM p_product_details WHERE product_id=?", id);
      run("DELETE FROM p_products WHERE id=?", id);
      audit(actor, "product.delete", id, { title: product.title, sku: item.sku }, null, "starter catalogue removed");
      deleted++;
    });
  }
  console.log(`${deleted} starter product(s) deleted, ${hidden} kept but unpublished (edited or already ordered).`);
}

function main() {
  platformDb();
  const actor = one("SELECT id FROM p_users WHERE role='superadmin' ORDER BY created_at LIMIT 1");
  if (!actor) throw new Error("Create the superadmin account first (npm run platform:setup).");
  if (remove) return removeStarters(actor.id);
  let added = 0,
    published = 0;
  for (const item of catalog.products) {
    const v = item.vertical as Vertical;
    const existing = one("SELECT product_id FROM p_product_details WHERE sku=?", item.sku);
    if (existing) {
      if (publish && one("SELECT id FROM p_products WHERE id=? AND published=0", existing.product_id)) {
        run("UPDATE p_products SET published=1,updated_at=? WHERE id=?", now(), existing.product_id);
        audit(actor.id, "product.publish", existing.product_id, { published: 0 }, { published: 1 }, "starter catalogue");
        published++;
      }
      continue;
    }
    const d = productSchema.parse({
      title: item.title,
      description: item.description,
      vertical: v,
      subtype: item.subtype,
      price: item.price,
      stock: "stock" in item ? item.stock : catalog.defaults[v].stock,
      images: "images" in item ? item.images : [],
      taxonomy: [],
      published: publish,
      duration_days: "duration_days" in item ? item.duration_days : catalog.defaults[v].duration_days,
      cancel_hours: catalog.defaults[v].cancel_hours,
      details: {
        sku: item.sku,
        titleEn: item.titleEn,
        descriptionEn: item.descriptionEn,
        warranty: catalog.warranty[v === "leather" ? "leather" : v] || "",
        shippingNote: v === "craft" || v === "leather" ? catalog.shipping.craft : v === "beauty" ? catalog.shipping.beauty : "",
        ...item.details,
      },
    });
    const id = randomUUID();
    atomic(() => {
      run(
        "INSERT INTO p_products VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id, d.title, d.description, d.vertical, d.subtype, d.price, d.stock,
        JSON.stringify(d.images), "[]", Number(d.published), d.duration_days, d.cancel_hours, now(), now(),
      );
      run(
        "INSERT INTO p_product_details VALUES(?,?,?,?,?)",
        id, d.details!.sku || null, d.details!.family, JSON.stringify(d.details), now(),
      );
      audit(actor.id, "product.save", id, null, d, "starter catalogue");
    });
    added++;
    if (publish) published++;
  }
  console.log(`${added} product(s) added${publish ? `, ${published} published` : " as drafts"}; ${catalog.products.length - added} already present.`);
}

main();
