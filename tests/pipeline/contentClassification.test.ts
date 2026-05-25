import { describe, expect, it } from "vitest";
import { classifyTranscript } from "../../src/pipeline/contentClassification";

describe("classifyTranscript", () => {
  it("classifies procedural sentences", () => {
    const focus = classifyTranscript("First, open the admin page. Then click Save.");
    expect(focus.procedure.map((segment) => segment.text)).toEqual([
      "First, open the admin page.",
      "Then click Save."
    ]);
  });

  it("parks maybe-useful tangents", () => {
    const focus = classifyTranscript("This reminds me of the old billing tool. Then export the report.");
    expect(focus.tangents[0].text).toBe("This reminds me of the old billing tool.");
    expect(focus.procedure[0].text).toBe("Then export the report.");
  });

  it("separates obvious noise", () => {
    const focus = classifyTranscript("Anyway. Then restart the worker.");
    expect(focus.noise[0].text).toBe("Anyway.");
    expect(focus.procedure[0].text).toBe("Then restart the worker.");
  });
});
