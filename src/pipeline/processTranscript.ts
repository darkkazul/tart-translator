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
  const { provider, unavailableProviders } = await firstAvailableProvider(providers);

  onProgress?.("Generating notes", 76);
  const draft = await provider.generate(focus);

  onProgress?.("Finalizing notes", 94);
  const warnings: string[] = [];
  if (draft.generationMode === "ollama" && draft.generationIssue) {
    warnings.push(draft.generationIssue);
  } else if (draft.generationMode === "deterministic" && draft.generationIssue && draft.steps.length === 0) {
    warnings.push(`Ollama was available, but the offline parser was used: ${draft.generationIssue}`);
  } else if (draft.generationMode === "deterministic" && unavailableProviders.includes("ollama")) {
    warnings.push("Ollama was unavailable, so the offline parser was used.");
  }

  return { draft, speech, focus, warnings };
}

async function firstAvailableProvider(providers: NoteGenerationProvider[]) {
  const unavailableProviders: NoteGenerationProvider["name"][] = [];

  for (const provider of providers) {
    if (await provider.isAvailable()) {
      return { provider, unavailableProviders };
    }
    unavailableProviders.push(provider.name);
  }

  return { provider: new DeterministicNoteProvider(), unavailableProviders };
}
