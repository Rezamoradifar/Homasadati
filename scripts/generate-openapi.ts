import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  binaryRulesSchema,
  simulationSchema,
} from "../src/platform/network-rules-model";
import {
  loyaltyPolicySchema,
  loyaltyLevelSchema,
} from "../src/platform/loyalty-model";
import {
  accessRoleSchema,
  accessAssignmentSchema,
} from "../src/platform/access-model";
import {
  merchantContractSchema,
  merchantProductSchema,
  merchantPaymentSchema,
  merchantFulfillmentSchema,
} from "../src/platform/merchant-model";
import {
  merchantSchema,
  pointsAdjustmentSchema,
  rewardSchema,
  redeemSchema,
  redemptionReviewSchema,
} from "../src/platform/club-model";
import {
  productSchema,
  policySchema,
  id,
  text,
} from "../src/platform/validation";
// The API retains all Zod refinements. This file describes structural constraints;
// authorization, accounting and database invariants are enforced by the handlers.
function schema(input: z.ZodTypeAny): Record<string, unknown> {
  const d = input._def;
  if (input instanceof z.ZodEffects) return schema(d.schema);
  if (input instanceof z.ZodOptional) return schema(d.innerType);
  if (input instanceof z.ZodNullable)
    return { ...schema(d.innerType), nullable: true };
  if (input instanceof z.ZodDefault)
    return { ...schema(d.innerType), default: d.defaultValue() };
  if (input instanceof z.ZodObject) {
    const shape = input.shape;
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(shape).map(([k, v]) => [k, schema(v as z.ZodTypeAny)]),
      ),
      required: Object.entries(shape)
        .filter(([, v]) => !(v as z.ZodTypeAny).isOptional())
        .map(([k]) => k),
      additionalProperties: d.unknownKeys !== "strict",
    };
  }
  if (input instanceof z.ZodArray)
    return {
      type: "array",
      items: schema(d.type),
      ...(d.minLength ? { minItems: d.minLength.value } : {}),
      ...(d.maxLength ? { maxItems: d.maxLength.value } : {}),
    };
  if (input instanceof z.ZodEnum) return { type: "string", enum: d.values };
  if (input instanceof z.ZodLiteral)
    return { type: typeof d.value, enum: [d.value] };
  if (input instanceof z.ZodUnion) return { anyOf: d.options.map(schema) };
  if (input instanceof z.ZodBoolean) return { type: "boolean" };
  if (input instanceof z.ZodNumber) {
    const checks = d.checks || [];
    return {
      type: checks.some((c: { kind: string }) => c.kind === "int")
        ? "integer"
        : "number",
      ...Object.fromEntries(
        checks
          .filter((c: { kind: string }) => ["min", "max"].includes(c.kind))
          .map((c: { kind: string; value: number }) => [
            c.kind === "min" ? "minimum" : "maximum",
            c.value,
          ]),
      ),
    };
  }
  if (input instanceof z.ZodString) {
    const out: Record<string, unknown> = { type: "string" };
    for (const c of d.checks || []) {
      if (c.kind === "min") out.minLength = c.value;
      if (c.kind === "max") out.maxLength = c.value;
      if (c.kind === "uuid") out.format = "uuid";
      if (c.kind === "email") out.format = "email";
      if (c.kind === "url") out.format = "uri";
      if (c.kind === "regex") out.pattern = c.regex.source;
    }
    return out;
  }
  return {};
}
const components: Record<string, z.ZodTypeAny> = {
  BinaryRulesUpdate: z
    .object({ rules: binaryRulesSchema, reason: text })
    .strict(),
  BinarySimulation: simulationSchema,
  LoyaltyPolicyUpdate: z
    .object({ policy: loyaltyPolicySchema, reason: text })
    .strict(),
  LoyaltyLevel: loyaltyLevelSchema,
  AccessRole: accessRoleSchema,
  AccessAssignment: accessAssignmentSchema,
  MerchantContract: merchantContractSchema,
  MerchantProduct: merchantProductSchema,
  MerchantPayment: merchantPaymentSchema,
  MerchantFulfillment: merchantFulfillmentSchema,
  Merchant: merchantSchema,
  PointsAdjustment: pointsAdjustmentSchema,
  Reward: rewardSchema,
  RewardRedemption: redeemSchema,
  RedemptionReview: redemptionReviewSchema,
  CancelRedemption: z.object({ id, reason: text }).strict(),
  Product: productSchema,
  CommissionPolicy: z.object({ policy: policySchema, reason: text }),
  Notification: z
    .object({
      userIds: z.array(id).min(1).max(100),
      title: text,
      body: z.string().min(1).max(4000),
      reason: text,
      idempotencyKey: id,
    })
    .strict(),
};
const paths: Record<string, any> = {};
function endpoint(
  path: string,
  methods: string[],
  description: string,
  body?: string,
  isPublic = false,
) {
  paths["/api/platform/" + path] = Object.fromEntries(
    methods.map((method) => [
      method,
      {
        summary: description,
        security: isPublic ? [] : [{ session: [] }],
        ...(method === "get"
          ? {
              parameters: [
                {
                  in: "query",
                  name: "page",
                  schema: {
                    type: "integer",
                    minimum: 1,
                    maximum: 100000,
                    default: 1,
                  },
                },
              ],
            }
          : {
              parameters: [
                {
                  in: "header",
                  name: "Origin",
                  required: true,
                  schema: { type: "string", format: "uri" },
                },
              ],
              ...(body
                ? {
                    requestBody: {
                      required: true,
                      content: {
                        "application/json": {
                          schema: { $ref: "#/components/schemas/" + body },
                        },
                      },
                    },
                  }
                : {}),
            }),
        responses: {
          [path === "loyalty/redeem" && method === "post" ? "201" : "200"]: {
            description:
              "Successful response; lists use rows, page and hasMore unless stated otherwise.",
          },
          "400": { description: "Input validation failed" },
          "401": { description: "Valid active session required" },
          "403": { description: "Origin, ownership or permission denied" },
          "404": { description: "Resource not found" },
          "409": {
            description:
              "Conflict, insufficient balance, idempotency mismatch or invalid state",
          },
          "429": { description: "Rate limit exceeded" },
        },
      },
    ]),
  );
}
endpoint(
  "club",
  ["get"],
  "Public active earning policy, reward catalogue and loyalty levels",
  undefined,
  true,
);
endpoint(
  "merchants",
  ["get"],
  "Public active merchants; query q searches name, city and category",
  undefined,
  true,
);
endpoint(
  "auth/refresh",
  ["post"],
  "Rotate the current cookie session; old token is invalidated",
);
endpoint(
  "binary",
  ["get"],
  "Own placement tree, current eligible volumes and historical matches",
);
endpoint(
  "loyalty",
  ["get"],
  "Own spendable points, debt, pending accruals, tier, expiries and reward requests",
);
endpoint(
  "loyalty/redeem",
  ["post"],
  "Atomically reserve a reward and debit points",
  "RewardRedemption",
);
endpoint(
  "loyalty/cancel",
  ["post"],
  "Cancel own unfulfilled reward; original expiry is preserved",
  "CancelRedemption",
);
endpoint(
  "merchant",
  ["get"],
  "Own contracted merchants, order fulfilment, products and settlement ledger",
);
endpoint(
  "merchant/orders",
  ["post"],
  "Fulfil an order belonging to the signed-in merchant",
  "MerchantFulfillment",
);
for (const [path, body, summary] of [
  [
    "binary-rules",
    "BinaryRulesUpdate",
    "Binary rules for new orders; read/write binary-rules permission",
  ],
  [
    "loyalty-policy",
    "LoyaltyPolicyUpdate",
    "Purchase points earning policy; new orders only",
  ],
  [
    "loyalty-levels",
    "LoyaltyLevel",
    "Manage lifetime net-purchase points tiers",
  ],
  [
    "access",
    "AccessRole",
    "Define additive permission roles; built-in superadmin only",
  ],
  [
    "merchant-operations",
    "MerchantContract",
    "Manage merchant contracts and account ownership",
  ],
  [
    "merchant-settlements",
    "MerchantPayment",
    "Balances, ledger and external bank payment recording; does not send bank funds",
  ],
  ["merchants", "Merchant", "Manage public merchant profiles"],
  [
    "loyalty",
    "PointsAdjustment",
    "Audited, idempotent manual point corrections",
  ],
  ["rewards", "Reward", "Reward inventory and cost"],
  ["redemptions", "RedemptionReview", "Review reward delivery or cancellation"],
  [
    "notifications",
    "Notification",
    "Queue a targeted notification to up to 100 members",
  ],
  ["products", "Product", "Manage products and inventory"],
  [
    "policy",
    "CommissionPolicy",
    "Manage commission rates and per-order payout budget",
  ],
])
  endpoint("admin/" + path, ["get", "post"], summary, body);
