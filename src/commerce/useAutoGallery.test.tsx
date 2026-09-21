import { useRef } from "react";
import {
  render,
  act,
  fireEvent,
  screen,
  cleanup,
} from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { useAutoGallery } from "./useAutoGallery";
let intersect: (entries: any[]) => void;
function fixture(reduced = false) {
  vi.useFakeTimers();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: any) {
        intersect = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.mocked(window.matchMedia).mockImplementation(
    () =>
      ({
        matches: reduced,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as any,
  );
}
function Gallery({ advance }: { advance: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const auto = useAutoGallery(ref, advance, 1000);
  return (
    <div ref={ref}>
      <button onClick={auto.toggle}>toggle</button>
      <button onClick={auto.pause}>pause</button>
    </div>
  );
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("advances only in view and stops after user pause or tab hiding", () => {
  fixture();
  const advance = vi.fn();
  render(<Gallery advance={advance} />);
  act(() => vi.advanceTimersByTime(2000));
  expect(advance).not.toHaveBeenCalled();
  act(() => intersect([{ isIntersecting: true }]));
  act(() => vi.advanceTimersByTime(1000));
  expect(advance).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("pause"));
  act(() => vi.advanceTimersByTime(2000));
  expect(advance).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("toggle"));
  act(() => intersect([{ isIntersecting: false }]));
  act(() => vi.advanceTimersByTime(2000));
  expect(advance).toHaveBeenCalledTimes(1);
});
it("does not start autoplay when reduced motion is requested", () => {
  fixture(true);
  const advance = vi.fn();
  render(<Gallery advance={advance} />);
  act(() => intersect([{ isIntersecting: true }]));
  act(() => vi.advanceTimersByTime(5000));
  expect(advance).not.toHaveBeenCalled();
});
