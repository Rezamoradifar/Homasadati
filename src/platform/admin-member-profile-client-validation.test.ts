import { describe, expect, it } from "vitest";
import { validateClient } from "./client-validation";
import type { AdminMemberProfilePatch } from "./admin-member-profile-types";

const userId = "a5e41f31-e7ff-43c9-b405-3a84bca0b8bf";
const profilePath = "admin/users/" + userId + "/profile";

function profilePatch(): AdminMemberProfilePatch {
  return {
    expectedVersion: "a".repeat(64),
    personal: {
      name: "Mina Ahmadi", firstName: "Mina", lastName: "Ahmadi",
      email: "mina@example.test", phone: "+989121234567", nationalId: null,
      country: "Iran", city: "Tehran", occupation: "Designer", language: "en",
      interests: ["craft", "leather"],
      preferences: { email: true, sms: false, inApp: true },
    },
    addresses: {
      upsert: [
        {
          id: "561f51c3-53bd-4ae6-bbe7-d37f81c9cefb", label: "Home",
          country: "Iran", city: "Tehran", postalCode: "1234567890",
          address: "Valiasr Street, No. 12\nUnit 3",
        },
        {
          label: "Office", country: "Iran", city: "Shiraz", postalCode: "9876543210",
          address: "Office Avenue, No. 42",
        },
      ],
      deleteIds: ["a99801ac-47d7-4de3-9591-02beb3487e77"],
    },
    reason: "Correct profile after company review",
  };
}

describe("browser validation for the administrator member-profile endpoint", () => {
  it("preserves the complete profile and explicit address edits through the dedicated PATCH route", () => {
    const input = profilePatch();
    const before = structuredClone(input);
    const result = validateClient(profilePath, "PATCH", input);

    expect(result).toEqual(before);
    expect(input).toEqual(before);
    expect(result).not.toHaveProperty("role");
    expect(result).not.toHaveProperty("blocked");
  });

  it("uses profile normalization even when the endpoint includes a query string", () => {
    const input = profilePatch();
    input.personal.email = "  MINA@EXAMPLE.TEST  ";
    const result = validateClient(profilePath + "?source=company", "PATCH", input) as AdminMemberProfilePatch;

    expect(result.personal.email).toBe("mina@example.test");
    expect(result.addresses).toEqual(input.addresses);
    expect(result.expectedVersion).toBe(input.expectedVersion);
    expect(input.personal.email).toBe("  MINA@EXAMPLE.TEST  ");
  });

  it("does not accept the generic user-role update payload at the profile endpoint", () => {
    expect(() => validateClient(profilePath, "PATCH", {
      id: userId, role: "superadmin", blocked: false, reason: "Role update",
    })).toThrow();
  });

  it("rejects top-level role mass assignment instead of stripping it in the generic user validator", () => {
    expect(() => validateClient(profilePath, "PATCH", {
      ...profilePatch(), role: "superadmin",
    })).toThrow();
  });

  it("rejects an address-owner field supplied through the profile PATCH route", () => {
    const input = profilePatch();
    const payload = {
      ...input,
      addresses: {
        ...input.addresses,
        upsert: input.addresses.upsert.map(address => ({ ...address, user_id: userId })),
      },
    };
    expect(() => validateClient(profilePath, "PATCH", payload)).toThrow();
  });

  it.each(["not-a-uuid", userId + "%2Fother"])("rejects an invalid target UUID in the profile route: %s", target => {
    expect(() => validateClient("admin/users/" + target + "/profile", "PATCH", profilePatch())).toThrow();
  });

  it("keeps the existing administrator role/status route separate from profile edits", () => {
    const input = { id: userId, role: "support", blocked: false, reason: "Company access review" };
    expect(validateClient("admin/users", "PATCH", input)).toEqual(input);
  });
});
