import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Form, Stat, Table } from "./Widgets";
import { ClubAccountCard } from "./ClubAccountCard";
afterEach(cleanup);
it("shows and edits stored toman in rial, returning the exact original API unit", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(
    <Form
      fields={[
        {
          name: "amount",
          label: "مبلغ (ریال)",
          type: "number",
          currency: "toman",
          min: 100,
          max: 1000,
        },
        { name: "count", label: "تعداد", type: "number", min: 1 },
      ]}
      initial={{ amount: 125, count: 7 }}
      onSubmit={submit}
    />,
  );
  const amount = screen.getByLabelText("مبلغ (ریال)") as HTMLInputElement;
  expect(amount.value).toBe("1250");
  expect(amount.min).toBe("1000");
  expect(amount.max).toBe("10000");
  expect(amount.step).toBe("10");
  fireEvent.change(amount, { target: { value: "1261" } });
  expect(amount.validity.stepMismatch).toBe(true);
  fireEvent.change(amount, { target: { value: "1260" } });
  fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({ amount: 126, count: 7 }),
  );
});
it("keeps counts, negative ledger values and sales mission targets distinct", () => {
  render(
    <>
      <Stat label="پول" value={125} />
      <Stat label="تعداد" value={7} unit="عضو" />
      <Table
        rows={[
          {
            id: "one",
            delta: -125,
            count: 7,
            target: 200,
            metric: "personal_sales",
          },
          { id: "two", delta: 0, count: 2, target: 3, metric: "referrals" },
        ]}
        columns={[
          ["delta", "تغییر", "money"],
          ["count", "تعداد", "number"],
          ["target", "هدف", "metric"],
        ]}
      />
    </>,
  );
  const rows = within(screen.getByRole("table")).getAllByRole("row");
  expect(
    within(rows[1])
      .getAllByRole("cell")
      .map((n) => n.textContent),
  ).toEqual([(-1250).toLocaleString("fa-IR") + " ریال", "۷", "۲٬۰۰۰ ریال"]);
  expect(within(rows[2]).getAllByRole("cell")[2].textContent).toBe("۳");
});
it("changes mission target units with the metric, clearing the incompatible input", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(
    <Form
      initial={{ metric: "personal_sales", target: 100 }}
      fields={[
        {
          name: "metric",
          label: "معیار",
          type: "select",
          options: [
            ["personal_sales", "فروش"],
            ["referrals", "دعوت"],
          ],
        },
        {
          name: "target",
          label: "هدف",
          type: "number",
          currencyFor: {
            field: "metric",
            values: ["personal_sales", "group_sales"],
          },
          min: 1,
        },
      ]}
      onSubmit={submit}
    />,
  );
  expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe(
    "1000",
  );
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "referrals" },
  });
  expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("");
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith({ metric: "referrals", target: 3 }),
  );
});
it("keeps seven positions numbered 1–7 while multiplying only balances", () => {
  render(
    <ClubAccountCard
      status={{
        desks: 3,
        level: 3,
        live: true,
        totalPurchase: 30_000_000,
        weeklyCapToman: 45_000_000,
      }}
      available={125}
    />,
  );
  expect(screen.getByText("۳ جایگاه فعال از ۷")).toBeTruthy();
  expect(screen.getByText("جایگاه ۷")).toBeTruthy();
  expect(screen.queryByText("جایگاه ۷۰")).toBeNull();
  expect(screen.getByText("۱٬۲۵۰")).toBeTruthy();
});
