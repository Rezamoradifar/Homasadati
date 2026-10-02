import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import SiteHeader from "./SiteHeader";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const nativeShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "showModal",
);
const nativeClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  "close",
);

beforeAll(() => {
  // jsdom has no top layer. Browser QA covers native focus trapping and Escape;
  // these methods let us verify React cleanup and the handoff between dialogs.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value() {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value() {
        this.removeAttribute("open");
      },
    },
  });
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const [method, descriptor] of [
    ["showModal", nativeShowModal],
    ["close", nativeClose],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(HTMLDialogElement.prototype, method, descriptor);
    } else {
      Reflect.deleteProperty(HTMLDialogElement.prototype, method);
    }
  }
});

function clickDialogAt(dialog: HTMLDialogElement, clientX: number, clientY: number) {
  // PointerEvent is absent in jsdom; MouseEvent supplies the coordinates to
  // React's pointer handler without patching browser globals.
  fireEvent(
    dialog,
    new MouseEvent("pointerdown", { bubbles: true, clientX, clientY }),
  );
  fireEvent.click(dialog, { clientX, clientY });
}

describe("shared public navigation", () => {
  it("restores scroll and focus on cancellation and closes only genuine backdrop clicks", () => {
    document.body.style.overflow = "auto";
    render(<SiteHeader home />);
    const trigger = screen.getByRole("button", { name: "باز کردن منو" });

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "بستن منو" }),
    );

    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(dialog.open).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 0, 400, 800),
    );
    clickDialogAt(dialog, 150, 100);
    expect(dialog.open).toBe(true);
    clickDialogAt(dialog, 20, 100);
    expect(dialog.open).toBe(false);
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(trigger);
  });

  it("finishes menu cleanup before tracking opens and leaves the next dialog focused", () => {
    document.body.style.overflow = "auto";
    let menu: HTMLDialogElement;
    let tracking: HTMLDialogElement;
    let trigger: HTMLElement;
    const onTrackRequest = vi.fn(() => {
      expect(menu.open).toBe(false);
      expect(document.body.style.overflow).toBe("auto");
      expect(document.activeElement).toBe(trigger);
      tracking.showModal();
      document.body.style.overflow = "hidden";
      within(tracking).getByRole("button").focus();
    });
    const { container } = render(
      <>
        <SiteHeader home onTrackRequest={onTrackRequest} />
        <dialog id="tracking-next" aria-label="Tracking request">
          <button type="button">Tracking action</button>
        </dialog>
      </>,
    );
    menu = container.querySelector<HTMLDialogElement>(".discovery-menu")!;
    tracking = container.querySelector<HTMLDialogElement>("#tracking-next")!;
    trigger = screen.getByRole("button", { name: "باز کردن منو" });
    fireEvent.click(trigger);
    fireEvent.click(within(menu).getByRole("button", { name: "پیگیری درخواست" }));

    // Browsers queue the close event; it may arrive after tracking has opened.
    fireEvent(menu, new Event("close"));
    expect(onTrackRequest).toHaveBeenCalledTimes(1);
    expect(tracking.open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(
      within(tracking).getByRole("button", { name: "Tracking action" }),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
