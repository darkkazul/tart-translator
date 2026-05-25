import cors from "cors";
import express from "express";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorRequestHandler } from "express";
import { formatServerError } from "./errors";
import { handleAudioUpload, handleProcessTranscriptBody, processTranscriptBody } from "./handlers";
import { handleRuntimeStatus } from "./status";
import { upload } from "./uploads";

export interface CreateServerOptions {
  corsOrigin?: string;
  staticDir?: string | false;
}

export function createServer(options: CreateServerOptions = {}) {
  const app = express();

  if (options.corsOrigin) {
    app.use(cors({ origin: options.corsOrigin }));
  }

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/status", async (_req, res) => {
    const result = await handleRuntimeStatus();
    res.status(result.status).json(result.body);
  });

  app.post("/api/process-transcript", async (req, res) => {
    const result = await handleProcessTranscriptBody(req.body);
    res.status(result.status).json(result.body);
  });

  app.post("/api/process-transcript/stream", async (req, res) => {
    startEventStream(res);
    const result = await processTranscriptBody(req.body, (stage, progress) => {
      writeStreamEvent(res, { type: "progress", stage, progress });
    });

    if (result.status === 200) {
      writeStreamEvent(res, { type: "result", result: result.body });
    } else {
      writeStreamEvent(res, {
        type: "error",
        error: result.body && typeof result.body === "object" && "error" in result.body
          ? String(result.body.error)
          : "Processing failed."
      });
    }
    res.end();
  });

  app.post("/api/upload-audio", upload.single("audio"), async (req, res) => {
    try {
      const result = await handleAudioUpload(req.file);
      res.status(result.status).json(result.body);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Audio processing failed." });
    } finally {
      if (req.file?.path) {
        await rm(req.file.path, { force: true });
      }
    }
  });

  app.post("/api/upload-audio/stream", upload.single("audio"), async (req, res) => {
    startEventStream(res);
    try {
      const result = await handleAudioUpload(req.file, undefined, (stage, progress) => {
        writeStreamEvent(res, { type: "progress", stage, progress });
      });

      if (result.status === 200) {
        writeStreamEvent(res, { type: "result", result: result.body });
      } else {
        writeStreamEvent(res, {
          type: "error",
          error: result.body && typeof result.body === "object" && "error" in result.body
            ? String(result.body.error)
            : "Audio processing failed."
        });
      }
    } catch (error) {
      writeStreamEvent(res, { type: "error", error: error instanceof Error ? error.message : "Audio processing failed." });
    } finally {
      if (req.file?.path) {
        await rm(req.file.path, { force: true });
      }
      res.end();
    }
  });

  if (options.staticDir !== false) {
    const staticDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../", options.staticDir ?? "dist/client");
    app.use(express.static(staticDir));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const formatted = formatServerError(error);
    res.status(formatted.status).json(formatted.body);
  };
  app.use(errorHandler);

  return app;
}

function startEventStream(res: express.Response) {
  res.status(200);
  res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
  res.setHeader("cache-control", "no-cache, no-transform");
  res.flushHeaders?.();
}

function writeStreamEvent(res: express.Response, event: unknown) {
  res.write(`${JSON.stringify(event)}\n`);
}
