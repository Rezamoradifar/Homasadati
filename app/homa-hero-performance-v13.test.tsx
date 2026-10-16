import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useHeroPerformance } from "../src/components/media/useHeroPerformance";

let emitVisibility: ((visible: boolean) => void) | null = null;
let queuedFrames: FrameRequestCallback[] = [];

function Harness() {
  const hero = useHeroPerformance();
  return <section data-testid="hero" ref={hero.heroRef}
    onPointerMove={hero.onPointerMove} onPointerLeave={hero.onPointerLeave} />;
}

beforeEach(() => {
  emitVisibility = null;
  queuedFrames = [];
  class ObserverFake {
    constructor(callback: IntersectionObserverCallback) {
      emitVisibility = (visible: boolean) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", ObserverFake);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("homepage visual performance in a browser", () => {
  it("starts visible, pauses offscreen and resumes without layout or DOM changes", () => {
    render(<Harness />);
    const hero = screen.getByTestId("hero");
    expect(hero.dataset.homaMotion).toBe("running");
    act(() => emitVisibility?.(false));
    expect(hero.dataset.homaMotion).toBe("paused");
    act(() => emitVisibility?.(true));
    expect(hero.dataset.homaMotion).toBe("running");
  });

  it("batches rapid pointer updates into one animation-frame write", () => {
    render(<Harness />);
    const hero = screen.getByTestId("hero");
    hero.getBoundingClientRect = () => ({left:0,top:0,right:200,bottom:100,width:200,height:100,x:0,y:0,toJSON() {return {};}});
    for (const x of [80,100,120]) {
      const move = new Event("pointermove", {bubbles: true});
      Object.assign(move, {pointerType:"mouse",clientX:x,clientY:50});
      fireEvent(hero, move);
    }
    expect(queuedFrames).toHaveLength(1);
    act(() => {queuedFrames[0](16);});
    expect(hero.style.getPropertyValue("--homa-tilt-y")).toBe("0.80deg");
    fireEvent.pointerLeave(hero);
    expect(hero.style.getPropertyValue("--homa-tilt-y")).toBe("");
  });

  it("honors the operating system reduced-motion preference", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches:true,addEventListener() {},removeEventListener() {}
    }));
    render(<Harness />);
    expect(screen.getByTestId("hero").dataset.homaMotion).toBe("paused");
  });
});