endpoint(
  "admin/binary",
  ["get"],
  "Administrative binary report; optional user UUID query",
);
endpoint(
  "admin/binary-simulate",
  ["post"],
  "Pure calculation; no persistent accounting effects",
  "BinarySimulation",
);
endpoint(
  "admin/access/assign",
  ["post"],
  "Assign or revoke a custom role; built-in superadmin only",
  "AccessAssignment",
);
endpoint(
  "admin/merchant-operations/products",
  ["post"],
  "Link or unlink a merchant and product for future orders",
  "MerchantProduct",
);
for (const path of ["merchants", "admin/merchants"])
  paths["/api/platform/" + path].get.parameters.push({
    in: "query",
    name: "q",
    schema: { type: "string", maxLength: 200 },
  });
paths["/api/platform/admin/binary"].get.parameters.push({
  in: "query",
  name: "user",
  schema: { type: "string", format: "uuid" },
});
writeFileSync(
  "docs/openapi.json",
  JSON.stringify(
    {
      openapi: "3.0.3",
      info: {
        title: "Homay Saadat club and administration API",
        version: "2.0.0",
        description:
          "Contract for the club, binary, merchants and delegated administration modules. Other existing auth, catalogue, order and travel routes are indexed in API.md. All writes require same-origin JSON requests. JWT is not used: authentication is a rotated opaque HttpOnly cookie session.",
      },
      paths,
      components: {
        securitySchemes: {
          session: { type: "apiKey", in: "cookie", name: "homay_account" },
        },
        schemas: Object.fromEntries(
          Object.entries(components).map(([k, v]) => [k, schema(v)]),
        ),
      },
    },
    null,
    2,
  ) + "\n",
);
