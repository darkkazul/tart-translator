export const DEFAULT_FILLER_TERMS = ["um", "uh", "er", "ah", "hmm", "you know"] as const;

export const AUDIO_LIMIT_BYTES = 50 * 1024 * 1024;

export const ACCEPTED_AUDIO_EXTENSIONS = [".wav", ".mp3", ".flac"] as const;

export const ACCEPTED_AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac"
] as const;

export const ACCEPTED_AUDIO_FORMAT_LABEL = "WAV, MP3, or FLAC";

export const ACCEPTED_AUDIO_INPUT_ACCEPT = [
  ...ACCEPTED_AUDIO_EXTENSIONS,
  ...ACCEPTED_AUDIO_MIME_TYPES
].join(",");
