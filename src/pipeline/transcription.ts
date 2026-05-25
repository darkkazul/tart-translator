import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const defaultExecFile = promisify(execFileCallback);

export interface TranscriptionProvider {
  isAvailable(): Promise<boolean>;
  transcribe(audioPath: string): Promise<string>;
}

type ExecFile = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

export interface WhisperCliTranscriptionOptions {
  binaryPath?: string;
  modelPath?: string;
  language?: string;
  threads?: string;
  noGpu?: boolean;
  outputDir?: string;
  execFile?: ExecFile;
}

export class WhisperCliTranscriptionProvider implements TranscriptionProvider {
  private readonly binaryPath: string;
  private readonly modelPath: string;
  private readonly language?: string;
  private readonly threads?: string;
  private readonly noGpu: boolean;
  private readonly outputDir: string;
  private readonly execFile: ExecFile;

  constructor(options: WhisperCliTranscriptionOptions = {}) {
    this.binaryPath = options.binaryPath ?? process.env.WHISPER_CPP_BIN ?? "";
    this.modelPath = options.modelPath ?? process.env.WHISPER_MODEL_PATH ?? "";
    this.language = options.language ?? process.env.WHISPER_LANGUAGE;
    this.threads = options.threads ?? process.env.WHISPER_THREADS;
    this.noGpu = options.noGpu ?? process.env.WHISPER_NO_GPU === "true";
    this.outputDir = options.outputDir ?? tmpdir();
    this.execFile = options.execFile ?? defaultExecFile;
  }

  async isAvailable() {
    if (!this.binaryPath || !this.modelPath) return false;

    try {
      await Promise.all([access(this.binaryPath), access(this.modelPath)]);
      return true;
    } catch {
      return false;
    }
  }

  async transcribe(audioPath: string) {
    const outputPrefix = path.join(this.outputDir, `tart-whisper-${randomUUID()}`);
    const args = [
      "--model",
      this.modelPath,
      "--file",
      audioPath,
      "--output-txt",
      "--output-file",
      outputPrefix,
      "--no-timestamps"
    ];

    if (this.language) args.push("--language", this.language);
    if (this.threads) args.push("--threads", this.threads);
    if (this.noGpu) args.push("--no-gpu");

    await this.execFile(this.binaryPath, args);

    const outputPath = `${outputPrefix}.txt`;
    try {
      return (await readFile(outputPath, "utf8")).replace(/\s+/g, " ").trim();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error("Whisper did not produce a transcript output file.");
      }

      throw error;
    } finally {
      await rm(outputPath, { force: true });
    }
  }
}
