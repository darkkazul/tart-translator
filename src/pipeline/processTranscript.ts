import { DEFAULT_FILLER_TERMS } from "../shared/defaults";
import type { ProcessTranscriptRequest, ProcessTranscriptResponse } from "../shared/types";
import { analyzeDisfluencies } from "./disfluencyAnalysis";
import { classifyTranscript } from "./contentClassification";
import { DeterministicNoteProvider, OllamaNoteProvider, type NoteGenerationProvider } from "./noteGeneration";

export type ProcessTranscriptProgress = (stage: string, progress: number) => void;

function wordCount(transcript: string) {
  return transcript.match(/[a-z]+(?:'[a-z]+)?/gi)?.length ?? 0;
}

export async function processTranscript(
  request: ProcessTranscriptRequest,
  providers: NoteGenerationProvider[] = [new OllamaNoteProvider(), new DeterministicNoteProvider()],
  onProgress?: ProcessTranscriptProgress
): Promise<ProcessTranscriptResponse> {
  onProgress?.("Validating transcript", 8);
  const transcript = request.transcript.trim();
  if (wordCount(transcript) < 5) {
    throw new Error("Transcript is too short to process.");
  }

  onProgress?.("Analyzing speech", 24);
  const fillerTerms = request.fillerTerms ?? DEFAULT_FILLER_TERMS;
  const speech = analyzeDisfluencies(transcript, fillerTerms);

  onProgress?.("Finding procedure steps", 42);
  const focus = classifyTranscript(transcript);

  onProgress?.("Choosing note engine", 58);
  const provider = await firstAvailableProvider(providers);

  onProgress?.("Generating notes", 76);
  const draft = await provider.generate(focus);

  onProgress?.("Finalizing notes", 94);
  const warnings =
    draft.generationMode === "deterministic"
      ? ["Generated with deterministic cleanup because Ollama is unavailable or returned invalid output."]
      : [];

  return { draft, speech, focus, warnings };
}

async function firstAvailableProvider(providers: NoteGenerationProvider[]) {
  for (const provider of providers) {
    if (await provider.isAvailable()) {
      return provider;
    }
  }

  return new DeterministicNoteProvider();
}
