import { describe, expect, it } from "vitest";
import { analyzeDisfluencies } from "../../src/pipeline/disfluencyAnalysis";

describe("analyzeDisfluencies", () => {
  it("counts conservative filler terms case-insensitively", () => {
    const report = analyzeDisfluencies("Um, first you open it. Uh, then you know check the settings.");
    expect(report.fillerTotal).toBe(3);
    expect(report.fillerHits).toEqual([
      { term: "um", count: 1 },
      { term: "uh", count: 1 },
      { term: "you know", count: 1 }
    ]);
  });

  it("uses editable filler terms", () => {
    const report = analyzeDisfluencies("Basically basically start here.", ["basically"]);
    expect(report.fillerTotal).toBe(2);
    expect(report.fillerHits).toEqual([{ term: "basically", count: 2 }]);
  });

  it("counts repeated adjacent words separately from filler words", () => {
    const report = analyzeDisfluencies("Open the the panel and save save it.");
    expect(report.repeatedWordTotal).toBe(2);
    expect(report.repeatedWordHits).toEqual([
      { word: "the", count: 1 },
      { word: "save", count: 1 }
    ]);
  });

  it("detects simple false-start markers", () => {
    const report = analyzeDisfluencies("Open the admin screen - no, open the settings screen.");
    expect(report.falseStartCount).toBe(1);
  });
});
