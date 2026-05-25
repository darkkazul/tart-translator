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

  it("splits punctuation-free run-on speech into separate procedure segments", () => {
    const focus = classifyTranscript("first you open the dashboard then go to shares then click export");

    expect(focus.procedure.map((segment) => segment.text)).toEqual([
      "first you open the dashboard",
      "then go to shares",
      "then click export"
    ]);
  });

  it("peels a mid-clause tangent off the actions instead of dropping the whole procedure", () => {
    const focus = classifyTranscript(
      "open the dashboard and by the way the old interface was different then go to shares and click export"
    );

    expect(focus.procedure.map((segment) => segment.text)).toContain("open the dashboard");
    expect(focus.procedure.some((segment) => /go to shares/i.test(segment.text))).toBe(true);
    expect(focus.procedure.some((segment) => /click export/i.test(segment.text))).toBe(true);
    expect(focus.tangents.some((segment) => /by the way/i.test(segment.text))).toBe(true);
  });

  it("classifies the expanded conversational action starters as procedures", () => {
    const focus = classifyTranscript("Navigate to the settings page. Upload the backup file.");

    expect(focus.procedure.map((segment) => segment.text)).toEqual([
      "Navigate to the settings page.",
      "Upload the backup file."
    ]);
    expect(focus.tangents).toEqual([]);
  });

  it("splits connector-free action chains into separate procedure segments", () => {
    const focus = classifyTranscript("open settings save the file run the script");

    expect(focus.procedure.map((segment) => segment.text)).toEqual([
      "open settings",
      "save the file",
      "run the script"
    ]);
  });

  it("splits before a new action but keeps an action word used as a button label", () => {
    const focus = classifyTranscript("open settings click save");

    expect(focus.procedure.map((segment) => segment.text)).toEqual(["open settings", "click save"]);
  });

  it("does not split an action word used as a noun modifier", () => {
    const focus = classifyTranscript("check the export settings save the file");

    expect(focus.procedure.map((segment) => segment.text)).toEqual([
      "check the export settings",
      "save the file"
    ]);
  });
});
