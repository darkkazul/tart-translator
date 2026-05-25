import { DEFAULT_FILLER_TERMS } from "../shared/defaults";
import type { FocusReview, HowToDraft } from "../shared/types";
import { z } from "zod";

export interface NoteGenerationProvider {
  name: "deterministic" | "ollama";
  isAvailable(): Promise<boolean>;
  generate(focus: FocusReview): Promise<HowToDraft>;
}

const draftSchema = z.object({
  title: z.string().trim().min(1),
  overview: z.string().trim().min(1),
  prerequisites: z.array(z.string()),
  steps: z.array(z.string().trim().min(1).regex(/^[A-Z].*[.!?]$/)).min(1),
  warnings: z.array(z.string()),
  troubleshooting: z.array(z.string())
});

const ACTION_STARTERS =
  "open|go to|click|select|choose|save|copy|paste|run|restart|check|verify|make sure|set|create|delete|update|export|import|add|remove|enter|type|upload|download";

function stripSpokenLeadIn(text: string) {
  let stripped = text.trim();

  for (let pass = 0; pass < 4; pass += 1) {
    stripped = stripped
      .replace(/^(?:okay|ok|alright|so|um|uh|ah|basically|actually)[,\s]+/i, "")
      .replace(/^(?:what\s+)?(?:i|we)\s+need\s+you\s+to\s+do\s+is\s+/i, "")
      .replace(/^(?:what\s+)?you\s+(?:need|want|wanna)\s+to\s+do\s+is\s+/i, "")
      .replace(/^the\s+(?:process|thing)\s+is\s+/i, "")
      .trim();
  }

  return stripped;
}

function splitProcedureActions(text: string) {
  const withoutLeadIn = stripSpokenLeadIn(text)
    .replace(/\s+because\b.*$/i, "")
    .replace(/,\s+because\b.*$/i, "")
    .trim();

  return withoutLeadIn
    .replace(/\b(?:and\s+then|and\s+after\s+that|and\s+next|after\s+that|next|then)\b/gi, ". ")
    .replace(new RegExp(`\\s+and\\s+(?=(?:${ACTION_STARTERS})\\b)`, "gi"), ". ")
    .split(/\.\s+/)
    .map((part) => part.replace(/^\s*(?:first|second|third|fourth|finally),?\s+/i, "").trim())
    .filter((part) => new RegExp(`^(?:${ACTION_STARTERS})\\b`, "i").test(part));
}

