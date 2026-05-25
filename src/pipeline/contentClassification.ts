import type { FocusReview, TranscriptSegment } from "../shared/types";

const ACTION_STARTER_SOURCE =
  "open|go to|head over to|head to|navigate to|visit|click|hit|press|tap|select|choose|save|copy|paste|run|restart|check|verify|make sure|set|create|delete|update|export|import|upload|download";
const SEQUENCE_MARKERS = "first|second|third|next|then|after that|before";
// One source of truth: every concrete action starter is also procedural language,
// so newly supported verbs (navigate to, upload, ...) classify as procedures too.
const PROCEDURE_MARKERS = new RegExp(`\\b(?:${SEQUENCE_MARKERS}|${ACTION_STARTER_SOURCE})\\b`, "i");
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

// Words that, immediately before an action verb, mean it is NOT the start of a new
// step: articles ("the export"), prepositions ("to import"), connectives ("then go"),
// subject pronouns ("you open"), and other action verbs ("click save" = the Save
// button). Anything else before an action verb is treated as the end of the previous
// step. Bias is intentional: leave run-ons merged rather than over-split into junk.
const CLAUSE_GLUE_WORDS = [
  "the", "a", "an", "this", "that", "these", "those", "your", "my", "our", "his", "her", "its",
  "their", "some", "any", "each", "every", "no", "another",
  "to", "into", "onto", "of", "on", "in", "at", "for", "with", "from", "by", "up", "down", "over", "about", "as",
  "and", "or", "but", "so", "then", "next", "first", "second", "third", "fourth", "fifth", "finally",
  "after", "before", "also", "plus",
  "i", "you", "we", "they", "he", "she", "it", "one", "me", "us", "them"
];
const NON_BOUNDARY_BEFORE_ACTION = new Set([...ACTION_STARTER_SOURCE.split(/[|\s]+/), ...CLAUSE_GLUE_WORDS]);

// Spoken steps are often chained with no connector at all ("open settings save the
// file"). Split before a mid-clause action verb only when the preceding word reads
// like the end of the previous step (see NON_BOUNDARY_BEFORE_ACTION).
function splitConnectorFreeActions(clause: string): string[] {
  const marked = clause.replace(
    new RegExp(`([\\w']+)\\s+(?=(?:${ACTION_STARTER_SOURCE})\\b)`, "gi"),
    (match, prevWord) =>
      NON_BOUNDARY_BEFORE_ACTION.has(prevWord.toLowerCase()) ? match : `${prevWord}${CLAUSE_BREAK}`
  );
  return marked.split(CLAUSE_BREAK).map((part) => part.trim()).filter(Boolean);
}

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
    .flatMap((clause) => splitConnectorFreeActions(clause))
    .map((clause) => clause.replace(/\s+(?:and|but|so)$/i, "").trim())
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
