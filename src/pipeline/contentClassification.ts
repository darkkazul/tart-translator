import type { FocusReview, TranscriptSegment } from "../shared/types";

const ACTION_STARTER_SOURCE =
  "open|go to|head over to|head to|navigate to|visit|click|hit|press|tap|select|choose|save|copy|paste|run|restart|check|verify|make sure|set|create|delete|update|export|import|upload|download";
const PROCEDURE_MARKERS =
  /\b(first|second|third|next|then|after that|before|open|click|select|choose|save|copy|paste|run|restart|check|verify|make sure|go to|set|create|delete|update|export|import)\b/i;
const CONCRETE_ACTION_MARKERS = new RegExp(`\\b(?:${ACTION_STARTER_SOURCE})\\b`, "i");
const PLACEHOLDER_STEP_MARKERS =
  /\b(?:point\s+)?step\s+(?:one|two|three|four|five|\d+)\b|\bgo from there\b|\bcontinue with step\b/i;
const TANGENT_MARKERS =
  /\b(reminds me|by the way|side note|this is unrelated|another thing|historically|old|random)\b/i;
const NOISE_MARKERS = /^(anyway|so yeah|whatever|never mind|ignore that)\.?$/i;

// Discourse shifts that start a new clause. Narrower than TANGENT_MARKERS on
// purpose: single content words like "old" classify a clause but must not break it.
const TANGENT_BOUNDARY_MARKERS = /\b(?:by the way|side note|this is unrelated|another thing|reminds me)\b/gi;
// Procedural connectives that introduce the next action. Kept as the lead of the
// next clause so segments read like the punctuated case ("Then click Save.").
const PROCEDURE_CONNECTIVES = `and\\s+then|and\\s+after\\s+that|and\\s+next|after\\s+that|then|next`;
const CLAUSE_BREAK = "\u0000";

// Spoken transcripts often lack sentence punctuation, so a whole ramble collapses
// into one segment that gets one bucket. Split each sentence into action-sized
// clauses before classifying so a stray tangent can't drop the entire procedure.
function splitClauses(sentence: string): string[] {
  let marked = sentence;

  if (CONCRETE_ACTION_MARKERS.test(sentence)) {
    marked = marked.replace(TANGENT_BOUNDARY_MARKERS, (marker) => `${CLAUSE_BREAK}${marker}`);
  }

  marked = marked
    .replace(
      new RegExp(`\\b(?:${PROCEDURE_CONNECTIVES})\\b(?=\\s+(?:you(?:'ll)?\\s+)?(?:${ACTION_STARTER_SOURCE})\\b)`, "gi"),
      (connective) => `${CLAUSE_BREAK}${connective}`
    )
    .replace(new RegExp(`\\s+and\\s+(?=(?:${ACTION_STARTER_SOURCE})\\b)`, "gi"), CLAUSE_BREAK);

  return marked
    .split(CLAUSE_BREAK)
    .map((clause) => clause.trim().replace(/\s+(?:and|but|so)$/i, "").trim())
    .filter(Boolean);
}

function splitSentences(transcript: string) {
  return transcript
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .flatMap((sentence) => splitClauses(sentence.trim()))
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

  if (PLACEHOLDER_STEP_MARKERS.test(text) && !CONCRETE_ACTION_MARKERS.test(text)) {
    return {
      id: `segment-${index}`,
      text,
      bucket: "tangent",
      confidence: 0.68,
      reason: "Mentions placeholder steps without concrete actions."
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
