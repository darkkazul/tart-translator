import { describe, expect, it, vi } from "vitest";
import { handleRuntimeStatus } from "../../src/server/status";

describe("handleRuntimeStatus", () => {
  it("reports Ollama and Whisper availability without exposing local paths", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: "llama3.2:3b" }]
      })
    }));

    const result = await handleRuntimeStatus({
      ollamaTagsUrl: "http://127.0.0.1:11434/api/tags",
      ollamaModel: "llama3.2:3b",
      transcriptionProvider: {
        isAvailable: async () => true,
        transcribe: async () => "unused"
      }
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      services: {
        ollama: { status: "ready", model: "llama3.2:3b" },
        whisper: { status: "ready" }
      }
    });
    expect(JSON.stringify(result.body)).not.toContain("/Users/");
  });

  it("reports missing Ollama models and unavailable Whisper", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] })
    }));

    const result = await handleRuntimeStatus({
      ollamaTagsUrl: "http://127.0.0.1:11434/api/tags",
      ollamaModel: "llama3.2:3b",
      transcriptionProvider: {
        isAvailable: async () => false,
        transcribe: async () => "unused"
      }
    });

    expect(result.body).toEqual({
      services: {
        ollama: { status: "needs-model", model: "llama3.2:3b" },
        whisper: { status: "not-configured" }
      }
    });
  });
});
