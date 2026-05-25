import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { WhisperCliTranscriptionProvider } from "../../src/pipeline/transcription";

describe("WhisperCliTranscriptionProvider", () => {
  it("transcribes audio by calling whisper.cpp with safe argv and reading text output", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "tart-whisper-test-"));
    const audioPath = path.join(workDir, "audio.wav");
    const binaryPath = path.join(workDir, "whisper-cli");
    const modelPath = path.join(workDir, "ggml-small.en.bin");
    await writeFile(audioPath, "fake audio");
    await writeFile(binaryPath, "fake binary");
    await writeFile(modelPath, "fake model");

    const execFile = vi.fn(async (_bin: string, args: string[]) => {
      const outputPrefix = args[args.indexOf("--output-file") + 1];
      await writeFile(`${outputPrefix}.txt`, "  First open the settings page.  \n");
      return { stdout: "", stderr: "" };
    });

    try {
      const provider = new WhisperCliTranscriptionProvider({
        binaryPath,
        modelPath,
        execFile,
        outputDir: workDir
      });

      await expect(provider.isAvailable()).resolves.toBe(true);
      await expect(provider.transcribe(audioPath)).resolves.toBe("First open the settings page.");

      expect(execFile).toHaveBeenCalledWith(
        binaryPath,
        expect.arrayContaining([
          "--model",
          modelPath,
          "--file",
          audioPath,
          "--output-txt",
          "--no-timestamps"
        ])
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it("can disable whisper.cpp GPU execution for Macs where Metal crashes", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "tart-whisper-test-"));
    const audioPath = path.join(workDir, "audio.wav");
    const binaryPath = path.join(workDir, "whisper-cli");
    const modelPath = path.join(workDir, "ggml-small.en.bin");
    await writeFile(audioPath, "fake audio");
    await writeFile(binaryPath, "fake binary");
    await writeFile(modelPath, "fake model");

    const execFile = vi.fn(async (_bin: string, args: string[]) => {
      const outputPrefix = args[args.indexOf("--output-file") + 1];
      await writeFile(`${outputPrefix}.txt`, "Open settings.");
      return { stdout: "", stderr: "" };
    });

    try {
      const provider = new WhisperCliTranscriptionProvider({
        binaryPath,
        modelPath,
        execFile,
        outputDir: workDir,
        noGpu: true
      });

      await provider.transcribe(audioPath);

      expect(execFile.mock.calls[0][1]).toContain("--no-gpu");
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it("throws a clear error when whisper.cpp does not create an output file", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "tart-whisper-test-"));
    const audioPath = path.join(workDir, "audio.wav");
    const binaryPath = path.join(workDir, "whisper-cli");
    const modelPath = path.join(workDir, "ggml-small.en.bin");
    await writeFile(audioPath, "fake audio");
    await writeFile(binaryPath, "fake binary");
    await writeFile(modelPath, "fake model");

    try {
      const provider = new WhisperCliTranscriptionProvider({
        binaryPath,
        modelPath,
        execFile: vi.fn(async () => ({ stdout: "", stderr: "" })),
        outputDir: workDir
      });

      await expect(provider.transcribe(audioPath)).rejects.toThrow("Whisper did not produce a transcript output file.");
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it("is unavailable when the binary or model path is missing", async () => {
    const provider = new WhisperCliTranscriptionProvider({
      binaryPath: "",
      modelPath: "/models/ggml-small.en.bin",
      execFile: vi.fn(),
      outputDir: tmpdir()
    });

    await expect(provider.isAvailable()).resolves.toBe(false);
  });
});
