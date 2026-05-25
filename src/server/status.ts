import { WhisperCliTranscriptionProvider, type TranscriptionProvider } from "../pipeline/transcription";
import type { RuntimeStatus } from "../shared/types";

export interface RuntimeStatusOptions {
  ollamaTagsUrl?: string;
  ollamaModel?: string;
  transcriptionProvider?: TranscriptionProvider;
}

export async function handleRuntimeStatus(options: RuntimeStatusOptions = {}) {
  const ollamaModel = options.ollamaModel ?? process.env.OLLAMA_MODEL ?? "llama3.2:3b";
  const transcriptionProvider = options.transcriptionProvider ?? new WhisperCliTranscriptionProvider();

  const [ollama, whisperReady] = await Promise.all([
    getOllamaStatus(options.ollamaTagsUrl ?? process.env.OLLAMA_TAGS_URL ?? "http://127.0.0.1:11434/api/tags", ollamaModel),
    transcriptionProvider.isAvailable()
  ]);

  return {
    status: 200,
    body: {
      services: {
        ollama,
        whisper: { status: whisperReady ? "ready" : "not-configured" }
      }
    } satisfies RuntimeStatus
  };
}

async function getOllamaStatus(tagsUrl: string, model: string): Promise<RuntimeStatus["services"]["ollama"]> {
  try {
    const response = await fetch(tagsUrl);
    if (!response.ok) return { status: "offline", model };

    const data = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const models = data.models ?? [];
    const hasModel = models.some((entry) => entry.name === model || entry.model === model);

    return { status: hasModel ? "ready" : "needs-model", model };
  } catch {
    return { status: "offline", model };
  }
}
