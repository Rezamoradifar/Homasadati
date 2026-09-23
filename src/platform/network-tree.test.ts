// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { platformDb, run, now } from "./schema";
import { placementTree, searchTree } from "./network-tree";

const directory = mkdtempSync(join(tmpdir(), "homay-tree-"));
let product = "";
function member(name: string, parent: string | null, leg: string | null, sponsor = parent) {
  const id = randomUUID();
  run(
    "INSERT INTO p_users(id,name,password,referral_code,sponsor_id,parent_id,leg,created_at,last_seen,signup_ip) VALUES(?,?,?,?,?,?,?,?,?,?)",
    id, name, "unused", "code-" + name.toLowerCase(), sponsor, parent, leg, now(), now(), "test",
  );
  return id;
}
function order(user: string, amount: number, paid = true, refunded = false) {
  run(
    "INSERT INTO p_orders(id,user_id,product_id,title,vertical,quantity,unit_price,amount,status,payment_method,policy,expires_at,created_at,paid_at,refunded_at,idem_key) VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?)",
    randomUUID(), user, product, "t", "craft", amount, amount, refunded ? "refunded" : "processing", "wallet", "{}",
    now(), now(), paid ? now() : null, refunded ? now() : null, randomUUID(),
  );
}
beforeAll(() => {
  process.env.DATABASE_PATH = join(directory, "tree.sqlite");
  platformDb();
  product = randomUUID();
  run(
    "INSERT INTO p_products(id,vertical,subtype,title,description,price,stock,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    product, "craft", "item", "t", "d", 1000, 10, now(), now(),
  );
});
afterAll(() => {
  platformDb().close();
  rmSync(directory, { recursive: true, force: true });
});

it("counts members and paid volume per leg of the placement subtree", () => {
  const root = member("Root", null, null);
  const a = member("Ali", root, "left");
  const b = member("Bita", root, "right");
  const c = member("Cyrus", a, "left", root);
  const d = member("Dara", a, "right", a);
  order(a, 1000);
  order(c, 2000);
  order(d, 500, false); // unpaid: ignored
  order(d, 700, true, true); // refunded: ignored
  order(b, 4000);
  order(root, 300);
  const t = placementTree(root, root, 3).tree;
  expect(t.left).toMatchObject({ members: 3, volume: 3000 });
  expect(t.right).toMatchObject({ members: 1, volume: 4000 });
  expect(t.personalVolume).toBe(300);
  expect(t.children!.left!.name).toBe("Ali");
  expect(t.children!.left!.children!.left!.sponsoredByRoot).toBe(true);
  expect(t.children!.left!.children!.right!.active).toBe(false);
  expect(t.children!.right!.children).toEqual({ left: null, right: null });
  // A member can open their own downline, never an upline or a sibling leg.
  expect(placementTree(a, c, 2).path.map((p) => p.name)).toEqual(["Ali", "Cyrus"]);
  expect(() => placementTree(a, root, 2)).toThrow();
  expect(() => placementTree(a, b, 2)).toThrow();
  expect(searchTree(a, "cyr").map((r) => r.name)).toEqual(["Cyrus"]);
  expect(searchTree(a, "bita")).toEqual([]);
});
