import type { FocusReview, TranscriptSegment } from "../shared/types";

const PROCEDURE_MARKERS =
  /\b(first|second|third|next|then|after that|before|open|click|select|choose|save|copy|paste|run|restart|check|verify|make sure|go to|set|create|delete|update|export|import)\b/i;
const TANGENT_MARKERS =
  /\b(reminds me|by the way|side note|this is unrelated|another thing|historically|old|random)\b/i;
const NOISE_MARKERS = /^(anyway|so yeah|whatever|never mind|ignore that)\.?$/i;

function splitSentences(transcript: string) {
  return transcript
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function makeSegment(index: number, text: string): TranscriptSegment {
  if (NOISE_MARKERS.test(text) || text.length < 8) {
    return {
      id: `segment-${index}`,
      text,
      bucket: "noise",
      confidence: 0.85,
      reason: "Matches low-value filler language."
    };
  }

  if (TANGENT_MARKERS.test(text)) {
    return {
      id: `segment-${index}`,
      text,
      bucket: "tangent",
      confidence: 0.72,
      reason: "Contains tangent marker language."
    };
  }

  if (PROCEDURE_MARKERS.test(text)) {
    return {
      id: `segment-${index}`,
      text,
      bucket: "procedure",
      confidence: 0.78,
      reason: "Contains procedural language."
    };
  }

  return {
    id: `segment-${index}`,
    text,
    bucket: "tangent",
    confidence: 0.5,
    reason: "Low-confidence general explanation parked for review."
  };
}

export function classifyTranscript(transcript: string): FocusReview {
  const segments = splitSentences(transcript).map((text, index) => makeSegment(index + 1, text));

  return {
    procedure: segments.filter((segment) => segment.bucket === "procedure"),
    tangents: segments.filter((segment) => segment.bucket === "tangent"),
    noise: segments.filter((segment) => segment.bucket === "noise")
  };
}
