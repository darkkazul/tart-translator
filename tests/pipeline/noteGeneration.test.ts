import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OllamaNoteProvider,
  createDeterministicDraft,
  rewriteInstructionSentence
} from "../../src/pipeline/noteGeneration";
import type { FocusReview } from "../../src/shared/types";

const messyFocus: FocusReview = {
  procedure: [
    {
      id: "1",
      text: "Um, first what you want to do is go ahead and open up the settings page, you know, because that's where everything lives.",
      bucket: "procedure",
      confidence: 0.8,
      reason: "test"
    },
    {
      id: "2",
      text: "Then basically you're gonna want to click on the blue Save button and kind of wait for it to finish.",
      bucket: "procedure",
      confidence: 0.8,
      reason: "test"
    }
  ],
  tangents: [
    {
      id: "3",
      text: "By the way, the old settings page used to look different.",
      bucket: "tangent",
      confidence: 0.7,
      reason: "test"
    }
  ],
  noise: []
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDeterministicDraft", () => {
  it("creates a how-to scaffold from procedure segments", () => {
    const draft = createDeterministicDraft({
      procedure: [
        { id: "1", text: "First, open the admin page.", bucket: "procedure", confidence: 0.8, reason: "test" },
        { id: "2", text: "Then click Save.", bucket: "procedure", confidence: 0.8, reason: "test" }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.title).toBe("How to complete the process");
    expect(draft.steps).toEqual(["Open the admin page.", "Click Save."]);
    expect(draft.generationMode).toBe("deterministic");
  });

  it("rewrites rambling transcript fragments into concise instructions", () => {
    const draft = createDeterministicDraft({ ...messyFocus, tangents: [] });

    expect(draft.steps).toEqual(["Open the settings page.", "Click the blue Save button and wait for it to finish."]);
    expect(draft.overview).toBe("A concise procedure rewritten from the transcript.");
  });

  it("removes hedges and turns clipped fragments into full sentences", () => {
    expect(rewriteInstructionSentence("Ah, next just check the little status thing")).toBe("Check the status.");
    expect(rewriteInstructionSentence("I mean, make sure it's saved, kind of, before you close it")).toBe(
      "Make sure it is saved before you close it."
    );
  });

  it("breaks run-on spoken instructions into ordered process steps", () => {
    const draft = createDeterministicDraft({
      procedure: [
        {
          id: "1",
          text: "Okay so what I need you to do is first open the Unraid dashboard and then go to shares and after that select appdata then click export and save the file somewhere safe because that is where everything lives",
          bucket: "procedure",
          confidence: 0.8,
          reason: "test"
        }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.steps).toEqual([
      "Open the Unraid dashboard.",
      "Go to shares.",
      "Select appdata.",
      "Click export.",
      "Save the file somewhere safe."
    ]);
  });
});

describe("OllamaNoteProvider", () => {
  it("returns validated Ollama JSON as a polished draft", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          title: "How to save settings",
          overview: "Use the settings page to save the change.",
          prerequisites: [],
          steps: ["Open the settings page.", "Click the blue Save button and wait for it to finish."],
          warnings: ["Review parked tangents before sharing."],
          troubleshooting: []
        })
      })
    }));

    const draft = await new OllamaNoteProvider().generate(messyFocus);

    expect(draft.generationMode).toBe("ollama");
    expect(draft.steps).toEqual(["Open the settings page.", "Click the blue Save button and wait for it to finish."]);
  });

  it("falls back when Ollama returns invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "Here are the notes: open settings." })
    }));

    const draft = await new OllamaNoteProvider().generate(messyFocus);

    expect(draft.generationMode).toBe("deterministic");
    expect(draft.steps).toEqual(["Open the settings page.", "Click the blue Save button and wait for it to finish."]);
  });

  it("falls back when Ollama omits required full-sentence steps", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          title: "How to save settings",
          overview: "Use the settings page to save the change.",
          prerequisites: [],
          steps: ["open settings"],
          warnings: [],
          troubleshooting: []
        })
      })
    }));

    const draft = await new OllamaNoteProvider().generate(messyFocus);

    expect(draft.generationMode).toBe("deterministic");
    expect(draft.steps).toEqual(["Open the settings page.", "Click the blue Save button and wait for it to finish."]);
  });

  it("falls back when Ollama collapses multiple actions into one copied run-on step", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          title: "How to export appdata",
          overview: "Export appdata from Unraid.",
          prerequisites: [],
          steps: [
            "Okay so what I need you to do is first open the Unraid dashboard and then go to shares and after that select appdata then click export and save the file somewhere safe."
          ],
          warnings: [],
          troubleshooting: []
        })
      })
    }));

    const draft = await new OllamaNoteProvider().generate({
      procedure: [
        {
          id: "1",
          text: "Okay so what I need you to do is first open the Unraid dashboard and then go to shares and after that select appdata then click export and save the file somewhere safe because that is where everything lives.",
          bucket: "procedure",
          confidence: 0.8,
          reason: "test"
        }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.generationMode).toBe("deterministic");
    expect(draft.steps).toEqual([
      "Open the Unraid dashboard.",
      "Go to shares.",
      "Select appdata.",
      "Click export.",
      "Save the file somewhere safe."
    ]);
  });
});
