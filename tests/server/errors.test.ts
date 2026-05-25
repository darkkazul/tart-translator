import { describe, expect, it } from "vitest";
import { formatServerError } from "../../src/server/errors";

describe("formatServerError", () => {
  it("returns json-safe errors for upload middleware failures", () => {
    expect(formatServerError(new Error("Unsupported audio format. Use WAV, MP3, or FLAC."))).toEqual({
      status: 400,
      body: { error: "Unsupported audio format. Use WAV, MP3, or FLAC." }
    });
  });
});
