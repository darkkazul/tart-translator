import type {
  AudioStreamEvent,
  AudioUploadResponse,
  ProcessingProgressEvent,
  ProcessTranscriptRequest,
  ProcessTranscriptResponse,
  RuntimeStatus,
  TranscriptStreamEvent
} from "../shared/types";

const configuredApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;

export function getApiUrl(path: string, apiBase = configuredApiBase) {
  if (!apiBase) return path;

  return `${apiBase.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function readJsonResponse(response: Response, fallbackMessage: string) {
  const text = await response.text();
  let data: unknown = {};

  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    const error = typeof data === "object" && data && "error" in data ? String(data.error) : fallbackMessage;
    throw new Error(error);
  }

  return data;
}

export async function processTranscriptRequest(
  request: ProcessTranscriptRequest
): Promise<ProcessTranscriptResponse> {
  const response = await fetch(getApiUrl("/api/process-transcript"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });

  const data = await readJsonResponse(response, "Processing failed.");

  return data as ProcessTranscriptResponse;
}

export async function streamProcessTranscriptRequest(
  request: ProcessTranscriptRequest,
  onProgress: (event: ProcessingProgressEvent) => void
): Promise<ProcessTranscriptResponse> {
  const response = await fetch(getApiUrl("/api/process-transcript/stream"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });

  return readNdjsonStream<TranscriptStreamEvent, ProcessTranscriptResponse>(response, onProgress);
}

export async function getRuntimeStatusRequest(): Promise<RuntimeStatus> {
  const response = await fetch(getApiUrl("/api/status"));
  const data = await readJsonResponse(response, "Status check failed.");

  if (!isRuntimeStatus(data)) {
    throw new Error("Status check failed.");
  }

  return data as RuntimeStatus;
}

export async function uploadAudioRequest(file: File): Promise<AudioUploadResponse> {
  const formData = new FormData();
  formData.append("audio", file);

  const response = await fetch(getApiUrl("/api/upload-audio"), {
    method: "POST",
    body: formData
  });

  const data = await readJsonResponse(response, "Audio upload failed.");

  return data as AudioUploadResponse;
}

export async function streamAudioUploadRequest(
  file: File,
  onProgress: (event: ProcessingProgressEvent) => void
): Promise<AudioUploadResponse> {
  const formData = new FormData();
  formData.append("audio", file);

  const response = await fetch(getApiUrl("/api/upload-audio/stream"), {
    method: "POST",
    body: formData
  });

  return readNdjsonStream<AudioStreamEvent, AudioUploadResponse>(response, onProgress);
}

function isRuntimeStatus(data: unknown): data is RuntimeStatus {
  if (!data || typeof data !== "object" || !("services" in data)) return false;

  const services = (data as { services?: unknown }).services;
  if (!services || typeof services !== "object") return false;

  const ollama = (services as { ollama?: unknown }).ollama;
  const whisper = (services as { whisper?: unknown }).whisper;

  if (!ollama || typeof ollama !== "object" || !whisper || typeof whisper !== "object") return false;

  const ollamaStatus = (ollama as { status?: unknown }).status;
  const ollamaModel = (ollama as { model?: unknown }).model;
  const whisperStatus = (whisper as { status?: unknown }).status;

  return (
    (ollamaStatus === "ready" || ollamaStatus === "offline" || ollamaStatus === "needs-model") &&
    typeof ollamaModel === "string" &&
    (whisperStatus === "ready" || whisperStatus === "not-configured")
  );
}

async function readNdjsonStream<TEvent extends { type: string }, TResult>(
  response: Response,
  onProgress: (event: ProcessingProgressEvent) => void
): Promise<TResult> {
  if (!response.ok) {
    await readJsonResponse(response, "Processing failed.");
  }

  if (!response.body) throw new Error("Streaming response is unavailable.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: TResult | undefined;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      result = readStreamLine<TEvent, TResult>(line, onProgress, result);
    }

    if (done) break;
  }

  result = readStreamLine<TEvent, TResult>(buffer, onProgress, result);

  if (!result) throw new Error("Processing did not return a result.");

  return result;
}

function readStreamLine<TEvent extends { type: string }, TResult>(
  line: string,
  onProgress: (event: ProcessingProgressEvent) => void,
  currentResult: TResult | undefined
) {
  if (!line.trim()) return currentResult;

  const event = JSON.parse(line) as TEvent;
  if (isProgressEvent(event)) {
    onProgress(event);
    return currentResult;
  }

  if (event.type === "result" && "result" in event) {
    return event.result as TResult;
  }

  if (event.type === "error" && "error" in event) {
    throw new Error(String(event.error));
  }

  return currentResult;
}

function isProgressEvent(event: { type: string }): event is ProcessingProgressEvent {
  return (
    event.type === "progress" &&
    "stage" in event &&
    typeof event.stage === "string" &&
    "progress" in event &&
    typeof event.progress === "number"
  );
}
