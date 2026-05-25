import { z } from "zod";
import { processTranscript, type ProcessTranscriptProgress } from "../pipeline/processTranscript";
import { WhisperCliTranscriptionProvider, type TranscriptionProvider } from "../pipeline/transcription";
import type { AudioUploadResponse } from "../shared/types";

const processTranscriptSchema = z.object({
  transcript: z.string(),
  fillerTerms: z.array(z.string()).optional(),
  mode: z.literal("how-to").optional()
});

export interface HandlerResult {
  status: number;
  body: unknown;
}

export interface UploadedAudioFile {
  originalname: string;
  path: string;
}

export async function handleProcessTranscriptBody(body: unknown): Promise<HandlerResult> {
  return processTranscriptBody(body);
}

export async function processTranscriptBody(
  body: unknown,
  onProgress?: ProcessTranscriptProgress
): Promise<HandlerResult> {
  const parsed = processTranscriptSchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, body: { error: "Invalid transcript request." } };
  }

  try {
    return { status: 200, body: await processTranscript(parsed.data, undefined, onProgress) };
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : "Processing failed." }
    };
  }
}

export async function handleAudioUpload(
  file: UploadedAudioFile | undefined,
  transcriptionProvider: TranscriptionProvider = new WhisperCliTranscriptionProvider(),
  onProgress?: ProcessTranscriptProgress
): Promise<HandlerResult> {
  if (!file) {
    return { status: 400, body: { error: "Audio file is required." } };
  }

  onProgress?.("Checking Whisper", 12);
  if (!(await transcriptionProvider.isAvailable())) {
    return {
      status: 200,
      body: {
        fileName: file.originalname,
        status: "needs-transcription-setup",
        message: "Audio upload is ready, but local transcription is not configured yet. Paste a transcript to process now."
      } satisfies AudioUploadResponse
    };
  }

  onProgress?.("Transcribing audio", 36);
  const transcript = await transcriptionProvider.transcribe(file.path);
  onProgress?.("Processing transcript", 62);
  const result = await processTranscript({ transcript }, undefined, (stage, progress) => {
    onProgress?.(stage, Math.min(96, 62 + Math.round(progress * 0.34)));
  });

  return {
    status: 200,
    body: {
      fileName: file.originalname,
      status: "transcribed",
      message: "Audio was transcribed locally with whisper.cpp and processed into notes.",
      transcript,
      result
    } satisfies AudioUploadResponse
  };
}
