import { describe, expect, it } from "vitest";
import {
  ACCEPTED_AUDIO_EXTENSIONS,
  ACCEPTED_AUDIO_INPUT_ACCEPT,
  ACCEPTED_AUDIO_MIME_TYPES,
  AUDIO_LIMIT_BYTES,
  DEFAULT_FILLER_TERMS
} from "../../src/shared/defaults";

describe("defaults", () => {
  it("uses conservative filler terms", () => {
    expect(DEFAULT_FILLER_TERMS).toEqual(["um", "uh", "er", "ah", "hmm", "you know"]);
  });

  it("sets a 50MB audio limit", () => {
    expect(AUDIO_LIMIT_BYTES).toBe(50 * 1024 * 1024);
  });

  it("accepts formats verified against the local whisper.cpp binary", () => {
    expect(ACCEPTED_AUDIO_EXTENSIONS).toEqual([".wav", ".mp3", ".flac"]);
    expect(ACCEPTED_AUDIO_MIME_TYPES).toEqual(expect.arrayContaining(["audio/wav", "audio/mpeg", "audio/flac"]));
    expect(ACCEPTED_AUDIO_MIME_TYPES).not.toEqual(expect.arrayContaining(["audio/mp4", "audio/m4a", "audio/aac"]));
    expect(ACCEPTED_AUDIO_INPUT_ACCEPT).toContain(".wav");
    expect(ACCEPTED_AUDIO_INPUT_ACCEPT).not.toContain(".m4a");
  });
});
