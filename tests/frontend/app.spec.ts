import { expect, test } from "@playwright/test";

const statusResponse = {
  services: {
    ollama: { status: "ready", model: "llama3.2:3b" },
    whisper: { status: "ready" }
  }
};

const processResponse = {
  draft: {
    title: "How to Configure Backups",
    overview: "Configure backups clearly.",
    prerequisites: [],
    steps: ["Open the backup settings."],
    suggestions: [],
    warnings: [],
    troubleshooting: [],
    generationMode: "deterministic"
  },
  speech: {
    totalWords: 5,
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

test("renders transcript workflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tart Translator" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Transcript" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Audio" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate notes" })).toBeVisible();
  await expect(page.getByText("Ollama")).toBeVisible();
  await expect(page.getByText("Whisper")).toBeVisible();
});

test("shows progress while transcript notes are generated", async ({ page }) => {
  await page.route("**/api/status", async (route) => {
    await route.fulfill({ json: statusResponse });
  });

  let finishProcess: (() => void) | undefined;
  await page.route("**/api/process-transcript/stream", async (route) => {
    await new Promise<void>((resolve) => {
      finishProcess = resolve;
    });
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: [
        JSON.stringify({ type: "progress", stage: "Analyzing speech", progress: 24 }),
        JSON.stringify({ type: "result", result: processResponse })
      ].join("\n")
    });
  });

  await page.goto("/");
  await page.getByLabel("Raw transcript").fill("um so open the backup settings and then save it");
  await page.getByRole("button", { name: "Generate notes" }).click();

  const progress = page.getByRole("progressbar", { name: "Transcript progress" });
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", /3|24/);
  await expect(page.getByText(/Sending transcript|Analyzing speech/)).toBeVisible();

  finishProcess?.();
  await expect(progress).toBeHidden();
  await expect(page.getByRole("heading", { name: "How to Configure Backups" })).toBeVisible();
});

test("shows progress while audio is transcribed", async ({ page }) => {
  await page.route("**/api/status", async (route) => {
    await route.fulfill({ json: statusResponse });
  });

  let finishUpload: (() => void) | undefined;
  await page.route("**/api/upload-audio/stream", async (route) => {
    await new Promise<void>((resolve) => {
      finishUpload = resolve;
    });
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: [
        JSON.stringify({ type: "progress", stage: "Transcribing audio", progress: 36 }),
        JSON.stringify({
          type: "result",
          result: {
            fileName: "note.wav",
            status: "transcribed",
            message: "Audio transcribed locally.",
            transcript: "open the backup settings",
            result: processResponse
          }
        })
      ].join("\n")
    });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Audio" }).click();
  await page.getByLabel("Audio file").setInputFiles({
    name: "note.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("fake audio")
  });
  await page.getByRole("button", { name: "Generate notes" }).click();

  const progress = page.getByRole("progressbar", { name: "Audio progress" });
  await expect(progress).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", /5|36/);
  await expect(page.getByText(/Uploading audio|Transcribing audio/)).toBeVisible();

  finishUpload?.();
  await expect(progress).toBeHidden();
  await expect(page.getByText("Audio transcribed locally.")).toBeVisible();
});

test("lets users agree with suggested steps and undo them", async ({ page }) => {
  await page.route("**/api/status", async (route) => {
    await route.fulfill({ json: statusResponse });
  });

  await page.route("**/api/process-transcript/stream", async (route) => {
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: JSON.stringify({
        type: "result",
        result: {
          ...processResponse,
          draft: {
            ...processResponse.draft,
            title: "How to Save Settings",
            steps: ["Open settings.", "Click Save."],
            suggestions: [
              {
                id: "ollama-extra-step-1",
                text: "Confirm the changes.",
                reason: "Ollama suggested this extra step, but it was not found by the offline parser.",
                suggestedAfterStepIndex: 1
              }
            ],
            generationMode: "ollama",
            generationIssue: "Ollama suggested extra steps that need review."
          },
          warnings: ["Ollama suggested extra steps that need review."]
        }
      })
    });
  });

  await page.goto("/");
  await page.getByLabel("Raw transcript").fill("First open settings. Then click Save.");
  await page.getByRole("button", { name: "Generate notes" }).click();

  await expect(page.getByRole("heading", { name: "Suggestions", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Agree" }).click();

  await expect(page.getByRole("heading", { name: "Added Suggestions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Suggestions", exact: true })).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: "Confirm the changes." }).first()).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(page.getByRole("heading", { name: "Suggestions", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Added Suggestions" })).toBeHidden();
});
