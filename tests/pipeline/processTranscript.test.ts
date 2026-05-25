import { describe, expect, it } from "vitest";
import { DeterministicNoteProvider } from "../../src/pipeline/noteGeneration";
import { processTranscript } from "../../src/pipeline/processTranscript";

describe("processTranscript", () => {
  it("processes pasted transcripts end to end", async () => {
    const result = await processTranscript({
      transcript: "Um, first open the page. This reminds me of the old tool. Then click Save."
    }, [new DeterministicNoteProvider()]);

    expect(result.speech.fillerTotal).toBe(1);
    expect(result.focus.procedure).toHaveLength(2);
    expect(result.focus.tangents).toHaveLength(1);
    expect(result.draft.steps).toEqual(["Open the page.", "Click Save."]);
    expect(result.warnings).toContain("Generated with deterministic cleanup because Ollama is unavailable or returned invalid output.");
  });

  it("rejects very short transcripts", async () => {
    await expect(processTranscript({ transcript: "Um." })).rejects.toThrow("Transcript is too short to process.");
  });

  it("rewrites messy pasted transcripts into concise full-sentence notes", async () => {
    const result = await processTranscript(
      {
        transcript: "Um, first what you want to do is go ahead and open up the settings page, you know, because that's where everything lives. Then basically you're gonna want to click on Save and kind of wait."
      },
      [new DeterministicNoteProvider()]
    );

    expect(result.draft.steps).toEqual(["Open the settings page.", "Click Save and wait."]);
  });

  it("turns run-on spoken procedures into an ordered process document", async () => {
    const result = await processTranscript(
      {
        transcript: "Okay so what I need you to do is first open the Unraid dashboard and then go to shares and after that select appdata then click export and save the file somewhere safe because that is where everything lives."
      },
      [new DeterministicNoteProvider()]
    );

    expect(result.draft.steps).toEqual([
      "Open the Unraid dashboard.",
      "Go to shares.",
      "Select appdata.",
      "Click export.",
      "Save the file somewhere safe."
    ]);
  });

  it("warns when an available provider falls back to deterministic generation", async () => {
    const result = await processTranscript(
      { transcript: "First open settings. Then click Save." },
      [
        {
          name: "ollama",
          isAvailable: async () => true,
          generate: async () => ({
            title: "How to complete the process",
            overview: "A concise procedure rewritten from the transcript.",
            prerequisites: [],
            steps: ["Open settings.", "Click Save."],
            warnings: [],
            troubleshooting: [],
            generationMode: "deterministic"
          })
        }
      ]
    );

    expect(result.warnings).toContain("Generated with deterministic cleanup because Ollama is unavailable or returned invalid output.");
  });
});
