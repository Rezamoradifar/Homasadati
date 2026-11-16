import { loadEnvConfig } from "@next/env";
import { one, platformDb } from "../src/platform/schema";
import { seedTravelCardProducts } from "../src/platform/travel-card-catalog";

loadEnvConfig(process.cwd());
platformDb();
const admin = one("SELECT id FROM p_users WHERE role='superadmin' ORDER BY created_at LIMIT 1");
if (!admin) {
  console.error("No superadmin exists; run platform:setup before seeding tourism card products.");
  process.exitCode = 1;
} else {
  const result = seedTravelCardProducts(admin.id);
  console.log(JSON.stringify({ status: "ok", ...result, unchangedExistingProducts: true }));
}
