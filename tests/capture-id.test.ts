import { describe, expect, it } from "vitest";
import { captureUuid } from "@/lib/capture";

describe("captureUuid", () => {
  it("turns a Shortcut's run id into a stable UUID per owner", () => {
    const a = captureUuid("owner-1", "20260914010522123-48213");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(captureUuid("owner-1", "20260914010522123-48213")).toBe(a);
    expect(captureUuid("owner-2", "20260914010522123-48213")).not.toBe(a);
  });
});
