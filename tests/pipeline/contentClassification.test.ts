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

  it("parks placeholder step chatter without concrete actions", () => {
    const focus = classifyTranscript(
      "I'm just kind of talking to try to figure out if this thing is working remotely and then we might need to do point step one and then continue with step two."
    );

    expect(focus.procedure).toEqual([]);
    expect(focus.tangents[0].reason).toBe("Mentions placeholder steps without concrete actions.");
  });
});
