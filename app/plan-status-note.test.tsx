import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PlanStatusNote from "./PlanStatusNote";
const state = vi.hoisted(() => ({
  data: null as null | { status: string },
  loading: true,
  error: "",
  retry: vi.fn(),
}));
vi.mock("../src/platform/Widgets", () => ({ useData: () => state }));
afterEach(() => {
  cleanup();
  Object.assign(state, { data: null, loading: true, error: "" });
  state.retry.mockClear();
});
it("never labels loading or failed requests as an inactive plan and offers retry", () => {
  const view = render(<PlanStatusNote fa />);
  expect(screen.getByText(/در حال دریافت وضعیت طرح/)).toBeTruthy();
  expect(screen.queryByText(/هنوز فعال نشده/)).toBeNull();
  Object.assign(state, {
    loading: false,
    error: "offline",
    data: { status: "live" },
  });
  view.rerender(<PlanStatusNote fa />);
  expect(screen.getByText(/وضعیت طرح دریافت نشد/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
  expect(state.retry).toHaveBeenCalledOnce();
});
it("uses only the server's confirmed live or draft state", () => {
  Object.assign(state, { loading: false, data: { status: "live" } });
  const view = render(<PlanStatusNote fa />);
  expect(screen.getByText(/طرح هفت کارت فعال است/)).toBeTruthy();
  state.data = { status: "draft" };
  view.rerender(<PlanStatusNote fa />);
  expect(screen.getByText(/تسویه طرح هنوز فعال نشده/)).toBeTruthy();
});
