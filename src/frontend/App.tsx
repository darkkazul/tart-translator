import React, { useEffect, useMemo, useState } from "react";
import { ACCEPTED_AUDIO_FORMAT_LABEL, ACCEPTED_AUDIO_INPUT_ACCEPT, DEFAULT_FILLER_TERMS } from "../shared/defaults";
import type { DraftSuggestion, ProcessTranscriptResponse, RuntimeStatus, ServiceStatus } from "../shared/types";
import { getRuntimeStatusRequest, streamAudioUploadRequest, streamProcessTranscriptRequest } from "./api";

type Tab = "transcript" | "audio";
type ProgressState = {
  mode: Tab;
  stage: string;
  value: number;
};
type PromotedSuggestion = {
  suggestion: DraftSuggestion;
};
type DisplayStep = { text: string; key: string };

// Build the displayed step list from the immutable generated steps plus any
// agreed suggestions, keyed by identity. suggestedAfterStepIndex refers to a
// position in the base steps, so the merge is stable across agree/undo cycles
// and never removes the wrong step when texts collide.
function mergeStepsWithSuggestions(baseSteps: string[], promoted: PromotedSuggestion[]): DisplayStep[] {
  const afterBaseIndex = new Map<number, DraftSuggestion[]>();
  const atEnd: DraftSuggestion[] = [];

  const ordered = [...promoted]
    .map((entry) => entry.suggestion)
    .sort((left, right) => {
      const leftIndex = left.suggestedAfterStepIndex ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = right.suggestedAfterStepIndex ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex || left.id.localeCompare(right.id);
    });

  for (const suggestion of ordered) {
    const after = suggestion.suggestedAfterStepIndex;
    if (typeof after === "number" && after >= 0 && after < baseSteps.length) {
      const list = afterBaseIndex.get(after) ?? [];
      list.push(suggestion);
      afterBaseIndex.set(after, list);
    } else {
      atEnd.push(suggestion);
    }
  }

  const merged: DisplayStep[] = [];
  baseSteps.forEach((text, index) => {
    merged.push({ text, key: `step-${index}` });
    for (const suggestion of afterBaseIndex.get(index) ?? []) {
      merged.push({ text: suggestion.text, key: suggestion.id });
    }
  });
  for (const suggestion of atEnd) {
    merged.push({ text: suggestion.text, key: suggestion.id });
  }
  return merged;
}

