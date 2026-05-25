import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OllamaNoteProvider,
  createDeterministicDraft,
  rewriteInstructionSentence
} from "../../src/pipeline/noteGeneration";
import { classifyTranscript } from "../../src/pipeline/contentClassification";
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

  it("rewrites conversational action verbs into process steps", () => {
    const draft = createDeterministicDraft({
      procedure: [
        {
          id: "1",
          text: "The thing you do is head over to settings and hit Save.",
          bucket: "procedure",
          confidence: 0.78,
          reason: "test"
        }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.steps).toEqual(["Go to settings.", "Click Save."]);
  });

  it("keeps the first step when the speaker says 'you' before the action", () => {
    const draft = createDeterministicDraft({
      procedure: [
        { id: "1", text: "First you open the dashboard.", bucket: "procedure", confidence: 0.8, reason: "test" },
        { id: "2", text: "Then click Save.", bucket: "procedure", confidence: 0.8, reason: "test" }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.steps).toEqual(["Open the dashboard.", "Click Save."]);
  });

  it("turns punctuation-free run-on speech into ordered process steps end to end", () => {
    const draft = createDeterministicDraft(
      classifyTranscript("first you open the dashboard then go to shares then click export")
    );

    expect(draft.steps).toEqual(["Open the dashboard.", "Go to shares.", "Click export."]);
  });

  it("does not turn vague planning chatter into a raw procedure step", () => {
    const draft = createDeterministicDraft({
      procedure: [
        {
          id: "1",
          text: "I am just talking to figure out if this thing is working remotely and then we might need to do point step one and then continue with step two.",
          bucket: "procedure",
          confidence: 0.78,
          reason: "test"
        }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.steps).toEqual([]);
    expect(draft.overview).toBe("No clear procedure steps were detected. Review the transcript and tangents.");
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

  it("requests Ollama JSON mode with deterministic decoding", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          title: "How to save settings",
          overview: "Use the settings page to save the change.",
          prerequisites: [],
          steps: ["Open the settings page.", "Click Save."],
          warnings: [],
          troubleshooting: []
        })
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    await new OllamaNoteProvider().generate(messyFocus);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(requestBody).toMatchObject({
      format: "json",
      options: {
        temperature: 0,
        seed: 42
      }
    });
    expect(requestBody.prompt).toContain("A valid step starts with a concrete action the user should perform.");
    expect(requestBody.prompt).toContain("If the transcript does not contain a real procedure, return an empty steps array.");
    expect(requestBody.prompt).toContain("Do not output steps like");
    expect(requestBody.prompt).toContain("Identify the main objective");
    expect(requestBody.prompt).toContain("Return only valid JSON.");
  });

  it("accepts empty Ollama steps when no grounded procedure actions exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          title: "How to complete the process",
          overview: "No clear procedure steps were detected.",
          prerequisites: [],
          steps: [],
          warnings: [],
          troubleshooting: []
        })
      })
    }));

    const draft = await new OllamaNoteProvider().generate({
      procedure: [
        {
          id: "1",
          text: "I am just talking through the idea and we might do step one later.",
          bucket: "procedure",
          confidence: 0.78,
          reason: "test"
        }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.generationMode).toBe("ollama");
    expect(draft.steps).toEqual([]);
    expect(draft.suggestions).toEqual([]);
  });

  it("fills safe metadata when Ollama returns empty metadata for no procedure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          title: "",
          overview: "",
          prerequisites: [],
          steps: [],
          warnings: [],
          troubleshooting: []
        })
      })
    }));

    const draft = await new OllamaNoteProvider().generate({
      procedure: [
        {
          id: "1",
          text: "I am just talking through the idea and we might do step one later.",
          bucket: "procedure",
          confidence: 0.78,
          reason: "test"
        }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.generationMode).toBe("ollama");
    expect(draft.title).toBe("How to complete the process");
    expect(draft.overview).toBe("No clear procedure steps were detected. Review the transcript and tangents.");
    expect(draft.steps).toEqual([]);
    expect(draft.generationIssue).toBeUndefined();
  });

  it("accepts an empty Ollama object when no grounded procedure actions exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "{}" })
    }));

    const draft = await new OllamaNoteProvider().generate({
      procedure: [
        {
          id: "1",
          text: "I am just talking through the idea and we might do step one later.",
          bucket: "procedure",
          confidence: 0.78,
          reason: "test"
        }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.generationMode).toBe("ollama");
    expect(draft.title).toBe("How to complete the process");
    expect(draft.overview).toBe("No clear procedure steps were detected. Review the transcript and tangents.");
    expect(draft.steps).toEqual([]);
    expect(draft.suggestions).toEqual([]);
  });

  it("accepts grounded Ollama steps when the offline parser misses conversational actions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          title: "How to save settings",
          overview: "Save settings from the settings page.",
          prerequisites: [],
          steps: ["Open settings.", "Click Save."],
          warnings: [],
          troubleshooting: []
        })
      })
    }));

    const draft = await new OllamaNoteProvider().generate({
      procedure: [
        {
          id: "1",
          text: "The thing you do is head over to settings and hit Save.",
          bucket: "procedure",
          confidence: 0.78,
          reason: "test"
        }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.generationMode).toBe("ollama");
    expect(draft.steps).toEqual(["Open settings.", "Click Save."]);
    expect(draft.suggestions).toEqual([]);
    expect(draft.generationIssue).toBeUndefined();
  });

  it("rejects Ollama steps copied from prompt examples instead of grounded transcript details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          title: "How to save settings",
          overview: "Save settings from the settings page.",
          prerequisites: [],
          steps: ["Open the Unraid dashboard."],
          warnings: [],
          troubleshooting: []
        })
      })
    }));

    const draft = await new OllamaNoteProvider().generate({
      procedure: [
        {
          id: "1",
          text: "The thing you do is head over to settings and hit Save.",
          bucket: "procedure",
          confidence: 0.78,
          reason: "test"
        }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.generationMode).toBe("deterministic");
    expect(draft.steps).toEqual(["Go to settings.", "Click Save."]);
    expect(draft.generationIssue).toBe("Ollama collapsed multiple parser steps into fewer steps.");
  });

  it("accepts Ollama JSON wrapped in prose with None array fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: [
          "Here is the rewritten version in JSON format:",
          "",
          "{",
          "  \"title\": \"How to save settings\",",
          "  \"overview\": \"Use the settings page to save the change.\",",
          "  \"prerequisites\": None,",
          "  \"steps\": [\"Open settings.\", \"Click Save.\"],",
          "  \"warnings\": None,",
          "  \"troubleshooting\": None",
          "}"
        ].join("\n")
      })
    }));

    const draft = await new OllamaNoteProvider().generate({
      procedure: [
        { id: "1", text: "First open settings.", bucket: "procedure", confidence: 0.8, reason: "test" },
        { id: "2", text: "Then click Save.", bucket: "procedure", confidence: 0.8, reason: "test" }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.generationMode).toBe("ollama");
    expect(draft.prerequisites).toEqual([]);
    expect(draft.steps).toEqual(["Open settings.", "Click Save."]);
    expect(draft.warnings).toEqual([]);
    expect(draft.troubleshooting).toEqual([]);
  });

  it("accepts Ollama step objects and null optional arrays", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: [
          "Here is the rewritten JSON format:",
          "",
          "{",
          "  \"title\": \"Concise How-To Notes\",",
          "  \"overview\": \"Rewritten transcript segments into concise how-to notes.\",",
          "  \"prerequisites\": null,",
          "  \"steps\": [",
          "    { \"id\": \"step-1\", \"text\": \"Open settings.\" },",
          "    { \"id\": \"step-2\", \"text\": \"Click Save.\" }",
          "  ],",
          "  \"warnings\": [],",
          "  \"troubleshooting\": []",
          "}"
        ].join("\n")
      })
    }));

    const draft = await new OllamaNoteProvider().generate({
      procedure: [
        { id: "1", text: "First open settings.", bucket: "procedure", confidence: 0.8, reason: "test" },
        { id: "2", text: "Then click Save.", bucket: "procedure", confidence: 0.8, reason: "test" }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.generationMode).toBe("ollama");
    expect(draft.prerequisites).toEqual([]);
    expect(draft.steps).toEqual(["Open settings.", "Click Save."]);
  });

  it("falls back when Ollama returns invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "Here are the notes: open settings." })
    }));

    const draft = await new OllamaNoteProvider().generate(messyFocus);

    expect(draft.generationMode).toBe("deterministic");
    expect(draft.generationIssue).toBe("Ollama response did not contain a JSON object.");
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
    expect(draft.generationIssue).toBe("Ollama returned a step that was not a complete sentence.");
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
    expect(draft.generationIssue).toBe("Ollama collapsed multiple parser steps into fewer steps.");
    expect(draft.steps).toEqual([
      "Open the Unraid dashboard.",
      "Go to shares.",
      "Select appdata.",
      "Click export.",
      "Save the file somewhere safe."
    ]);
  });

  it("parks Ollama-added extra steps as review suggestions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          title: "How to save settings",
          overview: "Use the settings page to save changes.",
          prerequisites: [],
          steps: [
            "Open settings.",
            "Wait for settings to finish saving.",
            "Click Save."
          ],
          warnings: [],
          troubleshooting: []
        })
      })
    }));

    const draft = await new OllamaNoteProvider().generate({
      procedure: [
        { id: "1", text: "First open settings.", bucket: "procedure", confidence: 0.8, reason: "test" },
        { id: "2", text: "Then click Save.", bucket: "procedure", confidence: 0.8, reason: "test" }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.generationMode).toBe("ollama");
    expect(draft.generationIssue).toBe("Ollama suggested extra steps that need review.");
    expect(draft.steps).toEqual(["Open settings.", "Click Save."]);
    expect(draft.suggestions).toEqual([
      {
        id: "ollama-extra-step-1",
        text: "Wait for settings to finish saving.",
        reason: "Ollama suggested this extra step, but it was not found by the offline parser.",
        suggestedAfterStepIndex: 0
      }
    ]);
  });

  it("filters Ollama meta-suggestions that are about writing the notes instead of doing the procedure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          title: "Concise How-To Notes",
          overview: "Break down long spoken instructions into separate steps.",
          prerequisites: [],
          steps: [
            "Identify the main task or objective of the procedure.",
            "Split the instruction into individual steps based on key words like first, then, next, and after that.",
            "Organize the steps in a logical order.",
            "Review and refine the steps to ensure clarity and completeness."
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
          text: "I am just talking to try to figure out if this thing is working remotely and then we might need to do point step one and then continue with step two.",
          bucket: "procedure",
          confidence: 0.78,
          reason: "test"
        }
      ],
      tangents: [],
      noise: []
    });

    expect(draft.generationMode).toBe("deterministic");
    expect(draft.generationIssue).toBe("Ollama returned steps without grounded procedure actions.");
    expect(draft.steps).toEqual([]);
    expect(draft.suggestions).toEqual([]);
  });
});
