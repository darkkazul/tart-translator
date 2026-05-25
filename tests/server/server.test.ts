import { describe, expect, it } from "vitest";
import { handleProcessTranscriptBody, processTranscriptBody } from "../../src/server/handlers";
import { handleAudioUpload } from "../../src/server/handlers";
import type { AudioUploadResponse, ProcessTranscriptResponse } from "../../src/shared/types";

async function postJson(path: string, body: unknown) {
  if (path !== "/api/process-transcript") throw new Error(`Unsupported test path: ${path}`);
  const result = await handleProcessTranscriptBody(body);
  return { status: result.status, json: result.body as ProcessTranscriptResponse | { error: string } };
}

describe("server", () => {
  it("processes transcript requests", async () => {
    const { status, json } = await postJson("/api/process-transcript", {
      transcript: "Um, first open settings. Then click Save."
    });

    expect(status).toBe(200);
    expect("draft" in json && json.draft.steps).toEqual(["Open settings.", "Click Save."]);
  });

  it("returns 400 for too-short transcripts", async () => {
    const { status, json } = await postJson("/api/process-transcript", { transcript: "Um." });
    expect(status).toBe(400);
    expect("error" in json && json.error).toBe("Transcript is too short to process.");
  });

  it("reports live progress while processing transcripts", async () => {
    const progress: Array<{ stage: string; progress: number }> = [];
    const result = await processTranscriptBody(
      { transcript: "Um, first open settings. Then click Save." },
      (stage, value) => progress.push({ stage, progress: value })
    );

    expect(result.status).toBe(200);
    expect(progress.map((event) => event.stage)).toEqual([
      "Validating transcript",
      "Analyzing speech",
      "Finding procedure steps",
      "Choosing note engine",
      "Generating notes",
      "Finalizing notes"
    ]);
    expect(progress.map((event) => event.progress)).toEqual([8, 24, 42, 58, 76, 94]);
  });

  it("keeps audio upload in setup mode when Whisper is not configured", async () => {
    const result = await handleAudioUpload({
      originalname: "note.wav",
      path: "/tmp/note.wav"
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      fileName: "note.wav",
      status: "needs-transcription-setup",
      message: "Audio upload is ready, but local transcription is not configured yet. Paste a transcript to process now."
    });
  });

  it("transcribes configured audio uploads and processes the transcript", async () => {
    const result = await handleAudioUpload(
      {
        originalname: "note.wav",
        path: "/tmp/note.wav"
      },
      {
        isAvailable: async () => true,
        transcribe: async () => "Um, first open settings. Then click Save."
      }
    );

    const body = result.body as AudioUploadResponse;
    expect(result.status).toBe(200);
    expect(body).toMatchObject({
      fileName: "note.wav",
      status: "transcribed",
      transcript: "Um, first open settings. Then click Save."
    });
    expect(body.result?.draft.steps).toEqual(["Open settings.", "Click Save."]);
  });

  it("reports live progress while transcribing audio uploads", async () => {
    const progress: Array<{ stage: string; progress: number }> = [];
    const result = await handleAudioUpload(
      {
        originalname: "note.wav",
        path: "/tmp/note.wav"
      },
      {
        isAvailable: async () => true,
        transcribe: async () => "Um, first open settings. Then click Save."
      },
      (stage, value) => progress.push({ stage, progress: value })
    );

    expect(result.status).toBe(200);
    expect(progress.at(0)).toEqual({ stage: "Checking Whisper", progress: 12 });
    expect(progress.at(1)).toEqual({ stage: "Transcribing audio", progress: 36 });
    expect(progress.map((event) => event.stage)).toContain("Generating notes");
  });
});
