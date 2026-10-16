import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomaAmbientMusic from "../src/components/media/HomaAmbientMusic";

function param() {
  return {
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
    cancelScheduledValues() {},
  };
}

class NodeMock {
  type = "sine";
  onended: (() => void) | null = null;
  gain = param();
  frequency = param();
  delayTime = { value: 0 };
  connect() { return this; }
  disconnect() {}
  start() {}
  stop() {}
}
class AudioMock {
  static created = 0;
  state = "running";
  currentTime = 10;
  destination = new NodeMock();
  constructor() { AudioMock.created += 1; }
  createGain() { return new NodeMock(); }
  createBiquadFilter() { return new NodeMock(); }
  createOscillator() { return new NodeMock(); }
  createDelay() { return new NodeMock(); }
  async resume() { this.state = "running"; }
  async suspend() { this.state = "suspended"; }
  async close() { this.state = "closed"; }
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  AudioMock.created = 0;
});

describe("HOMA original calm Persian-inspired audio control", () => {
  it("never creates an AudioContext or plays music before a visitor opts in", () => {
    vi.stubGlobal("AudioContext", AudioMock);
    render(<HomaAmbientMusic />);
    const toggle = screen.getByRole("button", { name: "پخش موسیقی آرام" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(AudioMock.created).toBe(0);
    expect(localStorage.getItem("homa-calm-music")).toBeNull();
  });

  it("plays at low volume only after explicit click, then pauses and stores opt-out", async () => {
    vi.stubGlobal("AudioContext", AudioMock);
    render(<HomaAmbientMusic />);
    fireEvent.click(screen.getByRole("button", { name: "پخش موسیقی آرام" }));
    await waitFor(() => expect(screen.getByRole("button",{name:"توقف موسیقی"}).getAttribute("aria-pressed")).toBe("true"));
    expect(AudioMock.created).toBe(1);
    expect(localStorage.getItem("homa-calm-music")).toBe("on");
    fireEvent.click(screen.getByRole("button", { name: "توقف موسیقی" }));
    expect(screen.getByRole("button", { name: "پخش موسیقی آرام" }).getAttribute("aria-pressed")).toBe("false");
    expect(localStorage.getItem("homa-calm-music")).toBe("off");
  });

  it("restores a previous opt-in on the next real interaction, never unprompted", async () => {
    localStorage.setItem("homa-calm-music","on");
    vi.stubGlobal("AudioContext", AudioMock);
    render(<HomaAmbientMusic />);
    expect(AudioMock.created).toBe(0);
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.getByRole("button", { name: "توقف موسیقی" }).getAttribute("aria-pressed")).toBe("true"));
    expect(AudioMock.created).toBe(1);
  });

  it("fails quietly when the browser has no sound API", async () => {
    vi.stubGlobal("AudioContext", undefined);
    render(<HomaAmbientMusic />);
    fireEvent.click(screen.getByRole("button", { name: "پخش موسیقی آرام" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "پخش موسیقی آرام" }).getAttribute("title")).toBe("پخش صدا در این مرورگر ممکن نیست"));
  });
});
