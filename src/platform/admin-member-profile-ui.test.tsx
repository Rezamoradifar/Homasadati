import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminMemberProfile from "./AdminMemberProfile";
import { PlatformApiError } from "./client";
import type { AdminMemberProfileData } from "./admin-member-profile-types";
import memberCopy from "./admin-member-copy.json";

const request = vi.hoisted(() => vi.fn());
vi.mock("./client", async original => ({ ...await original<typeof import("./client")>(), api: request }));
const copy = memberCopy.fa;
const memberId = "7f241b75-bc70-4abf-85ad-1cd0a4e190d5";
const addressId = "76907eaa-a790-4ae3-9588-8765d9901e01";
function fixture(id = memberId): AdminMemberProfileData {
  return {
    id, version: "a".repeat(64),
    personal: {
      name: "Maryam Sample", firstName: "Maryam", lastName: "Sample", email: "member@example.com", phone: "09121234567", nationalId: null,
      country: "Iran", city: "Isfahan", occupation: "Designer", language: "fa", interests: ["craft"], preferences: { email: true, sms: false, inApp: true },
    },
    addresses: [{ id: addressId, label: "Home", country: "Iran", city: "Isfahan", postalCode: "8170000000", address: "Full address\nApartment 2" }],
    membership: { role: "user", createdAt: "2026-11-01T08:00:00Z", lastSeen: "2026-11-07T08:00:00Z", blocked: false, referralCode: "member-code", contactVerifiedAt: "2026-11-01T08:00:00Z", detailsUpdatedAt: null, consent: { version: "terms-v1", acceptedAt: "2026-11-01T08:00:00Z" } },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => request.mockReset());
afterEach(cleanup);

describe("administrator member profile", () => {
  it("shows the legacy full name and requires both name fields before replacing it", async () => {
    const user = userEvent.setup();
    const legacy = fixture();
    legacy.personal.firstName = "";
    legacy.personal.lastName = "";
    request.mockResolvedValue(legacy);
    render(<AdminMemberProfile userId={memberId} />);
    const firstName = await screen.findByLabelText(copy.firstName, { exact: true });
    expect(screen.getByText("Maryam Sample")).toBeTruthy();
    await user.type(firstName, "Maryam");
    await user.type(screen.getByLabelText(copy.reason), "Correct name");
    await user.click(screen.getByRole("button", { name: copy.save }));
    expect(screen.getByRole("alert").textContent).toContain(copy.errors.legacy_name_incomplete);
    expect(request.mock.calls.filter(([, method]) => method === "PATCH")).toHaveLength(0);
    await user.type(screen.getByLabelText(copy.lastName, { exact: true }), "Sample");
    await user.click(screen.getByRole("button", { name: copy.save }));
    await waitFor(() => expect(request.mock.calls.filter(([, method]) => method === "PATCH")).toHaveLength(1));
  });

  it("loads every personal/contact field, preferences, address and readonly membership metadata", async () => {
    request.mockResolvedValue(fixture());
    render(<AdminMemberProfile userId={memberId} />);
    const firstName = await screen.findByLabelText(copy.firstName, { exact: true });
    expect((firstName as HTMLInputElement).value).toBe("Maryam");
    expect((screen.getByLabelText(copy.phone) as HTMLInputElement).value).toBe("09121234567");
    expect((screen.getByLabelText(copy.occupation) as HTMLInputElement).value).toBe("Designer");
    expect((screen.getByLabelText(copy.fullAddress) as HTMLTextAreaElement).value).toBe("Full address\nApartment 2");
    expect((screen.getByLabelText(copy.emailNotifications) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(copy.smsNotifications) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("terms-v1")).toBeTruthy();
    expect(screen.getByText("member-code")).toBeTruthy();
    expect(screen.queryByLabelText(/password|رمز عبور/i)).toBeNull();
    expect(request).toHaveBeenCalledWith(`admin/users/${memberId}/profile`);
  });

  it("requires a reason, then saves versioned personal edits and explicit address deletion/addition", async () => {
    const user = userEvent.setup();
    const updated = fixture();
    updated.personal.firstName = "Updated";
    request.mockImplementation(async (_path, method) => method === "PATCH" ? updated : fixture());
    const onChange = vi.fn();
    render(<AdminMemberProfile userId={memberId} onChange={onChange} />);
    await screen.findByLabelText(copy.firstName, { exact: true });
    await user.click(screen.getByRole("button", { name: copy.save }));
    expect(request.mock.calls.filter(([, method]) => method === "PATCH")).toHaveLength(0);
    await user.clear(screen.getByLabelText(copy.firstName, { exact: true }));
    await user.type(screen.getByLabelText(copy.firstName, { exact: true }), "Updated");
    await user.click(screen.getByRole("button", { name: copy.removeAddress + " ۱" }));
    await user.click(screen.getByRole("button", { name: copy.addAddress }));
    const address = within(screen.getByRole("group", { name: copy.address + " ۱" }));
    for (const [label, value] of [[copy.addressLabel, "Office"], [copy.country, "Iran"], [copy.city, "Tehran"], [copy.postalCode, "1130000000"], [copy.fullAddress, "Exact new address, floor 5"]]) {
      await user.type(address.getByLabelText(label, { exact: true }), value);
    }
    await user.type(screen.getByLabelText(copy.reason), "Confirmed with member");
    await user.click(screen.getByRole("button", { name: copy.save }));
    await screen.findByText(copy.saved);
    const call = request.mock.calls.find(([, method]) => method === "PATCH")!;
    expect(call[0]).toBe(`admin/users/${memberId}/profile`);
    expect(call[2]).toMatchObject({ expectedVersion: "a".repeat(64), personal: { firstName: "Updated", name: "Updated Sample" }, addresses: { deleteIds: [addressId], upsert: [{ label: "Office", city: "Tehran", address: "Exact new address, floor 5" }] }, reason: "Confirmed with member" });
    expect(call[2].addresses.upsert[0]).not.toHaveProperty("key");
    expect(call[2].addresses.upsert[0]).not.toHaveProperty("id");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("keeps corrections on a version conflict and reloads only when explicitly requested", async () => {
    const user = userEvent.setup();
    const latest = fixture(); latest.personal.firstName = "Latest";
    request.mockResolvedValueOnce(fixture()).mockRejectedValueOnce(new PlatformApiError("profile_changed", 409)).mockResolvedValueOnce(latest);
    render(<AdminMemberProfile userId={memberId} />);
    const firstName = await screen.findByLabelText(copy.firstName, { exact: true });
    await user.clear(firstName); await user.type(firstName, "Unsaved");
    await user.type(screen.getByLabelText(copy.reason), "Correction reason");
    await user.click(screen.getByRole("button", { name: copy.save }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining(copy.errors.profile_changed));
    expect((screen.getByLabelText(copy.firstName, { exact: true }) as HTMLInputElement).value).toBe("Unsaved");
    await user.click(screen.getByRole("button", { name: copy.retry }));
    await waitFor(() => expect((screen.getByLabelText(copy.firstName, { exact: true }) as HTMLInputElement).value).toBe("Latest"));
  });

  it("never shows an earlier member's late data after selection changes", async () => {
    const old = deferred<AdminMemberProfileData>();
    const next = fixture("another-member"); next.personal.firstName = "Another"; next.personal.email = "another@example.com";
    request.mockReturnValueOnce(old.promise).mockResolvedValueOnce(next);
    const view = render(<AdminMemberProfile userId={memberId} />);
    view.rerender(<AdminMemberProfile userId="another-member" />);
    await waitFor(() => expect((screen.getByLabelText(copy.firstName, { exact: true }) as HTMLInputElement).value).toBe("Another"));
    await act(async () => { old.resolve(fixture()); await old.promise; });
    expect(screen.queryByDisplayValue("member@example.com")).toBeNull();
    expect(screen.getByDisplayValue("another@example.com")).toBeTruthy();
  });

  it("blocks duplicate saves and ignores a completed save after a different member is selected", async () => {
    const save = deferred<AdminMemberProfileData>();
    const next = fixture("another-member"); next.personal.firstName = "Another";
    request.mockResolvedValueOnce(fixture()).mockReturnValueOnce(save.promise).mockResolvedValueOnce(next);
    const onChange = vi.fn();
    const view = render(<AdminMemberProfile userId={memberId} onChange={onChange} />);
    await screen.findByLabelText(copy.firstName, { exact: true });
    fireEvent.change(screen.getByLabelText(copy.reason), { target: { value: "Verified correction" } });
    const form = screen.getByRole("form", { name: copy.title });
    fireEvent.submit(form); fireEvent.submit(form);
    expect(request.mock.calls.filter(([, method]) => method === "PATCH")).toHaveLength(1);
    view.rerender(<AdminMemberProfile userId="another-member" onChange={onChange} />);
    await waitFor(() => expect((screen.getByLabelText(copy.firstName, { exact: true }) as HTMLInputElement).value).toBe("Another"));
    await act(async () => { save.resolve(fixture()); await save.promise; });
    expect(screen.queryByText(copy.saved)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText(copy.firstName, { exact: true }) as HTMLInputElement).value).toBe("Another");
  });
});
