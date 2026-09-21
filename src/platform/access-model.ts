import { z } from "zod";
import { id, text } from "./validation";
export const resourceRoles: Record<string, string[]> = {
  binary: ["finance"],
  merchants: ["content"],
  loyalty: ["finance"],
  rewards: ["finance"],
  redemptions: ["finance", "support"],
  dashboard: ["finance"],
  operations: ["finance"],
  "catalog-options": ["content"],
  products: ["content"],
  taxonomy: ["content"],
  content: ["content"],
  orders: ["support", "finance"],
  refunds: ["finance"],
  withdrawals: ["finance"],
  users: ["support"],
  network: [],
  commissions: ["finance"],
  policy: ["finance"],
  ranks: ["finance"],
  missions: ["content"],
  reports: ["finance"],
  settings: [],
  readiness: [],
  audit: [],
  flags: ["support"],
  "binary-rules": ["finance"],
  "binary-simulate": ["finance"],
  "loyalty-policy": ["finance"],
  "loyalty-levels": ["finance"],
  "merchant-operations": ["finance"],
  "merchant-settlements": ["finance"],
  notifications: ["support"],
  travel: ["support", "finance"],
  "travel-manage": ["finance"],
  media: ["content"],
};
// Credential configuration and access administration are reserved for the built-in owner role.
export const delegatedResources = Object.keys(resourceRoles).filter(
  (k) => !["settings", "readiness"].includes(k),
);
export const permissionOptions = delegatedResources.flatMap((r) => [
  r + ":read",
  r + ":write",
]);
export const accessRoleSchema = z
  .object({
    id: id.optional(),
    name: text,
    permissions: z
      .array(z.string().refine((p) => permissionOptions.includes(p)))
      .max(100),
    active: z.boolean(),
    reason: text,
  })
  .strict();
export const accessAssignmentSchema = z
  .object({ userId: id, roleId: id, assigned: z.boolean(), reason: text })
  .strict();
export function hasPermission(
  permissions: string[] | undefined,
  resource: string,
  write = false,
) {
  return (
    !!permissions &&
    (permissions.includes("*") ||
      permissions.includes(resource + (write ? ":write" : ":read")))
  );
}
export function defaultPermissions(role: string) {
  return role === "superadmin"
    ? ["*"]
    : Object.entries(resourceRoles)
        .filter(([, roles]) => roles.includes(role))
        .flatMap(([r]) => [r + ":read", r + ":write"]);
}
