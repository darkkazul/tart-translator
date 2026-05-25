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
    expect(result.warnings).toEqual([]);
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

  it("parks vague placeholder step chatter instead of treating it as a procedure", async () => {
    const result = await processTranscript(
      {
        transcript: "I'm just kind of talking to try to figure out if this thing or anything's working and all done remotely and then you know we might need to go through and do point step one and then afterwards I think we continue with step two and then I think we go from there and continue to do step four and then maybe we go back to three at some point."
      },
      [new DeterministicNoteProvider()]
    );

    expect(result.focus.procedure).toEqual([]);
    expect(result.focus.tangents).toHaveLength(1);
    expect(result.draft.steps).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("does not warn when the offline parser successfully rescues an Ollama issue", async () => {
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
            suggestions: [],
            warnings: [],
            troubleshooting: [],
            generationMode: "deterministic",
            generationIssue: "Ollama collapsed multiple parser steps into fewer steps."
          })
        }
      ]
    );

    expect(result.warnings).toEqual([]);
  });

  it("warns when an available provider falls back without usable deterministic steps", async () => {
    const result = await processTranscript(
      { transcript: "First open settings. Then click Save." },
      [
        {
          name: "ollama",
          isAvailable: async () => true,
          generate: async () => ({
            title: "How to complete the process",
            overview: "No clear procedure steps were detected. Review the transcript and tangents.",
            prerequisites: [],
            steps: [],
            suggestions: [],
            warnings: [],
            troubleshooting: [],
            generationMode: "deterministic",
            generationIssue: "Ollama response failed draft validation."
          })
        }
      ]
    );

    expect(result.warnings).toContain(
      "Ollama was available, but the offline parser was used: Ollama response failed draft validation."
    );
  });

  it("warns when Ollama returns review suggestions", async () => {
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
            suggestions: [
              {
                id: "ollama-extra-step-1",
                text: "Confirm the changes.",
                reason: "Ollama suggested this extra step, but it was not found by the offline parser.",
                suggestedAfterStepIndex: 1
              }
            ],
            warnings: [],
            troubleshooting: [],
            generationMode: "ollama",
            generationIssue: "Ollama suggested extra steps that need review."
          })
        }
      ]
    );

    expect(result.warnings).toContain("Ollama suggested extra steps that need review.");
  });

  it("warns when Ollama is unavailable before using the offline parser", async () => {
    const result = await processTranscript(
      { transcript: "First open settings. Then click Save." },
      [
        {
          name: "ollama",
          isAvailable: async () => false,
          generate: async () => {
            throw new Error("should not generate");
          }
        },
        new DeterministicNoteProvider()
      ]
    );

    expect(result.warnings).toContain("Ollama was unavailable, so the offline parser was used.");
  });
});
