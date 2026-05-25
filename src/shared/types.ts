export type InputMode = "transcript" | "audio";

export type ContentBucket = "procedure" | "tangent" | "noise";

export interface TranscriptSegment {
  id: string;
  text: string;
  bucket: ContentBucket;
  confidence: number;
  reason: string;
}

export interface FillerHit {
  term: string;
  count: number;
}

export interface RepeatedWordHit {
  word: string;
  count: number;
}

export interface DisfluencyReport {
  totalWords: number;
  fillerHits: FillerHit[];
  fillerTotal: number;
  repeatedWordHits: RepeatedWordHit[];
  repeatedWordTotal: number;
  falseStartCount: number;
  fillerTerms: string[];
}

export interface HowToDraft {
  title: string;
  overview: string;
  prerequisites: string[];
  steps: string[];
  warnings: string[];
  troubleshooting: string[];
  generationMode: "deterministic" | "ollama";
  generationIssue?: string;
}

export interface FocusReview {
  procedure: TranscriptSegment[];
  tangents: TranscriptSegment[];
  noise: TranscriptSegment[];
}

export interface ProcessTranscriptRequest {
  transcript: string;
  fillerTerms?: string[];
  mode?: "how-to";
}

export interface ProcessTranscriptResponse {
  draft: HowToDraft;
  speech: DisfluencyReport;
  focus: FocusReview;
  warnings: string[];
}

export interface AudioUploadResponse {
  fileName: string;
  status: "needs-transcription-setup" | "transcribed";
  message: string;
  transcript?: string;
  result?: ProcessTranscriptResponse;
}

export interface ProcessingProgressEvent {
  type: "progress";
  stage: string;
  progress: number;
}

export interface ProcessingTranscriptResultEvent {
  type: "result";
  result: ProcessTranscriptResponse;
}

export interface ProcessingAudioResultEvent {
  type: "result";
  result: AudioUploadResponse;
}

export interface ProcessingErrorEvent {
  type: "error";
  error: string;
}

export type TranscriptStreamEvent = ProcessingProgressEvent | ProcessingTranscriptResultEvent | ProcessingErrorEvent;
export type AudioStreamEvent = ProcessingProgressEvent | ProcessingAudioResultEvent | ProcessingErrorEvent;

export type ServiceStatus = "ready" | "offline" | "needs-model" | "not-configured";

export interface RuntimeStatus {
  services: {
    ollama: {
      status: Extract<ServiceStatus, "ready" | "offline" | "needs-model">;
      model: string;
    };
    whisper: {
      status: Extract<ServiceStatus, "ready" | "not-configured">;
    };
  };
}
