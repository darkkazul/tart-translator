import { ACTION_STARTER_SOURCE } from "../shared/actions";
import { DEFAULT_FILLER_TERMS } from "../shared/defaults";
import type { DraftSuggestion, FocusReview, HowToDraft } from "../shared/types";
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
  steps: z.array(z.string().trim().min(1).regex(/^[A-Z].*[.!?]$/)),
  warnings: z.array(z.string()),
  troubleshooting: z.array(z.string())
});

const ACTION_STARTERS = ACTION_STARTER_SOURCE;
const ACTION_ONLY_WORDS = new Set([
  "add",
  "check",
  "choose",
  "click",
  "connect",
  "copy",
  "create",
  "delete",
  "download",
  "enter",
  "export",
  "head",
  "hit",
  "import",
  "navigate",
  "open",
  "paste",
  "press",
  "remove",
  "restart",
  "run",
  "select",
  "set",
  "store",
  "tap",
  "type",
  "update",
  "upload",
  "verify",
  "visit",
  "wait"
]);

function stripSpokenLeadIn(text: string) {
  let stripped = text.trim();

  for (let pass = 0; pass < 4; pass += 1) {
    stripped = stripped
      .replace(/^(?:okay|ok|alright|so|um|uh|ah|basically|actually)[,\s]+/i, "")
      .replace(/^(?:what\s+)?(?:i|we)\s+need\s+you\s+to\s+do\s+is\s+/i, "")
      .replace(/^(?:what\s+)?you\s+(?:need|want|wanna)\s+to\s+do\s+is\s+/i, "")
      .replace(/^you(?:'re| are)?\s+(?:gonna|going to|want to|wanna)\s+/i, "")
      .replace(new RegExp(`^you(?:'ll| will)?\\s+(?=(?:${ACTION_STARTERS})\\b)`, "i"), "")
      .replace(/^(?:want|wanna)\s+to\s+/i, "")
      .replace(/^the\s+thing\s+you\s+do\s+is\s+/i, "")
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
    .map((part) => stripSpokenLeadIn(part.replace(/^\s*(?:first|second|third|fourth|finally|next|then|after that),?\s+/i, "")).trim())
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
    .replace(/\bhead over to\b/gi, "go to")
    .replace(/\bhead to\b/gi, "go to")
    .replace(/\bnavigate to\b/gi, "go to")
    .replace(/\bhit\b/gi, "click")
    .replace(/\bpress\b/gi, "click")
    .replace(/\btap\b/gi, "click")
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
    return actions.map(rewriteInstructionSentence);
  });

  return {
    title: "How to complete the process",
    overview:
      steps.length > 0
        ? "A concise procedure rewritten from the transcript."
        : "No clear procedure steps were detected. Review the transcript and tangents.",
    prerequisites: [],
    steps,
    suggestions: [],
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

function modelDraftIssue(draft: z.infer<typeof draftSchema>, fallback: HowToDraft, sourceText: string) {
  if (
    fallback.steps.length === 0 &&
    draft.steps.length > 0 &&
    !allModelStepsAreGrounded(draft.steps, sourceText)
  ) {
    return "Ollama returned steps without grounded procedure actions.";
  }

  if (fallback.steps.length > 0 && draft.steps.length > fallback.steps.length) {
    return null;
  }

  const modelCollapsedActions = fallback.steps.length > 1 && draft.steps.length < fallback.steps.length;
  if (modelCollapsedActions) return "Ollama collapsed multiple parser steps into fewer steps.";

  if (draft.steps.some(isCollapsedTranscriptStep)) {
    return "Ollama returned a copied run-on transcript step.";
  }

  return null;
}

function normalizeForComparison(step: string) {
  return step
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|a|an|your|on|to|up)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSimilarStep(modelStep: string, fallbackStep: string) {
  const model = normalizeForComparison(modelStep);
  const fallback = normalizeForComparison(fallbackStep);
  return model === fallback || model.includes(fallback) || fallback.includes(model);
}

function importantWords(text: string) {
  const stopWords = new Set([
    "the",
    "and",
    "then",
    "that",
    "this",
    "with",
    "into",
    "from",
    "your",
    "you",
    "for",
    "after",
    "before",
    "step",
    "steps"
  ]);

  return new Set(
    text
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((word) => word.length > 2 && !stopWords.has(word)) ?? []
  );
}

function isMetaNoteSuggestion(step: string) {
  return [
    /\bidentify\b.*\b(?:task|objective|procedure|process)\b/i,
    /\b(?:split|break down)\b.*\b(?:instruction|instructions|task|procedure|process)\b/i,
    /\borganize\b.*\bsteps?\b/i,
    /\breview and refine\b/i,
    /\bensure\b.*\b(?:clarity|completeness)\b/i,
    /\bindividual steps\b/i,
    /\blogical order\b/i
  ].some((pattern) => pattern.test(step));
}

function contentWords(text: string) {
  return new Set([...importantWords(text)].filter((word) => !ACTION_ONLY_WORDS.has(word)));
}

function isUsefulProcedureSuggestion(step: string, sourceText: string) {
  if (isMetaNoteSuggestion(step)) return false;
  if (!new RegExp(`^(?:${ACTION_STARTERS})\\b`, "i").test(step)) return false;

  const sourceContentWords = contentWords(sourceText);
  return [...contentWords(step)].some((word) => sourceContentWords.has(word));
}

function allModelStepsAreGrounded(modelSteps: string[], sourceText: string) {
  return modelSteps.length > 0 && modelSteps.every((step) => isUsefulProcedureSuggestion(step, sourceText));
}

function splitGroundedStepsAndSuggestions(
  modelSteps: string[],
  fallbackSteps: string[],
  sourceText: string
): { steps: string[]; suggestions: DraftSuggestion[] } {
  const suggestions: DraftSuggestion[] = [];
  let fallbackIndex = 0;

  for (const modelStep of modelSteps) {
    if (fallbackIndex < fallbackSteps.length && isSimilarStep(modelStep, fallbackSteps[fallbackIndex])) {
      fallbackIndex += 1;
      continue;
    }

    if (isUsefulProcedureSuggestion(modelStep, sourceText)) {
      suggestions.push({
        id: `ollama-extra-step-${suggestions.length + 1}`,
        text: modelStep,
        reason: "Ollama suggested this extra step, but it was not found by the offline parser.",
        suggestedAfterStepIndex: fallbackIndex > 0 ? fallbackIndex - 1 : undefined
      });
    }
  }

  return { steps: fallbackSteps, suggestions };
}

function parseOllamaDraftResponse(response: string) {
  const jsonText = response.slice(response.indexOf("{"), response.lastIndexOf("}") + 1);
  if (!jsonText) throw new Error("Ollama response did not contain a JSON object.");

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
  if (typeof draft.title === "string" && draft.title.trim() === "") {
    draft.title = "How to complete the process";
  }
  if (typeof draft.overview === "string" && draft.overview.trim() === "") {
    draft.overview = "No clear procedure steps were detected. Review the transcript and tangents.";
  }

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

function normalizeNoProcedureModelDraft(value: unknown, fallback: HowToDraft) {
  if (!value || typeof value !== "object") return value;

  const draft = value as Record<string, unknown>;
  if (typeof draft.title !== "string" || draft.title.trim() === "") {
    draft.title = fallback.title;
  }
  if (typeof draft.overview !== "string" || draft.overview.trim() === "") {
    draft.overview = fallback.overview;
  }

  for (const key of ["prerequisites", "steps", "warnings", "troubleshooting"]) {
    if (!Array.isArray(draft[key])) draft[key] = [];
  }

  return draft;
}

function fallbackWithIssue(fallback: HowToDraft, generationIssue: string): HowToDraft {
  return { ...fallback, generationIssue };
}

function describeDraftValidationError(error: z.ZodError) {
  const issue = error.issues[0];
  const path = issue?.path.join(".");

  if (path === "steps" && issue?.code === "too_small") {
    return "Ollama did not return any procedure steps.";
  }

  if (path?.startsWith("steps.")) {
    if (issue?.code === "invalid_string") {
      return "Ollama returned a step that was not a complete sentence.";
    }

    return "Ollama returned steps in an unsupported shape.";
  }

  if (path && ["title", "overview", "prerequisites", "warnings", "troubleshooting"].includes(path)) {
    return `Ollama response had an invalid ${path} field.`;
  }

  return "Ollama response failed draft validation.";
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
      "You are converting a messy spoken transcript into a clear how-to document.",
      [
        "Your job:",
        "- Extract only concrete procedural actions that the speaker actually describes.",
        "- Rewrite those actions into clear, concise, complete sentences.",
        "- Split run-on speech into separate steps when it contains multiple actions.",
        "- Preserve the speaker's facts.",
        "- Do not invent missing actions.",
        "- Do not add generic advice.",
        "- Do not write advice about how to create notes.",
        "- Do not output steps like \"Identify the main objective,\" \"Organize the steps,\" \"Review the process,\" or \"Split the instruction.\"",
        "- If the transcript does not contain a real procedure, return an empty steps array."
      ].join("\n"),
      [
        "A valid step starts with a concrete action the user should perform.",
        "A valid step describes something that can actually be done.",
        "A valid step is grounded in the transcript.",
        "A valid step is one complete sentence.",
        "A valid step does not combine multiple actions unless they are inseparable."
      ].join("\n"),
      [
        "Examples of valid steps:",
        "- Open the Unraid dashboard.",
        "- Go to Shares.",
        "- Select the appdata share.",
        "- Click Export.",
        "- Save the file somewhere safe."
      ].join("\n"),
      [
        "Examples of invalid steps:",
        "- Identify the main objective.",
        "- Break the transcript into steps.",
        "- Organize the steps logically.",
        "- Review and refine the instructions.",
        "- Continue with step two.",
        "- Go from there."
      ].join("\n"),
      [
        "When splitting run-on speech:",
        "- Split at words like first, then, next, after that, and then, and finally.",
        "- Also split when two concrete actions are joined by and.",
        "- Keep the original order unless the speaker explicitly corrects it.",
        "- If the speaker says go back to step three, include that only if step three has a concrete action."
      ].join("\n"),
      [
        "Output rules:",
        "- Return only valid JSON.",
        "- Do not wrap the JSON in markdown.",
        "- Use exactly these fields: title, overview, prerequisites, steps, warnings, and troubleshooting."
      ].join("\n"),
      [
        "Quality rules:",
        "- If there are no concrete steps, steps must be [].",
        "- If a sentence is vague planning chatter, exclude it.",
        "- If a detail is useful context but not an action, put it in warnings or troubleshooting only if grounded.",
        "- Keep every step short and direct."
      ].join("\n"),
      "Classified transcript segments:",
      JSON.stringify(focus)
    ].join("\n\n");

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? "llama3.2",
        prompt,
        stream: false,
        format: "json",
        options: {
          temperature: 0,
          seed: 42
        }
      })
    });

    if (!response.ok) {
      return fallbackWithIssue(fallback, `Ollama request failed with HTTP ${response.status}.`);
    }

    const data = (await response.json()) as { response?: string };
    try {
      const parsedDraft = parseOllamaDraftResponse(data.response ?? "{}");
      const normalizedDraft = fallback.steps.length === 0
        ? normalizeNoProcedureModelDraft(parsedDraft, fallback)
        : parsedDraft;
      const parsed = draftSchema.parse(normalizedDraft);
      const sourceText = focus.procedure.map((segment) => segment.text).join(" ");
      const issue = modelDraftIssue(parsed, fallback, sourceText);
      if (issue) return fallbackWithIssue(fallback, issue);
      if (fallback.steps.length > 0 && parsed.steps.length > fallback.steps.length) {
        const { steps, suggestions } = splitGroundedStepsAndSuggestions(parsed.steps, fallback.steps, sourceText);
        return {
          ...parsed,
          steps,
          suggestions,
          generationMode: "ollama",
          generationIssue: suggestions.length > 0 ? "Ollama suggested extra steps that need review." : undefined
        };
      }
      return { ...parsed, suggestions: [], generationMode: "ollama" };
    } catch (error) {
      if (error instanceof Error && error.message === "Ollama response did not contain a JSON object.") {
        return fallbackWithIssue(fallback, error.message);
      }

      if (error instanceof SyntaxError) {
        return fallbackWithIssue(fallback, "Ollama response contained malformed JSON.");
      }

      if (error instanceof z.ZodError) {
        return fallbackWithIssue(fallback, describeDraftValidationError(error));
      }

      return fallbackWithIssue(fallback, "Ollama response could not be used.");
    }
  }
}
