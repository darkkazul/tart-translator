import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/frontend/App";
import type { ProcessTranscriptResponse, RuntimeStatus } from "../../src/shared/types";

const runtimeStatus: RuntimeStatus = {
  services: {
    ollama: { status: "ready", model: "llama3.2:3b" },
    whisper: { status: "ready" }
  }
};

const responseWithSuggestion: ProcessTranscriptResponse = {
  draft: {
    title: "How to Save Settings",
    overview: "Save the current settings.",
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
  },
  speech: {
    totalWords: 4,
    fillerHits: [],
    fillerTotal: 0,
    repeatedWordHits: [],
    repeatedWordTotal: 0,
    falseStartCount: 0,
    fillerTerms: []
  },
  focus: {
    procedure: [],
    tangents: [],
    noise: []
  },
  warnings: []
};

const responseWithoutSteps: ProcessTranscriptResponse = {
  ...responseWithSuggestion,
  draft: {
    title: "How to complete the process",
    overview: "No clear procedure steps were detected. Review the transcript and tangents.",
    prerequisites: [],
    steps: [],
    suggestions: [],
    warnings: [],
    troubleshooting: [],
    generationMode: "ollama"
  },
  focus: {
    procedure: [],
    tangents: [
      {
        id: "segment-1",
        text: "I am talking through possible step numbers.",
        bucket: "tangent",
        confidence: 0.55,
        reason: "Mentions placeholder steps without concrete actions."
      }
    ],
    noise: []
  },
  warnings: []
};

const mocks = vi.hoisted(() => ({
  streamProcessTranscriptRequest: vi.fn()
}));

vi.mock("../../src/frontend/api", () => ({
  getRuntimeStatusRequest: vi.fn(async () => runtimeStatus),
  streamAudioUploadRequest: vi.fn(),
  streamProcessTranscriptRequest: mocks.streamProcessTranscriptRequest
}));

afterEach(() => {
  vi.clearAllMocks();
  mocks.streamProcessTranscriptRequest.mockResolvedValue(responseWithSuggestion);
});

describe("App suggestions", () => {
  it("promotes an agreed suggestion into steps and supports undo", async () => {
    mocks.streamProcessTranscriptRequest.mockResolvedValue(responseWithSuggestion);
    render(<App />);

    fireEvent.change(screen.getByLabelText("Raw transcript"), {
      target: { value: "First open settings. Then click Save." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate notes" }));

    await screen.findByRole("heading", { name: "Suggestions" });
    expect(screen.getByText("Confirm the changes.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Agree" }));

    await waitFor(() => {
      const steps = screen.getAllByRole("listitem").map((item) => item.textContent);
      expect(steps).toContain("Confirm the changes.");
    });
    expect(screen.queryByRole("heading", { name: "Suggestions" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await screen.findByRole("heading", { name: "Suggestions" });
    expect(screen.getByText("Confirm the changes.")).toBeInTheDocument();
  });

  it("shows a clear empty state when no concrete steps are detected", async () => {
    mocks.streamProcessTranscriptRequest.mockResolvedValueOnce(responseWithoutSteps);

    render(<App />);

    fireEvent.change(screen.getByLabelText("Raw transcript"), {
      target: { value: "I am talking through possible step numbers." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate notes" }));

    await screen.findByText("No concrete procedure steps were detected in this transcript.");
    const draftPanel = screen.getByRole("heading", { name: "How-to Draft" }).closest("article");
    expect(within(draftPanel as HTMLElement).queryByRole("list")).not.toBeInTheDocument();
    const focusPanel = screen.getByRole("heading", { name: "Focus Review" }).closest("article");
    expect(within(focusPanel as HTMLElement).getByText("I am talking through possible step numbers.")).toBeInTheDocument();
  });
});