export function rewriteInstructionSentence(sentence: string) {
  const fillerPrefix = DEFAULT_FILLER_TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  let rewritten = stripSpokenLeadIn(sentence);

  for (let pass = 0; pass < 3; pass += 1) {
    rewritten = rewritten
      .replace(new RegExp(`^(${fillerPrefix}),?\\s+`, "i"), "")
      .replace(/^okay,?\s+/i, "")
      .replace(/^i mean,?\s+/i, "")
      .replace(/^(first|second|third|next|then|after that),?\s+/i, "")
      .replace(/^(what\s+)?you\s+(?:want|wanna)\s+to\s+do\s+is\s+/i, "")
      .replace(/^you(?:'re| are)?\s+(?:gonna|going to|want to|wanna)\s+/i, "")
      .replace(/^(?:want|wanna)\s+to\s+/i, "")
      .replace(/^basically\s+/i, "")
      .replace(/^just\s+/i, "")
      .trim();
  }

  rewritten = rewritten
    .replace(/\bgo ahead and\s+/gi, "")
    .replace(/\bopen up\b/gi, "open")
    .replace(/\bclick on\b/gi, "click")
    .replace(/\bit's\b/gi, "it is")
    .replace(/\bkind of\s+/gi, "")
    .replace(/\bsort of\s+/gi, "")
    .replace(/\blittle\s+/gi, "")
    .replace(/\byou know,?\s*/gi, "")
    .replace(/,\s+because\b.*$/i, "")
    .replace(/\s+because\b.*$/i, "")
    .replace(/,\s*(kind of|sort of),?/gi, "")
    .replace(/\s+thing$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,.]$/, "");

  return rewritten.replace(/^([a-z])/, (match) => match.toUpperCase()) + ".";
}

export function createDeterministicDraft(focus: FocusReview): HowToDraft {
  const steps = focus.procedure.flatMap((segment) => {
    const actions = splitProcedureActions(segment.text);
    return (actions.length > 0 ? actions : [segment.text]).map(rewriteInstructionSentence);
  });

  return {
    title: "How to complete the process",
    overview:
      steps.length > 0
        ? "A concise procedure rewritten from the transcript."
        : "No clear procedure steps were detected. Review the transcript and tangents.",
    prerequisites: [],
    steps,
    warnings: focus.tangents.length > 0 ? ["Review parked tangents for extra context before sharing."] : [],
    troubleshooting: [],
    generationMode: "deterministic"
  };
}

function isCollapsedTranscriptStep(step: string) {
  return (
    step.length > 140 &&
    /\b(first|then|after that|and then|next)\b/i.test(step) &&
    new RegExp(`\\b(?:${ACTION_STARTERS})\\b.*\\b(?:${ACTION_STARTERS})\\b`, "i").test(step)
  );
}

function isUsefulModelDraft(draft: z.infer<typeof draftSchema>, fallback: HowToDraft) {
  const modelCollapsedActions = fallback.steps.length > 1 && draft.steps.length < fallback.steps.length;
  if (modelCollapsedActions) return false;

  return !draft.steps.some(isCollapsedTranscriptStep);
}

function parseOllamaDraftResponse(response: string) {
  const jsonText = response.slice(response.indexOf("{"), response.lastIndexOf("}") + 1);
  if (!jsonText) return {};

  return normalizeModelDraft(
    JSON.parse(
    jsonText
      .replace(/"prerequisites"\s*:\s*None/g, "\"prerequisites\": []")
      .replace(/"warnings"\s*:\s*None/g, "\"warnings\": []")
      .replace(/"troubleshooting"\s*:\s*None/g, "\"troubleshooting\": []")
    )
  );
}

function normalizeModelDraft(value: unknown) {
  if (!value || typeof value !== "object") return value;

  const draft = value as Record<string, unknown>;
  for (const key of ["prerequisites", "warnings", "troubleshooting"]) {
    if (draft[key] === null) draft[key] = [];
  }

  if (Array.isArray(draft.steps)) {
    draft.steps = draft.steps.map((step) => (
      typeof step === "object" && step && "text" in step ? (step as { text: unknown }).text : step
    ));
  }

  return draft;
}

export class DeterministicNoteProvider implements NoteGenerationProvider {
  name = "deterministic" as const;

  async isAvailable() {
    return true;
  }

  async generate(focus: FocusReview): Promise<HowToDraft> {
    return createDeterministicDraft(focus);
  }
}

export class OllamaNoteProvider implements NoteGenerationProvider {
  name = "ollama" as const;

  constructor(private readonly endpoint = process.env.OLLAMA_GENERATE_URL ?? "http://127.0.0.1:11434/api/generate") {}

  async isAvailable() {
    try {
      const response = await fetch(process.env.OLLAMA_TAGS_URL ?? "http://127.0.0.1:11434/api/tags");
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(focus: FocusReview): Promise<HowToDraft> {
    const fallback = createDeterministicDraft(focus);
    const prompt = [
      "Rewrite these transcript segments into concise how-to notes.",
      "Split run-on spoken instructions into separate ordered steps whenever the speaker says first, then, next, after that, or and then.",
      "Rewrite, do not quote the transcript.",
      "Preserve facts only. Do not invent missing steps.",
      "Use complete, concise sentences for every step.",
      "Keep tangents out of the main steps unless they are useful as warnings or troubleshooting.",
      "Return only JSON with title, overview, prerequisites, steps, warnings, and troubleshooting.",
      JSON.stringify(focus)
    ].join("\n\n");

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.OLLAMA_MODEL ?? "llama3.2", prompt, stream: false, format: "json" })
    });

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as { response?: string };
    try {
      const parsed = draftSchema.parse(parseOllamaDraftResponse(data.response ?? "{}"));
      if (!isUsefulModelDraft(parsed, fallback)) return fallback;
      return { ...parsed, generationMode: "ollama" };
    } catch {
      return fallback;
    }
  }
}
