export interface FormattedServerError {
  status: number;
  body: { error: string };
}

export function formatServerError(error: unknown): FormattedServerError {
  const message = error instanceof Error ? error.message : "Request failed.";

  if (message.startsWith("Unsupported audio format.") || message.includes("File too large")) {
    return { status: 400, body: { error: message } };
  }

  return { status: 500, body: { error: "Server error." } };
}
