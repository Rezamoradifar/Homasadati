import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaInput } from "./MediaInput";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("content image upload", () => {
  it("replaces the previous image with the uploaded image for a content entry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "/api/platform/media/00000000-0000-4000-8000-000000000000.webp" }) }));
    render(<MediaInput name="image" initial="https://example.com/old.png" single />);
    fireEvent.change(screen.getByLabelText("بارگذاری تصویر محتوا"), { target: { files: [new File(["image"], "new.png", { type: "image/png" })] } });
    await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("/api/platform/media/00000000-0000-4000-8000-000000000000.webp"));
    expect(screen.queryByRole("button", { name: "اصلی شود" })).toBeNull();
  });
});
