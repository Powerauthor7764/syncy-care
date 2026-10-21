import { describe, expect, it } from "vitest";
import { answer, classify } from "../src/core/service.js";

describe("safety classifier", () => {
  it("blocks medication decisions", () => expect(classify("Should I stop taking my medication?")).toBe("RED"));
  it("marks chart rationale questions yellow", () => expect(classify("Why did my medication change?")).toBe("YELLOW"));
  it("allows schedule questions", () => expect(classify("What's happening today?")).toBe("GREEN"));
  it("queues red requests", () => expect(answer("general", "maria", "Can I double my dose?").queued).toBe(true));
});
