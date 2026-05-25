import { DEFAULT_FILLER_TERMS } from "../shared/defaults";
import type { DisfluencyReport, FillerHit, RepeatedWordHit } from "../shared/types";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordsFrom(text: string) {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

export function analyzeDisfluencies(
  transcript: string,
  fillerTerms: readonly string[] = DEFAULT_FILLER_TERMS
): DisfluencyReport {
  const normalizedTerms = [...new Set(fillerTerms.map((term) => term.trim().toLowerCase()).filter(Boolean))];
  const lowerTranscript = transcript.toLowerCase();
  const fillerHits: FillerHit[] = normalizedTerms
    .map((term) => {
      const pattern = new RegExp(`\\b${escapeRegExp(term).replace(/\\s+/g, "\\s+")}\\b`, "gi");
      return { term, count: lowerTranscript.match(pattern)?.length ?? 0 };
    })
    .filter((hit) => hit.count > 0);

  const words = wordsFrom(transcript);
  const repeated = new Map<string, number>();
  for (let index = 1; index < words.length; index += 1) {
    if (words[index] === words[index - 1]) {
      repeated.set(words[index], (repeated.get(words[index]) ?? 0) + 1);
    }
  }

  const repeatedWordHits: RepeatedWordHit[] = [...repeated.entries()].map(([word, count]) => ({ word, count }));
  const falseStartCount = (
    transcript.match(/\b(no|sorry|wait),?\s+(actually|i mean|scratch that|no)\b|[-,]\s*no,?\s+/gi) ?? []
  ).length;

  return {
    totalWords: words.length,
    fillerHits,
    fillerTotal: fillerHits.reduce((sum, hit) => sum + hit.count, 0),
    repeatedWordHits,
    repeatedWordTotal: repeatedWordHits.reduce((sum, hit) => sum + hit.count, 0),
    falseStartCount,
    fillerTerms: normalizedTerms
  };
}