export function App() {
  const [tab, setTab] = useState<Tab>("transcript");
  const [transcript, setTranscript] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [fillerTerms, setFillerTerms] = useState(DEFAULT_FILLER_TERMS.join(", "));
  const [result, setResult] = useState<ProcessTranscriptResponse | null>(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [promotedSuggestions, setPromotedSuggestions] = useState<PromotedSuggestion[]>([]);

  const parsedFillerTerms = useMemo(
    () => fillerTerms.split(",").map((term) => term.trim()).filter(Boolean),
    [fillerTerms]
  );

  // The generated steps stay immutable; agreed suggestions are merged in for
  // display by identity, so undo never has to guess which step to remove.
  const displaySteps = useMemo(
    () => mergeStepsWithSuggestions(result?.draft.steps ?? [], promotedSuggestions),
    [result, promotedSuggestions]
  );

  useEffect(() => {
    let isMounted = true;

    getRuntimeStatusRequest()
      .then((status) => {
        if (isMounted) setRuntimeStatus(status);
      })
      .catch(() => {
        if (isMounted) {
          setRuntimeStatus({
            services: {
              ollama: { status: "offline", model: "unknown" },
              whisper: { status: "not-configured" }
            }
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function generateNotes() {
    setError("");
    setStatusMessage("");
    setProgress({ mode: tab, stage: tab === "audio" ? "Uploading audio" : "Sending transcript", value: tab === "audio" ? 5 : 3 });
    setIsProcessing(true);
    try {
      if (tab === "audio") {
        if (!audioFile) throw new Error("Choose an audio file first.");

        const upload = await streamAudioUploadRequest(audioFile, (event) => {
          setProgress({ mode: "audio", stage: event.stage, value: event.progress });
        });
        setStatusMessage(upload.message);
        if (upload.transcript) setTranscript(upload.transcript);
        if (upload.result) applyResult(upload.result);
        return;
      }

      applyResult(await streamProcessTranscriptRequest(
        { transcript, fillerTerms: parsedFillerTerms, mode: "how-to" },
        (event) => {
          setProgress({ mode: "transcript", stage: event.stage, value: event.progress });
        }
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed.");
    } finally {
      setIsProcessing(false);
      setProgress(null);
    }
  }

  function applyResult(nextResult: ProcessTranscriptResponse) {
    setPromotedSuggestions([]);
    setResult(nextResult);
  }

  function agreeWithSuggestion(suggestion: DraftSuggestion) {
    setResult((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              suggestions: current.draft.suggestions.filter((candidate) => candidate.id !== suggestion.id)
            }
          }
        : current
    );
    setPromotedSuggestions((current) => [...current, { suggestion }]);
  }

  function undoSuggestion(suggestion: DraftSuggestion) {
    setResult((current) => {
      if (!current) return current;

      const restoredSuggestions = [...current.draft.suggestions, suggestion].sort((left, right) => {
        const leftIndex = left.suggestedAfterStepIndex ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = right.suggestedAfterStepIndex ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex || left.id.localeCompare(right.id);
      });

      return { ...current, draft: { ...current.draft, suggestions: restoredSuggestions } };
    });
    setPromotedSuggestions((current) => current.filter((item) => item.suggestion.id !== suggestion.id));
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Tart Translator</h1>
            <p>Turn rambling explanations into focused how-to notes.</p>
          </div>
          <div className="service-status" aria-label="Local service status">
            <StatusPill label="Ollama" status={runtimeStatus?.services.ollama.status} detail={runtimeStatus?.services.ollama.model} />
            <StatusPill label="Whisper" status={runtimeStatus?.services.whisper.status} />
          </div>
        </header>

        <section className="input-panel" aria-label="Input">
          <div className="tabs" role="tablist" aria-label="Input mode">
            <button role="tab" aria-selected={tab === "transcript"} onClick={() => setTab("transcript")}>
              Transcript
            </button>
            <button role="tab" aria-selected={tab === "audio"} onClick={() => setTab("audio")}>
              Audio
            </button>
          </div>

          {tab === "transcript" ? (
            <label className="field">
              <span>Raw transcript</span>
              <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} rows={10} />
            </label>
          ) : (
            <div className="audio-placeholder">
              <label className="field">
                <span>Audio file</span>
                <input
                  type="file"
                  accept={ACCEPTED_AUDIO_INPUT_ACCEPT}
                  onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <p>Upload {ACCEPTED_AUDIO_FORMAT_LABEL} audio to transcribe with local whisper.cpp when configured.</p>
            </div>
          )}

          <label className="field">
            <span>Filler terms</span>
            <input value={fillerTerms} onChange={(event) => setFillerTerms(event.target.value)} />
          </label>

          <button
            className="primary-action"
            onClick={generateNotes}
            disabled={isProcessing || (tab === "transcript" ? transcript.trim().length === 0 : !audioFile)}
          >
            {isProcessing ? "Generating..." : "Generate notes"}
          </button>
          {progress ? <ProcessingProgress progress={progress} /> : null}
          {statusMessage ? <p className="muted">{statusMessage}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>

        <section className="results-grid" aria-label="Results">
          <article>
            <h2>How-to Draft</h2>
            {result ? (
              <>
                <h3>{result.draft.title}</h3>
                <p className="draft-mode">
                  {result.draft.generationMode === "ollama" ? "Generated with Ollama" : "Generated with offline parser"}
                </p>
                <p>{result.draft.overview}</p>
                {result.draft.prerequisites.length > 0 ? (
                  <>
                    <h3>Prerequisites</h3>
                    <ul>{result.draft.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul>
                  </>
                ) : null}
                <h3>Steps</h3>
                {displaySteps.length > 0 ? (
                  <ol>{displaySteps.map((step) => <li key={step.key}>{step.text}</li>)}</ol>
                ) : (
                  <p className="empty-state">No concrete procedure steps were detected in this transcript.</p>
                )}
                {result.draft.suggestions.length > 0 ? (
                  <DraftSuggestions suggestions={result.draft.suggestions} onAgree={agreeWithSuggestion} />
                ) : null}
                {promotedSuggestions.length > 0 ? (
                  <PromotedSuggestions suggestions={promotedSuggestions} onUndo={undoSuggestion} />
                ) : null}
                {result.draft.warnings.length > 0 || result.warnings.length > 0 ? (
                  <>
                    <h3>Warnings</h3>
                    <ul>{[...result.draft.warnings, ...result.warnings].map((warning) => <li key={warning}>{warning}</li>)}</ul>
                  </>
                ) : null}
                {result.draft.troubleshooting.length > 0 ? (
                  <>
                    <h3>Troubleshooting</h3>
                    <ul>{result.draft.troubleshooting.map((item) => <li key={item}>{item}</li>)}</ul>
                  </>
                ) : null}
              </>
            ) : (
              <p className="muted">Generated procedure notes will appear here.</p>
            )}
          </article>

          <article>
            <h2>Speech Report</h2>
            {result ? (
              <dl>
                <dt>Total words</dt>
                <dd>{result.speech.totalWords}</dd>
                <dt>Strict fillers</dt>
                <dd>{result.speech.fillerTotal}</dd>
                <dt>Repeated words</dt>
                <dd>{result.speech.repeatedWordTotal}</dd>
                <dt>False starts</dt>
                <dd>{result.speech.falseStartCount}</dd>
              </dl>
            ) : (
              <p className="muted">Filler and disfluency counts will appear here.</p>
            )}
          </article>

          <article>
            <h2>Focus Review</h2>
            {result ? (
              <>
                <h3>Tangents</h3>
                <ul>{result.focus.tangents.map((segment) => <li key={segment.id}>{segment.text}</li>)}</ul>
                <h3>Noise</h3>
                <ul>{result.focus.noise.map((segment) => <li key={segment.id}>{segment.text}</li>)}</ul>
              </>
            ) : (
              <p className="muted">Parked tangents and low-confidence material will appear here.</p>
            )}
          </article>
        </section>
      </section>
    </main>
  );
}

function DraftSuggestions({
  suggestions,
  onAgree
}: {
  suggestions: DraftSuggestion[];
  onAgree: (suggestion: DraftSuggestion) => void;
}) {
  return (
    <section className="suggestion-panel" aria-label="Suggestions">
      <h3>Suggestions</h3>
      <ul className="suggestion-list">
        {suggestions.map((suggestion) => (
          <li key={suggestion.id}>
            <p>{suggestion.text}</p>
            <small>{suggestion.reason}</small>
            <button type="button" onClick={() => onAgree(suggestion)}>
              Agree
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PromotedSuggestions({
  suggestions,
  onUndo
}: {
  suggestions: PromotedSuggestion[];
  onUndo: (suggestion: DraftSuggestion) => void;
}) {
  return (
    <section className="suggestion-panel accepted" aria-label="Added suggestions">
      <h3>Added Suggestions</h3>
      <ul className="suggestion-list">
        {suggestions.map(({ suggestion }) => (
          <li key={suggestion.id}>
            <p>{suggestion.text}</p>
            <small>Added to the process steps.</small>
            <button type="button" onClick={() => onUndo(suggestion)}>
              Undo
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProcessingProgress({ progress }: { progress: ProgressState }) {
  const label = `${progress.mode === "audio" ? "Audio" : "Transcript"} progress`;

  return (
    <div className="processing-progress">
      <div className="progress-copy">
        <span>{progress.stage}</span>
        <strong>{progress.value}%</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.value}
      >
        <span style={{ width: `${progress.value}%` }} />
      </div>
    </div>
  );
}

function StatusPill({
  label,
  status,
  detail
}: {
  label: string;
  status?: ServiceStatus;
  detail?: string;
}) {
  const resolvedStatus = status ?? "offline";
  const text = status ? statusText(status) : "Checking";

  return (
    <div className={`status-pill ${resolvedStatus}`}>
      <span className="status-dot" aria-hidden="true" />
      <span>{label}</span>
      <strong>{text}</strong>
      {detail && detail !== "unknown" ? <small>{detail}</small> : null}
    </div>
  );
}

function statusText(status: ServiceStatus) {
  switch (status) {
    case "ready":
      return "Ready";
    case "needs-model":
      return "Needs model";
    case "not-configured":
      return "Not configured";
    case "offline":
      return "Offline";
  }
}
