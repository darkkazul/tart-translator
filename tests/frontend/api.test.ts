import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getApiUrl,
  getRuntimeStatusRequest,
  streamAudioUploadRequest,
  streamProcessTranscriptRequest,
  uploadAudioRequest
} from "../../src/frontend/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getApiUrl", () => {
  it("uses same-origin API paths by default", () => {
    expect(getApiUrl("/api/health")).toBe("/api/health");
  });

  it("joins an explicit API base URL without double slashes", () => {
    expect(getApiUrl("/api/health", "http://127.0.0.1:8787/")).toBe("http://127.0.0.1:8787/api/health");
  });

  it("uploads audio files with multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        fileName: "note.wav",
        status: "needs-transcription-setup",
        message: "setup needed"
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await uploadAudioRequest(new File(["audio"], "note.wav", { type: "audio/wav" }));

    expect(response.status).toBe("needs-transcription-setup");
    expect(fetchMock).toHaveBeenCalledWith("/api/upload-audio", expect.objectContaining({ method: "POST" }));
    expect(fetchMock.mock.calls[0][1].body).toBeInstanceOf(FormData);
  });

  it("reports a clean error when upload returns non-json html", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "<!DOCTYPE html><p>Unsupported audio format.</p>"
    }));

    await expect(uploadAudioRequest(new File(["audio"], "note.txt", { type: "text/plain" }))).rejects.toThrow(
      "Audio upload failed."
    );
  });

  it("fetches runtime service status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        services: {
          ollama: { status: "ready", model: "llama3.2:3b" },
          whisper: { status: "ready" }
        }
      })
    }));

    await expect(getRuntimeStatusRequest()).resolves.toEqual({
      services: {
        ollama: { status: "ready", model: "llama3.2:3b" },
        whisper: { status: "ready" }
      }
    });
  });

  it("rejects malformed runtime service status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<!DOCTYPE html><main>Preview server</main>"
    }));

    await expect(getRuntimeStatusRequest()).rejects.toThrow("Status check failed.");
  });

  it("reads streamed transcript progress before returning the result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response([
      JSON.stringify({ type: "progress", stage: "Analyzing speech", progress: 24 }),
      JSON.stringify({ type: "result", result: { draft: { steps: ["Open settings."] } } })
    ].join("\n"))));

    const progress: Array<{ stage: string; progress: number }> = [];
    const result = await streamProcessTranscriptRequest(
      { transcript: "First open settings. Then click save." },
      (event) => progress.push({ stage: event.stage, progress: event.progress })
    );

    expect(progress).toEqual([{ stage: "Analyzing speech", progress: 24 }]);
    expect(result).toEqual({ draft: { steps: ["Open settings."] } });
  });

  it("reads streamed audio upload progress before returning the result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response([
      JSON.stringify({ type: "progress", stage: "Transcribing audio", progress: 36 }),
      JSON.stringify({ type: "result", result: { fileName: "note.wav", status: "transcribed" } })
    ].join("\n"))));

    const progress: Array<{ stage: string; progress: number }> = [];
    const result = await streamAudioUploadRequest(
      new File(["audio"], "note.wav", { type: "audio/wav" }),
      (event) => progress.push({ stage: event.stage, progress: event.progress })
    );

    expect(progress).toEqual([{ stage: "Transcribing audio", progress: 36 }]);
    expect(result).toEqual({ fileName: "note.wav", status: "transcribed" });
  });
});
